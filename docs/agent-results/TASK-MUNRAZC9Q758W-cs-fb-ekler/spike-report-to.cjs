const http = require('http');
const { chromium } = require(process.cwd() + '/wt/node_modules/@playwright/test');
const hits = [];
const srv = http.createServer((req, res) => {
  if (req.method === 'POST') { let b=''; req.on('data', c => b += c); req.on('end', () => { hits.push(req.url + ' ' + req.headers['content-type']); res.writeHead(204); res.end(); }); return; }
  const v = req.url.slice(1);
  const base = "img-src 'self'";
  const h = { 'content-type': 'text/html' };
  if (v === 'A') h['content-security-policy'] = base + '; report-uri /r/A';
  if (v === 'B') { h['content-security-policy'] = base + '; report-uri /r/B-uri; report-to g'; h['reporting-endpoints'] = 'g="/r/B-to"'; }
  if (v === 'C') { h['content-security-policy'] = base + '; report-uri /r/C-uri; report-to g'; h['reporting-endpoints'] = `g="http://127.0.0.1:47990/r/C-to"`; }
  res.writeHead(200, h); res.end('<img src="https://evil.example/x.png">');
}).listen(47990, async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const p = await b.newPage();
  for (const v of ['A', 'B', 'C']) { await p.goto('http://127.0.0.1:47990/' + v); await p.waitForTimeout(500); }
  await p.waitForTimeout(70000);
  console.log('hits:', JSON.stringify(hits));
  await b.close(); srv.close();
});
