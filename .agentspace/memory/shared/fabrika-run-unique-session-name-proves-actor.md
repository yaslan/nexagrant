---
name: fabrika-run-unique-session-name-proves-actor
description: "Denetim kaydındaki aktör gerçekten oturumdan mı geliyor" sorusunu ölçmenin yolu — JWT'ye KOŞUMA ÖZEL üretilmiş görünen ad bas ve akışı iki farklı oturumla sürdür; sabit ad hiçbir iddiayı geçemez
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Uydurma imzacı (`Dr. …`) sınıfı kusurlarda test şunu sormalı: bu satırı YAZAN, çağrıyı
YAPAN oturum mu? Sabit bir beklenen ad yazarsan, ürün o adı sabit kodlasa da test geçer.

**Çalışan kalıp** (TASK-MTS9C907G4YNW, `tests/e2e/m10-audit-identity.spec.ts`):

```ts
const RUN = Date.now().toString(36);
const ACTOR_A = `E2E Approver A ${RUN}`;   // kodun yazıldığı anda var OLMAYAN değer
const ACTOR_B = `E2E Approver B ${RUN}`;
```

Bu adlar yalnız oturum JWT'sine basılır (`encode({ token: { …, name: ACTOR_A } })`).
Sonra akış **tek sayfada, oturum ortasında el değiştirir**:
`context.clearCookies({ name: 'authjs.session-token' })` + yeni çerez → React state durur,
sıradaki server action B'nin çerezini taşır. İddia: denetim izi sırasıyla `['A','B','B']`.

Neyi öldürür: sabit ad, varsayılan aktör, "oturumu açan kişiyi tüm adımlara yazmak",
DB'den başka bir adı ikame etmek. Mutasyonla doğrulandı — `actorName`'i sabite çevirince
test KIRMIZI.

**Auth ayrıntısı (Fabrika):** `src/lib/auth.ts` jwt callback DB'deki `name`'i yalnız
`!token.tenantId || trigger === 'signIn'` iken yeniden okuyor. Elle mint ettiğin token
`tenantId` taşıyorsa **enjekte ettiğin ad hayatta kalır** — kalıp bu yüzden çalışıyor.
Fikstür kullanıcısına ayrıca gerçek `User` + `Membership` satırı aç (ikinci onaylayan),
ve ortak `scripts/seed-plan-e2e.ts`'e DOKUNMA — o dosyayı `module-plan-gate.spec.ts`
paylaşıyor; ek üyeyi spec'in kendi `beforeAll`/`afterAll`'ında kur ve sil.

İlgili: [[fabrika-pinned-next-action-id-is-vacuous]] · [[fabrika-module-gated-e2e-needs-own-tenant]]
