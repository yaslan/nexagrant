// rev.4 §3.3 Y-2: C yolu ara sayfaları + belgedeki Origin kuralları, gerçek Chromium, üç ayrı site.
// panel = 127.0.0.1 (ajans host'u), araci = localhost (fonbridge.com), saldirgan = [::1]
const http=require('http'); const {webkit:chromium}=require('playwright-core');
const P='http://127.0.0.1:18721', B='http://localhost:18722', X='http://[::1]:18723';
let POLICY, LABEL, log=[];
const form=(action)=>`<!doctype html><form id=f method=post action="${action}"><input name=t value=tok></form><script>f.submit()</script>`;
const hdr=()=>({'Content-Type':'text/html','Referrer-Policy':POLICY,'Cache-Control':'no-store'});
// belge rev.4 §3.3-2: Origin tam eşleşme; "null" → ret (geri düşüş yok); başlık YOKSA Sec-Fetch-Site+Referer kökeni
function step2(q, target){ const o=q.headers.origin;
  if(o!==undefined) return o===target ? 'KABUL' : `RET (Origin=${o})`;
  const r=q.headers.referer; let ro=null; try{ ro=new URL(r).origin }catch{}
  return (q.headers['sec-fetch-site']==='cross-site' && ro===target) ? 'KABUL(geri düşüş)' : 'RET (Origin yok, Referer yok/uyumsuz)'; }
// §3.3-6: aynı köken Origin şart
const step6=(q)=> q.headers.origin===P ? 'KABUL' : `RET (Origin=${q.headers.origin??'(yok)'})`;
const rec=(n,v,q)=>log.push(`${LABEL.padEnd(32)} ${n.padEnd(26)} origin=${(q.headers.origin??'(yok)').padEnd(24)} cookie=${(q.headers.cookie??'(yok)').padEnd(10)} → ${v}`);
http.createServer((q,r)=>{
  if(q.url==='/giris'){ r.writeHead(200,{...hdr(),'Set-Cookie':'nonce=abc; Path=/; SameSite=Lax; HttpOnly'}); return r.end(form(B+'/giris/araci'));}
  if(q.url==='/api/auth/handoff'){ rec('5. handoff (siteler arası)','(Origin kontrolü yok)',q); r.writeHead(200,hdr()); return r.end(form('/api/auth/handoff/complete'));}
  if(q.url==='/api/auth/handoff/complete'){ const v=step6(q)+(q.headers.cookie?'':' + nonce çerezi YOK'); rec('6. complete',v,q); r.writeHead(200,hdr()); return r.end('ok');}
  r.end();}).listen(18721,'127.0.0.1');
http.createServer((q,r)=>{
  if(q.url==='/giris/araci'){ rec('2. aracı girişi',step2(q,P),q); r.writeHead(200,hdr()); return r.end(form(P+'/api/auth/handoff'));}  // 3-4 kısaltıldı: belirteç formu
  r.end();}).listen(18722,'localhost');
let XPOL, XTARGET;
http.createServer((q,r)=>{ r.writeHead(200,{'Content-Type':'text/html','Referrer-Policy':XPOL}); r.end(form(XTARGET)); }).listen(18723,'::1');
(async()=>{ const br=await chromium.launch(); console.log('webkit',br.version());
  const go=async(url,until)=>{ const c=await br.newContext(); const p=await c.newPage(); await p.goto(url); await p.waitForTimeout(until); await c.close(); };
  for (const p of ['no-referrer','strict-origin','strict-origin-when-cross-origin']) { POLICY=LABEL=p; await go(P+'/giris',1500); }
  POLICY='strict-origin';
  for (const xp of ['no-referrer','unsafe-url']) { XPOL=xp; XTARGET=B+'/giris/araci'; LABEL=`saldırgan(${xp})→aracı`; await go(X+'/',800); }
  // saldırgan→complete: kurbanın panelde nonce çerezi varken
  for (const xp of ['no-referrer','unsafe-url']) { XPOL=xp; XTARGET=P+'/api/auth/handoff/complete'; LABEL=`saldırgan(${xp})→complete`;
    const c=await br.newContext(); await c.addCookies([{name:'nonce',value:'abc',domain:'127.0.0.1',path:'/',sameSite:'Lax',httpOnly:true}]);
    const pg=await c.newPage(); await pg.goto(X+'/'); await pg.waitForTimeout(800); await c.close(); }
  await br.close(); console.log(log.join('\n')); process.exit(0); })();
