# TASK-MUNTTZ94LJWBC — fe-fb — Kanıt: misafir erişimi (Y-1), confirm sonrası PUT (D-1), çift confirm (D-3), dev rota testleri (D-4)

**Durum:** TAMAM
**Dal:** `fe-fb/muntt-evidence-guest`. Kod commit'i `2efa909f`, taban dev `45c07fc1`. Worktree: `/Users/macbook/alan/FONBRIDGE-wt-fefb-muntt`. dev'e merge edildi, push yapılmadı.
**Platform beyanı:** Doğrulama mac'te yapıldı: Darwin 27, Node 22, vitest 4.1.11, Chrome (Playwright `channel:'chrome'`), `pgvector/pgvector:pg16` ve `bitnamilegacy/minio` konteynerleri. Değişen kodda platforma bağlı bir yol var: `promoteIncomingObject`'in dev dalı `fs.rename`. Aynı dosya sisteminde bu Linux ve Windows'ta da atomik taşıma yapar. `devObjectPath` değişmedi ve yolu `/` ile kuruyor. Windows'ta Node bunu kabul eder, ama Windows'ta koşulmadı (bu makinede yalnız mac var). Production yolu S3 `CopyObject` + `DeleteObject` ve platformdan bağımsız. CI (ubuntu) MinIO suite'ini atlıyor, çünkü job'da S3 servisi yok. Yeni dev deposu suite'i (`evidence-dev-store.live`) ve prod kapısı testi CI'da koşar; ikisi de S3 istemiyor.

## 1. Ne yapıldı

**Y-1: kim okur (liste, indirme, sağlık skoru)**. Kural tek yerde: `src/lib/evidence-access.ts`.
- Kanıt okumak `view_proposal` ister. GUEST_PARTNER'da bu izin yok:
  - indirme → **403** (`FORBIDDEN_ROLE`, `no-store`); uydurma id de 403 döner, yani id yoklaması yapılamıyor,
  - `getEvidenceItemsAction` → `ForbiddenRoleError`,
  - sayfa listesi boş gelir, DB sorgusu hiç atılmaz,
  - sağlık skoru 0 belgeyle hesaplanır.
- Gizlilik **allow-list** ile uygulanıyor. Açık seviyeler `PUBLIC`, `CONSORTIUM` ve `INTERNAL`. Başka her değer gizli sayılır ve ayrıca `edit_proposal` ister: `CONFIDENTIAL`, `RESTRICTED`, küçük harfli yazım, bilinmeyen değer. Kartın varsayılanı buydu (§5-S1).
  - MEMBER açık seviyeleri görür ve indirir. Gizli satırlar listesinde yok, indirmesi 403.
  - WRITER ve üstü hepsini görür.
  - Enum dışı bir rol (eskimiş jeton) hiçbir şey okuyamaz.
- `loadEvidenceItems(tenantId, role, client)` artık rol alıyor; `page.tsx` rolü `requireTenantPage`'den geçiriyor.

**D-1: confirm sonrası nesne değiştirme**
- Presign ve `mock-upload` yalnız `<tenantId>/incoming/<rest>` biçiminde geçici anahtar verir ya da kabul eder.
- Confirm geçici nesneyi `<tenantId>/<rest>`'e kopyalar (`CopyObject`, dev'de `rename`), geçiciyi siler ve B-1 kontrollerini **kopya üzerinde** yapar.
- Satır final anahtarı kaydeder. Final anahtar hiçbir imzalı PUT'ta geçmez, bu yüzden confirm sonrası aynı URL'e yapılan PUT yalnız geçici nesneyi yeniden oluşturur.
- Confirm yalnız geçici anahtarı kabul eder. Final anahtar verilirse (kiracının kendisininki bile) `invalid_object_key` döner.

**D-3: çift confirm**
- Şemaya `@@unique([tenantId, r2ObjectKey])` eklendi. Migration: `prisma/migrations/evidence-unique-object-key.sql` (+ `.down.sql`, `apply-order.txt`).
- Confirm artık önce satırı ekliyor, kopyayı sonra yapıyor. İkinci confirm P2002 ile kopyadan **önce** durur: `already_confirmed` döner ve yeniden PUT'la oluşmuş geçici nesne silinir. İki confirm aynı anda gelse de ikinci insert ilk transaction bitene kadar bekler.
- Ret yolları (`UploadRefused`) ve P2002, eski "DB offline" sahte-başarı fallback'inden önce yakalanıyor. Yakalanmasalar ret "başarı" olarak dönerdi.
- i18n'e `upload.error.already_confirmed` eklendi (tr/en).

