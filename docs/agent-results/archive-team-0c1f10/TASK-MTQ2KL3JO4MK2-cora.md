# TASK-MTQ2KL3JO4MK2 — E11.3 ESR Kalibrasyonu

**Ajan:** Cora (Backend) · **Sprint:** S8–S9 (E11 Beta) · **Epik:** E11 · **Tarih:** 2026-09-06

---

## 1. Ne yapıldı

Görev "20 CORDIS örnek projesi seed + G0 puanlama + beta ortak geri bildirimi + ≥%85 doğruluk"
istiyordu. Keşifte çıkan asıl sorun şuydu: **puanlanacak bir G0 puanlayıcısı yoktu.**

- `Opportunity.g0Score`'u yazan tek yer `pipeline/actions.ts:45` idi ve değer
  `Math.floor(Math.random() * 15 + 80)` — yani rastgele bir sayı.
- `src/lib/scoring/defaults.ts` PROJECT.md:81'deki 7 faktörlü 100 puanlık ağırlıkları taşıyor ama
  bu ağırlıkları **kullanan bir fonksiyon yok**.
- `src/lib/scoring/g0.ts:calculateG0Score` bambaşka bir model (4 faktör, 0–10 skala).
- `gates/evaluate.ts` G0'da bu 0–10 fonksiyonun sonucunu 0–100 eşiğiyle karşılaştırıyordu
  (7.5 < 70), yani puanlanmamış her fırsat "skorun 7.5, eşik 70" gibi hiç kimsenin hesaplamadığı
  bir gerekçeyle düşüyordu.

Bu yüzden kalibrasyondan önce kanonik puanlayıcı yazıldı; sonra 20 örnek seed edilip puanlandı,
karışıklık matrisi üretildi ve ortak anketi hazırlandı.

### 1.1 Kanonik G0 puanlayıcı — `src/lib/scoring/g0-canonical.ts` (yeni)

PROJECT.md:81 ağırlıkları (uyum 30, taban oran 15, koordinatör geçmişi 15, araştırma+son kullanıcı 12,
ağ merkeziliği 10, bütçe/rol ekonomisi 10, lump-sum/iki aşamalı 8) ile 0–100 bileşik skor + PROJECT.md:75
sert kuralları (uyum ≥ 70, taban oran ≥ %8, ülke uygun).

- **Additive:** `g0.ts:calculateG0Score` **silinmedi**; hiçbir mevcut çağıran davranış değiştirmiyor.
- Ağırlıklar `TenantSettings.scoringWeights`'ten gelebildiği için toplam 100 değilse **normalize**
  ediliyor (kırpma değil) — bir operatör tek ağırlığı büyütünce skorun 100'ü aşmaması için.
- Düşen **her** kural gerekçeye yazılıyor, ilki değil: iki kuraldan düşen bir fırsatın sahibi birini
  düzeltip boşuna yeniden koşmasın diye.
- İki kural seti adlandırıldı: `DEFAULT_G0_RULES` (bugün uygulanan: bileşik ≥ 70 dahil) ve
  `SPEC_LITERAL_G0_RULES` (PROJECT.md:75 düz okunuşu: bileşik eşik yok). Kalibrasyon ikisini de ölçüyor.

### 1.2 Kalibrasyon matematiği — `src/lib/scoring/calibration.ts` (yeni)

Karışıklık matrisi, accuracy/precision/recall/F1, eşik taraması ve **Wilson %95 güven aralığı**.
Saf fonksiyonlar: raporun bastığı sayı ile testin sabitlediği sayı aynı koddan çıkıyor.
Pozitif sınıf = GO; FP = boşa emek, FN = kaçırılan hibe — maliyetler simetrik değil ve rapor bunu söylüyor.

### 1.3 20 örnek + seed — `docs/BETA_DATA/esr-calibration-samples.csv`, `scripts/esr-calibration.ts`

**Yeni tablo açılmadı.** Mevcut zincir yeniden kullanıldı (bkz. `docs/DATA_MODEL.md` §2):
`Opportunity.g0Score` = bileşik skor · `Proposal.esrScores/outcome` = gerçek etiket ·
`GateDecision(gate=G0, passed, inputs, ruleVersion)` = tahmin + yedi özellik + ağırlıklar + gerekçeler.
Böylece migration, RLS politikası ve şema değişikliği gerekmedi.

