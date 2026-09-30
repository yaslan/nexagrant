# TASK-MUN80UOUPB2A4 — FB GÜVENLİK Y-3: yazma action'larında RBAC · be-fb

Bu kartla TASK-MUN4H2RL79D8B (readOnly bekçisi, se-fb Ö-4) de kapanır (Adım B).

**Karar/Durum:** BİTTİ, `review`'a hazır. 57 yazma action'ı artık `src/lib/rbac.ts`'e soruyor (matris değişmedi). Statik bekçi ve davranış testi yeşil, 4 mutantın 4'ü kırmızı. Kapı temiz worktree'de temiz: tsc 0, lint 0, i18n 0, bekçi + davranış testleri 0 hata, `pnpm build` 0. Tam test koşusunda tek bir kırmızı var ve bu işten önce de vardı (§8 R-1). KARAR GEREKLİ listesinde 10 madde var (§4). Ürün sahibi bunlara bakmadan MEMBER'lara dağıtım yapılmamalı.

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node + pnpm 11.25). Kod yolu platforma bağlı değil: sunucu tarafında saf rol karşılaştırması ve TS AST taraması var; süreç, dosya yolu ya da kabuk kullanmıyor. Bekçi yolları `path.sep` ile `/`'ye çevirdiği için Windows'ta da aynı anahtarları üretir. Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız mac var. Beklenen fark yok.

## 1) Ne yapıldı

**A — Yardımcı ve hata sözleşmesi**
- `src/lib/tenant.ts`:
  - `requireTenantAction({ readOnly?, can?: Action })`: önce pilot kapısı, sonra rol kontrolü. Süresi dolmuş pilot her rol için geçerli bir cevap olduğu için önce o gösteriliyor.
  - `assertTenantActionRole(scope, action)`: kendi kiracı kontrolünü yapan action'lar için (pipeline).
  - `ForbiddenRoleError`: `code`/`digest` = `FORBIDDEN_ROLE`; mesajda kullanıcı değil yalnız izin adı var.
  - Enum dışı eski bir rol claim'i hiçbir yetki vermez (`asRole` → `can`).
- `src/lib/forbidden-role.ts`: `pilot-expired.ts` deseninde, istemci tarafından da import edilebilir. `FORBIDDEN_ROLE_DIGEST`, `FORBIDDEN_ROLE_CODE='forbiddenRole'` ve `isForbiddenRole` burada.
- i18n: `Common.forbiddenRole`, tr + en. `useActionErrorText` bu reddi tanıyor. Bu hook'u kullanan 18 ekran UI değişikliği olmadan i18n cümlesini gösteriyor. m8 "Aday Bul" form sarmalayıcısı değer döndürdüğü için reddi `code: 'forbiddenRole'` olarak iletiyor.
- Eşlemeler: 49 action'a `requireTenantAction({ can })`, pipeline'daki 6 action'a `assertTenantActionWritable` yanında `assertTenantActionRole`, onay ekranındaki approve/reject'e `approve_dual_approval` bağlandı. Toplam 57.
- Gerçekte yazmayan 2 action `readOnly: true` oldu: m2 `generateAiUsageDeclaration` yalnız `findMany` yapıyor, m7 `matchTtoItemToCalls` yalnız okuyup sabit liste döndürüyor. Bekçi bunlarda yazma olmadığını kanıtlıyor.

