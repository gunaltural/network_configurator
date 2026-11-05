"""Versioned, read-only engineering knowledge backed by SQLite.

The durable source of truth is knowledge/stp_v1.json committed in Git.
SQLite is a materialized *queryable* runtime database, safely re-seeded on
cold-start or a new deployment (Render free instance disks are ephemeral).
No external provider or user-input write access is granted.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading

_LOCK = threading.RLock()
_BASE = Path(__file__).resolve().parent
_SOURCE = _BASE / "knowledge" / "stp_v1.json"
_DB = Path(os.environ.get("ENGINEERING_KNOWLEDGE_SQLITE", str(Path(tempfile.gettempdir()) / "network_configurator_engineering_knowledge.sqlite3")))

def _source_document():
    data = json.loads(_SOURCE.read_text(encoding="utf-8"))
    if data.get("schema") != "network-configurator-engineering-knowledge-v1" or data.get("module") != "STP":
        raise ValueError("Engineering knowledge seed schema mismatch")
    ids = [r["id"] for r in data["records"]]
    source_ids = {s["id"] for s in data["sources"]}
    if len(ids) != len(set(ids)) or not ids or any(any(ref not in source_ids for ref in r["sources"]) for r in data["records"]):
        raise ValueError("Engineering knowledge has duplicate IDs or invalid source links")
    return data

def _signature():
    return hashlib.sha256(_SOURCE.read_bytes()).hexdigest()

def _connect():
    _DB.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(_DB), timeout=5)
    connection.row_factory = sqlite3.Row
    return connection

def _seed():
    data = _source_document()
    digest = _signature()
    with _connect() as con:
        con.execute("CREATE TABLE IF NOT EXISTS knowledge_meta (id INTEGER PRIMARY KEY CHECK(id=1), signature TEXT NOT NULL, version TEXT NOT NULL)")
        con.execute("CREATE TABLE IF NOT EXISTS engineering_parameters (id TEXT PRIMARY KEY, module TEXT NOT NULL, payload TEXT NOT NULL)")
        con.execute("CREATE TABLE IF NOT EXISTS engineering_sources (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
        present = con.execute("SELECT signature FROM knowledge_meta WHERE id=1").fetchone()
        if present and present["signature"] == digest:
            return
        with con:
            con.execute("DELETE FROM engineering_parameters")
            con.execute("DELETE FROM engineering_sources")
            con.executemany("INSERT INTO engineering_sources(id,payload) VALUES (?,?)",[(x["id"],json.dumps(x,ensure_ascii=False)) for x in data["sources"]])
            con.executemany("INSERT INTO engineering_parameters(id,module,payload) VALUES (?,?,?)",[(x["id"],data["module"],json.dumps(x,ensure_ascii=False)) for x in data["records"]])
            con.execute("INSERT OR REPLACE INTO knowledge_meta(id,signature,version) VALUES (1,?,?)",(digest,data["version"]))

def get_stp_knowledge():
    with _LOCK:
        _seed()
        with _connect() as con:
            meta = con.execute("SELECT signature,version FROM knowledge_meta WHERE id=1").fetchone()
            records = [json.loads(row["payload"]) for row in con.execute("SELECT payload FROM engineering_parameters WHERE module='STP' ORDER BY id")]
            sources = [json.loads(row["payload"]) for row in con.execute("SELECT payload FROM engineering_sources ORDER BY id")]
    return {
        "module":"STP","version":meta["version"],"signature":meta["signature"],
        "storage":"sqlite-materialized-from-version-controlled-design-knowledge",
        "records":records,"sources":sources
    }
