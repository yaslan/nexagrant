# TASK-MUMSUA77J1C6Q — be-fb: dev DB kiracı silinmesi kök nedeni, guard'lar, seed ModuleState

**Durum:** tamamlandı.

**Commit'ler (`dev`, push yapılmadı):**

| Commit | Ne yapıyor |
|---|---|
| `b2d2c275` | Test teardown guard'ları, statik bekçi |
| `264c8aa6` | Bekletilen 2 test dosyası |
| `52cf762b` | 3 server action guard'ı |
| `cbaff4fb` | seed ModuleState |

`264c8aa6`'daki iki dosya devop-fb'nin jobs taşıma index'indeydi. Taşıma commit'lendikten sonra ayrı commit'lendi.

**Platform:** mac (Darwin 27, Docker `fabrika-postgres` :5433, Chrome). Değişen kodun hiçbiri platforma bağlı değil: Prisma `where` değerleri, TS AST taraması ve seed upsert'i. Windows ve Linux koşulamadı, çünkü bu makinede yalnız mac var. Koddan bakınca aynı davranmaları beklenir. Tarayıcı `path.join` / `path.relative` kullanıyor, sabit `/` ayırıcısı yok.

## 1) Ne yapıldı

### (1) Kök neden, izole DB'de kanıtlandı
- `CREATE DATABASE befb_b4` ve `prisma db push` ile ayrı bir DB kuruldu. Paylaşılan `fabrika`'ya dokunulmadı.
- Betik, DB adı `/befb_b4` değilse çalışmayı reddediyor.
- Kurulum: 3 kiracı ve her birine 1 AuditEvent. Ardından `bearer-token-hash.live.test.ts:45` afterEach'inin birebir kalıbı, `tenantId` hiç atanmamışken koşuldu.

### (2) Test teardown envanteri ve guard'lar
- `/usr/bin/grep -rn 'deleteMany\|delete(' tests src --include='*.test.ts' --include='*.test.tsx'` → **213 satır**.
- Bunlar TS AST ile sınıflandırıldı. Bekçi testine eklenen `tests/helpers/where-guard-scan.ts` bu işi yapıyor.
- Sonuç: 22 dosyada **89 korumasız `where` değeri**. Hepsi sarıldı.
- **Yardımcı** (`tests/helpers/teardown-guard.ts`):
  - `requireId(x, label)`: `undefined`, `null` ya da `''` gelirse hata fırlatır.
  - `presentIds([...])`: `in:` listesinden eksik id'leri atar. Boş liste hiçbir satırla eşleşmez, yani güvenli taraftadır.
- **`delete` (tekil) guard'a alınmadı.** Unique `where` ister; Prisma undefined'da hata fırlatır.
- **`in: [a?.id, b?.id]` guard'a alınmadı.** Prisma `Can not use undefined value within array` hatası fırlatır; kanıtı aşağıda.

### (3) Statik bekçi: `tests/teardown-where-guard.test.ts`
- `tests/**` altındaki ve `src/**` test dosyalarındaki her `.deleteMany(` / `.updateMany(` çağrısına bakıyor.
- `where` içindeki her değer şunlardan biri olmalı: literal, dizi literali, iç içe nesne, `requireId` / `presentIds`, ya da aynı dosyada güvenli bir initializer'a sahip `const` (`const` nesnenin literal alanı da olur).
- Kırmızı sayılanlar: `let`, parametre, döngü değişkeni, `ids.x`, bunlar üzerinden `{ tenantId }` kısaltması, ve `where`'siz `deleteMany()`.
- Testin içinde bilinen pozitif ve negatif fixture'lar var. Bunlar tarayıcının gerçekten yakaladığını kanıtlıyor.

### (4) Üretim kodu (src / prisma / scripts)
Aynı tarayıcı üretim koduna da koşuldu: 526 dosya, 90 `deleteMany` bulgusu. Her `src` bulgusunda değerin nereden geldiği izlendi.