**D-4: testler**
- `tests/evidence-dev-store.live.test.ts` (yeni, 8 test). Devop-fb'nin ekteki console.log suite'ini assert'li hale getirdim. Kapsadığı yollar:
  - `mock-upload` retleri: 401, MEMBER/GUEST 403, başka kiracı, anahtarsız, traversal, final anahtar 403, 415, 413 (beyan edilen ve chunked),
  - tam 25 MB'ın kabulü,
  - HTML baytının confirm'de reddi,
  - dev indirmesinin başlıkları,
  - dev deposunda D-1,
  - FormData bayt kontrolü (M18).
- `tests/evidence-mock-upload-gate.test.ts` (yeni, 3 test): production'da ve object store tanımlıyken 404 döner ve oturum okunmadan önce döner (M11).
- `tests/evidence-upload-s3.live.test.ts`: A1, A2, eşzamanlı çift confirm, index ve Y-1 (A6, MEMBER, eskimiş rol) eklendi. Mevcut testler geçici/final anahtar ayrımına uyarlandı.
- `evidence-object-key.live` ve `page-loader-tenant-scope` testleri yeni imzaya uyarlandı.
- `where-guard-src`'ye gerekçeli bir KNOWN kaydı eklendi: `id: created.id`, aynı transaction'da az önce oluşturulan satırın id'si.

## 2. Kanıt
Ekler `docs/agent-results/TASK-MUNTTZ94LJWBC-fe-fb-ekler/` altında.

