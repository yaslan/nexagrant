# TASK-MUNOE0Q4FR2J — İNCELEME-59: Y-3 RBAC (be-fb, TASK-MUN80UOUPB2A4 + TASK-MUN4H2RL79D8B) · se-fb

**Karar: DÜZELTME GEREKLİ.** Tek engelleyici bulgu B-1. 57 action'ın rol eşlemesi canlıda doğru çalışıyor: 6 rol × canlı satır sonuçları `can()` ile birebir tuttu, yasak 10 düşman çağrısının hepsi `FORBIDDEN_ROLE` ile döndü ve DB'de hiçbir satır değişmedi, kiracılar arası denemeler boşa düştü. Açık iki yerde: `updateRelationship` dış partnere (GUEST_PARTNER) yazma izni veriyor, bekçi de bu tip deliği yakalayamayacak kadar gevşek (10 mutanttan 8'i sağ kaldı).
**Durum: TAMAM** (inceleme bitti; B-1 ve Y-1…Y-4 düzeltmeleri be-fb / ürün sahibinde).
**İncelenen:** dev `05cf050f`; be-fb commit'leri `a3ed5630`, `ebd50b37`, `3ac8f0c1`, `06f57d52`. Worktree: `scratchpad/wt59` (detached `05cf050f`). İzole DB: `sefb_i59` (fabrika-postgres :5433, `prisma db push` + `prisma/rls.sql` → 112 politika).
**Platform beyanı:** Doğrulama mac'te yapıldı (Darwin 27, Node, vitest 4.1.11, Postgres konteyneri). İncelenen kod yolu platforma bağlı değil: sunucu tarafında rol karşılaştırması, Prisma ve TS AST taraması. Bekçi `path.sep`'i normalize ediyor, bu yüzden Windows ve Linux'ta aynı sonucu beklerim. Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız mac var.

| # | Önem | Bulgu | Konum | Durum |
|---|---|---|---|---|
| **B-1** | Orta (engelleyici) | GUEST_PARTNER ve MEMBER, `updateRelationship` ile kiracının ilişki kayıtlarına (notes/warmth/nextStep) yazıyor. GUEST_PARTNER'da `view_proposal` bile yok. Bekçi, koşullu `can()`'ı "rol kontrolü var" saydığı için bunu geçirdi. | `src/app/[locale]/(app)/[workspace]/relationships/actions.ts:89-103` | canlı kanıtlı (H5) |
| **Y-1** | Orta | Bekçi 10 mutanttan 8'ini kaçırıyor: sahte `can()`, `can: undefined`, `(t)=>` / destrüktür / takma adlı prisma ile yazan readOnly, modül dışı yazan yardımcı, yazmadan sonra yapılan rol kontrolü, `export { fn }`, satır içi `'use server'`. Davranış testi de bunları yakalamıyor, çünkü yalnız listelenen 57 action'ı koşuyor. | `tests/server-action-rbac-guard.test.ts` | mutant kanıtlı (§4) |
| **Y-2** | Orta (şu an gizli) | Rol ve kiracı claim'i yalnız sign-in'de yenileniyor. Rolü düşürülen ya da üyeliği silinen kullanıcı, token yaşadıkça eski rolüyle yazmaya devam ediyor. Raporun R-6'sındaki "token yenilendiğinde yansıyor" cümlesi yanlış. | `src/lib/auth.ts:641-659` | canlı kanıtlı (H7, H4) |
| **Y-3** | Orta | `POST /api/billing/checkout` rol kontrolü yapmıyor. Her üye, GUEST_PARTNER dahil, kiracı adına Stripe abonelik oturumu açabiliyor. `manage_billing` yalnız OWNER'da. Ayrıca `billing/portal` ADMIN'e de açık. | `src/app/api/billing/checkout/route.ts:94`, `billing/portal/route.ts:27` | yalnız kod kanıtı (Stripe anahtarı yok) |
| **Y-4** | Orta (KARAR 5) | WRITER `signDocument` ile çift onay akışını tamamen atlayıp belgeyi imzalıyor. Çift onay yalnız `departmentApproveAction` yolundan geçenler için var. | `src/modules/m10/server/actions.ts` `signDocument` | canlı kanıtlı (H6) |
| Ö-1 | Düşük | `updateNoteStatus` `status`'u doğrulamıyor, herhangi bir string yazılabiliyor (KARAR 4 ile birlikte ele alınmalı). | `concept-notes/actions.ts` `updateNoteStatus` | canlı (H6) |
| Ö-2 | Düşük | Partner portal token'ının süresi yok. Her `issuePartnerPortalLink` çağrısı önceki linki sessizce iptal ediyor ve audit kaydı düşmüyor. | `modules/m11/server/partner-link.ts` | canlı (H6: iki çağrıda hash iki kez değişti) |
| Ö-3 | Düşük | Davet (`CAN_INVITE`) ve co-brand (`EDITOR_ROLES`) izinleri `rbac.ts`'e sormak yerine kendi sabit rol kümelerini kullanıyor. Bugün `manage_users` ile aynılar, ama matris değişirse ayrışırlar. | `api/invitations/route.ts:43`, `ajans/cobrand-actions.ts:18` | kod |
| Ö-4 | Düşük | Çift onayda isteği açan kişi, departmanlardan birini kendisi onaylayabiliyor. Yalnız "iki departmanı aynı kişi onaylayamaz" kuralı var. | `src/lib/dual-approval.ts:282-293` | kod |
| Ö-5 | Kozmetik | `signDocument` `success:false` dönerken de `signedAt` zaman damgası döndürüyor (H3 çıktısı). | m10 | canlı (H3) |

## 1) Ne yapıldı
- (a) **Envanter.** Bekçiden bağımsız çıkardım: 36 `'use server'` modülü, 1 satır içi `'use server'` (portal) ve yazma fiili olan 17 route handler. Ayrıca 14 `readOnly: true` action'ın ve bunların modül dışındaki yardımcılarının gövdelerini yazma fiillerine karşı taradım (§2).
- (b) **Canlı DB düşman çağrıları.** İzole `sefb_i59` üzerinde gerçek action'ları çağırdım. Yalnız `auth()` sahte (JWT'nin ürettiği oturum); pilot kapısı, `withTenant`, Prisma ve action gövdeleri gerçek. Toplam 8 senaryo (H1–H8), 6 rolün hepsi. Ayrıca `authConfig.callbacks.jwt` canlı DB ile doğrudan çağrıldı (§3).
- (c) **Bekçi mutantları.** 10 mutant, diskte uygulandı ve geri alındı. Her mutantta bekçi + davranış + use-server-exports testleri koşuldu (§4).
- (d) **§4'teki 10 KARAR maddesi** güvenlik açısından değerlendirildi. Karar verilmedi, yalnız öneri var (§5).