| Yol | Değerin kaynağı | Risk | Sonuç |
|---|---|---|---|
| `evidence/actions.ts` `deleteEvidence(evidenceId)` | Server action argümanı (istemci) | **Orta.** Rol şartı olmayan herhangi bir üye, `undefined` gönderince `findFirst` bir kayıt bulur ve `deleteMany({tenantId})` kiracının **tüm** kanıtlarını siler | **Guard eklendi** |
| `settings/api-keys/actions.ts` `revokeApiKey(keyId)` | Server action argümanı | Düşük/orta. `manage_users` rolü kiracının tüm anahtarlarını tek çağrıda iptal eder | **Guard eklendi** |
| `m8/server/actions.ts` `computeSeatCandidates(opp, seat)` | Server action argümanı | Düşük. Kiracının tüm koltuk adaylarını siler (yeniden hesaplanabilir veri) | **Guard eklendi** |
| `m9/calendar-actions.ts` `disconnectCalendar` | Argüman | Yok | `findUnique({id: undefined})` hata fırlatır |
| `api/saved-searches/[id]` DELETE | Route param | Yok | Değer her zaman string |
| `jobs/tasks/users-scheduled-deletion.ts` | `user.id`, DB satırından | Yok | — |
| `m10/actions.ts` `createNewVersion` | `existing.id`, DB satırından | Yok | — |
| `scoring/consortium.ts`, `m8/matching.ts` | Çağıranın `seatId`'si | Yukarıdaki guard ile kapandı | — |
| `billing/plan-repository.ts` `deletePlan` | Platform-admin argümanı | Yok | Önce `countLiveSubscriptions`, sonra `plan.delete` hata fırlatır ve transaction geri alınır |
| `billing/plan-repository.ts` `unassignPlanFromTenant` | Platform-admin argümanı | Düşük (yalnız platform admin; bir kiracının tüm plan atamaları) | Açık, Ö-2 |
| `stripe-event-retention.ts` | Hesaplanan `cutoffDate` | Yok | — |
| `scripts/seed-*-e2e.ts` (6 dosya, 65 bulgu) | Betiğin kendi oluşturduğu fixture'lar | **Dikkat:** `seed-st6-empty-e2e.ts:123-141` Cordis tablolarını **bilerek filtresiz** siliyor. Paylaşılan DB'ye karşı koşulursa tüm Cordis verisi gider | Değiştirilmedi, R-2 |

Aynı sınıfta bir güncelleme riski de var: `verifyEvidenceAction(evidenceId, status)` `updateMany`, `undefined` ile kiracının tüm kanıt durumlarını değiştirir. Kapsam silme olduğu için değiştirilmedi, Ö-1'e yazıldı.

### (5) Seed açığı: ModuleState
- Kök neden: `modules` üstündeki yorum ModuleState'i vaat ediyor. Onu yazan döngü `2087a788`'de vardı, `dcbd0863`'te (E11.2 feedback seed commit'i) yanlışlıkla silinmiş.
- `prisma/seed.ts` içine `seedDemoModuleStates()` eklendi:
  - demo-tenant'ın aboneliği okunur.
  - `grantsFor(planId).moduleIds` ON, geri kalanlar OFF olur.
  - Yazım `(tenantId, moduleId)` üzerinden upsert. İki kez koşmak aynı 11 satırı yeniden yazar.
- Gate, planı ayrıca kontrol ediyor. Bu yüzden bir ON satırı planın sattığından fazlasını açamaz.

### (6) `double-charge-prevention`
Seed sonrası paylaşılan DB'de yalnız bu dosya koşuldu → 5/5 yeşil.

## 2) Kanıt

### (1) Kök neden, izole `befb_b4`
```
before (1) { tenant: 3, audit: 3 }
deleteMany({ where: { id: undefined } }) → { count: 3 } after { tenant: 0, audit: 0 }
before (2) { tenant: 3, audit: 3 }
auditEvent.deleteMany({ where: { tenantId: undefined } }) → { count: 3 } after { tenant: 3, audit: 0 }
in:[undefined,undefined] threw:  Invalid value for argument `in[0]`: Can not use `undefined` value within array. Use `null` or filter out `undefined` values.
guarded → teardown: tenantId is undefined; refusing to run a filterless delete after { tenant: 3, audit: 3 }
```
- Sonuç: tek bir korumasız afterEach, 12:46–12:49 UTC'deki toplu silmeyi (Tenant 0, Workspace/Membership kaskadla 0, User 42 duruyor) birebir üretir.
- **Hangi koşunun yaptığı hâlâ kesinleştirilemiyor.** Aday dosyalar bu kartta kapatıldı.

