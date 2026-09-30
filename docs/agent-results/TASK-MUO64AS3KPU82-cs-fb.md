# TASK-MUO64AS3KPU82 — FB İNCELEME-87: silinmiş kiracı oturumsuz yollar (TASK-MUO4GO5ARDY2W) saldırgan incelemesi

**Durum:** TAMAM · **Ajan:** cs-fb · **Tarih:** 30.09.2026
**İncelenen:** `f76a64b9` (dev merge `ce52d32c`). Kod değiştirilmedi.
**Ortam:** Kendi worktree'm (`scratchpad/wt87`, detached `ce52d32c`) ve kendi izole Postgres'im `csfb-87-pg` (pgvector:pg16, 127.0.0.1:5587). Hazırlık CI sırasıyla yapıldı: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 ("40 files applied" ×2) → `db:rls` → `db:seed`. URL'ler env'den verildi, `.env` yazılmadı. Paylaşılan `fabrika` :5433'e bağlanılmadı.
**Devam notu:** 17:05'teki ağ kesintisinden önceki koşumdan iskelet ya da worktree kalmamıştı. `ce52d32c` üzerindeki `a491ece2…/wt` worktree'si be-fb'ye ait (mutant çıktısı onun `ekler/mutants-out.txt` dosyasıyla birebir aynı, `cmp` ile doğrulandı). O worktree'ye dokunmadım, iş sıfırdan yapıldı.

## Karar: **ONAY, push'a engel yok.**
Düzeltme saldırgan denemelerin hepsinde doğru çalışıyor: API'nin 4 rotası ve 2 başlık biçimi, portal okuma ve yazma, cron fan-out'ları, geri alma. Bloklayıcı bulgu yok. Aşağıda, engel olmayan 3 gözlem var (Ö-1…Ö-3). Ö-1 için takip kartı öneriyorum.

## 1. Ne yapıldı
1. Diff satır satır okundu (`api-auth.ts`, `tenant-liveness.ts`, m11 action, portal sayfası, 3 cron görevi).
2. be-fb'nin tablosunun dışında kalan oturumsuz yollar tarandı. Bunun için tüm `route.ts` dosyaları auth çağrısı açısından, token ve imzalı URL kullanan dosyalar ve bütün cron görevleri tek tek incelendi (§3).
3. Kendi canlı saldırı testimi yazdım (`ekler/attack.live.test.ts.txt`, 6 test, `fabrika_app` NOBYPASSRLS altında). Test repoya eklenmedi.
4. Kendi mutantlarımı koştum (W1–W5, `ekler/mutants.py.txt`). Bunlar be-fb'nin M1–M11'inin dokunmadığı yerleri hedefliyor: çağrı yerlerindeki bağlantıyı ve portaldaki ileri tarihli silmeyi.
5. Tam kapılar koşuldu: vitest, live-skip, tsc, lint, i18n, build.

## 2. Kanıt

