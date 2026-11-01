# TASK-MTU6HY77S1WBH — CalendarConnection RLS politikasını referansla hizala

## 1. Ne yapıldı

`prisma/migrations/add-calendar-connections/migration.sql` içindeki `tenant_isolation` politikası, `prisma/rls.sql:19-22`'deki kanonik desenle birebir aynı hâle getirildi. Dört sapma düzeltildi:

1. **`AS RESTRICTIVE` kaldırıldı.** Tabloda başka permissive politika yoktu; tek başına bir RESTRICTIVE politika hiçbir satırı geçirmez (varsayılan permissive taban olmadan RESTRICTIVE bir "ek kısıtlama" değil, tek kural olur ve mantığı ters işler) — kiracı kendi satırlarını bile göremezdi.
2. **`FORCE ROW LEVEL SECURITY` eklendi.** Yoksa migration'ı koşturan tablo sahibi rol (genelde uygulamanın DB rolü de sahip roldür) politikadan tamamen muaf kalır.
3. **`current_setting('app.tenant_id')` → `current_setting('app.tenant_id', true)`.** İkinci argüman (missing_ok) verilmeyince parametre `SET LOCAL` ile ayarlanmamışsa hata fırlatır; referans desende `true` ile NULL dönüyor (ve NULL karşılaştırması zaten hiçbir satırı geçirmiyor — güvenli varsayılan).
4. **`is_system` baypası tamamen kaldırıldı.** `current_setting('is_system')` adı nokta içermediğinden PostgreSQL'de zaten tanımlanabilir bir custom parametre değildi (yalnızca `namespace.param` biçimi tanınır) — pratikte çalışmayan, yanıltıcı bir "sistem baypası" kavramıydı ve başka hiçbir tabloda karşılığı yok. `WITH CHECK` ifadesi de referans desene uyacak şekilde eklendi (önceki hâlde `WITH CHECK` hiç yoktu, yani INSERT/UPDATE yazma yönü kontrolsüzdü).

Sonuç, artık `prisma/rls.sql`'in `DO $$ ... FOREACH t IN ARRAY [...]` bloğunun ürettiği politikanın metinsel eşdeğeri:

```sql
ALTER TABLE "CalendarConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarConnection" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "CalendarConnection";

CREATE POLICY tenant_isolation ON "CalendarConnection"
    USING ("tenantId" = current_setting('app.tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
```

**Kapsam:** Yalnızca bu tek dosyaya dokunuldu. `prisma/rls.sql` ve `prisma/schema.prisma` dosyalarına hiç dokunulmadı (görev talimatı gereği — başka bir ajan onları paralel düzenliyor). DB'ye bağlanılmadı, `pnpm db:migrate` / `pnpm rls:verify` / e2e / gate koşulmadı.

## 2. Kanıt

Komut çıktısı — yalnızca hedef dosyanın değiştiği ve commit edildiği:

```
$ git status --short prisma/migrations/add-calendar-connections/migration.sql
 M prisma/migrations/add-calendar-connections/migration.sql

$ git commit -m "fix(m-calendar): align CalendarConnection RLS policy with reference pattern" \
    -- prisma/migrations/add-calendar-connections/migration.sql
[dev 374709f] fix(m-calendar): align CalendarConnection RLS policy with reference pattern
 1 file changed, 6 insertions(+), 5 deletions(-)
```

Bu bir SQL sözdizimi/desen düzeltmesi olduğundan ve görev DB bağlantısını yasakladığından "yeşil test" kanıtı yoktur — kanıt, düzeltilmiş SQL metninin `prisma/rls.sql:19-22`'deki referans ifadeyle karakter karakter eşleştiğinin manuel doğrulamasıdır (yukarıdaki blok, referans dosyanın `EXECUTE format(...)` çıktısının `CalendarConnection` için ürettiği metinle aynıdır).

## 3. Değişen dosyalar

- `prisma/migrations/add-calendar-connections/migration.sql` (yalnızca RLS politika bloğu, satır 23-31)

## 4. Sorulan soru: sıralama belirsizliği ve kalıcı çözüm

**Bu migration ile `prisma/rls.sql` farklı sıralarda koşarsa tablonun son hâli ne olur?**

