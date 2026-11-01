# TASK-MUMT3HQI1ILAR — İNCELEME-24 B-1..B-3 + N-1 · fe-fb

Hedef: süresi dolmuş pilot kiracıda her yazma yolu "Pilot süresi doldu, düzenleme kapalı" desin (mevcut `Common.pilotExpired`, tr/en). "Tekrar deneyin" ya da boş ekran kalmasın.

## 1) Ne yapıldı

| Bulgu | Commit | Değişiklik |
|---|---|---|
| N-1 | `ac7d734b` | `tests/pipeline-actions-pilot-digest.test.ts`: 8 pipeline yazma action'ının her biri süresi dolmuş pilotla çağrılıyor. Beklenen: `PilotExpiredError` ve `digest === 'PILOT_EXPIRED'`. Önceki denemeden kalan dosya kullanıldı. İçindeki bir hata düzeltildi: `declaration: 'SUBMITTED'` geçersizdi, `'submitted'` yapıldı. Hata yüzünden `declareApplication` Zod'da `INVALID_INPUT` dönüyor ve test düşüyordu. |
| B-1 | `85b2ea60` | M11 başvuru ekranı (`opportunities/[id]/application/client.tsx`): bütçe satırı, iş paketi ve partner bağlantısı hatası artık `useActionErrorText` ile gösteriliyor. Mesaj ilgili formun içinde, `role="alert"`. Part B editöründe (`PartBCollaborativeEditor.tsx`) kaydet/otomatik kaydet, kilitle/bırak, yorum ekle/çöz ve sürüme dön için tek bir `actionError` uyarısı eklendi, editör kartının üstünde duruyor. Pilot dışındaki hatalar eskisi gibi yalnız konsola gidiyor (`errorText(err, null)`); bu, `0b93f2ed`'deki kuralın aynısı. |
| B-2 | `de1d245a` | Envanter aşağıda. Kapıdan geçen iki istemci düzeltildi: `calls/page.tsx` (kayıtlı arama kaydet/sil/bildirim) ve `settings/members/page.tsx` (davet). İkisi de `!res.ok` olunca hataya gövdedeki `code`'u ekliyor, `errorText` bunu `Common.pilotExpired`'a çeviriyor. Üyeler sayfasında hata rengi artık metnin "Hata"/"Error" ile başlamasına bakmıyor, `messageIsError` durumuna bakıyor. Mesaj kutusuna `role` eklendi (alert/status). |
| B-3 | `46d4c378` | Partner portalı: sayfa token'ın kiracısında `getPilotState` okuyor. Süre dolduysa `Common.pilotExpired` uyarısı gösteriliyor ve form `<fieldset disabled>` ile kapanıyor. Reddedilen bir gönderim sayfayı `revalidatePath` ile yeniden çiziyor; sayfa açıkken pilot biterse uyarı yine de görünür. `addBudgetLineByToken` kapı olarak kalıyor, dönüşü `{ success: false }` değişmedi (`pilot-gates.test.ts` bunu sabitliyor). |
| Test | `337db996`, `fc3ad84e` | `tests/pilot-expired-write-paths.test.tsx`, 7 test: bütçe, iş paketi (pilot dışı hatada sessiz kalıyor), Part B kilit ve kaydet, kayıtlı arama (500'de eski metin korunuyor), davet en (400'de `Error: …` korunuyor), portal süresi dolmuş/çalışan. |

**B-2 API yazma route envanteri** (`src/app/api/**` altındaki tüm POST/PUT/PATCH/DELETE):
- **Pilot kapısından geçenler** (`requireTenantApi({ write: true })` → 403 `PILOT_EXPIRED`): `saved-searches` POST, `saved-searches/[id]` PATCH/DELETE, `invitations` POST. Tek istemcileri yukarıdaki iki sayfa, ikisi de düzeltildi.
- **Bilerek kapısız bırakılanlar:**
  - `billing/checkout`, `billing/portal`, `billing/quote`: pilottan çıkmanın yolu satın almak.
  - `gdpr/delete`, `user/export`, `user/export-data`, `user/request-deletion`: kullanıcı hakları (KVKK).
  - `webhooks/stripe`, `webhooks/iyzico`: sistem.
  - `admin/*`: platform yöneticisi.
- **Karar gerektiren:** `feedback` POST kapısız. Süresi dolmuş pilot geri bildirim yazabiliyor. Bunu hata saymadım, açık soru olarak bırakıyorum.

## 2) Kanıt

