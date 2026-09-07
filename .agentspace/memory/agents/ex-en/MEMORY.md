# Memory Index

- [fabrika-hardcoded-copy-defeats-grep-audit](fabrika-hardcoded-copy-defeats-grep-audit.md) — Bir denetimin "grep ile bulunamadı → özellik yok" bulgusu, copy sabit gömülüyse yanlış teşhis verir — yüzeyi bul ve tarayıcıda aç, denetimin grep'ini tekrarlama

- [eslint-disable-must-hug-the-offending-line](eslint-disable-must-hug-the-offending-line.md) — eslint-disable-next-line direktifi ile hatalı satır arasına yorum/boş satır girerse bastırma çalışmaz — Fabrika'da 7 lint hatasının 4'ünün gerçek kök nedeni buydu
- [fabrika-lint-gate-green-narrow-exceptions](fabrika-lint-gate-green-narrow-exceptions.md) — Fabrika lint kapısı 2026-09-07'de 0 hataya indi — patron kararı derin refactor değil dar/gerekçeli satır-içi istisna; borç TASK-MTQVFP0LV3YV7'de
- [fabrika-untracked-scratch-scripts-break-gates](fabrika-untracked-scratch-scripts-break-gates.md) — Paralel ajanın commit'lenmemiş scripts/_dogfood-*.ts dosyaları typecheck ve build'i kırar — kapıyı HEAD'den açılan izole git worktree'de koş, dosyalara dokunma

- [fabrika-g0-25-opportunities-was-two-tenants](fabrika-g0-25-opportunities-was-two-tenants.md) — "25 fırsat 18 alıyor" kartı yanıltıcıydı — sadece demo-tenant'ın 5'i öyleydi; esr-calibration'ın 20'si ayrı bir fixture mekanizmasından zaten farklılaşmıştı. Ayrıca G0 demo-tenant tavanı yapısal olarak 75/100'de kilitli.

- [fabrika-entitlement-is-getentitlements-not-planentitlement](fabrika-entitlement-is-getentitlements-not-planentitlement.md) — CLAUDE.md §4'ün andığı PlanEntitlement tablosu ve src/lib/authz depoda YOK — hak edişin tek gerçeği src/lib/billing.ts::getEntitlements(); plan kapısı 2026-09-07'de checkModuleAccess içine bağlandı
