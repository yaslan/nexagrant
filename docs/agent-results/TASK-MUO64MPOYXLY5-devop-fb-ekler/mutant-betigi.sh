#!/bin/bash
cd "$(dirname "$0")/wt88"
R='src/app/api/concept-notes/[id]/export/route.ts'; H=src/lib/docx-safe-html.ts; C=src/lib/content-disposition.ts
T=("src/app/api/concept-notes/[id]/export/" src/lib/docx-safe-html src/lib/content-disposition)
run(){ # name file perl-expr
  local name=$1 f=$2 e=$3
  cp "$f" /tmp/devopfb88.bak 2>/dev/null || cp "$f" "$f.devopfb88bak"
  perl -0pi -e "$e" "$f"
  if git diff --quiet -- "$f"; then echo "$name => MUTATION NOT APPLIED"; git checkout -q -- "$f"; return; fi
  out=$(DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:55888/fabrika pnpm exec vitest run "${T[@]}" 2>&1)
  sum=$(echo "$out" | grep -E "^ +Tests " | tr -s ' ')
  if echo "$sum" | grep -q failed; then echo "$name => KILLED ($sum)"; else echo "$name => SURVIVED ($sum)"; fi
  git checkout -q -- "$f"
}
base=$(DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:55888/fabrika pnpm exec vitest run "${T[@]}" 2>&1 | grep -E "^ +Tests " | tr -s ' '); echo "BASE => $base"
run "D1 labelKey ham"                 "$R" 's/escapeHtmlText\(section\.labelKey\)/section.labelKey/'
run "D2 bütçe bölüm-başı (yeni obje)"  "$R" 's/sanitizeHtmlForDocx\(body, imageBudget\)/sanitizeHtmlForDocx(body, { remaining: MAX_TOTAL_IMAGE_BYTES })/'
run "D3 bütçe varsayılan param"        "$R" 's/sanitizeHtmlForDocx\(body, imageBudget\)/sanitizeHtmlForDocx(body)/'
run "D4 bütçe sınırı > yerine >="      "$H" 's/bytes\.length > budget\.remaining/bytes.length >= budget.remaining/'
run "D5 bütçe düşülmüyor"              "$H" 's/budget\.remaining -= bytes\.length;//'
run "D6 retry yok"                     "$R" 's/\} catch \(error\) \{.*?fileBuffer = await toDocx\(buildHtml\(\{ remaining: 0 \}\)\);/} catch (error) { throw error;/s'
run "D7 retry görselli (bütçe 0 değil)" "$R" 's/buildHtml\(\{ remaining: 0 \}\)/buildHtml({ remaining: MAX_TOTAL_IMAGE_BYTES })/'
run "D8 2. hata yutulur"               "$R" 's/fileBuffer = await toDocx\(buildHtml\(\{ remaining: 0 \}\)\);/fileBuffer = await toDocx(buildHtml({ remaining: 0 })).catch(() => Buffer.alloc(0));/'
run "D9 warn'da hata mesajı yok"        "$R" "s/console\.warn\('\[concept-note export\] retrying without images:', error instanceof Error \? error\.message : error\);/console.warn('x');/"
run "D10 warn tamamen yok"             "$R" "s/console\.warn\('\[concept-note export\] retrying without images:', error instanceof Error \? error\.message : error\);//"
run "D11 Cc temizliği yok"             "$C" 's/\\p\{Cc\}//'
run "D12 tırnak temizliği yok"         "$C" 's/\\\\\/:\*\?"<>\|\]/\\\\\/:*?<>|]/'
run "D13 toWellFormed yok"             "$C" 's/baseName\.toWellFormed\(\)/baseName/'
run "D14 ascii yedekte harf-rakam kapısı yok" "$C" 's/\/\[A-Za-z0-9\]\/\.test\(asciiBase\)/asciiBase.length > 0/'
run "D15 JPEG SOF sınırı i+9 -> i+5"   "$H" 's/return i \+ 9 <= buffer\.length/return i + 5 <= buffer.length/'
run "D16 Exif blok <16 -> <14"         "$H" 's/if \(block\.length < 16\) return false;/if (block.length < 14) return false;/'
run "D17 GIF >=10 -> >=6"              "$H" 's/bytes\.length >= 10/bytes.length >= 6/'
run "D18 PNG >=24 -> >=16"             "$H" 's/bytes\.length >= 24/bytes.length >= 16/'
run "D19 Exif entry.length<10 -> <8"   "$H" 's/return entry\.length >= 10;/return entry.length >= 8;/'
run "D20 JPEG i>length kontrolü yok"   "$H" 's/if \(i > buffer\.length \|\| buffer\[i\] !== 0xff\) return false;/if (buffer[i] !== 0xff) return false;/'
run "D21 120 sınırı 1200"              "$C" 's/MAX_NAME_CODE_POINTS = 120/MAX_NAME_CODE_POINTS = 1200/'
run "D22 başlık ham opportunity.title" "$R" "s/attachmentContentDisposition\(opportunity\?\.title \?\? '', '\.docx', 'ConceptNote'\)/\\\`attachment; filename=\"\\\${opportunity?.title}.docx\"\\\`/"
