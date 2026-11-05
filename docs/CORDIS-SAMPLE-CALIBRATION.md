# CORDIS örnek seti — G0 ↔ ESR kalibrasyonu

> Üretilmiş dosya. Elle düzenlemeyin; `pnpm tsx scripts/esr-calibration.ts` yeniden üretir.
> Üretim zamanı: 2026-09-10T14:51:36.984Z · Kural sürümü: `g0-canonical-1.0` · Örnek seti: `docs/BETA_DATA/esr-calibration-samples.csv`

> ⚠️ **Bu koşu KÜRATE EDİLMİŞ bir fixture üzerinde yapıldı** (tüm `cordisProjectId` değerleri rezerve
> `SAMPLE-*` ad alanında). Buradaki doğruluk oranı **kalibrasyon hattının** çalıştığını gösterir;
> modelin gerçek dünyadaki doğruluğunu **göstermez**. Gerçek sayı, beta tasarım ortaklarının kendi
> ESR'leri geldiğinde `--samples=` ile bu dosyanın yerine konarak üretilir.

## 1. Ne ölçülüyor

G0 triyaj kapısının kararı ile teklifin gerçek değerlendirme sonucu karşılaştırılıyor.

- **Pozitif sınıf = GO** ("bu fırsatın peşinden gidilir"). Sekiz haftalık emeği harcatan karar bu.
- **Gerçek etiket**: ESR sonucu `funded | reserve | above_threshold` → GO; `below | ineligible` → NO_GO.
- **Yanlış pozitif (FP)** = boşa harcanan emek. **Yanlış negatif (FN)** = kaçırılan hibe. Maliyetleri
  simetrik değil; eşik seçimi bu asimetriyi bilerek yapılmalı.

Puanlama PROJECT.md:81'deki ağırlıklarla (toplam 100):
`alignment`=30 · `baseRate`=15 · `coordinatorHistory`=15 · `researchAndEndUser`=12 · `networkCentrality`=10 · `budgetRoleEconomy`=10 · `lumpSumTwoStage`=8

## 2. Örnek başına sonuç (n=20)

| Örnek | Kısaltma | G0 skoru | Uyum | Taban oran | Karar (A) | Karar (B) | Gerçek | ESR | Sonuç | ✓ |
|---|---|---:|---:|---:|---|---|---|---|---|:-:|
| S01 | DISTRENOV | 76.50 | 88 | 14% | GO | GO | GO | 13.5/10 | funded | ✅ |
| S02 | DIGITWIN | 71.50 | 84 | 11% | GO | GO | GO | 12.5/10 | funded | ✅ |
| S03 | AGRISENSE | 79.30 | 92 | 18% | GO | GO | GO | 14/10 | funded | ✅ |
| S04 | CULTHER | 64.60 | 79 | 9% | NO_GO | GO | GO | 11/10 | above_threshold | ❌ |
| S05 | CLIMANEUT | 77.20 | 86 | 22% | GO | GO | GO | 12/10 | funded | ✅ |
| S06 | SMERAD | 79.00 | 81 | 25% | GO | GO | GO | 13/10 | funded | ✅ |
| S07 | BATTREC | 59.55 | 76 | 12% | NO_GO | GO | GO | 10.5/10 | reserve | ❌ |
| S08 | GRIDFLEX | 81.51 | 90 | 16% | GO | GO | GO | 13.5/10 | funded | ✅ |
| S09 | DOCNET | 70.60 | 83 | 10% | GO | GO | GO | 88/80 | funded | ✅ |
| S10 | HEALTHEQ | 54.53 | 74 | 8.5% | NO_GO | GO | GO | 10/10 | above_threshold | ❌ |
| S11 | SOLIDBAT | 74.39 | 87 | 13% | GO | GO | GO | 12.5/10 | funded | ✅ |
| S12 | GEOHEAT | 73.41 | 80 | 20% | GO | GO | GO | 11.5/10 | funded | ✅ |
| S13 | VAGUEAI | 35.65 | 52 | 7% | NO_GO | NO_GO | NO_GO | 7.5/10 | below | ✅ |
| S14 | HYDROPT | 48.25 | 68 | 11% | NO_GO | NO_GO | NO_GO | 8.5/10 | below | ✅ |
| S15 | SOCINN | 46.80 | 71 | 9% | NO_GO | GO | NO_GO | 9/10 | below | ✅ |
| S16 | QUANTLINK | 79.55 | 89 | 15% | NO_GO | NO_GO | NO_GO | — | ineligible | ✅ |
| S17 | SMARTPARK | 40.65 | 63 | 10% | NO_GO | NO_GO | NO_GO | 7/10 | below | ✅ |
| S18 | SCALEUP | 46.25 | 77 | 5% | NO_GO | NO_GO | NO_GO | — | below | ✅ |
| S19 | NETSUPP | 74.90 | 72 | 26% | GO | GO | NO_GO | 9.5/10 | below | ❌ |
| S20 | BIOPACK | 50.01 | 66 | 12% | NO_GO | NO_GO | NO_GO | 8/10 | below | ✅ |

