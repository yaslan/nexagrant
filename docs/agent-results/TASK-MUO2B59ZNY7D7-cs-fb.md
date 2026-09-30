# TASK-MUO2B59ZNY7D7 — FB GÜVENLİK (İNCELEME-81 O-1 + Ö-1..Ö-4): jwt üyelik okuması silinmiş kiracıya bakmıyor

**Durum:** TAMAM · **Ajan:** cs-fb · **Tarih:** 30.09.2026
**Dal:** `cs-fb/muo2b5-tenant-deleted` (dev `23e63600`'dan), kendi worktree'si, kendi `pnpm install`.
**Ortam:** İzole Postgres `csfb-o2b5-pg` (pgvector:pg16, 127.0.0.1:5482), CI ile aynı hazırlık: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 ("40 files applied") → `db:rls` (112 politika) → `db:seed`. Worktree `.env`'inde `grep -c 5433` → **0**. Paylaşılan `fabrika` :5433'e hiç bağlanılmadı. Dev sunucusu `:3482` (yalnız kendi başlattığım süreç, iş sonunda kapatıldı), Chrome (`@playwright/test`, `channel: 'chrome'`).
**Platform:** macOS (Darwin 27.0.0) üzerinde doğrulandı. Değişiklik yalnız bir Prisma sorgu filtresi ve testler; süreç, dosya yolu, kabuk ya da ekran koduna dokunulmadı. Aynı sorgu Windows ve Linux'ta da aynı SQL'i üretir. CI (ubuntu-latest) tam vitest'i zaten koşuyor. Windows ve Linux'ta ayrıca koşulamadı, bu makinede yalnız macOS var.

## Özet
Silinmiş (`Tenant.deletedAt` dolu, silme öncesi bekleme süresindeki) bir kiracıdaki üyelik artık oturuma hiçbir yetki vermiyor. Önceki [A9] saldırısı (`POST /api/auth/session {tenantId: <silinmiş>}` → 200 TENANT_OWNER) artık oturumu olduğu yerde bırakıyor. Silinmiş kiracıya bağlı oturum bir sonraki istekte kiracısız kalıyor. Giriş, silinmiş kiracıyı en eski üyelik olsa bile atlıyor. `deletedAt` temizlenince (geri alma) aynı çerez kiracısına kendiliğinden dönüyor. Filtre mevcut sorgunun içine eklendi. jwt çağrısı başına SQL sayısı değişmedi: **2 → 2**. İNCELEME-81'de yaşayan 5 mutantın (N2/N4/N7/N8/N11) beşi de artık kırmızı.

## 1. Ne yapıldı
1. **O-1 düzeltmesi** (`src/lib/auth.ts` jwt callback): üyelik `where`'ine `tenant: { deletedAt: null }` eklendi. Bağlı, istenen ve "en eski" dallarının üçüne de uygulanıyor. Eski `where: undefined` dalı artık `{ tenant: { deletedAt: null } }` oluyor, yine yalnız bu kullanıcının üyelikleri okunuyor. Prisma bunu aynı Membership sorgusunda `LEFT JOIN "Tenant" … "deletedAt" IS NULL` olarak yazıyor, ek sorgu yok.
2. **RLS kontrolü:** jwt kiracı kapsamı dışında çalışıyor. `Tenant` tablosunda RLS kapalı (`relrowsecurity=f`, `prisma/rls.sql` listesinde yok), bu yüzden JOIN kapsam dışında da satırı görüyor. Kimse yanlışlıkla kiracısız kalmıyor. Canlı testler bunu doğruluyor.
3. **Kurtarma (geri alma) akışı:** FONBRIDGE'de kiracı için bir geri alma ekranı ya da rotası yok. `grep` sonucu: `Tenant.deletedAt`'e yazan uygulama kodu yok. Kod tabanındaki tek "silmeyi iptal et" akışı `cancelAccountDeletion` (`src/actions/user/request-deletion.ts`). Bu akış **kullanıcı** silmesini geri alıyor, `User.deletedAt`'e yazıyor ve kiracı filtresinden etkilenmiyor. (FR-TEN-01 kiracı silme ve kurtarma YUYT projesine ait, FONBRIDGE'de karşılığı yok.) Bu yüzden istisna rotası açılmadı. Operasyonel geri alma, yani `deletedAt = null`, aynı oturumu kiracısına geri veriyor. Canlıda gösterildi: [R4]/[R5].
4. **Test borcu:** Ö-1..Ö-4 testlerle kapatıldı. Kod davranışı zaten doğruydu, N2 regex'i ve N4 try/catch'i yerinde. Değişmeleri halinde artık testler kırmızı oluyor.
   - N7 (Ö-1): istenen üyeliğin bağlı olandan **daha eski** olduğu durum (`asc` sırasında ilk satır istenen, son satır bağlı).
   - N2 (Ö-2): `canceling statement due to statement timeout`, `Query timeout`, `Connection terminated unexpectedly` yeniden denenmiyor (tek çağrı).
   - N8 (Ö-4): iki başarısız denemede uyarı logu tam **bir kez** yazılıyor. İlk denemede bu test mutantı öldürmedi, çünkü önceki testlerin `console.warn` casusu temizlenmiyordu ve çağrılar birikiyordu. `warn.mockClear()` eklenince kırmızı oldu.
   - N11 (Ö-4): oturum anahtarları tam liste olarak sabitlendi (`expires, isPlatformAdmin, role, tenantId, user, workspaceIds` ve `user` içinde `email, id, image, name`).
   - N4 (Ö-3): yeni `tests/accept-invite-rebind-failure.test.ts`. `unstable_update` hata fırlatınca yine `/en/default/dashboard`'a yönleniyor, davet çerezi temizleniyor, log yalnız hata adını içeriyor (sahte DB URL'si loga sızmıyor).
