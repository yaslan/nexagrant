---
name: fabrika-nuia-optional-chaining-can-create-a-false-green
description: noUncheckedIndexedAccess hatasını `?.` ile kapatmak negatif assertion'larda testi SESSİZCE yeşile çevirir — not.toHaveProperty/not.toContain undefined üzerinde geçer, önce toBeDefined() koy
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`noUncheckedIndexedAccess` altında `mock.calls[0][0]` hatası "mekanik" görünür ve refleks düzeltme
`mock.calls[0]?.[0]`'dır. **Negatif bir assertion'la birlikte bu bir sahte-yeşil üretir:**

```ts
const args = vi.mocked(prisma.conceptNote.findFirst).mock.calls[0]?.[0];
expect(args).not.toHaveProperty('include');   // çağrı HİÇ yapılmadıysa da GEÇER
```

`undefined`'ın `include` özelliği yoktur; testin ölçmek istediği "sorgu yapıldı ve include içermiyor"
idi, `?.` sonrası yalnız ikinci yarısını ölçüyor. Aynı tuzak `not.toContain`, `not.toEqual`,
`not.toMatch` için de geçerli.

**Kural:** bayrak hatasını `?.` ile kapatırken assertion'ın yönüne bak.
- Pozitif assertion (`toBe`, `toEqual`, `toContain`) → `?.` güvenli; `undefined` zaten düşürür.
- Negatif assertion (`not.*`) → önce `expect(x).toBeDefined()` ekle, ya da çağrıyı guard'layan bir
  yardımcıdan geçir (`firstCallArg()` deseni: olmayan çağrıyı ADIYLA fırlatır).

Guard'ın gerçekten ateşlediğini **mutasyonla** kanıtla: çağrı indeksini `0`→`9` yap, kırmızıyı
gör, geri al. Yeşil bir testin guard'ı test edilmemiş guard'dır.
Bkz. [[fabrika-a-record-typed-mock-is-56-nuia-errors-with-one-cause]].