**A** = uygulanan kural: bileşik skor ≥ 70 **ve** uyum ≥ 70 **ve** taban oran ≥ %8 **ve** ülke uygun.
**B** = PROJECT.md:75'in düz okunuşu: bileşik skor eşiği **yok**; yalnız uyum ≥ 70, taban oran ≥ %8, ülke uygun.

## 3. Karışıklık matrisi

### 3.1 A — bugün uygulanan kural (`DEFAULT_GATE_RULES.G0`)

| | Gerçek: GO | Gerçek: NO_GO |
|---|---:|---:|
| **Tahmin: GO** | 9 (TP) | 1 (FP) |
| **Tahmin: NO_GO** | 3 (FN) | 7 (TN) |

- **Doğruluk (accuracy):** 80.0% (Wilson %95 GA: 58.4% – 91.9%)
- **Kesinlik (precision, GO dediklerimizin doğruluğu):** 90.0%
- **Duyarlılık (recall, kaçırmadıklarımız):** 75.0%
- **F1:** 81.8%

### 3.2 B — PROJECT.md:75 düz okunuşu

| | Gerçek: GO | Gerçek: NO_GO |
|---|---:|---:|
| **Tahmin: GO** | 12 (TP) | 2 (FP) |
| **Tahmin: NO_GO** | 0 (FN) | 6 (TN) |

- **Doğruluk (accuracy):** 90.0% (Wilson %95 GA: 69.9% – 97.2%)
- **Kesinlik (precision, GO dediklerimizin doğruluğu):** 85.7%
- **Duyarlılık (recall, kaçırmadıklarımız):** 100.0%
- **F1:** 92.3%

## 4. Eşik taraması

Yalnız bileşik skor eşiği değiştirildi; üç sert kural (uyum, taban oran, ülke) sabit tutuldu.

| Eşik | TP | FP | TN | FN | Doğruluk |
|---:|---:|---:|---:|---:|---:|
| 40 | 12 | 2 | 6 | 0 | 90.0% |
| 42 | 12 | 2 | 6 | 0 | 90.0% |
| 44 | 12 | 2 | 6 | 0 | 90.0% |
| 46 | 12 | 2 | 6 | 0 | 90.0% |
| 48 | 12 | 1 | 7 | 0 | 95.0% |
| 50 | 12 | 1 | 7 | 0 | 95.0% |
| 52 | 12 | 1 | 7 | 0 | 95.0% |
| 54 | 12 | 1 | 7 | 0 | 95.0% |
| 56 | 11 | 1 | 7 | 1 | 90.0% |
| 58 | 11 | 1 | 7 | 1 | 90.0% |
| 60 | 10 | 1 | 7 | 2 | 85.0% |
| 62 | 10 | 1 | 7 | 2 | 85.0% |
| 64 | 10 | 1 | 7 | 2 | 85.0% |
| 66 | 9 | 1 | 7 | 3 | 80.0% |
| 68 | 9 | 1 | 7 | 3 | 80.0% |
| 70 | 9 | 1 | 7 | 3 | 80.0% |
| 72 | 7 | 1 | 7 | 5 | 70.0% |
| 74 | 6 | 1 | 7 | 6 | 65.0% |
| 76 | 5 | 0 | 8 | 7 | 65.0% |
| 78 | 3 | 0 | 8 | 9 | 55.0% |
| 80 | 1 | 0 | 8 | 11 | 45.0% |
| 82 | 0 | 0 | 8 | 12 | 40.0% |
| 84 | 0 | 0 | 8 | 12 | 40.0% |
| 86 | 0 | 0 | 8 | 12 | 40.0% |
| 88 | 0 | 0 | 8 | 12 | 40.0% |
| 90 | 0 | 0 | 8 | 12 | 40.0% |

