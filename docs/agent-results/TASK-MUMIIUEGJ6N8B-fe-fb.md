# TASK-MUMIIUEGJ6N8B — Pilot süre dolumu mesajı (İNCELEME-17 Ö-1) · fe-fb

## 1) Ne yapıldı

**Sorun.** Pilotu biten kiracıda server action'lar `PilotExpiredError` ile reddediliyor, ama arayüz her action'ın kendi genel hatasını gösteriyordu ("İl kaydedilemedi. Lütfen tekrar deneyin."). Bazı ekranlar hiç mesaj göstermiyordu (API anahtarı). Bazılarında ise hata, sayfanın hata sınırına kadar düşüyordu. Kullanıcı tekrar deniyor, yine reddediliyordu.

**Kök neden, iki katman:**
1. Üretimde Next.js server action hatasının mesajını tarayıcıya göndermiyor. Tarayıcıya yalnız `digest` gidiyor. Bu yüzden istemci ret nedenini ayırt edemiyordu.
2. Bazı action'lar her hatayı `{ error: 'failed' }` değerine çeviriyordu (il, ortak marka, ajans davet kodu). Bu da pilot reddini yutuyordu.

**Çözüm: tek ortak yol, action başına ayrı catch yok.**
- `src/lib/pilot-expired.ts` (yeni, istemci-güvenli, sunucu importu yok):
  - `PILOT_EXPIRED_DIGEST = 'PILOT_EXPIRED'` ve `PILOT_EXPIRED_CODE = 'pilotExpired'`.
  - `isPilotExpired(e)` ret'i üç biçimde de tanıyor: sunucudaki hata (`code`), üretimde tarayıcının aldığı hata (`digest`) ve değer döndüren action'ın kodu (`'pilotExpired'`).
  - `failureCode(e, fallback)`: değer döndüren action'ın **mevcut** catch'i için. Pilot reddinde `'pilotExpired'`, diğer hatalarda `fallback` döner.
- `src/lib/tenant.ts`:
  - Yeni `assertTenantActionWritable(tenantId)`. `assertTenantWritable`'ı çağırıyor ve `PilotExpiredError`'a `digest = 'PILOT_EXPIRED'` damgası basıp yeniden fırlatıyor.
  - `requireTenantAction()` artık bunu kullanıyor. Next.js önceden atanmış digest'i koruyor: `node_modules/next/dist/server/app-render/create-error-handler.js:79-81`, "If the error already has a digest, respect the original digest". Böylece damga üretimde de tarayıcıya ulaşıyor.
- `pipeline/actions.ts`: tenant'ı kendisi çözen 8 action'ın `assertTenantWritable` çağrısı `assertTenantActionWritable`'a çevrildi. Satır başına tek kelime değişti.
- `src/lib/hooks/use-action-error-text.ts` (yeni): `useActionErrorText()` → `errorText(error, fallback)`.
  - Pilot reddinde `Common.pilotExpired` metnini, diğer her durumda çağrı yerinin **kendi** metnini döndürüyor.
  - `fallback` bir fonksiyon olabilir, böylece ``t(`errors.${code}`)`` araması `pilotExpired` için hiç çalışmaz.
  - Daha önce hiçbir şey göstermeyen yerler `null` geçiyor. Bu yerlerde diğer hatalar eskisi gibi davranıyor, yalnız pilot reddi ekranda söyleniyor.
- **i18n, tek metin:**
  - `Common.pilotExpired` (tr): "Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun."
  - en: "The pilot has ended, so editing is off. Ask your administrator to extend it."

**Kapsam: 48 yazma action'ı arayüzde bu metni gösteriyor.** 5 sunucu dosyası ve 22 istemci bileşeni değişti.