5. **Canlı testler** (`tests/auth-jwt-membership-refresh.live.test.ts`, gerçek `auth()` ve `unstable_update`, gerçek DB): bağlı kiracı silindiğinde durum, silinmiş en eski üyelikle giriş ve [A9].

## 2. Kanıt

### A. Canlı RED → GREEN (vitest, gerçek DB)
Düzeltmeden **önce** yeni canlı testler (3/3 kırmızı):
```
O1_BOUND_DELETED {"deleted":{"tenantA":true,...,"role":"TENANT_OWNER"},"write":"ok:{\"success\":true}","left":0,...}   ← silinmiş kiracıda YAZMA bile geçti
O1_SIGNIN {"tenantA":true,"tenantB":false,...}                                                                           ← giriş silinmiş A'ya bağladı
O1_A9 {"d":true,"tenantA":false,"role":"TENANT_OWNER"}                                                                    ← [A9] açık
      Tests  3 failed | 5 passed (8)
```
Düzeltmeden **sonra** (`ekler/live-green.txt`):
```
O1_BOUND_DELETED {"deleted":{"tenantA":false,"tenantB":false,"tenantId":null,"role":null},"write":"throw:TENANT_SCOPE_REQUIRED","left":1,"restored":{"tenantA":true,"role":"TENANT_OWNER"}}
O1_SIGNIN {"tenantA":false,"tenantB":true,...,"role":"TENANT_OWNER"}
O1_A9 {"d":false,"tenantA":true,"role":"TENANT_OWNER"}
Y2_DEMOTE / Y2_REMOVE / Y1_REBIND  … (önceki davranış korunuyor)
      Tests  8 passed (8)
```

