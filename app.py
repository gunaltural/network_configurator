#!/usr/bin/env python3
"""
Network Configurator v5.10.1 — Hosted multi-vendor Live CLI and reporting

Designed for Render / hosted web use:
- Browser-only client experience
- Same-origin FastAPI backend
- Server-side SSH via Netmiko
- No local Python, local agent, browser extension, or desktop app
- User-selected public SSH targets, with explicit exceptions for private networks
"""

import hashlib
import ipaddress
import os
import re
import socket
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field
import uvicorn
from report_docx import build_report_docx

VERSION = "5.10.1"
BASE_DIR = Path(__file__).resolve().parent
HTML = (BASE_DIR / "web.html").read_text(encoding="utf-8")
REPORTING_HTML = (BASE_DIR / "reporting.html").read_text(encoding="utf-8")

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
LIVE_PLATFORM_MAP = {**PLATFORM_MAP, "FortiGate": "fortinet"}
LIVE_PLATFORM_ALIASES = {"Cisco_StackWise": "Cisco IOS-XE", "Huawei": "Huawei_CE_SW"}

INVENTORY_COMMANDS = {
    "Cisco NX-OS": ("show inventory", "show version"),
    "Cisco IOS-XE": ("show inventory", "show version"),
    "Arista EOS": ("show version", "show inventory"),
    "Huawei_CE_SW": ("display version", "display device", "display esn", "display device esn"),
    "FortiGate": ("get system status",),
}

RUNNING_COMMAND = {
    "cisco_nxos": "show running-config",
    "cisco_xe": "show running-config",
    "arista_eos": "show running-config",
    "huawei_vrpv8": "display current-configuration",
}

READONLY_PREFIXES = ("show ", "display ", "get ", "diagnose ")
LIVE_COMMANDS = {
    "Cisco IOS-XE": {
        "System": ["show version", "show clock", "show inventory", "show environment", "show logging", "show processes cpu sorted", "show memory statistics", "show users", "show ntp status", "show ntp associations"],
        "Interfaces & L2": ["show ip interface brief", "show ipv6 interface brief", "show interfaces status", "show interfaces description", "show interfaces counters errors", "show interfaces trunk", "show etherchannel summary", "show vlan brief", "show mac address-table", "show spanning-tree summary", "show spanning-tree root", "show arp", "show cdp neighbors", "show cdp neighbors detail", "show lldp neighbors", "show lldp neighbors detail"],
        "Routing": ["show ip route", "show ipv6 route", "show ip protocols", "show ip vrf", "show ip ospf neighbor", "show ip ospf interface brief", "show bgp summary", "show ip bgp summary", "show bgp ipv4 unicast", "show bgp neighbors", "show standby brief"],
        "Configuration": ["show running-config | include hostname", "show running-config | section router bgp"],
    },
    "Cisco NX-OS": {
        "System": ["show version", "show clock", "show inventory", "show module", "show environment", "show system resources", "show logging last 100", "show feature"],
        "Interfaces & L2": ["show interface brief", "show interface status", "show interface description", "show interface counters errors", "show interface trunk", "show port-channel summary", "show lacp neighbor", "show vlan brief", "show mac address-table", "show ip arp", "show spanning-tree root", "show lldp neighbors", "show cdp neighbors"],
        "Routing": ["show ip interface brief", "show ip route", "show ipv6 route", "show vrf", "show ip ospf neighbors", "show bgp ipv4 unicast summary", "show bgp l2vpn evpn summary", "show bgp l2vpn evpn"],
        "EVPN / vPC": ["show nve peers", "show nve vni", "show nve interface nve1", "show vpc brief", "show vpc consistency-parameters global", "show vpc peer-keepalive"],
        "Configuration": ["show running-config | include hostname"],
    },
    "Arista EOS": {
        "System": ["show version", "show clock", "show inventory", "show logging last 100", "show ntp status"],
        "Interfaces & L2": ["show interfaces status", "show interfaces description", "show interfaces counters errors", "show interfaces transceiver", "show interfaces trunk", "show port-channel summary", "show lacp peer", "show vlan", "show mac address-table", "show arp", "show lldp neighbors", "show spanning-tree root"],
        "Routing": ["show ip interface brief", "show ip route", "show ipv6 route", "show vrf", "show ip ospf neighbor", "show ip bgp summary", "show bgp evpn summary", "show bgp evpn"],
        "EVPN / MLAG": ["show interfaces Vxlan1", "show vxlan vni", "show vxlan address-table", "show vxlan flood vtep", "show vxlan config-sanity detail", "show bgp evpn route-type imet", "show mlag", "show mlag detail", "show mlag interfaces", "show mlag interfaces detail", "show mlag config-sanity"],
        "Configuration": ["show running-config | include hostname"],
    },
    "Huawei_CE_SW": {
        "System": ["display version", "display device", "display clock", "display logbuffer", "display alarm active", "display cpu-usage", "display memory-usage", "display ntp-service status"],
        "Interfaces & L2": ["display interface brief", "display interface description", "display ip interface brief", "display ipv6 interface brief", "display vlan", "display port vlan", "display mac-address", "display arp all", "display eth-trunk", "display stp brief", "display lldp neighbor brief"],
        "Routing": ["display ip routing-table", "display ipv6 routing-table", "display ip vpn-instance", "display ospf peer brief", "display bgp peer", "display bgp routing-table", "display bgp evpn peer", "display bgp evpn all routing-table"],
        "EVPN / VXLAN": ["display vxlan tunnel", "display vxlan vni", "display vxlan peer", "display evpn vpn-instance", "display bgp evpn all routing-table mac-route", "display bgp evpn all routing-table prefix-route"],
        "M-LAG / DFS": ["display dfs-group", "display dfs-group 1 peer-link", "display dfs-group 1 node 1 m-lag brief", "display dfs-group 1 node 2 m-lag brief"],
        "Configuration": ["display current-configuration | include sysname"],
    },
    "FortiGate": {
        "System": ["get system status", "get system performance status", "get system interface", "get system ha status", "get system session status", "get system arp", "get system dns", "get system ntp"],
        "Routing": ["get router info routing-table all", "get router info routing-table details", "get router info routing-table bgp", "get router info routing-table connected", "get router info routing-table static", "get router info bgp summary", "get router info bgp neighbors", "get router info bgp network", "get router info6 bgp summary", "get router info ospf neighbor all"],
        "SD-WAN / VPN": ["diagnose vpn tunnel list", "diagnose sys sdwan health-check", "diagnose sys sdwan service", "diagnose sys sdwan member", "get vpn ipsec tunnel summary"],
        "Configuration view": ["show system interface", "show router bgp", "show router static", "show system sdwan", "show vpn ipsec phase1-interface"],
    },
}

