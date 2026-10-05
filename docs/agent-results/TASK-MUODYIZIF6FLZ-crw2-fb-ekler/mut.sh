#!/bin/bash
# crw2-fb TASK-MUODYIZIF6FLZ: İNCELEME-108 Ö-1..Ö-6 mutants against dev tests. Byte-copy restore.
S=/private/tmp/claude-501/-Users-macbook-alan/9a6dd6b3-c739-4f9e-acef-efef7e2dc78d/scratchpad
source $S/env.sh; cd $S/wt || exit 1
case "$DATABASE_URL" in *55136*) ;; *) echo "wrong DATABASE_URL"; exit 1;; esac
echo "DATABASE_URL=$DATABASE_URL HEAD=$(git rev-parse --short HEAD)"
E=src/lib/scoring/embeddings.ts; U=scripts/k1-embeddings-unlock-rejected.ts
R='src/app/api/concept-notes/[id]/export/route.ts'; H=src/lib/docx-safe-html.ts; C=src/lib/content-disposition.ts
EMB=(src/lib/scoring/embeddings src/lib/jobs/tasks/__tests__/k1-embeddings tests/k1-embeddings)
DOC=("src/app/api/concept-notes/[id]/export/" src/lib/docx-safe-html src/lib/content-disposition)
runset(){ pnpm exec vitest run "$@" 2>&1; }
summ(){ echo "$1" | grep -E "^ +Tests " | tr -s ' ' | sed 's/^ //'; }
run(){ local name=$1 set=$2 f=$3 e=$4
  cp "$f" "$f.mutbak"; perl -0pi -e "$e" "$f"
  if cmp -s "$f" "$f.mutbak"; then printf '%-52s => N/A (does not apply)\n' "$name"; rm "$f.mutbak"; return; fi
  if [ "$set" = emb ]; then out=$(runset "${EMB[@]}"); else out=$(runset "${DOC[@]}"); fi
  s=$(summ "$out")
  if echo "$s" | grep -q failed || [ -z "$s" ]; then
    t=$(echo "$out" | grep -E "^ +(×|FAIL)" | head -3 | tr -s ' ' | cut -c1-120 | tr '\n' '|')
    printf '%-52s => KILLED   (%s) %s\n' "$name" "${s:-no summary/crash}" "$t"
  else printf '%-52s => SURVIVED (%s)\n' "$name" "$s"; fi
  mv "$f.mutbak" "$f"; }
ONLY=${ONLY:-.}
m(){ echo "$1" | grep -qE "$ONLY" && run "$@"; }
m "O1a profil apply LIKE koruması yok"  emb "$U" 's/WHERE "tenantId" = \$\{p\.tenantId\} AND "embeddingHash" LIKE \$\{LIKE\}/WHERE "tenantId" = \${p.tenantId}/'
m "O1b Topic apply LIKE koruması yok"   emb "$U" 's/WHERE id = ANY\(\$\{topicIds\}::text\[\]\) AND "embeddingHash" LIKE \$\{LIKE\}/WHERE id = ANY(\${topicIds}::text[])/'
m "O2 E4 tam metin 429 önekle yeniden denenir" emb "$E" 's/if \(r !== .cap. && .error. in r && isInputRejection\(r\.error\)\) \{/if (r !== "cap" \&\& "error" in r \&\& (isInputRejection(r.error) || errorStatus(r.error) === 429)) {/'
m "O3a U12c profil satırı nesne olarak log"   emb "$U" 's/for \(const p of profiles\) console\.log\(`  profile \$\{p\.tenantId\}`\);/for (const p of profiles) console.log("  profile", await withTenant(p.tenantId, (tx) => tx.tenantProfile.findUnique({ where: { tenantId: p.tenantId } })));/'
m "O3a U12d profil metni console.warn"        emb "$U" 's/for \(const p of profiles\) console\.log\(`  profile \$\{p\.tenantId\}`\);/for (const p of profiles) console.warn(`  profile \${p.tenantId} \${(await withTenant(p.tenantId, (tx) => tx.tenantProfile.findUnique({ where: { tenantId: p.tenantId } })))?.capabilities}`);/'
m "O3a U12e profil metni console.error"       emb "$U" 's/for \(const p of profiles\) console\.log\(`  profile \$\{p\.tenantId\}`\);/for (const p of profiles) console.error(`  profile \${p.tenantId} \${(await withTenant(p.tenantId, (tx) => tx.tenantProfile.findUnique({ where: { tenantId: p.tenantId } })))?.capabilities}`);/'
m "O3b R6 log'a kullanıcı e-postası"          doc "$R" 's/\n      tenantId,\n/\n      tenantId,\n      user: session?.user?.email,\n/'
m "O3b R6b log'a kullanıcı adı"               doc "$R" 's/\n      tenantId,\n/\n      tenantId,\n      who: session?.user?.name,\n/'
m "O3c R1 reason kesilmez"                    doc "$R" 's/\.split\(.\\n.\)\[0\]!\.slice\(0, 200\)//'
m "O3c R1b yalnız ilk satır, 200 kesimi yok"  doc "$R" 's/\[0\]!\.slice\(0, 200\)/[0]!/'
m "O3c R1c 200 kesimi var, ilk satır yok"     doc "$R" 's/\.split\(.\\n.\)\[0\]!\.slice\(0, 200\)/.slice(0, 200)/'
m "O4 D19d count (!==1) kontrolü yok"         doc "$H" 's/    if \(\(bigEndian \? entry\.readUInt32BE\(4\) : entry\.readUInt32LE\(4\)\) !== 1\) return true;\n//'
m "O4 D19e entry<8 -> <7"                     doc "$H" 's/if \(entry\.length < 8\) return false;/if (entry.length < 7) return false;/'
m "O4 D19f LE sayım BE okunur"                doc "$H" 's/entry\.readUInt32BE\(4\) : entry\.readUInt32LE\(4\)/entry.readUInt32BE(4) : entry.readUInt32BE(4)/'
m "O5 C1 ASCII kapısı yalnız harf"            doc "$C" 's/\/\[A-Za-z0-9\]\/\.test\(asciiBase\)/\/[A-Za-z]\/.test(asciiBase)/'
m "O5 C2 ASCII kapısı \\w"                    doc "$C" 's/\/\[A-Za-z0-9\]\/\.test\(asciiBase\)/\/\\w\/.test(asciiBase)/'
m "O5 C3 ASCII kapısı başta harf-rakam"       doc "$C" 's/\/\[A-Za-z0-9\]\/\.test\(asciiBase\)/\/^[A-Za-z0-9]\/.test(asciiBase)/'
m "O6 U6 silinmiş kiracılar da taranır"       emb "$U" 's/where: \{ deletedAt: null, /where: { /'
m "O6 U10 isMain hep true"                    emb "$U" "s/const isMain = process\.argv\[1\]\?\.includes\('k1-embeddings-unlock-rejected'\);/const isMain = true;/"
git status --short
