# TASK-MVCH26OXNVLKR (FO-59) — PR #143 kod incelemesi

**Hüküm: DÜZELTME GEREKLİ.** Bloke eden bulgu: B1 (aşağıda). Merge edilmedi.

- **PR:** https://github.com/yaslan/fonbridge/pull/143 — `feat(billing): internal plan assignment in admin tenants (FO-59)`
- **Dal:** `fe-fb/fo59-internal-plan-dev` → taban `dev` (PR açıklamasındaki taban `dev`, `main` değil)
- **Head:** `1c0c392c` (incelenen commit)
- **Tip:** review
- **Platform:** mac (Darwin 27). Web/DB kodu, platforma bağlı yol yok; Windows ve Linux'ta koşulmadı (bu makinede yok). Platformdan bağımsız kanıt: aşağıdaki testler mac'te koştu.
- **İnceleyen:** CRW-FB

## Ne yapıldı (incelemenin kapsamı)

Diff `origin/dev...review-pr-143` üzerinden okundu. Odak: `internal-plan.ts`, `subscription-owner.ts`, `subscription-sync.ts`, admin action ve sayfaları, Zod, audit, `withTenant`/RLS, baseline gerekçesi, i18n. Bu incelemede ayrıca `api/webhooks/stripe/route.ts` ve `api/billing/checkout/route.ts` okundu; PR bu iki dosyaya dokunmuyor, ama bulgu B1 ikisine bağlı.

## Bulgular (önem sırasıyla)

### B1 — BLOKE: Stripe'tan gelen ödeme, iç plan aktifken sessizce düşüyor; kodun "sonra replay edilir" iddiası yanlış

- **Dosyalar:**
  - `src/lib/billing/subscription-sync.ts:391-405` — iç plan satırı varsa `stripeSyncBlocker` `INTERNAL_PLAN_PROTECTED` döndürüp `status: 'skipped'` veriyor.
  - `src/lib/billing/subscription-sync.ts:508-509, 681-688` — transaction içindeki ikinci kontrol de aynı şekilde `skipped` döndürüyor.
  - `src/app/api/webhooks/stripe/route.ts:51-54, 74-77` — `skipped` sonucu normal dönüş; `NextResponse.json({ received: true })` (200). Hata yolu (500) yalnızca exception'da devreye giriyor.
  - `src/app/api/billing/checkout/route.ts:119-124` — checkout kapısı yalnızca pilot için kapalı (`PILOT_CHECKOUT_CLOSED`). İç plan tenant'ı checkout'a girebiliyor.
  - `src/lib/billing/internal-plan.test.ts:144` — "Not claimed, so either event can be replayed once the internal plan is taken back." Test yalnızca `stripeEventLog` sayısını 0 olarak doğruluyor; replay mekanizmasının var olduğunu hiçbir yerde doğrulamıyor.
- **Başarısızlık senaryosu:**
  1. Admin bir tenant'a `Pro`'yu iç plan olarak atar (`provider: 'internal'`, `status: ACTIVE`).
  2. Tenant bu sırada pricing'den Stripe checkout'u açar ve öder.
  3. `checkout.session.completed` / `customer.subscription.updated` gelir → `syncStripeSubscription` `INTERNAL_PLAN_PROTECTED` ile `skipped` döner, `logger.error` yazılır, event claim edilmez, webhook 200 döner.
  4. Stripe event'i yeniden denemez. Subscription satırı Stripe'ta yok, `Subscription` tablosunda da yok. Tenant ödediği planı hiç almaz.
  5. Admin iç planı Discover'a geri alırsa tenant hiçbir plana erişemez; ödeme kaydı hiçbir yerde yok. Otomatik replay yolu yok (replay ancak Stripe Dashboard'dan elle yapılabilir).