### (2) + (3) Bekçi ve mutantlar
```
npx vitest run tests/teardown-where-guard.test.ts tests/server-action-missing-id.test.ts tests/modules/api-keys.test.ts
 Test Files  3 passed (3)   Tests  43 passed (43)

M1 bearer-token-hash.live.test.ts:46 requireId kaldırıldı:
   × no test file in the repo has an unguarded where
   + "tests/bearer-token-hash.live.test.ts:46 id: tenantId"      → ÖLDÜ   M1_RESTORED_OK (md5)
M2 deleteEvidence guard satırı silindi:
   × refuses undefined / null / "" without touching the table   → ÖLDÜ (3 failed)   M2_RESTORED_OK (md5)
```
Guard, son commit'ten sonra tüm repoda yeşil (3/3). Buna arada gelen diğer ajan commit'leri de dahil.

### (5) Seed, önce izole DB'de iki kez
```
run1 exit=0  Demo ModuleState seeded (pro: M1, M2, M3, M4, M5, M6, M8 ON).
11|M1=ON,M10=OFF,M11=OFF,M2=ON,M3=ON,M4=ON,M5=ON,M6=ON,M7=OFF,M8=ON,M9=OFF
run2 exit=0  (aynı 11 satır, aynı değerler)
```

**Paylaşılan DB, `pnpm db:seed`.** Plan, PlanVersion ve ModuleState önceden `pg_dump --data-only` ile yedeklendi (64 satır, scratchpad).
```
                  önce  sonra
Tenant              1     1
User               42    42
Workspace           1     1
Membership         11    11
Plan                7     7
PlanVersion         7     7
ModuleState(demo)   0    11
Opportunity         5     5
```

