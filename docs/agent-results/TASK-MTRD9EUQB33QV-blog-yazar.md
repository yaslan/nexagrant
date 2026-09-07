# TASK-MTRD9EUQB33QV — Plan kartı metinleri: PATRON onaylı 10 düzeltme

## 1) Ne yapıldı

Board kartındaki onaylı 10 düzeltmeyi birebir uyguladım (yeni metin icat etmedim):

**A) `billingPanels.settings.plans` (tr + en) — 8 çelişki**

| Plan | Alan | Önce | Sonra |
|---|---|---|---|
| basic | credits | 500 YZ kredisi / ay | **100 YZ kredisi / ay** |
| basic | seats | 1 kullanıcı / 1 çalışma alanı | **2 kullanıcı / 1 çalışma alanı** |
| basic | modules | Modüller: M3, M5 | **Modüller: M2, M3, M5** |
| pro | seats | Sınırsız çalışma alanı | **6 kullanıcı / 1 çalışma alanı** |
| pro | credits | 3.000 YZ kredisi / ay | **500 YZ kredisi / ay** |
| pro | modules | Modüller: M1-M6, M8 | **Modüller: M1-M5, M8** |
| ultra | credits | Sınırsız YZ kredisi (kendi anahtarınız) | **2.000 YZ kredisi / ay** (BYO-key iddiası tamamen kaldırıldı) |
| ultra | seats | Sınırsız koltuk ve çalışma alanı | **15 kullanıcı / 5 çalışma alanı** |

Aynı 8 satır `messages/en.json`'da İngilizce eşdeğerleriyle güncellendi.

**B) `billingPanels.pricing.plans` (tr + en) — 2 düzeltme**

| Plan | Alan | Önce | Sonra |
|---|---|---|---|
| basic | f5 | Temel CORDIS ortak arama / Basic CORDIS partner search | **M2 konsept notu taslakları / M2 concept note drafts** |
| pro | f4 | M2 konsept notu ve M3 kanıt paketi deposu / M2 concept notes and M3 evidence vault | **M4 Focal Point ve M8 konsorsiyum eşleştirme / M4 Focal Point and M8 consortium matching** |

Modül adları `src/modules/m4/manifest.ts` ("Focal Point") ve `src/modules/m8/manifest.ts`
("Consortium Matching") ile doğrulandı; `src/lib/billing/catalog.ts` hiç açılmadı (talimat gereği).

**C) `docs/BILLING.md` tablosu**

§1 katalog tablosundaki "Açtığı modüller" sütunu üç ücretli plan için de aynı altı modülü
("M1, M2, M3, M4, M5, M8") listeliyordu — planları birbirinden ayırmıyordu. Basic/Pro/Ultra
satırları settings bloğuyla tutarlı hale getirildi: `M2, M3, M5` / `M1-M5, M8` / `M1-M11`.
Bu değer doğrulaması dokümanın kendi §5 bölümündeki ("Modül kümesi birebir aynı (M2, M3, M5)",
"(M1–M5, M8)") ifadeleriyle çapraz kontrol edildi — catalog.ts açılmadan.

İki dilin anahtar kümesi birebir aynı kaldı (script ile doğrulandı: `keys only in tr: 0`,
`keys only in en: 0`).

## 2) Kanıt