- **Not:** Aynı kalıp pilot için zaten var (`PILOT_PROTECTED`). Pilotta checkout kapalı olduğu için yol yalnızca "sahte metadata/istisna" durumunda açılıyor. PR bu yolu iç plan için **normal** kullanım yoluna çeviriyor; bu yüzden değişiklik yeni bir risk üretiyor.
- **Önerilen düzeltme (birini ya da ikisini):**
  - (a) Checkout kapısına iç plan için de kapı koy (pilot kapısıyla aynı desen: `checkout/route.ts:119` yanına `isInternalPlanSubscription` kontrolü, bir hata kodu döndüren yanıt). Böylece aktif iç plan varken ödeme alınmaz.
  - (b) `skipped` ile korunan event'ler için bir `SystemAlert`/operatör kaydı üret ve event'i ayrı bir kuyruğa al; "replay edilebilir" iddiası ancak bu varsa yorumda ve testte kalsın.
  - Düzeltilene kadar `subscription-sync.ts` yorumundaki "the event is not claimed, so it can be replayed" ifadesi, gerçekte bir replay yolu yokken yanlış bir güvence veriyor; ya düzeltilmeli ya da kaldırılmalı.
- **Doğrulama:** Yukarıdaki satırlar PR head `1c0c392c` üzerinde okundu; checkout route'unda iç plan kontrolü olmadığı `grep` ile doğrulandı (yalnız `getPilotState`).

### B2 — Orta: Badge sorgusunun hatası tüm tenant listesini boşaltıyor

- **Dosya:** `src/app/[locale]/admin/tenants/page.tsx:37-48, 52-56`
- `Promise.all([tenants..., listInternalPlans()])` tek `try` içinde. `listInternalPlans` (yalnızca rozet için) hata verirse `tenants` boş kalır ve sayfa `loadError` gösterir: admin hiç tenant göremez, yalnızca rozet verisi bozulmuştur.
- **Düzeltme:** `listInternalPlans()` için ayrı `try/catch`; hata durumunda boş `Map` ve `console.error`. Tenant listesi kendi `try` bloğunda kalsın.

### B3 — Düşük: Geçmişte "kim" olarak kullanıcı ID'si görünüyor

- **Dosya:** `src/app/[locale]/admin/tenants/[tenantId]/page.tsx:134`
- `t('internalPlan.by', { actor: h.actorId ?? '-' })` ham kullanıcı kimliğini gösteriyor. Admin, kimin atama yaptığını bu ekrandan anlayamıyor.
- **Öneri:** Kullanıcı adı/e-posta çözümlemesi (aynı tenant sayfasındaki platform-admin oturumu ile) ya da en azından kısaltılmış okunur bir etiket. Yalnızca UX; güvenlik etkisi yok.

### Öneri (bloklamaz)

- `scripts/tenant-bypass-baseline.json` girdisinin gerekçesi (`listInternalPlans`, check D) makul ve `isPlatformAdminSession` korumasına atıf yapıyor. Kabul.
- `i18n-baseline.json` içinden `admin/tenants/page.tsx: 4` satırının çıkarılması doğru: sayfada artık kullanıcıya görünen sabit metin yok (`t(...)`). Sayfadaki `console.error` metni log, UI değil.

## Doğru bulunanlar

- **Yetki:** Action `requirePlatformAdmin()` ile korunuyor (`actions.ts`), sayfa `isPlatformAdminSession` ile `notFound()` yapıyor. Atama ve geri alma yalnızca admin'den geliyor.
- **Zod:** `planId` `z.enum(INTERNAL_PLAN_CHOICES)` ile sınırlı; `note` trim + `min(1)` + `max(500)`. Servis katmanı da boş notu reddediyor (`InternalPlanNoteRequiredError`), yani iki katman tutarlı.
- **Plan kaynağı:** Yeni plan listesi yok; `grantsFor` ve `FALLBACK_PLAN_ID` kullanılıyor. Şema değişikliği yok (`provider: 'internal'` mevcut kolonda).
- **Yarış:** `lockPilotRow` atama ve Stripe senkronunda aynı kilidi alıyor; Stripe tarafında blokaj hem dış ön-okumada hem kilit içinde tekrar kontrol ediliyor.
- **Audit:** `AuditEvent` atama/geri alma ile aynı transaction'da, eski→yeni plan ve not ile yazılıyor. Tekrar eden seçim yazı üretmiyor (`unchanged`).
- **Canlı Stripe aboneliği:** Ödeme yapan (ACTIVE/TRIALING/PAST_DUE + providerSubId) tenant'a atama `LiveProviderSubscriptionError` ile reddediliyor.
- **Hata kodları:** Action yalnızca listelenmiş kodu döndürüyor; ham hata metni istemciye gitmiyor. Kodların tr/en çevirisi testte doğrulanıyor.
- **i18n:** `messages/tr.json` ve `messages/en.json` `adminTenants` anahtarları birebir eşleşiyor (kontrol edildi, fark yok).