### Hedefli vitest + mutantlar
```
vitest run tests/pilot-expired-write-paths.test.tsx tests/pilot-expired-action-message.test.tsx tests/pipeline-actions-pilot-digest.test.ts
  → Test Files 3 passed (3) · Tests 23 passed (23)
(temiz worktree'de + src/lib/billing/pilot-gates.test.ts → 4 files, 29 passed)

N-1 MB  createOpportunity → düz assertTenantWritable        → 1 failed (createOpportunity)   ÖLDÜ
N-1 MB* 8 action'ın hepsi düz assertTenantWritable          → 8 failed (8)                   ÖLDÜ
M1 client.tsx bütçe catch'inden setBudgetError silindi        → 1 failed (budget line)         ÖLDÜ
M2 PartB kilit catch'inden setActionError silindi             → 1 failed (Part B editor)       ÖLDÜ
M3 members: throw'dan `code: data.code` silindi               → 1 failed (member invite en)    ÖLDÜ
M4 portal: getPilotState okunmuyor (pilotExpired hep false)   → 1 failed (expired pilot)       ÖLDÜ
M5 calls: save throw'dan `code` silindi                       → 1 failed (saved search)        ÖLDÜ
Her mutanttan sonra dosyalar git checkout (commit'li) ya da md5 ile geri yüklendi: RESTORED / P_RESTORED
```

### Temiz worktree (HEAD `7ba1a495`, benim 6 commit'im dahil)
```
pnpm install --frozen-lockfile → 0 · db:generate → 0 · typecheck → 0 · lint → 0 · pnpm build → 0
pnpm i18n:check → ✅  Literals found: 312 in 36 file(s) · Baseline allows: 314   (artmadı, 2 azaldı)
```
Not: paylaşılan ağaçta `tsc` sırasında `src/lib/jobs/tasks/*` ve `api/inngest` hataları görüldü. Bunlar devop-fb'nin staged Inngest→jobs geçişine ait. Temiz worktree'de typecheck 0.

### Gerçek tarayıcı (:3000, Chromium headless-shell 1243, kendi süresi dolmuş test pilotum)
Kurulum:
- Kiracı `/tr/register` formundan açıldı: "Fefb-Pilot-Mumt3h Kuruluşu".
- Fırsat, pilot aktifken pipeline panosundan gerçek tıklamayla oluşturuldu.
- Partner bağlantısı M11'deki "Bağlantı oluştur" butonuyla üretildi.
- SQL ile yapılanlar: `Subscription` (provider `pilot`, TRIALING), ModuleState M1–M6, M8, M11 ON, 2 `ApplicationPart` satırı (ekranda Part oluşturan bir UI yok). Ardından `trialEndsAt = now()-1dk`.
- "Önce" koşusu: 5 dosya geçici olarak düzeltme öncesi sürüme alındı, sonra `git checkout` ile geri yüklendi (`RESTORED_OK`).

```
                           ÖNCE                                                   SONRA
pipeline-create-tr         (N-1 kilidi; önceki davranış 0b93f2ed'de kanıtlı)       ✕ Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun.
m11-budget-tr              (ekranda mesaj yok)                                    Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun.
m11-budget-en              (ekranda mesaj yok)                                    The pilot has ended, so editing is off. Ask your administrator to extend it.
m11-wp-tr                  (ekranda mesaj yok)                                    Pilot süresi doldu, düzenleme kapalı. …
m11-partb-lock-tr          (mesaj yok + PAGEERROR: yakalanmamış PilotExpiredError) Pilot süresi doldu, düzenleme kapalı. …
m11-partb-save-tr          (ekranda mesaj yok)                                    Pilot süresi doldu, düzenleme kapalı. …
portal-tr-1280 / tr-390    form açık; gönderim sonrası mesaj yok                  form kapalı (disabled=true); Pilot süresi doldu, düzenleme kapalı. …
portal-en-1280             form açık; mesaj yok                                   form kapalı; The pilot has ended, so editing is off. …
calls-saved-search-tr      Kayıtlı arama işlemi başarısız oldu. Lütfen tekrar deneyin.  Pilot süresi doldu, düzenleme kapalı. …
members-invite-en          Error: Ücretsiz pilot süresi doldu; çalışma alanı salt-okunur. …   The pilot has ended, so editing is off. …
"sonra" koşusunda PAGEERROR yok.
```
DB'ye yazı geçmedi:
- Part A içeriği `{}`.
- Fırsat sayısı 1, yani yalnız aktif pilotta oluşturulan.
- SavedSearch 0, Invitation 0.
- Tek istisna: Part B `presence` alanı. Bu bilerek `readOnly` olan kalp atışı; mevcut davranış, kapsam dışı.