**B — Bekçi (TASK-MUN4H2RL79D8B)**: `tests/server-action-rbac-guard.test.ts`
- TypeScript AST ile tüm `'use server'` modüllerini tarıyor: 36 dosya, 127 export.
- Export edilen her fonksiyon üç şeyden biri olmalı: (a) `readOnly: true`, (b) rol kontrollü (`requireTenantAction({ can })`, `assertTenantActionRole`, `can(...)`, `requirePlatformAdmin`, `isPlatformAdminSession`, `canArchiveOpportunity`, `canConfirmSeat`), (c) gerekçeli `ALLOWED` listesinde.
- `readOnly: true` olan bir action `<prisma|tx|db>.<model>.create|update|upsert|delete…` ya da `$executeRaw` çağırırsa kırmızı. Aynı dosyadaki yardımcılara geçişli bakıyor; örneğin `savePartContent` üzerinden yapılan yazmayı yakalıyor.
- `ALLOWED` listesinde eskimiş bir anahtar kalırsa da kırmızı.
- Dosyanın içinde 3 kendi-mutant testi var.
- MUN4H2 için ayrıca: m11 `updatePresenceHeartbeat` (readOnly iken içerik yazıyordu, N-2) ve düzenleyicinin bu retten sonra 20 saniyelik nabzı durdurması. Bu ikisi önceki oturumumdan ana checkout'ta commit'lenmeden kalmıştı; bu commit'e taşındı.

**C — Davranış**: `tests/server-action-rbac.test.ts`
- Gerçek action'lar çağrılıyor; `auth()` her testte 6 rolden birini döndürüyor.
- Beklenen sonuç tabloya yazılmıyor, `can(role, izin)`'den hesaplanıyor.
- Reddedilen çağrı `withTenant`'a ulaşmıyor, yani transaction açılmıyor.
- Sahte tx üzerinde uçtan uca üç akış:
  - gate: PIPELINE_MANAGER geçer; WRITER ve MEMBER engine çalışmadan reddedilir.
  - evidence delete: WRITER hem satırı hem dosyayı siler; MEMBER hiçbir şey silemez.
  - concept-note save: WRITER yazar; MEMBER ve GUEST_PARTNER yazamaz.
- Ayrıca: enum dışı rol reddediliyor ve m8 form kodu doğru.

**D — Etki listesi**: §6. UI'ya dokunulmadı. Tek istisna: m11 düzenleyicinin nabız `catch`'ine `isForbiddenRole` eklendi, yoksa MEMBER her 20 saniyede bir sunucu loguna FORBIDDEN_ROLE düşürür. MUN4H2'nin pilot satırıyla aynı satır.

## 2) Kanıt

Çıktılar kopyalandı. Temiz worktree: `scratchpad/wt`, baz `7a83e7d2` ve 4 commit.

**Kapı (son commit `13e132d5` + yalnız yorum değiştiren `55022607`):**
```
LINT_EXIT=0
TSC_EXIT=0
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
I18N_EXIT=0
tests/server-action-rbac-guard.test.ts + tests/server-action-rbac.test.ts + tests/use-server-exports.test.ts
 Test Files  3 passed (3)
      Tests  71 passed (71)
GUARD_EXIT=0
pnpm test:  Test Files  1 failed | 249 passed | 6 skipped (256)
            Tests  1 failed | 3025 passed | 48 skipped (3074)
 FAIL  tests/teardown-where-guard.test.ts … (evidence-object-key.live.test.ts:133/141 — bazda var, §8 R-1)
✓ Compiled successfully … ✓ Generating static pages using 11 workers (30/30)
BUILD_EXIT=0
```

**Dev ucunda (`06f57d52`), yeni ve temiz worktree `scratchpad/wtdev`:**
```
TSC=0
guard + rbac + teardown + use-server + pipeline-actions-pilot-digest: Tests  1 failed | 91 passed (92)
  × teardown-where-guard: "tests/stale-relationship-reminder.live.test.ts:395 where: args" — 5e196e86 (se-fb, MULQL2), bu işle ilgisiz (§8 R-1)
```

**Bekçinin ilk koşusu (düzeltmeden önce):** 59 kırmızı: Y-3 Ek A'daki 51 action (`addBudgetLineByToken` izin listesinde) ve envanterde yanlışlıkla "Rol=Y" işaretlenmiş 8 action (§3 "Kaynak" sütunu). Düzeltmeden sonra 0.

