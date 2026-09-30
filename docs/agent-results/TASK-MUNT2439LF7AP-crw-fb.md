# TASK-MUNT2439LF7AP — FB İNCELEME-68 (crw-fb): JWT rol/kiracı her istekte yenileme (TASK-MUNQB0GR306U0, be-fb)

**Durum:** TAMAM · **İnceleyen:** crw-fb · **Tarih:** 30.09.2026
**İncelenen:** dal `be-fb/munqb0-jwt-refresh`: `d57f13f1` (kod ve test) + `f52376c4` (docs), taban dev `2cb224e6`
**Karar:** **ONAY.** Dal dev'e merge edilebilir (`git merge-tree dev f52376c4` çakışmasız; dev `2cb224e6` sonrası `src/lib/auth.ts` / `tenant.ts` dosyalarına dokunmamış). Bloke eden bulgu yok. Y-1 ayrı kartla izlenmeli.
**Platform beyanı:** Doğrulama **mac** (Darwin 27, arm64) üzerinde yapıldı: izole Postgres `crwfb68-pg` :5468, dalın dev sunucusu :3468, Chrome (playwright `channel: chrome`). Değişen kod (`src/lib/auth.ts` jwt callback) platforma bağlı değil: süreç, dosya yolu ya da kabuk kullanmıyor. Bu yüzden Windows ve Linux'ta davranış aynı olur. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var. CI (Linux) aynı vitest takımını koşar.

Not: İlk koşu ~11:23'te "Connection lost" hatasıyla kesildi. Bu koşu aynı worktree'den (`…/ba8bf47a…/scratchpad/wt`, HEAD `f52376c4`) ve aynı konteynerden devam etti. Ortam yeniden kurulmadı. Paylaşılan fabrika DB'sine (:5433) yazılmadı.

## 1. Ne yapıldı

Değişiklik jwt callback'te rol ve kiracıyı artık **her çağrıda** tek bir `prisma.user.findUnique` (select + `memberships where tenantId=bound, take 1`) ile yeniden okuyor. Önceden okuma yalnız sign-in anında ya da token'da kiracı yokken yapılıyordu. Token, `boundTenantId` claim'i ile verildiği kiracıya bağlı kalıyor. Üyelik düşerse token kiracısız kalır. Başka kiracıya sessizce geçmez. Kiracıyı yalnız bir sign-in yeniden seçer. DB hatasında `catch` kiracı ve rol vermez, bağ ise korunur.

Spec'teki her madde gerçek HTTP (curl çerez kavanozu ve credentials sign-in) ve gerçek tarayıcı ile denendi:

| # | Senaryo (gerçek HTTP, aynı çerez) | Sonuç |
|---|---|---|
| 1 | Sahip olarak giriş, `POST /api/invitations` | rol kontrolünden geçti (403 **koltuk sınırı**, rol reddi değil) |
| 2 | DB'de MEMBER'a düşürme, aynı çerezle yeniden POST | `role=MEMBER`, **403 "Bu işlem için yetkiniz yok"** ✅ |
| 3 | Tekrar sahip yapma | bir sonraki istekte `TENANT_OWNER` ✅ |
| 4 | Bağlı kiracı A'dan üyelik silindi (B'de sahip) ×3 istek | 3/3 `tenant=None role=None`, POST **401 TENANT_SCOPE_REQUIRED**. Yeniden basılan çerezde `boundTenantId=demo-tenant` kalıyor, **B'ye geçiş yok** ✅ |
| 5 | DB durdu (`docker stop crwfb68-pg`) | session kiracısız/rolsüz/admin=false, POST 401 (**fail-closed**). Çerezde bağ korundu. DB geri gelince aynı kiracı ve rol döndü ✅ |
| 6 | Platform admin bayrağı açık / kapalı (alice) | `admin=True` → `/tr/admin/feedback` 200 · bayrak kapanınca bir sonraki istekte `admin=False` → 404 ✅ |
| 7 | 20 paralel istek, patlamanın ortasında rol düşürme | 19 `MEMBER` + 1 kiracısız. Sonrasında 20/20 `MEMBER`. Hiçbir istek eski rolü ya da başka kiracıyı görmedi ✅ (tek kiracısız istek için bkz. Ö-2) |
| 8 | 20 paralel, bağlı kiracı B silindi (A ve C duruyor) | 20/20 kiracısız, A'ya ya da C'ye sessiz geçiş yok ✅ |
| 9 | İstek başına Prisma çağrısı (`log_statement=all`) | `/api/auth/session` başına **1 Prisma çağrısı = 2 SQL**: `User` by id + `Membership WHERE tenantId=$1 AND userId=$2 ORDER BY createdAt LIMIT 1` ✅ |
| 10 | Davet kabulü (bağlı kiracıdan çıkarılmış kullanıcıya C üyeliği eklendi, çerez aynı) | **kiracısız kalıyor**, yeniden girişte `rev68tb` (en eski üyelik) seçildi. Bkz. **Y-1** |

