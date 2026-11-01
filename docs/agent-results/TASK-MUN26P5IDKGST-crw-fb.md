# TASK-MUN26P5IDKGST — crw-fb: İNCELEME-27, TASK-MUMSUA77J1C6Q (be-fb)

**Konu:** paylaşılan dev DB'deki kiracı silinmesinin kök nedeni ve önlemleri.

**İncelenen:** `b2d2c275`, `264c8aa6`, `52cf762b`, `cbaff4fb`, `3bc74a7b`. HEAD `631c7d4c` üzerinde ayrık bir worktree açıldı (scratchpad, `node_modules` `cp -cR` ile kopyalandı).
**DB:** kendi `pgvector/pgvector:pg16` konteynerim `crwfb-mun26`, `:55461/fbcrw`. Paylaşılan `fabrika` (:5433) yalnız `count(*)` ile okundu, hiç yazılmadı. Betiklerim URL `:55461/fbcrw` değilse çalışmayı reddediyor.

## KARAR: DÜZELTME GEREKLİ

- be-fb'nin iddialarının hepsi doğrulandı: kök neden, 3 server action guard'ı, bekçinin yakaladığı biçimler, mutantlar, seed idempotency ve tam süit.
- Yine de iki bulgu kartın vardığı "kapandı" sonucunu tutmuyor:
  - **B-1:** Aynı sınıf (istemciden gelen `undefined` id → filtresiz `updateMany`) üretimde en az 12 yolda açık kalıyor. İkisinde **içerik kaybını** gerçek çağrıyla ürettim. Rapor bu sınıfı yalnız `verifyEvidenceAction` (Ö-1) olarak gösteriyor.
  - **B-2:** Bekçi, "dizi literali güvenlidir" kuralı yüzünden `AND: [{ id: x }]` biçimini güvenli sayıyor. Bu biçim çalışma anında tüm tabloyu siliyor, bekçi ise yeşil kalıyor (M4 mutantı).

---

## 1) Kök neden: kendi DB'mde yeniden üretildi

Betik: `crw/repro.ts` (scratchpad `crw-evidence/`).
- Her denemeden önce `crw-r-1..3` kiracıları ve her birine 1 AuditEvent kuruldu.
- İlk satırdaki 4. kiracı seed'in demo-tenant'ıydı. Sonradan yeniden seed'lendi.

```
tenant.deleteMany({where:{id:undefined}})              {"count":4} before {"tenant":4,"audit":3} after {"tenant":0,"audit":0}
auditEvent.deleteMany({where:{tenantId:undefined}})    {"count":3} before {"tenant":3,"audit":3} after {"tenant":3,"audit":0}
auditEvent.updateMany({where:{tenantId:undefined}})    {"count":3}   ← tüm satırlar güncellendi
tenant.deleteMany({where:{OR:[{id:undefined}]}})       {"count":0}   ← OR:[{}] hiçbir şeyle eşleşmiyor (güvenli)
tenant.deleteMany({where:{AND:[{id:undefined}]}})      {"count":3} before {"tenant":3,...} after {"tenant":0,"audit":0}   ← TÜMÜ
tenant.deleteMany({where:{id:{notIn:[]}}})             {"count":3} after {"tenant":0,...}   ← presentIds([undef]) → [] → TÜMÜ
tenant.delete({where:{id:undefined}})                  THREW: ...needs at least one of `id` or `slug`
nested update data.auditEvents.deleteMany{target:undef} before audit 3 → after 2   ← ebeveynin tüm ilişkili satırları
$executeRaw DELETE ... = ${undefined}                  0             ← NULL olarak bağlanıyor (güvenli)
in:[undefined]                                         THREW: Can not use `undefined` value within array
```

- **Kök neden iddiası DOĞRU.** `{id: undefined}` tüm kiracıları siliyor, Workspace/Membership kaskadla gidiyor.
- `in: [undefined]` hata fırlatıyor, `delete` tekil de. be-fb'nin bu ikisi için verdiği muafiyet de doğru.
- Yeni bulgu: `AND` ve `notIn: []` da filtresiz çalışıyor (B-2).

## 2) Statik bekçinin kaçış yolları

`unguardedWheres()` doğrudan 22 fixture ile koşuldu (`crw/scan-escapes.ts`):

