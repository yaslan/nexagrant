---
name: fabrika-measure-a-global-compiler-flag-with-a-sibling-config
description: Paylaşılan ağaçta global bir derleyici bayrağını ölçmek için tsconfig.json'a dokunma — kardeş bir probe config yaz, ölç, sil; paralel ajanlara AYRI probe adı ver
metadata:
  type: reference
  updatedAt: 2026-09-10
---

## Sorun
`noUncheckedIndexedAccess` gibi bir bayrağın yüzeyini ölçmek için klasik reçete "bayrağı
`tsconfig.json`'a ekle, `pnpm typecheck` koş, hemen geri al"dır. Fabrika'da bu YANLIŞ: depoda
tek bir global `tsconfig.json` var (proje referansı/alt-config yok) ve ölçüm süren ~40 saniye
boyunca ağaçtaki HER komşu ajanın `pnpm typecheck`/`pnpm gate` koşusu 171 hata görür — ve
bunu kendi işi sanar.

## Reçete (TASK-MTVPNUTNI54ZW'de kanıtlandı)
```jsonc
// tsconfig.<isine-ozel>-probe.json — geçici, ölçümden sonra SİLİNİR
{ "extends": "./tsconfig.json",
  "compilerOptions": { "noUncheckedIndexedAccess": true, "incremental": false } }
```
```bash
npx tsc -p tsconfig.<isine-ozel>-probe.json --noEmit
```
`incremental: false` şart: ortak `tsconfig.tsbuildinfo`'yu kirletmemek için.

Bu, kartın istediği "`git diff -- tsconfig.json` boş" kanıtını daha güçlü biçimde sağlar —
dosya hiç açılmamıştır.

## Paralel dalgada ek kural
Aynı anda birden fazla ajan aynı bayrağı ölçüyorsa (nUIA dilimleri gibi) her birine
**kendi probe dosya adını** ver (`tsconfig.nuia-ui-probe.json`, `tsconfig.nuia-scripts-probe.json`
…). Aynı adı paylaşırlarsa biri diğerinin probe'unu silerken ölçüm ortasında yakalar.
DoD'a "`git status`'ta probe dosyası KALMADI" maddesini koy — yoksa geçici dosya commit'e sızar.

İlgili: [[fabrika-concurrent-commit-steals-your-stage]] · [[fabrika-shared-worktree-commits-are-not-atomic]]
