#!/usr/bin/env python3
"""
Network Configurator v5.9.7 — Hosted read-only Live CLI

Designed for Render / hosted web use:
- Browser-only client experience
- Same-origin FastAPI backend
- Server-side SSH via Netmiko
- No local Python, local agent, browser extension, or desktop app
- Server-side SSH target allowlist for the public demo
"""

import hashlib
import os
import re
import socket
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import uvicorn

VERSION = "5.9.7"
BASE_DIR = Path(__file__).resolve().parent
HTML = (BASE_DIR / "web.html").read_text(encoding="utf-8")

REAL_DEPLOY = os.getenv("ENABLE_REAL_DEPLOY", "0").strip().lower() in {"1", "true", "yes", "on"}
MOCK_SSH = os.getenv("MOCK_SSH", "0").strip().lower() in {"1", "true", "yes", "on"}
ALLOW_ANY_TARGET = os.getenv("ALLOW_ANY_TARGET", "0").strip().lower() in {"1", "true", "yes", "on"}

DEFAULT_ALLOWED = "devnetsandboxiosxec9k.cisco.com"
ALLOWED_TARGETS = {
    x.strip().lower()
    for x in os.getenv("ALLOWED_TARGETS", DEFAULT_ALLOWED).split(",")
    if x.strip()
}

PLATFORM_MAP = {
    "Cisco NX-OS": "cisco_nxos",
    "Cisco IOS-XE": "cisco_xe",
    "Cisco_StackWise": "cisco_xe",
    "Arista EOS": "arista_eos",
    "Huawei_CE_SW": "huawei_vrpv8",
    "Huawei": "huawei_vrpv8",
}

RUNNING_COMMAND = {
    "cisco_nxos": "show running-config",
    "cisco_xe": "show running-config",
    "arista_eos": "show running-config",
    "huawei_vrpv8": "display current-configuration",
}

READONLY_PREFIXES = ("show ", "display ", "get ", "diagnose ")
LIVE_SHOW_COMMANDS = (
    "show version",
    "show ip interface brief",
    "show interfaces status",
    "show ip route",
    "show bgp summary",
    "show running-config | include hostname",
    "show inventory",
    "show lldp neighbors",
    "show cdp neighbors",
)
LIVE_OUTPUT_LIMIT = 1_000_000
ERROR_RE = re.compile(
    r"(% ?Invalid|% ?Incomplete|% ?Ambiguous|Invalid input|Error:|ERROR:|"
    r"Unrecognized command|Unknown command|Wrong parameter|Too many parameters)",
    re.I,
)
DESTRUCTIVE_RE = re.compile(
    r"^(reload|write\s+erase|erase\s+startup-config|format\b|"
    r"delete\s+(bootflash:|flash:)|install\s+all\b|"
    r"request\s+platform\s+software)",
    re.I,
)


class DeviceRequest(BaseModel):
    target: str = ""
    port: int = 22
    platform: str = ""
    username: str = ""
    password: str = ""
    secret: str = ""
    persist: bool = False
    block_label: str = "Configuration"
    config: str = ""
    verification_commands: str = ""


class LiveCommandRequest(DeviceRequest):
    command: str = ""


