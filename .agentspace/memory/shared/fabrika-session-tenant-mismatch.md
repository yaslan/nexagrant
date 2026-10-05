---
name: fabrika-session-tenant-mismatch
description: Kiracı-kapsamlı her sayfa 0 gösteriyorsa sorgu değil oturum bozuktur — üyeliği olmayan kullanıcıya auth.ts var olmayan "demo-tenant-hq" kiracısını veriyor
metadata:
  type: project
  updatedAt: 2026-09-06
---

Fabrika'da bir panel/liste **her metriği 0** gösteriyorsa, önce sorguyu suçlama. `src/lib/auth.ts`
jwt/session callback'i, kullanıcının **hiç `Membership` satırı yoksa** `tenantId`'yi
`"demo-tenant-hq"` sabitine düşürüyor — **böyle bir Tenant yok**. `withTenant(tenantId, …)` bu
hayalet kiracıyla çalışır, hata vermez, boş döner. Semptom "sorgu bozuk" gibi görünür ama
kod tamamen doğrudur.

Ayırt edici işaret: **tarihe bağlı olmayan** bir metrik de (ör. "Açık Modüller") 0 ise sorun
aralık filtresi değil, kiracıdır.

Teşhis (30 saniye):

```ts
const u = await prisma.user.findUnique({
  where: { email }, select: { memberships: { select: { role: true, tenantId: true } } },
});
// memberships boşsa → oturumdaki tenantId sahte
```

Demo süperadmin (`admin@yasinaslan.com.tr`) tam olarak bu duruma düşüyordu; koltuğu artık
`prisma/seed-tenant-workspace.ts` seed ediyor (`DEMO_ADMIN_SEAT`, demo kiracıda `TENANT_OWNER`).
`pnpm db:seed` koşmamış taze bir veritabanında aynı tuzak tekrar eder.

DB düşükken giriş yapılmışsa daha da sinsi: `authorize()` catch bloğu DB'siz bir kullanıcı
(`superadmin-yasin`) döndürür, JWT'ye yazılır ve DB geri geldiğinde bile **çerez eskidir** —
`tenantId` ancak yeniden `signIn` ile tazelenir. Çıkış yapıp yeniden gir.

İlgili: [[fabrika-runtime-verification-recipe]] · [[fabrika-withtenant-set-config]] ·
[[fabrika-rls-bypass-local-dev]] · [[agent-exit-129-sighup]]
