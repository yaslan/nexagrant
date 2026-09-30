#!/bin/bash
# Restores each file from a byte copy, never `git checkout`.
# Usage: mutant-betigi.sh <tree-dir> <label>   — applies each mutant, runs its target set, restores.
SP=/private/tmp/claude-501/-Users-macbook-alan/9ec14834-2fab-45d3-affd-f2f3ba29d6ed/scratchpad
source $SP/env.sh
cd "$1" || exit 1; L=$2
case "$DATABASE_URL" in *55920*) ;; *) echo "wrong DATABASE_URL"; exit 1;; esac
E=src/lib/scoring/embeddings.ts; U=scripts/k1-embeddings-unlock-rejected.ts
R='src/app/api/concept-notes/[id]/export/route.ts'; H=src/lib/docx-safe-html.ts; C=src/lib/content-disposition.ts
EMB=(src/lib/scoring/embeddings src/lib/jobs/tasks/__tests__/k1-embeddings tests/k1-embeddings)
DOC=("src/app/api/concept-notes/[id]/export/" src/lib/docx-safe-html src/lib/content-disposition)
runset(){ pnpm exec vitest run "$@" 2>&1; }
summ(){ echo "$1" | grep -E "^ +Tests " | tr -s ' ' | sed 's/^ //'; }
run(){ # name set file perl-expr
  local name=$1 set=$2 f=$3 e=$4
  [ -f "$f" ] || { printf '%-48s %-6s => N/A (file absent)\n' "$name" "$L"; return; }
  cp "$f" "$f.mutbak"
  perl -0pi -e "$e" "$f"
  if cmp -s "$f" "$f.mutbak"; then printf '%-48s %-6s => N/A (mutation does not apply)\n' "$name" "$L"; rm "$f.mutbak"; return; fi
  if [ "$set" = emb ]; then out=$(runset "${EMB[@]}"); else out=$(runset "${DOC[@]}"); fi
  s=$(summ "$out")
  if echo "$s" | grep -q failed; then
    files=$(echo "$out" | grep -E "^ (FAIL|×)" | grep -oE "[a-zA-Z0-9_./\[\]-]+\.test\.ts" | sort -u | tr '\n' ' ')
    printf '%-48s %-6s => KILLED   (%s) %s\n' "$name" "$L" "$s" "$files"
  else printf '%-48s %-6s => SURVIVED (%s)\n' "$name" "$L" "$s"; fi
  mv "$f.mutbak" "$f"   # restore the exact pre-mutant bytes (a git checkout would drop uncommitted work)
}
printf '%-48s %-6s => BASE %s\n' "emb set" "$L" "$(summ "$(runset "${EMB[@]}")")"
printf '%-48s %-6s => BASE %s\n' "docx set" "$L" "$(summ "$(runset "${DOC[@]}")")"
run "S5  önek 429 → ilk 400 ile yargıla"            emb "$E" 's/ \|\| !isInputRejection\(retry\.error\)\) r = retry;/) r = retry;/'
run "S15a restore Topic: IS NULL koruması yok"      emb "$U" 's/WHERE id = \$\{t\.id\} AND "embeddingHash" IS NULL/WHERE id = \${t.id}/'
run "S15b restore profil: IS NULL koruması yok"     emb "$U" 's/WHERE "tenantId" = \$\{p\.tenantId\} AND "embeddingHash" IS NULL/WHERE "tenantId" = \${p.tenantId}/'
run "S16a apply: Topic'te tüm hash'ler silinir"     emb "$U" 's/WHERE id = ANY\(\$\{topicIds\}::text\[\]\) AND "embeddingHash" LIKE \$\{LIKE\}/WHERE "embeddingHash" IS NOT NULL/'
run "S16b listeleme: rejected: yerine her hash"     emb "$U" 's/WHERE "embeddingHash" LIKE \$\{LIKE\} AND \(/WHERE "embeddingHash" IS NOT NULL AND (/; s/WHERE "embeddingHash" LIKE \$\{LIKE\} ORDER BY id/WHERE "embeddingHash" IS NOT NULL ORDER BY id/'
run "S16c profil listeleme: her hash"              emb "$U" 's/WHERE "tenantId" = \$\{id\} AND "embeddingHash" LIKE \$\{LIKE\}/WHERE "tenantId" = \${id} AND "embeddingHash" IS NOT NULL/'
run "S16d profil apply: LIKE koruması yok"         emb "$U" 's/(SET "embeddingHash" = NULL WHERE "tenantId" = \$\{p\.tenantId\}) AND "embeddingHash" LIKE \$\{LIKE\}/$1/'
run "S17a yedek temizlikten SONRA yazılır"         emb "$U" 's/(  fs\.writeFileSync\(file,[^\n]*\n)(.*?)(  console\.log\(`Cleared)/$2$1$3/s'
run "S17b yedek hiç yazılmaz"                      emb "$U" 's/  fs\.writeFileSync\(file,[^\n]*\n//'
run "S18 kuru koşu da temizler"                    emb "$U" 's/if \(!apply\) \{/if (false) {/'
run "D4  bütçe sınırı > yerine >="                 doc "$H" 's/bytes\.length > budget\.remaining/bytes.length >= budget.remaining/'
run "D9  warn'da hata nedeni yok"                  doc "$R" "s/console\.warn\('\[concept-note export\] retrying without images:', error instanceof Error \? error\.message : error\);/console.warn('[concept-note export] retrying without images:');/; s/\n      reason: [^\n]*\n/\n/"
run "D14 ascii yedekte harf-rakam kapısı yok"      doc "$C" 's/\/\[A-Za-z0-9\]\/\.test\(asciiBase\)/asciiBase.length > 0/'
run "D19 Exif entry.length>=10 -> >=8"             doc "$H" 's/return entry\.length >= 10;/return entry.length >= 8;/'
run "O2a log'da noteId yok"                        doc "$R" 's/\n      noteId: id,\n/\n/'
run "O2b log'a başlık sızar"                       doc "$R" 's/\n      tenantId,\n/\n      tenantId,\n      title: opportunity?.title,\n/'
run "O2c gelen X-Request-Id yok sayılır"           doc "$R" 's/return given && [^\n]*? : randomUUID\(\);/return randomUUID();/'
run "O2d güvensiz X-Request-Id kabul edilir"       doc "$R" 's/given && \/\^\[\\w\.:-\]\{1,128\}\$\/\.test\(given\) \? given/given ? given/'
git status --short
