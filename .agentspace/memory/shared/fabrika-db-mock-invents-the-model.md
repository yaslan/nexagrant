---
name: fabrika-db-mock-invents-the-model
description: vi.mock('@/lib/db') şemayı mock'a tanımlatıyor — hayali bir modeli mock'lamak testi yeşil tutarken uç nokta bozuk kalıyor; rota testinde eşlemeyi alan-alan ve boş/404 durumunu iddia et
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Fabrika'da bir rota testi `vi.mock('../../src/lib/db')` ile tüm `prisma` nesnesini değiştirdiğinde
**hangi modelin var olduğuna mock karar verir.** Şemada olmayan bir modeli mock'larsan test onu
gerçek sanır.

Ölçülmüş örnek (TASK-MTRK8YPNJDCIT, 2026-09-07) — `tests/api/v1-partners.test.ts`:

```js
organization: { findMany: vi.fn().mockResolvedValue([]) },   // Organization şemada YOK
...
expect(body.data.length).toBeGreaterThan(0);                  // GEÇİYORDU
```

İki yalan üst üste bindiği için test **çift yeşildi**:
1. Mock `[]` döndürüyor → rota `catch`'e değil, "veri yok" dalına düşüyor.
2. Rota o dalda **uydurma demo dizisi** üretiyor → `length > 0` sağlanıyor.

Üretimde ise `prisma.organization` `undefined`, çağrı `TypeError` fırlatıyor, aynı `catch` onu
yutup aynı uydurma diziyi 200 OK ile servis ediyordu. Yeşil test + yeşil build + bozuk uç nokta.

**Why:** Bir mock, sorgunun ŞEMAYA uyduğunu asla kanıtlayamaz — ancak eşlemeyi (hangi kolon
hangi API alanına gider) kanıtlayabilir. Zayıf iddialar (`length > 0`, `toBeDefined()`) ise
uydurma fallback tarafından karşılanabildiği için hiçbir şey kanıtlamaz.

**How to apply:** Bir rota/aksiyon testi yazarken:
- Mock'ta **yalnız şemada gerçekten olan** delegate adlarını kullan. Şema doğrulamasını mock'a
  değil `src/modules/m8/server/schema-contract.test.ts`'e bırak — o `src/` genelini tarar
  ([[fabrika-typecheck-is-blind-to-db-calls]]).
- `length > 0` yerine **`toEqual` ile alan-alan sözleşme** iddia et: bir satır gir, yayımlanan
  tüm alan adlarını ve değerlerini bekle. Bir fallback bunu geçemez.
- **Boş sonucu ve bulunamayan kaydı ayrıca test et:** `data: []` ve 404/`code`. Uydurma fallback
  en çok bu iki dalda saklanır ([[fabrika-fabricated-fallback-antipattern]]).
- Mock fixture'ını `vi.mock` factory'sinde **eager** okuma — `vi.mock` hoist edildiği için
  üstteki `const` TDZ'ye düşer (`Cannot access ... before initialization`).
  `mockImplementation(async () => FIXTURE)` ile geciktir.

İlgili: [[fabrika-e2e-own-fixture-hides-route-bugs]] · [[fabrika-done-reports-can-be-wrong]]