| Biçim | Bekçi | Çalışma anındaki etki (§1) |
|---|---|---|
| kontrol: `deleteMany({where:{id: let}})` | CAUGHT | tümü siliniyor |
| `updateMany({where:{tenantId}})` (let) | CAUGHT | tümü güncelleniyor |
| **`where: { AND: [{ id: let }] }`** | **MISSED** | **tümü siliniyor** → B-2 |
| **`id: { notIn: presentIds([let]) }`** | **MISSED** | **tümü siliniyor** → B-2 |
| `update({ data: { rel: { deleteMany: { x: let } } } })` (iç içe) | MISSED | ebeveynin tüm ilişkili satırları → Ö-1 |
| `data: { rel: { updateMany: { where: { x: let } } } }` | MISSED | aynı sınıf → Ö-1 |
| `$executeRawUnsafe('DELETE FROM "Tenant"')` | MISSED | filtresiz; repoda bu biçim yok → Ö-1 |
| `` $executeRaw`… = ${id}` `` | MISSED | güvenli (NULL) |
| farklı ad: `const tid = tenantId` (let) | CAUGHT | — |
| **aynı adlı const, parametreyi gölgeliyor**: `const tenantId='x'; function c(tenantId?) { deleteMany({where:{id: tenantId}}) }` | **MISSED** | parametre undefined → tümü → Ö-1 |
| aynı dosyada helper parametresi | CAUGHT | — |
| `$transaction(tx => tx.x.deleteMany(...))` | CAUGHT | — |
| `prisma['tenant'].deleteMany` | CAUGHT | — |
| `prisma.tenant['deleteMany'](…)` | MISSED | tümü → Ö-1 (repoda yok) |
| `const { deleteMany } = prisma.tenant` | MISSED | Ö-1 (repoda yok) |
| `const ctx = {id:'p'}; ctx.id = maybe()` (mutasyon) | MISSED | Ö-1 (repoda yok) |
| `?.deleteMany`, spread, koşullu `where`, `args` parametresi, `obj.field` const'u, `NOT:{id}` | CAUGHT | — |

**Helper içinden çağrı:**
- `tests/**` altındaki her `.ts` dosyası taranıyor, `tests/helpers` dahil. Helper parametresi yakalanıyor.
- `src/**` altında test olmayan bir helper taranmıyor. Bugün `src` içinde test yardımcısı olarak kullanılan, test dosyası olmayan bir dosya yok (`find src -path '*test*' ! -name '*.test.ts' …` boş döndü).

**Repoda bugün bekçiden kaçan gerçek bir kalıp var mı?**
- `/usr/bin/grep`: testlerde `AND`/`OR` + `deleteMany` yalnız `tests/e2e/m8-matching.spec.ts:173`'te var. O da `OR: [{ orgA: { in: pics } } …]` biçiminde, `pics` bir dizi, yani güvenli.
- `notIn` yalnız üretimde, `consortium.ts:114`'te var. Uzunluk koşullu (§3).
- Testlerdeki raw DELETE'lerin hepsi const/literal parametreli (`cordis-partner-profile`, `plan-*`).
- **Sonuç:** kaçış yolları bugün sömürülmüyor. Ancak B-2 bekçinin kendi belgelediği kurala ters. Bekçinin varlık nedeni bir sonraki yazarı yakalamak olduğu için düzeltilmeli.

## 3) `src` altında `undefined` id ile toplu silme/güncelleme yapan üretim yolları

Aynı tarayıcı, test olmayan 474 `src` dosyasına koşuldu: **88 bulgu** (`crw/scan-src.ts`). Değerin kaynağı istemciden gelen server action argümanı olan ve guard'sız kalan yollar:

