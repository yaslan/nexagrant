---
name: fabrika-test-timing-e2e-parse-time-measurement
description: E2E test'te parse-time initialization ölçmek için chunk delay stratejisi, bidirectional kanıt
metadata:
  type: feedback
---

## Parse-time initialization test etmek için chunk delay

E2E test'te "script HTML parsing sırasında çalışıyor mu?" gibi şeyler test etmek için:
1. `page.route('**/_next/static/chunks/**', async (route) => { ... })` ile JS chunk'larını kasıtlı olarak geciktir (3+ saniye)
2. `await page.goto(url, { waitUntil: 'domcontentloaded' })` ile HTML parsed ama chunks pending iken page load'u tamamla
3. Bundan sonra evaluator'de state kontrol et

**Why:** Default `waitUntil: 'networkidle'` yükleme tamamlandıktan sonra state kontrol ettiğinden, useEffect gibi hydration-sonrası mekanizmalar bile işlev yapabilir. parse-time'daki davranışı ölçmek için chunks pending olduğu anda kontrol etmek gerekir.

**How to apply:** Timing-sensitive test (script initialization, CSS parse-time effects, preload behavior) yazarken bu pattern kullan. Test adı ölçtüğü zamanı anlatmalı ("before chunks load", "at parse time").

## Bidirectional test kanıtı

Test gerçekten test ettiğini doğrulamak için:
1. Parametreyi (burada: script tag) kaldır → test RED olmalı
2. Parametreyi geri koy → test GREEN olmalı

Bu iki-yönlü kanıt, test'in false positive olmadığını gösterir (sadece her zaman yeşil değildir).

**How to apply:** Harita/kart kapattıktan önceki git diff'de "kanıt: script kaldırıldığında test KIRMIZI, geri konduğunda YEŞİL" gibi yazı, ya da hatta iki koşu çıktısı kopyala.