**Mutant kanıtı** (diskte uygulanıp geri alındı, `git status` temiz):
| # | Mutant | Sonuç |
|---|---|---|
| M1 | `deleteEvidence`: `requireTenantAction({ can: 'edit_proposal' })` → `requireTenantAction()` | **5 failed**: bekçi `…evidence/actions.ts#deleteEvidence: write action without a role check`; davranış `evidence.deleteEvidence needs edit_proposal`, `evidence delete: WRITER deletes…, MEMBER deletes nothing` |
| M2 | readOnly `getEvidenceItemsAction` içine `tx.evidence.updateMany(...)` | **2 failed**: `…#getEvidenceItemsAction: readOnly: true but writes: tx.evidence.updateMany (line 32)` |
| M3 | `evaluateOpportunityGate`: `assertTenantActionRole(scope, 'evaluate_gates')` satırı silindi | **3 failed**: bekçi `#evaluateOpportunityGate: write action without a role check`; davranış (6 rol tablosu ve gate akışı) |
| M4 | gate `evaluate_gates` → `edit_proposal` (yanlış izin) | **2 failed**: bekçi bunu göremez, çünkü rol kontrolü var; davranış testi yakalar (WRITER geçer, beklenen ret) |
| iç | Bekçi dosyasında 3 kendi-mutant testi: `can` silinmesi, readOnly'ye yazma, yardımcı üzerinden yazma (`via savePartContent`) | her koşuda yeşil |

**Davranış testi** (`tests/server-action-rbac.test.ts`, 63 test): 57 action × 6 rol. Beklenen sonuç `can(rol, izin)`'den hesaplanıyor. Reddedilen çağrıda `withTenant` hiç çağrılmıyor. Uçtan uca kontroller:
- gate: PIPELINE_MANAGER `evaluateGate('opp-1','G1','tenant-A','user-1')`; WRITER ve MEMBER `{digest:'FORBIDDEN_ROLE', action:'evaluate_gates'}` ile reddediliyor, `findFirst` ve engine çağrılmıyor.
- evidence delete: WRITER `deleteMany({where:{id,tenantId}})` ve `deleteTenantObject` çağırıyor; MEMBER reddediliyor, ikisi de çağrılmıyor.
- concept-note save: WRITER `version 3→4` yazıyor; MEMBER ve GUEST_PARTNER reddediliyor, `findFirst` çağrılmıyor.
- `role:'SUPER_WRITER'` (enum dışı) reddediliyor. m8 form sarmalayıcısı `{status:'error', code:'forbiddenRole'}` döndürüyor.

## 3) Eşleme tablosu — 57 rol kontrollü action

MEMBER yalnız `view_proposal`, `contribute_assigned` ve `request_dual_approval` yapabiliyor (matris değişmedi).

