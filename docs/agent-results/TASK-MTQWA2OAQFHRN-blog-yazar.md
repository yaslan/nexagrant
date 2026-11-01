# TASK-MTQWA2OAQFHRN — Evaluator Lens `en` locale'inde sabit Türkçe metin

## 1. Ne yapıldı

`src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations/**` altında sabit Türkçe
metin bulunan tek dosya `client.tsx` idi (`page.tsx`, `panel/page.tsx`, `panel/client.tsx` zaten
tamamen `t('...')` kullanıyordu — dokunulmadı).

- `client.tsx` içindeki ~50 sabit Türkçe string'i `useTranslations('m6')` çağrılarına çevirdim.
  Yeni anahtarlar `m6` namespace'i altında şu gruplarda: `moduleLabel`, `opportunityLabel`,
  `metrics.*`, `tabs.*`, `ai.*`, `human.*`, `feed.*`, `rea.*` (7 REA checklist maddesi dahil,
  `title`/`desc` çiftleri), `calibration.*`.
- Her anahtar hem `messages/tr.json` hem `messages/en.json`'a eklendi — İngilizce tarafı gerçek
  çeviri (Türkçe'nin birebir kopyası değil, örn. "Excellence / Mükemmeliyet" → "Excellence",
  "Sık Hatalar Kontrolü" → "Common Pitfalls Check").
- "İç ön değerlendirme" / "internal pre-assessment" etiketi zaten `m6.internalPreAssessment`
  anahtarından geliyordu (önceki bir turda eklenmiş); dokunmadım, sadece kullanmaya devam ettim.
- Değişken içeren metinler ICU interpolasyonu ile yazıldı (`{title}`, `{human}`, `{ai}`,
  `{count}`, `{value}`, `{total}`, `{status}`) — string birleştirme (`+` / template literal içinde
  çeviri parçası) kullanılmadı. `opportunityLabel` için `t.rich(...)` + `<strong>` tag'i kullanıldı
  (fırsat başlığının kalın gösterimi için).
- Tarih biçimi: kart üstündeki değerlendirme tarihi sabit `'tr-TR'` locale'ine bağlıydı
  (`new Date(...).toLocaleDateString('tr-TR')`); bunu `useLocale()` ile aktif locale'e bağladım.
  `/en` altında artık `9/6/2026`, `/tr` altında `06.09.2026` görünüyor.
- REA checklist'in 7 maddesi daha önce component içinde inline bir dizi (title/desc) olarak
  duruyordu; anahtar bazlı bir tuple'a (`['kpi','trl',...]`) çevrilip `t(\`rea.items.${key}.title\`)`
  ile okunacak şekilde yeniden yazıldı — state (`reaChecklist`) ve mantık aynı kaldı, sadece metin
  kaynağı değişti.

Kapsam dışı bırakılanlar (görev talimatına göre): puan hesaplama/rozet mantığı, `pipeline/**`,
`briefs/**`, `src/modules/m6/ui/EvaluatorForm.tsx` / `EvaluationDashboard.tsx` (panel altındaki
ayrı bileşenler — zaten kendi `m6.form.*` / `m6.dashboard.*` anahtarlarını kullanıyorlardı, bu
görevin "yalnız evaluations/**" kısıtına girmiyordu).

## 2. Kanıt

**Typecheck** (temiz):
```
$ pnpm typecheck
[WARN] ... (pnpm ayar uyarısı, ilgisiz)
$ tsc --noEmit
(çıktı yok — 0 hata)
```

**Lint** (0 hata, önceki turdan kalan ilgisiz uyarılar hariç yeni uyarı yok):
```
$ pnpm lint
✖ 201 problems (0 errors, 201 warnings)
```

**Gerçek tarayıcı testi** (`pnpm dev` zaten S10 sprintinde başka bir ajan tarafından ayakta
tutuluyordu; onu kullandım). `demo-tenant` / workspace `main` için M6 ModuleState değeri test
sırasında geçici olarak `OFF` → `ON` yapıldı (aksi halde modül kilit ekranına düşüyordu),
ekran görüntüleri alındıktan hemen sonra `ON` → `OFF`'a geri döndürüldü (orijinal durumu
bozmamak için — bu değer benim görevimin kapsamında değil, başka bir ajanın
"verify-TASK-MTQW8188AWOAT" testi tarafından set edilmişti).

