# TASK-MTQ2KL3JO4MK2 (5. geçiş) — bloke kalkınca çalışacak ADIM, sessizce yanlış cevap veriyordu

**Ajan:** DEV-EN (DevOps) · **Tarih:** 2026-09-08 · **Branch:** dev
**Durum:** Görev hâlâ BLOKE (insan aksiyonu: gerçek design-partner roster'ı). Bu geçiş blokeyi
çözmez — **kriteri yanlışlıkla YEŞİL kapatacak olan yolu** kapatır.

---

## 1. Ne yapıldı

Önceki geçişler blokeyi ölçülebilir yaptı (2.), yanlış bir kapanış yolunu (rule B) kapattı (3.),
ve `--send`'i tekrar koşulabilir yaptı (4.). Bu geçişte zincirin **son halkasını** denetledim:
partner yanıtlarının içeri alınması (`--responses`). Orada, kriteri hak etmeden kapatabilecek
bir **sessiz yeşil** buldum.

### 1.1 Anlaşılmayan bir oy sessizce KAYBOLUYORDU

`applyResponses` her oyu örnek setinde `.find` ile arıyordu. Eşleşmeyen bir satır — sayfada `S01`
yazarken `S1` diye deşifre edilmiş bir id, ya da roster'da hiç olmayan birinden gelen bir satır —
**hiçbir etiketi değiştirmiyor, hiçbir uyarı üretmiyor, ama "N verdict" sayısına dahil oluyordu.**
Kapının `responses` kontrolü de yalnız o sayıya bakıyordu.

Sonuç ölçüldü: **beş çöp satır blokeyi 4'ten 3'e düşürdü** (§2.1). Kimse yalan söylemedi; kapı
"verdicts ingested ✅" dedi ve altındaki accuracy satırı hâlâ *geçici* etiketlerle hesaplanıyordu.

Artık bir yanıt dosyası ya **tamamen anlaşılır** ya da **reddedilir** (`ResponseFileRefused`).
Reddedilen dosyadan hiçbir etiket oynamaz; sebeplerin tamamı hem CLI'da hem kapının metninde yazar.

Yakalanan üç sınıf:
| Durum | Eskiden | Şimdi |
|---|---|---|
| Bilinmeyen `sampleId` (deşifre hatası) | sessizce düşerdi, sayıya dahil | reddedilir, id'siyle raporlanır |
| Roster'da olmayan `partnerSlug` | oy sayılırdı | reddedilir (roster yoksa kontrol atlanır) |
| Aynı ortak, aynı örnek, **farklı** iki cevap | ikisi de oy sayardı → çoğunluk kayardı | reddedilir; hangisinin düzeltme olduğu operatörün bilgisi, tahmin edilmez |
| Aynı ortak, aynı örnek, **aynı** cevap (tekrar gönderilmiş sayfa) | iki oy | tek oya indirgenir, loglanır |

Son satır bir idempotans meselesi: tekrar gönderilmiş bir sayfa iki kez sayıldığında o ortağın
ağırlığı ikiye katlanıyor ve tek başına çoğunluk taşıyabiliyordu.

### 1.2 "N verdict" bir SAYIydı, KAPSAM değil

İkinci sessiz yeşil: kontrol `responseCount >= 1` ile yeşile dönüyordu. Üç örneği kapsayan temiz
bir dosya bile — 17 etiket hâlâ geçiciyken — "Partner verdicts ingested ✅" diyordu, ve hemen
altındaki accuracy satırı o 17 geçici etikete karşı ölçülüyordu.

Kontrol artık **çoğunlukla teyit edilmiş örnek sayısına** bakıyor: `20/20` olmadan yeşile dönmez.
Berabere kalan bir örnek de teyit sayılmaz (çoğunluk yok) — ve kapı bunu ayrıca söylüyor.

---

## 2. Kanıt (gerçek komut çıktısı)

### 2.1 ÖNCESİ — beş çöp satır blokeyi 4'ten 3'e düşürüyor
Dosya (biri deşifre hatası, biri yabancı, ikisi çelişen tekrar):
```csv
partnerSlug,sampleId,agrees,verdict,comment
beta-anadolu-teknoloji,S1,false,GO,typo: S1 instead of S01
beta-ege-arge,S02,true,,
someone-not-on-the-roster,S02,false,NO_GO,outsider row
beta-ege-arge,S03,false,GO,first sheet
beta-ege-arge,S03,false,NO_GO,corrected sheet - the real answer
```
```
$ npx tsx scripts/esr-calibration.ts --preflight --responses=<yukarıdaki>
  [responses] 5 verdicts, 0 label(s) changed
✅ Partner verdicts ingested — 5 verdicts                    ← YEŞİL
❌ E11.3 BLOCKED — 3 blocker(s): roster, survey-sent, accuracy
```
`0 label(s) changed` satırı tek ipucuydu ve kapı ona bakmıyordu.

### 2.2 SONRASI — aynı dosya, aynı komut
```
$ npx tsx scripts/esr-calibration.ts --preflight --responses=<aynı dosya>
❌ Partner verdicts ingested — the response file was refused, nothing was folded in —
   1 verdict(s) name a sampleId that is not in the sample set: S1 — fix the transcription; a verdict
   that matches nothing is lost ground truth, not a blank row ·
   1 verdict(s) come from a partnerSlug that is not on the roster: someone-not-on-the-roster —
   either the slug is mistyped or the answers are not from a design partner ·
   beta-ege-arge answered S03 twice with different verdicts (disagrees/GO then disagrees/NO_GO) —
   remove the superseded row
      → Run pnpm beta:esr-calibration --responses=<file> to see every problem, fix the file, and
        re-run. Nothing was folded in.
❌ E11.3 BLOCKED — 4 blocker(s): roster, survey-sent, responses, accuracy — one chain, head: roster
```
Bloke sayısı 4'e geri döndü. Üç sorunun **üçü birden** adıyla raporlandı.

### 2.3 Yazan komutta da aynı: rapor üretilmeden durur
```
$ npx tsx scripts/esr-calibration.ts --responses=<aynı dosya>
  [samples] 20 parsed — CURATED FIXTURE (SAMPLE-* ids)
❌ --responses refused: <dosya> cannot be folded in as it stands.
   • 1 verdict(s) name a sampleId that is not in the sample set: S1 — …
   • 1 verdict(s) come from a partnerSlug that is not on the roster: someone-not-on-the-roster — …
   • beta-ege-arge answered S03 twice with different verdicts (disagrees/GO then disagrees/NO_GO) — …
```
`[score]`/`[report]` satırlarına hiç gelmedi: `docs/CORDIS-SAMPLE-CALIBRATION.md` yazılmadı,
DB'ye dokunulmadı (`git status` temiz kaldı).

### 2.4 TEMİZ ama KISMİ dosya — sayı değil kapsam ölçülüyor
```
$ npx tsx scripts/esr-calibration.ts --preflight --responses=<3 örnek × 2 ortak = 6 satır>
  [responses] 6 verdicts, 3/20 sample(s) confirmed, 0 label(s) changed
❌ Partner verdicts ingested — 6 verdicts, but only 3/20 samples carry a confirmed majority —
   17 label(s) are still provisional, so the accuracy below is not measured against partner ground truth
      → Chase the partners who have not returned a worksheet, and check for ties: a sample split
        evenly confirms nothing and needs a third opinion.
```
(Eski kod bu dosyaya da `✅ 6 verdicts` derdi.)

### 2.5 TAM KAPSAM provası — bloke kalktığı gün ne olacak
20 örnek × 2 ortak = 40 temiz satır (hepsi `agrees=true`):
```
$ npx tsx scripts/esr-calibration.ts --preflight --responses=<40 satır>
  [responses] 40 verdicts, 20/20 sample(s) confirmed, 4 label(s) changed
✅ Partner verdicts ingested — 40 verdicts, 20/20 samples confirmed
✅ Accuracy ≥ 85% — rule A 100.0%
❌ E11.3 BLOCKED — 2 blocker(s): roster, survey-sent — one chain, head: roster (human action)
```
Hat uçtan uca çalışıyor: gerçek yanıtlar geldiğinde `responses` ve `accuracy` gerçekten kapanabiliyor,
geriye yalnız zincirin başı kalıyor. **Bu koşunun %100'ü bir başarı ölçümü DEĞİL** — sentetik
"hepsi katılıyor" dosyası, tanımı gereği skorlayıcıyı doğrular (bkz. Risk #2).

### 2.6 Yeni testler ESKİ kodda GERÇEKTEN kırmızı
```
$ git show HEAD:src/lib/beta/esr-{survey,readiness}.ts > <yerine> && npx vitest run tests/esr-calibration.test.ts
 × a verdict naming an unknown sample is a problem, not a silent drop        TypeError: reconcileResponses is not a function
 × a verdict from someone not on the roster is a problem                     TypeError: …
 × the same partner answering one sample two different ways is refused, not guessed
 × an identical repeat collapses to one vote instead of voting twice
 × verdicts covering part of the sample set keep the check blocked           AssertionError: expected 'ok' to be 'blocked'
 × full coverage passes and says so                                          AssertionError: expected '40 verdicts' to match /20\/20 samples confirmed/
 × a refused response file is reported as refused, never as an ingest        AssertionError: expected 'no verdicts ingested…' to match /refused/
      Tests  9 failed | 52 passed (61)

# düzeltme yerine konunca:
      Tests  61 passed (61)          # önce 52 idi: +9
```
Davranışsal kırmızının çekirdeği `expected 'ok' to be 'blocked'` satırı: eski kapı kısmi kapsamı
yeşil sayıyordu.

### 2.7 Ölçüm oynamadı (regresyon koruması)
```
$ npx tsx scripts/esr-calibration.ts          # yanıt dosyasız, kuru koşum
  [score] rule A (composite ≥ 70): accuracy 80.0%
  [score] rule B (spec literal, no composite): accuracy 90.0%
  [sweep] best threshold 54 → accuracy 95.0%
```
Üç sayı da 4. geçişle aynı. `docs/CORDIS-SAMPLE-CALIBRATION.md`'de tek fark üretim zaman damgasıydı,
onu da geri aldım (dosya commit'te değil).

### 2.8 Tip + lint + tam süit
```
$ npx tsc --noEmit -p tsconfig.json | grep esr      → çıktı yok
$ npx eslint scripts/esr-calibration.ts src/lib/beta/esr-{survey,readiness}.ts tests/esr-calibration.test.ts
  LINT EXIT=0
$ npx vitest run
 Test Files  121 passed | 2 skipped (123)
      Tests  1416 passed | 8 skipped (1424)
```
Ara koşumlarda görülen 3–4 kırmızı `src/lib/llm.generate.test.ts`'teydi — git'te **takipsiz** (`??`),
LLM birleştirme kartının (TASK-MTSXGXBCJ007W) o an yazılmakta olan dosyası; benim dosyalarıma
sıfır referansı var (`grep -c "esr\|beta/" → 0`) ve o ajan bitirince süit yeşile döndü.

### 2.9 Bugünkü kapı (yanıt dosyası olmadan) — değişmedi
```
$ pnpm beta:esr-preflight ; echo $?
❌ E11.3 BLOCKED — 4 blocker(s): roster, survey-sent, responses, accuracy — one chain, head: roster
1
```

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/beta/esr-survey.ts` | +`reconcileResponses` (saf): bilinmeyen örnek / roster dışı ortak / çelişen tekrar → `problems`; aynı cevabın tekrarı → `collapsed` |
| `scripts/esr-calibration.ts` | `applyResponses` reddediyor (`ResponseFileRefused`), teyit edilen örnekleri sayıyor; roster ingest'ten ÖNCE okunuyor (aynı okuma iki yerdeydi, teke indi); preflight reddi çökme değil **bloke** olarak raporluyor |
| `src/lib/beta/esr-readiness.ts` | `responses` kontrolü: reddedilen dosya + kapsam (`samplesWithVerdicts`/`sampleCount`) farkındalığı |
| `tests/esr-calibration.test.ts` | +9 test (52 → 61) |

Veritabanına yazma **yok**, mail **yok** (hiçbir koşumda `--send` kullanılmadı), sır/PII repoya
girmedi (test dosyaları yalnız scratchpad'de, gerçek adres içermiyor). `/settings/gates` ve
`docs/CORDIS-SAMPLE-CALIBRATION.md`'ye dokunulmadı.

---

## 4. Geri alma

```bash
git revert <bu-commit-sha>
```
Yan etki yok: DB'ye yazılmadı, mail atılmadı, makbuz üretilmedi. Geri alma ingest'i eski
**sessizce düşüren** haline döndürür — yani geri almak düzeltmeyi kaybetmektir; geri alınacaksa
yerine bir koruma konmalı.

**İzleme/uyarı:** değişmedi — `pnpm beta:esr-preflight` operatör komutu olarak kalıyor, `pnpm gate`'e
eklenmedi (DB'ye ve E11 operasyonuna bağlı; kapıyı sürekli kırardı). E11.3 açıkken kırmızı.

---

## 5. Riskler

1. **Bu geçiş de blokeyi çözmez.** Gerçek roster gelmeden E11.3 kapanmaz.
2. **"Katılıyorum" varsayılan cevaptır ve kriteri kendi başına üretebilir.** Ankette `agrees=true`,
   skorlayıcının dediğini gerçek etiket yapar; ilgisiz bir ortak sayfayı baştan sona `true`
   işaretlerse accuracy tanımı gereği %100'e gider (§2.5). Bu bir hata değil, anket tasarımının
   sonucu — ama kriterin nasıl kapandığına bakan biri bunu bilmeli. **Bir ölçüm politikası kararı
   gerektiriyor, kendi başıma değiştirmedim.**
3. **Çelişen tekrar satırı dosyanın TAMAMINI reddediyor.** Kasıtlı (hangisinin düzeltme olduğunu
   betik bilemez) ama operatör için sert: 40 satırlık dosyada tek çelişki her şeyi durdurur.
   Mesaj hangi satırların kaldırılacağını adıyla söylüyor.
4. Makbuz hâlâ makineye özel (4. geçişin risk #2'si) — kapı bunu söylüyor, teknik olarak çözmüyor.
5. `/settings/gates` etiket hatası hâlâ orada (sahibi **TASK-MTQ63RR8Z0G8E**) — kapsam dışı.

## 6. Açık sorular

1. **Gerçek design-partner roster'ı kim, ne zaman verecek?** (1. geçişten beri açık — **beşinci kez**
   soruyorum. Zincirin tek başı bu; kart bu cevap gelmeden kapanamaz.)
2. **Risk #2 bir karar istiyor:** kriter kapanırken "kaç ortak GERÇEKTEN itiraz etti" da raporlansın
   mı? (ör. hiç `agrees=false` içermeyen bir yanıt setinde accuracy'yi kabul kriteri saymamak.)
   Bugün böyle bir koruma yok; ölçüm politikası olduğu için patron/sprint sahibi kararı.
3. `ESR_SURVEY_DEADLINE = 2026-09-21` hâlâ tutulamaz durumda (4. geçiş kanıtladı) — sprint sahibi
   bunu bilerek mi taşıyor?

## 7. Sonraki adım

Roster geldiğinde, **açık onayla**:
```bash
pnpm beta:esr-preflight                                   # önce: neyin bloke olduğunu gör
# ESR_SURVEY_DEADLINE'ı gönderim günü + 14 olarak güncelle
pnpm tsx scripts/esr-calibration.ts --roster=/secure/path/partners.csv \
    --apply --survey --send --deadline=<gönderim+14>      # gerçek mail — geri alınamaz
# YARIDA KESİLİRSE: aynı komutu tekrar çalıştır (4. geçiş: devam eder, tekrarlamaz)
pnpm beta:esr-preflight                                   # "Survey actually sent" ✅ olmalı
cat docs/BETA_DATA/generated/esr-calibration/survey/*.responses.csv > /secure/path/responses.csv
pnpm tsx scripts/esr-calibration.ts --responses=/secure/path/responses.csv --apply
#   ↑ dosya reddedilirse HER sebep tek tek yazılır; düzelt ve tekrar koş (bu geçiş)
pnpm beta:esr-preflight                                   # kapanabiliyorsa çıkış kodu 0
```
Kart ancak bu komut **0** döndüğünde `done` işaretlenmeli. Kart bu geçişte de `in_progress` bırakıldı.
