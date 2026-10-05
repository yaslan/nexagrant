# TASK-MUN80W2VFY56R — devop-fb — GÜVENLİK Y-4: kanıt nesne anahtarı kiracı öneki

**Durum: TAMAM** — kaynak: `docs/agent-results/TASK-MUN66T2HM4A4E-be-fb.md` Y-4 (§ bulgu tablosu satır 13, ayrıntı satır 130, öneri 4).
Commit'ler: `7a83e7d2` (düzeltme + testler), `d8971c42` (test teardown'ı repo koruma testine uyduruldu).

**Platform beyanı:** macOS (Darwin 27, arm64) üzerinde doğrulandı: vitest (Node 26), izole Postgres 16 (docker `fabrika-postgres`, DB `fb_devop_y4`), yerel depo `.dev-objects`, prod build ve Playwright Chromium.
Değişen kodun platforma bağlı kısmı yerel depo yolu: `devObjectPath` → `${process.cwd()}/.dev-objects/<key>`. Anahtar yalnız `[A-Za-z0-9_./-]` içerebildiği ve `/` ile bölündüğü için Windows'ta da `\` ya da sürücü harfi taşıyamaz. Node `fs` karışık ayraçlı yolu kabul eder, ama Windows'ta **koşulmadı** (bu makinede yok). Yerel depo yalnız üretim dışında çalışıyor. Üretimde R2 (S3 API) kullanılıyor ve orada platform farkı yok. Linux'ta **koşulmadı**; CI bu testleri Linux'ta koşacak (live test CI'da DB yoksa atlamaz, düşer).

## 1. Ne yapıldı
**Sorun:** `confirmEvidenceUploadAction` tarayıcıdan gelen `objectKey`'i doğrulamadan `Evidence.r2ObjectKey`'e yazıyordu. `deleteEvidence` de bu anahtarla depodan silme yapıyordu. Böylece A kiracısının bir üyesi, B'nin anahtarını kendi kaydına bağlayıp B'nin dosyasını silebiliyordu. Ek olarak `createEvidence` (FormData yolu) anahtarı ham `file.name` ile kuruyordu (`../` dahil) ve dosyayı hiç yüklemiyordu (300 ms bekleyip sahte URL dönüyordu).

**Düzeltme (`src/lib/storage.ts`, `evidence/actions.ts`, `evidence-client.tsx`):**
1. `tenantObjectKeyOf(tenantId, keyOrUrl)` tek doğrulama noktası. Anahtar yalnız şu koşullarda kabul ediliyor: ilk parçası tam olarak `tenantId`, en az bir alt parçası var, karakterleri yalnız `[A-Za-z0-9_./-]`, ≤1024 karakter, boş / `.` / `..` parçası yok. `%` küme dışında olduğu için `%2e%2e` hiç çözülmüyor. `\`, boşluk ve NUL da reddediliyor. Tam URL (eski `fileUrl` kayıtları) önce path'e indiriliyor, sonra aynı kurallardan geçiyor. `tenantId`'nin kendisi de `[A-Za-z0-9_-]{1,128}` olmak zorunda.
2. `confirmEvidenceUploadAction`: anahtar bu testi geçmezse DB'ye hiçbir şey yazılmıyor ve `{ success: false, error: 'invalid_object_key' }` dönülüyor. İstemci bunu hata olarak gösteriyor (önceden sessizce kapanırdı).
3. `deleteEvidence` → `deleteTenantObject(tenantId, key)`: depodan yalnız kendi önekindeki anahtar siliniyor. Reddedilen anahtarda kiracının kendi satırı yine silinir, başkasının dosyasına dokunulmaz.
4. `generateR2ObjectKey`: dosya uzantısı da süzülüyor. Önceden `a./x/y` uzantısı `/x/y` olup anahtara parça ekliyordu. Üretilen anahtar önek dışına çıkarsa fonksiyon hata fırlatıyor.
5. `uploadFileToR2` artık gerçekten yüklüyor (`putObjectBytes`: R2 ya da üretim dışında `.dev-objects`), anahtarı sunucu kuruyor ve saklanamazsa `null` dönüyor. `createEvidence` anahtarı bundan alıyor, ham dosya adını kullanmıyor.
6. `deleteFileFromR2`'nin R2'siz dalı artık yerel depodaki nesneyi de siliyor. Önceden yalnız log yazıyordu, bu yüzden silme yolu canlı test edilemiyordu.

**Aynı kalıp başka yerlerde tarandı** (`grep deleteFileFromR2|deleteObjectBytes|putObjectBytes|getObjectBytes|putObjectToR2|uploadFileToR2|getPresignedUploadUrl`):
| Yol | Anahtarın kaynağı | Sonuç |
|---|---|---|
| `evidence/actions.ts` confirm/delete/createEvidence | istemci / ham dosya adı | **düzeltildi** |
| `src/lib/agency/cobrand-store.ts` put/delete | sunucu: `${agencyId}/agency/cobrand/${randomUUID()}.png`, sunucunun yazdığı `settings`'te duruyor | güvenli |
| `src/app/api/agency/cobrand-logo/route.ts` get | `logoKeyVisibleTo(session tenant)` | güvenli |
| `src/lib/feedback/submit.ts` putObjectToR2 | sunucu: `screenshotObjectKey(tenantId, created.id, …)` | güvenli |
| `deleteUserFilesFromR2` | `users/${session userId}/` | güvenli |
| `src/app/api/admin/documents/upload/route.ts` | depoya yazmıyor (RAG, platform-admin kapısı) | ilgisiz |
| `src/modules/m11/**` | depo çağrısı yok | ilgisiz |
| `opportunities/[id]/documents` | depo çağrısı yok (`/api/documents/export` üretiyor) | ilgisiz |

## 2. Kanıt

### 2.1 İzole DB kurulumu (paylaşılan `fabrika`'ya dokunulmadı)
`create database fb_devop_y4` → `prisma db push` → `pnpm db:rls-role` → `scripts/apply-migrations.sh` ×2 → `pnpm db:rls` → `pnpm db:seed`:
```
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.  (DATABASE_URL_RLS_TEST=…/fb_devop_y4)
apply-migrations: 38 files applied
apply-migrations: 38 files applied
✅ prisma/rls.sql applied. Policies in public: 28 → 112
Seeding completed with E10 data.
```

### 2.2 İki kiracılı canlı test (`tests/evidence-object-key.live.test.ts`)
Aksiyonlar `fabrika_app` (NOBYPASSRLS, doğrulandı) üzerinden gerçekten koşuyor. Yalnız oturum ve `revalidatePath` taklit. Depo gerçek `.dev-objects` dosyaları.
- A, B'nin anahtarını ve 6 kaçış biçimini (`A/../B…`, `A/%2e%2e/B…`, `A//B…`, `/B…`, `https://…/B…`, `A/..\B…`) ve `undefined`'ı bağlayamıyor. Hepsinde `{success:false, error:'invalid_object_key'}` dönüyor, A'da 0 satır oluşuyor, B'nin dosyası diskte duruyor.
- A'nın düzeltmeden önce yazılmış gibi B'nin anahtarını (ve B'nin URL'sini) taşıyan satırı silindiğinde: satır gidiyor, **B'nin dosyası diskte kalıyor**.
- A, B'nin satırını silemiyor (`success:false`), satır ve dosya duruyor.
- **Pozitif kontrol:** A'nın kendi presigned anahtarı kaydediliyor (satır DB'de gerçekten var, çevrimdışı yedek değil), silinince **dosya diskten gidiyor**. Yani "B'nin dosyası duruyor" sonucu hiç çalışmayan bir silmeden kaynaklanmıyor.
- FormData yolunda dosya adı `../../<B>/org-default/x.pdf` ve kategori `../../<B>` verildi. Anahtar yine `A/org-default/…` altında, 5 parçalı; bayt diskte gerçekten var, silince gidiyor.
```
source env.sh (fb_devop_y4) && npx vitest run tests/evidence-object-key.live.test.ts tests/evidence-object-key.test.ts
 Test Files  2 passed (2)
      Tests  33 passed (33)          ← 28 birim + 5 canlı
```
Test sonrası: `select count(*) from "Tenant" where slug like 'evk-%'` → 0, `"User" where email like 'evk-%'` → 0, `.dev-objects` içinde yalnız önceden var olan 4 dizin kaldı. Test verisi tek RUN kimliğiyle ve `requireId`/`presentIds` korumalı siliniyor.

### 2.3 Mutantlar: 12/12 öldü
| # | Mutant | Sonuç |
|---|---|---|
| M1 | confirm'de doğrulama kapatılır | ÖLDÜ |
| M2 | ilk parça = tenantId kontrolü kalkar | ÖLDÜ (6 fail) |
| M3 | `..` parça kontrolü kalkar | ÖLDÜ (3) |
| M4 | karakter kümesine `%` ve `\` eklenir | ÖLDÜ (4) |
| M5 | deleteEvidence doğrudan `deleteFileFromR2` (eski hal) | ÖLDÜ |
| M6 | uzantı süzgeci kalkar | ÖLDÜ |
| M7 | createEvidence ham `file.name` ile anahtar kurar (eski hal) | ÖLDÜ |
| M8 | uploadFileToR2 yazmadan "saklandı" der | ÖLDÜ |
| M9 | deleteTenantObject önek kontrolünü atlar | ÖLDÜ |
| M10 | yerel depoda silme yapılmaz | ÖLDÜ (2) |
| M11 | generateR2ObjectKey önek dışı anahtara izin verir | ÖLDÜ |
| M12 | `segments[0] === tenantId` yerine `startsWith(tenantId)` | ÖLDÜ |

### 2.4 İlgili testler (izole DB)
`storage-public-url`, `server-action-missing-id`, `users-scheduled-deletion`, `gdpr-data-subject.live`, `action-missing-id.live` ve iki yeni dosya: **7 dosya, 122/122 geçti**.
**Dikkat, dürüst kayıt:** bu dosyaları ilk seferde yanlışlıkla `.env`'deki paylaşılan `fabrika` DB'sine karşı koştum. `action-missing-id.live` (dosya düzeyi) ve `gdpr-data-subject.live` (1 test) orada kırmızıydı, aynı ağaç izole DB'de yeşil. Bu suite'ler kendi fixture'larını kurup `requireId` korumalı siliyor. Paylaşılan DB'ye kalıcı bir şey bırakmadılar, ama bu koşu talimata aykırıydı.

### 2.5 Tam suite: temiz worktree `7a83e7d2`, izole DB
```
Test Files  1 failed | 251 passed | 2 skipped (254)
Tests  1 failed | 2995 passed | 9 skipped (3005)
FAIL tests/teardown-where-guard.test.ts → "tests/evidence-object-key.live.test.ts:133 in: ids", ":141 in: users"
```
Bu benim testimdi: koruma testi `presentIds(...)`'in doğrudan `in:` altında yazılmasını istiyor. `d8971c42` ile düzeltildi. Aynı worktree `d8971c42`'de: `teardown-where-guard` artık benim dosyamı göstermiyor. Kalan tek kayıt `tests/stale-relationship-reminder.live.test.ts:395 where: args` (se-fb, `9229fef4`, TASK-MULQL2NYKRGJX). O dosya se-fb'nin kapsamında olduğu için dokunmadım.

### 2.6 Kapılar: temiz worktree `d8971c42`
`pnpm install --frozen-lockfile` → `db:generate` → `pnpm typecheck` → `pnpm lint` → `env -u NODE_ENV pnpm build`:
```
install=0  gen=0  tc=0  lint=0  build=0
```

### 2.7 Gerçek arayüzde yükleme (prod build `7a83e7d2`, Playwright Chromium)
Kanıt sayfası → "Yeni Belge Yükle" → PDF seçildi → gönderildi. Satır listede göründü, DB'deki anahtar `demo-tenant/org-default/cat-03/2026/<8hex>_min.pdf` (4 koşu, 4 satır). Yani düzeltme meşru yüklemeyi bozmuyor. Aynı gezintide CSP ihlali 0 (bkz. TASK-MUN80T8IVTPM7 raporu §2.2).

## 3. Değişen dosyalar
- `src/lib/storage.ts`: `tenantObjectKeyOf`, `deleteTenantObject`, `generateR2ObjectKey` uzantı süzgeci + önek kontrolü, gerçek `uploadFileToR2`, yerel depoda silme
- `src/app/[locale]/(app)/[workspace]/evidence/actions.ts`: confirm doğrulaması, deleteEvidence → deleteTenantObject, createEvidence sunucu anahtarı
- `src/app/[locale]/(app)/[workspace]/evidence/evidence-client.tsx`: reddedilen anahtar kullanıcıya hata olarak gösteriliyor
- `tests/evidence-object-key.test.ts` (yeni, 28 test), `tests/evidence-object-key.live.test.ts` (yeni, 5 canlı test)

## 4. Riskler
- **Eski kayıtlar:** düzeltmeden önce geçersiz uzantıyla (ör. boşluk ya da Türkçe karakter içeren uzantı) yazılmış bir anahtar artık doğrulamayı geçmez. O satır silinince nesne depoda **yetim kalır** (güvenli yön: silmemek). Canlıda böyle satır olup olmadığı şu sorguyla kontrol edilebilir: `select count(*) from "Evidence" where "r2ObjectKey" !~ '^[A-Za-z0-9_./-]+$' or split_part("r2ObjectKey",'/',1) <> "tenantId"`. Sıfır değilse bir kerelik temizlik gerekir.
- **Kiracı içi:** aynı kiracının bir üyesi, kendi kiracısındaki başka bir kaydın anahtarını yeni bir kayda bağlayabilir. Bu bir yetki yükseltmesi değil, çünkü o üye kaydı zaten doğrudan silebiliyor. Yine de HMAC ile imzalı yükleme belirteci (sunucunun ürettiği anahtarı kısa ömürlü bağlamak) bunu da kapatır. Kapsam dışı bıraktım.
- **Y-4'ün kalan alt maddeleri bu kartta yok:** presigned PUT'ta MIME izin listesi ve boyut sınırı yok (`mimeType` hâlâ istemciden geliyor). `R2_PUBLIC_HOST` ayarlıysa INTERNAL kanıt belgeleri kimliksiz genel URL'den okunabilir. Dev'de presigned yol `/api/evidence/mock-upload`'a gidiyor ama bu rota yok (istemci PUT'u atlıyor, bayt saklanmıyor). Bu işlevsel bir eksik ve güvenlik düzeltmesinin konusu değil.
- Canlı test `process.env.R2_ACCOUNT_ID=''` ile yerel depoyu zorluyor. CI'da R2 kimliği tanımlanırsa da test R2'ye gitmez.

## 5. Açık sorular
- Prod'da `R2_PUBLIC_HOST` ayarlanacak mı? Ayarlanacaksa kanıt indirmesi `getPresignedDownloadUrl`'e taşınmalı (tarama raporu açık soru 3).
- MIME izin listesi + boyut sınırı + HMAC yükleme belirteci ayrı bir kart olarak açılsın mı?

## 6. Sonraki adım
- Canlıya çıkmadan önce §4'teki yetim anahtar sorgusunu prod DB'de salt-okunur olarak koşmak.
- Ayrı kart: presigned PUT'a `ContentType` izin listesi + `ContentLength` koşulu, dev için gerçek `mock-upload` rotası, R2 genel host'u yerine imzalı indirme.
- se-fb'ye iletilecek: `stale-relationship-reminder.live.test.ts:395` teardown koruma testini kırıyor (bkz. §2.5).
