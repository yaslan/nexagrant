# TASK-MTQ2KL3JO4MK2: E11.3 ESR Calibration — Preflight Diagnostik (3. Geçiş)

**Ajan:** Backend Mühendisi (BE-EN)  
**Çalıştırılan:** 2026-09-10  
**Durum:** 🔴 **BLOKE** — 4 bloker; başı: insan aksiyonu (roster)  
**Rapor:** Preflight kapısı RED (çıkış kodu 1)

---

## Ne Yapıldı

**Durum ölçümü:** `pnpm beta:esr-preflight` (salt okunur kapı) çalıştırıldı.  
**Sonuç:** 4 bloker tespit edildi; bir zincir halinde kilitli.

### Bloker Zinciri

| # | Bloker | Neden | Bloke Tür | Bağımlı |
|---|--------|-------|-----------|---------|
| 1️⃣ | **roster** | 10/10 adres `.invalid`; `--send` reddediyor | **İNSAN AKSİYONU** | Başı |
| 2️⃣ | survey-sent | Roster yok → gönderim yapılamadı | Otomatik | #1 bloker durumunda geçilmez |
| 3️⃣ | responses | Partner verdictleri alınmadı (anket gönderilmediği için) | Otomatik | #2 bloker durumunda geçilmez |
| 4️⃣ | accuracy | %80 < %85 (provisional labels) | Otomatik | #3 bloker durumunda geçilmez |

**Mimari:** #1 çözüldüğünde zincirbağı çözülür; #2–4 otomatik açılır (ön koşul fark etmiş durumda).

### Ölçüm Detayları

- ✅ **Fixture:** 20/20 örnek DB'de (SAMPLE-* id'leri)
- ✅ **Sample set:** 20/20 ayrıştırılmış
- ❌ **Design-partner roster:** 10/10 adres `.invalid` domain (test data); gerçek e-postalar gerekli
- ❌ **Survey send:** Makine üzerinde gönderim makbuzu yok
- ❌ **Partner responses:** Sıfır verdicts; etiketler henüz provisional
- ❌ **Accuracy:** Rule A 80.0% (16/20) < 85% kriter

### Deadline Durumu (Açık Risk)

