#!/usr/bin/env python3
"""Local dev server: serves the project and lets web/crop.html save data/cards.json.

Usage: python3 serve.py [port]   (default 8080)
Only PUT /data/cards.json is writable, and only from localhost.
"""
import http.server
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
TARGET = "/data/cards.json"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _reply(self, code, message=""):
        body = message.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_PUT(self):
        origin = self.headers.get("Origin")
        allowed = {f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"}
        if self.path.split("?")[0] != TARGET:
            return self._reply(405, "only /data/cards.json is writable")
        if origin and origin not in allowed:
            return self._reply(403, "bad origin")
        try:
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            data = json.loads(raw.decode("utf-8"))
            if not isinstance(data, list) or not all(isinstance(c, dict) and "id" in c for c in data):
                raise ValueError("expected a list of cards with ids")
        except (ValueError, UnicodeDecodeError) as e:
            return self._reply(400, f"invalid cards.json: {e}")

        path = os.path.join(ROOT, "data", "cards.json")
        if os.path.exists(path):
            with open(path, "rb") as src, open(path + ".bak", "wb") as dst:
                dst.write(src.read())
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, path)
        self._reply(200, "saved")


if __name__ == "__main__":
    print(f"Serving {ROOT} at http://localhost:{PORT}  (crop.html can save data/cards.json)")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
