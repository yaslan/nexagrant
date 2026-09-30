import { chromium } from '/Users/macbook/alan/FONBRIDGE-wt-fefb-muntt/node_modules/@playwright/test/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const BASE = 'http://localhost:3481';
const OUT = '/Users/macbook/alan/FONBRIDGE-wt-fefb-muntt/docs/agent-results/TASK-MUNTTZ94LJWBC-fe-fb-ekler';
const tokens = JSON.parse(readFileSync('/private/tmp/claude-501/-Users-macbook-alan/aeae5b9b-df44-47d4-87e9-9c54ef5788a8/scratchpad/tokens.json', 'utf8'));
const sql = (q) => execSync('docker exec -i fefb-muntt-pg psql -U fabrika -d fabrika -X -At -v ON_ERROR_STOP=1', { input: q }).toString().trim();
const log = [];
const say = (...a) => { const l = a.join(' '); log.push(l); console.log(l); };
const browser = await chromium.launch({ channel: 'chrome' });
async function as(who, w = 1280) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addCookies([{ name: 'authjs.session-token', value: tokens[who], domain: 'localhost', path: '/' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('fabrika_cookie_consent', JSON.stringify({ necessary: true })); } catch {} });
  const page = await ctx.newPage();
  page.on('dialog', async (d) => { say('  dialog:', d.message()); await d.dismiss(); });
  return { ctx, page };
}
const dl = (page, id) => page.evaluate(async (id) => {
  const r = await fetch('/api/evidence/' + id + '/download');
  const b = new Uint8Array(await r.arrayBuffer());
  return r.status + ' | ' + (r.headers.get('content-disposition') || '-') + ' | ' + new TextDecoder().decode(b).slice(0, 40).replace(/\n/g, '\\n');
}, id);
const cards = (page) => page.locator('text=Kayıtlı Belge').first().textContent();

// alice uploads a second file through the form; marked CONFIDENTIAL in the DB (the form offers only INTERNAL)
let { ctx, page } = await as('alice');
let put2 = null;
page.on('request', (r) => { if (r.url().includes('/api/evidence/mock-upload')) put2 = r.url(); });
await page.goto(BASE + '/tr/main/kanitlar', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Yeni Belge Yükle/ }).first().click();
await page.locator('input[type=file]').setInputFiles('/private/tmp/claude-501/-Users-macbook-alan/aeae5b9b-df44-47d4-87e9-9c54ef5788a8/scratchpad/gizli.pdf');
await page.locator('form button[type=submit]').click();
await page.waitForTimeout(4000);
const rows = sql("select id||'|'||\"r2ObjectKey\" from \"Evidence\" where \"tenantId\"='demo-tenant' order by \"createdAt\";").split('\n').map((l) => l.split('|'));
const [open, secret] = rows;
sql("update \"Evidence\" set confidentiality='CONFIDENTIAL', title='GIZLI kanit' where id='" + secret[0] + "';");
say('rows', JSON.stringify(rows));

// A1 in the browser: replay the first upload's PUT with HTML bytes of the same length
const put1 = readFileSync('/private/tmp/claude-501/-Users-macbook-alan/aeae5b9b-df44-47d4-87e9-9c54ef5788a8/scratchpad/puturl.txt', 'utf8');
const orig = readFileSync('/private/tmp/claude-501/-Users-macbook-alan/aeae5b9b-df44-47d4-87e9-9c54ef5788a8/scratchpad/kanit.pdf');
const html = '<html>'.padEnd(orig.length - 7, 'x') + '</html>';
const replay = await page.evaluate(async ([u, body]) => (await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body })).status, [put1, html]);
say('A1 replay PUT (same URL, html bytes, len', html.length, ') ->', replay);
say('A1 alice download of the confirmed file after replay ->', await dl(page, open[0]));
const finalPut = await page.evaluate(async (u) => (await fetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: '%PDF-x' })).status, BASE + '/api/evidence/mock-upload?key=' + encodeURIComponent(open[1]));
say('A1 PUT straight at the final key ->', finalPut);
await page.reload({ waitUntil: 'networkidle' });
say('alice (PIPELINE_MANAGER) list:', await cards(page));
say('alice open  ->', await dl(page, open[0]));
say('alice gizli ->', await dl(page, secret[0]));
await page.screenshot({ path: OUT + '/02-alice-iki-belge.png', fullPage: true });
await ctx.close();

({ ctx, page } = await as('charlie'));
await page.goto(BASE + '/tr/main/kanitlar', { waitUntil: 'networkidle' });
say('charlie (MEMBER) list:', await cards(page), '| gizli title visible:', await page.locator('text=GIZLI kanit').count());
say('charlie open  ->', await dl(page, open[0]));
say('charlie gizli ->', await dl(page, secret[0]));
await page.screenshot({ path: OUT + '/03-charlie-member-gizli-yok.png', fullPage: true });
await ctx.close();

({ ctx, page } = await as('judy'));
await page.goto(BASE + '/tr/main/kanitlar', { waitUntil: 'networkidle' });
say('judy (GUEST_PARTNER) list:', await cards(page), '| any title visible:', await page.locator('text=GIZLI kanit').count() + await page.locator('text=kanit_pdf').count());
say('judy open  ->', await dl(page, open[0]));
say('judy gizli ->', await dl(page, secret[0]));
say('judy made-up id ->', await dl(page, 'yok-boyle-bir-id'));
await page.screenshot({ path: OUT + '/04-judy-guest-bos-liste.png', fullPage: true });
await ctx.close();
({ ctx, page } = await as('judy', 390));
await page.goto(BASE + '/tr/main/kanitlar', { waitUntil: 'networkidle' });
say('judy 390px overflow:', await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
await page.screenshot({ path: OUT + '/05-judy-guest-390px.png', fullPage: false });
await ctx.close();
writeFileSync(OUT + '/browser-walk-2.txt', log.join('\n'));
await browser.close();
