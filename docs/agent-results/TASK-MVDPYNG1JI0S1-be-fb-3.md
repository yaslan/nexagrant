# TASK-MVDPYNG1JI0S1 (FO-80) — crw-fb incelemesi düzeltmeleri (ikinci tur)

**Dal:** `be-fb/fo80-api-module-gate` · **Worktree:** `FONBRIDGE-fo80` · **İnceleme:** `docs/agent-results/TASK-MVDPYNG1JI0S1-crw-fb.md`
**Dosya adı notu:** Patron `-be-fb-2.md` istedi; bu ad aynı kartın daha önceki push-kapısı durum notuyla (commit'li) dolu olduğu için üzerine yazılmadı. Sonuç `-be-fb-3.md` dosyasında; `-be-fb-2.md` olduğu gibi duruyor.

**Platform beyanı:** Sunucu tarafı, işletim sisteminden bağımsız. Doğrulama macOS (darwin 27.0) üzerinde yapıldı: yerel Postgres (`.env` DATABASE_URL), `next dev` ve Playwright. Windows / Linux koşulmadı; kodda platforma bağlı yol yok.

## Patron kararı (Bulgu 2)

PILOT'taki M1 tenant'larının API anahtarları **çalışmaya devam eder**. OFF, ModuleState yok, plan dışı ve DEV → 403 kalır.

## Ne yapıldı

1. **Makine kitlesi (tek karar kaynağı).** `ModuleViewer`'a `isMachine?: boolean` eklendi (`src/lib/modules/state-machine.ts`). `canAccessStatus`'taki PILOT dalına tek koşul eklendi: `viewer.isPlatformAdmin || viewer.isMachine === true || PILOT_ROLES.includes(viewer.role)`. PILOT kuralı kopyalanmadı; `decideModuleAccess` (`tenant-access.ts`) viewer'ı olduğu gibi `canAccessStatus`'a veriyor. Önceki denemede `isMachine` burada düşüyordu; testler yakaladı, düzeltildi.
2. **API anahtarı kitlesi.** `API_KEY_VIEWER = { role: 'API_KEY', isPlatformAdmin: false, isMachine: true }` (`src/lib/api-auth.ts`). DEV hâlâ yalnız `isPlatformAdmin` ile açılıyor → anahtar DEV'de 403.
3. **Testler.**
   - `tests/api/v1-module-gate.test.ts`: "PILOT is for pilot managers, and a key is not one: 403" → "PILOT stays open to the tenant key as a machine audience: 200" (karar değişikliği, gevşetme değil).
   - `tests/modules/state-machine.test.ts`: makine kitlesi PILOT'ta açık, DEV'de kapalı.
   - `tests/api-module-gate.live.test.ts` (gerçek DB): PILOT → 200, DEV → 403.
4. **Bulgu 1 (yorum + test).** `api-auth.ts`'teki "closed by default" yorumu gerçeğe uyduruldu: kapı çağrıya bağlı; route çağırmazsa çalışma zamanında reddedilmez, test taraması bunu yakalar. Route taraması güçlendirildi (`tests/api/v1-module-gate.test.ts`): yorumlar silinir, `authenticateApiKey(req)` çağrısı mevcut olmalı ve ilk `withTenant` / `withSystemScope` / `prisma` veri erişiminden önce gelmeli.
5. **Dokümanlar.** `docs/MODULES.md` M1 notu PILOT kararına göre güncellendi; `docs/adr/ADR-0001-module-state-access-gate.md` PILOT kitle tablosuna makine kitlesi eklendi.
6. **Bulgu 3–4.** Yalnız raporda not (kod değişikliği yok).

## Kanıt (ham çıktı)

### Birim ve canlı testler

```
pnpm exec vitest run tests/api/ tests/modules/
 Test Files  37 passed (37)
      Tests  518 passed (518)

pnpm exec vitest run tests/api-module-gate.live.test.ts tests/api-key-rate-limit.live.test.ts
 Test Files  2 passed (2)
      Tests  8 passed (8)
```

### Gerçek curl (dev sunucusu :3310, worktree, yerel DB; geçici tenant silindi)

```
== M1 ON
HTTP/1.1 200 OK
== M1 OFF
HTTP/1.1 403 Forbidden
{"error":"MODULE_ACCESS_DENIED","module":"M1"}
== M1 ON (aynı anahtar yeniden açıldı)
HTTP/1.1 200 OK
== M1 PILOT (anahtar)
HTTP/1.1 200 OK
== M1 DEV (anahtar)
HTTP/1.1 403 Forbidden
{"error":"MODULE_ACCESS_DENIED","module":"M1"}
== M1 ON + geçersiz anahtar fp_live_nope
HTTP/1.1 401 Unauthorized
{"error":"Unauthorized","message":"Invalid or revoked API key.","code":"AUTH_INVALID_API_KEY"}
== M1 ON + anahtar yok
HTTP/1.1 401 Unauthorized
{"error":"Unauthorized","message":"Missing API key. Provide `x-api-key` or `Authorization: Bearer <key>` header.","code":"AUTH_MISSING_API_KEY"}
```

Not: 401 satırları M1 ON iken alındı (fixture durumu ON). Geçici tenant, anahtar, subscription ve ModuleState satırları silindi (`tenant rows deleted: 1`).

### Mutasyon kontrolleri

- PILOT makine dalı kaldırıldı (`viewer.isMachine === true ||` silindi): `v1-module-gate.test.ts`, `state-machine.test.ts` ve `api-module-gate.live.test.ts` → **3 test kırıldı**. Satır geri alındı.
- Route sırası bozuldu (`calls/route.ts` içinde auth'tan önce `void prisma.topic;`): `calls/route.ts authenticates before it reads data` → **kırıldı** (15 içinden 1). Dosya geri alındı.

### Tam gate (`pnpm gate`, `--no-verify` yok)

```
✖ 4 problems (0 errors, 4 warnings)           lint: 0 hata (4 uyarı, bu işe ait değil)
$ tsc --noEmit                                 typecheck: temiz
Test Files  356 passed | 7 skipped (363)      birim
Tests  4638 passed | 120 skipped (4758)
i18n:check, rls:check, rls:bypass-check       geçti
rls:verify --require-db                        47 kiracıya özel tablo, izolasyon fabrika_app ile ölçüldü, geçti
db:rls-role                                    fabrika_app mevcut, geçti
```

İlk `pnpm gate` e2e aşamasında düştü: `http://localhost:3000 is already used` (patron'un sunucusu). Patron'un sunucusuna dokunulmadı; e2e `E2E_PORT=3320` ile yeniden koşuldu:

```
E2E_EXIT=0
  351 passed (9.7m)
  9 skipped
ALERTS_EXIT=0      (pnpm alerts:check)
```

Gözlem (incelenmedi): e2e sırasında WebServer, `src/instrumentation.ts:18` için Edge runtime uyarısı yazdı (`process.exit`). Testler geçti; bu değişiklikle ilgisi doğrulanmadı.

## Değişen dosyalar

- `src/lib/modules/state-machine.ts` — `ModuleViewer.isMachine`, PILOT dalı
- `src/lib/modules/tenant-access.ts` — viewer'ı olduğu gibi `canAccessStatus`'a verme
- `src/lib/api-auth.ts` — `API_KEY_VIEWER.isMachine`, yorum düzeltmesi
- `tests/api/v1-module-gate.test.ts` — PILOT → 200, route sırası taraması
- `tests/modules/state-machine.test.ts` — makine kitlesi PILOT/DEV
- `tests/api-module-gate.live.test.ts` — canlı PILOT → 200, DEV → 403
- `docs/MODULES.md` — M1 notu
- `docs/adr/ADR-0001-module-state-access-gate.md` — PILOT kitle tablosu
- `docs/agent-results/TASK-MVDPYNG1JI0S1-be-fb-3.md` — bu rapor

## Riskler

- **Deploy etkisi:** PILOT anahtarları açık kalır (önceki turdaki kırılma riski yok). DEV, OFF ve plan-dışı anahtarlar 403 alır; bu, kapının kendisinin davranışı.
- **Makine bayrağı:** `isMachine` yalnız API anahtarı yolunda set ediliyor. Oturum yolu bunu üretmiyor; ileride bir çağıranın bu bayrağı oturuma koyması riski tip yorumunda yazılı, kodla zorlanmıyor.
- **Yeni route riski (Bulgu 1):** `authenticateApiKey` çağırmayan yeni bir `/api/v1` route'u çalışma zamanında kapısız açılır; test taraması yalnız mevcut route'ları ve sırayı denetler.
- **Ölçüm:** macOS ve yerel DB. Kod platforma bağlı değil.

## Açık sorular

1. Bulgu 1 için kalıcı çözüm (tüm `/api/v1` route'larını saran bir sarmalayıcı ya da middleware eşleşmesi) ayrı iş olarak mı açılsın? Bu PR için zorunlu görmüyorum.

## Sonraki adım

1. Commit + push (`be-fb/fo80-api-module-gate`), PR #102 base `dev`.
2. crw-fb'ye yeniden inceleme isteği.
