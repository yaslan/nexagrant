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
[ "$1" = base ] && { printf 'BASE emb  %s\n' "$(summ "$(runset "${EMB[@]}")")"; printf 'BASE docx %s\n' "$(summ "$(runset "${DOC[@]}")")"; exit; }
# --- K1 embedding
run "E1 429 da girdi reddi sayılır (isInputRejection)"       emb "$E" 's/return status === 400 \|\| status === 413;/return status === 400 || status === 413 || status === 429;/'
run "E2 önekte yalnız 5xx kendi hatasıyla (429 -> ilk 400)" emb "$E" 's/ \|\| !isInputRejection\(retry\.error\)\) r = retry;/ || (errorStatus(retry.error) ?? 0) >= 500) r = retry;/'
run "E3 önek 429 özel: ilk 400 ile yargıla"                  emb "$E" 's/ \|\| !isInputRejection\(retry\.error\)\) r = retry;/ || (!isInputRejection(retry.error) \&\& errorStatus(retry.error) !== 429)) r = retry;/'
run "E4 önek dışı 429 de önekle yeniden denenir"             emb "$E" 's/if \(r !== .cap. && .error. in r && isInputRejection\(r\.error\)\) \{/if (r !== "cap" \&\& "error" in r \&\& (isInputRejection(r.error) || errorStatus(r.error) === 429)) {/'
run "E5 önek 429 -> shortened++ yine de"                    emb "$E" "s/if \(retry !== 'cap' && 'vec' in retry\) this\.out\.shortened\+\+;/if (retry !== 'cap') this.out.shortened++;/"
run "E6 önek 429 streak saymaz (r=retry ama fail yok)"       emb "$E" 's/    this\.fail\(r\.error\);\n    if \(isInputRejection\(r\.error\)\) \{/    if (errorStatus(r.error) !== 429) this.fail(r.error);\n    if (isInputRejection(r.error)) {/'
# --- unlock script
run "U1 LIKE deseni her hash (%)"                           emb "$U" 's/const LIKE = `\$\{REJECTED_HASH_PREFIX\}%`;/const LIKE = `%`;/'
run "U2 Topic apply kapsamı düşer (id=ANY yok)"             emb "$U" 's/WHERE id = ANY\(\$\{topicIds\}::text\[\]\) AND "embeddingHash" LIKE/WHERE "embeddingHash" LIKE/'
run "U3 markedTopics kapsamı yok say"                       emb "$U" 's/const only = scope\.topicIds \? \[\.\.\.scope\.topicIds\] : null;/const only = null as string[] | null;/'
run "U4 markedProfiles kapsamı yok say"                     emb "$U" 's/\.\.\.\(scope\.tenantIds \? \{ id: \{ in: \[\.\.\.scope\.tenantIds\] \} \} : \{\}\)//'
run "U5 profil apply tenantId filtresi yok (RLS'ye kalır)"  emb "$U" 's/SET "embeddingHash" = NULL WHERE "tenantId" = \$\{p\.tenantId\} AND /SET "embeddingHash" = NULL WHERE /'
run "U6 silinmiş kiracılar da taranır (deletedAt)"          emb "$U" 's/where: \{ deletedAt: null, /where: { /'
run "U7 yedeğe profiller yazılmaz"                          emb "$U" 's/JSON\.stringify\(\{ createdAt: new Date\(\)\.toISOString\(\), topics, profiles \}/JSON.stringify({ createdAt: new Date().toISOString(), topics, profiles: [] }/'
run "U8 restore Topic döngüsü atlanır"                      emb "$U" 's/for \(const t of backup\.topics\) \{/for (const t of backup.topics.slice(0, 0)) {/'
run "U9 restore profil yanlış hash (NULL yerine sabit)"      emb "$U" 's/UPDATE "TenantProfile" SET "embeddingHash" = \$\{p\.embeddingHash\}/UPDATE "TenantProfile" SET "embeddingHash" = ${"rejected:x"}/'
run "U10 isMain her zaman true (import main koşturur)"      emb "$U" "s/const isMain = process\.argv\[1\]\?\.includes\('k1-embeddings-unlock-rejected'\);/const isMain = true;/"
run "U11 ikinci apply 'Nothing to clear' dalı yok"          emb "$U" 's/  if \(topics\.length \+ profiles\.length === 0\) \{\n    console\.log\(.\\nNothing to clear\.\.\);\n    return result;\n  \}\n//'
run "U12 kilit açma profil metnini basar"                   emb "$U" 's/for \(const p of profiles\) console\.log\(`  profile \$\{p\.tenantId\}`\);/for (const p of profiles) console.log(`  profile ${p.tenantId}`, await prisma.tenantProfile.findUnique({ where: { tenantId: p.tenantId }, select: { capabilities: true } }).catch(() => null));/'
# --- Content-Disposition
run "C1 ASCII kapısı yalnız harf (rakam-başlık düşer)"      doc "$C" 's/\/\[A-Za-z0-9\]\/\.test\(asciiBase\)/\/[A-Za-z]\/.test(asciiBase)/'
run "C2 ASCII kapısı _ da kabul (\\w)"                       doc "$C" 's/\/\[A-Za-z0-9\]\/\.test\(asciiBase\)/\/\\w\/.test(asciiBase)/'
run "C3 ASCII kapısı başta harf-rakam ister"                doc "$C" 's/\/\[A-Za-z0-9\]\/\.test\(asciiBase\)/\/^[A-Za-z0-9]\/.test(asciiBase)/'
run "C4 ASCII kapısı boşluk-dışı her şey"                   doc "$C" 's/\/\[A-Za-z0-9\]\/\.test\(asciiBase\)/\/\\S\/.test(asciiBase)/'
run "C5 filename* de ASCII kapısıyla düşer"                 doc "$C" 's/const unicodeName = \(cleaned \|\| fallbackBase\) \+ extension;/const unicodeName = (\/[A-Za-z0-9]\/.test(cleaned) ? cleaned : fallbackBase) + extension;/'
# --- DOCX Exif / budget
run "D19b >=10 -> >=9"                                      doc "$H" 's/return entry\.length >= 10;/return entry.length >= 9;/'
run "D19c >=10 -> >=11"                                     doc "$H" 's/return entry\.length >= 10;/return entry.length >= 11;/'
run "D19d count kontrolü (!==1) yok"                        doc "$H" 's/    if \(\(bigEndian \? entry\.readUInt32BE\(4\) : entry\.readUInt32LE\(4\)\) !== 1\) return true;\n//'
run "D19e entry<8 -> <7 (7 bayt RangeError)"                doc "$H" 's/if \(entry\.length < 8\) return false;/if (entry.length < 7) return false;/'
run "D19f LE sayım BE okunur"                               doc "$H" 's/entry\.readUInt32BE\(4\) : entry\.readUInt32LE\(4\)/entry.readUInt32BE(4) : entry.readUInt32BE(4)/'
run "D4b bütçe düşümü 1 eksik"                              doc "$H" 's/budget\.remaining -= bytes\.length;/budget.remaining -= bytes.length - 1;/'
# --- route log
run "R1 reason kesilmez (tüm mesaj)"                        doc "$R" 's/\.split\(.\\n.\)\[0\]!\.slice\(0, 200\)//'
run "R2 reason 200 yerine 20 karakter"                      doc "$R" 's/\.slice\(0, 200\)/.slice(0, 20)/'
run "R3 X-Request-Id yanıta eklenmez"                       doc "$R" "s/      'X-Request-Id': requestId,\n//"
run "R4 regex boşluk kabul eder"                            doc "$R" 's/\/\^\[\\w\.:-\]\{1,128\}\$\//\/^[\\w.:\\s-]{1,128}\$\//'
run "R5 regex 128 -> 256"                                   doc "$R" 's/\{1,128\}/{1,256}/'
run "R6 log'a tenantId yerine kullanıcı e-postası"          doc "$R" 's/\n      tenantId,\n/\n      tenantId,\n      user: session?.user?.email,\n/'
git status --short
