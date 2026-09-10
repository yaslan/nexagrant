---
name: fabrika-stage-one-hunk-of-a-shared-file
description: Paylaşılan bir dosyayı (messages/*.json) senden başka bir ajan da düzenlediyse `git add <yol>` onun işini de alır — hunk'ı `git apply --cached` ile izole et; `git add -p` bu ortamda interaktif olduğu için yok
metadata:
  type: project
  updatedAt: 2026-09-09
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

**Üçüncü tuzak — `--check` hiçbir şey stage etmez (TASK-MTUH6YKP6OQAX, 2026-09-09).**
`git apply --cached --check patch.diff` "OK" der ve sessizce çıkar — ama index'e HİÇBİR ŞEY
yazmaz, sadece patch'in uygulanabilir olduğunu doğrular. Ardından `git diff --cached --stat`
boş görünür ve "hiçbir şey stage olmadı" sanılabilir. Doğrusu: önce `--check` ile doğrula,
SONRA aynı patch'i `--check` OLMADAN tekrar çalıştır (`git apply --cached patch.diff`) — ancak
o zaman gerçekten stage eder. İki adım da gerekli, biri diğerinin yerine geçmez.

**Dördüncü tuzak — süpürme SESSİZDİR, izi commit'in İKİNCİ kopyasıdır (TASK-MTSWLANXSU0IG,
2026-09-10).** A3 worker'ı işini commit'ledi (`5dce7ec`), sonra fark edip aynı başlıkla
YENİDEN commit'ledi (`6895709`). Lider gözünden görünen tek sinyal buydu: **aynı özet
satırını taşıyan ikinci bir commit, ve `git log`'da birincisinin kaybolması.**

```
git diff 5dce7ec 6895709 --stat
 messages/en.json | 40 +---------------------------------------
 messages/tr.json | 40 +---------------------------------------
```

Düşen 80 satır A3'ün kendi anahtarları DEĞİLDİ: `cookieConsent.*` (o sırada çalışan çerez
banner'ı kartının işi) ve `identityBadge`/`identityFieldVknTckn`/… (ölmüş bir worker'ın
ağaçta bıraktığı fatura-kimliği kartının işi). Yani ilk commit iki komşunun commit'siz
işini birden süpürmüştü; worker kendi kendini düzeltti.

**Lider tarafı — nasıl ayırt edilir.** Aynı başlıklı ikinci commit gördüğünde soru
"neden iki kez commit'ledi" değil, **"düşen satırlar KİMİN"**:
```bash
git diff <ilk> <ikinci> -- <paylaşılan dosya> | grep '^-' | head -20
```
Düşenler o kartın konusuyla ilgisizse (burada çerez ve fatura anahtarları, rıza kartında)
düzeltme DOĞRUdur. Sonra tek kritik kontrol — komşunun işi geri verildi mi, yoksa silindi mi:
```bash
grep -c '"<komsunun-anahtari>"' <paylaşılan dosya>   # çalışma ağacında HÂLÂ olmalı
git status --porcelain <paylaşılan dosya>            # M kalmalı, temiz DEĞİL
```
`git reset --soft` + dar `git add` ile düzeltilmişse komşunun satırları ağaçta durur;
`git checkout --` ile "düzeltilmişse" komşunun işi YOK OLMUŞTUR ve bunu yalnız bu grep söyler.