### B. Gerçek HTTP + Chrome, :3482 (`ekler/live-http-out.txt`, `ekler/live.cjs.txt`, `ekler/seed.sh.txt`)
u: A'da TENANT_OWNER (en eski), B'de MEMBER, **silinmiş** D'de TENANT_OWNER. w: **silinmiş** D'de TENANT_OWNER (en eski), B'de MEMBER.
```
[0]  signed in (A oldest, live)                  : cfo2-a TENANT_OWNER
[A9] update {tenantId: cfo2-d} (member, DELETED) : 200 cfo2-a TENANT_OWNER | next GET cfo2-a   ← önceden 200 cfo2-d TENANT_OWNER
[A9b] dashboard after A9                         : /tr/default/dashboard (A'nın paneli)
[A8] update {tenantId: cfo2-b} (member, live)    : 200 cfo2-b MEMBER                         ← canlı kiracıya yeniden bağlama çalışıyor
[A10] update {tenantId: cfo2-a} (older, live)    : 200 cfo2-a TENANT_OWNER
[R1] A deleted, plain GET ×3                     : null null ×3                              ← B'ye sessiz geçiş yok
[R2] dashboard while A deleted                   : /tr/no-workspace
[R3] update {tenantId: cfo2-a} while deleted     : 200 null
[R4] A restored, plain GET (same cookie)         : cfo2-a TENANT_OWNER                       ← geri alma: aynı çerez kiracısına döndü
[R5] dashboard after restore                     : /tr/default/dashboard
[P1] w signs in (D oldest+deleted, B live)       : cfo2-b MEMBER                             ← giriş silinmiş en eski kiracıyı atladı
[P2] w update {tenantId: cfo2-d}                 : 200 cfo2-b MEMBER
[DB] memberships u: cfo2-a:TENANT_OWNER,cfo2-b:MEMBER,cfo2-d:TENANT_OWNER                   ← üyelik satırları silinmedi (geri alınabilir)
```
Oturum anahtarları her adımda `user, expires, tenantId, role, workspaceIds, isPlatformAdmin` oldu. Kareler: `shot-A9-after-update.png`, `shot-R2-bound-deleted.png` ("Henüz bir çalışma alanınız yok"), `shot-R5-restored.png` (panel geri geldi).

### C. Sorgu sayısı değişmedi (`ekler/sql-count.txt`, `log_statement=all`, koşu başına benzersiz işaret)
```
## ÖNCE (dev 23e63600)             signIn: User + Membership WHERE userId=$1            | yenileme: User + Membership WHERE tenantId=$1 AND userId=$2
## SONRA (düzeltme)                signIn: User + Membership LEFT JOIN Tenant j0 … WHERE (j0.deletedAt IS NULL AND j0.id IS NOT NULL) AND userId=$1
                                   yenileme: User + Membership LEFT JOIN Tenant j0 … WHERE ((j0.deletedAt IS NULL …) AND tenantId=$1) AND userId=$2
```
Çağrı başına 2 ifade, önce de sonra da. JOIN, `Tenant`'ın birincil anahtarı üzerinden yapılıyor.

### D. Mutantlar (`ekler/mutants-o2b5.py.txt`, `ekler/mutants-o2b5-out.txt`; 5 dosya, 63 test)
| Mutant | İNCELEME-81 | Şimdi |
|---|---|---|
| N1 String() zorlaması | kırmızı | 1 kırmızı ✅ |
| **N2** regex `/timeout/i` | **yaşadı** | **2 kırmızı ✅** |
| N3 sınırsız yeniden deneme | kırmızı | 2 kırmızı ✅ |
| **N4** kabulde `unstable_update` hatası yakalanmıyor | **yaşadı** | **1 kırmızı ✅** |
| N5 locale'siz yönlendirme | kırmızı | 1 kırmızı ✅ |
| N6 oturum `boundTenantId`'ye düşüyor | kırmızı | 4 kırmızı ✅ |
| **N7** `memberships.at(-1)` | **yaşadı** | **1 kırmızı ✅** |
| **N8** ikinci hata yutuluyor | **yaşadı** | **1 kırmızı ✅** |
| N9 kabul eski kiracıya bağlar | kırmızı | 2 kırmızı ✅ |
| N10 `trigger !== undefined` | yaşadı (eşdeğer) | yaşadı, **eşdeğer** (Auth.js `session`'ı yalnız update'te geçiriyor, İNCELEME-81 §F) |
| **N11** oturum `boundTenantId`'yi açığa verir | **yaşadı** | **1 kırmızı ✅** |
| O1 silinmiş-kiracı filtresi kaldırıldı | — | 14 kırmızı ✅ |
| O1b filtre yalnız girişte (bağlı/istenen dallar filtresiz) | — | 11 kırmızı ✅ |

