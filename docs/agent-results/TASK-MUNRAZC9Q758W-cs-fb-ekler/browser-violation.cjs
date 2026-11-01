const { chromium } = require(process.cwd() + '/wt/node_modules/@playwright/test');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH }); const p = await b.newPage();
  const errs = []; p.on('console', m => { if (/Content Security Policy/i.test(m.text())) errs.push(m.text().slice(0, 140)); });
  const reports = []; p.on('request', r => { if (r.url().includes('/api/csp-report')) reports.push(r.method() + ' ' + r.headers()['content-type']); });
  for (const path of ['/foo.bar', '/tr']) {
    await p.goto('http://127.0.0.1:47981' + path);
    const ran = await p.evaluate(async () => { window.__x = 0; document.body.insertAdjacentHTML('beforeend', '<img src="/nope.png" onerror="window.__x=1"><img src="https://evil.example/p.png">'); await new Promise(r => setTimeout(r, 800)); return window.__x; });
    const hydrated = await p.evaluate(() => typeof window.__next_f !== 'undefined');
    console.log(path, 'injected inline ran =', ran, '| next runtime present =', hydrated);
  }
  await p.waitForTimeout(3000);
  console.log('console CSP errors:', errs.length, errs[0] || '');
  console.log('report requests:', reports.length, [...new Set(reports)].join(', '));
  await b.close();
})();
