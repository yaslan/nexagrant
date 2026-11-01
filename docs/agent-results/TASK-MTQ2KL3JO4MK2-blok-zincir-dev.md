# TASK-MTQ2KL3JO4MK2 — E11.3 ESR Calibration: blokenin gerçek sebebi + üretim hattı doğrulaması

**Ajan:** DEV-EN (DevOps) · **Tarih:** 2026-09-08 · **Branch:** dev
**Durum:** Görev hâlâ BLOKE — ama sebebi panoda yazan sebep değil. Bloke **kendiliğinden çözülmeyecek**, insan aksiyonu gerekiyor.

---

## 1. Ne yapıldı

Görev "2026-09-20/21'de anket yanıtlarını bekle" diye bloke duruyordu. Beklemenin kendisini doğruladım:
yanıt gelmesi için gereken zincir gerçekten kurulu mu? Değil.

1. **Fixture'ın DB'de canlı olduğunu doğruladım** (S10 rebuild'i bir kez silmişti) — 20/20/20/20 yerinde.
2. **Kalibrasyonu bugünkü kodla yeniden ölçtüm** — G0 hard-rule uyumlaştırmasından (`7a40d72`) sonra
   sayılar **değişmedi**: A %80, B %90. Kalibrasyon `g0-canonical` kurallarını doğrudan çağırıyor,
   `gates/evaluate.ts`'i değil; o yüzden kapıdaki düzeltme bu ölçüme yansımıyor. Kriter (≥%85) **hâlâ
   karşılanmıyor.**
3. **Anketin hiç gönderilmediğini ve gönderilemeyeceğini kanıtladım** — roster'daki 10 adresin 10'u
   `@example.invalid`. `--send` bunu reddediyor (tasarım gereği). Yani **2026-09-21'e kadar yanıt
   gelmesi imkânsız**; bekleme boşa işliyor.
4. **`--responses=` yolunu uçtan uca kanıtladım** (self-test) — yanıtlar geldiğinde hattın çalıştığı
   belli, 21'inde sürpriz çıkmayacak.
5. **İki gerçek kusuru düzelttim** (aşağıda) — biri üretilmiş raporun yalan yeşili, biri idempotency.

---

## 2. Kanıt (gerçek komut çıktısı)

### 2.1 Fixture DB'de duruyor
```
{ "tenant": "esr-calibration", "opportunities": 20, "proposals": 20,
  "gateDecisions": 20, "cordisSamples": 20 }
```

### 2.2 Bugünkü kodla ölçüm — kriter karşılanmıyor
```
$ pnpm beta:esr-calibration
  [samples] 20 parsed — CURATED FIXTURE (SAMPLE-* ids)
  [score] rule A (composite ≥ 70): accuracy 80.0%
  [score] rule B (spec literal, no composite): accuracy 90.0%
  [sweep] best threshold 54 → accuracy 95.0%
  [db] dry run — nothing written. Re-run with --apply to seed.
```

### 2.3 Anket gönderilemiyor — asıl bloke bu
```
$ pnpm tsx scripts/esr-calibration.ts --survey --send --out=<scratch> --report=<scratch>/R.md
❌ --send refused: 10 roster address(es) are on a reserved, undeliverable domain
   (partner01@example.invalid, … partner10@example.invalid).
   Replace the roster with real partners first.
```
`docs/BETA_DATA/beta-partners.csv` başlığı zaten "STATUS: PLACEHOLDER" diyor. Yani **anket hiçbir
ortağa ulaşmadı**; sadece `docs/BETA_DATA/generated/esr-calibration/survey/` altına HTML/TXT/CSV
render edildi.

### 2.4 `--responses=` hattı çalışıyor (SELF-TEST — bulgu DEĞİL)
```
$ pnpm tsx scripts/esr-calibration.ts --responses=docs/BETA_DATA/esr-survey-responses.example.csv \
    --out=<scratch> --report=<scratch>/R.md
  [responses] 8 verdicts, 1 label(s) changed
  [score] rule A (composite ≥ 70): accuracy 85.0%
  [score] rule B (spec literal, no composite): accuracy 95.0%
```
⚠️ Bu %85 **kriterin karşılandığı anlamına GELMEZ.** Girdi dosyası örnek/harness dosyası; başlığında
"NOT design-partner answers … Any accuracy printed from this file is a self-test, not a finding"
yazıyor. Ölçülen tek şey: yanıt yutma → çoğunluk toplama → yeniden etiketleme → yeniden ölçüm
zincirinin çalıştığı. Gerçek yanıtlar geldiğinde aynı komut gerçek sayıyı üretecek.

### 2.5 Düzeltme 1 — üretilmiş raporun yalan yeşili
`docs/CORDIS-SAMPLE-CALIBRATION.md` §8 kabul tablosu, anket **gönderilmediği hâlde** yeşil işaret
koyuyordu (kriterin adı "gönderilmiş", ölçtüğü şey "render edilmiş"):
```diff
-| Ortak anketi gönderilmiş | ✅ hazırlandı |
+| Ortak anketi gönderilmiş | ❌ GÖNDERİLMEDİ — roster'daki 10 adres teslim edilemez alan adında
+  (`.invalid`); `--send` reddediyor. Gerçek roster girilmeden yanıt gelmez. |
```

### 2.6 Düzeltme 2 — kayan son tarih (idempotency)
`--deadline` varsayılanı "bugünden iki hafta" idi ve rapor her koşuda yeniden üretiliyor. Sonuç:
commit'li anket sayfaları **2026-09-21**, 08 Eylül'de yeniden üretilen rapor **2026-09-22** diyordu —
aynı programda iki farklı tarih. Tarih artık `ESR_SURVEY_DEADLINE` sabitinde; `--deadline=` ile
tek seferlik geçersiz kılınabiliyor.

Arka arkaya iki koşu, tek fark üretim damgası (yani çıktı artık idempotent):
```
$ diff run1.md docs/CORDIS-SAMPLE-CALIBRATION.md
4c4
< > Üretim zamanı: 2026-09-08T16:47:47.002Z · Kural sürümü: g0-canonical-1.0 …
> > Üretim zamanı: 2026-09-08T16:47:55.997Z · Kural sürümü: g0-canonical-1.0 …
```

### 2.7 Kapı
```
$ pnpm typecheck
$ tsc --noEmit                      → temiz (çıktı yok)

$ npx vitest run tests/esr-calibration.test.ts
 Test Files  1 passed (1)
      Tests  31 passed (31)

$ npx eslint scripts/esr-calibration.ts src/lib/beta/constants.ts   → temiz (çıktı yok)
```
DB doğrulaması: tüm koşular `--apply` **olmadan** yapıldı; fixture sayıları koşulardan sonra da
20/20/20/20.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/beta/constants.ts` | `ESR_SURVEY_DEADLINE = '2026-09-21'` — sabitlenmiş son tarih + gerekçe |
| `scripts/esr-calibration.ts` | varsayılan son tarih sabitten okunuyor; §8 kabul satırı gerçek teslim durumunu (`surveySent`, `undeliverable`) yansıtıyor |
| `docs/CORDIS-SAMPLE-CALIBRATION.md` | üretilmiş dosya — yukarıdaki iki düzeltmeyle yeniden üretildi |

Veritabanına yazma **yok**.

---

## 4. Geri alma

```bash
# Kod + üretilmiş rapor (bu commit'in tamamı):
git revert <bu-commit-sha>
pnpm tsx scripts/esr-calibration.ts     # raporu eski script'ten yeniden üret

# Fixture'ı da kaldırmak gerekirse (bu görevde GEREKMEDİ, DB'ye dokunulmadı):
pnpm tsx scripts/esr-calibration.ts --rollback --apply
# yalnız `esr-calibration` kiracısını ve `SAMPLE-*` id alanını siler
```

---

## 5. Riskler

1. **Bekleme boşa işliyor.** Roster placeholder kaldığı sürece 2026-09-21'de de elde veri olmayacak.
   Gerçek roster girilmeden gün saymanın anlamı yok.
2. **Kriter fixture üzerinden kapatılamaz.** A %80 < %85. B %90 ama A/B farkı Açık Karar #8'e bağlı;
   eşiği 54'e çekmek n=20'de overfit (Wilson aralığı çok geniş).
3. **PII sınırı.** Gerçek ortak adresleri bu repoya **girmemeli**; `beta-partners.local.csv`
   (gitignore'lu) ya da repo dışı bir yol + `--roster=` kullanılmalı.
4. Roster gerçek adreslerle doldurulduğunda `--send` artık reddetmeyecek — o koşu **gerçekten
   e-posta gönderir**, geri alınamaz. Açık onayla yapılmalı.

---

## 6. Açık sorular (insan kararı gerekiyor)

1. **Gerçek design-partner roster'ı kim, ne zaman verecek?** Bu cevaplanmadan E11.3 kapanamaz.
2. **Son tarih 2026-09-21 sabit mi kalsın?** Anket henüz gönderilmediğine göre, gönderim gününden
   +14 gün olarak yeniden belirlenmesi daha dürüst olur — karar verilince `ESR_SURVEY_DEADLINE`
   güncellenir.
3. **Açık Karar #8** (A mı B mi) kapanmadan eşik değiştirilmemeli — kim kapatacak?

---

## 7. Sonraki adım

Roster hazır olduğunda, **açık onayla**:

```bash
# 1) Gerçek roster'ı repo DIŞINDA tut
pnpm tsx scripts/esr-calibration.ts --roster=/secure/path/partners.csv \
    --apply --survey --send --deadline=<gönderim+14>

# 2) Yanıtlar döndüğünde: partner sayfalarını birleştir ve yut
#    (panodaki `docs/BETA_DATA/partner-responses.csv` yolu YANLIŞ — böyle bir dosya yok;
#     gerçek şablonlar: docs/BETA_DATA/generated/esr-calibration/survey/<slug>.responses.csv)
cat docs/BETA_DATA/generated/esr-calibration/survey/*.responses.csv > /secure/path/responses.csv
pnpm tsx scripts/esr-calibration.ts --responses=/secure/path/responses.csv --apply
```