**Bu örnek setinde en yüksek doğruluk: eşik 54 → 95.0%.**

## 5. Öneri

Bu koşuda hata dağılımı **kaçırma yönünde**: 3 yanlış negatif (kaçırılan hibe) karşısında 1 yanlış pozitif (boşa emek). Bileşik eşik 70 olduğu gibi bırakılırsa eşiği geçen tekliflerin bir kısmı hiç denenmeden eleniyor.

Tarama en yüksek doğruluğu eşik **54**'te veriyor (95.0%). Ancak n=20 için Wilson aralığı çok geniş; eşiği tek hamlede 70'ten 54'e çekmek bu örnek setine aşırı uyum (overfit) olur.

**Önerilen tasarım — üç bant, tek eşik yerine:**
- `GO` : bileşik skor ≥ 70 (bugünkü davranış korunur)
- `İNCELE` : 54 ≤ skor < 70 — otomatik eleme yok, insan kararı ister
- `NO_GO` : skor < 54 ya da herhangi bir sert kural düşmüş

Bu setde inceleme bandına 3 örnek düşüyor (S04, S07, S10); bunların 3 tanesi gerçekte eşiği geçmiş tekliflerdi, yani bugün sessizce kaybediliyorlar.

Kalan yanlış pozitif eşik meselesi değil: **S19 NETSUPP** (skor 74.90, taban oran %26). Yüksek taban oranlı çağrı tipleri bileşik skoru şişiriyor; `baseRate` ağırlığının çağrı tipine göre sınırlandırılması ayrı bir iş olarak açılmalı.