## Testler (incelemede koşuldu)

Worktree: `scratchpad/pr143` (PR head `1c0c392c`). Kaynak env: `.env.test` (DB `127.0.0.1:5433`, Docker Postgres). `DATABASE_URL_RLS_TEST` yalnızca ana `.env` içinde var; FA-49 testi için oradan alındı.

| Dosya | Sonuç |
|---|---|
| `src/lib/billing/internal-plan.test.ts` | dahil (canlı DB) — geçti |
| `src/app/[locale]/admin/tenants/actions.test.ts` | geçti |
| `src/lib/billing/subscription-sync.test.ts` | geçti |
| `src/lib/billing/subscription-sync-tenant-scope.test.ts` | geçti |
| `src/lib/billing/pilot.test.ts` | geçti |
| `src/lib/billing/entitlement-source.test.ts` | geçti |
| `tests/stripe-webhook-tenant-scope.live.test.ts` | geçti |
| `tests/stripe-webhook-idempotency.live.test.ts` | geçti |
| `tests/fa49-admin-billing-scope.live.test.ts` | **3/3 geçti** (`DATABASE_URL_RLS_TEST` set edildiğinde; set değilken 3 skip) |

Gözlenen koşular:
- 9 dosya tek koşu (`DATABASE_URL_RLS_TEST` set değil): **Test Files 8 passed | 1 skipped; Tests 70 passed | 3 skipped** — skip olan tek dosya `fa49`.
- `tests/fa49-admin-billing-scope.live.test.ts` ayrı koşu (`DATABASE_URL_RLS_TEST` set): **3 passed (3)**.
- İlk koşu (ortam değişkeni yüklenmeden) canlı DB'ye 5432'den bağlanmaya çalıştığı için `internal-plan.test.ts` 4 test kırmızı çıktı (`ECONNREFUSED`); bu bir kod hatası değil, ortam hatasıydı. `.env.test` yüklenince aynı dosyalar geçti.

**Koşulmadı:**
- `tests/e2e/admin-internal-plan.spec.ts` (Playwright) — incelemede koşulmadı. Kart "gerçek tarayıcı" istiyor; bu inceleme kapsamında yapılmadı.
- `pnpm lint && pnpm typecheck` — koşulmadı.
- FE-FB raporundaki tam gate (vitest 4880 passed, e2e 384 passed) bu incelemede yeniden üretilmedi; bulgu B1 bu gate'lerin hiçbirinde yakalanmıyor (test yalnızca "event claim edilmedi" diyor, replay'i doğrulamıyor).

## Riskler

- B1 canlı ödeme akışında gerçek bir müşteriyi etkileyebilir; kapı düzeltilmeden iç plan atama özelliği üretime alınmamalı.
- FE raporunun kanıtı ile bu incelemenin kanıtı farklı kapsamda; hükmü belirleyen B1, FE raporunda ele alınmıyor.

## Açık sorular

1. Checkout'un iç plan tenant'larına kapatılması (B1-a) mı, yoksa ödemeyi kabul edip operatör kuyruğuna almak (B1-b) mı tercih ediliyor? Ürün kararı.
2. Kart "FO-115 ile ilişki" diyor; FO-115 kapsamı repoda/belgede bulunamadı, Stripe senkron önceliği bu yüzden FO-115 ile karşılaştırılamadı.

## Sonraki adım

1. B1 düzeltilsin (checkout kapısı veya operatör kuyruğu + yorum/test düzeltmesi). Testte gerçek bir replay ya da kapı kontrolü eklensin.
2. B2 ayrı `try/catch` ile düzeltilsin.
3. Düzeltme sonrası tekrar inceleme; e2e `admin-internal-plan.spec.ts` ve `pnpm lint && pnpm typecheck` ayrıca koşulsun.

## Değişen dosyalar

- `docs/agent-results/TASK-MVCH26OXNVLKR-crw-fb.md` (bu rapor). Kod değişikliği yok; PR'a yorum/merge yapılmadı. Commit atılmadı.
