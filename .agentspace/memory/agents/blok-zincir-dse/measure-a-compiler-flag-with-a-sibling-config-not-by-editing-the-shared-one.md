---
name: measure-a-compiler-flag-with-a-sibling-config-not-by-editing-the-shared-one
description: Paylaşılan bir ağaçta derleyici bayrağı ölçerken tsconfig.json'ı düzenleyip geri alma — kardeş bir "extends" config kullan; komşunun kapısı hiç kırılmaz
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Fabrika'da tek global `tsconfig.json` var ve aynı ağaçta birden çok ajan yazıyor. Bir derleyici
bayrağının etkisini ölçmek için sık verilen reçete "bayrağı geçici aç, `pnpm typecheck` koş, hemen
geri al" — bu **yanlış**, çünkü ölçüm süresince (~40 sn) paylaşılan dosya kırık kalır ve o aralıkta
`pnpm typecheck`/`pnpm gate` koşan komşu 171 hata görüp bunu kendi işi sanır.

Doğrusu paylaşılan dosyaya hiç dokunmamak:

```jsonc
// tsconfig.<konu>-probe.json — ölçümden sonra sil
{ "extends": "./tsconfig.json",
  "compilerOptions": { "<bayrak>": true, "incremental": false } }
```
```bash
npx tsc -p tsconfig.<konu>-probe.json --noEmit
```

`incremental: false` şart: yoksa ölçüm ortak `tsconfig.tsbuildinfo`'yu kirletir.

**Why:** "geçici açıp geri alma" reçetesi tek kişilik bir ağaç varsayar; paylaşılan worktree'de
geri alma anı değil, açık kaldığı aralık zarar verir. Kardeş config aynı sayıyı verir ve
"`git diff -- tsconfig.json` boş" kanıtını daha güçlü biçimde sağlar — dosya hiç açılmadı.

**How to apply:** Bir görev "bayrağı geçici aç" derse, kardeş-config ile ölç ve raporda neden
saptığını yaz. Aynı kalıp herhangi bir paylaşılan config için geçerli (eslint, vitest, prisma).
Ölçüm bitince probe dosyasını sil; `ls tsconfig*` çıktısını kanıta koy. Ağaçta senin olmayan
başka bir `*-probe.json` görürsen dokunma — başka ajanın ölçümü.

[[fabrika-verification-recipe-mutation-and-counterfactual]]
