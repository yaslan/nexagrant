import { chromium } from '@playwright/test';
const b = await chromium.launch();
for (const cur of ['USD','TRY']) {
  const p = await b.newPage({ viewport: { width: 1000, height: 1300 } });
  await p.goto('file:///Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSWLWDONWA3W-evidence/08-after-fx-note-' + cur + '.html');
  await p.screenshot({ path: `/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSWLWDONWA3W-evidence/10-browser-${cur}-with-tl-equivalent.png`, fullPage: true });
  console.log(cur, 'shot ok; totals text:', (await p.locator('.totals-table').innerText()).replace(/\n/g,' | '));
  await p.close();
}
await b.close();
