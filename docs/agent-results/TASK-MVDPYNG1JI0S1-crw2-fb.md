---
sözleşme: agent-result/v1
görev: TASK-MVDPYNG1JI0S1
kod: FO-80
ajan: crw2-fb
motor: claude-opus-5-5
tip: review
okur: leed-fb, be-fb, patron
hüküm: ONAY — bloke eden bulgu yok (2 bloke etmeyen öneri)
platform: mac (darwin 27.0); sunucu tarafı, işletim sisteminden bağımsız
sürüm: PR #102 · be-fb/fo80-api-module-gate @ 95899817
tarih: 2026-10-18
---

# TASK-MVDPYNG1JI0S1 (FO-80) — PR #102 yeniden inceleme (crw2-fb)

**Hüküm:** **ONAY, bloke eden bulgu yok.** Patronun Bulgu 2 kararı (PILOT'ta API anahtarları çalışsın) doğru uygulanmış. `isMachine` yalnız `api-auth.ts`'teki sabit viewer'da kuruluyor. Oturum yolunun bu alanı üretebileceği bir yol yok: her oturum çağrısı viewer'ı `{ role, isPlatformAdmin }` olarak tek tek alanlarla kuruyor, `TenantScope` tipinde de `isMachine` yok. DEV hâlâ yalnız `isPlatformAdmin`. Testler (unit + canlı DB) ve curl ON 200 / OFF 403 / PILOT 200 / DEV 403 / plan dışı 403 / geçersiz 401 doğrulandı. `isMachine` dalı kaldırılınca 3 test kırılıyor. Aşağıda 2 öneri var, ikisi de merge'i engellemiyor.

**Platform beyanı:** mac (darwin 27.0) üzerinde, yerel test Postgres'i (127.0.0.1:5433) ve `next dev -p 3320` ile ölçüldü. Değişen kodda platforma bağlı bir yol yok (süreç, dosya yolu, kabuk yok; yalnız DB okuması ve HTTP yanıtı var), bu yüzden Windows/Linux'ta davranış aynı olur. Windows ve Linux koşulmadı çünkü bu makinede yalnız macOS var.

**İncelenen:** head `95899817` (önceki inceleme `720d3169`'daydı). `git merge-tree --write-tree origin/dev 95899817` → çakışma yok. Kod değiştirilmedi. Detached worktree `/Users/macbook/alan/FONBRIDGE-crw2-fo80` kullanıldı. `.env*` dosyaları okunmadan `cp` ile kopyalandı. Patronun :3000 sunucusuna dokunulmadı (PID 34475, iş sonunda hâlâ dinliyor).

## Ne yapıldı

1. Kartı (get_task), crw-fb'nin ilk incelemesini ve be-fb-3 raporunu okudum. `origin/dev...95899817` ve `720d3169..95899817` diff'lerini satır satır inceledim.
2. **(1) Çekirdek değişiklik:** `canAccessStatus`'ı, `decideModuleAccess`'i ve `checkModuleAccessForTenant`'ı çağıran her yeri buldum. Her birine viewer'ın nereden geldiğine baktım.
3. **(2)** `isMachine` / `API_KEY_VIEWER` için tüm `src`, `scripts` ve `prisma`'yı taradım.
4. **(3)** Yorum düzeltmesini ve route-kapsam testinin gerçekte neyi ölçtüğünü mutasyonla sınadım.
5. **(4)** `docs/MODULES.md` ve ADR-0001 diff'ini okudum.
6. **(5)** 4 kod mutasyonu ve 2 route mutasyonu yaptım; her birinden sonra `git checkout` ile geri aldım.
7. İstenen testleri koştum, typecheck ve eslint çalıştırdım, gerçek curl denedim. Geçici tenant silindi, kendi dev sunucumu PID ile kapattım.

## Kontrol sonuçları

### (1) Çekirdek: insan oturumu için davranış aynı mı, `isMachine` oturumdan üretilebilir mi?
**Aynı. Üretilemiyor.** Bütün çağıranlar:

| Çağıran | Viewer nasıl kuruluyor | `isMachine` taşıyabilir mi |
|---|---|---|
| `src/lib/modules/access.ts:80` `checkModuleAccess` | `{ role: scope.role, isPlatformAdmin: scope.isPlatformAdmin }` literal | Hayır |
| `src/lib/modules/access.ts:116` `listAccessibleModules` | aynı literal | Hayır |
| `src/lib/relationships/stale-reminder.ts:121` | `{ role: membership.role, isPlatformAdmin: user.isPlatformAdmin }` | Hayır |
| `src/lib/api-auth.ts:179` | sabit `API_KEY_VIEWER` (`src/lib/api-auth.ts:33`) | Evet, tek kaynak burası |

- `tenantScopeOf` (`src/lib/tenant.ts:70-84`) oturumdan yalnız `tenantId, userId, role, workspaceIds, isPlatformAdmin` alanlarını alanlarla tek tek okuyor. Spread yok, `isMachine` alanı yok. JWT'ye bir `isMachine` claim'i girse bile hiçbir yere taşınmaz.
- Viewer'ı istemci girdisinden kuran bir yer yok. `useModuleEnabled` gibi istemci tarafı yollar `canAccessStatus` çağırmıyor (grep sonucu boş).
- Bir incelik: `decideModuleAccess` artık viewer nesnesini olduğu gibi `canAccessStatus`'a geçiriyor. Eski kod `{role, isPlatformAdmin}` alanlarını seçip yeni nesne kuruyordu. Bugün bunun bir etkisi yok, çünkü üç oturum çağıranı da literal kuruyor. İleride biri `scope` ya da `session` nesnesini doğrudan geçirirse risk doğar (Öneri 2).
- PILOT dalı `viewer.isMachine === true` olarak katı karşılaştırma yapıyor; `undefined` ya da truthy bir string kapıyı açmaz. DEV dalı değişmemiş: `return viewer.isPlatformAdmin ? …` (M2 mutasyonu bunu kanıtlıyor). OFF kimseye açık değil, ON herkese açık; ikisi de değişmedi.
- `role: 'API_KEY'` Prisma `enum Role` içinde yok (`prisma/schema.prisma:196-203`), yani hiçbir üyelik bu rolü taşıyamaz.

### (2) `API_KEY_VIEWER` yalnız `api-auth.ts`'te mi?
**Evet.** `grep -rn isMachine|API_KEY_VIEWER src scripts prisma` sonucu: tanım `state-machine.ts:127`, kullanım `state-machine.ts:178`, kurulum ve kullanım `api-auth.ts:33,179`. Başka bir yer yok.

### (3) Bulgu 1: yorum ve route-kapsam testi
- Yorum düzeltilmiş. "closed by default" iddiası kaldırılmış, yerine dürüst bir ifade gelmiş: "A new route that skips the call is not refused by anything at runtime." (`src/lib/api-auth.ts:19-25`).
- Test, `authenticateApiKey`'in `withTenant|withSystemScope|prisma` kullanımından önce geldiğini gerçekten ölçüyor. Yorumlar ayıklandıktan sonra sözcüksel konuma bakıyor. M5 mutasyonu (opportunities'te auth'tan önce `withTenant(...)`) testi kırdı.
- **Sınırı var (Öneri 1):** Kontrol sözcüksel. Veriyi bir yardımcı fonksiyonla okuyan route'ta sıralama denetimi boşa düşüyor. `partners/leaders/route.ts` veriyi `coordinatorLeaders(...)` ile okuyor. M6 mutasyonunda bu çağrıyı auth'tan önceye koydum ve test **geçti** (33/33). Ayrıca test, `authRes.authenticated` sonucunun gerçekten dikkate alındığını denetlemiyor. Beş route'un beşi de elle bakıldığında doğru (`if (!authRes.authenticated) return authRes.errorResponse;` hemen arkasında), ama bunu test değil göz doğruluyor.

### (4) Dokümanlar
`docs/MODULES.md` M1 "Bağlı özellik" bölümü güncel: 403 gövdesi, `isMachine`, PILOT 200, DEV 403, patron kararına atıf ve iptalin kapıdan bağımsız olduğu yazılı. ADR-0001 PILOT satırına "kiracının API anahtarları (makine kitlesi, `isMachine`)" eklenmiş. `state-machine.ts` docstring'i de güncel ("PILOT → … plus the tenant's API keys (machine)").

### (5) Mutasyon
Her mutasyonda 3 test dosyası koşuldu (v1-module-gate, state-machine, api-module-gate.live). Toplam 33 test.

| # | Mutasyon | Sonuç |
|---|---|---|
| M1 | PILOT'tan `viewer.isMachine === true \|\|` kaldırıldı | **3 kırıldı** (state-machine machine testi, unit PILOT 200, live PILOT/DEV) |
| M2 | DEV'e `\|\| viewer.isMachine === true` eklendi | **3 kırıldı** (state-machine, unit DEV 403, live PILOT/DEV) |
| M3 | `if (!access.allowed) return moduleDenied()` kaldırıldı | **7 kırıldı** (OFF, satır yok, plan dışı, DEV; unit + live) |
| M4 | `API_KEY_VIEWER`'dan `isMachine: true` kaldırıldı | **2 kırıldı** (unit PILOT 200, live PILOT) |
| M5 | opportunities: auth'tan önce `withTenant(...)` | **1 kırıldı** (route-kapsam testi) |
| M6 | leaders: auth'tan önce `coordinatorLeaders(...)` | **kırılmadı (33/33)**, Öneri 1 |

## Kanıt (ham çıktı)

```
$ git merge-tree --write-tree origin/dev 95899817 >/dev/null && echo MERGE_CLEAN
MERGE_CLEAN

$ npx vitest run tests/api/v1-module-gate.test.ts tests/modules tests/api-module-gate.live.test.ts \
    tests/api/v1-calls.test.ts tests/api/v1-opportunities.test.ts tests/api/v1-partners.test.ts \
    tests/api/api-key-rate-limit.test.ts tests/api-key-rate-limit.live.test.ts tests/deleted-tenant-sessionless.live.test.ts
 Test Files  31 passed (31)
      Tests  280 passed (280)          # skipped: 0 (DATABASE_URL host=127.0.0.1:5433, canlı testler gerçekten koştu)

$ npx vitest run tests/api-module-gate.live.test.ts tests/api/v1-module-gate.test.ts tests/modules/state-machine.test.ts --reporter=verbose
 ✓ … canAccessStatus > PILOT admits a machine audience (the tenant API key), DEV does not
 ✓ … PILOT stays open to the tenant key as a machine audience: 200
 ✓ … DEV is for FonBridge staff, and a key is not staff: 403
 ✓ … an unknown key is still 401 and never reaches the module read
 ✓ … a failed module read fails closed as 500, not open
 ✓ … calls|opportunities|partners/[pic]|partners/leaders|partners route.ts authenticates before it reads data
 ✓ tests/api-module-gate.live.test.ts > … M1 in pilot: … 200 then 403  21ms
      Tests  33 passed (33)

M1 mutasyonu:
 FAIL  tests/modules/state-machine.test.ts > … PILOT admits a machine audience (the tenant API key), DEV does not
 AssertionError: expected false to be true
      Tests  3 failed | 30 passed (33)
M6 mutasyonu (leaders, helper ile okuma auth'tan önce):
      Tests  33 passed (33)

$ pnpm typecheck   → tsc --noEmit, çıktı yok (temiz)
$ npx eslint src/lib/api-auth.ts src/lib/modules src/app/api/v1 tests/…  → exit 0
```

### Gerçek curl (`next dev -p 3320`, worktree, yerel test DB; geçici tenant + anahtar + pro abonelik, iş sonunda silindi → `left 0`)

```
== M1 ON
HTTP/1.1 200 OK
{"success":true,"meta":{"tenantId":"cmvduvb5i0000b4xko6lrgxzu","total":0,…},"data":[]}
== M1 OFF
HTTP/1.1 403 Forbidden
{"error":"MODULE_ACCESS_DENIED","module":"M1"}
== M1 PILOT
HTTP/1.1 200 OK
{"success":true,"meta":{…,"total":0,…},"data":[]}
== M1 DEV
HTTP/1.1 403 Forbidden
{"error":"MODULE_ACCESS_DENIED","module":"M1"}
== M1 ON + plan basic
HTTP/1.1 403 Forbidden
{"error":"MODULE_ACCESS_DENIED","module":"M1"}
== geçersiz anahtar
HTTP/1.1 401 Unauthorized
{"error":"Unauthorized","message":"Invalid or revoked API key.","code":"AUTH_INVALID_API_KEY"}
== OFF /api/v1/calls -> 403
== OFF /api/v1/partners -> 403
== OFF /api/v1/partners/leaders -> 403
== OFF /api/v1/partners/999999999 -> 403
== PILOT /api/v1/calls -> 200
== PILOT /api/v1/partners -> 200
== PILOT /api/v1/partners/leaders -> 400   # kapıdan geçti; parametresiz sorgu invalid_query (route.ts:28-30), kapı değil
left 0
```

## Bulgular (önem sırasıyla)

**Bloke eden: yok.**

**Öneri 1 (test kapsamı, bloke etmez):** `tests/api/v1-module-gate.test.ts` route taraması yalnız `withTenant|withSystemScope|prisma` metnini arıyor. Veriyi yardımcı fonksiyonla okuyan route'ta (`partners/leaders` → `coordinatorLeaders`) sıralama denetimi boş kalıyor. M6'da auth'tan önce `coordinatorLeaders` çağrıldı ve test geçti. Sonucun dikkate alınıp alınmadığı (`if (!authRes.authenticated) return …`) da denetlenmiyor. Önerilen düzeltme: auth çağrısının, fonksiyon gövdesinin ilk `await` ifadesi olduğunu ve hemen ardından `if (!authRes.authenticated)` geldiğini denetlemek. Ya da daha sağlamı, ileride bir `withApiKey(handler)` sarmalayıcısı. Bugünkü beş route'un hepsi elle bakıldığında doğru.

**Öneri 2 (sağlamlık, bloke etmez):** `decideModuleAccess` (`src/lib/modules/tenant-access.ts:101`) viewer'ı olduğu gibi geçiriyor. Eski kod alanları seçip yeni nesne kuruyordu. Bugün bütün oturum çağıranları literal kurduğu için yükseltme yolu yok. İleride biri `canAccessStatus(status, scope)` ya da `{ ...session }` geçirirse ve o nesnede bir gün `isMachine` olursa PILOT sessizce açılır. Önerilen düzeltme (isteğe bağlı): `checkModuleAccess` ve `listAccessibleModules` tarafında viewer tipini `isMachine?: never` olan bir `SessionViewer` ile daraltmak.

## Değişen dosyalar
Kod değişmedi. Yalnız bu rapor: `/Users/macbook/alan/docs/agent-results/TASK-MVDPYNG1JI0S1-crw2-fb.md` (kopyası FONBRIDGE ana ağacında `docs/agent-results/`).

## Riskler
- Hız sınırı: reddedilen istek sayaçtan düşmeye devam ediyor (sayaç kapıdan önce çalışıyor). Bu davranış testle sabitlenmiş ve kartın 3. adımıyla tutarlı.
- `partners/[pic]` ve `calls` gibi SYSTEM_WIDE veri okuyan uçlar da M1'e kapılı; OFF'ta 403 curl ile görüldü.

## Açık sorular
Yok.

## Sonraki adım
- leed-fb: PR #102 merge edilebilir (base `dev`, merge-tree temiz).
- Öneri 1 ve 2 istenirse ayrı küçük bir kart olarak açılabilir.
- FO-81 (M1 kilit ekranında anahtar iptali) be-fb'ye delege edilebilir.
