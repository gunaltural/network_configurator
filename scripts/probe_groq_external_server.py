"""Isolated, no-persistence diagnostic endpoint for a separate FREE Render service.

The Groq key arrives once over TLS in a request header, is used only for the
existing synthetic Groq probe, and is never written to disk, env or logs.
Never deploy this file on production.
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
from contextlib import redirect_stdout
from io import StringIO
import json
import os
from scripts.probe_groq_access import run_probe

_PATH = os.environ.get('PROBE_PATH', '/disabled')
class ProbeHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # No request/header logging

    def send_json(self, status, value):
        data = json.dumps(value, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.send_json(200 if self.path == '/healthz' else 404,
                       {'ok': self.path == '/healthz'})

    def do_POST(self):
        if self.path != _PATH or self.server.used:
            self.send_json(404, {'error': 'not_found'})
            return
        key = self.headers.get('X-Groq-Probe-Key', '')
        # Only single-shot requests; no CLI/capture/prompt body is accepted.
        if not (8 <= len(key) <= 256 and key.isascii()) or int(self.headers.get('Content-Length', '0') or '0'):
            self.send_json(400, {'error': 'invalid_request'})
            return
        self.server.used = True
        buffer = StringIO()
        try:
            with redirect_stdout(buffer):
                passed = run_probe(key)
            # The shared probe writes only allowlisted status/category fields.
            safe_lines = [x for x in buffer.getvalue().splitlines()
                          if x.startswith('GROQ_COMPARISON endpoint=') or
                             x.startswith('GROQ_COMPARISON decision=')]
            self.send_json(200, {'probe':'isolated-free-render',
                                 'passed':passed, 'results':safe_lines})
        except Exception:
            self.send_json(502, {'probe':'isolated-free-render',
                                 'passed':False, 'error':'probe_failed'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', '10000'))
    server = HTTPServer(('0.0.0.0', port), ProbeHandler)
    server.used = False
    server.serve_forever()