Kareler `docs/agent-results/TASK-MUMT3HQI1ILAR-screenshots/` altında (19 dosya):
- `01-pipeline-create-tr-sonra`
- `02-m11-budget-{tr,en}-{once,sonra}`
- `03-m11-wp-tr-*`
- `04-m11-partb-tr-*`
- `05-portal-{tr-1280,tr-390,en-1280}-*`
- `06-calls-saved-search-tr-*`
- `07-members-invite-en-*`

### Test kiracısının temizliği
Silme sabit ID'lerle yapıldı: kiracı `cmun22avw000138xkw1t7gb7t`, kullanıcı `cmun22avs000038xk250iy54m`. Tek transaction içinde koştu. Koruma: `IF t IS NULL OR t = ''` ise `RAISE`, `Tenant` ve `User` için `ROW_COUNT <> 1` ise `RAISE`.
```
önce: Tenant 2 · User 43   →   sonra: Tenant 1 · User 42 · demo-tenant 1
```

## 3) Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx`
- `src/modules/m11/ui/PartBCollaborativeEditor.tsx`
- `src/app/[locale]/(app)/[workspace]/calls/page.tsx`
- `src/app/[locale]/(app)/[workspace]/settings/members/page.tsx`
- `src/app/[locale]/portal/partner/[token]/page.tsx`: yalnız kendi hunk'ım commit'lendi. Dosyada o sırada başka bir ajanın (TASK-MUMT3KVHJTYX0) commit'lenmemiş `select` değişikliği vardı. Geçici index + `git apply --cached` ile ayrıştırdım. O ajan değişikliğini sonra kendisi commit'ledi (`8caeda56`).
- `tests/pipeline-actions-pilot-digest.test.ts` (yeni), `tests/pilot-expired-write-paths.test.tsx` (yeni)
- `docs/agent-results/TASK-MUMT3HQI1ILAR-fe-fb.md` ve `-screenshots/` (19 png)
- be-fb ve devop-fb dosyalarına dokunulmadı, onların staged/unstaged değişikliklerinin hiçbiri commit'lenmedi. Her commit `git commit -- <yollar>` ile yapıldı, ardından `git show --name-only` ile kontrol edildi.

## 4) Riskler
- **M11 `public-team` planında yok.** Plan modülleri: M1–M6, M8. İlkadım tipi bir pilot M11 sayfasını zaten `moduleGate` kilidiyle görür. B-1 düzeltmesi bu yüzden savunma amaçlı; M11 içeren bir pilotta devreye girer (`public-institution`, `ultra`). Canlı M11 kanıtı için test pilotuma `public-institution` planını verdim.
- Portal ve Part B uyarısındaki metin "yöneticinize başvurun" diyor. Partner için yönetici koordinatör kurumdur. Anahtar görevin istediği gibi yeniden kullanıldı, yeni metin eklenmedi.
- Dev ortamında `console.error` çağrıları Next'in "Issues" rozetini artırıyor. Davranış önceden de vardı, üretimde görünmez.
- Paylaşılan :3000 sunucusu doğrulamanın ortasında kapandı, dinleyen süreç yoktu. Kendi `next dev -p 3000` sürecimi başlattım (PID 14062/14076/14082) ve iş bitince yalnız onu durdurdum. Port şu an boş, başlangıçta bulduğum durum da buydu.

## 5) Açık sorular
- `api/feedback` POST süresi dolmuş pilotta yazmaya devam etsin mi? Bence evet, çünkü destek kanalı. Karar patrona ait.
- M11'de pilot dışı hatalar (bütçe, iş paketi, Part B kaydet) hâlâ yalnız konsola gidiyor. Ayrı bir genel "kaydedilemedi" metni istenirse ayrı bir kart açılmalı. Bu kartın kapsamı yalnız pilot mesajıydı.

## 6) Sonraki adım
- crw/devop incelemesi: B-1..B-3 + N-1 kapanışı.
- İstenirse `feedback` kararı ve M11 genel hata metni için ayrı kartlar.

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, Node 26.5, `next dev` :3000, Docker Postgres `fabrika-postgres`, Chromium headless-shell 1243). Değişiklikler React istemci bileşenleri, bir sunucu bileşeni ve vitest testleri. Süreç, dosya yolu, kabuk, kısayol ya da DPI bağımlılığı yok. `digest` ve HTTP 403 eşlemesi ile `fieldset disabled` tarayıcı ve işletim sisteminden bağımsız, Windows ve Linux'ta aynı davranış beklenir. Bu iki platform **koşulamadı**, çünkü makinede yalnız macOS var.