**`pnpm gate` çıktısı (özet, tam log terminalde mevcuttu):**
```
✖ 84 problems (0 errors, 84 warnings)   ← lint: pre-existing warnings, 0 hata
$ tsc --noEmit                          ← typecheck: hatasız çıktı
 Test Files  73 passed | 2 skipped (75)
      Tests  779 passed | 8 skipped (787)
✅ SUCCESS: All 40 tenant-scoped models have RLS policies registered.
✅ Veritabanı 40 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

**Ekran görüntüleri** (`docs/agent-results/TASK-MTRD9EUQB33QV-screenshots/`, hepsi 2026-09-07
damgalı, gerçek tarayıcıdan Playwright ile — admin@yasinaslan.com.tr oturumu, demo-tenant/main):

| Dosya | md5 (ilk 8) |
|---|---|
| before-01-settings-tr-2026-09-07.png | 8c8a5bd0 |
| before-02-settings-en-2026-09-07.png | b30f0bdc |
| before-03-pricing-tr-2026-09-07.png | 4069248a |
| before-04-pricing-en-2026-09-07.png | 0549f4d2 |
| after-01-settings-tr-2026-09-07.png | 596b4834 |
| after-02-settings-en-2026-09-07.png | 9b0d05bf |
| after-03-pricing-tr-2026-09-07.png | 7ba11c9b |
| after-04-pricing-en-2026-09-07.png | 53e6927d |

8 dosya, 8 farklı md5 (tekil içerik doğrulandı — `fabrika-same-image-under-different-names`
hatasına düşülmedi). Görsel olarak da açıp okudum: before'da "1 kullanıcı / 1 çalışma alanı",
"3.000 YZ kredisi / ay", "Sınırsız YZ kredisi (kendi anahtarınız)" gibi eski metinler; after'da
tabloda yazılı yeni değerler (2/6/15 kullanıcı, 100/500/2.000 kredi, M2,M3,M5 /
M1-M5,M8 / M1-M11) ve pricing sayfasında "M2 konsept notu taslakları" / "M4 Focal Point ve
M8 konsorsiyum eşleştirme" satırları net biçimde görünüyor.

## 3) Değişen dosyalar

- `messages/tr.json` — `billingPanels.settings.plans.*` (8 alan) + `billingPanels.pricing.plans.basic.f5` + `.pro.f4`
- `messages/en.json` — aynı anahtarların İngilizce eşdeğerleri
- `docs/BILLING.md` — §1 katalog tablosu, "Açtığı modüller" sütunu (basic/pro/ultra satırları)
- `src/lib/billing/catalog.ts` — **dokunulmadı** (talimat gereği)

Commit: `bf4b2cd fix(billing): plan card copy matches PLAN_GRANTS` (dev branch, yalnız bu 3 dosya).

## 4) Riskler

- Düşük: yalnız görüntülenen metin değişti, hesaplama/yetkilendirme mantığına dokunulmadı.
- `docs/BILLING.md`'nin kendi başlığı "rakamların tek kaynağı catalog.ts'tir, oradan farklıysa
  doküman hatalıdır" diyor; modül sütununu düzeltirken catalog.ts'i açmadım, üçgenleme
  (settings bloğu + BILLING.md §5 + manifest dosyaları) ile doğruladım. Biri catalog.ts'i
  açıp gerçek `PLAN_GRANTS.moduleIds` değerleriyle bre bir teyit ederse daha sağlam olur.

## 5) Açık sorular (kapsam dışı — düzeltmedim, yalnız bildiriyorum)

1. **`messages/tr.json:1108` / `messages/en.json:1108`** — pricing sayfasında pro planının
   f5 satırı "Evaluator Lens (AB hakem simülatörü)" / "Evaluator Lens (EU review simulator)"
   diyor, yani M6'yı reklam ediyor. Ama düzeltilmiş settings bloğuna göre pro'nun modülleri
   `M1-M5, M8` — **M6 yok**. Bu görevin onaylı 10 düzeltme listesinde yoktu, dokunmadım.
2. **`messages/tr.json:1169` / `messages/en.json:1169`** — ayrı bir üçüncü kopya olan
   `billingPanels.admin.plans.pro.f4` da aynı şekilde "Evaluator Lens AB hakem simülatörü" /
   "Evaluator Lens EU review simulator" diyor (admin panelindeki plan kartları,
   `admin/billing/client.tsx`). Bu blok da görev kapsamının (settings + pricing + BILLING.md)
   dışındaydı, dokunmadım — ama aynı M6/pro çelişkisini taşıyor.
3. `docs/BILLING.md`'nin kendi uyarısı gereği (bkz. Riskler), modül sütunu düzeltmesinin
   `src/lib/billing/catalog.ts`'teki gerçek `PLAN_GRANTS` ile bire bir teyidi henüz
   catalog.ts açılarak yapılmadı.

## 6) Sonraki adım

Yukarıdaki 2 açık soru (Evaluator Lens/M6 iddiası — pricing.pro.f5 ve admin.plans.pro.f4) yeni
bir görev olarak açılabilir; onaylı liste bunları kapsamadığı için bu görevde bırakıldı.