| # | Dosya | Action | İzin | Kaynak | MEMBER | KARAR? |
|---|---|---|---|---|---|---|
| 1 | `app/…/pipeline/actions.ts` | createOpportunity | `manage_workspaces` | Y-3 Ek A | ✘ ret |  |
| 2 | `app/…/pipeline/actions.ts` | assignOpportunityOwner | `manage_workspaces` | Y-3 Ek A | ✘ ret |  |
| 3 | `app/…/pipeline/actions.ts` | moveOpportunityStage | `manage_workspaces` | Y-3 Ek A | ✘ ret |  |
| 4 | `app/…/pipeline/actions.ts` | evaluateOpportunityGate | `evaluate_gates` | Y-3 Ek A | ✘ ret |  |
| 5 | `app/…/pipeline/actions.ts` | addOpportunityNote | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |
| 6 | `app/…/pipeline/actions.ts` | logEffort | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 7 | `app/…/pipeline/[id]/consortium/actions.ts` | addSeat | `manage_workspaces` | Y-3 Ek A | ✘ ret |  |
| 8 | `app/…/pipeline/[id]/consortium/actions.ts` | findCandidates | `manage_workspaces` | Y-3 Ek A | ✘ ret |  |
| 9 | `app/…/pipeline/[id]/consortium/actions.ts` | assignSeat | `manage_workspaces` | Y-3 Ek A | ✘ ret | evet |
| 10 | `modules/m8/server/actions.ts` | computeSeatCandidates | `manage_workspaces` | Y-3 Ek A | ✘ ret |  |
| 11 | `modules/m8/server/actions.ts` | inviteCandidateToSeat | `manage_workspaces` | envanter "Rol=Y" hatalı | ✘ ret | evet |
| 12 | `app/…/evidence/actions.ts` | getPresignedUploadUrlAction | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 13 | `app/…/evidence/actions.ts` | confirmEvidenceUploadAction | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 14 | `app/…/evidence/actions.ts` | createEvidence | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 15 | `app/…/evidence/actions.ts` | deleteEvidence | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 16 | `app/…/evidence/actions.ts` | verifyEvidenceAction | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 17 | `app/…/concept-notes/actions.ts` | createConceptNote | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 18 | `app/…/concept-notes/actions.ts` | saveSectionContent | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 19 | `app/…/concept-notes/actions.ts` | generateSectionDraft | `edit_proposal` | envanter "Rol=Y" hatalı | ✘ ret |  |
| 20 | `app/…/concept-notes/actions.ts` | updateNoteStatus | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |
| 21 | `app/…/approvals/actions.ts` | submitApprovalRequestAction | `request_dual_approval` | Y-3 Ek A | ✔ izinli |  |
| 22 | `app/…/approvals/actions.ts` | cancelRequestAction | `request_dual_approval` | Y-3 Ek A | ✔ izinli |  |
| 23 | `app/…/approvals/actions.ts` | approveRequestAction | `approve_dual_approval` | envanter "Rol=Y" hatalı | ✘ ret | evet |
| 24 | `app/…/approvals/actions.ts` | rejectRequestAction | `approve_dual_approval` | envanter "Rol=Y" hatalı | ✘ ret | evet |
| 25 | `app/…/relationships/actions.ts` | createRelationship | `edit_proposal` | envanter "Rol=Y" hatalı | ✘ ret | evet |
| 26 | `app/…/relationships/actions.ts` | addInteraction | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |
| 27 | `modules/m4/server/actions.ts` | createRelationship | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |
| 28 | `modules/m4/server/actions.ts` | addInteraction | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |
| 29 | `modules/m4/server/actions.ts` | updateNextStep | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |
| 30 | `modules/m2/server/actions.ts` | generateConceptNoteDraft | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 31 | `modules/m2/server/actions.ts` | saveConceptNoteDraft | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 32 | `modules/m6/server/actions.ts` | generateAiEvaluation | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 33 | `modules/m6/server/actions.ts` | saveHumanEvaluation | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 34 | `modules/m6/server/actions.ts` | calibrateESR | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 35 | `modules/m6/server/actions.ts` | saveEvaluation | `contribute_assigned` | Y-3 Ek A | ✔ izinli | evet |
| 36 | `modules/m7/server/actions.ts` | createTtoItem | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 37 | `modules/m7/server/actions.ts` | generateIpChecklist | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 38 | `modules/m9/server/actions.ts` | generateMeetingBrief | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 39 | `modules/m9/server/actions.ts` | savePostMeetingNotes | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 40 | `modules/m9/server/calendar-actions.ts` | connectCalendar | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |
| 41 | `modules/m9/server/calendar-actions.ts` | disconnectCalendar | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |
| 42 | `modules/m10/server/actions.ts` | generateStandardDoc | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 43 | `modules/m10/server/actions.ts` | signDocument | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |
| 44 | `modules/m10/server/actions.ts` | createNewVersion | `edit_proposal` | envanter "Rol=Y" hatalı | ✘ ret |  |
| 45 | `modules/m10/server/actions.ts` | submitDualApprovalAction | `request_dual_approval` | envanter "Rol=Y" hatalı | ✔ izinli |  |
| 46 | `modules/m10/server/actions.ts` | departmentApproveAction | `approve_dual_approval` | envanter "Rol=Y" hatalı | ✘ ret | evet |
| 47 | `modules/m11/server/actions.ts` | createApplicationPart | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 48 | `modules/m11/server/actions.ts` | acquireSectionLock | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 49 | `modules/m11/server/actions.ts` | releaseSectionLock | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 50 | `modules/m11/server/actions.ts` | updateSectionContent | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 51 | `modules/m11/server/actions.ts` | addSectionComment | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 52 | `modules/m11/server/actions.ts` | resolveSectionComment | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 53 | `modules/m11/server/actions.ts` | restoreSectionRevision | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 54 | `modules/m11/server/actions.ts` | updatePresenceHeartbeat | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |
| 55 | `modules/m11/server/actions.ts` | addBudgetLine | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 56 | `modules/m11/server/actions.ts` | addWorkPackage | `edit_proposal` | Y-3 Ek A | ✘ ret |  |
| 57 | `modules/m11/server/partner-link.ts` | issuePartnerPortalLink | `edit_proposal` | Y-3 Ek A | ✘ ret | evet |

