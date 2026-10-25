# TASK-MVDV63H2OCK0 — PR #128 güvenlik incelemesi (sec-gnd)

**Hüküm: DÜZELTME GEREKLİ** (düşük önem; çalışan bir açık bulunmadı, iki savunma derinliği eksiği var — aşağıda)

**Platform beyanı:** Doğrulama macOS (darwin) üzerinde yapıldı. Değişiklik sunucu tarafı (Next.js route + TypeScript tip/test); işletim sistemine bağlı kod yolu yok, sonuç platformdan bağımsız.

**İncelenen:** PR #128 `be-fb/fo86-auth-order-session-viewer` → `dev`, head `09edf84f`. Kod değiştirilmedi, merge edilmedi. Diff, PR dalı ayrı bir detached worktree'de (`scratchpad/pr128`) okunup koşuldu; FONBRIDGE ana çalışma ağacına dokunulmadı.

## Not: kart ile teslim metni arasındaki fark

Kart (FO-86) bu işi `be-fb`'ye uygulama olarak atıyor ("test sırası güçlendir + isMachine yasakla", sonuç `…-be-fb.md`). Teslim metni ise sec-gnd'den PR #128'in **incelenmesini** istiyor. Teslim metnindeki inceleme kapsamını yerine getirdim; kart "çelişirse kart geçerlidir" dediği için kartın Definition of Done maddelerini de hüküm için referans aldım. Kartın atandığı kişi (`be-fb`) hakkında karar vermedim.

## Ne yapıldı

1. Kart okundu (`get_task`), FONBRIDGE `CLAUDE.md` mimari kuralları (çok kiracılılık, yetkilendirme) okundu.
2. `gh pr diff 128` alındı: 4 dosya (`src/lib/modules/access.ts`, `src/lib/modules/state-machine.ts`, `tests/api/v1-module-gate.test.ts`, `tests/modules/session-viewer.test.ts`).
3. `/api/v1` route envanteri: 5 `route.ts` (`calls`, `opportunities`, `partners`, `partners/leaders`, `partners/[pic]`). Test tarayıcısının (`routeFiles`) kapsamı: `api/v1` altında tüm `route.ts` dosyaları — 5/5 kapsanıyor, eksik yok.
4. Her handler'da sıra manuel kontrol edildi: `authenticateApiKey(req)` → `if (!authRes.authenticated) return` → veri okuma. 5/5 uygun.
5. `isMachine` kullanımları tarandı: yalnızca `src/lib/api-auth.ts:33` (`API_KEY_VIEWER`) üretiyor; session yolu `sessionViewerOf` ile yalnız `{role, isPlatformAdmin}` kuruyor.
6. Testler ve typecheck koşuldu (aşağıda).
7. İki savunma açığı probe ile doğrulandı (aşağıda).

## Kanıt (ham çıktı)

### Testler (`pnpm exec vitest run tests/api/v1-module-gate.test.ts tests/modules`)
```
 ❯ tests/modules/settings-modules-plan.test.ts (6 tests | 5 skipped) 44ms
 FAIL  tests/modules/settings-modules-plan.test.ts > modules settings — plan and state from entitlements
Error: connect ECONNREFUSED ::1:5432
Error: connect ECONNREFUSED 127.0.0.1:5432
 Test Files  1 failed | 24 passed (25)
      Tests  246 passed | 5 skipped (251)
```
Tek başarısız dosya veritabanına (`localhost:5432`) bağlanamadığı için düşüyor: bu worktree'de Postgres çalışmıyor. PR'la ilgisi yok (session-viewer ve v1-module-gate geçti). Bu dosyanın DB testleri PR'dan bağımsız, koşulamadı.

### Typecheck (`pnpm typecheck` → `tsc --noEmit`)
```
TSC_EXIT=0
```
Tip `@ts-expect-error` direktifleri kullanılmış (unused olsa tsc hata verirdi), `tsconfig` `**/*.ts`'i kapsıyor.

### Tip probe'u (geçici dosya, sonra silindi)
```
tests/modules/zz-probe.ts(7,34): error TS2322: Type 'true' is not assignable to type 'undefined'.
```
Satır 4-5 (`canAccessStatus(..., {...s, isMachine: true})`, `checkModuleAccessForTenant(..., {...s, isMachine: true})`) **derlendi**; yalnız `SessionViewer`-tipli bağlama (satır 7) hata verdi.