LIVE_READONLY_VERBS = {
    "Cisco IOS-XE": ("show",), "Cisco NX-OS": ("show",),
    "Arista EOS": ("show",), "Huawei_CE_SW": ("display",),
    "FortiGate": ("show", "get"),
}
# Only display filters are allowed after a pipe; e.g. "| redirect" writes a file.
LIVE_PIPE_FILTERS = {"include", "exclude", "begin", "section", "count", "grep", "no-more", "json", "xml"}
LIVE_OUTPUT_LIMIT = 1_000_000
LIVE_INPUT_LIMIT = 131_072
LIVE_CLI_ERROR_RE = re.compile(
    r"(?im)^(?:%\s*(?:Invalid|Incomplete|Ambiguous)|Invalid input|Error:|"
    r"Unrecognized command|Unknown command|Wrong parameter|Too many parameters|"
    r"command parse error)"
)
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


class ReportDevice(BaseModel):
    id: str = Field(max_length=32)
    tier: Literal["upper", "lower"]
    index: int = Field(ge=1, le=16)
    hostname: str = Field(max_length=100)
    model: str = Field(max_length=100)
    serial: str = Field(max_length=100)
    modelSource: str = Field(max_length=30)
    serialSource: str = Field(max_length=30)


class ReportLink(BaseModel):
    a: str = Field(max_length=32)
    b: str = Field(max_length=32)
    enabled: bool
    upperPort: str = Field(max_length=100)
    lowerPort: str = Field(max_length=100)
    speed: str = Field(max_length=100)
    detail: str = Field(default="", max_length=200)


class ReportSpecialLink(BaseModel):
    kind: str = Field(max_length=100)
    a: str = Field(max_length=32)
    b: str = Field(max_length=32)
    aPort: str = Field(max_length=200)
    bPort: str = Field(max_length=200)
    detail: str = Field(max_length=500)
    logical: bool = False


class ReportParameter(BaseModel):
    label: str = Field(max_length=100)
    value: str = Field(max_length=500)


class ReportConfiguration(BaseModel):
    deviceId: str = Field(max_length=32)
    text: str = Field(max_length=100000)
    source: str = Field(max_length=100)


class ReportWordRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    vendor: Literal["Cisco NX-OS", "Cisco IOS-XE", "Arista EOS", "Huawei_CE_SW"]
    architecture: Literal["spine-leaf", "core-access"]
    technology: str = Field(max_length=32)
    techPlacement: Literal["upper", "lower"]
    upperCount: int = Field(ge=1, le=8)
    lowerCount: int = Field(ge=1, le=16)
    scope: str = Field(max_length=2000)
    devices: List[ReportDevice]
    links: List[ReportLink]
    specialLinks: List[ReportSpecialLink] = Field(default_factory=list)
    parameters: List[ReportParameter] = Field(default_factory=list)
    configurations: List[ReportConfiguration] = Field(default_factory=list)


def parse_inventory(platform: str, outputs: dict) -> dict:
    """Extract chassis identity, never a module or FEX serial in its place."""
    model = serial = version = ""
    joined = "\n".join(outputs.values())
    if platform in {"Cisco NX-OS", "Cisco IOS-XE"}:
        inventory = outputs.get("show inventory", "")
        blocks = re.split(r"(?=\bNAME\s*:\s*['\"])", inventory, flags=re.I)
        chassis = next((b for b in blocks if re.search(r"\bNAME\s*:\s*['\"](?:Chassis|Switch|Router)\b[^'\"]*['\"]", b, re.I)), "")
        # A modular inventory can list module serials before the chassis. Do not guess.
        match = re.search(r"\bPID\s*:\s*([^,\r\n]+)\s*,\s*VID\s*:\s*[^,\r\n]*,\s*SN\s*:\s*([^,\r\n]+)", chassis, re.I)
        if match:
            model, serial = match.group(1).strip(), match.group(2).strip()
        if not model:
            m = re.search(r"(?im)^(?:Model Number|Model|Platform)\s*:\s*(\S+)", outputs.get("show version", ""))
            if m: model = m.group(1)
        m = re.search(r"(?im)^(?:Cisco (?:IOS XE|NX-OS) Software|system: version|NXOS: version).*?([0-9]+\.[0-9]+[^\s,]*)", outputs.get("show version", ""))
        if m: version = m.group(1)
    elif platform == "Arista EOS":
        output = outputs.get("show version", "")
        m = re.search(r"(?im)^\s*Arista\s+(\S+)", output)
        if m: model = m.group(1)
        m = re.search(r"(?im)^\s*Serial number\s*:\s*(\S+)", output)
        if m: serial = m.group(1)
        m = re.search(r"(?im)^\s*Software image version\s*:\s*(\S+)", output)
        if m: version = m.group(1)
    elif platform == "Huawei_CE_SW":
        for command in ("display esn", "display device esn"):
            m = re.search(r"(?im)^\s*(?:ESN(?: of chassis\s+\d+)?|Equipment Serial Number)\s*:\s*(\S+)", outputs.get(command, ""))
            if m:
                serial = m.group(1)
                break
        m = re.search(r"(?im)^\s*(?:Device Type|Product Model|Device model)\s*:\s*(\S+)", outputs.get("display device", ""))
        if m: model = m.group(1)
        if not model:
            m = re.search(r"(?im)^\s*(?:Huawei|HUAWEI)\s+(\S+)\s+(?:Routing Switch|Switch|uptime)", outputs.get("display version", ""))
            if m: model = m.group(1)
        m = re.search(r"\bV\d{3}R\d{3}[^\s,]*", outputs.get("display version", ""))
        if m: version = m.group(0)
    elif platform == "FortiGate":
        m = re.search(r"(?im)^\s*Version\s*:\s*Forti(?:Gate|WiFi)[-_ ]?(\S+)", joined)
        if m: model = "FortiGate " + m.group(1).split(" v")[0]
        m = re.search(r"(?im)^\s*Serial(?:-Number| number)\s*:\s*(\S+)", joined)
        if m: serial = m.group(1)
        m = re.search(r"(?im)^\s*Version\s*:\s*[^\r\n]*?\b(v\d+\.\d+[^\s,]*)", joined)
        if m: version = m.group(1)
    if serial.upper() in {"N/A", "NA", "UNKNOWN", "NONE", "-"}:
        serial = ""
    return {"model": model, "serial": serial, "software_version": version}


