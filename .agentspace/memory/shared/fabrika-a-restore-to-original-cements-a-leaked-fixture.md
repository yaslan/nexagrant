---
name: fabrika-a-restore-to-original-cements-a-leaked-fixture
description: Paylaşılan DB'de "orijinali beforeAll'da oku, afterAll'da geri yaz" kalıbı bir onarım DEĞİL tek yönlü cırcırdır — sızmış değer bir sonraki koşumda "orijinal" sayılıp kalıcılaşır
metadata:
  type: project
  updatedAt: 2026-09-09
---

`tests/e2e/plan-entitlement.spec.ts` paylaşılan `demo-tenant`'ın planını
değiştirir: `beforeAll` `originalPlanId = sub.planId` diye okur, testler
`setPlan('basic')` / `setPlan('ultra')` yapar, `afterAll` `setPlan(originalPlanId)`
ile geri yazar. Kalıp doğru görünür ve **değildir**.

Koşum yarıda kesilirse (süreç öldü, kapı durdu, pane kapandı) `afterAll` çalışmaz
ve kiracı `ultra`'da kalır. Bir sonraki koşum `originalPlanId`'yi **o bozuk
durumdan** okur ve sonunda sadakatle `ultra`'yı geri yazar. Yani geri yazma
sızıntıyı temizlemez, **mühürler**: cırcır tek yönlüdür, kendi kendine düzelmez,
ve elle onarılana kadar başka spec'leri düşürür.

2026-09-09'da ölçüldü (TASK-MTU4AYW5R9DGL): `pnpm gate`'in e2e adımında tek düşen
test `tests/e2e/admin-plan-editor.spec.ts:160` idi
(`getByTestId('delete-blocked-note')` bulunamadı). Kod kusuru değildi:

```
RAW_SUBS [{"tenantId":"demo-tenant","planId":"ultra","planVersionId":"pv_pro_1","status":"ACTIVE"}]
```

`planVersionId` pro'yu, `planId` ultra'yı gösteriyordu; tohum
(`prisma/seed-tenant-workspace.ts:129`, `DEMO_PLAN_ID = resolvePlanId('team')`)
pro yazar. Tek alanı `pro`'ya çevirdikten sonra aynı spec, aynı kodla `13 passed`.

## Nasıl davran

- Teşhiste **önce veriye bak**: paylaşılan kiracıya binen bir spec kırmızıysa
  koddan önce satırı oku. Kodda değişiklik olmadan yeşile dönüyorsa kusur veridir.
- Yeni spec yazarken orijinali geri yazma — **kendi kiracını kur**
  (`scripts/seed-plan-e2e.ts` bu tuzağı iki spec için zaten böyle çözdü;
  `plan-entitlement.spec.ts` o taşımanın dışında kaldı).
- Geri yazman şartsa "orijinal"i çalışma anındaki DB'den değil, **tohumun beyan
  ettiği sabitten** al; o zaman restore gerçekten bir onarımdır.
- Aynı sınıf: `scripts/seed-f10-e2e.ts`'de tamamlanmamış rollback'in bıraktığı
  `User` satırı sonraki her koşumu `User_email_key` ile bloke ediyordu; çözüm
  upsert'ten önce adresi sahiplenmekti.

[[fabrika-e2e-own-fixture-hides-route-bugs]] · [[fabrika-agents-share-one-working-tree]] ·
[[fabrika-local-dev-db]] · [[fabrika-prove-the-fix-against-the-real-database]]
