---
name: fabrika-systemalert-probe-time-filter-false-zero
description: "SystemAlert'i \"şu andan sonra oluşanlar\" diye sorgulayan sonda YANLIŞ SIFIR döndürür — iki bağımsız neden: createdAt timestamp-without-tz (node-pg yerel offset gönderir) ve recordAlert dedupe'u ESKİ satırı günceller; bunun yerine meta içindeki kendi koşu kimliğinle eşleştir"
metadata:
  type: reference
  updatedAt: 2026-09-08
---

"Bu koşu `SystemAlert` üretti mi?" sorusunu şöyle ölçme:

```ts
const since = new Date();                       // ❌
... `select * from "SystemAlert" where "createdAt" >= $1`, [since]
```

2026-09-08 (TASK-MTSYCMWFL22CA) bu sorgu, alert GERÇEKTEN yazılmışken `0` döndürdü ve
kodda olmayan bir kusur raporlamama ramak kaldı. İki bağımsız neden var:

1. **Tip/zaman dilimi.** `SystemAlert.createdAt` = `timestamp without time zone`, içi UTC.
   node-pg bir JS `Date`'i offset'li literal olarak gönderir (TR'de `+03:00`); Postgres
   bunu naive timestamp'e çevirince eşik 3 saat İLERİ kayar ve her satır elenir.
   Zorunluysa naive UTC string ver: `new Date().toISOString().replace('T',' ').replace('Z','')`
   ve `$1::timestamp` diye cast et.
2. **Dedupe.** `recordAlert` aynı kimlikli **çözülmemiş** bir alert'i yeni satır açmak
   yerine günceller ve zaman sınırı yoktur → gerçekten oluşan bir alert için `createdAt`
   eski kalır, "T'den sonra" filtresi onu görmez ([[fabrika-alert-dedupe-needs-stable-meta]]).

**Doğru ölçüm:** sondanın kendi tekil kimliğini (`projectId`, koşu etiketi) alert'in
`meta`'sına düşür ve onunla eşleştir:
```sql
select level, source, left(message,70) from "SystemAlert" where meta::text like '%<RUN-ID>%'
```
Tablo geneli `count(*)` delta'sı da güvenilir DEĞİLDİR: bu paylaşılan bir geliştirme
DB'si, ölçüm sırasında başka ajanların işleri de alert yazıyor (ölçüldü:
`invoice_buyer_identity_missing` araya girdi) — [[fabrika-shared-dev-db-can-be-reset-under-you]].

Yan tespit (ölçüldü): `recordAlert` `fabrika_app` (NOBYPASSRLS) rolüyle satır YAZAR —
`SystemAlert`'te `relrowsecurity=false`. Alert'in düşmemesi bir RLS sorunu değildir.

İlgili: [[fabrika-live-postgres-for-evidence]] · [[fabrika-e2e-probe-rows-must-be-deleted-and-labelled]]