| Yol | Etki (`undefined` id) | Guard |
|---|---|---|
| `src/modules/m11/server/actions.ts:66-70` `savePartContent`; çağıranlar `acquireSectionLock` (:186), :211, :267 | `loadPart(undefined)` ilk parçayı buluyor, `updateMany` o parçanın içeriğini kiracının **tüm** ApplicationPart'larının üzerine yazıyor | yok |
| `src/modules/m2/server/actions.ts:164` `saveConceptNoteDraft` | kiracının tüm concept note **içeriği** eziliyor | yok |
| `src/modules/m10/server/actions.ts:157` `signDocument` | kiracının tüm FollowupDoc'ları **imzalanmış** oluyor | yok |
| `src/modules/m10/server/actions.ts:324` `submitDualApprovalAction` | tüm dokümanlar onay akışına giriyor | yok |
| `concept-notes/actions.ts:167` `updateNoteStatus` | tüm notların durumu değişiyor | yok |
| `evidence/actions.ts:294` `verifyEvidenceAction` | tüm kanıtların durumu (be-fb Ö-1) | yok |
| `pipeline/actions.ts:325` `assignOpportunityOwner`, `:398` `moveOpportunityStage`, `:527` `archiveOpportunity` (findFirst(undefined) → sonra updateMany) | tüm fırsatların sahibi / aşaması / arşiv durumu | yok |
| `pipeline/[id]/consortium/actions.ts:92` `assignSeat` | tüm koltuklar INVITED + org | yok |
| `relationships/actions.ts:120` `updateRelationship` (Zod yalnız `data`'da, `id`'de değil) | tüm ilişkiler | yok |
| `src/modules/m4/server/actions.ts:113` `updateNextStep` | tüm ilişkilerin nextStep'i | yok |
| `m11/server/partner-link.ts:28` | — | `if (!partId) return null` ✓ |
| `m9/calendar-actions.ts:53` | — | önce `findUnique` hata fırlatıyor ✓ |
| `settings/api-keys`, `evidence deleteEvidence`, `m8 computeSeatCandidates` | — | be-fb guard'ları ✓ |
| `src/lib/gates/evaluate.ts:213`, `agency/codes.ts:189` | çağıranın değeri | çağıranlar okunmadı, **doğrulanmadı** |

**Gerçek çağrıyla kanıt** (`crw/undefined-id-actions.test.ts`):
- Yalnız `requireTenantAction`, `next/cache` ve pilot yazma kapısı mock'landı.
- `withTenant` ve Prisma gerçek, izole DB'ye bağlı.
```
["m11 acquireSectionLock(undefined)",{"success":true,...},"before",["part-1","part-2","part-3"],"after",["part-1","part-1","part-1"]]
["m2 saveConceptNoteDraft(undefined)",{"success":true},"before",["{\"marker\":\"note-1\"}","{\"marker\":\"note-2\"}","{\"marker\":\"note-3\"}"],"after",["{\"overwritten\":true}","{\"overwritten\":true}","{\"overwritten\":true}"]]
```

**Erişilebilirlik:**
- Server action argümanları React Flight ile kodlanıyor. `undefined` bu kodlamada `$undefined` olarak geçerli.
- Kiracının herhangi bir üyesi, action ID'si ile doğrudan POST atarak ya da hatalı bir istemci çağrısıyla bu yollara ulaşabiliyor.
- Etki kiracının kendi verisiyle sınırlı, çünkü `tenantId` filtresi duruyor. Ama kayıp **geri dönüşsüz bir içerik kaybı**: m11 Part B metinleri ve m2 notları.

## 4) Mutantlar (4 koşu; her birinden sonra `git checkout`, `git status` temiz)

```
BASELINE                                                         Tests 18 passed (18)
M1 bearer-token-hash.live.test.ts:46 requireId kaldırıldı          × no test file in the repo has an unguarded where
                                                                 + "tests/bearer-token-hash.live.test.ts:46 id: tenantId"   → ÖLDÜ
M2 revokeApiKey typeof/'' guard satırı silindi                     × refuses undefined / null / "" (3 failed)               → ÖLDÜ
M3 computeSeatCandidates guard'ı etkisizleştirildi                 × 5 failed (seat undefined/null/"", opportunity …)      → ÖLDÜ
M4 (kaçış) bearer teardown'u → { AND: [{ id: tenantId }] }         Tests 18 passed (18)                                     → YAŞADI (B-2)
```

## 5) Seed: iki koşu, izole DB

