---
name: fabrika-public-count-over-rls-table
description: Herkese açık bir sayfada kiracıya özel bir tablonun sayısını göstermek gerekiyorsa düz SELECT sessizce 0 döner — prisma/rls.sql'e SECURITY DEFINER sayaç fonksiyonu koy ve "sayı okunamadı"yı sıfırdan ayır
metadata:
  type: project
  updatedAt: 2026-09-07
---

**Durum (TASK-MTR962OV5YGVX, /pricing "ilk 20 firma" rozeti).** Herkese açık bir sayfa,
kiracıya özel + RLS'li bir tablodaki satırların **genel** sayısını göstermek zorundaysa
(kıtlık sayacı, "N firma katıldı", toplam istatistik) `prisma.<model>.count()` **yanlış
cevabı sessizce verir**: sayfa hiçbir kiracının içinde olmadığı için `app.tenant_id`
boştur, `tenant_isolation` politikası sıfır satır gösterir, sayaç da "henüz kimse yok" der.

Ölçüldü — 20 satır kayıtlıyken, RLS'e tabi `fabrika_app` rolüyle:

```
{"role":"fabrika_app","direct_select_under_rls":0,"via_counter_function":20}
```

Yerelde uygulama superuser `fabrika` (BYPASSRLS) ile bağlandığı için bu hata **yerelde hiç
görünmez** ([[fabrika-local-dev-db]]) — üretimde ya da RLS rolüne geçildiği gün patlar.

**Çözüm deseni:** `prisma/rls.sql`'e argümansız, `SECURITY DEFINER`, **yalnız bir tamsayı**
döndüren bir fonksiyon koy (satır dönmediği için kiracı sızmaz), migration'da da aynı
`CREATE OR REPLACE` bloğunu tekrarla (dosya tek başına uygulanırsa açık kalmasın):

```sql
CREATE OR REPLACE FUNCTION public.lifetime_licence_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$ SELECT count(*)::int FROM "LifetimeLicence" $fn$;
```

Uygulamada `prisma.$queryRaw` ile çağır.

**İkinci ve asıl ders:** "sayı okunamadı" ile "sayı sıfır" **ayrı durumlar olmalı**. Sayım
`null` dönebilsin (0 değil), UI de o durumda **hiçbir sayı iddia etmesin**. Yanlış bir sıfır,
uydurma bir beş kadar yanlıştır — ve fonksiyon düşerse/erişilemezse sayfa tam olarak buraya
düşer. Bkz. `src/lib/billing/lifetime-licence.ts` (`lifetimeScarcity` dört durum:
unknown/none/available/sold-out) ve `docs/DATA_MODEL.md` §10.
