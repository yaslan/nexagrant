# TASK-MUMO35KZYLJ5R — FB İNCELEME-23 (güvenlik gözüyle): SSO/SAML kaldırma + Outlook kaldırma

**İnceleyen:** se-fb (Güvenlik Mühendisi) · **Sprint:** FB-KAMU-2 · **Dal:** dev · **İncelenen HEAD:** `9fff8c7f`
**Kod değiştirilmedi** (mutantlar ve probe testleri yalnız atılabilir worktree'de koşuldu, worktree'ler silindi).

## KARAR: **ONAY** — her iki kart için (engelleyici bulgu yok; B- yok)

| Kart | Commit | Karar |
|---|---|---|
| TASK-MUML0QZAZ5M80 (be-fb) SSO/SAML kaldırma | `0fdbcb8d` | **ONAY** |
| TASK-MUMMIHYY2F4KB (fe-fb) Outlook kaldırma | `15313bc6`, `4dc067ef` | **ONAY** |

## 1. Ne yapıldı

### (1) SSO/SAML — TASK-MUML0QZAZ5M80
- **Kalıntı taraması:** `/usr/bin/grep -rniE "\bsso\b|saml|idpEntityId|ssoAcsUrl|settings\.sso|settingsSso" src tests prisma messages scripts` → tek sonuç `tests/admin-actions-authz.test.ts:8` (kaldırıldığını anlatan yorum). Kod kalıntısı **0**. `src/app/api/auth/` altında yalnız `[...nextauth]` + `hata` var; SAML ACS rotası yok.
- **`Tenant.settings.sso` okuyan kod:** yok (grep 0). `cobrand-store.ts` read-then-merge yaptığı için eski bir `sso` anahtarı DB'de kalsa bile yazılırken korunur ama **hiçbir yol okumuyor** → etkisiz. Silinen tip yalnız `domain/idpEntityId/ssoAcsUrl/providerType/enabled/updatedAt` saklıyordu (sır yok).
- **Yerel DB (canlı sorgu):** `tenants with settings.sso: [{"n":0}]`.
- **548bf112 platform-admin korumaları:** `git diff 548bf112 HEAD -- admin/blog/actions.ts admin/cordis/actions.ts` → **boş** (dokunulmamış). Blog 4 action + CORDIS 7 action'ın hepsi ilk satırda `requirePlatformAdmin()`. `admin/billing/actions.ts` bütünüyle silindi (içindeki tek action SSO idi). Aynı ağaçtaki `admin/billing/plans/actions.ts` 11 action'ın tamamı `requirePlatformAdmin()` — bu kartta değişmemiş.
- **Billing sayfası:** `page.tsx` artık client'a `tenantId` geçmiyor (istemciye giden veri azaldı ✓). Temiz worktree `pnpm build` → exit 0, `/[locale]/admin/billing` rotası derlendi. Prod sunucusunda anonim `/tr/admin/billing` ve `/en/admin/billing` → **404** (admin layout koruması), sunucu logunda hata yok; eski `/tr/demo/ayarlar/sso` → 404.

### (2) Outlook — TASK-MUMMIHYY2F4KB
- **Kalıntı taraması:** `grep -rniE "outlook|microsoft|MICROSOFT_OAUTH|graph\.microsoft|msal" src tests prisma messages scripts` → Outlook için yalnız kaldırıldığını anlatan yorumlar + "Outlook reddedilir" testleri. `Microsoft` geçişleri **Entra** (ayrı kart, TASK-MUMLFLB2OPLY3) yorum/testleri; `msal` eşleşmeleri "Kuru**msal**" kelimesi (yanlış pozitif). `messages/*.json` içinde Outlook **0**.
- **`MICROSOFT_OAUTH_*` env:** `src`, `.env.example`, `.env` içinde **0**; yalnız docs (ROADMAP + ajan raporları) anıyor. → tamamen gitti.
- **Eski `provider='outlook'` satırı gelirse ne olur (kodla + gerçek factory ile probe):**
  - **Senkron (`sync.ts`)**: `createCalendarProvider('outlook')` → `Unknown calendar provider: outlook` fırlatır, `catch` yakalar, **çökme yok**. Probe çıktısı:
    ```
    PROBE thrown= null
    PROBE alerts= [{"level":"warn","source":"calendar_sync_failed","message":"Calendar sync failed for provider outlook: Unknown calendar provider: outlook","meta":{"module":"M9","briefId":"b1","connectionId":"c-out","provider":"outlook"},"dedupeKey":"calendar-sync-failed:c-out"}]
    PROBE updates= [{"id":"c-ics"}]
    ```
    → tek bir dedupe'lu `warn` SystemAlert (tenant/user id yok), aynı kullanıcının `ics` bağlantısı işlenmeye devam ediyor. **Sessiz değil, ele alınıyor.**
  - **Bağla (`connectCalendar('outlook')`)**: Zod şeması reddeder → `CALENDAR_UNKNOWN_PROVIDER` (test + M3 mutantı).
  - **Kopar (`disconnectCalendar(id)`)**: sağlayıcıdan bağımsız, sahiplik `deleteMany({id, tenantId, userId})` ile — çalışır. Ancak ayarlar ekranı satırı göstermez (bkz. Ö-3).
  - **Yerel DB:** `calendar rows: [{"provider":"ics","n":1,"tok":0}]` — Outlook satırı 0, token dolu satır 0.