```
önce:   Tenant 0 | User 0 | Plan 0 | PlanVersion 0 | ModuleState 0 | Opportunity 0 | Membership 0
run1 exit=0  Demo ModuleState seeded (pro: M1, M2, M3, M4, M5, M6, M8 ON).
        Tenant 1 | User 11 | Plan 7 | PlanVersion 7 | ModuleState 11 | Opportunity 5 | Membership 11
run2 exit=0  Demo ModuleState seeded (pro: M1, M2, M3, M4, M5, M6, M8 ON).
        Tenant 1 | User 11 | Plan 7 | PlanVersion 7 | ModuleState 11 | Opportunity 5 | Membership 11
demo-tenant (fabrika-beta): M1=ON,M10=OFF,M11=OFF,M2=ON,M3=ON,M4=ON,M5=ON,M6=ON,M7=OFF,M8=ON,M9=OFF | 11 satır | 11 ayrı id
```

İdempotent ✓. ModuleState satırları plan grant'ına göre yazılıyor ✓.

## 6) Tam vitest, yalnız izole DB

- `DATABASE_URL`, `DATABASE_URL_MIGRATE` ve `DATABASE_URL_RLS_TEST`'in üçü de `:55461/fbcrw`'ye yönlendirildi. `env | grep DATABASE_URL` çıktısında yalnız 55461 görünüyor.
- Worktree `.env`'inde de `5433` sayısı 0.

```
isolated before: 1 tenants: fabrika-beta      shared before: 1 tenants: fabrika-beta
 Test Files  219 passed | 2 skipped (221)
      Tests  2468 passed | 64 skipped (2532)       exit=0
isolated after:  1 tenants: fabrika-beta      shared after:  1 tenants: fabrika-beta
```

**Atlanan 64 test** (json reporter):

| Atlanan | Dosya |
|---|---|
| 20 | `oauth-registration.live` |
| 18 | `agency-invite.live` |
| 13 | `agency-funnel.live` |
| 5 | `agency-report.live` |
| 4 | `k1-daily-calls` (`RUN_LIVE_ADAPTER_TESTS`) |
| 2 | `adapters` |
| 2 | `sedia-adapter` |

- oauth ve agency dosyaları kendi `skipReason`'larıyla atlıyor: `add-agency-invite-code.sql / add-agency-funnel*.sql is not applied`. Bu migration SQL'lerini `prisma db push` uygulamıyor (K-2).
- be-fb'nin koşusunda da 64 atlanan vardı. Aynı nedenden olması muhtemel.
- İlk koşu 11 kırmızı verdi (`permission denied for function enter_system_scope`). Nedeni kurulum sırası: `db:rls`'i `db:rls-role`'den önce koşmuştum. `db:rls` yeniden koşulunca süit yeşile döndü (K-3).
- be-fb'nin raporundaki `m9-calendar-connect` 2 kırmızısı `c9133933` ile düzelmiş.

---

## Bulgular

### Bloke eden
- **B-1 — Aynı sınıf, istemciden gelen `undefined` id üretimde 12+ `updateMany` yolunda açık. İkisinde içerik kaybı kanıtlandı.** (§3)
  - Senaryo: bir üye `acquireSectionLock(undefined, …)` çağırıyor → kiracının tüm başvuru parçaları ilk parçanın içeriğiyle eziliyor. `saveConceptNoteDraft(undefined, x)` → tüm notlar `x` oluyor. `signDocument(undefined)` → tüm dokümanlar imzalanmış görünüyor.
  - Rapor bu sınıfı yalnız `verifyEvidenceAction` (Ö-1) olarak gösteriyor ve "kapsam silme" diyerek bırakıyor. Oysa m11/m2 üzerine yazma, veri açısından silmeye eşdeğer.
  - **Önerilen düzeltme:** `src/lib` altına tek bir `requireActionId(x)` (ya da Zod `z.string().min(1)`) ekle. Bu tablodaki server action'ların girişinde çağır. `tests/server-action-missing-id.test.ts`'e m11, m2 ve m10 için birer "undefined'da tabloya dokunmuyor" testi ekle. Ayrı kartta yapılabilir, ama bu kart "önlemler tamam" diye kapatılmamalı.
