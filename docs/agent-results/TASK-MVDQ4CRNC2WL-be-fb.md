---
sözleşme: 3
görev: TASK-MVDQ4CRNC2WL
kod: FO-81
ajan: be-fb
motor: claude-haiku-5-5
tip: feature
okur: lider
hüküm: Tamam. M1 kapalıyken kilit ekranının altında aktif API anahtarları listeleniyor; tek tek ve toplu iptal çalışıyor; iptal AuditEvent yazıyor; iptal edilen anahtar /api/v1 tarafından reddediliyor. Üretme ve gizli değer kapalı kaldı.
platform: web + sunucu, işletim sisteminden bağımsız. Ölçüm macOS (darwin 27.0), yerel Postgres (5433) ve pnpm dev / Playwright (Chromium) ile yapıldı. Windows ve Linux'ta koşulmadı; kodda platforma bağlı yol, süreç veya kabuk çağrısı yok.
sürüm: be-fb/fo81-api-key-revoke-locked (origin/dev 16c457c6 üstünde)
tarih: 2026-10-18
---

# TASK-MVDQ4CRNC2WL (FO-81) — M1 kapalıyken API anahtarı iptali

**Hüküm:** Tamam. Kilit ekranı korunuyor; altına yalnız iptal yolu açıldı. Üretme, gizli değer ve diğer işlemler kilitli.

**Dal:** `be-fb/fo81-api-key-revoke-locked`, worktree `/Users/macbook/alan/FONBRIDGE-fo81`. Ana ağaçta bu rapor kopyası da var; ana ağaç başka işlerin değişiklikleriyle kirli olduğu için oraya commit yapılmadı.

## Ne yapıldı

