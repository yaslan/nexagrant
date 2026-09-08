---
name: fabrika-local-app-role-bypasses-rls
description: Fabrika'da yerelde ÇALIŞAN uygulama RLS'ten muaftır — DATABASE_URL rolü `fabrika` SUPERUSER+BYPASSRLS'tir; kiracı izolasyonunu uygulama üzerinden ölçmek yanlış sonuç verir, DATABASE_URL_RLS_TEST (`fabrika_app`) ile ölç
metadata:
  type: project
  updatedAt: 2026-09-08
---

"Kiracı izolasyonu çalışıyor mu?" sorusunu **uygulamaya sorarak** ölçme. Yerelde ölçüldü
(2026-09-08):

```
 rolname      | rolsuper | rolbypassrls
 fabrika      | true     | true      <-- .env DATABASE_URL, yani ÇALIŞAN UYGULAMA
 fabrika_app  | false    | false     <-- .env DATABASE_URL_RLS_TEST
```

Sonucu: bir API rotası başka kiracının satırını vermiyorsa bunu sağlayan şey RLS **değil**,
koddaki açık `tenantId` yüklemidir. RLS ikinci savunma hattıdır ve yerelde uygulama yolunda
hiç devreye girmez. Bir rotadan `tenantId` filtresini silip "RLS yakalar" demek yerelde
YANLIŞTIR — satır sızar.

**Nasıl ölç.** Üç katman, üçü de gerekli:
1. Metadata: `pg_class.relrowsecurity/relforcerowsecurity` + `pg_policies`.
2. `pnpm rls:verify` — ama bu YALNIZ metadata sayar (`scripts/check-rls-live.ts`: RLS açık mı,
   `tenant_isolation` politikası var mı). Hiçbir satır okumaz, hiçbir çapraz-kiracı denemesi
   yapmaz. "42/42 ✅" bir izolasyon ÖLÇÜMÜ değil, bir envanter.
3. **Gerçek deneme** — `DATABASE_URL_RLS_TEST` ile bağlan (`fabrika_app`, NOBYPASSRLS), iki
   kiracıya birer satır yaz, `SELECT set_config('app.tenant_id',$1,true)` ile birinin bağlamına
   gir ve ötekinin satırını **primary key ile** okumaya çalış (0 satır dönmeli), sonra o
   bağlamdan öteki kiracı etiketli satır INSERT etmeye çalış (`new row violates row-level
   security policy` almalısın). `app.tenant_id` hiç set edilmediğinde de 0 satır dönmeli.

`fabrika_app` rolü yoksa `pnpm db:rls-role` üretir ve `DATABASE_URL_RLS_TEST`'i `.env`'e ekler.

İlgili: [[fabrika-idempotency-which-tables-must-stay-flat]] ·
[[fabrika-opportunity-delete-has-two-fkless-children]]

**2026-09-08 eklemesi — aynı madalyonun diğer yüzü: SIZINTI değil, SESSİZ BOŞLUK.**
Yukarısı "yerelde sızıntı görmezsin" diyor. Ters yön de doğru ve daha sinsi: kiracıya özel
bir tabloyu `withTenant` DIŞINDA okuyan kod yerelde **kusursuz çalışır**, üretimde
(`fabrika_app`) **boş döner**. Çünkü `tenant_isolation` `"tenantId" = current_setting(
'app.tenant_id', true)` karşılaştırır; ayar yoksa her satır için NULL, tablo boş okunur —
hata değil, satır yokluğu. `where: { tenantId }` daraltmayı yapıyormuş gibi görünür ama
politika önce cevap verir.

Ölçülmüş örnek (TASK-MTRJ32BZBY2AI): özel bir paket, **atandığı kiracıdan** kayboldu.
Ölçüm tuzağı: "atanmamış kiracı göremiyor" testi bunu ÖRTER (o boşluk zaten beklenendir) —
**iki yönü de ölç**. Gerçek fonksiyonu o role karşı koşturma reçetesi:
`tests/plan-visibility-rls.spec.ts` (`vi.doMock('@/lib/db', { prisma: rls, withTenant:
(t,cb)=>withTenantOn(rls,t,cb) })` + dinamik import).
