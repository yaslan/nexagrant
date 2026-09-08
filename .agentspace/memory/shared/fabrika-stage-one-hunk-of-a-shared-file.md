---
name: fabrika-stage-one-hunk-of-a-shared-file
description: Paylaşılan bir dosyayı (messages/*.json) senden başka bir ajan da düzenlediyse `git add <yol>` onun işini de alır — hunk'ı `git apply --cached` ile izole et; `git add -p` bu ortamda interaktif olduğu için yok
metadata:
  type: project
  updatedAt: 2026-09-08
---

[[fabrika-agents-share-one-working-tree]] "yalnız kendi yollarını ver" diyor. **Yetmediği bir
durum var:** tek bir dosyada iki ajanın değişikliği yan yana duruyorsa, `git add <o dosya>`
ikisini birden stage eder.

**Belirti (TASK-MTS6MRKDP168Q).** `messages/tr.json`'da tek satır değiştirdim, ama:
```
$ git diff --stat -- messages/tr.json
 1 file changed, 19 insertions(+), 3 deletions(-)
```
Kalan 18 satır başka bir ajanın (`PartBEditor`, `savedSearches`, `NotFound` anahtarları).

**Çözüm.** `git add -p` bu ortamda interaktif olduğu için kullanılamaz. Diff'i hunk'lara böl,
seninkini seç, indexe uygula:

```bash
git diff -- messages/tr.json > /tmp/x.patch
python3 - <<'PY'
import re, io
t = io.open('/tmp/x.patch', encoding='utf-8').read()
head, *hunks = re.split(r'(?m)^(?=@@ )', t)
mine = [h for h in hunks if '"f3": "CORDIS tam veri' in h]   # kendi imzan
assert len(mine) == 1
io.open('/tmp/mine.patch','w',encoding='utf-8').write(head + mine[0])
PY
git apply --cached /tmp/mine.patch
```

**İkinci tuzak — index gerçekten paylaşımlı.** Açık yol vererek `git add` yaptıktan sonra bile
stage'de **hiç dokunmadığım** bir dosya çıktı (başka bir ajanın `LoginForm.tsx` silmesi, 248
satır). Bu yüzden commit'ten hemen önce **her seferinde**:

```bash
git diff --cached --name-only      # yabancı satır var mı?
git restore --staged <yabancı-yol> # varsa çıkar
```

Commit sonrası da doğrula: `git show HEAD -- <paylaşılan dosya>` yalnız senin satırlarını
göstermeli. İlgili: [[fabrika-concurrent-commit-steals-your-stage]].