**readOnly'ye çevrilen 2 action (Y-3 Ek A'daydı, gerçekte yazmıyor):** `m2.generateAiUsageDeclaration` (yalnız `aiUsageLog.findMany`) ve `m7.matchTtoItemToCalls` (okuma + sabit liste). Bekçi bunlarda Prisma yazması olmadığını kanıtlıyor.

**İzin listesi (ALLOWED, gerekçeli, bekçi dosyasında):**
- oturum yok ya da giriş/çıkış akışı: login×2, logout, `submitReadinessLead`, accept-invite×3
- kullanıcının kendi KVKK işlemleri: `exportUserData`, account deletion×3
- `addBudgetLineByToken`: token kimlik doğrulamalı partner portalı; oturum ve rol yok, dar kapsamlı, pilot kapısı var
- pipeline'da `sessionScope` üzerinden yapılan iki okuma: `getOpportunityFormMembers`, `getSuggestedTopics`
- `saveCoBrand`: satır içi `EDITOR_ROLES` kontrolü (OWNER/ADMIN)

Başka rol kuralıyla zaten geçen yazmalar: `canArchiveOpportunity` (archive/declare), `canConfirmSeat` (m8 confirm), `can(...)` (settings, ajans, relationships `updateRelationship`), `requirePlatformAdmin` (admin/*).

## 4) KARAR GEREKLİ

Hepsi uygulanmış haliyle çalışıyor ve fail-closed. Ürün sahibi aksini seçerse yalnız ilgili action'daki `can` değeri değişir; testler tablo güdümlü olduğu için tek satırlık değişiklikle uyarlanır.

1. **`calendar.connectCalendar` / `disconnectCalendar` → `edit_proposal`** (talimattaki "m9 yazmaları" maddesine göre). Bu action'lar yalnız çağıranın kendi takvim satırına yazıyor (`userId` ile). Sonuç: MEMBER kendi takvimini bağlayamıyor. Öneri: kişisel ayar olarak izin listesine alınsın.
2. **`m11.updatePresenceHeartbeat` → `edit_proposal`**. Görüntüleyen kullanıcının "buradayım" bilgisi. Parçanın tüm `content` alanını geri yazdığı için yazma sayılıyor. MEMBER artık varlık listesinde görünmüyor. Düzenleyici nabzı ilk retten sonra durduruyor.
3. **`pipeline.addOpportunityNote` → `edit_proposal`**. Talimattaki eşlemede yoktu. Not yalnız bellek içi tampona yazılıyor.
4. **`conceptNotes.updateNoteStatus` → `edit_proposal`**. `status:'approved'` de dahil. WRITER kendi notunu "onaylandı" yapabiliyor. Onay durumu için `manage_approvals` düşünülebilir.
5. **m10:**
   - `departmentApproveAction` → `approve_dual_approval` (yalnız OWNER/ADMIN). PIPELINE_MANAGER ve WRITER finans/hukuk onayı veremiyor.
   - `signDocument` → `edit_proposal`. WRITER, çift onay akışını atlayıp belgeyi doğrudan imzalayabiliyor. `approve_dual_approval` önerilir.
6. **Konsorsiyum daveti (`inviteCandidateToSeat`, `assignSeat`) → `manage_workspaces`**. Bu, TASK-MUN509G2ICKWI'nin açıkça yazdığı "herhangi bir üye davet edebilir" kararını değiştiriyor. Yorum güncellendi (`55022607`).
7. **İlişkiler (M4):**
   - `m4.*`, `relationships.createRelationship` ve `addInteraction` → `edit_proposal`.
   - Buna karşılık `updateRelationship` belgelenmiş kararla hâlâ her üyeye warmth/nextStep/notes düzenletiyor. Yani `m4.updateNextStep` (edit_proposal) ile `updateRelationship.nextStep` (herkes) tutarsız.
   - Öneri: `contribute_assigned` + `ownerUserId === userId` kontrolü, yani sorumlu olduğun ilişkiye katkı.
8. **`partnerLink.issuePartnerPortalLink` → `edit_proposal`**. Bu action dış paydaşa erişim belgesi (token) üretiyor. `manage_workspaces` ya da `manage_users` daha uygun olabilir.
9. **`approvals.approveRequestAction` / `rejectRequestAction` → `approve_dual_approval`**. Alternatif `manage_approvals` (PIPELINE_MANAGER dahil). `DUAL_APPROVAL_REQUIRED_ROLES`'un en düşük eşiği TENANT_ADMIN olduğu için `approve_dual_approval` seçildi. Not: servis bir taslak (§8 R-2).
10. **`contribute_assigned` yalnız bir yerde kullanıldı: `m6.saveEvaluation`.** Burada atanmışlık kontrolü zaten var (panel koltuğu `reviewer.userId === userId`). m11 bölümlerinde "atanan yazar" modeli yok. Sonuç: GUEST_PARTNER Part B düzenleyicide hiçbir şey yapamıyor. Bölüm ataması istenirse şema kararı gerekiyor.

## 5) Mutant kanıtı
§2'deki tablo: 4 disk mutantı ve 3 kendi-mutant testi; hepsi kırmızı.

## 6) Etki listesi (yalnız listeleme, UI'ya dokunulmadı)

**Seed ve demo kullanıcıları:**
| Kullanıcı (kaynak) | Rol | Kaybettiği yazmalar |
|---|---|---|
| demo girişleri `admin@…`, `demo@usfinbridge.com`, `ayse@tto.edu.tr` (`src/lib/auth.ts` DEMO_PROFILES); `scripts/beta-onboarding.ts` sahipleri; seed `DEMO_ADMIN_SEAT` | TENANT_OWNER | yok |
| `can@arge-lab.com` (demo), `alice@fabrika.test` (seed-tenant-workspace) | PIPELINE_MANAGER | m10 departman onayı (Belgeler), onay ekranında onayla/reddet |
| `bob@fabrika.test` | WRITER | Fırsat oluşturma/taşıma/sahip atama (Pipeline panosu, çağrı detayı "Ekle"), kapı değerlendirme (fırsat detayı), konsorsiyum koltuk ekle/aday bul/ata ve m8 eşleştirme "Aday Bul"/"Davet Et", m10 departman onayı, onayla/reddet |
| `charlie, dave, eve, frank, grace, heidi, ivan, judy@fabrika.test` (8 kişi) | MEMBER | Yukarıdakilerin hepsi ve ek olarak tüm `edit_proposal` yazmaları. Açık kalanlar: panel puanlama (m6 EvaluatorForm, koltuğu varsa), onay isteği gönder/iptal, m10 "onaya gönder" |
| Davetle gelen **her yeni üye**: `Membership.role @default(MEMBER)`, `/api/invitations` varsayılanı `'MEMBER'` | MEMBER | Aynı. **Yeni davet edilen kişi rolü yükseltilene kadar teklif işinde salt-okunur.** |

**Hâlâ görünen ama artık reddedilecek düğmeler** (bu dosyaların hiçbirinde yeni izinler için rol kontrolü yok; tek istisna `canArchive`):
- `pipeline/board.tsx`: yeni fırsat, sürükle-bırak aşama, sahip seçici, not ekle
- `pipeline/[id]/client.tsx`: "Kapıyı değerlendir"
- `pipeline/[id]/effort.tsx`: efor kaydet
- `pipeline/[id]/consortium/manager.tsx`: koltuk ekle, aday bul, ata
- `calls/[id]/add-button.tsx`: pipeline'a ekle
- `evidence/evidence-client.tsx`: yükle, sil
- `concept-notes/[id]/editor.tsx`: kaydet, AI taslak, durum
- `m2/ui/ConceptNoteEditor.tsx`: taslak üret, kaydet
- `opportunities/[id]/evaluations/client.tsx`: AI değerlendirme, insan değerlendirmesi, kalibrasyon
- `opportunities/[id]/documents/client.tsx`: belge üret, imzala, yeni sürüm, departman onayı
- `opportunities/[id]/application/client.tsx`: bütçe satırı, iş paketi, partner linki
- `m11/ui/PartBCollaborativeEditor.tsx`: kilit, içerik, yorum, çözüm, revizyon geri yükleme
- `opportunities/[id]/briefs/client.tsx`: brief üret, toplantı notu
- `tto/client.tsx`: kalem ekle, IP kontrol listesi
- `relationships/[id]/detail.tsx`: etkileşim ekle
- `settings/calendar/client.tsx`: bağla, kaldır
- `m8/components/*`: aday bul, davet et
- `approvals/client.tsx`: onayla, reddet

Bu 18 ekranın hepsi `useActionErrorText` kullanıyor. Hata o yardımcıdan geçtiğinde kullanıcı `Common.forbiddenRole` cümlesini görüyor ("Rolünüz bu işlem için yetkili değil…"). Düğmeleri role göre gizlemek ayrı bir FE işi (§10).

## 7) Değişen dosyalar / commit hash'leri

dev'de (worktree hash'i → dev hash'i):
- `64699375`: rapor iskeleti
- `b4bfc000 → a3ed5630` fix(security): 58 yazma action'ı ve bekçi; MUN4H2 m11 heartbeat
- `83a59bee → ebd50b37` test(security): 6 rol × 57 action ve 3 uçtan uca akış
- `13e132d5 → 3ac8f0c1` fix(security): approvals approve/reject → `approve_dual_approval`
- `55022607 → 06f57d52` docs(m8): koltuk daveti yorumu
- bu rapor: ayrı docs commit'i. Dev'e aktarım path-sınırlı stash ile yapıldı; başkasının `messages` diff'i sonra birebir aynı çıktı.

Dosyalar:
- Yeni: `src/lib/forbidden-role.ts`, `tests/server-action-rbac-guard.test.ts`, `tests/server-action-rbac.test.ts`
- Değişen, altyapı: `src/lib/tenant.ts`, `src/lib/hooks/use-action-error-text.ts`, `messages/{tr,en}.json` (`Common.forbiddenRole`)
- Değişen, action'lar: `app/…/{pipeline,pipeline/[id]/consortium,evidence,concept-notes,approvals,relationships}/actions.ts`, `modules/{m2,m4,m6,m7,m8,m9(×2),m10,m11(×2)}/server/*.ts`, `modules/m8/server/seat-transitions.ts` (yalnız yorum)
- Değişen, UI: `modules/m11/ui/PartBCollaborativeEditor.tsx` (nabız `catch`'i)
- Dokunulmayanlar: `src/lib/rbac.ts` ve ana checkout'taki başkalarına ait commit'lenmemiş işler. `messages/*.json`'daki `parse_too_heavy` satırları cherry-pick sırasında path-sınırlı stash ile korundu; geri açıldıktan sonra diff birebir aynı.

## 8) Riskler
- **R-1 — Bekçi dışı kırmızı test (bu işten değil).** `teardown-where-guard` bazda `evidence-object-key.live.test.ts:133/141` yüzünden kırmızıydı; dev'de `d8971c42` bunu düzeltti. dev ucunda bu kez `stale-relationship-reminder.live.test.ts:395` (`5e196e86`, se-fb MULQL2) aynı testi kırıyor. Sahibine bildirilmeli.
- **R-2 — Onay akışı taslak.** `createApprovalRequest`, `approveApprovalRequest`, `rejectApprovalRequest` ve `cancelApprovalRequest` (`src/lib/dual-approval.ts`) hiçbir şey kaydetmiyor ve rolü kontrol etmiyor. Ek olarak `submitApprovalRequestAction` `requiredRole` değerini istemciden alıyor: istek sahibi eşiği MEMBER'a indirebilir. Rol kontrolü artık action düzeyinde, ama servis gerçek olduğunda `requiredRole`, `max(istemci, DUAL_APPROVAL_REQUIRED_ROLES)` olarak sıkıştırılmalı ve dört-göz kuralı (onaylayan ≠ isteyen) eklenmeli.
- **R-3 — m11'de kimlik istemciden geliyor.** `acquireSectionLock`, `releaseSectionLock`, `updateSectionContent` ve `updatePresenceHeartbeat` `userId`/`authorName`/`authorOrg` değerlerini argüman olarak alıyor. Aynı kiracıdaki bir yazar başkasının kilidini açabilir ya da revizyonu başkası adına yazabilir. Y-3 kapsamı dışında, ayrı kart önerilir.
- **R-4 — Bekçinin sınırları.**
  - (a) Başka modüldeki yazmayı görmüyor, örneğin `scoreCandidatesForSeat`, `saveAgencyCoBrand`. Bunları davranış testi ve inceleme karşılar.
  - (b) Koşullu bir `can(...)` da "kontrol var" sayılıyor, örneğin `updateRelationship`.
  - (c) Route handler'ları kapsamıyor: `app/api/saved-searches/*` Y-3 Ek A'da W, Rol=- idi. Bunlar kullanıcıya ait kayıtlar ve bu kartın dışında kaldı.
- **R-5 — UX.** MEMBER ve WRITER artık görünen düğmelere basıp ret cümlesi görecek (§6).
- **R-6 — Rol değişikliğinin yayılması.** Rol JWT oturumundan okunuyor. Bir rol değişikliği mevcut davranışta olduğu gibi token yenilendiğinde yansıyor.

## 9) Açık sorular
- §4'teki 10 madde.
- MEMBER'ın "teklifte salt-okunur" olması, yeni davet edilen herkesin varsayılanı olarak ürünün istediği şey mi? İstenen buysa davet ekranında rol seçimi öne çıkarılmalı.

## 10) Sonraki adım
- **Ürün sahibi:** §4 kararları.
- **FE kartı:** §6'daki düğmeleri `can(...)` ile gizle ya da devre dışı bırak. Sayfa bileşenleri rolü `requireTenantPage` ile zaten okuyor.
- **BE kartı:** R-2 (`requiredRole` sıkıştırma ve kalıcı onay servisi) ve R-3 (m11 kimliği oturumdan).
- **se-fb:** `stale-relationship-reminder.live.test.ts:395` teardown bekçisi.
