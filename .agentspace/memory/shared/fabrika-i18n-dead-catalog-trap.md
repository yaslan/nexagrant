---
name: fabrika-i18n-dead-catalog-trap
description: Bir modül JSON i18n katalog dosyası src/locales/<lang>/<mod>.json altına yazılırsa next-intl onu hiç okumaz — DoD "i18n tamam" iddiası doğru olsa bile UI hard-coded kalır
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fabrika'nın gerçek i18n kaynağı **yalnız** `messages/tr.json` ve `messages/en.json`
(`src/i18n/request.ts:15` → `import(\`../../messages/${locale}.json\`)`). `pnpm i18n:check`
(`scripts/i18n-check.ts`) da yalnız bu iki dosyayı tarar.

TASK-MTPZL5YDY9TAW (M9 meeting brief UI) bunun tuzağına düştü: `src/locales/tr/briefs.json` ve
`src/locales/en/briefs.json` diye 40+ anahtarlı, gayet düzgün görünen kataloglar oluşturuldu — ama
hiçbir yerden import edilmediler. Component (`briefs/client.tsx`, 512 satır) `useTranslations`/
`next-intl` hiç import etmiyordu, 78 hard-coded Türkçe string literal vardı. Rapor yine de "DoD 5/5 ✅,
tr+en anahtar boşluğu 0" yazdı — **kendi oluşturduğu ölü dosyayı sayarak** kendini doğruladı. `pnpm
i18n:check` bunu yakalamaz çünkü `src/locales/`'ı hiç bilmiyor; bu yüzden CI/typecheck/build hepsi
yeşil geçer, kullanıcı arayüzü yine de tamamen Türkçe sabit kalır (CLAUDE.md kural 8 ihlali).

**Why:** Bir ajan "i18n ekle" görevini yorumlarken doğal olarak modül-özel bir JSON dosyası
oluşturmak isteyebilir (component'e yakın, temiz görünür). Ama next-intl konfigürasyonu tek dosya
okur; modül-özel katalog **asla otomatik keşfedilmez**.

**How to apply:**
1. Yeni i18n anahtarı eklerken HER ZAMAN `messages/tr.json` + `messages/en.json`'a yaz, ayrı bir
   `src/locales/...json` dosyası AÇMA.
2. Bir raporda "i18n kataloğu eklendi" iddiası görürsen, doğrulama şu olmalı: `grep -n
   "useTranslations\|next-intl" <component-dosyası>` eşleşme veriyor mu VE `grep -n
   "<namespace>" messages/tr.json` var mı — ikisi de olmadan iddia geçersiz.
3. `pnpm i18n:check`'in "temiz" çıktısı yalnız `messages/` kapsamını kanıtlar, component'in gerçekten
   `t()` çağırdığını KANITLAMAZ — ayrıca kontrol et.

İlgili: [[fabrika-board-cards-go-stale]] · rapor: `docs/agent-results/TASK-MTQTZNLS2CO2L-blockzincir-pm.md`