- Tüm satırlar **`esr-calibration` iç kiracısında**; bir tasarım ortağının hattında veya KPI panosunda
  görünmez (kanıt §2.3: `demo-tenant` 5 fırsatta kaldı).
- Her yazma deterministik id üzerinde `upsert` → **iki kez koşmak güvenli** (kanıt §2.2).
- `--rollback --apply` tam geri alma; yalnız `esr-calibration` kiracısı ve rezerve `SAMPLE-` id
  ad alanı siliniyor (kanıt §2.4).
- Varsayılan mod **dry-run**; DB'ye yazmak `--apply`, e-posta göndermek `--send` ister.

### 1.4 Beta ortak anketi — `src/lib/beta/esr-survey.ts`

10 ortağa 4'er örnek, round-robin → **her örnek 2 bağımsız görüş** alıyor (tek görüş n=20'de
doğruluğu 5 puan oynatır). Atama deterministik: yeniden koşuda ortak aynı listeyi görür.
TR/EN iki dilde e-posta + doldurulacak `responses.csv` şablonu. Yanıt yuvarlaması çoğunluk;
**berabere = çoğunluk yok** (sessizce bir tarafı seçmiyor).

`--send` **reddetti** ve etmeliydi: roster'daki 10 adres de `.invalid` yer tutucusu (kanıt §2.6).
Yani **anket hazır ve render edilmiş durumda, gerçek ortaklara gönderilmedi** — gerçek adresler
roster'a girilmeden gönderilemez, bu da E11.1'de konan kasıtlı bir emniyet.

### 1.5 Hata düzeltmesi — `src/lib/gates/evaluate.ts`

Puanlanmamış fırsat için 0–10 skalalı yedek skor üretip 0–100 eşiğiyle kıyaslayan dal kaldırıldı;
artık "bu fırsat için G0 skoru henüz hesaplanmadı" diyor. Geç/kal sonucu **değişmiyor** (ikisinde de
geçmiyor), yalnız gerekçe doğru. Regresyon testi eklendi (`tests/gates.test.ts`).

### 1.6 Rapor — `docs/CORDIS-SAMPLE-CALIBRATION.md` (üretilmiş)

Örnek başına tablo, iki kural setinin karışıklık matrisi, 40–90 arası eşik taraması, **veriden
hesaplanan öneri bölümü** ve kabul kriteri durumu. Fixture uyarısı raporun en üstünde.

---

## 2. Kanıt (gerçek komut çıktıları)

### 2.1 Kalibrasyon koşusu

```
$ pnpm beta:esr-calibration --apply --survey
🎯 ESR calibration (E11.3)
   mode      : APPLY
  [samples] 20 parsed — CURATED FIXTURE (SAMPLE-* ids)
  [score] rule A (composite ≥ 70): accuracy 80.0%
  [score] rule B (spec literal, no composite): accuracy 90.0%
  [sweep] best threshold 54 → accuracy 95.0%
  [survey] beta-anadolu-teknoloji: rendered 4 items → survey/beta-anadolu-teknoloji.html (not sent)
  ... (10 ortak)
  [db] before: {"opportunities":0,"proposals":0,"gateDecisions":0,"cordisProjects":0}
  [db] after : {"opportunities":20,"proposals":20,"gateDecisions":20,"cordisProjects":20}
  [report] written → docs/CORDIS-SAMPLE-CALIBRATION.md
```

### 2.2 İki kez koşma (idempotency kanıtı)

```
$ pnpm beta:esr-calibration --apply --survey        # 2. koşu
  [db] before: {"opportunities":20,"proposals":20,"gateDecisions":20,"cordisProjects":20}
  [db] after : {"opportunities":20,"proposals":20,"gateDecisions":20,"cordisProjects":20}
```
Satır sayısı değişmedi; kopya üretilmedi.

### 2.3 Doğrulama — doğrudan SQL (harness'tan bağımsız)

