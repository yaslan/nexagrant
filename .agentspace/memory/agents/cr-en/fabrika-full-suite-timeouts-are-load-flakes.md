---
name: fabrika-full-suite-timeouts-are-load-flakes
description: pnpm test'te para/yuvarlama sweep testleri "Test timed out in 5000ms" ile düşerse suçu kendi değişikliğinde arama — izole koşuda geçerler, tetikleyici paralel yük
metadata:
  type: project
  updatedAt: 2026-09-10
---

`tests/withholding-rounding.test.ts`, `tests/vat-by-country.test.ts` ve
`src/lib/billing/invoice-writer.test.ts` kaba-kuvvet sweep testleri (5000 tutar × 6 oran gibi)
ve vitest'in **5 sn** varsayılan timeout'una yakın koşuyorlar.

**Belirti:** tam suit'te `Error: Test timed out in 5000ms`, ama düşen dosya sayısı koşudan
koşuya değişiyor (3 → 2 → 0). Bu **flake imzası**, deterministik kırılma değil.

**Ayırt etme (30 sn):**
```bash
npx vitest run tests/withholding-rounding.test.ts src/lib/billing/invoice-writer.test.ts
# → 33 passed  ⇒ yük kaynaklı, senin değişikliğin değil
```
Tetikleyici: paralel yük (kardeş ajanların eklediği test dosyaları suit'i 149→151'e çıkardı,
üstüne benim dev server + headed Chromium). Kendi dev server'ını kapatıp tekrar koş.

**Kural:** düşen testin senin dosyalarını import edip etmediğine bak; etmiyorsa ve izole
koşuda geçiyorsa raporuna "yük kaynaklı flake, bu kartla ilgisiz" diye kanıtıyla yaz —
"test kırmızı" diye kartı bloke etme, ama sessizce de geçme.