def sha256(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def valid_host(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_.:-]{1,255}", str(value or "")))


def target_allowed(value: str) -> bool:
    host = str(value or "").strip().lower()
    return bool(host) and (ALLOW_ANY_TARGET or host in ALLOWED_TARGETS)


def device_type(platform: str) -> str:
    dt = PLATFORM_MAP.get(platform)
    if not dt:
        raise ValueError(f"Unsupported platform: {platform}")
    return dt


def clean_commands(text: str) -> List[str]:
    out = []
    for raw in str(text or "").splitlines():
        s = raw.strip()
        if not s or s.startswith(("#", "!")):
            continue
        out.append(s)
    return out


def verification_list(text: str) -> List[str]:
    out = []
    for line in str(text or "").splitlines():
        s = line.strip()
        if s and s.lower().startswith(READONLY_PREFIXES):
            out.append(s)
    return out[:25]


def checks(payload: DeviceRequest, include_config: bool = True):
    out = []

    def add(name, status, detail):
        out.append({"name": name, "status": status, "detail": detail})

    host_ok = valid_host(payload.target)
    add("Target syntax", "PASS" if host_ok else "FAIL", payload.target or "missing")
    add(
        "Target allowlist",
        "PASS" if host_ok and target_allowed(payload.target) else "FAIL",
        "allowed" if target_allowed(payload.target) else
        f"blocked by server allowlist ({', '.join(sorted(ALLOWED_TARGETS)) or 'empty'})",
    )
    add("SSH port", "PASS" if 1 <= payload.port <= 65535 else "FAIL", str(payload.port))

    try:
        add("Platform", "PASS", device_type(payload.platform))
    except Exception as exc:
        add("Platform", "FAIL", str(exc))

    add("Username", "PASS" if payload.username.strip() else "FAIL", payload.username or "missing")

    if not MOCK_SSH:
        add("Password", "PASS" if payload.password else "FAIL", "provided" if payload.password else "missing")

    if include_config:
        commands = clean_commands(payload.config)
        add("Configuration", "PASS" if commands else "FAIL", f"{len(commands)} command(s) · {payload.block_label}")

        unresolved = sorted(set(re.findall(r"CHANGE_ME_[A-Za-z0-9_]+", payload.config)))
        add("Placeholders", "FAIL" if unresolved else "PASS", ", ".join(unresolved) if unresolved else "none")

        dangerous = [x for x in commands if DESTRUCTIVE_RE.search(x)]
        add("Destructive commands", "FAIL" if dangerous else "PASS", dangerous[0] if dangerous else "none")

    return out


def ok(items) -> bool:
    return not any(x["status"] == "FAIL" for x in items)


def connect(payload: DeviceRequest):
    if not target_allowed(payload.target):
        raise RuntimeError("SSH target is blocked by the hosted demo allowlist.")

    try:
        from netmiko import ConnectHandler
    except Exception as exc:
        raise RuntimeError("Netmiko is unavailable on the web server.") from exc

    dt = device_type(payload.platform)
    params = {
        "device_type": dt,
        "host": payload.target,
        "port": payload.port,
        "username": payload.username,
        "password": payload.password,
        "timeout": 25,
        "conn_timeout": 15,
        "banner_timeout": 20,
        "auth_timeout": 20,
        "fast_cli": False,
    }
    if payload.secret:
        params["secret"] = payload.secret

    conn = ConnectHandler(**params)
    if payload.secret:
        try:
            conn.enable()
        except Exception:
            pass
    return conn, dt


def snapshot(conn, dt: str) -> str:
    return conn.send_command(RUNNING_COMMAND[dt], read_timeout=60)


def run_verify(conn, text: str):
    results = []
    for cmd in verification_list(text):
        try:
            output = conn.send_command(cmd, read_timeout=40)
            results.append({
                "command": cmd,
                "ok": not bool(ERROR_RE.search(output)),
                "output": output[-2500:],
            })
        except Exception as exc:
            results.append({"command": cmd, "ok": False, "output": str(exc)})
    return results


app = FastAPI(
    title="Network Configurator",
    version=VERSION,
    docs_url=None,
    redoc_url=None,
)


@app.get("/", response_class=HTMLResponse)
def root():
    return HTMLResponse(HTML, headers={"Cache-Control": "no-store"})


@app.get("/api/health")
def health():
    mode = "MOCK" if MOCK_SSH else ("DEPLOY ENABLED" if REAL_DEPLOY else "READ-ONLY")
    return {
        "ok": True,
        "version": VERSION,
        "mode": mode,
        "write_to_devices": REAL_DEPLOY and not MOCK_SSH,
        "same_origin": True,
        "hosted": True,
        "allowed_targets": sorted(ALLOWED_TARGETS),
        "allow_any_target": ALLOW_ANY_TARGET,
        "diagnostics": "/api/diagnostics/network",
    }




def tcp_probe(host: str, port: int, timeout: float = 6.0):
    result = {
        "host": host,
        "port": port,
        "resolved": [],
        "connected": False,
        "error": None,
    }
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        seen = []
        for info in infos:
            ip = info[4][0]
            if ip not in seen:
                seen.append(ip)
        result["resolved"] = seen[:8]
    except Exception as exc:
        result["error"] = f"DNS: {exc}"
        return result

    last_error = None
    for ip in result["resolved"] or [host]:
        family = socket.AF_INET6 if ":" in ip else socket.AF_INET
        sock = socket.socket(family, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            sock.connect((ip, port))
            result["connected"] = True
            result["connected_ip"] = ip
            try:
                sock.settimeout(1.2)
                banner = sock.recv(256)
                if banner:
                    result["banner"] = banner.decode("utf-8", "replace").strip()
            except Exception:
                pass
            return result
        except Exception as exc:
            last_error = str(exc)
        finally:
            try:
                sock.close()
            except Exception:
                pass

    result["error"] = last_error or "connection failed"
    return result


@app.get("/api/diagnostics/network")
def network_diagnostics():
    """
    Safe outbound connectivity test.
    No credentials, no SSH login, no device writes.
    Used to distinguish hosting-network egress issues from SSH/authentication issues.
    """
    probes = [
        ("devnetsandboxiosxec9k.cisco.com", 22),
        ("devnetsandboxiosxec9k.cisco.com", 443),
        ("github.com", 22),
        ("github.com", 443),
        ("ssh.github.com", 443),
    ]
    results = [tcp_probe(host, port) for host, port in probes]
    return {
        "ok": True,
        "version": VERSION,
        "purpose": "raw TCP/DNS diagnostics only; no SSH authentication and no device changes",
        "results": results,
    }


@app.post("/api/device/test")
def test_connection(p: DeviceRequest):
    local = checks(p, include_config=False)
    if not ok(local):
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "steps": local, "error": "Connection parameters are incomplete or target is blocked."},
        )

    if MOCK_SSH:
        return {
            "ok": True,
            "steps": [
                {"name": "Connected", "status": "PASS", "detail": f"MOCK SSH to {p.target}:{p.port}"},
                {"name": "Platform adapter", "status": "PASS", "detail": device_type(p.platform)},
                {"name": "Running-config read", "status": "PASS", "detail": "MOCK snapshot"},
            ],
            "message": "Connection test successful in MOCK mode.",
        }

    conn = None
    try:
        conn, dt = connect(p)
        prompt = conn.find_prompt()
        snap = snapshot(conn, dt)
        return {
            "ok": True,
            "steps": [
                {"name": "Connected", "status": "PASS", "detail": prompt},
                {"name": "Platform adapter", "status": "PASS", "detail": dt},
                {"name": "Running-config read", "status": "PASS", "detail": f"SHA-256 {sha256(snap)[:16]}…"},
            ],
            "message": "SSH connection successful.",
        }
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "ok": False,
                "steps": [{"name": "Connection", "status": "FAIL", "detail": str(exc)}],
                "error": str(exc),
            },
        )
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