### A. Saldırı denemeleri (`ekler/probe.log`, test çıktısı `Tests 6 passed (6)`, be-fb testiyle birlikte `11 passed (11)`)
```
[cs87 A1]
x-api-key opportunities: live=200 deleted=401 restored=200
x-api-key calls: live=200 deleted=401 restored=200
x-api-key partners: live=200 deleted=401 restored=200
x-api-key partners/[pic]: live=404 deleted=401 restored=404
Bearer opportunities: live=200 deleted=401 restored=200
Bearer calls: live=200 deleted=401 restored=200
Bearer partners: live=200 deleted=401 restored=200
Bearer partners/[pic]: live=404 deleted=401 restored=404
[cs87 A2] 130 calls → statuses 401; count 0→0
[cs87 A3] orphan key survives purge: true; status 401
[cs87 A4] deleted between auth and read → status 200, secret in body: true
[cs87 P1] write={"success":false} fake={"success":false} page=notFound metaTitle=title — Partner Portal
[cs87 P2] deleted mid-action → result {"success":true,"requestedTotal":6875}, budget lines in deleted tenant: 1
```
| # | Deneme | Sonuç |
|---|---|---|
| A1 | Silinmiş kiracının anahtarı, `/api/v1`'in **4 rotası** × `x-api-key` ve `Authorization: Bearer` | Hepsi 401. Gövde, **bilinmeyen bir anahtarın 401 gövdesiyle bayt bayt aynı**, yani silinmiş kiracı dışarıdan ayırt edilemiyor. Geri alınınca her rota eski durumuna dönüyor (`[pic]`'in 404'ü, fikstürde olmayan bir PIC yüzünden; önemli olan auth'u geçmesi). be-fb'nin testi yalnız `opportunities` GET'ini deniyordu. |
| — | API **yazma** | `/api/v1` altındaki 4 rota da yalnız `GET` dışa aktarıyor (koddan). Yazma ucu yok, Next.js diğer yöntemlere 405 döner. |
| A2 | Silinmiş anahtarla 130 istek (dakika limiti 120'nin üstü) | Hepsi 401, hiç 429 yok. `rateWindowCount` 0→0 ve `lastUsedAt` değişmiyor. Yani silinmiş anahtarla sayaç şişirilemiyor. |
| A3 | Kiracı satırı fiziksel olarak silinmiş (FK yok, `ApiKey` öksüz kalıyor) | 401 (`EXISTS` boş dönüyor). |
| A4 | Silme, auth'tan **sonra** ve okumadan **önce** geliyor (süren istek) | O istek 200 döner ve veriyi okur. **Bir sonraki istek 401.** Pencere, aynı isteğin iki sorgusu arası kadar (milisaniye). Bkz. Ö-2. |
| P1 | Portal: silinmiş kiracının linkiyle rastgele bir token karşılaştırması (ileri tarihli `deletedAt` ile) | Yazma sonucu `{success:false}`, rastgele token'la aynı. Sayfa `notFound`. Metadata, konum-bağımsız alanlarda rastgele token'ınkiyle aynı: `title — Partner Portal`, proje başlığı sızmıyor. |
| P2 | Portal: silme, keşif işleminden **sonra** ve yazmadan **önce** geliyor | **Yazma, silinmiş kiracıya iniyor** (`success:true`, 1 bütçe satırı). Sonraki çağrı `{success:false}`. Bkz. Ö-2. |
| — | Geri alma | A1'de 8/8 ve be-fb'nin 5 testinde erişim geri dönüyor. |

### B. Mutantlar (`ekler/mutants-out.txt`)
Taban (tam takım, saldırı dosyası olmadan): `Tests 3587 passed | 36 skipped (3623)`.
| Mutant | Tam takım | Saldırı testim |
|---|---|---|
| W1 `credits-monthly-grant` görevi `GRANTABLE_TENANTS_QUERY` yerine `{ select: { id: true } }` kullanıyor | **hayatta** (3587 passed) | kapsam dışı |
| W2 `alerts-daily` görevi `alertEnabledSearches` yerine eski doğrudan `findMany` kullanıyor | **hayatta** | kapsam dışı |
| W3 `m4-weekly` görevi `dueRelationshipActions` yerine süzgeçsiz `findMany` kullanıyor | **hayatta** | kapsam dışı |
| W4 `isTenantLive`: ileri tarihli `deletedAt` canlı sayılıyor | **hayatta** | **öldü** (P1) |
| W5 `isTenantLive`: kiracı satırı yoksa canlı sayılıyor | hayatta | hayatta |

Kodu okudum: üç görevin çağrı yeri de doğru bağlanmış. Ama bağlantıyı koruyan bir test yok (Ö-1). Mutant koşusundan sonra `git status` yalnız `?? tests/zz-cs87-attack.live.test.ts` gösterdi: kaynak geri yüklendi.

### C. Kapılar (`ekler/gates.txt`, izole DB, `CI=true`, `AUTH_SECRET` CI fikstürü, saldırı dosyası dışarıda)
```
vitest exit=0 · live-skip exit=0 · tsc exit=0 · lint exit=0 · i18n exit=0 · build exit=0
Test Files  293 passed | 2 skipped (295)
Tests  3587 passed | 36 skipped (3623)
live-skip gate: 44 live files, 385 live tests passed, 28 allowed skip(s)
```
(be-fb'nin 3558 sayısından fazla, çünkü `ce52d32c` DOCX merge'ünün testlerini de içeriyor.) Sızıntı kontrolü: koşulardan sonra `cs87-%`/`dts-%` kiracı ve anahtar sayısı `0|0`.

## 3. Tablo dışı oturumsuz yolların taraması
| Yol | Bulgu |
|---|---|
| `requireTenantApi`/`auth()` içermeyen rotalar (`gdpr/*`, `user/*`, `dashboard/api/export-csv`) | Hepsi oturum doğrulayan action'lara devrediyor (`Unauthorized` → 401). jwt callback'i her çağrıda `tenant: { deletedAt: null }` ile üyeliği yeniden okuyor (`src/lib/auth.ts:714-729`). |
| `cordis/*`, `calls/topic/[id]`, `csp-report`, `auth/hata` | Kiracıya bağlı veri yok. |
| İmzalı indirme URL'si (`evidence/[id]/download`) | Yalnız oturumlu üyeye veriliyor, 300 sn geçerli. Silme anında verilmiş bir URL en çok 5 dk çalışır (Ö-2 sınıfı). |
| İmzalı yükleme URL'si (`getPresignedUploadUrl`, 900 sn) | Silmeden önce verilmiş bir URL staging nesnesi yazabilir, ama kayıt oluşturan `confirm` adımı oturumlu, bu yüzden silinmiş kiracıda kayda geçmez. |
| Dışa aktarım ve davet linkleri | Token'lı dışa aktarım yok (be-fb'nin grep'i doğru). Davet: `accept.ts:85` `tenant.deletedAt` → `revoked`. |
| `mock-upload` | Prod'da ve object store varken kapalı, ayrıca `requireTenantApi`. |
| Webhook'lar (Stripe/iyzico) | `deletedAt`'e hiç dokunmuyorlar (grep boş), yani silinmiş kiracıyı geri açamıyorlar. Silmeden önce başlamış bir checkout'un kredisi kayda geçer; bu, defter tutarlılığı için doğru. **Kasıtlı istisna gerekli, katılıyorum.** |
| Cron'lar | `k1-topic-match`, `k1-embeddings`, `m4-stale`, ajans raporu: `deletedAt: null` (koddan doğrulandı). `alerts-sweep` ve saklama/silme job'ları istisna. **Gerekçeye katılıyorum.** |

## 4. Gözlemler (engel değil)
- **Ö-1 (test boşluğu, takip kartı öneriyorum):** W1–W3. Üç cron görevinin çağrı yeri eski süzgeçsiz sorguya döndürülse hiçbir test kırmızı olmaz. Canlı test yalnız dışa aktarılan yardımcıları çağırıyor. Öneri: görevin `run` gövdesini (ya da çıkarılmış tek bir `fetch…` fonksiyonunu) canlı testte çağırmak, ya da çağrı yerini sabitleyen bir bekçi testi eklemek. Ayrıca W4: portal için ileri tarihli `deletedAt` senaryosu testte yok. be-fb'nin M3'ü bunu yalnız API için sabitliyor.
- **Ö-2 (TOCTOU penceresi, düşük):** A4 ve P2. Kontrol ile okuma/yazma ayrı işlemlerde yapılıyor. Silme anında süren tek bir istek tamamlanabiliyor. Portalda bu, silinmiş kiracıya bir bütçe satırı yazılması demek. Etki: gizlilik ihlali yok (partner o an zaten yetkiliydi), veri silinme bekleyen kiracıya gidiyor ve purge ya da geri almayla birlikte işleniyor. Kapatmak istenirse `savePartContent`'in `UPDATE`'ine API'deki gibi `EXISTS … deletedAt IS NULL` eklenebilir. Mevcut pilot kapısı (`assertTenantWritable`) da aynı pencereye sahip, yani bu yeni bir sınıf değil.
- **Ö-3 (bilgi):** W5 ve A3. `ApiKey` ve `ApplicationPart`'ın `Tenant`'a FK'sı yok, kiracı satırı fiziksel olarak silinse öksüz satırlar kalır. API bunu doğru kapatıyor (A3: 401), `isTenantLive` de `null` → kapalı. Ama W5'i hiçbir test öldürmüyor. Bugün kiracı satırını silen bir purge job'ı yok. Eklenirse bu iki tabloyu da silmeli.

## 5. Değişen dosyalar
- `docs/agent-results/TASK-MUO64AS3KPU82-cs-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUO64AS3KPU82-cs-fb-ekler/`: `probe.log`, `attack.live.test.ts.txt`, `mutants.py.txt`, `mutants-out.txt`, `gates.txt`. Sır taraması (`[0-9a-f]{64}|sk-…{40,}|AUTH_SECRET=`) boş çıktı. Scratchpad yolları `<scratchpad>` ile maskelendi.
- Kaynak kod değişmedi.

## 6. Riskler
- Denemeler, rota ve action fonksiyonlarının süreç içinde çağrılmasıyla yapıldı. Gerçek HTTP sunucusu ve middleware kullanılmadı (be-fb ve İNC-86 ile aynı sınır). A4/P2 penceresi, mock kancasıyla yapay olarak açıldı. Gerçekte bu pencere milisaniye düzeyinde.

## 7. Açık sorular
- Ö-2 kapatılsın mı, yoksa "silme anında süren istek tamamlanır" kabul edilmiş davranış olarak mı belgelensin? (Lider kararı.)

## 8. Sonraki adım
- Lider: push onayı verilebilir. Ö-1 için test kartı (W1–W4 mutantlarını öldüren bir canlı test) önerilir.

**Platform:** Doğrulama macOS'ta (Darwin 27.0.0) yapıldı. İncelenen değişiklik yalnız SQL/Prisma koşullarından ve TypeScript'ten oluşuyor. Süreç, dosya yolu, kabuk ya da ekran koduna dokunmuyor, bu yüzden Windows ve Linux'ta aynı SQL üretilir ve aynı davranış beklenir. CI (ubuntu-latest) canlı testi tam vitest içinde koşuyor. Windows ve Linux burada koşulamadı, çünkü bu makinede yalnız macOS var.