- **KVKK silme (`users-scheduled-deletion.ts:137`)**: `tx.calendarConnection.deleteMany({ where: { userId } })` — **sağlayıcı filtresi yok**, Google/ICS/eski Outlook hepsini siler ✓. Kart yalnız bir yorum satırını değiştirdi. M4 + M5 mutantları testin bunu koruduğunu kanıtlıyor.
- **Token şifreleme durumu:** **Değişmedi.** `git diff 15313bc6~1 HEAD --stat -- src/lib/calendar/encryption.ts token-envelope.ts sync.ts prisma/` → boş. Yazıcı `saveCalendarConnectionTokens` AES-256-GCM ile şifreliyor (`encryptCalendarToken`), okuyucu `decryptCalendarToken`. Bugün OAuth yazıcısı yok, sütunlar boş (tok=0). Yorumlardaki çelişki için K-1.

## 2. Kanıt

### Mutantlar (5/5 öldü — atılabilir worktree, her birinden sonra `git checkout -- .`, `git status` temiz)
| # | Kart | Mutasyon | Sonuç |
|---|---|---|---|
| M1 | SSO | `deleteBlogPostAction` içinden `requirePlatformAdmin()` silindi | `Tests 2 failed \| 31 passed (33)` — anonim + başka-tenant admini testleri kırmızı |
| M2 | SSO | `handleTestRagQuery` (CORDIS) korumasız | `Tests 2 failed \| 31 passed (33)` |
| M3 | Outlook | `CalendarProviderSchema` → `z.enum(['google','outlook','ics'])` | `Tests 2 failed \| 27 passed (29)` (`is not a provider type`, `rejects outlook as an unknown provider`) |
| M4 | Outlook/KVKK | purge'dan `calendarConnection.deleteMany` silindi | `Tests 1 failed \| 12 passed (13)` (`every uncascaded column is cleared…`) |
| M5 | Outlook/KVKK | purge `where: { userId, provider: 'google' }` ile daraltıldı | `Tests 1 failed \| 12 passed (13)` |
| baz | — | mutasyonsuz 4 dosya | `Test Files 4 passed (4)` · `Tests 75 passed (75)` |

### Tam vitest (temiz worktree, HEAD `9fff8c7f`)
```
Test Files  6 failed | 208 passed | 2 skipped (216)
     Tests  10 failed | 2433 passed | 13 skipped (2456)
```
- **Kartlarla ilgisiz.** Düşen 6 dosya: `invoice-writer.test.ts`, `agency-funnel.live`, `double-charge-prevention`, `oauth-registration.live`, `plan-storefront.spec`, `stripe-webhook-idempotency-rls.live` — hiçbiri iki kartın dokunduğu dosyaları import etmiyor.
- Bu 6 dosya **tek başına** yeniden koşulunca: `Test Files 1 failed | 5 passed (6)` · `Tests 76 passed | 5 skipped (81)` → 9 hata tam koşudaki yük/zaman aşımı (paylaşımlı canlı DB, eşzamanlı ajanlar).
- Kalan `double-charge-prevention`: `Foreign key constraint violated … CreditLedger_tenantId_fkey` — yerel DB'de `demo-tenant` fixture'ı **yok** (canlı sorgu: `demo tenants: []`). Ortam kayması; be-fb/fe-fb koşularında bu dosya geçiyordu.
- **Skipped = 13** = 8 temel (be-fb/fe-fb raporlarıyla aynı) + 5 (`double-charge` `beforeAll` düştüğü için atlanan).

### Build (temiz worktree, `:3000`'in `.next`'ine dokunulmadı)
`pnpm build` → `✓ Compiled successfully`, `build=0`; `/[locale]/admin/billing`, `/[locale]/admin/billing/plans`, `/[locale]/[workspace]/settings/calendar` rotaları listede. Build çıktısında `sso|saml|outlook` rotası yok.
Not: `next start` ilk denemede `DEMO_LOGIN_ENABLED=true is not allowed in a production build` ile **başlamayı reddetti** (doğru güvenlik davranışı); `DEMO_LOGIN_ENABLED=false` ile port 3917'de açılıp istekler atıldı, sonra kendi sürecim kapatıldı.

## 3. Bulgular

### B- (engelleyici): yok