def sha256(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def valid_host(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_.:-]{1,255}", str(value or "")))


def resolve_ssh_target(value: str) -> str:
    """Resolve once and return a pinned address for the SSH connection."""
    host = str(value or "").strip().lower()
    if not valid_host(host):
        raise ValueError("Enter a valid device IP address or hostname.")
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        try:
            addresses = [info[4][0] for info in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)]
        except OSError as exc:
            raise ValueError(f"Cannot resolve device hostname: {exc}") from exc
    if not addresses:
        raise ValueError("Device hostname resolved to no addresses.")
    if ALLOW_ANY_TARGET or host in ALLOWED_TARGETS:
        return addresses[0]
    for address in addresses:
        if ipaddress.ip_address(address).is_global:
            return address
    raise ValueError("Private or reserved device addresses require an explicit server exception.")


def target_allowed(value: str) -> bool:
    try:
        resolve_ssh_target(value)
        return True
    except ValueError:
        return False


def device_type(platform: str, live: bool = False) -> str:
    dt = (LIVE_PLATFORM_MAP if live else PLATFORM_MAP).get(platform)
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


def checks(payload: DeviceRequest, include_config: bool = True, live: bool = False):
    out = []

    def add(name, status, detail):
        out.append({"name": name, "status": status, "detail": detail})

    host_ok = valid_host(payload.target)
    add("Target syntax", "PASS" if host_ok else "FAIL", payload.target or "missing")
    try:
        resolved = resolve_ssh_target(payload.target)
        add("SSH target", "PASS", f"{payload.target} → {resolved}")
    except ValueError as exc:
        add("SSH target", "FAIL", str(exc))
    add("SSH port", "PASS" if 1 <= payload.port <= 65535 else "FAIL", str(payload.port))

    try:
        add("Platform", "PASS", device_type(payload.platform, live=live))
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


def live_command_allowed(platform: str, command: str) -> bool:
    canonical = LIVE_PLATFORM_ALIASES.get(platform, platform)
    groups = LIVE_COMMANDS.get(canonical)
    if not groups or not isinstance(command, str) or not command or command != command.strip():
        return False
    if any(ord(ch) < 32 or ord(ch) > 126 or ch in ";&<>`$\\!#" for ch in command):
        return False
    parts = command.split("|")
    base = parts[0].strip()
    if not (any(base.lower().startswith(verb + " ") for verb in LIVE_READONLY_VERBS[canonical])
            or any(command in commands for commands in groups.values())):
        return False
    for part in parts[1:]:
        filter_parts = part.strip().split(None, 1)
        if not filter_parts or filter_parts[0].lower() not in LIVE_PIPE_FILTERS:
            return False
    return True


def live_command_list(platform: str, text: str) -> List[str]:
    if not isinstance(text, str) or not text.strip() or len(text) > LIVE_INPUT_LIMIT:
        raise ValueError("Enter read-only commands (maximum 128 KiB of text).")
    commands = []
    for number, raw in enumerate(text.splitlines(), 1):
        command = raw.strip()
        if not command:
            continue
        if not live_command_allowed(platform, command):
            raise ValueError(f"Line {number} is not a read-only command for {platform}: {command[:100]}")
        commands.append(command)
    if not commands:
        raise ValueError("Enter at least one read-only command.")
    return commands