### Tarama probe'u (`authOrderProblems` izole, node strip-types)
```
floatingHelperBeforeAuth => []
floatingPrismaBeforeAuth => ["GET: data is read before authenticateApiKey"]
```
`const pending = coordinatorLeaders({})` (await'siz, auth'tan önce) tarama tarafından **geçiyor**; `prisma.` ile aynı kalıp yakalanıyor.

## Bulgular

### B1 — `isMachine` yasağı yalnızca `SessionViewer` bağlamalarını koruyor (önem: düşük / savunma derinliği)
- **Konum:** `src/lib/modules/state-machine.ts:137` (`SessionViewer`), `src/lib/modules/tenant-access.ts:56`, `src/lib/modules/tenant-access.ts:90`, `src/lib/modules/state-machine.ts:187` (`canAccessStatus`'in parametresi `ModuleViewer`).
- **Kanıt:** Tip probe'u (yukarıda). `canAccessStatus` ve `checkModuleAccessForTenant` `ModuleViewer` kabul ediyor; `isMachine: true` içeren bir session nesnesi bu fonksiyonlara derleniyor. PR'ın kendi runtime testi de bunu yapıyor (`tests/modules/session-viewer.test.ts`, `canAccessStatus('PILOT', { ...session, isMachine: true })`).
- **Etki:** Bugün session yolu güvende — `sessionViewerOf` (`src/lib/modules/access.ts:49-51`) `isMachine`'i hiç kurmuyor, ve `checkModuleAccess` / `listAccessibleModules` yalnız bu fonksiyondan geçiyor. Ama bu güvenlik tipin değil, çağrı noktasının elle yazılmış literal'inin sonucu. Yarın biri `checkModuleAccessForTenant(tenantId, id, { ...scope })` yazarsa, `scope` `isMachine` taşımıyorsa güvenli; `{...scope, isMachine: true}` yazarsa **PILOT modülü tüm üyelere açılır** ve tip hata vermez. PR'ın doc yorumu ("`{ ...viewer, isMachine: true }` does not compile") bu yüzden yalnızca `SessionViewer`-tipli değerler için doğru; yorum fazla genellenmiş.
- **Düzeltme önerisi:** `ModuleViewer`'ı iki tipe ayır: `SessionViewer` (isMachine yok) ve `MachineViewer` (`isMachine: true`, yalnız `api-auth.ts`). `checkModuleAccessForTenant` / `decideModuleAccess` / `canAccessStatus` parametresi `SessionViewer | MachineViewer` olsun; session çağrıları `SessionViewer` ile çağrılsın ki `isMachine` gönderilemesin. Doc yorumunu bu gerçek sınıra göre düzelt.

### B2 — Route taraması, auth'tan önce başlatılan `await`siz yardımcı okumayı yakalamıyor (önem: düşük)
- **Konum:** `tests/api/v1-module-gate.test.ts` — `authOrderProblems` (`DATA_ACCESS` yalnızca `withTenant|withSystemScope|prisma` içeriyor; `await` kontrolü yalnız ilk `await`'in guard'a ait olmasını denetliyor).
- **Kanıt:** Tarama probe'u: `const pending = coordinatorLeaders({}); const authRes = await authenticateApiKey(req); …` → `[]` (geçiyor). Test yorumu "still caught by the older text check" diyor; bu yalnızca prisma/withTenant kalıbı için doğru.
- **Etki:** Mevcut 5 route'ta **yok** (her handler'da auth ilk ifade; leaders/`coordinatorLeaders` guard'dan sonra `await` ediliyor). Ama "auth önce" garantisi, helper üzerinden yapılan yeni bir route için delik bırakıyor: DB okuması auth'tan önce başlar, sonuç yalnız auth'tan sonra döner. Güvenlik sızıntısı değil, sıra garantisinin eksikliği.
- **Düzeltme önerisi:** Guard'ı handler gövdesinin ilk ifadesi olarak zorunlu kıl (yorum ve boşluk hariç), ya da guard'dan önceki gövdede herhangi bir çağrı ifadesini (`\(`) hata say. Ek red-fixture: `const pending = someHelper({})` ile önce gelen handler.

### B3 — Session viewer testinde etkisiz assert (önem: bilgi)
- **Konum:** `tests/modules/session-viewer.test.ts` — `expect([spread, explicitFalse]).toHaveLength(2)`.
- **Kanıt:** Bu satır hiçbir davranışı sınamıyor (iki değişkenin varlığını sayıyor). Asıl koruma `@ts-expect-error` satırları; onlar `pnpm typecheck` ile çalışıyor (tsc hatası doğrulandı), vitest'te değil. Bu kabul edilebilir, ama yorumda "runtime checks pin what the two viewers mean" denmesi testin gücünü abartıyor.
- **Düzeltme önerisi:** Bu assert'i kaldır ya da `sessionViewerOf` çıktısının `isMachine` anahtarı taşımadığını doğrulayan bir runtime test ekle (`access.ts`'den export ederek).

