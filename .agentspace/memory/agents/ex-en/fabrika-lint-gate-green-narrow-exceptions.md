---
name: fabrika-lint-gate-green-narrow-exceptions
description: Fabrika lint kapısı 2026-09-07'de 0 hataya indi — patron kararı derin refactor değil dar/gerekçeli satır-içi istisna; borç TASK-MTQVFP0LV3YV7'de
metadata:
  type: project
  updatedAt: 2026-09-07
---

`pnpm lint` 2026-09-07'de commit `a4b09ad` ile 0 hata / çıkış 0 oldu (öncesi 7 hata). Patron kararı:
**derin refactor yapma, dar ve gerekçeli satır-içi istisna yaz, borcu karta taşı.** `eslint.config.mjs`
stock `eslint-config-next`'tir ve gevşetilmemiştir — kural override'ı, ek `ignore` veya `--max-warnings`
oyunu YOK; öyle kalmalı.

Geriye 6 gerekçeli `react-hooks/set-state-in-effect` istisnası kaldı (ThemeToggle, UserMenu,
notifications/client, calls/page, PartBCollaborativeEditor ×2). Gerçek çözüm **TASK-MTQVFP0LV3YV7**
kartında: `useSyncExternalStore`, `key` ile state reset, `saveStatus`'ün türetilmesi.

Kapı hâlâ 203 **uyarıya** kör ve CI yalnız `main`'e push/PR'da koşuyor (`.github/workflows/ci.yml`) —
ajanların commit ettiği `dev` branch'i kapısız. İkisi de açık patron kararı.

İlgili: [[eslint-disable-must-hug-the-offending-line]] · [[fabrika-untracked-scratch-scripts-break-gates]]