def connect(payload: DeviceRequest, live: bool = False):
    address = resolve_ssh_target(payload.target)

    try:
        from netmiko import ConnectHandler
    except Exception as exc:
        raise RuntimeError("Netmiko is unavailable on the web server.") from exc

    dt = device_type(payload.platform, live=live)
    params = {
        "device_type": dt,
        "host": address,
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


@app.get("/reporting", response_class=HTMLResponse)
def reporting():
    return HTMLResponse(REPORTING_HTML, headers={"Cache-Control": "no-store"})


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
        "public_targets_allowed": True,
        "target_policy": "Publicly routable addresses or explicitly allowed private targets",
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
def network_diagnostics(target: str = "", port: int = 22):
    """
    Outbound TCP connectivity test for a user-selected device.
    No credentials, no SSH login, no device writes.
    Used to distinguish hosting-network egress issues from SSH/authentication issues.
    """
    if not target:
        return {"ok": True, "version": VERSION,
                "purpose": "Raw TCP/DNS diagnostics only; no SSH authentication or device changes",
                "usage": "/api/diagnostics/network?target=DEVICE_HOST&port=22"}
    if not 1 <= port <= 65535:
        raise HTTPException(status_code=400, detail="SSH port must be between 1 and 65535.")
    try:
        address = resolve_ssh_target(target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": True,
        "version": VERSION,
        "purpose": "raw TCP/DNS diagnostics only; no SSH authentication and no device changes",
        "target": target,
        "results": [tcp_probe(address, port)],
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


@app.get("/api/device/commands")
def live_commands():
    return {"ok": True, "platforms": LIVE_COMMANDS}


@app.post("/api/reporting/inventory")
def reporting_inventory(p: DeviceRequest):
    platform = LIVE_PLATFORM_ALIASES.get(p.platform, p.platform)
    if platform not in INVENTORY_COMMANDS:
        raise HTTPException(status_code=400, detail="Unsupported inventory platform.")
    items = checks(p, include_config=False, live=True)
    if not ok(items):
        raise HTTPException(status_code=400, detail={"error": "Device address, platform and SSH credentials are required.", "checks": items})
    if MOCK_SSH:
        raise HTTPException(status_code=503, detail="Inventory cannot be verified in MOCK mode.")
    conn = None
    try:
        conn, _ = connect(p, live=True)
        outputs, warnings = {}, []
        for command in INVENTORY_COMMANDS[platform]:
            try:
                result = conn.send_command(command, read_timeout=40)
                if LIVE_CLI_ERROR_RE.search(result):
                    warnings.append(f"{command}: command unavailable on this device")
                else:
                    outputs[command] = result[:100_000]
            except Exception:
                warnings.append(f"{command}: could not read output")
        identity = parse_inventory(platform, outputs)
        if not identity["model"] and not identity["serial"]:
            raise HTTPException(status_code=502, detail="SSH connected, but the device did not return a recognizable chassis model or serial. Enter them manually.")
        return {"ok": True, "platform": platform, **identity,
                "observed_at": datetime.now(timezone.utc).isoformat(),
                "commands": list(outputs), "warnings": warnings}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Inventory read failed: {exc}") from exc
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass


@app.post("/api/reporting/word")
def reporting_word(p: ReportWordRequest):
    expected = {f"upper-{i}" for i in range(1, p.upperCount + 1)} | {
        f"lower-{i}" for i in range(1, p.lowerCount + 1)
    }
    actual = {d.id for d in p.devices}
    if (not p.name.strip() or len(p.devices) != len(expected) or actual != expected
            or any(d.id != f"{d.tier}-{d.index}" for d in p.devices)
            or len(p.links) > 128 or len(p.specialLinks) > 32
            or len(p.parameters) > 250 or len(p.configurations) > len(p.devices)
            or any(l.a not in actual or l.b not in actual
                   or not l.a.startswith("upper-") or not l.b.startswith("lower-") for l in p.links)
            or any(l.a not in actual or l.b not in actual for l in p.specialLinks)
            or len({c.deviceId for c in p.configurations}) != len(p.configurations)
            or any(c.deviceId not in actual for c in p.configurations)):
        raise HTTPException(status_code=400, detail="Invalid project topology or project name.")
    data = p.model_dump() if hasattr(p, "model_dump") else p.dict()
    return StreamingResponse(
        build_report_docx(data),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="network-report.docx"',
                 "Cache-Control": "no-store"},
    )


@app.post("/api/device/show")
def live_show(p: LiveCommandRequest):
    try:
        commands = live_command_list(p.platform, p.command)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"ok": False, "error": str(exc)}) from exc
    items = checks(p, include_config=False, live=True)
    if not ok(items):
        raise HTTPException(status_code=400, detail={"ok": False, "checks": items, "error": "Connection parameters are incomplete or target is blocked."})

    if MOCK_SSH:
        return {"ok": True, "device": p.target, "command": p.command,
                "command_count": len(commands), "results": [],
                "output": "\n\n".join(f"> {command}\nMOCK SSH OUTPUT — no device command sent."
                                      for command in commands),
                "truncated": False, "mock": True}

    conn = None
    try:
        conn, _ = connect(p, live=True)
        results, sections, remaining, truncated = [], [], LIVE_OUTPUT_LIMIT, False
        for command in commands:
            try:
                output = conn.send_command(command, read_timeout=60)
                command_ok = not bool(LIVE_CLI_ERROR_RE.search(output))
            except Exception as exc:
                output, command_ok = str(exc), False
            results.append({"command": command, "ok": command_ok})
            section = f"> {command}\n{output}"
            if remaining:
                chunk = ("\n\n" if sections else "") + section
                if len(chunk) > remaining:
                    truncated = True
                sections.append(chunk[:remaining])
                remaining -= min(len(chunk), remaining)
            else:
                truncated = True
        return {"ok": all(item["ok"] for item in results), "device": p.target, "command": p.command,
                "command_count": len(commands), "results": results,
                "output": "".join(sections), "truncated": truncated, "mock": False}
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
