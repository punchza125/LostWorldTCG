#!/usr/bin/env python3
"""Local dev server: serves the project and lets web/crop.html save data/cards.json.

Usage: python3 serve.py [port] [--lan] [--https]   (default 8080)
  --lan    also listen on the local network (e.g. open it from your phone on the same Wi-Fi / hotspot).
           In LAN mode only web/, data/ and assets/ are served.
  --https  serve over HTTPS with a self-signed certificate (made once in .certs/). Phones only allow the
           tilt sensor (card glare in the inspector) on https pages. The phone shows a warning the first time:
           tap "Show details" -> "visit this website".
Only PUT to the data files listed in TARGETS is allowed, and only from a page served by this server.
"""
import http.server
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
LAN = "--lan" in sys.argv
HTTPS = "--https" in sys.argv
PORT = int(ARGS[0]) if ARGS else 8080
PUBLIC = ("/web/", "/data/", "/assets/")                              # what LAN mode exposes
TARGETS = {"/data/cards.json": "cards", "/data/tags.json": "tags",   # the only writable files
           "/data/review-answers.json": "review-answers", "/data/decks.json": "decks"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if LAN and not self.path.split("?")[0].startswith(PUBLIC):
            return self._reply(404, "not found")
        super().do_GET()

    def do_HEAD(self):
        if LAN and not self.path.split("?")[0].startswith(PUBLIC):
            return self._reply(404, "not found")
        super().do_HEAD()

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
        host = self.headers.get("Host", "")
        allowed = {f"{sch}://{h}" for sch in ("http", "https") for h in (f"localhost:{PORT}", f"127.0.0.1:{PORT}", host)}  # same-origin only
        kind = TARGETS.get(self.path.split("?")[0])
        if not kind:
            return self._reply(405, "only " + ", ".join(TARGETS) + " are writable")
        if origin and origin not in allowed:
            return self._reply(403, "bad origin")
        try:
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            data = json.loads(raw.decode("utf-8"))
            if kind == "cards" and not (isinstance(data, list) and all(isinstance(c, dict) and "id" in c for c in data)):
                raise ValueError("expected a list of cards with ids")
            if kind == "tags" and not (isinstance(data, list) and all(isinstance(t, str) for t in data)):
                raise ValueError("expected a list of strings")
            if kind == "decks" and not (isinstance(data, list) and all(isinstance(d, dict) and isinstance(d.get("cards"), list) for d in data)):
                raise ValueError("expected a list of decks with cards")
            if kind == "review-answers" and not (isinstance(data, dict) and all(isinstance(v, dict) for v in data.values())):
                raise ValueError("expected an object of answers")
        except (ValueError, UnicodeDecodeError) as e:
            return self._reply(400, f"invalid {kind}.json: {e}")

        path = os.path.join(ROOT, "data", f"{kind}.json")
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
    try:
        server = http.server.ThreadingHTTPServer(("0.0.0.0" if LAN else "127.0.0.1", PORT), Handler)
    except OSError as e:
        if e.errno in (48, 98):  # address already in use (macOS / Linux)
            sys.exit(f"Port {PORT} is already in use - the server is probably already running.\n"
                     f"Just open http://localhost:{PORT}/web/gallery.html (or run: python3 serve.py 8081)")
        raise
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("8.8.8.8", 80)); ip = s.getsockname()[0]; s.close()
    except OSError:
        ip = None
    scheme = "http"
    if HTTPS:
        import ssl, subprocess
        cdir = os.path.join(ROOT, ".certs"); os.makedirs(cdir, exist_ok=True)
        cert, key = os.path.join(cdir, "cert.pem"), os.path.join(cdir, "key.pem")
        stamp = os.path.join(cdir, "ip.txt"); old_ip = open(stamp).read().strip() if os.path.exists(stamp) else None
        if not (os.path.exists(cert) and os.path.exists(key)) or old_ip != (ip or ""):   # (re)make the certificate when the IP changes
            san = "DNS:localhost,IP:127.0.0.1" + (f",IP:{ip}" if ip else "")
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "825",
                            "-subj", "/CN=LostWorld TCG (local)", "-addext", f"subjectAltName={san}"], check=True, capture_output=True)
            open(stamp, "w").write(ip or "")
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(cert, key)
        server.socket = ctx.wrap_socket(server.socket, server_side=True); scheme = "https"
    print(f"Serving {ROOT} at {scheme}://localhost:{PORT}  (crop.html can save data/cards.json)")
    if LAN:
        print(f"On your phone (same Wi-Fi / hotspot): {scheme}://{ip or '<this computer IP>'}:{PORT}/web/gallery.html")
    server.serve_forever()