| Ekran (istemci) | Action'lar | Önce |
|---|---|---|
| Ayarlar › Profil › İl | updateTenantProvince | "İl kaydedilemedi. Lütfen tekrar deneyin." |
| Ayarlar › API anahtarları | generateApiKey, revokeApiKey | mesaj yok / yakalanmamış ret |
| Ayarlar › Modüller | toggleModuleState (3 akış) | geliştirmede İngilizce iç mesaj, üretimde Next genel mesajı |
| Ayarlar › Fatura kimliği | saveBillingIdentity | yakalanmamış ret → hata sınırı |
| Ayarlar › Takvim | connectCalendar, disconnectCalendar | "errors.unknown" |
| Çağrı detayı › Fırsatlara ekle | createOpportunity | "Fırsat eklenemedi. Lütfen tekrar deneyin." |
| Pipeline panosu | createOpportunity, moveOpportunityStage, assignOpportunityOwner, addOpportunityNote | "… hata oluştu." |
| Fırsat detayı | evaluateOpportunityGate, archiveOpportunity, declareApplication | iç mesaj / genel |
| Fırsat › Efor | logEffort | iç mesaj / genel |
| Konsorsiyum | addSeat, assignSeat | yakalanmamış ret → hata sınırı |
| Kanıtlar | getPresignedUploadUrlAction, confirmEvidenceUploadAction, deleteEvidence | "Yükleme hatası: …" / yakalanmamış |
| Kavram notu editörü | saveSectionContent, generateSectionDraft, updateNoteStatus | yakalanmamış / "AI generation failed" |
| Onay Merkezi | submitApprovalRequestAction, approve…, reject…, cancel… | iç mesaj |
| İlişki detayı | updateRelationship, addInteraction | yakalanmamış |
| Ajans › Ortak marka | saveCoBrand | "failed" |
| Ajans › Davet kodları | createInviteCode, revokeInviteCode | "failed" |
| M6 değerlendirme + EvaluatorForm | generateAiEvaluation, saveHumanEvaluation, calibrateESR, saveEvaluation | iç mesaj |
| M7 TTO | createTtoItem, matchTtoItemToCalls, generateIpChecklist | mesaj yok |
| M9 brifing | generateMeetingBrief, savePostMeetingNotes | "… başarısız" |
| M2 ConceptNoteEditor | generateConceptNoteDraft, saveConceptNoteDraft | "Error: …" |
| M10 belgeler | generateStandardDoc, signDocument, createNewVersion, submitDualApprovalAction, departmentApproveAction | mesaj yok / iç mesaj |

**Kapsam dışı kalan 9 yazma action'ı.** Arayüzden çağıran yok ya da yalnız sunucudan çağrılıyor. Sunucu tarafında digest bunlarda da var, arayüz eklenince hook yeterli olacak:
- `createEvidence`, `verifyEvidenceAction`, `createConceptNote`, `generateAiUsageDeclaration`, `updateNextStep`, `createAgencyInviteCodeAction`, `revokeAgencyInviteCodeAction`, `m4 createRelationship`
- `assignCandidateToSeat`: eşleştirme sayfasında satır içi `'use server'` form, hata yalnız konsola yazılıyor.

**Ek olarak B-4a düzeltildi** (TASK-MUMH6W5I1W9WC, crw-fb İNCELEME-18). Ayrı commit `cdd3482b`. `6e550b68`'de eklediğim "Aboneliğiniz yok · ücretsiz paket" satırı sabit metindi ve `settings/modules/client.tsx` i18n ratchet'ını 24→25'e çıkarıyordu. Bu da `pnpm build` ve i18n CI'ını düşürüyordu. Satır artık `settings.modules.noSubscription` anahtarından okunuyor (tr+en).

## 2) Kanıt

### Gerçek tarayıcı, 3 sayfa (paylaşılan `next dev` :3000, Chromium headless-shell 1243, Playwright)
Kiracı gerçek kayıt formuyla açıldı (`/tr/register`). Sonra pilot satırı SQL ile süresi dolmuş hale getirildi: `trialEndsAt = now() - 1 dk`, `provider = 'pilot'`, `status = 'TRIALING'`. Aynı akış iki kez koşuldu: bir kez değişen 4 dosya geçici olarak HEAD sürümündeyken ("önce", md5 ile geri yüklendi: `RESTORED_OK`), bir kez yeni kodla ("sonra"). Her adım gerçek tıklama ve seçimle yapıldı.

