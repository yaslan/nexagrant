---
name: fabrika-e2e-env-comes-from-playwright-not-dotenv
description: Fabrika e2e'si 503/eksik-config veriyorsa .env'e bakma — playwright.config.ts testEnv'i KENDİ başlattığı sunucuya enjekte eder; kırmızı, başkasının başlattığı sunucuya bağlanmaktan gelir
metadata:
  type: project
  updatedAt: 2026-09-10
---

`tests/e2e/invoice-*.spec.ts` 503 `supplier_identity_not_configured` verdiğinde
"`.env`'de `INVOICE_SUPPLIER_*` yok, ortam kurulumu eksik" diye raporladım. **Yanlıştı.**

`playwright.config.ts` bu değişkenleri kendi `webServer.env` bloğunda tanımlıyor
(`testEnv`, TASK-MTU26XBVZ6H1O) ve **kendi başlattığı** dev sunucusuna veriyor. `.env`'de
olmamaları normaldir ve oraya eklemek gereksizdir (üstelik gerçek vergi kimliğini yerel
dosyaya yazdırma riski).

Kırmızının gerçek sebebi: `reuseExistingServer: true` iken testler **başkasının
başlattığı** ve bu değişkenleri taşımayan sunucuya bağlanıyordu — altı ajanın :3000'i
paylaştığı bu depoda sık. `414e705` bunu `reuseExistingServer: false` yaparak kapattı.

Ölçüm (aynı commit, tek fark sunucunun nasıl başlatıldığı):
- supplier env'siz başlatılan sunucu → 2 failed (503)
- supplier env'li başlatılan sunucu → 4 passed

**Kural:** bir e2e kırmızısını "eksik ortam değişkeni" diye kapatmadan önce o değişkeni
**kimin sağlaması gerektiğine** bak — `.env` mi, test koşucusunun `webServer.env`'i mi.
`.env`'de yokluğunu görmek "sağlanmıyor" demek değildir. Aynı hata sınıfı: bir kapının
kırmızısını ölçmeden atfetmek → [[fabrika-prove-a-red-gate-is-not-yours-by-counterfactual]].

İlgili: [[fabrika-second-dev-server-port-isolation]],
[[fabrika-parallel-dev-server-needs-a-worktree]]