Artık düzeltildiği için iki sıra da **aynı son duruma** yakınsıyor, çünkü:
- Migration'daki `CREATE POLICY` içeriği artık `prisma/rls.sql`'in ürettiği politikayla metinsel olarak özdeş.
- `prisma/rls.sql`, `DROP POLICY IF EXISTS tenant_isolation ON %I` çalıştırıp ardından aynı adı yeniden yaratıyor — dolayısıyla migration önce, `rls.sql` sonra koşarsa politika drop edilip aynı tanımla yeniden yaratılır (fark yok). `rls.sql` önce, migration sonra koşarsa (migration da artık `DROP POLICY IF EXISTS` içeriyor) aynı şekilde drop+recreate olur, sonuç aynı politika metni.
- `ENABLE`/`FORCE ROW LEVEL SECURITY` idempotent DDL'lerdir, sıra fark etmez.

Yani düzeltmeden sonra sıralama artık davranışsal bir risk taşımıyor — **ama bu, migration'ın `rls.sql`'den bağımsız olarak elle senkronize tutulmasına dayanıyor**, ki bu kırılgan: yarın biri `rls.sql`'deki listeye yeni bir alan/koşul eklerse (ör. ek bir `is_deleted` filtresi), CalendarConnection migration'ı elle güncellenmediği sürece yine sessizce sapar. Görev tanımının kendisi de bunu doğruluyor: "beş ayrı migration onu birebir tekrarlıyor" — yani bu zaten tekrarlayan, senkronizasyon riski taşıyan bir desen.

**Bu belirsizliği kalıcı olarak kapatmanın doğru yolu:**

Tek doğruluk kaynağı ilkesini (CLAUDE.md) RLS politikalarına da uygulamak — yani migration dosyalarının politika SQL'ini **tekrar yazmaması**, `prisma/rls.sql`'i **çağırması** (ya da tersi: migration'ların politika oluşturmaması, tabloyu yaratıp RLS'i `rls.sql`'e bırakması). Somut seçenekler:

1. **Migration'lar tabloyu yaratır, politika koymaz.** `prisma/rls.sql` zaten `pnpm db:rls` ile ayrı çalıştırılan tek kaynak; her yeni tenant-scoped tablo `rls.sql`'deki `ARRAY[...]` listesine eklenir (schema.prisma'daki tabloyla birebir, `scripts/check-rls.ts` bunu zaten doğruluyor). Migration dosyasında politika SQL'i hiç yazılmaz — böylece "5 migration aynı deseni tekrarlıyor" durumu yapısal olarak imkânsız hâle gelir. Deploy sırası: migration → `pnpm db:rls`, ki zaten mevcut akış bu (README/CLAUDE.md'de `pnpm db:migrate` sonrası `pnpm db:rls` ayrı adım).
2. Bu mümkün değilse (ör. migration'ın kendi içinde RLS zorunlu olmalı, `rls.sql` koşana kadar tablo açık kalmasın diye), migration'daki politika bloğunu bir **fonksiyon/şablon** üzerinden üretmek (ör. `prisma/rls.sql`'deki `DO $$ ... $$` bloğunu tek satırlık bir migration'dan çağırılabilir bir SQL fonksiyonuna çıkarıp her migration bu fonksiyonu tek satırla çağırır) — böylece metin kopyası değil, tek bir tanım kaynağı olur.

Seçenek 1 daha basit ve mevcut mimariyle (`pnpm db:rls` zaten ayrı, idempotent bir adım) tam uyumlu; ek bir soyutlama gerektirmiyor. Bu, mimari bir karar olduğundan ve birden fazla migration dosyasını etkileyeceğinden — ve şu anda başka bir ajan `rls.sql`/`schema.prisma` üzerinde çalıştığından — kapsam dışında bırakıldı; `docs/ROADMAP.md`'ye "Açık kararlar" olarak eklenmesi önerilir.

## 5. Riskler

- Düzeltme yalnızca SQL metnini referansla hizaladı; DB'ye hiç uygulanmadı, dolayısıyla gerçek bir Postgres üzerinde `rls:verify` ile ölçülmüş bir kanıt yok. Bu görevin kapsamı dışında tutuldu (talimat gereği).
- Aynı "beş migration'da tekrar" deseni, bu görev yalnızca CalendarConnection'ı düzelttiği için diğer 4 migration dosyasında hâlâ mevcut olabilir — kontrol edilmedi (görev kapsamı tek dosyayla sınırlıydı).

## 6. Açık sorular

- Yok — görev net kapsamlıydı.

## 7. Sonraki adım

- `docs/ROADMAP.md`'ye "RLS politika tekrarını migration'lardan kaldır, tek kaynak `prisma/rls.sql` olsun" açık kararı eklenmeli (yukarıdaki Seçenek 1).
- Diğer 4 migration dosyasının da aynı sapmayı taşıyıp taşımadığı ayrı bir görev olarak taranmalı.