```
ÖNCE                                                    SONRA
province-desk: İl kaydedilemedi. Lütfen tekrar deneyin.  → Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun.
province-mob:  İl kaydedilemedi. Lütfen tekrar deneyin.  → Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun.
apikey:        (ekranda mesaj yok)                        → Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun.
call:          Fırsat eklenemedi. Lütfen tekrar deneyin.  → Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun.
```
Fırsat ekleme ve API anahtarı **fırlatan** yolda çalışıyor. Bu yollarda istemci ret'i yalnız `digest` ile tanıyabilir, çünkü React Flight hata nesnesinde `code` alanını taşımıyor. Yani damga tarayıcıya ulaşmış.

DB'ye hiçbir yazı geçmedi:
```
province: Ankara · apiKeys: 0 · opportunities: 0 · audit tenant.province.updated: 0
```
Kareler `docs/agent-results/TASK-MUMIIUEGJ6N8B-screenshots/` altında:
- `01-province-{once,sonra}-{desk,mob}.png`: il ayarı, masaüstü 1280 ve mobil 390.
- `02-apikey-{once,sonra}.png`: API anahtarı formu. Önce mesaj yok, sonra form içinde `role=alert`.
- `03-call-add-{once,sonra}.png`: çağrı detayında "Fırsatlara / Pipet'e Ekle".

Erişilebilirlik: metin her ekranda var olan canlı bölgeye yazılıyor (il `role=status`, API anahtarı ve çağrı `role=alert`). Yeni eklenen konsorsiyum, TTO ve M10 bildirimleri `role=alert` ve `text-bad`/`bg-bad/10` tokenlarını kullanıyor. Mobilde metin satır kırıyor, yatay kaydırma yok.

### Birim ve bileşen testleri: `tests/pilot-expired-action-message.test.tsx` 9/9
```
npx vitest run tests/pilot-expired-action-message.test.tsx
 Test Files  1 passed (1)
      Tests  9 passed (9)
```
Kapsanan durumlar:
- `isPilotExpired` üç biçimi tanıyor ve başka hatayı tanımıyor.
- `requireTenantAction` ve `assertTenantActionWritable` digest'i basıyor, okuma açık kalıyor.
- Gerçek `updateTenantProvince` `{ error: 'pilotExpired' }` döndürüyor ve DB'ye inmiyor.
- `ProvinceSetting` render: `pilotExpired` → cümle, `failed` → eski metin.
- `AddToPipelineButton` render: **üretim biçimli** ret (mesajsız, yalnız `digest`) → cümle. Başka digest → eski etiket. en yerelde İngilizce cümle.

**Mutasyon kanıtı.** Her mutasyon yedekten geri yüklendi, `git checkout` kullanılmadı:
```
M1 no digest stamp (tenant.ts):            Tests  2 failed | 7 passed (9)
M2 province catch plain 'failed':          Tests  1 failed | 8 passed (9)
M3 hook ignores pilot:                     Tests  3 failed | 6 passed (9)
M0 restored:                               Tests  9 passed (9)
```

### Kapılar
```
npx tsc --noEmit                              → exit 0
npx eslint <değişen 30 dosya>                 → çıktı yok (temiz)
npx vitest run                                → Test Files 213 passed | 2 skipped (215) · Tests 2431 passed | 8 skipped
npm run i18n:check                            → settings/modules/client.tsx artık baseline'da (B-4a kapandı).
                                                Kalan TEK ihlal bana ait değil (aşağıda Riskler).
```
İlk tam koşuda 3 test düştü: `withholding-rounding`, `invoice-writer` ve `plan-repository`. Üçü de `billing` tarafında, dokunmadığım dosyalarda. Tek başına koşulunca 34/34 ve 10/10 geçtiler, ikinci tam koşuda da hepsi yeşildi. Sebep yük altında zaman aşımı ve paylaşılan DB yarışı.

## 3) Değişen dosyalar
**Yeni:**
- `src/lib/pilot-expired.ts`
- `src/lib/hooks/use-action-error-text.ts`
- `tests/pilot-expired-action-message.test.tsx`
- `docs/agent-results/TASK-MUMIIUEGJ6N8B-screenshots/*` (8 kare)

**Sunucu:**
- `src/lib/tenant.ts`
- `(app)/[workspace]/pipeline/actions.ts`
- `settings/profile/actions.ts`
- `ajans/cobrand-actions.ts`
- `ajans/actions.ts`