- `owner@demo.fabrika.test` ile giriş yapıldı (demo credentials provider, şifresiz).
- `http://localhost:3000/en/main/opportunities/demo-opp-3/evaluations` açıldı:
  - Ekran görüntüsü: `docs/agent-results/TASK-MTQWA2OAQFHRN-screenshots/en-evaluations-top.png`
    — başlık, metrik kartları, sekmeler, AI/Human formu tamamen İngilizce.
  - `readPage` çıktısı (tam metin) — "Module 6 — Evaluator Lens", "Average Predicted Score",
    "Evaluator Count", "G3 Gate Status", "IA Impact Multiplier", "Evaluations & Score Cards",
    "REA Common Pitfalls Check", "ESR Calibration", "AI Reviewer Simulation",
    "Add Human Expert Evaluation", "Existing Pre-Assessment Reports", "Human Expert Reader",
    "Total: 0.0 / 15.0 (Below Threshold)" — Türkçe kelime yok.
  - REA sekmesi açıldı, 7 madde de İngilizce doğrulandı ("Quantified KPIs and Target Metrics",
    "TRL Roadmap and Technology Maturation", ... "Open Science and Data Management Plan (DMP)").
  - ESR Calibration sekmesi açıldı: "Official ESR (Evaluation Summary Report) Calibration",
    "Select the Evaluation to Calibrate", "👤 Human Reader (Score: 0.0)",
    "Official Commission ESR Total Score (0 - 15.0)", "Calculate and Save Calibration".
    Ekran görüntüsü: `docs/agent-results/TASK-MTQWA2OAQFHRN-screenshots/en-evaluations-calibration-tab.png`
- Aynı sayfa `http://localhost:3000/tr/main/opportunities/demo-opp-3/evaluations` üzerinde
  tekrar açıldı: tüm metin beklendiği gibi Türkçe ("Modül 6 — Evaluator Lens",
  "Ortalama Tahmin Puanı", "G3 Kapısı Durumu", "REA Sık Hatalar Kontrolü", tarih `06.09.2026`
  formatında) — regresyon yok.
  Ekran görüntüsü: `docs/agent-results/TASK-MTQWA2OAQFHRN-screenshots/tr-evaluations-top.png`

Test için kullanılan geçici script'ler (`scripts/_dogfood-*.mjs`) iş bitince silindi;
`git status --short scripts/` boş.

## 3. Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations/client.tsx` (85 satır eklendi,
  107 satır çıkarıldı — hardcoded string'lerin `t(...)` çağrılarıyla değişimi, `useLocale` eklendi)
- `messages/tr.json` (m6 namespace'ine ~130 satır yeni anahtar)
- `messages/en.json` (m6 namespace'ine ~130 satır yeni anahtar, gerçek İngilizce çeviri)

Not: Bu iki `messages/*.json` düzenlemesi, sprint S10'da paralel çalışan başka bir ajanın
`feat(modules): enforce the ModuleState gate on M9 and M6` commit'i (6945904) içine dahil oldu —
o ajan aynı dosyaları kendi işi için commit ederken benim henüz commit edilmemiş satırlarımı da
sürükledi. İçerik doğrulandı (`git show 6945904 -- messages/tr.json` içinde tüm yeni `m6.*`
anahtarları mevcut) ve tarayıcı testi zaten bu commit sonrası state üzerinden yapıldı, dolayısıyla
kayıp/bozulma yok. [[fabrika-parallel-agent-file-race]]

## 4. Riskler

- `client.tsx` şu an commit edilmemiş durumda (bu rapor yazılırken `git status` "M" olarak
  gösteriyor) — ben commit atmadım çünkü görev talimatında commit adımı istenmemiş
  (rapor + dosya kaydı yeterli). İstenirse ayrı bir commit olarak eklenebilir.
- REA checklist maddelerinin sırası artık `['kpi','trl','gender','dec','risk','effort','openScience']`
  sabit dizisinden geliyor; JSON'daki `rea.items` anahtar sırası bu diziyle eşleşmezse görüntü sırası
  değişmez (React `.map` dizi sırasına göre render eder) — bu yüzden bir sorun yok, ama gelecekte bu
  diziye yeni bir REA maddesi eklenirse hem component'teki tuple'a hem her iki JSON dosyasına
  eklenmesi gerektiği unutulmamalı.

## 5. Açık sorular

Yok.

## 6. Sonraki adım

Yok — görev tamamlandı. `messages/tr.json` / `messages/en.json`'daki `m6.*` anahtarları artık
tek doğruluk kaynağı; gelecekte evaluations sayfasına yeni metin eklenirken bu anahtarların
yeniden kullanılması (veya aynı desende yenisinin eklenmesi) beklenir.