@app.post("/api/device/precheck")
def precheck(p: DeviceRequest):
    items = checks(p, include_config=True)
    if not ok(items):
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "checks": items, "error": "Pre-Check failed. Fix the failed item(s)."},
        )

    if MOCK_SSH:
        items += [
            {"name": "SSH reachability", "status": "PASS", "detail": "MOCK mode"},
            {"name": "Running-config snapshot", "status": "PASS", "detail": "MOCK snapshot"},
            {"name": "Deployment state", "status": "WARN", "detail": "MOCK mode · zero device writes"},
        ]
        return {
            "ok": True,
            "deploy_allowed": True,
            "checks": items,
            "message": "Pre-Check PASS. MOCK mode will not change a device.",
        }

    conn = None
    try:
        conn, dt = connect(p)
        prompt = conn.find_prompt()
        snap = snapshot(conn, dt)

        items.append({"name": "SSH reachability", "status": "PASS", "detail": prompt})
        items.append({"name": "Running-config snapshot", "status": "PASS", "detail": f"SHA-256 {sha256(snap)[:16]}…"})

        if dt == "cisco_nxos":
            rollback, status = "NX-OS checkpoint available", "PASS"
        elif dt == "arista_eos":
            rollback, status = "Arista configuration session available", "PASS"
        else:
            rollback, status = "Direct configuration · automatic transactional rollback not enabled", "WARN"

        items.append({"name": "Rollback capability", "status": status, "detail": rollback})
        items.append({
            "name": "Deployment state",
            "status": "PASS" if REAL_DEPLOY else "WARN",
            "detail": "Writes enabled" if REAL_DEPLOY else "Hosted service is READ-ONLY",
        })

        return {
            "ok": True,
            "deploy_allowed": REAL_DEPLOY,
            "checks": items,
            "message": "Pre-Check PASS.",
        }
    except Exception as exc:
        items.append({"name": "SSH reachability", "status": "FAIL", "detail": str(exc)})
        raise HTTPException(
            status_code=502,
            detail={"ok": False, "checks": items, "error": "Pre-Check failed during SSH connection."},
        )
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


