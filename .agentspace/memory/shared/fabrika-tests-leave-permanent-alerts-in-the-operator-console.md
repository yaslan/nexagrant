---
name: fabrika-tests-leave-permanent-alerts-in-the-operator-console
description: Fabrika testleri SystemAlert satırı bırakıyor — kiracı silinse de alarm kalıyor; temizlikte systemAlert.deleteMany unutulmaz
metadata:
  type: project
  updatedAt: 2026-09-10
---

## Gerçek

`SystemAlert`'in `Tenant`'a **FK'si yok, cascade yok**. Bir test kiracı yaratıp alarm
tetikler ve sonra kiracıyı silerse, **alarm sağ kalır** ve bir daha asla doğru olamaz:
`meta.tenantId` artık var olmayan bir satırı gösterir.

2026-09-10 ölçümü (TASK-MTTUUGKNDGBXK): 256 açık alarmın **220'si** böyle doğmuştu.
- `tests/stripe-webhook-idempotency.live.test.ts` → 147 satır (`t-idem-*`)
- `tests/e2e/invoice-write-path.spec.ts` → 69 satır (cuid kiracılar)
- gerçek ürün kusuru olan: **1 satır** (`demo-tenant`)

`.live.test.ts` vitest exclude'unda değil → **`pnpm test` koşan her geliştirici konsola
kalıcı error satırı ekliyor.** 11:09:39 UTC'de suite koşuldu, 11:09:33 ve 11:09:43'te iki
yeni satır yazıldı.

## Why

Alarm yığınının büyük çoğunluğu ürün kusuru sanılıyor ve yanlış karta bağlanıyor.
TASK-MTTUUGKNDGBXK kartı %77'lik grubu TenantBillingIdentity ekranına (TASK-MTSY71BUMBLWM)
bağlamıştı; ölçüm bunu 221 satırdan 220'si için çürüttü. **Bir alarm grubunun kök nedenini
satır sayısından değil, `meta`'nın işaret ettiği kaydın bugün hâlâ var olup olmadığından
oku.**

## How to apply

- Alarm tetikleyen her testin temizliğine, kiracıyı silmeden ÖNCE:
  `await prisma.systemAlert.deleteMany({ where: { meta: { path: ['tenantId'], equals: TENANT_ID } } });`
- Kapsam DAR olsun: `source`'a göre toplu silme komşunun/operatörün gerçek alarmını düşürür.
- Doğru desen depoda ZATEN var: `tests/e2e/purge-failure-alert-console.spec.ts` — `meta`
  yoluna göre kapsamlı `deleteMany`. Yeniden icat etme, kopyala.
- Bir alarm yığınını denetlerken ilk soru "kaç satır" değil, **"bu satırın konusu hâlâ var mı"**.

## Related

[[fabrika-systemalert-resolvedat-has-one-writer]] — yığının hiç küçülmemesinin öbür yarısı