### Ö- (önemli, kartları bloklamaz)
- **Ö-1 — Yerel `.env`'de Entra sırları duruyor.** `.env:16-17` `AUTH_MICROSOFT_ENTRA_ID_ID=<MASKED>`, `AUTH_MICROSOFT_ENTRA_ID_SECRET=<MASKED>`. Kod bunları artık okumuyor (`auth-callbacks.test.ts:160` "Entra is not registered, even with its old keys set"). Bu iki kartın değil Entra kartının (TASK-MUMLFLB2OPLY3) kapsamı. **Düzeltme:** satırları `.env`'den sil + Entra uygulama kaydındaki client secret'ı portalda iptal et (kullanılmayan ama geçerli sır = gereksiz saldırı yüzeyi). **Etki:** düşük-orta (yerel dosya, gitignore'da; ama geçerli bir OAuth istemci sırrı).
- **Ö-2 — Takvim ayarları sayfası tam `CalendarConnection` satırını client component'e veriyor** (önceden var, `135f028b`). `settings/calendar/page.tsx:33-37` `findMany({ where: { tenantId, userId } })` → `select` yok → `accessToken`/`refreshToken` sütunları RSC payload'ıyla tarayıcıya gider. Bugün etkisiz (tüm satırlarda token `null`, tok=0). **Google OAuth yazıcısı gelmeden önce** `select: { id, provider, isConnected, lastSyncAt }` şart; yoksa (şifreli de olsa) token zarfı XSS ile sızdırılabilir hale gelir. ROADMAP #12 ön koşullarına eklenmeli.
- **Ö-3 — Eski bir `outlook` satırı UI'dan koparılamaz.** Senkron onu güvenle atlıyor (probe), KVKK silmesi siliyor (M4/M5), ama `client.tsx`'in `PROVIDERS` haritasında `outlook` yok → kullanıcı göremez/koparamaz, her brief'te dedupe'lu bir warn alarmı üretir. Yerelde 0 satır. **Düzeltme:** prod'da `select provider, count(*) from "CalendarConnection" group by 1` ile doğrula; >0 ise tek seferlik silme migration'ı.

### K- (küçük)
- **K-1 — Şifreleme hakkında yanıltıcı yorumlar:** `prisma/schema.prisma:1326-1331` hâlâ `'google' | 'outlook' | 'ics'` ve "Outlook: mailbox address", ayrıca "Plaintext" diyor; `users-scheduled-deletion.ts:133-134` (Outlook kartının yeni düzenlediği satır) "clear text" diyor. Oysa `sync.ts` yazarken AES-256-GCM ile şifreliyor. Yorumlar güncellenmeli (bir sonraki geliştirici "düz metin" varsayıp ikinci kez şifreleyebilir ya da şifrelemeyi atlayabilir).
- **K-2 — Anonim `/en/<ws>/settings/calendar` sunucu loguna `TenantScopeError` düşürüyor** (diğer ayar sayfaları — members/privacy/panel — düşürmüyor; hepsi 307 → login). Sayfa `requireTenantAction({ readOnly: true })` kullanıyor, diğerleri `requireTenantPage`. Fail-closed, veri sızıntısı yok; log gürültüsü. Önceden var (kartlar `page.tsx`'e dokunmadı).
- **K-3 — Test ortamı:** yerel DB'de `demo-tenant` fixture'ı eksik → `double-charge-prevention` düşüyor; tam koşuda 9 canlı-DB testi yük altında zaman aşımına uğruyor. Kartlarla ilgisiz; ayrı bir devop kartı konusu.

## 4. Değişen dosyalar
Yalnız bu rapor: `docs/agent-results/TASK-MUMO35KZYLJ5R-se-fb.md`. Kod değişikliği yok.

## 5. Riskler
- Ö-2 bugün uykuda; Google OAuth açıldığı gün gerçek sızıntıya dönüşür.
- Prod DB'deki eski `settings.sso` / `outlook` satır sayısı görülmedi (yalnız yerel DB sorgulandı).

## 6. Açık sorular
- Prod'da `Tenant.settings ? 'sso'` ve `CalendarConnection.provider='outlook'` sayıları kaç? (Ö-3; `settings.sso` okunmadığı için güvenlik açısından etkisiz, temizlik tercihi.)
- Görev metnindeki ek talimat sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUML0QZAZ5M80-be-fb.md` yoluna yazmamı söylüyordu. O yol repo dışı ve başka bir ajanın (be-fb) rapor adı; üzerine yazarsam onun raporu ezilirdi. Sonucu görevin "SONUÇ DOSYASI" satırındaki repo-içi yola, kendi kimliğimle yazdım.

## 7. Sonraki adım
- Ö-1: patron/devop — `.env` Entra satırlarını sil + secret'ı iptal et.
- Ö-2: Google OAuth kartına ön koşul olarak ekle (`select` daraltma + test).
- K-1: fe-fb/be-fb — yorum düzeltmesi (tek commit).

## Platform beyanı
Doğrulama **macOS** (Darwin 27.0.0, Node 26.5.0, Next 16.3.4) üzerinde yapıldı. İncelenen kod yolları (server action yetki kontrolü, Zod sağlayıcı şeması, Prisma sorguları, takvim token şifrelemesi) platformdan bağımsız: süreç, dosya yolu, kabuk ya da ikili adına bağlı kısım yok. Bu yüzden Windows ve Linux'ta davranış aynı olur. Bu platformlarda ayrıca koşu yapılmadı, çünkü elimde Windows/Linux makine yok ve kodda platforma bağlı bir dal da yok.