@app.post("/api/device/show")
def live_show(p: LiveCommandRequest):
    # Compare the complete string; no arbitrary CLI, pipes, separators or config commands.
    if p.command not in LIVE_SHOW_COMMANDS:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "Command is not in the Live CLI allowlist."})
    items = checks(p, include_config=False)
    if p.platform != "Cisco IOS-XE":
        items.append({"name": "Platform", "status": "FAIL", "detail": "Live CLI currently supports Cisco IOS-XE only."})
    if not ok(items):
        raise HTTPException(status_code=400, detail={"ok": False, "checks": items, "error": "Connection parameters are incomplete or target is blocked."})

    if MOCK_SSH:
        return {"ok": True, "device": p.target, "command": p.command,
                "output": f"MOCK SSH OUTPUT — {p.command} on {p.target}\nNo command was sent to a device.",
                "truncated": False, "mock": True}

    conn = None
    try:
        conn, _ = connect(p)
        output = conn.send_command(p.command, read_timeout=60)
        if ERROR_RE.search(output):
            raise RuntimeError("Device reported a CLI error: " + output[:500])
        return {"ok": True, "device": p.target, "command": p.command,
                "output": output[:LIVE_OUTPUT_LIMIT],
                "truncated": len(output) > LIVE_OUTPUT_LIMIT, "mock": False}
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"ok": False, "error": str(exc)})
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


