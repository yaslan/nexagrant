---
name: fabrika-i18n-gate-now-blocks-three-ways
description: Fabrika i18n kapısı 2026-09-08'de gerçekten bloklar hâle geldi — tr↔en parite + kodda-kullanılan-anahtar + şablon-şekli; next dev muaf, pnpm build turbopack yüzünden ayrıca kırık, güvenilir nokta pnpm gate
metadata:
  type: project
  updatedAt: 2026-09-08
---

`scripts/i18n-check.ts` artık üç bloklayıcı kontrol yapıyor ve `pnpm gate` ile `next build`
içinde koşuyor (commit `d98da75`, TASK-MTSHU5LT4XAE). Eski "her koşuda exit 1 + next.config
onu warning'e çeviriyor" durumu bitti — [[fabrika-i18n-gate-is-effectively-off]] artık
GEÇERSİZ, o notu kanıt diye kullanma.

Bilinmesi gerekenler:

- **`next dev` bilerek muaf** (`next.config.ts`, `PHASE_PRODUCTION_BUILD` koruması). Dev'de
  yeşil görmen kapının geçtiği anlamına GELMEZ; `pnpm i18n:check` ya da `pnpm gate` koş.
- **`pnpm build` bu depoda i18n'den bağımsız olarak kırmızı** — `src/lib/k2-cordis/importer.ts`
  içindeki dinamik `fs` yolları turbopack'i kırıyor (2026-09-08'de ölçüldü, commit'li kod).
  Yani "build kapısı" pratikte yok; i18n için güvenilir enforcement noktası **`pnpm gate`**.
- **"Unused" listesi asla hata değil** ve artık koşuyu düşürmüyor. Kanıt olarak yalnız
  `missing*` / `onlyIn*` / `unmatchedPatterns*` kovalarına bak.
- **Şablon anahtarları şekil olarak kontrol ediliyor**: `t(`kinds.${kind}`)` → `ns.kinds.*`
  desenine uyan en az bir anahtar İKİ katalogda da olmalı. Tek tek varyantlar kontrol
  EDİLMİYOR — bir varyantı iki dilden birden silmek kapıdan geçer.
- Kapı hâlâ yalnız `t()` çağrılarını ölçer; `useTranslations` hiç import etmeyen sabit-metinli
  bir bileşeni göremez ([[fabrika-i18n-dead-catalog-trap]]).

İlgili: [[fabrika-parallel-agents-share-one-worktree]] · rapor
`docs/agent-results/TASK-MTSHU5LT4XAE-ex-en.md`
