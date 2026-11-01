---
name: fabrika-gitignore-does-not-hide-a-file-from-the-gate
description: .gitignore'daki geçici script yine de eslint ve tsc tarafından okunur ve pnpm gate'i repo genelinde kırar — probe dosyanı koştuktan sonra SİL, ve yabancı bir kalıntıya dokunmadan kapıyı hariç-tutarak ölç
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08'de `pnpm gate` iki kez, benim değişikliğimle ilgisi olmayan iki geçici dosyada
patladı: `.tmp-qa-en/measure1.ts` (`.gitignore`'da, yine de **eslint** onu okudu ve
`no-explicit-any` verdi) ve `scripts/_tmp-csv7/HEAD-consortium-page.tsx` (takip edilmiyor,
yine de **tsconfig `include: **/*.tsx`** onu projeye aldı, `TS2307`).

**Neden:** `.gitignore` git'e ne commit'lemeyeceğini söyler; eslint ve tsc dosya sistemine
bakar. Kapıyı kıran şey commit değil, dosyanın orada DURMASI.

**Ne yapmalı:**
- Kendi probe/ölçüm script'ini koştuktan sonra **sil** (repo kökünde `.mts`, koş, sil).
- Kalıntı BAŞKA bir ajanınsa **dokunma** — canlı çalışıyor olabilir. Bunun yerine kapıyı
  onu hariç tutarak ölç ve raporda dosya adıyla bildir:
  ```
  echo '{"extends":"./tsconfig.json","exclude":["node_modules","scripts/_tmp-csv7"]}' > tsconfig.gate-probe.json
  npx tsc --noEmit -p tsconfig.gate-probe.json   # exit 0
  rm tsconfig.gate-probe.json
  ```
- pre-commit kancası bunu zaten ayırıyor ("Ağaçta senin OLMAYAN typecheck hataları var…") —
  o çıktı rapordaki en iyi bağımsız kanıt.

Yan not: `git mv` staging alanına yazar; paralel bir ajan `git add -A` ile commit'lerse
senin yeniden adlandırman **onun commit'ine biner**. Taşımayı yaptıysan hemen kendi
commit'ini at.

İlgili: [[fabrika-tsx-script-must-live-in-repo-root]]
