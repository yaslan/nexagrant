# TASK-MUN2KUHP1BP18 — be-fb: İNCELEME-27 B-1, B-2 (+ Ö-1, Ö-2, Ö-3)

**Kaynak:** `docs/agent-results/TASK-MUN26P5IDKGST-crw-fb.md` (crw-fb, İNCELEME-27). Bu kart TASK-MUMSUA77J1C6Q'nun devamıdır.
**Commit'ler (dev):** `a2c2a9b3`, `a2c89b99`, `f09e910a`, `4f391ae8`.
**Durum:** B-1, B-2, Ö-2 ve Ö-3 kapandı. Ö-1'deki kaçışların altısı kapatıldı, kalanlar §5'te gerekçeleriyle yazılı.

## 1) Ne yapıldı

### B-1: istemciden gelen id, sorguya girmeden doğrulanıyor
- **Ortak yardımcı:** `src/lib/required-id.ts`
  - `isPresentId(x)`: boş olmayan bir dize mi (`trim` sonrası).
  - `requireActionId(x, label)`: değeri döndürür ya da `MissingIdError` fırlatır (`status = 400`).
- **Server action'lar:** Her biri girişte `if (!isPresentId(id)) return <ret>` yapıyor ve sorgu tek kayıt + `tenantId` kapsamında kalıyor.
  - Bir server action'ın HTTP durum kodu yok. Karşılığı, action'ın kendi hata sözleşmesiyle verdiği ret yanıtı: `{ success: false }`, `INVALID_INPUT`, `OPPORTUNITY_NOT_FOUND`, `DOC_NOT_FOUND`, `null` ya da `[]`.
  - Gerçek 400 dönen tek yer route handler'lar. `saved-searches/[id]` PATCH ve DELETE artık 400 döndürüyor.

