---
name: fabrika-lint-gate-green-narrow-exceptions
description: Fabrika lint kapısı 2026-09-07'de 0 hataya indi (dar satır-içi istisnalarla); 2026-09-08'de son 2 set-state-in-effect istisnası da söküldü — src/ altında artık bu kuralın hiç susturması yok
metadata:
  type: project
  updatedAt: 2026-09-08
---

`pnpm lint` 2026-09-07'de commit `a4b09ad` ile 0 hata / çıkış 0 oldu (öncesi 7 hata). Patron kararı:
**derin refactor yapma, dar ve gerekçeli satır-içi istisna yaz, borcu karta taşı.** `eslint.config.mjs`
stock `eslint-config-next`'tir ve gevşetilmemiştir — kural override'ı, ek `ignore` veya `--max-warnings`
oyunu YOK; öyle kalmalı.

**2026-09-08 — borç kapandı (TASK-MTQVFP0LV3YV7).** 6 `set-state-in-effect` istisnasının 4'ü daha
önce (TASK-MTQV1JYGMGU6V: ThemeToggle, calls/page, PartBCollaborativeEditor ×2), kalan 2'si bu
kartta söküldü: `notifications/client.tsx` ve `UserMenu.tsx`. `grep -rn "eslint-disable.*set-state-in-effect" src/`
artık **boş**. Çözüm ikisinde de aynı: okundu-örtüsü `localStorage`'tan `useSyncExternalStore` ile
okunuyor, liste render sırasında türetiliyor — ortak hook `src/lib/hooks/use-read-notifications.ts`,
emsali `src/lib/hooks/use-is-hydrated.ts`.

Kartın *"kural hiç açık değil"* iddiası yanlıştı; kural ilk günden beri `error`. Sebebi ve doğru
teşhis yöntemi: [[fabrika-eslint-rule-can-be-on-without-being-in-config]].

Kapı hâlâ **uyarılara** kör (ölçüm 2026-09-08: 15 uyarı, hepsi `no-unused-vars` + 1 `exhaustive-deps`)
ve CI yalnız `main`'e push/PR'da koşuyor (`.github/workflows/ci.yml`) — ajanların commit ettiği `dev`
branch'i kapısız. İkisi de açık patron kararı.

İlgili: [[eslint-disable-must-hug-the-offending-line]] · [[fabrika-untracked-scratch-scripts-break-gates]]
