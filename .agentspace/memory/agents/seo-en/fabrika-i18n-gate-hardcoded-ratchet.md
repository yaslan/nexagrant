---
name: fabrika-i18n-gate-hardcoded-ratchet
description: Fabrika i18n kapısının 4. kontrolü (gömülü metin) baseline'lı ratchet'tir — i18n-baseline.json yalnız küçülmeli, detektörü gevşetmek yasak
metadata:
  type: project
  updatedAt: 2026-09-10
---

TASK-MTVBJW8ATMD3G (2026-09-10) ile `pnpm i18n:check` dördüncü bir bloklayıcı kontrol
kazandı: `src/app/**` + `src/modules/**` altındaki `.tsx` dosyalarında gömülü kullanıcı
metni. Motor `scripts/i18n-hardcoded.ts`, ledger kök dizindeki `i18n-baseline.json`
(`{"<dosya yolu>": <ihlal sayısı>}`), sınır testi `tests/i18n-hardcoded-detector.test.ts`.

**Çalışma biçimi bir RATCHET'tir, bir yasak değil:** baseline'daki bir dosyanın sayısı
büyürse ya da baseline'da olmayan bir dosya ihlal taşırsa kapı kırmızı; sayı küçülürse
yeşil geçer ve "baseline güncellenmeli" uyarısı basar. Tazeleme:
`pnpm i18n:check --update-baseline`, ve metni taşıyan commit ile BİRLİKTE gönder.

**Devreye alınırken 325 literal / 37 dosya vardı** — kural düz açılsaydı kapı doğuşta
kırmızı olurdu ve kırmızı doğan kapı kapatılır. Baseline'ın tek varlık sebebi budur;
"borcu dondurmak" değil. Baseline'ın BÜYÜMESİ (yeni dosya eklenmesi) bu tasarımın
başarısızlığıdır, normal akış değil.

**İki kasıtlı kör nokta — bunları "bug" sanıp düzeltmeye kalkma, kart kapsamıydı:**
- Tek ASCII kelime ihlal sayılmaz (`"Save"` geçer, `"İşlemler"` geçmez). Tek kelimede
  prose ile identifier ayrılamaz; yanlış pozitif üreten kapı gevşetilir.
- `src/components/**` kapsam dışı. QA denetimi §B-03'teki sabit `aria-label`'lar
  (MobileAppHeader, ThemeToggle) bugün HİÇBİR kapı tarafından ölçülmüyor.

**Kapı kırmızıysa yapılacak:** metni `t()`'ye taşı. Detektörü gevşetmek ya da baseline'a
satır eklemek yasak — B-01'in (kapının `t()` kullanmayan dosyayı hiç taramaması,
TASK-MTU64MMEQC0WV) tekrar üretilme yolu tam olarak budur.

İlgili: [[fabrika-deferred-to-another-card-is-not-fixed]]