**Kurulum (paylaşılan :5433'e yazılmadı):**
- İzole DB: `fefb-muntt-pg` (127.0.0.1:55481). CI sırasıyla hazırlandı: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 (40+40 dosya) → `db:rls` → `db:seed`.
- MinIO: `fefb-muntt-minio` (127.0.0.1:59481, private kova `fefb-muntt`).
- Fabrika DB'sinden yalnız **okuma** yapıldı: çift anahtar sayısı `0`, yani migration orada takılmaz.

**Kartın doğrulama maddeleri, gerçek MinIO (`evidence-suites-verbose.txt`):**
```
✓ A1: a PUT after confirm, same URL, type and length, leaves the recorded file as it was
      (MinIO PUT 200 → yalnız incoming/ yeniden oluşuyor; final nesne baytları = ilk PDF; indirme = ilk PDF;
       ikinci confirm → already_confirmed, geçici nesne silindi)
✓ A2: a second confirm of the same key writes no second row and keeps the file   (count=1)
✓ two confirms at the same time: one row, one success, the file stays
✓ the index itself refuses a second row with the same key                        (P2002)
✓ A6: GUEST_PARTNER cannot download, list or score any evidence, CONFIDENTIAL included (403 ×3, liste FORBIDDEN_ROLE, skor 0)
✓ MEMBER reads the open levels only; a confidential level in any spelling needs edit_proposal
✓ a role outside the enum (a stale token) reads nothing
Test Files  5 passed (5) · Tests  61 passed (61)
```

**Gerçek tarayıcı (kendi `next dev` :3481, izole DB, dev deposu, `browser-walk-2.txt`, kareler 01–05):**
Yüklemeler gerçek formla yapıldı: dosya seçildi ve "Yeni Belge Yükle" tıklandı. İkinci belge SQL ile CONFIDENTIAL işaretlendi, çünkü form yalnız INTERNAL gönderiyor.
```
A1 replay PUT (same URL, html bytes, len 38 ) -> 200
A1 alice download of the confirmed file after replay -> 200 | attachment; filename="kanit.pdf" | %PDF-1.4\n% fefb tarayici kaniti…
A1 PUT straight at the final key -> 403
alice (PIPELINE_MANAGER) list: 2 Kayıtlı Belge ; open 200 ; gizli 200
charlie (MEMBER) list: 1 Kayıtlı Belge | gizli title visible: 0 ; open 200 ; gizli 403
judy (GUEST_PARTNER) list: 0 Kayıtlı Belge ; open 403 ; gizli 403 ; made-up id 403
judy 390px overflow: false
```
DB'ye bakınca (yükleme sonrası): satırda final anahtar `demo-tenant/org-default/cat-03/2026/78da1409_kanit_pdf.pdf` kayıtlı, boyut 38, `application/pdf`. `.dev-objects`'te yalnız final dosya var, `incoming/` boş.

**Mutantlar** (`mutants-out.txt`, `mutants-out-y1b-rerun.txt`, `mutant-d3c-index.txt`, `mut.py`). Her mutant 5 kanıt suite'ine karşı koşuldu ve dosya bellekteki orijinalden geri yazıldı.
```
Y1a indirme gizlilik kontrolü yok        KILLED   D1a presign final anahtar verir       KILLED
Y1b indirme ön view_proposal kapısı yok  KILLED*  D1b confirm final anahtarı kabul eder KILLED
Y1c liste view_proposal istemez          KILLED   D1c mock-upload final anahtarı kabul  KILLED
Y1d liste seviye filtresi yok            KILLED   D1d geçici nesne silinmez             KILLED
Y1e allow-list yerine deny-list          KILLED   D1e kopya değil geçici doğrulanır     KILLED
Y1f gizli için view_proposal yeter       KILLED   D1f reddedilen kopya silinmez         KILLED
Y1g sayfa yükleyici filtre yok           KILLED   D3a P2002 → DB-offline sahte başarı   KILLED
Y1h sağlık skoru filtresiz               KILLED   D3b ikinci geçici nesne kalır         KILLED
D3c unique index DROP (DB'de)            KILLED (4 test)
M11 prod kapısı yok  KILLED · M13 rol yok KILLED · M14 sınır >= KILLED · M16 inline/sandbox yok KILLED · M18 FormData bayt yok KILLED
M12 mock-upload kiracı-anahtar kontrolü yok  SURVIVED → EŞDEĞER: finalKeyOfIncoming aynı kiracı önek kontrolünü yeniden yapıyor
```
*Y1b ilk koşuda sağ kaldı. Misafir ikinci kontrolde yine 403 alıyordu; fark yalnız uydurma id'de görünüyordu (404 yerine 403). "uydurma id 403" assert'i eklenince öldü.
Sonuç: 23 mutantın 22'si kırmızı, 1'i eşdeğer. İncelemenin sağ kalan 6 mutantından (M11–M14, M16, M18) 5'i artık kırmızı. M12 yeni koddaki çift kontrol yüzünden eşdeğer oldu.

**Migration (`migration-check.txt`)**:
- down ×2: `DROP INDEX` ve ikinci koşuda "does not exist, skipping".
- Çift kayıtlı veriyle ileri migration: `ERROR: evidence-unique-object-key: 1 object key(s) are recorded by more than one "Evidence" row…`, rc=3.
- Çift çözüldükten sonra rc=0. Tekrar koşuda da rc=0 ("already exists, skipping").

**Kapılar (`gates.txt`, `full-test-run*-summary.txt`)**
```
pnpm typecheck rc=0 · pnpm lint rc=0 · pnpm i18n:check ✅ both catalogs agree · pnpm build rc=0
  (ƒ /api/evidence/[id]/download · ƒ /api/evidence/mock-upload; "Ecmascript file had an error" satırı
   src/instrumentation.ts'teki önceden var olan process.exit edge uyarısı — dokunulmadı)
CI=true npx vitest run (izole DB + MinIO env, HEAD 2efa909f):
  Test Files 273 passed | 2 skipped (275) · Tests 3292 passed | 9 skipped (3301) · rc=0
```
Koşu 1'in tek kırmızısı `where-guard-src` idi: yeni `updateMany({ where: { id: created.id, tenantId } })`. Buna gerekçeli bir KNOWN kaydı eklendi (bkz. §1) ve koşu 2'de 0 hata çıktı.

## 3. Değişen dosyalar
- `src/lib/evidence-access.ts` (yeni)
- `src/lib/storage.ts`: `finalKeyOfIncoming`, `promoteIncomingObject`, presign `incoming/` anahtarı
- `src/app/[locale]/(app)/[workspace]/evidence/actions.ts`: confirm akışı, liste ve skor rol filtresi
- `src/app/[locale]/(app)/[workspace]/evidence/data.ts`, `page.tsx`
- `src/app/api/evidence/[id]/download/route.ts`, `src/app/api/evidence/mock-upload/route.ts`
- `prisma/schema.prisma`, `prisma/migrations/evidence-unique-object-key{,.down}.sql`, `prisma/migrations/apply-order.txt`
- `messages/tr.json`, `messages/en.json` (`upload.error.already_confirmed`)
- `tests/evidence-dev-store.live.test.ts` (yeni), `tests/evidence-mock-upload-gate.test.ts` (yeni), `tests/evidence-upload-s3.live.test.ts`, `tests/evidence-object-key.live.test.ts`, `tests/page-loader-tenant-scope.test.ts`, `tests/where-guard-src.test.ts`

## 4. Riskler
- **Deploy sırası:** migration, kodla aynı deploy'da `apply-migrations.sh`'ten geçmeli. Index yoksa D-3 korumasının DB yarısı yok (D3c mutantı). Sıralı çift confirm ise yine `object_missing` ile durur, çünkü geçici nesne ilk confirm'de taşınmıştır.
- **Prod'da çift anahtar varsa migration durur** ve bu bilerek yapıldı. Satır silme ya da birleştirme kararı insana bırakıldı. Fabrika DB'sinde çift sayısı 0.
- **Uçuşta olan yüklemeler:** deploy anında presign almış ama henüz confirm etmemiş bir kullanıcının anahtarı `incoming/` içermez, yani `invalid_object_key` alır. Dosyayı yeniden seçmesi gerekir; 15 dakikalık pencere.
- **Transaction içinde S3 çağrısı:** kopya, stat ve ranged GET satır kilidi altında yapılıyor. Kopya sunucu tarafında (R2 içi) olduğu için 25 MB'ta bile kısa sürmeli, ama Prisma interactive tx varsayılan zaman aşımı 5 sn. R2 yavaşlarsa confirm zaman aşımına düşer; o durumda hata DB-offline fallback'ine gider (bkz. §5-S3).
- **R2'de CopyObject** MinIO'da doğrulandı. R2 de S3 `CopyObject` destekliyor ama R2'de koşulmadı.
- **Yetim geçici nesneler:** confirm sonrası yeniden PUT ve ardından confirm edilmeyen yüklemeler `incoming/` altında kalır. Kovada `incoming/` için bir lifecycle kuralı (ör. 1 gün) önerilir.

## 5. Açık sorular (patron veya lider)
- **S1, gizlilik matrisi:** kartın varsayılanı uygulandı. Gizli seviye (CONFIDENTIAL, RESTRICTED, bilinmeyen) `edit_proposal` ister, yani WRITER, PIPELINE_MANAGER, TENANT_ADMIN ve TENANT_OWNER. MEMBER yalnız açık seviyeleri görür. Soru: RESTRICTED CONFIDENTIAL'dan daha dar mı olmalı (ör. yalnız TENANT_ADMIN+)? CONSORTIUM belgeleri GUEST_PARTNER'a açılmalı mı? Şu an misafir hiçbir kanıtı görmüyor. Karar gelirse değişiklik yalnız `evidence-access.ts`'te olur.
- **S2, misafir UX'i (ayrı küçük kart önerisi):** misafirin boş ekranı "Henüz hiçbir kurumsal kanıt belgesi yüklenmedi" diyor, bu yanlış bir beyan (kare 04). "Yeni Belge Yükle" düğmesi de misafire görünüyor; sunucu reddediyor. Önerim: rol okuyamıyorsa ayrı bir boş durum metni göstermek ve yükleme düğmesini `edit_proposal` yoksa gizlemek. Kapsam dışı tuttum.
- **S3:** `confirmEvidenceUploadAction` DB hatasında hâlâ uydurma bir `success:true` satırı döndürüyor. Bu eski davranış. CLAUDE.md §7 ile çelişiyor; ayrı kartta kaldırılmasını öneririm.

## 6. Sonraki adım
- İnceleme: D-1, D-3 ve Y-1 yollarının saldırgan gözüyle yeniden sınanması.
- S1 ve S2 kararlarının alınması.
- Deploy notu: migration + `incoming/` lifecycle kuralı.
- Temizlik yapıldı: `fefb-muntt-pg` ve `fefb-muntt-minio` konteynerleri kaldırıldı, kendi `next dev` sürecim (:3481) durduruldu. Worktree merge sonrası kaldırıldı.
