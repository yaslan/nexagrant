#!/bin/bash
# cs-fb İNCELEME-108 mutants. Restores each file from a byte copy (no git checkout).
SP=/private/tmp/claude-501/-Users-macbook-alan/68f13177-7a92-408b-a82c-c8aca342d993/scratchpad
source $SP/env.sh
cd $SP/wt108 || exit 1
case "$DATABASE_URL" in *55108*) ;; *) echo "wrong DATABASE_URL"; exit 1;; esac
echo "DATABASE_URL=$DATABASE_URL"
E=src/lib/scoring/embeddings.ts; U=scripts/k1-embeddings-unlock-rejected.ts
R='src/app/api/concept-notes/[id]/export/route.ts'; H=src/lib/docx-safe-html.ts; C=src/lib/content-disposition.ts
EMB=(src/lib/scoring/embeddings src/lib/jobs/tasks/__tests__/k1-embeddings tests/k1-embeddings)
DOC=("src/app/api/concept-notes/[id]/export/" src/lib/docx-safe-html src/lib/content-disposition)
runset(){ pnpm exec vitest run "$@" 2>&1; }
summ(){ echo "$1" | grep -E "^ +Tests " | tr -s ' ' | sed 's/^ //'; }
run(){ local name=$1 set=$2 f=$3 e=$4
  cp "$f" "$f.mutbak"; perl -0pi -e "$e" "$f"
  if cmp -s "$f" "$f.mutbak"; then printf '%-58s => N/A (does not apply)\n' "$name"; rm "$f.mutbak"; return; fi
  if [ "$set" = emb ]; then out=$(runset "${EMB[@]}"); else out=$(runset "${DOC[@]}"); fi
  s=$(summ "$out")
  if echo "$s" | grep -q failed || [ -z "$s" ]; then
    t=$(echo "$out" | grep -E "^ +(×|FAIL)" | head -3 | tr -s ' ' | cut -c1-140 | tr '\n' '|')
    printf '%-58s => KILLED   (%s) %s\n' "$name" "${s:-no summary/crash}" "$t"
  else printf '%-58s => SURVIVED (%s)\n' "$name" "$s"; fi
  mv "$f.mutbak" "$f"; }
run "U11 ikinci apply 'Nothing to clear' dalı yok (boş yedek yazılır)" emb "$U" 's/  if \(topics\.length \+ profiles\.length === 0\) \{\n    console\.log\(.\\nNothing to clear\..\);\n    return result;\n  \}\n//'
run "U12b profil metni string olarak basılır"     emb "$U" 's/for \(const p of profiles\) console\.log\(`  profile \$\{p\.tenantId\}`\);/for (const p of profiles) console.log(`  profile ${p.tenantId} ${(await withTenant(p.tenantId, (tx) => tx.tenantProfile.findUnique({ where: { tenantId: p.tenantId } })))?.capabilities}`);/'
run "U12c profil satırı nesne olarak basılır"      emb "$U" 's/for \(const p of profiles\) console\.log\(`  profile \$\{p\.tenantId\}`\);/for (const p of profiles) console.log("  profile", await withTenant(p.tenantId, (tx) => tx.tenantProfile.findUnique({ where: { tenantId: p.tenantId } })));/'
run "U12d console.warn ile basılır"               emb "$U" 's/for \(const p of profiles\) console\.log\(`  profile \$\{p\.tenantId\}`\);/for (const p of profiles) console.warn(`  profile ${p.tenantId} ${(await withTenant(p.tenantId, (tx) => tx.tenantProfile.findUnique({ where: { tenantId: p.tenantId } })))?.capabilities}`);/'
git status --short
