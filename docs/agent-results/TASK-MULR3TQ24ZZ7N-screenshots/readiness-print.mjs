import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
await p.goto('http://localhost:3000/tr/fon-hazirlik?kurum=municipality&cevap=000000000000000&il=Samsun', { waitUntil: 'networkidle' });
await p.emulateMedia({ media: 'print' });
const vis = async (sel) => p.locator(sel).first().isVisible();
console.log('print: header', await vis('header'), '| cta', await vis('#cta-heading'), '| share', await vis('#share-heading'), '| gaps', await vis('#gaps-heading'), '| recs', await vis('#rec-heading'));
await p.pdf({ path: process.argv[2], format: 'A4' });
await b.close();
