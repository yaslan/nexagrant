# TASK-MUO4GO5ARDY2W — bağımsız inceleme: silinmiş kiracının oturumsuz yolları (İNCELEME-86 Y-1)

**Karar:** ONAY. Bloke eden bulgu yok. · **Ajan:** crw2-gnd (Kod İnceleme) · **Tarih:** 30.09.2026
**İncelenen:** `f76a64b9` (be-fb), dev `c214f02d` üzerinde. Kart bana geldiğinde düzeltme be-fb tarafından yazılmış ve dev'e merge edilmişti (`ce52d32c`); işi yeniden yazmadım, bağımsız doğruladım ve bir test boşluğunu kapattım.
**Ortam:** Kendi izole Postgres'im `crw2gnd-o4go-pg` (pgvector:pg16, 127.0.0.1:5491), CI sırasıyla hazırlandı (`db push` → `db:rls-role` → `apply-migrations.sh` ×2, "40 files applied" ×2 → `db:rls` 0→112 → `db:seed`). Paylaşılan `fabrika` :5433'e bağlanılmadı. Ayrı worktree, dal `crw2-gnd/muo4go-review`.
**Platform:** Doğrulama macOS'ta (Darwin 27.0.0). Değişiklik yalnız test dosyasında (TypeScript + SQL koşulu); Windows/Linux burada koşulamadı, CI (ubuntu) aynı dosyayı tam vitest içinde koşar.

