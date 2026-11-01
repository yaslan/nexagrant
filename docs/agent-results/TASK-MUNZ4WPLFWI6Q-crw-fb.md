# TASK-MUNZ4WPLFWI6Q — crw-fb — İNCELEME-77: kanıt erişimi rol bazlı + staging anahtar/CopyObject + unique (TASK-MUNTTZ94LJWBC)

**Durum:** TAMAM
**Karar:** DEĞİŞİKLİK İSTENİYOR. Bir bulgu bloke ediyor (B-1: yavaş depoda dosya kaybı ve sahte başarı). Y-1 (rol bazlı okuma) ve D-3 (unique + çift confirm) doğru çalışıyor. R2'de D-1 de doğru; D-1'in dev deposunda bir açığı var.
**İncelenen:** `2efa909f` (dev merge `5246a0f4`). Ayrı worktree'de, dev HEAD `e317f285` üzerinde. Kod değiştirilmedi. Mutantlar bellekten geri yazıldı, `git status src` temiz.
**Ortam:** izole Postgres `crwfb77-pg` (127.0.0.1:55477; CI sırası: db push → db:rls-role → apply-migrations ×2 → db:rls → db:seed) + MinIO `crwfb77-minio` (127.0.0.1:59477, private kova). Paylaşılan :5433'e yazılmadı. MinIO'nun önüne kendi hata enjekte eden HTTP proxy'mi koydum (:59478). Proxy isteği geciktirebiliyor, bağlantıyı kesebiliyor, "CopyObject'ten sonra depo öldü" durumunu kurabiliyor.
**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26.5, vitest 4.1.11, `pgvector/pgvector:pg16`, `bitnamilegacy/minio`). Linux ve Windows'ta koşulamadı, bu makinede yalnız mac var. Koddan çıkarımlar:
- Prod yolu (S3 `CopyObject`/`DeleteObject`) platformdan bağımsız. B-1 de öyle, çünkü Prisma interactive tx'in 5 sn varsayılanı her platformda aynı.
- Dev dalı `fs.rename`: Linux'ta mac'teki gibi atomik ve hedefin üzerine yazar. Windows'ta libuv `MoveFileExW(MOVEFILE_REPLACE_EXISTING)` kullanır, yani üzerine yazar. Ama kaynak ya da hedef açıksa (antivirüs taraması, eşzamanlı dev indirmesi) `EPERM`/`EBUSY` verir. Bu durumda `promoteIncomingObject` false döner, kullanıcı `object_missing` alır ve staging dosyası yerinde kalır, yeniden denenebilir.
- `devObjectPath`, `process.cwd()` ile `/`'yi karıştırıyor; Windows'ta Node bunu kabul eder.

## 1. Ne yapıldı
- 2efa909f diff'ini satır satır okudum: `evidence-access.ts`, `storage.ts`, `actions.ts`, `data.ts`, `page.tsx`, download/mock-upload rotaları, migration ve şema.
- Bütün kanıt okuma yollarını grep'ledim (`tx.evidence.*`, `include: evidence`, ham SQL). Rol filtresinden kaçan başka okuma yolu bulamadım. Okuma yolları: liste action, sayfa yükleyici, sağlık skoru, indirme ve concept-note editöründeki `EvidenceDrawer`. Drawer da liste action'ı kullanıyor.
- Kendi saldırı suite'imi yazdım: `zz-crwfb77-attack.live.test.ts` gerçek MinIO'ya karşı koşuyor, `zz-crwfb77-dev.live.test.ts` dev deposuna karşı. İkisi de repoya girmedi, eklerde duruyor.
- 8 mutant koştum (`mut77.py`).
- Migration'ı çift satırlı veriyle denedim (`mig.sh`).
- Tam `npx vitest run` + typecheck/lint/i18n/build.

## 2. Bulgular (önem sırasıyla)

### B-1 — YÜKSEK, BLOKE: depo yavaşsa confirm kullanıcının dosyasını siler ve `success:true` döner
**Yer:** `src/app/[locale]/(app)/[workspace]/evidence/actions.ts:156-230` + `src/lib/storage.ts` `promoteIncomingObject`.

Yeni akışta S3 çağrıları `withTenant` interactive transaction'ının **içinde**: `CopyObject`, staging `DELETE`, `HEAD`, ranged `GET`. Prisma'nın varsayılan tx zaman aşımı 5 sn ve `withTenantOn` bunu değiştirmiyor. Transaction bu sürede bitmezse şunlar olur:
1. `updateMany` P2028 atar ("expired transaction").
2. `catch` içinde `promoted` true olduğu için final kopya silinir. Staging nesnesi ise `promoteIncomingObject` içinde zaten silinmişti. Sonuç olarak dosya depoda **hiçbir yerde kalmaz**.
3. Hata ne `UploadRefused` ne P2002 olduğu için eski "DB offline" dalına düşer. O dal uydurma `ev-<ts>` id'siyle `success:true` döner. Satır yok.