1. **Kilit altında iptal paneli.** `settings/api-keys/page.tsx`: M1 kapalıyken `moduleGate` çıktısı aynen kalıyor (genel davranış değişmedi); altına `revoke-panel.tsx` ekleniyor. Panel yalnız gerçek satırları gösterir (ad, önek `fp_live_…...`, oluşturulma, son kullanım). Gizli değer hiçbir zaman seçilmiyor (`keyHash` select'te yok).
2. **Demo satırları yok.** Açık sayfadaki demo fallback yalnız açık modda kalıyor; kilitli modda sahte anahtar gösterilmiyor. Sorgu `loadApiKeys` içinde tek yerde (kiracı `withTenant` ile).
3. **Tek iptal yolu.** Tek iptal ve toplu iptal panelde, her anahtar için mevcut `revokeApiKey` çağrılıyor (sıralı). Kopya sorgu yok. Yetkisiz rolde (`manage_users` yok) liste görünür, düğmeler gizlenir; sunucu zaten reddeder.
4. **AuditEvent eklendi.** Kart "her iptal AuditEvent yazar (mevcut davranışla aynı)" diyordu, ama `revokeApiKey` o zaman AuditEvent yazmıyordu. Ekledim: yalnız gerçekten silinen anahtar için, aynı transaction içinde, `type: 'apiKey.revoked'`, `actorId` oturumdaki kullanıcı, `target` anahtar id. Bu bir davranış eklemesi; kart niyetine uyuldu.
5. **Onay diyaloğu.** Inline `role="alertdialog"`, `aria-labelledby`/`aria-describedby`, açılınca odak "Vazgeç"te, Escape kapatır. Native `confirm()` değil.
6. **i18n.** `ApiKeysSettings` ad alanı tr + en (`messages/tr.json`, `messages/en.json`). `client.tsx`'teki "Yeni API Anahtarı Oluştur" başlığı `t('createTitle')` oldu; e2e bu metni messages'tan okuyor. `i18n-baseline.json`'da yalnız `client.tsx` 18→17 (kendi satırım).
7. **Doküman.** `docs/MODULES.md` M1 notuna "M1 kapalıyken anahtar iptali açık (FO-81)" cümlesi eklendi.

## Kanıt (ham çıktı özeti)

**Tip:** `pnpm typecheck` → `tsc --noEmit`, çıkış 0.

**Lint:** `pnpm lint` → 0 hata, 4 uyarı; uyarılar `src/lib/invitations/accept.ts`, `tests/e2e/fixtures/concept-template-tenant.ts`, `tests/settings-profile-update.test.ts` dosyalarında, bu işin dosyalarında değil.

**i18n:** `pnpm i18n:check` → "i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text."

**Birim (ilgili dosyalar):** `tests/modules/api-keys.test.ts` 30/30 (AuditEvent testleri dahil); `tests/server-action-missing-id.test.ts` 15/15 (mock düzeltmesinden sonra). Toplam: 2 dosya, 45/45.

**Birim (tam koşu, `pnpm test`):** 317 dosya geçti, 17 dosya başarısız, 642 atlandı (canlı DB testleri yerelde atlanıyor). Başarısız 17 dosyanın 16'sı aynı şekilde origin/dev'de de başarısız (değişiklikleri geçici saklayıp aynı dosya listesini koşturarak doğrulandı: "SAME_FAILING_FILES"); bunlar Prisma/DB ortam kaynaklı (`plan-admin`, `plan-repository`, `settings-profile-update`, `*.live`, billing, blog-markdown). 17. dosya `server-action-missing-id`, benim değişikliğim yüzünden kırılmıştı (test transaction mock'unda `auditEvent` yoktu); mock eklendi, artık geçiyor.

**E2E (Playwright, Chromium):** `tests/e2e/api-keys-revoke-locked.spec.ts` (yeni) + `tests/e2e/feature-module-gate.spec.ts` (mevcut, M1 kapısını kullanıyor) → **5 passed**, 0 failed, 0 skipped.

Yeni spec'in üç testi:
- Owner: M1 açıkken anahtar oluşturuluyor (form, gerçek UI) → M1 kapanınca kilit + panelde anahtar, demo satır yok, "API Key Oluştur" düğmesi yok → "Vazgeç" anahtarı tutuyor → "İptal et" sonrası anahtar DB'den silinmiş, AuditEvent (`apiKey.revoked`, actor = owner) var → M1 tekrar açılınca aynı anahtarla `/api/v1/partners` **401** döndü (Playwright'ın request istemcisiyle; curl ile değil).
- Owner, EN: iki anahtar, "Revoke all keys" → onay → ikisi de silindi, iki AuditEvent yazıldı; panel kalkınca sayfa kilit ekranına dönüyor.
- MEMBER: anahtarlar görünür, hiçbir iptal düğmesi yok, "yetkisiz" mesajı var.

Ekran görüntüleri (`docs/agent-results/TASK-MVDQ4CRNC2WL-ekler/`):
- `m1-off-revoke-tr.png` — TR kilit + iptal paneli
- `m1-off-confirm-tr.png` — TR onay diyaloğu
- `m1-off-revoke-en.png` — EN kilit + iptal paneli
- `m1-off-member-tr.png` — üye görünümü (düğme yok)

## Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/settings/api-keys/page.tsx` — `loadApiKeys`, kilitli dal
- `src/app/[locale]/(app)/[workspace]/settings/api-keys/actions.ts` — `revokeApiKey` + AuditEvent
- `src/app/[locale]/(app)/[workspace]/settings/api-keys/client.tsx` — başlık `t()`
- `src/app/[locale]/(app)/[workspace]/settings/api-keys/revoke-panel.tsx` — yeni, istemci paneli
- `messages/tr.json`, `messages/en.json` — `ApiKeysSettings`
- `i18n-baseline.json` — tek satır
- `docs/MODULES.md` — M1 notu
- `tests/modules/api-keys.test.ts` — AuditEvent testleri (3)
- `tests/server-action-missing-id.test.ts` — mock'a `auditEvent`
- `tests/e2e/api-keys-revoke-locked.spec.ts` — yeni, 3 test
- `docs/agent-results/TASK-MVDQ4CRNC2WL-be-fb.md`, `docs/agent-results/TASK-MVDQ4CRNC2WL-ekler/*.png`

## Ortam notları (tekrar üretmek için)

- Yerel e2e'de `/tr` 500 dönüyordu: blog kapak görselleri `http://localhost:9000/fabrika-public/...` adresinden geliyor ve `R2_PUBLIC_HOST` ana `.env`'de boş. Koşu için `R2_PUBLIC_HOST=http://localhost:9000/fabrika-public` süreç ortamında verildi; dosyaya yazılmadı. Bu ayar ana `.env.example`'da açık değil; ayrı bir not olarak lidere iletiliyor.
- `.env` dosyaları kopyalanmadı; her komutta ana repodan `set -a; . …; set +a` ile yüklendi.
- Sunucu log'unda test sonlarında "destination stream closed early / aborted" uyarıları çıktı (istemci bağlantısı kopunca). Testleri etkilemedi.
- 3000 portundaki patron sunucusuna dokunulmadı; e2e 3100'de koştu, sunucu koşu bitince kapandı.

## Riskler

- **Toplu iptal sıralı N çağrı**: her biri `requireTenantAction` + `revalidatePath`. Anahtar sayısı çok büyürse yavaşlar. Şu an bir tenant'ta birkaç anahtar bekleniyor; tek sorgulu toplu action istenirse ayrı iş.
- **Kısmi başarısızlık**: sıralı koşuda hata olursa durur; başarılı olanlar listeden kalkar, hata metni gösterilir. Atomik değil (her iptal kendi transaction'ı).
- **Onay diyaloğu inline**: native modal değil; odak tuzağı (focus trap) yok, Escape ile kapanır. Erişilebilirlik gözden geçirmesi istenirse ayrı iş.
- **Kiracı izolasyonu**: iptal sorgusu `id + tenantId` ile zaten sınırlı (mevcut birim testi). Listeleme `withTenant` ile; ayrıca çapraz-kiracı e2e yazılmadı. Kart "başka kiracının anahtarı görünmez" istiyordu; bu, mevcut `withTenant` ve RLS'ye dayanıyor, ama test edilmiş değil. **Açık boşluk.**
- **Client.tsx** geri kalan sabit Türkçe metinlerle (17 literal) aynı; yalnız istenen başlık taşındı.

## Açık sorular

1. "Her iptal AuditEvent yazar (mevcut davranışla aynı)" ifadesi kodda doğru değildi; AuditEvent eklendi. Bu davranış eklemesi kabul edilsin mi?
2. Toplu iptal sıralı çağrı mı kalsın, yoksa tek action + tek transaction mı istenir?
3. Çapraz-kiracı listeleme testi için yazılsın mı (ayrı kart)?

## Sonraki adım

PR `dev`'e açılacak (`be-fb/fo81-api-key-revoke-locked`), kart `review`'a alınacak. Pre-push gate'i için `.env` aynı kabukta yüklenecek.