```
— Opportunity per tenant —
┌─────────┬───────────────────┬────┐
│ (index) │ tenantId          │ n  │
├─────────┼───────────────────┼────┤
│ 0       │ 'demo-tenant'     │ 5  │   ← görev öncesiyle aynı: kiracı sızıntısı yok
│ 1       │ 'esr-calibration' │ 20 │
└─────────┴───────────────────┴────┘

— GateDecision G0 tahmini × gerçek ESR sonucu —
┌─────────┬──────────────┬───────────────────┬───┐
│ (index) │ predicted_go │ outcome           │ n │
├─────────┼──────────────┼───────────────────┼───┤
│ 0       │ false        │ 'above_threshold' │ 2 │   ← FN
│ 1       │ false        │ 'below'           │ 6 │   ← TN
│ 2       │ false        │ 'ineligible'      │ 1 │   ← TN
│ 3       │ false        │ 'reserve'         │ 1 │   ← FN
│ 4       │ true         │ 'below'           │ 1 │   ← FP
│ 5       │ true         │ 'funded'          │ 9 │   ← TP
└─────────┴──────────────┴───────────────────┴───┘

— doğruluk doğrudan veritabanından —
┌─────────┬───────┬─────────┬──────────────┐
│ (index) │ total │ correct │ accuracy_pct │
├─────────┼───────┼─────────┼──────────────┤
│ 0       │ 20    │ 16      │ '80.0'       │   ← harness'ın bastığı %80 ile birebir
└─────────┴───────┴─────────┴──────────────┘

— saklanan gate girdileri —
┌─────────┬────────┬────────┬───────┬────────┬────────────────────┐
│ (index) │ sample │ passed │ score │ expert │ ruleVersion        │
├─────────┼────────┼────────┼───────┼────────┼────────────────────┤
│ 0       │ 'S01'  │ true   │ 76.5  │ 'GO'   │ 'g0-canonical-1.0' │
│ 3       │ 'S04'  │ false  │ 64.6  │ 'GO'   │ 'g0-canonical-1.0' │
└─────────┴────────┴────────┴───────┴────────┴────────────────────┘
```

### 2.4 Geri alma (rollback) — gerçekten koşuldu

```
$ pnpm beta:esr-calibration:rollback --apply
  [rollback] opportunities seen: 20
  [rollback] deleted gateDecision=20 proposal=20 opportunity=20 cordisProjectTopic=20
             cordisProject=20 workspace=1 tenant=1

$ # geri alma sonrası durum
┌─────────┬──────────┬───────────┬──────────┬────────────┐
│ (index) │ cal_opps │ demo_opps │ fixtures │ cal_tenant │
├─────────┼──────────┼───────────┼──────────┼────────────┤
│ 0       │ 0        │ 5         │ 0        │ 0          │   ← demo-tenant'a dokunulmadı
└─────────┴──────────┴───────────┴──────────┴────────────┘

$ pnpm beta:esr-calibration:rollback --apply        # 2. kez — geri alma da idempotent
  [rollback] deleted gateDecision=0 proposal=0 opportunity=0 ... tenant=0

$ pnpm beta:esr-calibration --apply --survey         # yeniden kuruldu
  [db] after : {"opportunities":20,"proposals":20,"gateDecisions":20,"cordisProjects":20}
```

### 2.5 Anket yanıtı işleme (uçtan uca)

```
$ pnpm beta:esr-calibration --responses=docs/BETA_DATA/esr-survey-responses.example.csv
  [samples] 20 parsed — CURATED FIXTURE (SAMPLE-* ids)
  [responses] 8 verdicts, 1 label(s) changed
  [score] rule A (composite ≥ 70): accuracy 85.0%     ← 80.0% → 85.0%
  [score] rule B (spec literal, no composite): accuracy 95.0%
  [sweep] best threshold 54 → accuracy 100.0%
```
S19 için iki ortak Fabrika'nın GO kararını onayladı → etiket `NO_GO→GO` güncellendi ve doğruluk
yeniden hesaplandı. **Bu dosya bir harness self-test'idir, ortak yanıtı DEĞİLDİR** — dosyanın
başında da böyle yazıyor ve komut kaydedilen rapora yazılmadı.

### 2.6 `--send` emniyeti

```
$ pnpm beta:esr-calibration --survey --send
❌ --send refused: 10 roster address(es) are on a reserved, undeliverable domain
   (partner01@example.invalid, ... partner10@example.invalid).
   Replace the roster with real partners first.
[ELIFECYCLE] Command failed with exit code 1
```

### 2.7 Anket e-postası — iki dil