## 2. Kanıt

### Gerçek HTTP (`scratchpad/http68*.log`, betikler `http68.sh`, `http68b.sh`, `http68c.sh`)
```
[1] signed in           : tenant=demo-tenant role=TENANT_OWNER admin=False | invite POST: 403 {"error":"Planınızın koltuk sınırına ulaşıldı (6 koltuk: 12 üye…
[2] demoted to MEMBER   : tenant=demo-tenant role=MEMBER admin=False | invite POST: 403 {"error":"Bu işlem için yetkiniz yok. Yalnızca kurum sahibi veya yöneticisi davet gönderebilir."}
[3] promoted back       : tenant=demo-tenant role=TENANT_OWNER admin=False
[4.1] A removed (B kept): tenant=None role=None admin=False | invite POST: 401 {"error":"Unauthorized",…"Oturumunuz bir çalışma alanına bağlı değil…
[4.2] A removed (B kept): tenant=None role=None admin=False | invite POST: 401 …
[4.3] A removed (B kept): tenant=None role=None admin=False | invite POST: 401 …
[5] joined C (invite-accept row) while signed in, bound A: tenant=None role=None admin=False
[6] A re-added          : tenant=demo-tenant role=TENANT_OWNER admin=False
[7] before outage       : tenant=demo-tenant role=TENANT_OWNER {"tenantId":"demo-tenant","boundTenantId":"demo-tenant","role":"TENANT_OWNER","isPlatformAdmin":false}
[7a] DB DOWN            : tenant=None role=None admin=False | invite POST: 401 …
[7b] DB DOWN cookie     : {"boundTenantId":"demo-tenant","isPlatformAdmin":false}
[7c] DB back            : tenant=demo-tenant role=TENANT_OWNER … {"tenantId":"demo-tenant","boundTenantId":"demo-tenant",…}
[8] A removed           : tenant=None role=None admin=False {"boundTenantId":"demo-tenant","isPlatformAdmin":false}
[8a] +C, same cookie    : tenant=None role=None admin=False
[8b] fresh sign-in      : tenant=rev68tb role=TENANT_OWNER admin=False (B older than C)
[9] alice               : tenant=demo-tenant role=PIPELINE_MANAGER admin=False
[9a] alice flag ON      : … admin=True   → /tr/admin/feedback 200, /tr/admin/alerts 200
[9b] alice flag OFF     : … admin=False  → /tr/admin/feedback 404
[10] 20 parallel, demote mid-burst:   19 demo-tenant MEMBER;   1 None None;
[10a] 20 parallel after :   20 demo-tenant MEMBER;
[11] 20 parallel, bound B removed mid-burst (A,C remain):   20 None None;
```
Çerez içeriği Auth.js'in kendi `decode` fonksiyonuyla (`next-auth/jwt`, `AUTH_SECRET`, salt `authjs.session-token`) okundu.

### SQL (Postgres log, tek `/api/auth/session`)
```
SELECT "User"."id","User"."name","User"."isPlatformAdmin" FROM "User" WHERE ("User"."id" = $1 AND 1=1) LIMIT $2 OFFSET $3   -- $1='demo-user-alice'
SELECT "Membership"."id","tenantId","role"::text,"workspaceIds","userId" FROM "Membership"
  WHERE ("Membership"."tenantId" = $1 AND "Membership"."userId" = $2) ORDER BY "createdAt" ASC LIMIT $3 OFFSET $4   -- $1='demo-tenant'
```

