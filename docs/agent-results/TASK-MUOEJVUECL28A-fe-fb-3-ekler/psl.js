const {getDomain}=require('tldts'); const psl=require('psl');
const v=(tag,h,d)=>`${tag.padEnd(36)} ${h.padEnd(20)} getDomain=${String(d).padEnd(18)}`;
const rev3=(d,h)=> d!==h ? 'kabul' : 'ret';
const rev4=(d,h)=> (d===null||d===h) ? 'ret' : 'kabul';
console.log('tldts',JSON.parse(require('fs').readFileSync('node_modules/tldts/package.json')).version,'psl',JSON.parse(require('fs').readFileSync('node_modules/psl/package.json')).version);
for (const h of ['org.tr','gov.tr','com','oka.org.tr','panel.oka.org.tr','github.io','ajans.github.io','panel.ajans.github.io','localhost','panel.oka.org.tr.']) {
  const a=getDomain(h), b=getDomain(h,{allowPrivateDomains:true});
  console.log(v('tldts varsayılan',h,a),'rev3:',rev3(a,h).padEnd(6),'rev4:',rev4(a,h).padEnd(6),'| allowPrivateDomains:',String(b).padEnd(16),'rev4:',rev4(b,h),'| psl.get:',String(psl.get(h)));
}
