---
name: fabrika-playwright-caret-hide-fake-hydration-error
description: Playwright'ın page.screenshot() varsayılanı sahte React hidrasyon uyuşmazlığı üretir — caret 'initial' ile kapat
metadata:
  type: reference
updatedAt: 2026-09-07
---

Bir e2e testinde konsol hatalarını topluyorsan ve React
"A tree hydrated but some attributes of the server rendered HTML didn't match"
diyorsa, suçlamadan önce EKRAN GÖRÜNTÜSÜNE bak: `page.screenshot()` varsayılan olarak
`caret: 'hide'` uygular ve odaklanmış input'a `style={{caret-color: transparent}}` yazar.
React bunu sunucu HTML'i ile uyuşmazlık olarak raporlar. Ürün hatası DEĞİLDİR.

Kanıt yöntemi (30 saniye): aynı akışı ekran görüntüsü ALMADAN koş — hata sayısı 0'a düşerse
gürültü senindir. Çözüm: `page.screenshot({ path, caret: 'initial' })`.

TASK-MTQV1JYGMGU6V'de `tests/e2e/render-purity-refactor.spec.ts` bu yüzden bir kez kırmızı
verdi. [[fabrika-runtime-verification-recipe]]