- **Target:** 2026-09-21 (11 gün kaldı)
- **Gerekli pencere:** Gönderim günü + 14 gün (ESR katılımı)
- **Hazırlık süresi:** ~1 gün (survey teknik render + test)
- **Sonuç:** Deadline zaten kaymış — yeniden çivileme gerekli (`ESR_SURVEY_DEADLINE` src/lib/beta/constants.ts'te)

---

## Kanıt

### Preflight Çıktısı (2026-09-10)

```
pnpm beta:esr-preflight

✅ Sample set parsed — 20/20 samples
✅ Fixture rows in the database — 20/20/20/20

❌ Design-partner roster is deliverable — 10/10 addresses sit on a reserved, undeliverable domain — --send refuses
      → HUMAN ACTION: supply the real design-partner addresses.
      → Keep them out of git: docs/BETA_DATA/beta-partners.local.csv (gitignored)

❌ Survey actually sent — no send receipt on this machine
      → After the roster is real, with explicit approval: pnpm beta:esr-calibration --roster=<real> --survey --send

❌ Partner verdicts ingested — no verdicts ingested — labels are still provisional

⚠️  Labels are ESR-confirmed — sample ids are the curated SAMPLE-* fixture; any accuracy below is provisional

❌ Accuracy ≥ 85% — rule A 80.0% < 85%

⚠️  Deadline is a real commitment — 2026-09-21 is only 11 day(s) away and nothing has been sent

❌ E11.3 BLOCKED — 4 blocker(s): roster, survey-sent, responses, accuracy
```

### Accuracy Durum (Provisional — Fixture Üzerinden)

- **Rule A** (composite ≥ 70 + hard rules): 80.0% (16/20)
  - Kriter: ≥85% — **KARŞILANMIYOR** ❌
- **Rule B** (PROJECT.md:75 literal): 90.0% (18/20)
  - Başarılı görünüyor, ama karar #8 Rule A'ya bağlıyor

**Not:** Bu oranlar kurate edilmiş fixture verisi (SAMPLE-* id'leri) üzerine — ESR anket yanıtları geldiğinde yeniden ölçülecek.

---

## Değişen Dosyalar

Yok (salt okunur ölçüm — preflight hiçbir durum değişmedi).

**Mevcut durum:** Fixture DB'de 20/20/20/20; anket sayfaları hazır (docs/BETA_DATA/generated/esr-calibration/survey/) fakat **gönderilmemiş** (roster eksik).

---

## Riskler

1. **Deadline Kayması:** 2026-09-21 artık geçerli bir son tarih değil. Anket gönderimi için min. 14 gün pencere şart. Hazırlık 1 gün + gönderim + yanıt süresi → yeniden çivileme zorunlu.
2. **Insan Aksiyonu Belirsizliği:** Roster (10 gerçek partner e-postu) kim sağlayacak, ne zaman? PM operasyonu — net süre ve sorumlu kişi bulunmadı.
3. **Mail Teslimatı Kanıtı:** Başka makine üzerinde `--send` yapılırsa, bu makine preflight'ının receipt'ı görmesi değildir → merkezi receipt yönetimi veya tek makine politikası gerekli.
4. **Provisional Accuracy:** Fixture doğruluğu 80% < 85% — kriter karşılanmadı. Gerçek ESR yanıtları geldiğinde ≥85% garantisi yok (ESR örnekleri farklı dağılımda olabilir).
5. **Rule A/B Uyuşmazlığı:** Açık karar #8 Rule A'ya bağlı (%85 kriter), ama B (%90) daha iyi görünüyor. Eşik değişim tekrar talep edilmemeli.

---

## Açık Sorular

1. **Roster Sorumluluğu:** Gerçek design-partner kayıtları kim üretecek, kim doğrulayacak? (PM? Partner Manager? Pazarlama?) Beklenen teslimat tarihi?
2. **Deadline Yeniden Çivileme:** ESR_SURVEY_DEADLINE gönderim günü + 14 gün olarak yeniden ayarlanacak mı? Patron onayı?
3. **Anket Gönderimi Onayı:** `pnpm beta:esr-calibration --roster=<real> --survey --send` kimden explicit onay alacak? (Patron? PM?)
4. **Mail Teslimatı:** Receipt merkezi mi (R2?) yoksa lokal? (`docs/BETA_DATA/generated/` gitignored) — başka makine çalıştırılırsa sorun.
5. **ESR Katılım Oranı:** 10 ortak × 4 örnek = 40 karar, kaçı "gerçek" kabul edilecek? (Minimum response rate?) — Fixture 20/20 karardan tamamıydı, gerçek katılım tahmini?

---

## Sonraki Adımlar (Zincir Sırası)

### 1️⃣ İnsan Aksiyonu: Roster Sağla
```
Kimin: PM / Partner Manager  
Ne: 10 gerçek design-partner adı + e-posta (test değil)  
Nereye: docs/BETA_DATA/beta-partners.local.csv (gitignore'deki) veya /secure/path/partners.csv  
Beklenti: ASAP (deadline basıyor)
```

### 2️⃣ Deadline Yeniden Çivile
Roster sağlandığında:
```bash
# src/lib/beta/constants.ts dosyasını düzenle
ESR_SURVEY_DEADLINE = TODAY + 14 gün  # (gönderim gününe göre güncelle)
```

### 3️⃣ Anket Gönder (Patron Onayı Gerekli)
Roster + deadline hazır olduğunda:
```bash
pnpm beta:esr-calibration --roster=/secure/path/partners.csv --survey --send
```
**Not:** `--send` geri alınamaz (canlı e-mail). Kimden explicit onay alacak?

### 4️⃣ Anket Yanıtlarını Topla (2026-09-21 + sonrası)
Ortak verdictleri:
```bash
docs/BETA_DATA/partner-responses.csv dosyası (merkezi veya local)
```

### 5️⃣ Accuracy Yeniden Ölçümü
Yanıtlar geldiğinde:
```bash
pnpm beta:esr-calibration \
  --responses=docs/BETA_DATA/partner-responses.csv \
  --apply
```
**Sonuç:** Doğruluk yeniden ölçülür, ≥85% kriter karşılanıp karşılanmadığı açığa çıkar.

---

## Kaydedilen Bilgi

Hafızaya yazılacak: E11.3 durumu BLOKE, 4 bloker zinciri — başı insan aksiyonu (roster eksik). Fixture 20/20 hazır, Rule A 80% (kriter ≥85% karşılanmıyor, provisional). Deadline 2026-09-21 zaten kaymış — yeniden çivileme gerekli.

---

## Rapor Özeti

**Durum:** 🔴 **BLOKE** (EXIT KOD 1)  
**Bloke Başı:** Roster (insan aksiyonu) — 10/10 adres `.invalid` domain'dedir, test verisi.  
**Çıkış Kriteri:** Roster → survey send → responses → accuracy ≥85%.  
**Fixture Accuracy (Provisional):** 80% (kriter karşılanmıyor).  
**Deadline:** 2026-09-21 kaymış — yeniden çivileme + patron onayı gerekli.  
**Bloke Kalınacak Süre:** Roster sağlanana kadar (kimin, ne zaman? belirsiz).
