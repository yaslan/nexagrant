// İNCELEME-63 G5 probe: for every readOnly server action, follow imported (@/ or relative) callees
// transitively (depth ≤ 6) and report any Prisma write reached. Review evidence only.
const ts = require('typescript'), fs = require('fs'), path = require('path');
const SRC = path.resolve('src');
const MODELS = new Set([...fs.readFileSync('prisma/schema.prisma','utf8').matchAll(/^model (\w+) \{/gm)].map(([,n])=>n[0].toLowerCase()+n.slice(1)));
const W = new Set(['create','createMany','createManyAndReturn','update','updateMany','updateManyAndReturn','upsert','delete','deleteMany']);
const cache = new Map();
function parse(file){ if(!cache.has(file)){ const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const fns=new Map(), imports=new Map();
  for(const s of sf.statements){
    if(ts.isFunctionDeclaration(s)&&s.name&&s.body) fns.set(s.name.text,s);
    if(ts.isVariableStatement(s)) for(const d of s.declarationList.declarations){ if(ts.isIdentifier(d.name)&&d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer))) fns.set(d.name.text,d.initializer); }
    if(ts.isImportDeclaration(s)&&s.importClause&&s.importClause.namedBindings&&ts.isNamedImports(s.importClause.namedBindings)&&!s.importClause.isTypeOnly){
      const spec=s.moduleSpecifier.text; for(const el of s.importClause.namedBindings.elements) imports.set(el.name.text,{spec,name:(el.propertyName??el.name).text}); }
  }
  cache.set(file,{sf,fns,imports}); } return cache.get(file); }
function resolve(from, spec){ let base = spec.startsWith('@/')? path.join(SRC,spec.slice(2)) : spec.startsWith('.')? path.resolve(path.dirname(from),spec) : null;
  if(!base) return null; for(const c of [base+'.ts',base+'.tsx',path.join(base,'index.ts')]) if(fs.existsSync(c)) return c; return null; }
function writesOf(file, fnName, depth, seen){ const key=file+'#'+fnName; if(seen.has(key)||depth>6) return []; seen.add(key);
  const m=parse(file), fn=m.fns.get(fnName); if(!fn) return []; const out=[];
  const visit=(n)=>{ if(ts.isCallExpression(n)){ const e=n.expression;
      if(ts.isPropertyAccessExpression(e)&&W.has(e.name.text)){ const r=e.expression; const model= ts.isPropertyAccessExpression(r)? r.name.text : ts.isIdentifier(r)? r.text : null; if(model&&MODELS.has(model)) out.push(`${path.relative(SRC,file)}:${m.sf.getLineAndCharacterOfPosition(n.getStart()).line+1} ${e.getText(m.sf)}`); }
      if(ts.isIdentifier(e)){ const nm=e.text;
        if(m.fns.has(nm)) out.push(...writesOf(file,nm,depth,seen));
        else if(m.imports.has(nm)){ const {spec,name}=m.imports.get(nm); const f2=resolve(file,spec); if(f2) out.push(...writesOf(f2,name,depth+1,seen).map(x=>x)); } } }
    ts.forEachChild(n,visit); };
  visit(fn.body); return out; }
function* files(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){ const f=path.join(d,e.name); if(e.isDirectory()) yield* files(f); else if(/\.tsx?$/.test(e.name)&&!/\.test\.|\.d\.ts$/.test(e.name)) yield f; } }
let ro=0, hits=0, crossCalls=0;
for(const f of files(SRC)){ const txt=fs.readFileSync(f,'utf8'); if(!/^['"]use server['"]/m.test(txt)) continue; const m=parse(f);
  for(const s of m.sf.statements){ const name = ts.isFunctionDeclaration(s)&&s.name? s.name.text : null; if(!name||!s.body) continue;
    const body=s.body.getText(m.sf); if(!/readOnly:\s*true/.test(body)) continue; ro++;
    // count imported callees reached
    const calls=new Set(); (function v(n){ if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&m.imports.has(n.expression.text)) calls.add(n.expression.text); ts.forEachChild(n,v); })(s.body);
    crossCalls+=calls.size;
    const w=writesOf(f,name,0,new Set()); if(w.length){ hits++; console.log(`WRITE  ${path.relative(SRC,f)}#${name} → ${[...new Set(w)].join(' ; ')}`); }
  } }
console.log(`readOnly actions: ${ro}; distinct imported callees followed from them: ${crossCalls}; readOnly actions reaching a Prisma write (any module): ${hits}`);