### B4 — Bilgi: `calls`, `partners`, `partners/[pic]` route'ları `withTenant` kullanmıyor (PR kapsamı dışı)
- `prisma.topic`, `prisma.cordisOrganization`, `prisma.cordisParticipation` çağrıları `scripts/rls-models.ts` içinde SYSTEM_WIDE listelenmiş tablolar (CORDIS kamu verisi). Erişim yalnız API key + M1 kapısıyla. Bu tasarım gereği; PR bunu değiştirmiyor. CLAUDE.md'deki "her sorgu `withTenant`" kuralı bu tablolar için istisna olarak zaten belgeli görünüyor — tek notum: istisna listesinin `rls-models.ts`'te güncel olduğunu ayrıca doğrulamak iyi olur.

## Risk tablosu

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| B1 | `isMachine` yasağı ModuleViewer API'lerinde yok | Düşük | Düzeltme önerildi |
| B2 | Tarama `await`siz helper okumasını kaçırıyor | Düşük | Mevcut route'larda etkisiz |
| B3 | Etkisiz runtime assert, abartılı yorum | Bilgi | — |
| B4 | SYSTEM_WIDE tablolar withTenant dışı (tasarım) | Bilgi | PR kapsamı dışı |

## Doğrulanan (sorun bulunmayan) noktalar
- 5/5 `/api/v1` route `authenticateApiKey` ile başlıyor ve sonucu kontrol ediyor; route taraması kapsamı tam (5 dosya).
- Kiracı kapsamı: `opportunities` `withTenant(tenantId)` kullanıyor; key'den gelen `tenantId` kullanılıyor.
- Sırasıyla gate: key arama → rate sayımı → soft-delete tenant kontrolü → M1 modül kapısı. Modül kapısı veri okumadan önce.
- `sessionViewerOf` session yolunda `isMachine` üretmiyor (bugünkü davranış güvenli).
- `isMachine` yalnız `api-auth.ts:33`'te üretiliyor.
- Typecheck temiz (exit 0); tip ban'ı `SessionViewer` bağlamalarında gerçekten derleme zamanında çalışıyor.

## Açık sorular
1. Kart ve teslim metni arasındaki fark: kart be-fb'ye uygulama atıyor, teslim inceleme istiyor. Bu hüküm inceleme olarak verildi; uygulama (test/tip düzeltmesi) hâlâ be-fb'ye aitse B1/B2 düzeltmelerini onun işine eklemek gerekir.
2. Ana FONBRIDGE çalışma ağacı `feat/partner-search-interreg` dalında ve dolu (çok sayıda değiştirilmiş/stage'li dosya). Bu raporun commit'i yalnız bu dosyayı içeriyor (`git commit -- <yol>`).

## Sonraki adım
- B1: `SessionViewer` / `MachineViewer` ayrımını uygula, `checkModuleAccessForTenant`/`decideModuleAccess`/`canAccessStatus` parametrelerini daralt, doc yorumunu düzelt. Red kanıtı: `{...scope, isMachine: true}` çağrısının typecheck'te hata vermesi.
- B2: tarama kuralına "guard ilk ifade" ve red-fixture ekle.
- B3: etkisiz assert'i kaldır ya da runtime testle değiştir.
- Yeniden test: `pnpm typecheck` + `tests/api/v1-module-gate.test.ts` + `tests/modules/session-viewer.test.ts` (DB'li dosya hariç; DB ortamında ayrıca koşulmalı).