**İstemci:**
- `settings/{profile/province-setting, api-keys/client, modules/client, billing/BillingIdentityForm, calendar/client}`
- `calls/[id]/add-button`
- `pipeline/{board, [id]/client, [id]/effort, [id]/consortium/manager}`
- `evidence/evidence-client`
- `concept-notes/[id]/editor`
- `approvals/client`
- `relationships/[id]/detail`
- `opportunities/[id]/{evaluations,briefs,documents}/client`
- `tto/client`
- `ajans/{cobrand-panel, invite-codes-panel}`
- `src/modules/m2/ui/ConceptNoteEditor`
- `src/modules/m6/ui/EvaluatorForm`

**i18n:** `messages/{tr,en}.json` → `Common.pilotExpired`. B-4a commit'inde ayrıca `settings.modules.noSubscription`.

`src/lib/billing/*` ve `src/modules/m11/*` dosyalarına **dokunulmadı**. Push yok.

## 4) Riskler
- **Üretim derlemesinde canlı doğrulama yapılmadı.** `next build` paylaşılan ağacın `.next` klasörünü, dolayısıyla :3000'deki ortak dev sunucusunu ezerdi. Üretim davranışına iki kanıt var:
  - Next 16.3.4 kaynağında önceden atanmış digest korunuyor (`create-error-handler.js:79-81`, yukarıda).
  - Bileşen testi üretimin gönderdiği biçimle (mesajsız, yalnız digest) koşuyor.

  İzole bir worktree'de `next build && next start` ile tek tıklık bir doğrulama yapılması önerilir.
- **i18n kapısı hâlâ kırmızı, bana ait olmayan bir dosya yüzünden:** `opportunities/[id]/application/client.tsx 38 → 39 (+1)`. Bu ihlal HEAD'de zaten vardı; dosyayı HEAD sürümüne alınca da aynı sonuç çıkıyor. Son dokunan commit: `587a50e0` (TASK-MULQLL2T8ZJX4). `pnpm build` bu yüzden hâlâ düşer. Sahibine iletilmeli.
- Daha önce hata göstermeyen ya da hatayı hata sınırına düşüren ekranlarda (konsorsiyum, kavram notu kaydet/durum, ilişki, kanıt silme, TTO, M10 belge) davranış **yalnız pilot reddi için** değişti. Diğer hatalar bilerek eskisi gibi bırakıldı: yeniden fırlatılıyor ya da konsola yazılıyor. O ekranların genel hata UX'i ayrı bir iş.
- `useActionErrorText` `Common` namespace'ini okuyor. `NextIntlClientProvider`'a tüm mesajlar veriliyor (`[locale]/layout`), yani sorun yok.

## 5) Açık sorular
- Tarayıcıdaki geliştirme konsolunda `PilotExpiredError: The free pilot of tenant <id> …` görünüyor. Bu, sunucunun geliştirme modunda gönderdiği mesaj. Üretimde mesaj gitmiyor. Ancak bu metin `pilot.ts` içinde, yani be-fb kapsamında. İstenirse kiracı kimliği mesajdan çıkarılabilir.

## 6) Sonraki adım
- crw-fb: izole worktree'de üretim derlemesiyle bir action'ı (ör. il kaydet) tek tık doğrulasın ve B-4a'yı yeniden koşsun.
- `application/client.tsx` +1 literal için sahibine kart açılsın.

## Test kiracıları (bu görevde oluşturulan)
- Kiracı `cmumip89e0053ndxkcgy313l5`, "Fefb-Pilot-Mumip77s Kuruluşu", il Ankara.
  - Kullanıcı `fefb-pilot-mumip77s@example.test` (TENANT_OWNER, demo kayıt).
  - `Subscription`: `public-team`, `TRIALING`, `pilot`, `trialEndsAt 2026-09-29 10:11:36 UTC` (süresi dolmuş).
  - Silinmedi, yeniden kullanılabilir.

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, Node 26.5, `next dev` :3000, Docker Postgres, Chromium headless-shell 1243). Değişen kod sunucu tarafında TS ve React istemci bileşeni. Süreç, dosya yolu, kabuk ya da ekran/DPI bağımlılığı yok. `digest` Next.js'in platformdan bağımsız hata serileştirmesi. Windows ve Linux'ta aynı davranış beklenir. Bu platformlar **koşulamadı**, çünkü makinede yalnız macOS var.
