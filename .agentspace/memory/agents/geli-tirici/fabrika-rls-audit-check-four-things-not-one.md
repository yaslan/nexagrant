---
name: fabrika-rls-audit-check-four-things-not-one
description: RLS kapsam denetiminde schema-vs-rls.sql isim karsilastirmasi yetmez - FK-ile-bagli tablolar, nullable tenantId ile politika uyusmazligi ve migration-vs-rls.sql sapmasi ayrica bakilir
metadata:
  type: project
updatedAt: 2026-09-09
---

Fabrika'da RLS kapsamini denetlerken "schema.prisma'daki tenantId modelleri" ile
"rls.sql dizileri" arasinda isim diff'i almak **tek basina yaniltici**: bu diff bugun
0 fark veriyor, ama ucu de gercek olan uc bosluk aciktaydi (TASK-MTU64JWHRNDL).
Sirasiyla su dortu bak:

1. **Isim diff'i** - `tenantId` tasiyip `rls.sql`'de gecmeyen model. (Bugun: yok.)
2. **FK ile kiraciya bagli, `tenantId` tasimayan tablo** - hic politikasi yok ve kapi
   onlari gormuyor. Tespit: `@relation(fields:` hedefi kiraciya ozel bir model olan,
   kendi `tenantId`'si olmayan modeller. Bkz. [[fabrika-rls-gates-share-one-suppression-list]]
3. **`tenantId String?` ile politika uyusmazligi** - `String?` bir alan sıkı
   `tenant_isolation` (`tenantId = current_setting(...)`) altindaysa `NULL` satir ne
   okunabilir ne yazilabilir (`NULL = 'x'` → NULL, true degil). `AuditEvent` tam olarak
   bu; `request-deletion.ts` kasten `tenantId`'siz denetim kaydi yaziyor ve `catch`
   yutuyor → NOBYPASSRLS rolde silme talebinin kaydi sessizce kaybolur.
4. **Migration-vs-rls.sql ifade sapmasi** - `grep -rn "CREATE POLICY" prisma/migrations/`
   ile her kopyayi yan yana koy. `CalendarConnection` migration'i `AS RESTRICTIVE`
   (tek basina uygulandiginda tablo tamamen okunamaz), `FORCE` yok, ve
   `current_setting('app.tenant_id')` `, true` bayragi olmadan (baglam yoksa NULL degil
   **hata**). Tablonun son hali hangi dosyanin en son kostuguna bagli.

`withTenant` atlamasini olcmenin hizli yolu (salt okunur, tekrar uretilebilir):
`grep -rnoE '\bprisma\.(<kiraciModelleri lowerCamel>)\.' src | grep -v '\.test\.' | wc -l`
karsisinda `grep -rnoE '\bwithTenant(On)?[<(]' src scripts | wc -l`.
2026-09-09: src/ 101, scripts/ 179 (kasitli yonetici rolu), withTenant 129.
`scripts/` sayimini bulguya karistirma - seed/e2e kasten superuser kosar.