## 1. Ne yapıldı
1. be-fb'nin diff'i satır satır okundu (`api-auth.ts`, `tenant-liveness.ts`, portal sayfası, `m11/actions.ts`, üç cron job'u).
2. P1 ve portal okuması **gerçek HTTP sunucusu** üzerinden tekrarlandı (`next dev`, DB rolü `fabrika_app`). be-fb'nin testleri fonksiyonları süreç içinde çağırıyordu; middleware dahil gerçek istek yolu ilk kez burada ölçüldü.
3. be-fb'ninkilerden farklı 7 mutant koşuldu. İkisi yaşadı (ileri tarihli `deletedAt`, portal ve cron süzgeci) → canlı teste 3 iddia eklendi, ikisi artık kırmızı.
4. Oturumsuz yol taraması bağımsız olarak yeniden yapıldı (`withSystemScope` çağrılarının tamamı, oturum yardımcısı içermeyen 13 API rotası, oturumsuz 2 server-action dosyası, token desenleri).

## 2. Kanıt

### A. Gerçek HTTP (`ekler/http-probe-out.txt`, betik `ekler/http-probe.sh.txt`)
```
A) canlı kiracı
  GET /api/v1/opportunities -> 200 · gizli başlık gövdede: 1
  GET /api/v1/calls -> 200 · GET /api/v1/partners -> 200
  GET /en/portal/partner/<token> -> 200 · fırsat başlığı HTML'de: 1
B) deletedAt = now()
  GET /api/v1/opportunities -> 401 · gizli başlık gövdede: 0 · code=AUTH_INVALID_API_KEY
  GET /api/v1/calls -> 401 · GET /api/v1/partners -> 401 (aynı kod)
  GET /en/portal/partner/<token> -> 404 · fırsat başlığı HTML'de: 0
C) deletedAt = NULL (geri alındı)
  GET /api/v1/opportunities -> 200 · gizli başlık gövdede: 1
  GET /api/v1/calls -> 200 · GET /api/v1/partners -> 200
  GET /en/portal/partner/<token> -> 200 · fırsat başlığı HTML'de: 1
```
P2 (portal yazması) bir server action olduğu için HTTP'den değil canlı testten doğrulandı: silinmişken `{success:false}`, bütçe satırı 0; geri alınınca 1 satır.

### B. Mutantlar (`ekler/mutants.py.txt`, `…-before-out.txt`, `…-wide-out.txt`, `…-after-out.txt`)
| Mutant | Önce | Test eklemesinden sonra |
|---|---|---|
| R1 api-auth: `EXISTS` kiracı kimliğine bağlı değil (herhangi bir canlı kiracı yeter) | 1 kırmızı ✅ | 1 kırmızı ✅ |
| R2 `isTenantLive`: ileri tarihli `deletedAt` canlı sayılıyor | **yaşıyor** | 2 kırmızı ✅ |
| R3 `keepLiveTenantRows`: ileri tarihli `deletedAt` canlı sayılıyor | **yaşıyor** | 1 kırmızı ✅ |
| R4 credits job'u `GRANTABLE_TENANTS_QUERY` yerine süzgeçsiz sorgu kullanıyor | **yaşıyor** | **yaşıyor** (Ö-1) |
| R5 alerts-daily job'u `alertEnabledSearches` yerine süzgeçsiz okuyor | **yaşıyor** | **yaşıyor** (Ö-1) |
| R6 `isTenantLive`: bulunamayan kiracı canlı sayılıyor | yaşıyor | yaşıyor (ulaşılamaz: FK var, eşdeğer) |
| R7 silinmiş kiracının anahtarı reddedilirken `lastUsedAt` yazılıyor | 1 kırmızı ✅ | 1 kırmızı ✅ |

R2–R5 ayrıca ilgili 8 test dosyası/klasörüyle birlikte koşuldu (116 test): orada da yaşıyorlar, yani başka bir test de yakalamıyor. Mutant koşularından sonra `git status src` boş.

### C. Kapılar (eklemeden sonra, izole DB, `CI=true`)
```
vitest: tests/deleted-tenant-sessionless.live.test.ts + tests/teardown-where-guard.test.ts → Test Files 2 passed · Tests 11 passed
eslint (değişen dosya) exit=0 · tsc --noEmit exit=0
sızıntı: Tenant içinde dts-% / rv-o4go% sayımı = 0
```
Tam `vitest run` ve `build` tekrar koşulmadı: yalnız bir test dosyasına iddia eklendi, `src/` değişmedi. be-fb'nin tam koşusu (3558/0, build 0) ve dev'in sonraki koşusu (`ba83d361`: 3661/0) geçerli.

## 3. Bulgular (önem sırasıyla)

**Bloke eden: yok.** Üretim kodunda hata bulmadım.

### Ö-1 (öneri, test boşluğu): cron job'larının süzgeci kullandığı ölçülmüyor
`credits-monthly-grant.ts:169`, `alerts-daily.ts:309`, `m4-weekly-summary.ts:93`. Testler dışa aktarılan yardımcıyı (`GRANTABLE_TENANTS_QUERY`, `alertEnabledSearches`, `dueRelationshipActions`) doğrudan çağırıyor, job'un kendisini değil. Senaryo: biri job gövdesinde yardımcıyı eski süzgeçsiz sorguyla değiştirirse (R4, R5) silinmiş kiracı yeniden kredi ve e-posta alır, bütün testler yeşil kalır. Düzeltme: üç job için görevi bir kez çalıştırıp çıktıda silinmiş kiracının olmadığını ölçen birer canlı test. Etki düşük (defter satırı / e-posta, veri açılmıyor); ayrı karta uygun.

### Ö-2 (düzeltildi): "ileri tarihli `deletedAt` = silinmiş" kuralı yalnız API yolunda sabitti
Rapor kuralı bütün yollar için söylüyor ama yalnız M3 (API) ölçüyordu; portal ve cron süzgecinde R2/R3 yaşıyordu. `tests/deleted-tenant-sessionless.live.test.ts` içine üç iddia eklendi (portal yazma, portal sayfa + metadata, alerts/m4 fan-out). Üretim kodu zaten doğruydu.

### Ö-3 (bilgi): portal yazmasında kontrol ile yazma ayrı işlemlerde
`src/modules/m11/server/actions.ts:606` canlılığı keşif işleminde okuyor, bütçe satırını sonraki `withTenant` işleminde yazıyor. Kiracı tam bu iki işlem arasında silinirse tek bir satır yazılabilir. Pencere milisaniyeler, silme bugün yalnız operatör işi; değişiklik istemiyorum.

### Ö-4 (bilgi): be-fb'nin tarama tablosunda eksik bir satır — kod doğru
Ajans davet kodu (`redeem_agency_invite`, kayıt sırasında oturumsuz) tabloda yok. Kontrol ettim: `prisma/migrations/agency-invite-no-max-uses.sql:83` `a."deletedAt" IS NULL` şartını taşıyor, silinmiş ajansın kodu `agency_inactive` dönüyor. Düzeltme gerekmiyor.

### Tarama sonucu
be-fb'nin tablosu ve kasıtlı istisna listesi (Stripe/iyzico webhook'ları, `alerts-sweep`, saklama/silme job'ları, platform yöneticisi ekranları) doğrulandı. Ek olarak baktıklarım: `cordis/*` ve `csp-report` rotaları kiracısız (ortak veri / yalnız log); `user/*` ve `gdpr/*` rotaları oturumu action içinde doğruluyor; `fon-hazirlik` kiracısız; S3 imzalı bağlantıları oturumlu rotadan üretiliyor ve 300 sn yaşıyor. Kapatılmamış oturumsuz kiracı yolu bulmadım.

## 4. Değişen dosyalar
- `tests/deleted-tenant-sessionless.live.test.ts`: ileri tarihli `deletedAt` için 3 iddia (+13 satır).
- `docs/agent-results/TASK-MUO4GO5ARDY2W-crw2-gnd.md` ve `…-crw2-gnd-ekler/` (6 dosya). Sır taraması (`[0-9a-f]{64}|sk-…|fp_live_rv_…`) boş.
- `src/` değişmedi.

## 5. Riskler
- HTTP probu `next dev` ile yapıldı, üretim derlemesiyle (`next start`) değil. Kod yolu aynı.
- `/api/v1/partners/[pic]` HTTP'den ayrıca çağrılmadı; aynı `authenticateApiKey`'i kullandığı grep ile doğrulandı (`route.ts:140`).

## 6. Açık sorular
- Ö-1 için ayrı kart açılsın mı? Önerim evet, be-fb'ye.

## 7. Sonraki adım
- Dal dev'e merge edildi, push yapılmadı; push kararı liderde.
