# TASK-MTUGK2OUVAFDN — RLS sapma taraması (migration dosyaları)

## 1. Ne yapıldı

`CalendarConnection` migration'ında bulunan dört sapma sınıfının (`AS RESTRICTIVE`,
`FORCE ROW LEVEL SECURITY` eksikliği, `current_setting`'in `missing_ok` argümanının
eksikliği, tanımlanamayan sahte `is_system` baypası) diğer migration dosyalarında da
olup olmadığı tarandı. Referans desen: `prisma/rls.sql:19-22`.

Taranan dosyalar (görevde verilenlerin tamamı):

1. `prisma/migrations/add-feedback.sql`
2. `prisma/migrations/add-m6-evaluator-lens.sql`
3. `prisma/migrations/add-lifetime-licence.sql`
4. `prisma/migrations/auditevent-tenant-or-shared.sql`
5. `prisma/migrations/auditevent-tenant-or-shared.down.sql`
6. `prisma/migrations/add-plan-versioning/migration.sql`
7. `prisma/migrations/add-m10-dual-approval-persistence/migration.sql`

Yöntem: her dosya `Read` ile tam okundu, sonra dört ölçüt `grep -n` ile bağımsız
doğrulandı (bkz. §2, §4 komut çıktıları). Bu **statik metin karşılaştırmasıdır — canlı
ölçüm YOK** (aşağıya bkz, ÇAKIŞMA KURALI gereği `pnpm dev`/`db:migrate`/`db:rls`/
`rls:verify`/`test:e2e`/`gate` koşulmadı, DB'ye bağlanan hiçbir komut çalıştırılmadı).

## 2. Sonuç tablosu — dört ölçüt ayrı ayrı

| Dosya | AS RESTRICTIVE (olmamalı) | FORCE ROW LEVEL SECURITY | current_setting(...,true) | WITH CHECK var mı | Verdict |
|---|---|---|---|---|---|
| add-feedback.sql | yok ✅ | var ✅ (`FORCE  ROW LEVEL SECURITY`, çift boşluk — kozmetik) | var ✅ | var ✅ | **Referansla uyumlu** |
| add-m6-evaluator-lens.sql (Reviewer/Criterion/Score) | yok ✅ | var ✅ | var ✅ | var ✅ | **Referansla uyumlu** |
| add-lifetime-licence.sql | yok ✅ | var ✅ (çift boşluk) | var ✅ | var ✅ | **Referansla uyumlu**; `lifetime_licence_count()` SECURITY DEFINER fonksiyonu **kasıtlı istisna** ([[fabrika-rls-audit-check-four-things-not-one]] ailesi, `prisma/rls.sql:56-71` ile aynı gövde) |
| auditevent-tenant-or-shared.sql | yok ✅ | var ✅ | var ✅ | var ✅ (2×, `tenant_or_shared` policy) | **Referansla uyumlu**; `tenant_or_shared` deseni **kasıtlı** — `AuditEvent.tenantId` nullable, `tenant_isolation` altında `NULL = 'x'` NULL döner ve satır ne okunur ne yazılır (TASK-MTU6HUB8FUHMG C-2 gerekçesi dosyanın kendi başlığında yazılı) |
| auditevent-tenant-or-shared.down.sql | yok ✅ | var ✅ | var ✅ | var ✅ | **Referansla uyumlu** (bilinçli rollback — sıkı `tenant_isolation`'a döner, dosyanın kendi yorumu bunu açıkça uyarıyor) |
| add-plan-versioning/migration.sql (PlanAssignment) | yok ✅ | var ✅ | var ✅ | var ✅ | **Referansla uyumlu** |
| add-plan-versioning/migration.sql (Plan/PlanVersion/PlanFeature) | yok ✅ | **yok** (platform tablo deseni, `rls.sql:78-93` ile birebir aynı — FORCE orada da yok) | n/a (bu politika `current_setting` kullanmıyor, `USING (true)` / `WITH CHECK (false)`) | var ✅ (3 politika: no_insert/no_update/no_delete) | **Referansla uyumlu** — platform tablo ailesi, `tenant_isolation` deseninin konusu değil |
| add-m10-dual-approval-persistence/migration.sql (DualApprovalStep) | yok ✅ | var ✅ | var ✅ | var ✅ | **Referansla uyumlu** |

## 3. Genel sonuç

Taranan 7 dosyanın **hiçbirinde gerçek bir sapma bulunmadı**. `CalendarConnection`
migration'ındaki dört sapma sınıfı bu dosyalarda tekrarlanmamış — hepsi
`prisma/rls.sql:19-22` referans desenini (ENABLE + FORCE + `USING`/`WITH CHECK` ile
`current_setting('app.tenant_id', true)`) birebir taşıyor. `AS RESTRICTIVE` hiçbir
dosyada yok; tanımlanamayan bir `is_system` baypası da hiçbirinde yok.

İki aile bilinçli istisna olarak işaretlendi (görevde talimat edildiği gibi sapma
sayılmadı):

- **`add-lifetime-licence.sql`** — `lifetime_licence_count()` SECURITY DEFINER
  fonksiyonu, `prisma/rls.sql:56-71`'deki aynı istisna ailesi (kamuya açık fiyatlandırma
  sayfası tenant bağlamı dışından tek bir tamsayı okuyor, satır sızdırmıyor).
- **`auditevent-tenant-or-shared.sql` / `.down.sql`** — `tenant_or_shared` deseni,
  nullable-tenant için ayrı bir desen (`Document`/`Chunk`/`ConceptTemplate` ile aynı
  aile, `rls.sql:36-47`); `tenant_isolation` değil.

Ayrıca `add-plan-versioning/migration.sql` içindeki `Plan`/`PlanVersion`/`PlanFeature`
politikaları `tenant_isolation` ailesinden değil, platform-tablo ailesinden
(`rls.sql:78-93` ile birebir aynı satırlar) — bu üçünde FORCE yok ama bu referansın
kendisiyle de tutarlı, çünkü platform yazmaları tablo sahibi rolüyle yapılıyor ve
FORCE zaten yalnız tablo sahibini bağlar.

## 4. Kanıt — grep çıktıları (statik, DB'siz)

```
$ grep -n "FORCE" prisma/migrations/add-feedback.sql prisma/migrations/add-lifetime-licence.sql
prisma/migrations/add-feedback.sql:73:ALTER TABLE "Feedback" FORCE  ROW LEVEL SECURITY;
prisma/migrations/add-lifetime-licence.sql:53:ALTER TABLE "LifetimeLicence" FORCE  ROW LEVEL SECURITY;
```

(İlk otomatik grep taraması `FORCE ROW LEVEL SECURITY` tek-boşluk deseni aradığı için
bu iki dosyada çift boşluk yüzünden yanlış-negatif verdi; dosyaları tekrar `Read` ile
tam okuyup elle doğruladım — kayıt burada, çünkü aynı hata bir sonraki tarayıcıyı da
yanıltabilir.)

Diğer 5 dosyada (`add-m6-evaluator-lens.sql`, `auditevent-tenant-or-shared.sql`,
`auditevent-tenant-or-shared.down.sql`, `add-plan-versioning/migration.sql`,
`add-m10-dual-approval-persistence/migration.sql`) `FORCE ROW LEVEL SECURITY` tek
boşlukla yazılı ve grep'te doğrudan eşleşti (her birinde 1 kez).

`AS RESTRICTIVE` — 7 dosyanın hiçbirinde 0 eşleşme (case-insensitive).
`current_setting('app.tenant_id', true)` — 7 dosyanın her birinde ≥2 eşleşme (USING +
WITH CHECK), `missing_ok` argümanı olmadan çağrılan tek bir `current_setting('app.tenant_id')`
yok.
`WITH CHECK` — 7 dosyanın her birinde en az 1 eşleşme.
`is_system` — 0 eşleşme.

## 5. Değişen dosyalar

**Yok.** Bu bir tarama görevi; sapma bulunmadığı için `prisma/rls.sql` veya
`prisma/schema.prisma`'ya (zaten görev yasaklıyordu) ya da taranan migration
dosyalarına hiçbir değişiklik yapılmadı.

```
$ git status --short prisma/
(boş çıktı — prisma/ altında hiçbir değişiklik yok)
```

Genel `git status --short` çıktısı (bu depoda halihazırda başka ajanların bıraktığı,
bu görevle ilgisiz değişiklikler var — dokunmadım):

```
 M .agentspace/builtin-skills.json
 M .agentspace/memory/agents/blockzincir-pm/MEMORY.md
 M .agentspace/memory/agents/blok-zincir-denet-i/MEMORY.md
 M .agentspace/memory/agents/blok-zincir-dev/MEMORY.md
 M .agentspace/memory/agents/blok-zincir-lead/MEMORY.md
 M .agentspace/memory/agents/customer-support/MEMORY.md
 M .agentspace/memory/agents/geli-tirici/MEMORY.md
 M .agentspace/memory/shared/MEMORY.md
 M .agentspace/memory/shared/agentspace-delegate-splits-numbered-lists.md
 M docs/.agent-notifications
?? (çok sayıda .agentspace/memory/... ve docs/agent-results/... — diğer ajanların
    bu turdaki paralel işleri; TASK-MTUGK2OUVAFDN kapsamı dışında)
```

## 6. Riskler

- Bu tarama yalnız görevde adı verilen 7 dosyayı kapsıyor. `prisma/migrations/`
  altında başka `CREATE POLICY` içeren dosya olup olmadığı ayrıca kontrol edilmedi
  (görev kapsamı buydu — genişletmedim).
- Statik metin karşılaştırması: dosyanın *metni* referansla uyumlu olsa da, bu
  dosyanın gerçekten en son bu haliyle veritabanına uygulandığının kanıtı yok —
  hangi migration dosyasının veritabanında "son koşan" olduğu ayrı bir sorudur
  ([[fabrika-rls-audit-check-four-things-not-one]] madde 4'te de not edilmiş).
  `pnpm rls:verify` canlı ölçümü bu turda blok-zincir-dev'e ayrıldığı için burada
  koşulmadı.

## 7. Açık sorular

Yok — tarama tamamlandı, gerçek sapma bulunmadı, düzeltilecek bir şey yok.

## 8. Sonraki adım

- `pnpm rls:verify` (canlı ölçüm) bu turun sonunda blok-zincir-dev'in DB/port
  penceresinde koşulmalı; bu rapor yalnız statik metin kanıtı sağlıyor.
- Bu 7 dosyanın dışında kalan `prisma/migrations/` dosyalarının da aynı 4-sütunlu
  yöntemle taranması (görev kapsamı dışında bırakıldı) ileride bir görev olabilir.

## 9. Platform beyanı

**mac (Darwin 25.6.0)** üzerinde çalışıldı. Bu görev yalnız statik SQL metni
karşılaştırması (Read + grep) içeriyor; hiçbir platforma-özgü kod yoluna (süreç
öldürme, dosya yolu ayracı, kabuk/ikili adı, ekran/DPI, mikrofon/kamera izni)
dokunulmadı, bu yüzden Windows/Linux farkı yok — `grep`/dosya okuma sonuçları
platform bağımsızdır.
