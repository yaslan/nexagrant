---
sözleşme: 3
görev: TASK-MVDV63H2OCK0
kod: TASK-MVDV63H2OCK0
ajan: be-fb
motor: claude
tip: hata
okur: ekip
hüküm: Kısmen bitti: test ve tip değişikliği yazıldı, kırmızı→yeşil kanıtlandı, commit 09edf84f hazır. Push bekliyor çünkü pre-push kapısı ortak DB'deki bilinen rls:verify kaymasında (ExpertPreReg / tenant-discovery) düşüyor. Bu yüzden PR açılamadı.
platform: mac (darwin) üzerinde doğrulandı. Değişiklik yalnız TypeScript tipi ve vitest dosya taraması, işletim sisteminden bağımsız (sunucu). Windows ve Linux'ta koşulamadı (makine yok), ama kodda platforma bağlı yol yok: `node:path.join` ve `readdirSync` her platformda çalışır.
sürüm: 1
tarih: 2026-10-19T21:21:03.981Z
---

# FO-86 — /api/v1 auth sırası taraması + SessionViewer isMachine yasağı

## Ne yapıldı
- **Dal / worktree:** `be-fb/fo86-auth-order-session-viewer` @ `09edf84f`, tabanı `origin/dev` 80271979. Worktree: `/Users/macbook/alan/FONBRIDGE-fo86`.
- **Öneri 1** (`tests/api/v1-module-gate.test.ts`): `authOrderProblems(src)` her export edilen HTTP metodunu bulur. Metot `export async function` değilse "scan cannot read it" der. Gövdede ilk `await`'in `const x = await authenticateApiKey(req);` olmasını ve hemen sonraki ifadenin `if (!x.authenticated) … return` olmasını ister. Eski `withTenant|withSystemScope|prisma` sırası kontrolü korundu, çünkü await'siz başlatılan (floating) sorguyu o yakalıyor. Tarayıcının kendisi için 9 fixture testi eklendi:
  - doğru şekil
  - yardımcı okuma auth'tan önce
  - sonuç kontrol edilmiyor
  - kontrol bir ifade sonra geliyor
  - yanlış değişken kontrol ediliyor
  - floating prisma
  - sarmalayıcıyla export (`export const GET = …`)
  - hiç handler yok
  - ikinci handler (POST) yanlış sırada
- **Öneri 2:** `src/lib/modules/state-machine.ts` dosyasına `SessionViewer` eklendi. `src/lib/modules/access.ts` içinde `sessionViewerOf(scope): SessionViewer` yazıldı ve iki oturum yolu bunu kullanıyor. Tip testi: `tests/modules/session-viewer.test.ts`. İçinde iki `@ts-expect-error` var: `{ ...session, isMachine: true }` ve `isMachine: false`.

## Kanıt (ham çıktı)
**Kırmızı A** (leaders: `await coordinatorLeaders(...)` auth'tan önceye alındı):
```
-- old scan:   Tests  5 passed | 10 skipped (15)
-- new scan:   × partners/leaders/route.ts authenticates first and checks the result before anything else
+   "GET: something is awaited before authenticateApiKey",
```
**Kırmızı B** (leaders: `if (!authRes.authenticated) return` silindi):
```
-- old scan:   Tests  5 passed | 10 skipped (15)
-- new scan:   +   "GET: no `const x = await authenticateApiKey(req); if (!x.authenticated) return`",
```
**Tip kırmızısı** (`SessionViewer = ModuleViewer` yapıldı):
```
tests/modules/session-viewer.test.ts(15,1): error TS2578: Unused '@ts-expect-error' directive.
tests/modules/session-viewer.test.ts(18,1): error TS2578: Unused '@ts-expect-error' directive.
RED typecheck exit=2   →  geri alındı: restored typecheck exit=0
```
**Yeşil:**
- `tests/api/v1-module-gate.test.ts`: 24 passed.
- `tests/api/v1-module-gate.test.ts` + `tests/modules`: 246 passed, 5 skipped, 1 file failed. Düşen dosya `settings-modules-plan.test.ts`: worktree'de DB parolası yokken canlı DB testi, `SASL: client password must be a string`. Pre-push koşusunda `.env` yüklüyken geçti.
- `pnpm typecheck` exit 0. `pnpm lint`: 0 hata, 4 uyarı, hepsi dokunmadığım dosyalarda.

**Pre-push kapısı:**
- 1. deneme (load 34): `expert-prereg-form` (2) ve `rag-pdf-worker-isolation` (1) testleri zaman aşımıyla düştü (`Test timed out in 30000ms`, `expected 3008.7 to be less than 3000`). Bu dosyalara dokunmadım.
- 2. deneme: `Test Files 364 passed | 7 skipped (371) · Tests 4809 passed | 120 skipped`. i18n, rls:check ve bypass-check ✅. Ardından:
```
❌ KİRACI İZOLASYONU UYGULANMIYOR — bu bir ortam gürültüsü değil, güvenlik durumu.
   • tenant-discovery: daraldı, tüm satırları görmüyor: ExpertPreRegAttempt=0, ExpertPreRegistration=0
   • subject-scoped: daraldı, tüm satırları görmüyor: ExpertPreRegAttempt=0, ExpertPreRegistration=0
```
Bu hata 2026-10-19'dan beri bilinen, dev'de de kırmızı olan FO-52 `system_scope_open` ile `check-rls-live.ts` arasındaki uyumsuzluk. Benim değişikliğim DB'ye ve RLS'e dokunmuyor. Talimat gereği ortak DB'ye `db:rls` uygulamadım ve `--no-verify` kullanmadım.

## Değişen dosyalar
- `tests/api/v1-module-gate.test.ts`
- `tests/modules/session-viewer.test.ts` (yeni)
- `src/lib/modules/state-machine.ts` (yalnız tip)
- `src/lib/modules/access.ts` (yalnız viewer yapımı yardımcıya taşındı, davranış aynı)

## DoD
- [x] Test sıra + auth-sonuç kontrolünü yakalıyor (kırmızı fixture ve gerçek route kanıtı)
- [x] SessionViewer tipi isMachine'i derleme zamanında engelliyor (TS2578 kanıtı)
- [ ] Testler temiz ✓, **PR açık ✗: push bekliyor** (rls:verify ortam kayması)
- [x] Platform beyanı: sunucu, işletim sisteminden bağımsız. mac'te koşuldu.

## Riskler
- Tarama düz metin ve parantez sayımıyla çalışıyor, AST kullanmıyor. String içindeki `{`/`(` karakterleri teorik olarak yanıltabilir. Bugünkü 5 route temiz okunuyor. İleride `withApiKey(handler)` sarmalayıcısı gelirse tarama onu "scan cannot read it" diye reddeder. Bu bilinçli bir seçim: sarmalayıcı gelince kural da güncellenmeli.
- `src/lib/relationships/stale-reminder.ts:121` de üye viewer'ı kendi kuruyor. Kart kapsamı dışında kaldığı için SessionViewer'a geçirilmedi. Tek satırlık bir takip işi.

## Sonraki adım
- FO-105 ya da FO-52 kararıyla ortak DB'nin rls:verify'ı yeşile dönünce aynı worktree'den `git push -u origin be-fb/fo86-auth-order-session-viewer` yapılacak, ardından base `dev` olan PR açılacak.