Geri yüklemeden sonra: `Tests 63 passed (63)`.

### E. Kapılar (`ekler/gates.txt`; ağaç = bu dal)
```
npx tsc --noEmit                → exit 0
pnpm lint                       → exit 0
npx tsx scripts/i18n-check.ts   → exit 0
npx vitest run (tam, izole DB)  → exit 0 · Test Files 279 passed | 6 skipped (285) · Tests 3371 passed | 81 skipped (3452)
pnpm build                      → exit 0
```
3371 = İNCELEME-81'deki 3359 + bu karttaki 12 yeni test (birim 7, canlı 3, kabul eylemi 2).

## 3. Değişen dosyalar
- `src/lib/auth.ts`: jwt üyelik `where`'ine silinmiş kiracı filtresi ve yorum.
- `src/lib/auth-callbacks.test.ts`: `where` beklentileri filtreyle güncellendi, N7/N2/N8/N11 testleri eklendi.
- `tests/auth-jwt-membership-refresh.live.test.ts`: "a soft-deleted tenant grants nothing" bloğu (3 canlı test).
- `tests/accept-invite-rebind-failure.test.ts` (yeni): N4.
- `docs/agent-results/TASK-MUO2B59ZNY7D7-cs-fb.md` ve `…-ekler/` (çıktılar, betikler `.txt`, 3 kare). Ham token ya da sır yok: `grep -E '[0-9a-f]{64}|sk-…|AUTH_SECRET='` → boş.

## 4. Riskler
- **Oturumdan başka giriş yolları hâlâ silinmiş kiracıya bakmıyor (kapsam dışı, yalnız koddan okundu, canlı denenmedi):** `src/lib/api-auth.ts:67`, API anahtarını `keyHash` ile buluyor ve `keyRecord.tenantId` ile devam ediyor. `Tenant.deletedAt` kontrolü yok. Silinmiş bir kiracının Partner REST API anahtarı çalışmaya devam ediyor olabilir. Magic-token partner portalı da aynı gözle incelenmeli. Ayrı kart öneriyorum (be-fb/se-fb): kiracı çözen tüm yollarda (API anahtarı, portal token'ı) `deletedAt` kontrolü ve canlı test.
- Bir kiracı bekleme süresindeyken sahibi de içeri giremiyor, "çalışma alanı yok" ekranını görüyor. Silme ürün özelliği olarak eklendiğinde, sahip için "silinmeyi geri al" ekranı gerekiyorsa bunun ayrı ve dar bir rota olması gerekir. Böyle bir rota jwt'nin genel kiracı bağını geri açmamalı. Bugün böyle bir ekran yok.
- `Tenant` tablosuna ileride RLS eklenirse, kapsam dışındaki bu JOIN tüm kullanıcıları kiracısız bırakır (fail-closed ama kesinti). `src/lib/auth.ts` yorumunda ve burada not edildi.

## 5. Açık sorular
- Kiracı silme ve geri alma bir ürün özelliği olacak mı? Olacaksa sahibe bekleme süresinde hangi ekran gösterilecek? (Ürün kararı.)
- API anahtarı ve portal yollarındaki `deletedAt` boşluğu için kart açılsın mı? (Önerim: evet, §4.)

## 6. Sonraki adım
- Kapılar yeşil. Dal dev'e merge edildi, push yapılmadı (bkz. commit listesi). İnceleme ya da push kararı liderde.
- İNCELEME-81 Ö-5 (bağlantı reddinde boş hata sebebi) bu kartın kapsamında değildi, açık duruyor.
