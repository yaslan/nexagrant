# Stand-in for GET /api/internal/tls-ask?domain=… : 200 only for a verified custom domain.
import http.server, urllib.parse, sys
VERIFIED = {"panel.oka-ornek.test"}
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        d = (q.get("domain") or [""])[0].lower().rstrip(".")
        code = 200 if d in VERIFIED else 404
        sys.stderr.write(f"ASK domain={d} -> {code}\n"); sys.stderr.flush()
        self.send_response(code); self.end_headers()
    def log_message(self, *a): pass
http.server.HTTPServer(("0.0.0.0", 9123), H).serve_forever()