**Karar KAPANDI (2026-09-06, patron onayı — docs/ROADMAP.md · Açık kararlar #8):** eşik **bileşik skora** uygulanır; kapı kuralı **A**'dır (`DEFAULT_G0_RULES`). **B kapıda kullanılmaz, yalnız karşılaştırma içindir** (`SPEC_LITERAL_G0_RULES`). Bu koşuda A ile B arasında **10.0 puanlık** doğruluk farkı çıkıyor; bu bir seçenek değil, iki kural setinin ölçüm farkıdır — **E11.3 doğruluk kriteri B'ye geçilerek kapatılamaz.** Eşiği değiştirmek yeni bir patron kararı gerektirir, #8'in yeniden okunmasını değil.

**Kalan tutarsızlık (karar değil, etiket hatası):** `/settings/gates` aynı sayıyı hâlâ "Minimum AI Alignment Score" diye etiketliyor (`src/app/[locale]/(app)/[workspace]/settings/gates/page.tsx:35`, alan `minG0Score`), oysa `gates/evaluate.ts` onu bileşik skora uyguluyor. #8'in öngördüğü etiket düzeltmesi yapılmadı; sahibi board **TASK-MTQ63RR8Z0G8E**. Kalibrasyonu etkilemez, kullanıcıya yanlış şeyi söyler.

## 6. Yanlış sınıflandırılan örnekler (A kuralı)

- **S04 CULTHER** — skor 64.60, tahmin NO_GO, gerçek GO (above_threshold).
  Gerekçe: composite score 64.60 < 70.
  Not: HARD CASE — cleared the threshold on a composite score below 70
- **S07 BATTREC** — skor 59.55, tahmin NO_GO, gerçek GO (reserve).
  Gerekçe: composite score 59.55 < 70.
  Not: HARD CASE — reserve list; scored well below the composite threshold
- **S10 HEALTHEQ** — skor 54.53, tahmin NO_GO, gerçek GO (above_threshold).
  Gerekçe: composite score 54.53 < 70.
  Not: HARD CASE — exactly on the threshold; base rate barely clears the hard rule
- **S19 NETSUPP** — skor 74.90, tahmin GO, gerçek NO_GO (below).
  Gerekçe: tüm kurallar geçildi.
  Not: HARD CASE — high base rate CSA flatters the composite; the ESR still said no

## 7. Beta ortak anketi

- Ankete çıkarılan ortak sayısı: **10**, ortak başına **4** örnek.
- Örnek başına bağımsız görüş: **2**.
- Yanıt son tarihi: **2026-09-21**.
- Yanıt dosyası: _henüz yok._
- Ortak çoğunluğu hiçbir etiketi değiştirmedi.

## 8. Kabul kriteri karşısında durum

| Kriter | Durum |
|---|---|
| 20 örnek seed edildi ve puanlandı | ✅ 20/20 |
| Karışıklık matrisi üretiliyor | ✅ |
| Doğruluk ≥ %85 | ❌ A kuralı 80.0% · B kuralı 90.0% · en iyi eşik 54 → 95.0% |
| Ortak anketi gönderilmiş | ❌ GÖNDERİLMEDİ — roster'daki 10 adres teslim edilemez alan adında (`.invalid`); `--send` reddediyor. Gerçek roster girilmeden yanıt gelmez. |

> Bu tablodaki doğruluk satırı fixture üzerinden okunmuştur; kabul kriteri gerçek ESR verisiyle tekrar ölçülmeden **kapatılmamalıdır**.

> Bu tablo bu koşumun fotoğrafıdır ve eskir. Kriterin **şu anda** kapatılıp kapatılamayacağını
> makineye sordurun — hiçbir şey yazmaz, bloke varken 1 ile çıkar:
>
> ```bash
> pnpm beta:esr-preflight
> ```


## FO-382 notu (2026-11-05): CORDIS geçmişi olmayan ortak

Kural (patron K-576759 = A): `intendedRole = partner` ve CORDIS'te bu PIC için kayıt yok. Bu durumda
`coordinatorHistory` (15) ve `networkCentrality` (10) paydadan çıkar: skor `Σ(katkı) / 75`
(eskiden `/ 100`). Katkı toplamı değişmez, yani her örnekte skor ×100/75 büyür. Eşik 70, `minAlignment`,
taban oran ≥ %8 ve ülke uygunluğu değişmedi.

**Ölçüm** (`scripts/esr-calibration.ts` ile aynı `decideG0` ve `DEFAULT_GATE_RULES.G0`; 20 örnek;
saf fonksiyon, veritabanı yok). Her örnek "geçmişi olmayan ortak" varsayımıyla yeniden koşuldu:
`coordinatorHistory = networkCentrality = 0`, diğer özellikler CSV'den.

- Koordinatör yolu: 0 değişiklik (kural yalnız ortak rolüne uygulanır).
- Geçmişsiz ortak, eski `/100` → yeni `/75`: **8 karar değişiyor** (hepsi NO_GO → GO).
- Skor ≥ 70 olan: 9 örnek. Biri (S16 QUANTLINK, ülke uygunsuz) sert kuralla yine NO_GO.
- Uzman etiketiyle uyum: 8/20 → 14/20.
- **Yeni yanlış pozitif: S19 NETSUPP** (uzman NO_GO, yeni karar GO). Eşik değişmedi; bu, kuralın
  ürün kararı olduğunu gösterir ve raporda açıkça izlenmeli.

| Örnek | Eski (/100) | Yeni (/75) | Eski karar | Yeni karar | Uzman |
|---|---:|---:|---|---|---|
| S01 DISTRENOV | 62,00 | 82,67 | NO_GO | GO | GO |
| S03 AGRISENSE | 67,30 | 89,73 | NO_GO | GO | GO |
| S05 CLIMANEUT | 68,70 | 91,60 | NO_GO | GO | GO |
| S06 SMERAD | 63,50 | 84,67 | NO_GO | GO | GO |
| S08 GRIDFLEX | 64,76 | 86,35 | NO_GO | GO | GO |
| S11 SOLIDBAT | 60,69 | 80,92 | NO_GO | GO | GO |
| S12 GEOHEAT | 63,96 | 85,28 | NO_GO | GO | GO |
| S19 NETSUPP | 60,40 | 80,53 | NO_GO | GO | NO_GO |

Diğer 12 örnekte karar değişmiyor (NO_GO kalıyor). Ölçüm koşusu: geçici betik, repo dışında; bu not
üretilen dosyanın yerine elle yazıldı. `esr-calibration.ts` yeniden çalıştırılırsa bu bölüm silinir.