- **B-2 — Bekçinin "dizi literali güvenlidir" kuralı yanlış: `AND: [{ id: x }]` ve `notIn: presentIds(...)` filtresiz silme yapıyor, bekçi yeşil.** (§1, §2, M4)
  - `tests/helpers/where-guard-scan.ts:79`: `if (ts.isArrayLiteralExpression(e)) return true;`. Belgedeki gerekçe ("Prisma rejects an undefined element") yalnız skaler `in: [...]` için geçerli. Dizideki nesne elemanlarında Prisma `undefined` alanı düşürüyor.
  - **Önerilen düzeltme:**
    - Dizi elemanı nesne literaliyse `objectIsSafe` ile özyinelemeli kontrol et.
    - `notIn` anahtarını `presentIds` ile ya da boş olabilecek bir değerle kabul etme.
    - Bekçinin `bad` fixture'ına `AND` ve `notIn` örneklerini ekle.

### Öneri
- **Ö-1 — Bekçinin diğer kaçışları** (§2). Hepsi repoda bugün yok ve düşük öncelikli:
  - `data` içindeki iç içe `deleteMany` / `updateMany`. Çalışma anında ebeveynin tüm ilişkili satırlarını siliyor, kanıtlandı.
  - Parametreyi gölgeleyen aynı adlı const. `decls` kapsamı ayırt etmiyor; en azından parametre adıyla çakışan bir const güvenli sayılmamalı.
  - `['deleteMany']` element erişimi, yapısı çözülmüş metot, mutasyona uğrayan const nesne alanı ve filtresiz `$executeRawUnsafe`.
- **Ö-2 — Seed `ModuleState` upsert'inin `update` kolu `changedAt` / `changedBy`'ı güncellemiyor.** Yeniden seed'lenen satırda eski tarih kalıyor. Kozmetik; denetim ekranı "son değişiklik" gösteriyorsa yanıltıcı olur.
- **Ö-3 — `src/lib/gates/evaluate.ts:213` ve `src/lib/agency/codes.ts:189`.** Değer çağırandan geliyor ve ben çağıranları okumadım. B-1 düzeltilirken aynı kontrolden geçirilmeli.

### Kayıt
- **K-1 — Paylaşılan `fabrika`'da Tenant sayısı inceleme sırasında 2'den 1'e indi** (22:1x, yerel saat). Kalan: `demo-tenant`.
  - Bu benim işlemim değil: betiklerim yalnız `:55461/fbcrw`'yi kabul ediyor, `fabrika-postgres`'e yalnız `SELECT count(*)` attım.
  - Silinen kiracının kimliği bende yok. Başka bir ajanın test fixture'ı olabilir. Başka bir B-4 tekrarı mı diye izlenmeli.
- **K-2 — "Tam süit" 56 canlı agency/oauth testini kapsamıyor.** `db push` migration SQL'lerini uygulamıyor. İzole DB'de `scripts/apply-migrations.sh` (PSQL sarmalayıcısıyla) koşulursa kapsam genişler.
- **K-3 — İzole DB kurulum sırası: `db:rls-role` → `db:rls`.** Tersi, `enter_system_scope` GRANT'ı eksik kaldığı için 11 kırmızı üretiyor. Paylaşılan hafızadaki tarif (push → seed → rls → rls-role) güncellendi.

## Değişen dosyalar
Yalnız bu rapor. Kod değiştirilmedi.

## Riskler / sınırlar
- B-1'deki 10 yolun ikisi gerçek çağrıyla kanıtlandı. Geri kalanlar kod okuması ve §1'deki Prisma davranışıyla gerekçeli.
- Erişilebilirlik (`$undefined` Flight kodlaması) çalışan bir sunucuya karşı POST ile denenmedi.

## Temizlik
- `docker stop crwfb-mun26` (`--rm`, kaldırıldı). `:55461` dinleyicisi 0.
- `git worktree remove` yapıldı. `:3000` ve `.next`'e dokunulmadı.
- Kanıt betikleri: `scratchpad/crw-evidence/` (`repro.ts`, `scan-escapes.ts`, `scan-src.ts`, `undefined-id-actions.test.ts`).

## Platform
- **Doğrulandığı yer:** mac (Darwin 27, Docker pgvector pg16, Node 26, vitest 4.1).
- İncelenen kodun hiçbiri platforma bağlı değil (Prisma `where` semantiği, TS AST taraması, seed upsert). Tarayıcı `path.join` / `path.relative` kullanıyor.
- Windows ve Linux koşulamadı, çünkü bu makinede yalnız mac var. Koddan bakınca aynı sonuç beklenir.