## 2) (a) Envanter

**Server action'lar.** Bekçinin taradığı 36 dosya / 127 export'u bağımsız grep ile yeniden saydım: `^'use server'` + `export (async function|const)`, `export {}` ya da `export default` yok. Rol kontrolünden geçmeyen yazma, raporun ALLOWED listesindekiler dışında **bir tane**: `relationships.updateRelationship` (B-1). Bu fonksiyon `requireTenantAction()` (can'sız) çağırıyor; `can()` yalnız `ownerUserId` gönderildiğinde koşuyor. Geri kalan `can(...)` kullanımlarını tek tek okudum ve hepsi yazmadan önce koşulsuz ret veriyor:
- api-keys ×2, profile, modules, billing identity: `manage_users` / `manage_modules` / `manage_billing`
- export-csv: `evaluate_gates`
- ajans ×3: `manage_users`
- archive/declare: `canArchiveOpportunity`
- m8 confirm: `canConfirmSeat`

**readOnly: true (14 adet), yazma arandı:**
- `getEvidenceItemsAction`, `getHealthScoreAction`, `getAssignableMembers`, `listInviteCodes`, `listAgencyInviteCodesAction`, `listPanelScores`, `matchTtoItemToCalls`, `exportToDocx`, `generateAiUsageDeclaration`, `getPartBData`, m11 `generateSectionDraft` (438), `calculateLumpSumBudget`, `getConflicts` → `detectConflicts` (`src/lib/scoring/consortium.ts:191`, gövdede create/update/delete/upsert/execute **yok**), settings/calendar `page.tsx`.
- Hiçbiri yazmıyor. İNCELEME-30/36'daki `findCandidates` / `computeSeatCandidates` artık `can: 'manage_workspaces'` ile yazma action'ı olarak işaretli.
- Gelecek için not: `generateSectionDraft` readOnly ve rolsüz. Kodun kendi yorumu da "gerçek model çağrısı gelince yetkisiz uç olur" diyor. LLM bağlandığında `edit_proposal` alması gerekir.

**Satır içi `'use server'`:** tek bir tane var, `portal/partner/[token]/page.tsx:156`. `addBudgetLineByToken`'a gidiyor ve token ile doğrulanıyor. Bekçi bunu hiç taramıyor (Y-1 / G10).

**Route handler'lar (17 dosya, POST/PUT/PATCH/DELETE):**
| Route | Kapı | Değerlendirme |
|---|---|---|
| `api/admin/{cordis/import, documents/upload, topic-stats/import, topic-stats/rescore}` | `requirePlatformAdminApi` | ✔ |
| `api/invitations` POST | `requireTenantApi({write})` + `CAN_INVITE` (OWNER/ADMIN) | ✔ (Ö-3: rbac.ts'e sormuyor) |
| `api/saved-searches` POST, `[id]` PATCH/DELETE | `requireTenantApi({write})` + `where {id, tenantId, userId}` | ✔ kullanıcının kendi kaydı |
| **`api/billing/checkout` POST** | yalnız `requireTenantApi()` | **✘ Y-3**: rol yok |
| `api/billing/portal` POST | membership `role in (OWNER, ADMIN)` | ~ Y-3: `manage_billing` yalnız OWNER |
| `api/billing/quote` POST | oturum opsiyonel, yazma yok | ✔ fiyat hesabı |
| `api/feedback` POST | oturum | ✔ destek kanalı (İNCELEME-30 kararı) |
| `api/gdpr/delete`, `api/user/{export, export-data, request-deletion}` | oturum, kişinin kendisi | ✔ KVKK |
| `api/webhooks/{stripe, iyzico}` | imza doğrulama | ✔ |

## 3) (b) Canlı DB düşman çağrıları

Kanıt dosyaları: `TASK-MUNOE0Q4FR2J-se-fb-ekler/i59-rbac-hostile.live.test.ts`, `i59-jwt-stale-role.live.test.ts` ve ham çıktı `live-run.txt` (partner token'ları maskelendi).
Komut: `DATABASE_URL=…/sefb_i59 AUTH_SECRET=… npx vitest run tests/i59-*.live.test.ts --silent=false --reporter=verbose` → **Test Files 2 passed, Tests 8 passed**.
Fixture: 2 kiracı (A, B), A'da 6 rolün her biri için bir kullanıcı. ID'ler `live-run.txt`'deki `I59_FIXTURE` satırında. Silme yalnız tek id ile yapıldı ve yalnız izole DB'de (H8'deki action'ın kendi `deleteEvidence`'ı). Toplu silme yok.

**H1: yasak yazmalar.** Hepsi reddedildi; öncesi/sonrası satır görüntüsü eşit (`expect(await snap()).toEqual(before)` yeşil):
```
MEMBER           deleteEvidence(evA)                      → throw:FORBIDDEN_ROLE
GUEST_PARTNER    deleteEvidence(evA)                      → throw:FORBIDDEN_ROLE
MEMBER           signDocument(docA)                       → throw:FORBIDDEN_ROLE
GUEST_PARTNER    issuePartnerPortalLink(partA)            → throw:FORBIDDEN_ROLE
WRITER           departmentApproveAction(docA,FINANCE)    → throw:FORBIDDEN_ROLE
WRITER           moveOpportunityStage(oppA,G1)            → throw:FORBIDDEN_ROLE
WRITER           evaluateOpportunityGate(oppA,G1)         → throw:FORBIDDEN_ROLE
MEMBER           createRelationship                       → throw:FORBIDDEN_ROLE
MEMBER           updateNoteStatus(x,approved)             → throw:FORBIDDEN_ROLE
MEMBER           updateRelationship(relA,{ownerUserId})   → ok:{"success":false,"error":"FORBIDDEN"}
```
**H2: eski ya da eksik rol claim'i.** `"SUPER_WRITER"`, `"tenant_owner"`, `""`, `null` → dördü de `FORBIDDEN_ROLE`, satır duruyor. `null` durumunda `tenantScopeOf` rolü `'MEMBER'`'a düşürüyor, bu da doğru tarafa (daha az yetkiye) düşmek demek.

**H3: kiracılar arası.** A'nın OWNER'ı B'nin id'lerini hedefliyor, B'de hiçbir şey değişmiyor:
```
deleteEvidence(evB) → ok:{"success":false}
signDocument(docB) → ok:{"success":false,"signedAt":"2026-09-30T06:27:00.442Z"}   (Ö-5)
updateRelationship(relB) → ok:{"success":false,"error":"NOT_FOUND"}
issuePartnerPortalLink(partAB) → ok:null
```
H8'de de OWNER ve ADMIN `departmentApproveAction(docB)` çağırdı ve `DOC_NOT_FOUND` aldı. Not: `fabrika` süper kullanıcı (BYPASSRLS) ile koşuldu, yerel uygulama da böyle koşuyor. Yani yalıtımı RLS değil, uygulamanın `where { id, tenantId }` filtresi sağlıyor ve ölçülen tam olarak bu.

**H5 (B-1):**
```
H5 GUEST_PARTNER updateRelationship → ok:{"success":true}; relA now {"notes":"guest-wrote","warmth":"cold"}
```
**H6 (KARAR maddeleri, uygulandığı haliyle):**
```
H6 WRITER signDocument(docA) → ok:{"success":true,…}; docA.signedAt null → Wed Sep 30 2026 09:27:00   (Y-4)
H6 WRITER issuePartnerPortalLink ×2 → ok:{"token":"******… / ok:{"token":"******…; hash changed twice: true   (Ö-2)
H6 WRITER updateNoteStatus(free-text status) → ok:{"success":true}   (Ö-1)
```
**H8: 6 rol × canlı satır; sonuç = `can(rol, izin)`** (her rol için yeni bir evidence satırı; beklenti `can()`'dan hesaplanıyor):
```
TENANT_OWNER     edit_proposal: geçti (satır kaldı=0) can=true | approve_dual_approval: geçti→DOC_NOT_FOUND can=true
TENANT_ADMIN     edit_proposal: geçti (satır kaldı=0) can=true | approve_dual_approval: geçti→DOC_NOT_FOUND can=true
PIPELINE_MANAGER edit_proposal: geçti (satır kaldı=0) can=true | approve_dual_approval: RET can=false
WRITER           edit_proposal: geçti (satır kaldı=0) can=true | approve_dual_approval: RET can=false
MEMBER           edit_proposal: RET (satır kaldı=1) can=false | approve_dual_approval: RET can=false
GUEST_PARTNER    edit_proposal: RET (satır kaldı=1) can=false | approve_dual_approval: RET can=false
```
**H7 (Y-2):** `authConfig.callbacks.jwt` canlı DB ile çağrıldı. Sıra: sign-in → üyelik MEMBER'a düşürüldü → sıradan istek → üyelik tek id ile silindi → sıradan istek:
```
H7 {"signIn":{"tenantId":true,"role":"TENANT_OWNER"},"afterDemote":"TENANT_OWNER","afterRemove":{"tenantId":true,"role":"TENANT_OWNER"},"maxAge":{"strategy":"jwt"}}
```
`maxAge` tanımlı olmadığı için Auth.js varsayılanı geçerli: 30 gün, kullanıldıkça kayan pencere. Yani aktif bir kullanıcı üyeliği silinse bile süresiz OWNER kalır. H4 aynı şeyi action tarafında gösteriyor: action üyeliği yeniden okumuyor. B kiracısında üyeliği olmayan bir kullanıcı, `tenantId=B` claim'iyle `relB.notes = forged-claim` yazdı. Bu doğrudan bir saldırı yolu değil, çünkü JWT imzalı. Anlamı şu: claim bayatlarsa (Y-2) hiçbir şey onu durdurmuyor.

**Kapsam dışı / koşulamadı:** HTTP katmanı (`Next-Action` POST) koşulmadı. Rol kontrolü action gövdesinin ilk satırında olduğu için taşıma katmanından bağımsız. `api/billing/checkout` canlı koşulamadı, çünkü Stripe anahtarı yok ve demo dalı yazma yapmıyor. Y-3 yalnız kod kanıtına dayanıyor.

## 4) (c) Bekçi mutantları

Betik ve çıktı: `ekler/mutants.py`, `ekler/mutants-out.txt`. Her mutant yeni ya da değiştirilmiş bir action. Her birinde `server-action-rbac-guard` + `server-action-rbac` + `use-server-exports` koşuldu, sonra dosya geri yazıldı (`git status` yalnız benim `i59-*` dosyalarımı gösteriyor).

| # | Mutant (yazma yapan yeni/değişmiş action) | Sonuç |
|---|---|---|
| G1 | `requireTenantAction()` + sonucu kullanılmayan `can(role,'edit_proposal')` | **sağ** (71/71 yeşil). B-1 de bu sınıftan. |
| G2 | `requireTenantAction({ can: undefined as never })` | **sağ**. Bekçi yalnız anahtarın varlığına bakıyor, çalışma anında kontrol yok. |
| G3 | readOnly + `withTenant(tenantId, (t) => t.evidence.deleteMany(…))` | **sağ**. `CLIENTS = {prisma, tx, db}` |
| G4 | readOnly + `({ evidence }) => evidence.deleteMany(…)` | **sağ** |
| G5 | readOnly `getConflicts` içinde modül dışı yazan yardımcı (`scoreCandidatesForSeat`) | **sağ** (R-4a'da biliniyordu) |
| G6 | `updateTenantProvince`: `can` kontrolü `tenant.update` + `auditEvent.create`'ten **sonraya** taşındı | **sağ**. Sıra kontrol edilmiyor. |
| G7 | `async function wipe…(){ requireTenantAction(); deleteMany }` + `export { wipe… }` | **sağ**. `functionsOf` yalnız export anahtar kelimesine bakıyor, use-server-exports da buna izin veriyor. |
| G8 | `import { prisma as client }` + readOnly'de `client.evidence.deleteMany` | **sağ** |
| G9 | `requireTenantAction({ ...WRITE })` (can const'tan yayılıyor) | **kırmızı**. Fail-closed yanlış pozitif, kabul edilebilir. |
| G10 | Portal sayfasında satır içi `'use server'` action'a `prisma.evidence.deleteMany` eklendi | **sağ**. Satır içi action'lar hiç taranmıyor (İNCELEME-30 kör noktası 1). |

**8 mutanttan 8'i sağ kaldı (G9 kırmızı, doğru davranış).** be-fb'nin 4/4 sonucu doğru, ama onun mutantları bekçinin tasarlandığı dar kalıptaydı. **Düzeltme önerisi (Y-1):**
1. Rol kontrolünü şekil olarak zorla: action gövdesinin ilk `await`'i `requireTenantAction({ can: '<Action literal>' })` olmalı. Ya da ilk ifade `if (!can(…)) return|throw` / `assertTenantActionRole(…, '<literal>')` olmalı ve bu **ilk yazmadan önce, koşulsuz** gelmeli. Literal değeri `rbac.ts` Action kümesine karşı doğrula. Bu G1, G2, G6 ve B-1'i kapatır.
2. Yazma tespiti alıcı adına bakmasın: herhangi bir `<x>.<y>.(create|update|upsert|delete…)` ve `$executeRaw` çağrısı yazma sayılsın. Destrüktür parametreyi `withTenant` geri çağrısı içinde ele al (G3, G4, G8).
3. `ExportDeclaration`'daki `export { a, b as c }` adlarını `exported`'a ekle (G7).
4. Satır içi `'use server'` içeren fonksiyonları da tara (G10).
5. G5 (modül dışı yazan yardımcı) için: readOnly action'ın import ettiği `@/lib/**` fonksiyonlarını bir izin listesine bağla, ya da import edilen yardımcı gövdelerini de tara.

## 5) (d) §4 KARAR GEREKLİ: güvenlik değerlendirmesi (karar ürün sahibinin)

| # | Madde | Güvenlik riski (uygulandığı hâli) | Öneri |
|---|---|---|---|
| 1 | calendar connect/disconnect → `edit_proposal` | Düşük. Yalnız çağıranın kendi `userId` satırı. OAuth token'ları şifreli. | Kişisel ayar: `view_proposal` (iç rollerin hepsi). GUEST_PARTNER dışarıda kalsın. İzin listesine almak yerine bunu öneriyorum, çünkü kişisel olsa da kiracı içi takvim verisini içeri alıyor. |
| 2 | m11 heartbeat → `edit_proposal` | Orta, bütünlük. Nabız parçanın **tüm `content`'ini** geri yazıyor, bu da eşzamanlı düzenlemede kayıp güncelleme riski. Bu sorun rol açılırsa büyür. | Varlık bilgisi ayrı tabloya/alana taşınana kadar `edit_proposal` kalsın. Taşındıktan sonra `view_proposal`. |
| 3 | `addOpportunityNote` → `edit_proposal` | Düşük. Bellek içi tampon, DB'ye yazmıyor. | Güvenlik açısından nötr. Ürün MEMBER yorumu istiyorsa `contribute_assigned` olabilir. |
| 4 | `updateNoteStatus` (approved dahil) → `edit_proposal` | Orta. WRITER kendi notunu "onaylandı" yapabiliyor ve status serbest metin (Ö-1, H6'da `anything-goes` yazıldı). | Durumu enum'a bağla. `approved`/`rejected` → `manage_approvals`, taslak/incelemede → `edit_proposal`. Onaylayan ≠ `createdBy` kuralı ekle. |
| 5 | `signDocument` → `edit_proposal`; `departmentApprove` → `approve_dual_approval` | **Yüksek (Y-4).** Çift onay (iki farklı kişi, finans → hukuk) varken WRITER `signDocument` ile `signedAt`'i doğrudan yazıyor; canlıda kanıtlandı. Kontrol tümüyle atlatılabiliyor. | `signDocument`, çift onay gerektiren türlerde (NDA/LOI/COMMITMENT) akış `APPROVED_AND_SIGNED` olmadıkça reddetmeli. Doğrudan imza kalacaksa `approve_dual_approval` gerektirsin. `departmentApprove` için eşik doğru. Ayrıca dört-göz: isteyen ≠ onaylayan (Ö-4). |
| 6 | Konsorsiyum daveti (`inviteCandidateToSeat`, `assignSeat`) → `manage_workspaces` | Orta. Davet, kiracı adına **dış e-posta** gönderiyor; itibar ve spam vektörü. MUN509'daki "herkes davet edebilir" kararı bunu MEMBER'a açıyordu. | `manage_workspaces` kalsın. Ürün "herkes" derse kiracı başına hız sınırı + audit kaydı şartıyla açılsın. |
| 7 | M4 ilişkiler: create/interaction → `edit_proposal`, `updateRelationship` herkes | **B-1**: GUEST_PARTNER yazıyor. İki action aynı alanı (nextStep) farklı kuralla koruyor. | Karar ne olursa olsun `updateRelationship` en az `view_proposal` istemeli (GUEST_PARTNER'ı kesmek karar gerektirmez). be-fb'nin `contribute_assigned` + `ownerUserId === userId` önerisi güvenlik açısından en dar ve tutarlı seçenek. |
| 8 | `issuePartnerPortalLink` → `edit_proposal` | Orta. Token dış tarafa verilen bir taşıyıcı kimlik bilgisi: Part A bütçe tablosunu ve fırsat başlığını gösteriyor, bütçe satırı yazdırıyor. Süresi yok, her çağrı eski linki sessizce iptal ediyor, audit yok (Ö-2). | `manage_workspaces` (PIPELINE_MANAGER+). Ek olarak token'a son kullanma tarihi, `auditEvent` (`partner_link.issued`, kimin ürettiği) ve arayüzde "yeniden üretmek eski linki iptal eder" uyarısı. |
| 9 | approvals approve/reject → `approve_dual_approval` | Düşük bugün (servis taslak), ama R-2: `requiredRole` istemciden geliyor. | `approve_dual_approval` doğru seçim. Servis gerçek olduğunda `requiredRole = max(istemci, DUAL_APPROVAL_REQUIRED_ROLES[type])` sunucuda hesaplanmalı ve onaylayan ≠ isteyen olmalı. Bu, servis canlıya çıkmadan önce **zorunlu**. |
| 10 | `contribute_assigned` yalnız m6'da; GUEST_PARTNER Part B'de hiçbir şey yapamıyor | Güvenlik açısından iyi: dış partner için fail-closed. | Bölüm ataması şema kararı. Gelirse `contribute_assigned` + atanmışlık kontrolü, kimlik oturumdan gelmeli (R-3). O zamana kadar bugünkü hâli korunmalı. |

## 6) Değişen dosyalar
- `docs/agent-results/TASK-MUNOE0Q4FR2J-se-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUNOE0Q4FR2J-se-fb-ekler/`: `i59-rbac-hostile.live.test.ts`, `i59-jwt-stale-role.live.test.ts`, `mutants.py`, `mutants-out.txt`, `live-run.txt`. Bunlar kanıt, repoya test olarak eklenmedi. `docs/**` vitest'in exclude listesinde, yani koşuya girmiyor.
- Ürün koduna dokunulmadı.

## 7) Riskler
- B-1 düzeltilmeden MEMBER/GUEST_PARTNER dağıtımı yapılırsa dış partner CRM notlarını değiştirebilir.
- Y-2, üye çıkarma ya da rol değiştirme ekranı geldiğinde kendiliğinden gerçek bir açığa dönüşür. Bugün bu işlemler yalnız DB/destek üzerinden yapılıyor ve orada da etkisiz kalıyor.
- İzole DB `sefb_i59` fixture'larıyla birlikte duruyor (paylaşılan `fabrika` DB'ye yazılmadı). Kaldırılması tek komut: `drop database sefb_i59`. Onay gelirse ben yaparım.

## 8) Açık sorular (ürün sahibi)
- §5'teki 10 madde, özellikle 5 (doğrudan imza) ve 8 (partner linki kimde).
- `updateRelationship` "her üye düzenler" kararı GUEST_PARTNER'ı da kapsıyor muydu? Güvenlik görüşüm: kapsamamalı.

## 9) Sonraki adım
- **be-fb:** B-1 (tek satır: `requireTenantAction({ can: 'view_proposal' })`, ya da karar 7 ne derse) + davranış testine GUEST_PARTNER vakası. Y-1 bekçi sıkılaştırması (§4 öneri 1–4) ve G1/G2/G3/G6/G7/G10'un bekçi dosyasına kendi-mutant testi olarak eklenmesi. Y-3 checkout'a `manage_billing`.
- **BE/auth kartı (Y-2):** jwt callback her istekte (ya da kısa aralıkla) membership rolünü ve kiracısını yeniden okusun. Zaten her çağrıda `isPlatformAdmin` için DB'ye gidiliyor, sorguya `memberships` seçimini eklemek tek bir join demek. Üyelik yoksa token kiracısız kalsın. R-6 cümlesi düzeltilsin.
- **Ürün sahibi:** §5 kararları. Y-4 için karar gelene kadar `signDocument`'in çift onay gerektiren türlerde kapatılmasını öneriyorum.
- **se-fb:** düzeltmeler gelince B-1 ve Y-1 yeniden testi: bu raporun ekindeki H5 ve G1–G10 aynen yeniden koşulacak.