```
$ head -6 docs/BETA_DATA/generated/esr-calibration/survey/beta-anadolu-teknoloji.txt
Subject: Fabrika Beta — G0 skoru doğrulama anketi (5 dakika)
To: Design Partner 01 <partner01@example.invalid>
Merhaba Design Partner 01,
Fabrika'nın G0 triyaj skorunu gerçek değerlendirme sonuçlarıyla kalibre ediyoruz. ...

$ head -6 docs/BETA_DATA/generated/esr-calibration/survey/beta-nordic-consulting.txt
Subject: Fabrika Beta — G0 score validation survey (5 minutes)
To: Design Partner 10 <partner10@example.invalid>
Hello Design Partner 10,
We are calibrating Fabrika's G0 triage score against real evaluation outcomes. ...
```

### 2.8 Test / typecheck / lint

```
$ pnpm vitest run tests/esr-calibration.test.ts tests/gates.test.ts
 Test Files  2 passed (2)
      Tests  35 passed (35)

$ pnpm typecheck
$ tsc --noEmit          ← temiz

$ npx eslint src/lib/scoring/g0-canonical.ts src/lib/scoring/calibration.ts \
    src/lib/beta/esr-samples.ts src/lib/beta/esr-survey.ts scripts/esr-calibration.ts \
    tests/esr-calibration.test.ts
                        ← yeni dosyalarda 0 sorun

$ pnpm test
 Test Files  3 failed | 36 passed (39)
      Tests  4 failed | 242 passed (246)
```
Kırmızı 4 test **taban çizgisi**, benim değişikliğimden değil: 3 tanesi ağ isteyen SEDIA testi
(`k1-daily-calls`, `sedia-adapter`), 1 tanesi `rls.spec` — yerel `fabrika` rolü `BYPASSRLS=true`
olduğu için RLS yerelde hiç uygulanmıyor. Üç dosyanın hiçbiri benim eklediğim/değiştirdiğim
modüllerden import etmiyor. (Takım hafızasında `fabrika-known-failing-tests` olarak zaten kayıtlı.)

### 2.9 Kalibrasyon sonucu — özet

| Kural | TP | FP | TN | FN | Doğruluk | Wilson %95 |
|---|---:|---:|---:|---:|---:|---|
| **A** — bugün uygulanan (bileşik ≥ 70 + 3 sert kural) | 9 | 1 | 7 | 3 | **%80.0** | %58.4 – %91.9 |
| **B** — PROJECT.md:75 düz okunuşu (bileşik eşik yok) | 12 | 2 | 6 | 0 | **%90.0** | %69.9 – %97.2 |
| En iyi eşik (tarama, 54) | 12 | 1 | 7 | 0 | **%95.0** | — |

**Bulgu:** bugünkü kural, ESR eşiğini gerçekten geçmiş 3 teklifi (S04, S07, S10) hiç denenmeden
eliyor. Hata dağılımı kaçırma yönünde (3 FN / 1 FP). Öneri raporda: tek eşik yerine üç bant —
`GO ≥ 70`, `İNCELE 54–70` (insan kararı), `NO_GO < 54` — ve n=20'de eşiği doğrudan 54'e çekmemek.

---

## 3. Değişen dosyalar

**Yeni**
- `src/lib/scoring/g0-canonical.ts` — PROJECT.md:81 ağırlıklı puanlayıcı + PROJECT.md:75 sert kuralları
- `src/lib/scoring/calibration.ts` — karışıklık matrisi, metrikler, eşik taraması, Wilson aralığı
- `src/lib/beta/esr-samples.ts` — örnek seti CSV ayrıştırma + doğrulama (etiket/sonuç çelişkisi reddi)
- `src/lib/beta/esr-survey.ts` — atama, TR/EN anket e-postası, yanıt ayrıştırma + çoğunluk yuvarlaması
- `scripts/esr-calibration.ts` — CLI (dry-run varsayılan, `--apply`, `--survey`, `--send`, `--responses`, `--rollback`)
- `docs/BETA_DATA/esr-calibration-samples.csv` — 20 örnek (küratörlü fixture, `SAMPLE-*` ad alanı)
- `docs/BETA_DATA/esr-survey-responses.example.csv` — yanıt şablonu / harness self-test
- `docs/CORDIS-SAMPLE-CALIBRATION.md` — üretilmiş kalibrasyon raporu
- `tests/esr-calibration.test.ts` — 31 birim testi