**Gerçek tarayıcı** (Chrome, kendi `next dev` :3000'im, sonra kapatıldı). Adımlar: `/tr/giris` → e-posta `alice@fabrika.test` → gönder → `/tr/default/dashboard` → yan menüden **Fırsatlar** linkine tıklandı.
```
opportunities url: http://localhost:3000/tr/default/firsatlar
unavailable text present: false
h1: Fırsat & Teklif Boru Hattı
pageerrors 0
```
- Kare: `docs/agent-results/TASK-MUMSUA77J1C6Q-screenshots/01-demo-firsatlar-seed-sonrasi.png`. G0 ile G4 arası 5 demo fırsatı görünüyor.
- Önceki durumun karesi devop-fb'de: `TASK-MUMO37MNYHV42-screenshots/04-seed-sonrasi-pipeline.png` ("Bu modül şu anda kullanılamıyor").

### (6) double-charge-prevention (paylaşılan DB, yalnız bu dosya)
```
Tenant before: 1
 Test Files  1 passed (1)   Tests  5 passed (5)
Tenant after: 1
```

### Tam süit: izole `befb_b4`
- Ortam değişkenleri `DATABASE_URL`, `_MIGRATE` ve `_RLS_TEST`'in üçü de `befb_b4`'e yönlendirildi.
- DB hazırlığı: `db push`, `db:seed`, `db:rls` (112 politika), `db:rls-role`.
```
Test Files  1 failed | 218 passed | 2 skipped (221)
     Tests  2 failed | 2466 passed | 64 skipped (2532)
 FAIL tests/m9-calendar-connect.test.ts > connectCalendar > (2 test)
shared Tenant: 1   (koşu öncesi de 1)
```
- Kalan 2 kırmızı benim değişikliğim değil. Kaynağı `8caeda56` (TASK-MUMT3KVHJTYX0): `calendar-actions.ts` `findUnique`'e `select: { id: true }` ekledi, mock testi ise eski argümanı bekliyor (`tests/m9-calendar-connect.test.ts:124`). O kartın sahibine ait.
- İlk koşuda 7 dosya kırmızıydı. Nedeni, izole DB'yi `grantPeriod` kolonunu ekleyen `2c20324f`'ten önce kurmuş olmamdı. DB yeniden kuruldu, 6 dosya yeşile döndü.

### Kalite kapısı
- `pnpm typecheck` → exit 0.
- `npx eslint <32 değişen dosya>` → 0 hata. İki uyarı yalnızca listeye karışan devop-fb doküman dosyaları için ("ignored").

## 3) Değişen dosyalar
- **Yeni:**
  - `tests/helpers/teardown-guard.ts`
  - `tests/helpers/where-guard-scan.ts`
  - `tests/teardown-where-guard.test.ts`
  - `tests/server-action-missing-id.test.ts`
- **Test teardown satırları ve import** (22 dosya):
  - `src/lib/billing/{pilot-gates,pilot,plan-admin,plan-repository,public-sector-assignment}.test.ts`
  - `src/lib/jobs/tasks/__tests__/cron-tenant-scope.test.ts`
  - `tests/{application-outcome,bearer-token-hash,gdpr-data-subject,invitation-mail-limit,k3-topic-stats-import,stripe-webhook-tenant-scope,system-scope,weekly-active-users}.live.test.ts`
  - `tests/modules/settings-modules-plan.test.ts`
  - `tests/plan-entitlement-version.spec.ts`
  - `tests/e2e/{invoice-export-locale,invoice-foreign-currency-export,invoice-write-path,m8-matching,m9-calendar-connect,registration-consent}.spec.ts`
- **Üretim:**
  - `src/app/[locale]/(app)/[workspace]/evidence/actions.ts`
  - `src/app/[locale]/(app)/[workspace]/settings/api-keys/actions.ts`
  - `src/modules/m8/server/actions.ts`
  - `prisma/seed.ts`
- **DB:**
  - Paylaşılan `fabrika`: yalnız demo-tenant için 11 ModuleState satırı eklendi (seed).
  - İzole `befb_b4`: bana ait, kanıt için duruyor.

## 4) Riskler
- **R-1.** Guard statik; yalnız `deleteMany` / `updateMany` çağrısının `where`'ine bakıyor. Bir yardımcı fonksiyona geçirilen parametreyi dosya dışına izlemiyor; parametreler zaten kırmızı sayılıyor.
  - Bir const'un initializer'ı "güvenli" sayılan bir biçimde olup çalışma anında undefined üretebilecek tek durum `presentIds` dışındaki çağrılar. Bunlar zaten kırmızı.
- **R-2.** `scripts/seed-st6-empty-e2e.ts` Cordis tablolarını bilerek filtresiz siliyor. Diğer `scripts/seed-*-e2e.ts` betiklerinde de 58 korumasız değer var. Bunlar bu kartta değiştirilmedi, çünkü dev/e2e betikleri ve değerler kendi fixture'larından geliyor. Paylaşılan DB'ye karşı koşulmamalılar.
- **R-3.** Seed, demo-tenant'ın ModuleState'ini her koşuda plan grant'ına geri yazıyor (`update: { status }`, `2087a788`'deki davranış). Bir yöneticinin dev DB'de elle yaptığı değişiklik yeniden seed'le geri döner.
- **R-4.** `prisma/seed.ts`, `tsconfig` `include` kapsamında değil. Tip hatası `tsc`'de değil, ancak `tsx` koşusunda görünür. Seed iki kez koşuldu, ikisi de exit 0.

## 5) Açık sorular
- **Ö-1.** Aynı "server action argümanı istemciden gelir" sınıfında güncelleme yolları da var, ör. `verifyEvidenceAction` `updateMany({ where: { id, tenantId } })`. Tüm server action'lara Zod ile id doğrulaması getiren ayrı bir kart açılsın mı? CLAUDE.md "Zod ile giriş doğrulama" diyor.
- **Ö-2.** `unassignPlanFromTenant`'a (yalnız platform admin) guard eklensin mi?
- **Ö-3.** `tests/m9-calendar-connect.test.ts` kırmızısı `8caeda56` sahibine bildirilmeli.

## 6) Sonraki adım
- Bu kart incelemeye (crw-fb) gidebilir.
- Ö-1 için ayrı kart önerisi.
- Paylaşılan DB'de silinmiş öteki test kiracıları (Crwfb-Pilot, Fefb-Pilot, Kamu B11) seed kapsamında değil; gerekirse kendi kartlarında yeniden kurulmalı.