### Tarayıcı kareleri (Chrome, gerçek çerez)
- `scratchpad/shot-demoted-member-dashboard.png`: alice DB'de MEMBER'a düşürüldü. Aynı çerezle `/tr/default/dashboard` "Erişim Reddedildi — Pipeline Yöneticisi veya daha yüksek izin" gösteriyor.
- `scratchpad/shot-tenantless-after-join.png`: Y-1 durumu. A'da sahip ve C'de WRITER olan kullanıcı, bağlı olduğu B'den çıkarıldığı için aynı yanıltıcı "Erişim Reddedildi" ekranında kalıyor.

(scratchpad = `/private/tmp/claude-501/-Users-macbook-alan/ba8bf47a-3975-421d-be9e-1a270ccf8595/scratchpad`)

### Mutantlar (`scratchpad/mut.py`, `mut.log`; `auth-callbacks.test.ts` ve `auth-jwt-membership-refresh.live.test.ts`, 18 test)
| Mutant | Sonuç |
|---|---|
| M1 bound yerine ilk üyelik (`where` kaldır) | 5 kırmızı ✅ |
| M2 token'dan silmeyi kaldır (eski değer kalır) | 4 kırmızı ✅ |
| M3 catch'te eski kiracı ve rolü geri koy | 1 kırmızı ✅ |
| M4 bağı yalnız `token.tenantId`'den al | 2 kırmızı ✅ |
| M5 `boundTenantId`'yi try öncesi geri yazma | 2 kırmızı ✅ |
| M6 sign-in de bağı korur (trigger kontrolü yok) | 1 kırmızı ✅ |
| M7 sign-in en yeni üyeliği seçer (`desc`) | 3 kırmızı ✅ |
| M8 eski davranış (kiracılı token üyelik okumaz) | 7 kırmızı ✅ |
| M10 (crw-fb) admin iddiası korunur (`claimedAdmin \|\|`) | 3 kırmızı ✅ |
| M9 `delete token.workspaceIds` kaldır | **18/18 yeşil, yaşıyor**. Bkz. Ö-1 |

Her mutanttan sonra `git status --short src` temiz (restored clean).

### Kapılar (worktree `f52376c4`)
```
tsc --noEmit                → exit 0
pnpm lint (eslint)          → exit 0
npx tsx scripts/i18n-check.ts → ✅ i18n check passed … no file gained hard-coded text.  exit 0
npx vitest run (tam)        → Test Files 2 failed | 256 passed | 2 skipped (260); Tests 2 failed | 3136 passed | 9 skipped (3147)
   düşenler: tests/withholding-rounding.test.ts (5000ms timeout), tests/rag-pdf-worker-isolation.test.ts (İNCELEME-52 ağır PDF zamanlaması)
   ikisi de dalda DEĞİŞMEMİŞ (git diff 2cb224e6 f52376c4 boş). Aynı makinede dev sunucusu ve yük altında zamanlama flake'i.
tekrar: vitest run <o iki dosya> + auth-callbacks.test.ts + auth-jwt-membership-refresh.live.test.ts → Test Files 4 passed (4), Tests 40 passed (40), exit 0
pnpm build (i18n ratchet dahil) → ✅ i18n check passed … build exit 0
git merge-tree --write-tree dev f52376c4 → merge temiz
```

## Bulgular (önem sırasıyla)