| Yol | Guard |
|---|---|
| m11 `loadPart` / `savePartContent` (tek geçiş noktası) + `acquireSectionLock`, `releaseSectionLock`, `updateSectionContent`, `resolveSectionComment`, `restoreSectionRevision` girişleri | `isPresentId(partId)` |
| m11 `issuePartnerPortalLink` | `if (!partId)` → `isPresentId` |
| m2 `saveConceptNoteDraft`, concept-notes `updateNoteStatus` | `noteId` |
| m10 `signDocument`, `createNewVersion`, `submitDualApprovalAction`, `departmentApproveAction` | `docId` |
| evidence `verifyEvidenceAction` (+ `deleteEvidence`, eski guard → `isPresentId`) | `evidenceId` |
| pipeline `assignOpportunityOwner`, `moveOpportunityStage`, `archiveOpportunity`, `evaluateOpportunityGate` | `opportunityId` |
| consortium `assignSeat`, `findCandidates`; `lib/scoring/consortium.ts` `runScoring` | `seatId` (+ `tenantId`) |
| m8 `assignCandidateToSeat`, `computeSeatCandidates`; `matching.ts` `runSeatMatch` | `seatId`, `opportunityId` |
| relationships `updateRelationship` (Zod yalnız `data`'yı doğruluyordu), m4 `updateNextStep` | `id` / `relationshipId` |
| m9 `disconnectCalendar` | `connectionId` → `CALENDAR_CONNECTION_NOT_FOUND` |
| api-keys `revokeApiKey` | eski guard → `isPresentId` |
| `api/saved-searches/[id]` PATCH/DELETE | **400** |
| plan admin: `updateDraftVersion`, `deletePlan`, `unassignPlanFromTenant` | `requireActionId` → `MissingIdError` |
| **Ö-3** `lib/gates/evaluate.ts` `runGate` (:213) | `opportunityId`, `tenantId` → `GateOpportunityNotFoundError` |
| **Ö-3** `lib/agency/codes.ts` `revokeInviteCodeIn` (:189) | `input.id`, `input.tenantId` → `false`. Çağıranlar `ajans/actions.ts` ve `lib/agency/actions.ts` istemci id'si geçiriyor: **gerçek B-1 örneği**. Kiracı ajansın tüm kodlarını iptal edebilirdi. |
| `lib/scoring/g0-compute.ts` `persistG0` | `!x` → `isPresentId` (`opportunityId`, `tenantId`) |
| `lib/invitations/accept.ts` `acceptInvitationIn` (cs-fb'nin `0ae3175b`'si, benim commit'imle aynı anda geldi) | `invitationId`, `tokenHash`, `tenantId` → `'lost'` |

- **crw-fb'nin tablosunda olmayan iki ek yol:**
  - `consortium findCandidates(undefined)`: `findFirst` herhangi bir koltuğu buluyor, ardından `runScoring`'in `deleteMany({ tenantId, seatId })` çağrısı kiracının **tüm** koltuk adaylarını siliyordu.
  - `m8 assignCandidateToSeat`: `seatId` eksikse fırsatın tüm koltukları, iki id de eksikse kiracının tüm koltukları yeniden atanıyordu.

### B-2: statik bekçi (`tests/helpers/where-guard-scan.ts`)
- `AND`, `OR` ve `NOT` altındaki dizinin her elemanı ayrı bir `where` olarak özyinelemeli denetleniyor.
  - Anahtarı düşmüş bir eleman `{}` olur ve tüm satırları eşler.
  - `AND: []` ve `NOT: []` de reddediliyor.
- `notIn` yalnız boş olmayan, spread içermeyen bir literal ile kabul ediliyor.
- `presentIds(...)` yalnız `in` altında güvenli sayılıyor.
- `tests/teardown-where-guard.test.ts` dosyasına B-2'nin kırmızı örnekleri eklendi (7 biçim): `AND: [{ id: x }]`, `OR: [.., { slug: x }]`, `AND: []`, `NOT: [{ id: x }]`, `notIn: presentIds([x])`, `notIn: []`, `notIn: [...kept]`.
- **Bekçi src'ye de uygulanıyor:** `tests/where-guard-src.test.ts`.
  - Test olmayan 474+ `src` dosyası taranıyor.
  - Kanıtlanamayan ama güvenli değerler `KNOWN` listesinde tutuluyor. Neredeyse hepsi hemen yukarıda okunan bir DB satırının non-null sütunu, satır numarasız anahtarla ve her biri gerekçeli (17 anahtar).
  - `KNOWN`'da eskiyen girdi de testi kırıyor.
  - Başlangıçta 88 bulgu vardı. Guard'lar ve kaynak kuralları eklendikten sonra kalan 21 bulgu `KNOWN`'a gerekçesiyle yazıldı.
- **Bekçinin tanıdığı yeni güvenli kaynaklar:**
  - Kapsayan bir blokta daha önce yer alan `if (!isPresentId(x)) …` ya da `if (!x)` + return/throw/continue/break.
  - `requireId(x, …)`, `requireActionId(x, …)` ve `assertTenantScope(x, …)` deyimleri.
  - `withTenant(t, cb)` geri çağrısında aynı `t`. Gerekçe: `withTenantOn` önce `assertTenantScope` çağırıyor.
  - `requireTenantAction()`, `requireTenantApi()` ve `sessionScope()` sonuçlarından yapı-çözülen alanlar.
  - `new X()`.
- **Sıkılaştırılmış bekçinin testlerde yakaladığı 3 gerçek zayıflık (düzeltildi):**
  - `agency-invite.live` `ids.orgWorkspace`: sonradan yazılan bir const alanı.
  - `e2e/m8-matching` OR içinde `in: pics`.
  - `e2e/rls.spec` OR içinde `let tenantA`.

### Ö-1: bekçinin diğer kaçışları
Artık yakalananlar:
- `data` içinde iç içe `deleteMany` / `updateMany`.
- Parametreyi gölgeleyen aynı adlı const.
- `x['deleteMany'](…)` ile element erişimi.
- Model temsilcisinden yapı-çözülmüş `{ deleteMany }`.
- Alanı sonradan yazılan const nesne.
- WHERE'siz `DELETE`, `UPDATE` ya da `TRUNCATE` içeren `$executeRawUnsafe` veya `` $executeRaw`…` ``.

### Ö-2: seed
- `prisma/seed.ts` içindeki `ModuleState` upsert'ünün `update` kolu artık `changedAt: new Date()` ve `changedBy: null` yazıyor.

## 2) Kanıt

### 2.1 Canlı: her B-1 yolu `undefined`, `null` ve `""` ile, izole DB'de
- Test dosyası: `tests/action-missing-id.live.test.ts`. Test `fabrika_app` (NOBYPASSRLS, doğrulanıyor) ile koşuyor. Yalnız oturum ve `revalidatePath` mock'lanıyor; `withTenant` ve Prisma gerçek.
- Her çağrıdan önce ve sonra 12 tablonun kiracıya ait satırlarının anlık görüntüsü alınıp karşılaştırılıyor.
- Ayrıca her tabloda gerçek id ile bir çağrı yapılıyor ve **tam 1 satırın** değiştiği doğrulanıyor. Böylece "değişiklik yok" sonucu, DB'ye hiç ulaşmayan bir yoldan kaynaklanamıyor.

```
 ✓ tests/action-missing-id.live.test.ts  34 passed
   31 action × {undefined, null, ""} → ret + anlık görüntü aynı
   saved-search PATCH/DELETE → [400, 400], anlık görüntü aynı
   evaluateGate(undefined|null|"") → GateOpportunityNotFoundError, GateDecision sayısı aynı
   gerçek id → m11/m2/m10/evidence/pipeline/m4/consortium her biri tam 1 satır
```

### 2.2 Mutantlar (worktree'de; geri alma `cp` yedeğiyle, her koşudan sonra `git status` temiz)

```
M1  m11 tüm partId guard'ları kaldırıldı              9 failed  → ÖLDÜ
M2  m11 yalnız giriş guard'ları kaldırıldı (loadPart/save kaldı)  4 failed → ÖLDÜ
M3  m2 saveConceptNoteDraft                            1 failed  → ÖLDÜ
M4  m10 signDocument                                   2 failed  → ÖLDÜ
M5  pipeline moveOpportunityStage                      2 failed  → ÖLDÜ
M6  evidence verifyEvidenceAction                      2 failed  → ÖLDÜ
M7  relationships updateRelationship                   1 failed  → ÖLDÜ
M8  m4 updateNextStep                                  1 failed  → ÖLDÜ
M9  consortium assignSeat                              1 failed  → ÖLDÜ
M10 findCandidates + runScoring                        1 failed  → ÖLDÜ
M11 saved-search 400                                   1 failed  → ÖLDÜ
M12 runGate guard (ilk hâli: doğrudan test yoktu)      YAŞADI → test eklendi
M12b runGate guard (evaluateGate doğrudan testiyle)    1 failed  → ÖLDÜ
M13 bekçi B-2: AND/OR/NOT yine skaler liste            1 failed  → ÖLDÜ
M14 bekçi B-2: notIn altında presentIds                1 failed  → ÖLDÜ
M15 bekçi: guard deyimleri tanınmıyor                  2 failed  → ÖLDÜ
M16 bekçi Ö-1: iç içe yazma denetlenmiyor              1 failed  → ÖLDÜ
M17 bekçi Ö-1: parametre gölgeleme                     1 failed  → ÖLDÜ
M18 m2 guard kaldırıldı → src bekçisi                  1 failed  → ÖLDÜ
M19 agency revokeInviteCodeIn                          4 failed  → ÖLDÜ
M20 plan-repository deletePlan                         4 failed  → ÖLDÜ
M21 evaluateOpportunityGate giriş guard'ı (runGate kaldı)  YAŞADI → eşdeğer (bkz. §4)
M22 bekçi: yapı-çözülmüş temsilci metodu               1 failed  → ÖLDÜ
M23 m10 createNewVersion                               1 failed  → ÖLDÜ
M24 m8 assignCandidateToSeat                           2 failed  → ÖLDÜ
M25 bekçi: `if (!x) continue` tanınmıyor               1 failed  → ÖLDÜ
M26 accept çekirdeği guard'ı → src bekçisi             1 failed  → ÖLDÜ
M27 bekçi: yazılan const alanına yine güveniliyor      1 failed  → ÖLDÜ
M28 bekçi: WHERE'siz raw yazma raporlanmıyor           1 failed  → ÖLDÜ
```
**Sonuç:** 28 mutantın 27'si öldü. M21 eşdeğer bir mutant (§4).

### 2.3 Tam süit, yalnız izole DB'de (HEAD `4f391ae8`, temiz worktree)
- **DB:** kendi `pgvector/pgvector:pg16` konteynerim, `befb-mun2k`, `:55471/befbk`. Worktree `.env`'inde `5433` = 0. `env | grep DATABASE_URL` çıktısında üçü de `:55471/befbk` gösteriyor.
- **Kurulum sırası:**
  1. `prisma migrate diff --from-empty --to-schema` + `docker exec psql`
  2. `scripts/apply-migrations.sh` (PSQL shim), **iki kez**: `34 files applied`, rc=0 / rc=0 (K-2)
  3. `db:seed`
  4. `db:rls-role`
  5. `db:rls` (K-3)
  6. **`apply-migrations.sh` yeniden**. Nedeni §4'te.

```
isolated before: 1 fabrika-beta      shared before: 1 fabrika-beta
 Test Files  224 passed | 2 skipped (226)
      Tests  2640 passed | 8 skipped (2648)          vitest exit=0
isolated after:  1 fabrika-beta      shared after:  1 fabrika-beta
atlanan 8: k1-daily-calls 4, adapters 2, sedia-adapter 2 (RUN_LIVE_ADAPTER_TESTS)
```
- crw-fb'nin koşusunda atlanan 64 testin 56'sı (agency-invite, agency-funnel, agency-report, oauth-registration) artık **koşuyor ve geçiyor**. K-2 kapsamı genişledi.
- Paylaşılan `fabrika` DB'sine yalnız `SELECT count(*)` atıldı, hiç yazılmadı.

### 2.4 Statik kontroller (temiz worktree, `git status` 0 satır)
```
tsc --noEmit  exit=0
pnpm lint     exit=0
pnpm build    exit=0
```

### 2.5 Ö-2: seed iki kez, izole DB
```
önce:  M1 | ON | changedBy=someone | 2020-01-01    (elle bayatlatıldı)
seed run1 rc=0, run2 rc=0
sonra: M1 | ON | changedBy=(null)  | 2026-09-29 ;  ModuleState satırı 11 → 11
```

## 3) Değişen dosyalar
- **Yeni:**
  - `src/lib/required-id.ts`
  - `tests/where-guard-src.test.ts`
  - `tests/action-missing-id.live.test.ts`
  - `tests/required-id.test.ts`
- **Bekçi:**
  - `tests/helpers/where-guard-scan.ts`
  - `tests/teardown-where-guard.test.ts`
- **Üretim:**
  - `src/app/[locale]/(app)/[workspace]/{concept-notes,evidence,pipeline,pipeline/[id]/consortium,relationships,settings/api-keys}/actions.ts`
  - `src/app/api/saved-searches/[id]/route.ts`
  - `src/lib/{agency/codes,billing/plan-repository,gates/evaluate,scoring/consortium,scoring/g0-compute,invitations/accept}.ts`
  - `src/modules/{m2,m4,m8,m10,m11}/server/actions.ts`
  - `src/modules/m8/server/matching.ts`
  - `src/modules/m11/server/partner-link.ts`
  - `src/modules/m9/server/calendar-actions.ts`
- **Testler (sıkılaştırılmış bekçinin yakaladıkları):**
  - `tests/agency-invite.live.test.ts`
  - `tests/e2e/m8-matching.spec.ts`
  - `tests/e2e/rls.spec.ts`
- **Seed:** `prisma/seed.ts`

## 4) Riskler
- **M21 eşdeğer mutant:**
  - `evaluateOpportunityGate`'in giriş guard'ı kaldırıldığında `runGate` guard'ı aynı hatayı fırlatıyor ve action yine reddediyor, DB değişmiyor.
  - Bu kasıtlı bir katmanlı savunma. Guard'lardan biri tek başına ölçülebiliyor (M12b), diğeri yedek.
- **API sözleşmesi:** Eksik id için yanıtlar değişti.
  - `signDocument` → `{ success: false, signedAt: null }`
  - `createNewVersion` → `{ success: false, updatedDoc: null }`
  - m10 onay action'ları → `refusal: 'DOC_NOT_FOUND'`
  - pipeline → `INVALID_INPUT` / `OPPORTUNITY_NOT_FOUND`
  - saved-search → 400
  - İstemciler bu durumlara hiç id'siz çağrı göndermiyor. tsc temiz.
- **m11'de varsayılan dönen action'lar:** `addSectionComment`, `updatePresenceHeartbeat`, `addBudgetLine`, `addWorkPackage` ve `getPartBData` eksik id'de ret yerine varsayılan değer döndürüyor. Önceki "parça bulunamadı" davranışıyla aynı. Satır değişmiyor; canlı test anlık görüntüyle kanıtlıyor.
- **Kurulum tuzağı (K-3'ün devamı):**
  - Migration'lardaki SECURITY DEFINER fonksiyonları `GRANT EXECUTE … TO fabrika_app` iznini yalnız rol **varsa** veriyor.
  - Bu yüzden `apply-migrations.sh`, `db:rls-role`'den önce koşulursa agency/oauth canlı testleri `permission denied for function agency_funnel_counts / redeem_agency_invite` ile düşüyor. İlk koşuda 37 kırmızı böyle geldi.
  - Çözüm: rol oluştuktan sonra migration'ları yeniden koşmak (idempotent).
- **Commit geçmişi:** `a2c2a9b3`'te bekçi dosyasında bir `tsc` hatası (TS7022) vardı. `a2c89b99`'da düzeldi; ara commit tek başına typecheck'ten geçmez.
- **Paylaşılan ağaç:**
  - cs-fb'nin `0ae3175b` / `24666974` commit'leri benim `a2c2a9b3`'ümle aynı anda geldi ve src bekçisi dev'de kırmızıya döndü.
  - `accept.ts`'e tek satırlık guard ekledim (`f09e910a`); cs-fb'nin kabul süiti tam koşuda 17/17 yeşil.
  - Bekçiye `if (!x) continue` desteği eklendi; cs-fb'nin test döngüsündeki bulgu yanlış pozitifti.

## 5) Açık sorular
- **Ö-1'de bilerek bırakılanlar:**
  - Yalnız dosya içi izleme var; modüller arası akış izlenmiyor. Bu yüzden başka dosyadaki bir yardımcının parametresi "parametre" sayılıyor ve kendi guard'ını istiyor.
  - Dinamik SQL metni (değişkenden gelen `$executeRawUnsafe(sql)`) denetlenmiyor.
  - Aynı fonksiyonda farklı bloklarda aynı adlı iki const varsa dosya genelindeki tüm bildirimler aranıyor (muhafazakâr taraf).
- **Erişilebilirlik:** Gerçek bir Flight `$undefined` POST'u (action ID ile) çalışan bir sunucuya karşı denenmedi. Ret action gövdesinde olduğu için taşıma yolundan bağımsız; testler action'ı ve route handler'ı doğrudan çağırıyor.
- **KNOWN'daki `users-scheduled-deletion`:** Sistem kapsamında ve kiracılar arası, `userId` ile silen tek yol. `userId` bir `findMany` satırının birincil anahtarı. Dosya devop-fb'nin paralel işinde (jobs) olduğu için guard eklemedim; açık bir `isPresentId(userId)` guard'ı ucuz bir ek güvence olur.

## 6) Sonraki adım
- crw-fb incelemesi. Önerilen odak:
  - `KNOWN` listesindeki 17 anahtarın gerekçeleri.
  - `withTenant` argümanı ve oturum kapsamı kurallarının bekçide doğru kapsamda uygulanıp uygulanmadığı.
- Yeni bir `updateMany` / `deleteMany` yazan herkes için: istemci id'sini girişte `isPresentId` / `requireActionId` ile doğrulayın. Aksi hâlde `tests/where-guard-src.test.ts` kırmızı verir.

## Temizlik
- `befb-mun2k` konteyneri kaldırıldı, `:55471` boş.
- İki worktree de `git worktree remove` ile silindi. Parola dosyası silindi.
- Paylaşılan `fabrika-postgres`'e yalnız `SELECT count(*)` atıldı. `:3000` ve `.next`'e dokunulmadı.
- Başkalarının commit'lenmemiş dosyaları (`FON_BRIDGE.md`, `TASK-MUN26P5IDKGST-crw-fb.md` vb.) commit'lerime girmedi. Her commit `git commit -- <yollar>` ile atıldı.

## Platform
- **Doğrulandığı yer:** mac (Darwin 27, Docker `pgvector/pgvector:pg16`, Node 26.5, vitest 4.1.11, Next build).
- Değişen kodun hiçbiri platforma bağlı değil: dize kontrolü, Prisma `where`, TS AST taraması, seed upsert. Bekçi `path.join` / `path.relative` kullanıyor ve dosya yollarını `path.relative` ile üretiyor.
- `KNOWN` anahtarları `/` ayraçlı. Bekçi raporladığı yolu artık `split(path.sep).join('/')` ile üretiyor (`tests/helpers/where-guard-scan.ts`), yani Windows'taki `\` ayraçları eşleşmeyi bozmaz. **Windows koşulamadı** (makinede yalnız mac var).
- **Linux koşulamadı** (yalnız mac var). Koddan bakınca aynı sonuç beklenir.