Canlı kanıt (`attack-run1.txt`, proxy HEAD/GET'i 6 sn geciktiriyor):
```
Transaction API error: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms …
slow-after-copy (24071 ms) → success=true id=ev-1790765373540 rows=0 staging=false final=false
slow-copy pair → first={"success":true,"evidence":{"id":"ev-1790765379959",…} second={"success":false,"error":"object_missing"} rows=0 final=false
```
Kullanıcı "yüklendi" görüyor ama satır yok, dosya da yok.

**Bu bir gerileme.** 2efa909f öncesinde `statObject`/`storedEvidenceMatches` tx'in dışındaydı ve tx içinde yalnız `create` vardı. Yavaş bir depo yalnız yavaşlık yaratıyordu, dosya kaybolmuyordu. S3 SDK'nın 3 denemeli yeniden-deneme politikası da tetikleyiciyi yakınlaştırıyor: "depo öldü" denemesinde her istek 3 kez gitti. Bu yüzden 5 sn'yi aşmak için R2'de geçici bir 503 ya da throttle yetebilir.

Aynı yoldan ikinci bir etki daha var. Eşzamanlı ikinci confirm unique kilidinde 5 sn'den fazla beklerse o da P2028 alır ve sahte başarı döner.

**Öneri** (en küçük doğru değişiklik):
- (a) `promoteIncomingObject` staging'i **silmesin**. Staging, tx commit edildikten **sonra** silinsin. Böylece her hata yolunda kullanıcının yüklemesi staging'de kalır ve yeniden denenebilir.
- (b) Depo çağrıları tx dışına alınsın, ya da en azından `$transaction(..., { timeout })` açıkça verilsin. Önerdiğim sıra: kısa tx'te satırı ekle (bu unique rezervasyon olur) → commit → kopyala ve doğrula → ikinci kısa tx'te boyut/mime yaz. Hata olursa satırı ve kopyayı sil.
- (c) P2028 ve diğer beklenmeyen hatalar `success:true` dönmesin. Bu, fe-fb'nin S3 sorusu; bu değişiklikle aciliyeti arttı.
- Regresyon testi: benim proxy suite'imdeki "slow-after-copy" durumu. Beklenen: `success:false`, staging duruyor ve yeniden deneme başarılı.

### D-1 — DÜŞÜK (yalnız dev deposu): iç içe `incoming/` ile D-1 atlatılıyor
**Yer:** `src/lib/storage.ts` `finalKeyOfIncoming`.

`<t>/incoming/incoming/x.pdf` geçerli bir staging anahtarı sayılıyor ve final anahtarı `<t>/incoming/x.pdf` oluyor, yani yine bir staging anahtarı. Dev deposunda `mock-upload` herhangi bir staging anahtarını kabul ettiği için (`dev-nested.txt`):
```
PUT nested staging → 200
confirm nested → {"success":true,…}
row key = A/incoming/org-default/certificate/2026/deadbeef_n_pdf.pdf
PUT to recorded key (after confirm) → 200
download after replace → 200 "<html><script>alert("
confirm recorded key → {"success":false,"error":"unsupported_type"}
row-1 download after move → 404        (ikinci confirm kayıtlı dosyayı taşıyıp sildi)
```
R2'de bu yol açık değil. Staging anahtarını yalnız presign üretiyor, o da 3. segmenti `org-default` olarak sabitliyor. Canlıda `A/incoming/incoming/x.pdf` → `object_missing` döndü.

**Öneri:** `finalKeyOfIncoming` `segments[2] === 'incoming'` olan anahtarı reddetsin, ya da 3. segmenti `org-default` olarak beklesin. K20 ters mutantı bu düzeltmenin 61 testin hiçbirini kırmadığını gösteriyor.

### D-2 — DÜŞÜK (test boşluğu): `page.tsx` rolü geçirmezse hiçbir test kırmızı olmuyor
Mutant **K13** SAĞ KALDI. `loadEvidenceItems(tenantId, role)` → `loadEvidenceItems(tenantId, 'TENANT_OWNER')` değişikliğinde 61/61 yeşil. Oysa ana liste yüzeyi bu sayfa ve misafir yine bütün kanıtları, CONFIDENTIAL dahil, görürdü. `page-loader-tenant-scope` yükleyiciyi doğrudan çağırıyor, `page.tsx`'in rolü geçirdiğini sınamıyor. fe-fb'nin tarayıcı gezisi bunu bir kez gördü ama otomatik bekçi yok.

**Öneri:** `requireTenantPage` mock'lu küçük bir birim testi, ya da `page.tsx` kaynağında `loadEvidenceItems(tenantId, role)` çağrısını arayan statik bir bekçi.

Aynı sınıftan bir mutant daha: **K8** (seviyeyi büyük/küçük harf duyarsız karşılaştırmak, yani `internal` → açık) SAĞ KALDI. `evidence-access.ts` "küçük harfli yazım gizli sayılır" diyor, ama testte küçük harfli *açık* bir seviye yok. Düşük: WRITER dışında kimse seviye yazamıyor.

### D-3 — BİLGİ: depo CopyObject'ten hemen sonra ölürse final nesne yetim kalıyor
`die-after-copy → object_missing rows=0 staging=true final=true`. Staging `DELETE`'i ve temizlik `DELETE`'i başarısız oldu. Staging yerinde kaldığı için yeniden deneme başarılı oldu (`retry → success:true`) ve kopya üzerine yazıldı. Veri kaybı yok. Yeniden deneme yapılmazsa final altında satırsız bir nesne kalır. `incoming/` için önerilen lifecycle kuralı bunu kapsamaz.

### D-4 — BİLGİ: MEMBER gizli bir id'nin varlığını ayırt edebiliyor
Gizli id → 403, uydurma id → 404 (`MEMBER probe`). id'ler cuid, tahmin edilemez. İstenirse okunamayan gizli satır için de 404 dönülebilir.

### D-5 — BİLGİ (UX, fe-fb S2 ile aynı aile)
Concept-note editöründeki `EvidenceDrawer` misafirde `ForbiddenRoleError` alıyor ve "yükleme başarısız" durumu gösteriyor. "Erişiminiz yok" durumu yok.

## 3. Kanıt — kartın denemeleri
Ekler: `docs/agent-results/TASK-MUNZ4WPLFWI6Q-crw-fb-ekler/`.

**Rol × seviye × liste/sayfa/skor/indirme, canlı MinIO** (`attack-run1.txt`). Her seviyeden bir satır var, toplam 8; `empty` satırı confirm'de `INTERNAL`'a düşüyor. İndirmede 302 = presigned yönlendirme.
```
role             | list | page | score | PUBLIC | CONSOR | INTERN | CONFID | RESTRI | confid | Intern | empty
TENANT_OWNER     | 8    | 8    | 8     | 302    | 302    | 302    | 302    | 302    | 302    | 302    | 302
TENANT_ADMIN     | 8    | 8    | 8     | 302 … hepsi 302
PIPELINE_MANAGER | 8    | 8    | 8     | 302 … hepsi 302
WRITER           | 8    | 8    | 8     | 302 … hepsi 302
MEMBER           | 4    | 4    | 4     | 302    | 302    | 302    | 403    | 403    | 403    | 403    | 302
GUEST_PARTNER    | ForbiddenRol | 0 | 0 | 403 … hepsi 403
VIEWER_STALE     | ForbiddenRol | 0 | 0 | 403 … hepsi 403
```
Kiracı B sahibi, A'nın gizli id'si → 404. B misafiri → 403. Session'da rol yoksa `requireTenant*` MEMBER'a düşüyor (`tenant.ts:77`), bu da MEMBER satırıyla tutarlı.

**Confirm sonrası PUT:** aynı imzalı URL'e HTML baytı → 200, ama final nesne hâlâ `%PDF-`. Sonraki confirm `already_confirmed` döndü ve staging silindi. İmzadaki `/incoming/` çıkarılıp final anahtara PUT → **403** (imza bozuldu).
**Staging temizliği:** başarılı confirm sonrası staging `null`. Reddedilen confirm'de kopya ve staging silindi (mevcut suite). Çift confirm sonrası staging `null`.
**Başka kiracının staging anahtarıyla confirm:** `invalid_object_key`. Aynı `rest` ile kendi kiracı önekinde → `object_missing`, B'nin staging nesnesine dokunulmadı. `A/incoming/B/x.pdf` → `object_missing`. `/incoming/` içeren kayıtlı satır sayısı 0.
**Eşzamanlı confirm:** `5x confirm → ok,already_confirmed,already_confirmed,already_confirmed,already_confirmed`. 1 satır, final duruyor, staging yok.
**CopyObject yarıda / depo kapalı** (proxy):
```
down-before-copy → object_missing, satır 0, staging duruyor, depo dönünce yeniden deneme başarılı
die-after-copy   → object_missing, satır 0, staging=true final=true (D-3), yeniden deneme başarılı
slow-after-copy  → B-1 (dosya kaybı + sahte başarı)
```
**Çift satırlı veride migration** (`migration-check.txt`):
```
down #1 rc=0 · down #2 "does not exist, skipping" rc=0
aynı kiracıda aynı anahtar ×2 + iki kiracıda aynı anahtar + NULL ×2 →
  ERROR: evidence-unique-object-key: 1 object key(s) are recorded by more than one "Evidence" row of the same tenant … rc=3, index yok
  (çapraz kiracı ve NULL çiftleri sayılmadı, doğru)
başlıktaki gibi çözüm (kaybeden satırın anahtarı NULL) → up rc=0 · tekrar "already exists, skipping" rc=0
sonra aynı anahtarla insert → duplicate key value violates unique constraint "Evidence_tenantId_r2ObjectKey_key"
```
`apply-order.txt`'te son satır (52). Takılırsa sonraki dosyaları bloke etmiyor. Ama bundan sonra eklenecek her migration bu dosyanın arkasında kalır.

**Mutantlar** (`mutants.txt`), 5 kanıt suite'ine (61 test) karşı:
```
KILLED   K7  RESTRICTED açık seviyeye eklenir          (2 test)
SURVIVED K8  seviye büyük/küçük harf duyarsız           → D-2
KILLED   K9  kopya satırdan ÖNCE (D-3 sırası geri)      (3 test)
SURVIVED K13 page.tsx rolü yok sayar                    → D-2
KILLED   K18 liste action view_proposal kapısı yok      (1 test)
KILLED   K19 indirme confidentiality seçmez             (1 test)
SURVIVED K20 iç içe incoming reddi (ters mutant)        → D-1 düzeltmesi mevcut testleri kırmıyor
KILLED   K21 hata yolunda final kopya silinmez          (4 test)
git diff clean: True
```

**Kapılar** (`gates.txt`, `full-vitest-summary.txt`):
```
typecheck rc=0 · lint rc=0 · i18n ✅ both catalogs agree · build rc=0
  (ƒ /api/evidence/[id]/download · ƒ /api/evidence/mock-upload; "Ecmascript file had an error"
   satırı önceden var olan instrumentation uyarısı)
CI=true npx vitest run (izole DB + MinIO env):
  koşu 1: 280 passed | 1 failed | 2 skipped dosya · 3404 passed | 1 failed | 9 skipped
          kırmızı: src/lib/agency/report.test.ts 120 sn zaman aşımı; tek başına 3/3 yeşil (16/16)
  koşu 2: 3394 passed | 2 failed; kırmızılar agency/funnel.attack (30 sn zaman aşımı), agency/report,
          topic-match-nightly (hook'ta "Postgres is unreachable")
          → üçü birlikte tek başına: 3 dosya / 49 test yeşil
  makine load average 77 (paylaşılan makine); kırmızıların hiçbiri kanıt koduna dokunmuyor.
kanıt suite'leri (MinIO dahil, atlanan yok): 5 dosya / 61 test yeşil (suites-baseline.txt)
```
Gerçek tarayıcı gezisi yapmadım. fe-fb'nin gezisi (`browser-walk-2.txt`) UI tarafını kapsıyor. Saldırı denemelerim gerçek rota handler'ları ve server action'lar üzerinden, gerçek Postgres (RLS rolü) ve gerçek MinIO'ya karşı koşuldu.

## 4. Değişen dosyalar
Kod değişmedi. Yalnız bu rapor ve ekleri eklendi:
- `docs/agent-results/TASK-MUNZ4WPLFWI6Q-crw-fb.md`
- `docs/agent-results/TASK-MUNZ4WPLFWI6Q-crw-fb-ekler/`: saldırı suite'leri, mutant ve migration betikleri, koşu çıktıları. MinIO kimlik bilgileri maskelendi; kap zaten silindi.

## 5. Riskler
- B-1 prod'da R2 gecikmesi ya da geçici hatasıyla tetiklenir. Etkisi sessiz veri kaybı: kullanıcı başarı görür, dosya yoktur.
- fe-fb'nin deploy notları geçerli: migration aynı deploy'da çalışmalı, `incoming/` için lifecycle kuralı konmalı.

## 6. Açık sorular
- B-1 düzeltmesinde (b) seçeneğinin hangi biçimi seçilecek: iki kısa tx mi, tx timeout mu? Karar lider ya da fe-fb'nin. Ben iki kısa tx + staging'i commit sonrası silmeyi öneriyorum.
- fe-fb S1/S2 hâlâ açık (gizlilik matrisi, misafir UX'i).

## 7. Sonraki adım
fe-fb için düzeltme kartı: B-1 (bloke), D-1, D-2 testleri. Düzeltme sonrası yeniden inceleme: proxy suite'i (`zz-crwfb77-attack.live.test.ts`) aynen yeniden koşulabilir.
Temizlik: `crwfb77-pg` ve `crwfb77-minio` kapları kaldırıldı, worktree silindi.