### Y-1 (orta, bloke etmez): Bağlı kiracıdan çıkarılan kullanıcı başka kiracıya katılsa da yeniden girişe kadar kiracısız kalıyor
- **Yer:** `src/lib/auth.ts` jwt callback: `heldTenantId = token.tenantId ?? token.boundTenantId` ve `memberships.where = { tenantId: boundTenantId }`.
- **Senaryo:** Kullanıcı A'ya bağlı. A'dan çıkarılıyor, çerezde `boundTenantId=A` kalıyor. Oturum açıkken C'nin davetini kabul ediyor (`acceptInvitationAction` → `membership.create` → `redirect('/tr/default/dashboard')`). Her istek yalnız A üyeliğini arıyor, bu yüzden kalıcı olarak kiracısız. Kullanıcı kabulden hemen sonra "Erişim Reddedildi — Pipeline Yöneticisi gerekli" ekranını görüyor (kare `shot-tenantless-after-join.png`). Mesaj da yanıltıcı, çünkü sorun rol değil kiracı. Çıkış yolu yalnız çıkış yapıp yeniden girmek. Canlı kanıt: [5] ve [8a] satırları.
- **Neden bloke değil:** Güvenlik yönü doğru (sessiz geçiş yok, spec'in istediği bu). Önceden bu kullanıcı çıkarıldıktan sonra da A'nın sahibi kalıyordu (asıl açık). Yeni durum dar bir UX yolu. Hiç bağı olmayan kullanıcı (ilk kez davet kabul eden, `boundTenantId` yok) doğru şekilde yeni kiracıya düşüyor.
- **Önerilen düzeltme (ayrı kart):** Davet kabulü açık bir kullanıcı eylemi. Orada `unstable_update({ tenantId })` ya da `trigger === "update"` ile bağı yeni kiracıya taşımak "sessiz geçiş" sayılmaz. Alternatif olarak kiracısız oturumlarda dashboard rol reddi yerine "çalışma alanınız değişti, yeniden giriş yapın" ekranı gösterilebilir.

### Ö-1 (düşük, test boşluğu): `delete token.workspaceIds` hiçbir testle korunmuyor (M9 yaşıyor)
Üyelik düşünce ya da DB hatasında eski `workspaceIds` token'da kalıyor. `session.workspaceIds` eski listeyi taşıyor ama `tenantId=null` olduğu için kapsam fonksiyonları zaten reddediyor. Bugün sömürülebilir değil. Öneri: "removed member" testine `expect(token.workspaceIds).toBeUndefined()` eklenmeli.

### Ö-2 (düşük, gözlem): Havuz doygunluğunda tek istek kiracısız düşüyor
20 paralel istekte biri `Connection terminated due to connection timeout` aldı (`src/lib/db.ts` `connectionTimeoutMillis: 1000`) ve o istek için kiracısız oldu (dev.log:816). Bu, spec'in istediği fail-closed davranış. Çerezde bağ korunduğu için bir sonraki istek düzeliyor. Yine de eskiden bu durumda eski kiracı korunuyordu. Artık yük altında ara sıra 401 ya da "erişim reddedildi" görülebilir. Artış ayrıca ölçülebilir: kiracılı token başına istek başına SQL sayısı 1'den 2'ye çıktı. Prod havuz ayarı bir kez izlenmeli. Değişiklik gerektirmez.

### Doğrulanan, sorun olmayanlar
- Eski (dağıtım öncesi) token'lar: `boundTenantId` yok, `tenantId` var. `heldTenantId` bu durumda `tenantId`'yi kullanıyor, geriye uyumlu.
- `trigger: "signUp"`: token'da kiracı olmadığından `boundTenantId=null`, en eski üyelik seçiliyor. `createUser` event'i jwt'den önce üyeliği yazıyor.
- Sign-in'de DB hatası: bağ oluşmuyor, sonraki başarılı çağrı en eski üyeliği seçiyor. Kalıcı kiracısızlık yok.
- Admin: `claimedAdmin` yalnız log için kullanılıyor, bayrak her çağrıda DB'den okunuyor (M10 kırmızı).

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUNT2439LF7AP-crw-fb.md` (bu rapor). Kod değiştirilmedi.
- Geçici: worktree'ye yazılan `zz-*` yardımcıları silindi, `git status` temiz. Test satırları (`rev68*` tenant ve user) silindi, alice rolü ve admin bayrağı eski haline döndü. Kendi dev sunucum (pid 96509, cwd worktree) kapatıldı.

## 4. Riskler
- Y-1'in UX yolu merge sonrası kalır (dar kapsamlı).
- İstek başına bir ek SQL var (Ö-2).

## 5. Açık sorular
- Davet kabulünde bağı yeni kiracıya taşımak ürün kararı mı (Y-1), yoksa "yeniden giriş" ekranı yeterli mi?

## 6. Sonraki adım
- be-fb veya lider: dalı dev'e merge et.
- Y-1 ve Ö-1 için ayrı düzeltme kartı aç.