**Değişen**
- `src/lib/gates/evaluate.ts` — G0 yedek skorundaki skala hatası düzeltildi; kullanılmayan import kaldırıldı
- `tests/gates.test.ts` — puanlanmamış fırsat için regresyon testi
- `docs/ROADMAP.md` — Açık kararlar #8 (G0 eşiği hangi sayıya uygulanıyor?)
- `docs/DATA_MODEL.md` — §2'ye kalibrasyon zincirinin nasıl saklandığı
- `package.json` — `beta:esr-calibration`, `beta:esr-calibration:rollback`

**Üretilmiş (gitignore'da, E11.1 ile aynı kural)**
- `docs/BETA_DATA/generated/esr-calibration/survey/*.{html,txt,responses.csv}` — 10 ortak × 3 dosya
- `docs/BETA_DATA/generated/esr-calibration/calibration-summary.json`

---

## 4. Riskler

1. **Örnek seti küratörlü bir fixture; gerçek CORDIS ekstresi değil.** Ağ/zip erişimi olmadığı için
   `scripts/cordis-import.ts` çalıştırılamadı ve gerçek proje kimlikleri uydurulmadı — bunun yerine
   rezerve `SAMPLE-*` ad alanı kullanıldı. **%80/%90/%95 rakamları kalibrasyon hattının çalıştığını
   gösterir, modelin gerçek doğruluğunu göstermez.** Rapor ve CSV başlığı bunu açıkça yazıyor.
2. **Anket gönderilmedi.** Roster'ın 10 adresi de `.invalid` yer tutucusu; `--send` bilerek reddediyor.
   Gerçek adresler girilene kadar "2 hafta yanıt" penceresi başlamış sayılmaz.
3. **Eşik önerisi n=20 üzerinde.** Wilson aralığı %58–%92; eşiği tek hamlede değiştirmek overfit olur.
   Öneri bilerek muhafazakâr (bant ekle, eşiği düşürme).
4. **Ürün hâlâ rastgele skor yazıyor.** `pipeline/actions.ts:45` `Math.random()` ile `g0Score` üretmeye
   devam ediyor; kanonik puanlayıcıya bağlanması ayrı bir iş (kapsam dışı bırakıldı, aşağıda).
5. **Yerel RLS inert.** `fabrika` rolü `BYPASSRLS=true`; kiracı izolasyonu yerelde sorguyla değil,
   yalnız `tenantId` filtreleriyle sağlanıyor. Ayrı bir konu, takım hafızasında kayıtlı.

---

## 5. Açık sorular

1. **G0 eşiği hangi sayıya uygulanacak?** (ROADMAP Açık kararlar #8) Bileşik skora mı, yalnız uyum
   alt-skoruna mı? İki okuma arasında bu koşuda 10 puan doğruluk farkı var. Ürün kararı gerekiyor.
2. **Üç bantlı G0 (GO / İNCELE / NO_GO) kabul ediliyor mu?** Kabul edilirse `Gate` enum'ı ve pipeline
   kanban'ı bir "incelemede" durumu kazanır — şema ve UI işi, ayrı görev.
3. **Gerçek ESR verisini kim topluyor?** Ortaklardan ESR paylaşımı istemek ayrı bir onay/veri işleme
   dayanağı gerektiriyor (ankette bilerek istenmedi, sadece görüş soruldu).
4. **Yüksek taban oranlı çağrı tipleri (CSA vb.) bileşik skoru şişiriyor** (S19). `baseRate`
   ağırlığının çağrı tipine göre sınırlanması gerekir mi?

---

## 6. Sonraki adım

1. Açık karar #8 kapatılsın; sonra `gates/evaluate.ts` kanonik `decideG0`'a bağlansın.
2. `pipeline/actions.ts:45` rastgele skor kaldırılsın; `TopicMatch` + `TopicStat` + CORDIS ortak
   profilinden yedi özellik beslenip `scoreG0` çağrılsın. (Ayrı görev — M1/K3 verisi gerekiyor.)
3. Roster gerçek adreslerle güncellensin → `pnpm beta:esr-calibration --survey --send`; 2 hafta sonra
   dönen yanıtlar `--responses=` ile işlenip rapor yeniden üretilsin.
4. Beta ortaklarının gerçek ESR'leri geldikçe `--samples=` ile fixture'ın yerine konsun; kabul kriteri
   (**doğruluk ≥ %85**) **ancak o koşuda** kapatılabilir.