@app.post("/api/device/deploy")
def deploy(p: DeviceRequest):
    items = checks(p, include_config=True)
    if not ok(items):
        raise HTTPException(
            status_code=400,
            detail={"ok": False, "steps": items, "error": "Deployment blocked by safety checks."},
        )

    if MOCK_SSH:
        commands = clean_commands(p.config)
        return {
            "ok": True,
            "steps": [
                {"name": "Connected", "status": "PASS", "detail": f"MOCK {p.target}"},
                {"name": "Pre-change snapshot", "status": "PASS", "detail": "MOCK snapshot"},
                {"name": "Configuration", "status": "PASS", "detail": f"{len(commands)} command(s) simulated"},
                {"name": "Verification", "status": "PASS", "detail": "MOCK post-check passed"},
            ],
            "message": "DEPLOYMENT SUCCESSFUL · MOCK mode · no device changed.",
        }

    if not REAL_DEPLOY:
        raise HTTPException(
            status_code=403,
            detail={
                "ok": False,
                "error": "This hosted Network Configurator is READ-ONLY. Write mode is disabled in the server environment.",
                "steps": [{"name": "Deployment", "status": "FAIL", "detail": "Server write mode disabled"}],
            },
        )

    conn = None
    steps = []
    rollback_ref = ""

    try:
        conn, dt = connect(p)
        prompt = conn.find_prompt()
        steps.append({"name": "Connected", "status": "PASS", "detail": prompt})

        before = snapshot(conn, dt)
        before_hash = sha256(before)
        commands = clean_commands(p.config)

        if dt == "cisco_nxos":
            rollback_ref = "NC_DIRECT_DEPLOY"
            cp = conn.send_command_timing(f"checkpoint {rollback_ref}", read_timeout=30)
            if ERROR_RE.search(cp):
                raise RuntimeError(f"Checkpoint failed: {cp[-500:]}")
            steps.append({"name": "Backup / checkpoint", "status": "PASS", "detail": rollback_ref})

            cfgout = conn.send_config_set(commands, cmd_verify=False, read_timeout=120)
            if ERROR_RE.search(cfgout):
                rb = conn.send_command_timing(
                    f"rollback running-config checkpoint {rollback_ref} atomic",
                    read_timeout=120,
                )
                steps.append({
                    "name": "Rollback",
                    "status": "PASS" if not ERROR_RE.search(rb) else "WARN",
                    "detail": "NX-OS checkpoint rollback attempted",
                })
                raise RuntimeError("CLI error detected. Rollback attempted.")

        elif dt == "arista_eos":
            session = "NC_DIRECT_DEPLOY"
            enter = conn.send_command_timing(f"configure session {session}", read_timeout=30)
            if ERROR_RE.search(enter):
                raise RuntimeError(f"Could not start configuration session: {enter[-500:]}")
            steps.append({"name": "Backup / checkpoint", "status": "PASS", "detail": f"Configuration session {session}"})

            failed = None
            for cmd in commands:
                output = conn.send_command_timing(
                    cmd,
                    read_timeout=30,
                    strip_prompt=False,
                    strip_command=False,
                )
                if ERROR_RE.search(output):
                    failed = (cmd, output)
                    break

            if failed:
                conn.send_command_timing("abort", read_timeout=30)
                steps.append({"name": "Rollback", "status": "PASS", "detail": "Arista session aborted"})
                raise RuntimeError(f"CLI error on: {failed[0]}")

            commit = conn.send_command_timing("commit", read_timeout=90)
            if ERROR_RE.search(commit):
                raise RuntimeError("Arista configuration session commit failed.")

        else:
            steps.append({
                "name": "Backup / checkpoint",
                "status": "WARN",
                "detail": "Pre-change running-config captured; no automatic transactional rollback in this MVP",
            })
            cfgout = conn.send_config_set(commands, cmd_verify=False, read_timeout=120)
            if ERROR_RE.search(cfgout):
                raise RuntimeError("CLI error detected. Manual review may be required.")

        steps.append({"name": "Configuration", "status": "PASS", "detail": f"{len(commands)} command(s) applied"})

        verified = run_verify(conn, p.verification_commands)
        if verified:
            bad = [x for x in verified if not x["ok"]]
            if bad:
                if dt == "cisco_nxos" and rollback_ref:
                    try:
                        conn.send_command_timing(
                            f"rollback running-config checkpoint {rollback_ref} atomic",
                            read_timeout=120,
                        )
                        steps.append({
                            "name": "Rollback",
                            "status": "PASS",
                            "detail": "Post-check failed; NX-OS rollback executed",
                        })
                    except Exception as rb_exc:
                        steps.append({"name": "Rollback", "status": "WARN", "detail": str(rb_exc)})
                raise RuntimeError(f"Post-check failed: {bad[0]['command']}")
            steps.append({
                "name": "Verification",
                "status": "PASS",
                "detail": f"{len(verified)} verification command(s) passed",
            })
        else:
            steps.append({
                "name": "Verification",
                "status": "WARN",
                "detail": "No read-only verification commands were generated",
            })

        if p.persist:
            conn.save_config()
            steps.append({"name": "Save config", "status": "PASS", "detail": "Startup configuration updated"})

        after = snapshot(conn, dt)
        steps.append({
            "name": "Post-change snapshot",
            "status": "PASS",
            "detail": f"{before_hash[:12]}… → {sha256(after)[:12]}…",
        })

        return {"ok": True, "steps": steps, "message": "DEPLOYMENT SUCCESSFUL"}

    except HTTPException:
        raise
    except Exception as exc:
        steps.append({"name": "Deployment", "status": "FAIL", "detail": str(exc)})
        raise HTTPException(
            status_code=500,
            detail={"ok": False, "steps": steps, "error": str(exc), "message": "DEPLOYMENT FAILED"},
        )
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


if __name__ == "__main__":
    port = int(os.getenv("PORT", "10000"))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level=os.getenv("LOG_LEVEL", "warning"),
        access_log=False,
    )
