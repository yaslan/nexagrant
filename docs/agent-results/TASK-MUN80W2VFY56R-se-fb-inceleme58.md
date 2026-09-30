# TASK-MUN80W2VFY56R — se-fb — İNCELEME-58: Y-4 kanıt objectKey düzeltmesi

**Durum: TAMAM** · incelenen: `7a83e7d2` (fix) + `d8971c42` (test teardown), devop-fb · kaynak bulgu: `TASK-MUN66T2HM4A4E-be-fb.md` Y-4.

**Platform beyanı:** macOS (Darwin 27, arm64) üzerinde doğrulandı. Kullanılanlar: vitest, kendi izole Postgres'im (docker `sefb58-pg`, pgvector pg16, `127.0.0.1:5497/fb58`) ve yerel depo `.dev-objects` (R2 yerine). Windows ve Linux'ta **koşulmadı**, bu makinede yoklar. Koddan çıkan sonuç şöyle. Anahtar doğrulaması (`tenantObjectKeyOf`) saf metin işlemi, platformdan bağımsız. Platforma bağlı tek yol yerel depo (`devObjectPath`), o da yalnız üretim dışında çalışıyor. Anahtar `\` ve sürücü harfi taşıyamadığı için Windows'ta dizin dışına çıkamaz. macOS APFS varsayılan olarak büyük/küçük harf duyarsız, bu yüzden yerel depoda `abc/…` ile `ABC/…` aynı dosyaya düşer. Bu sorun yalnız geliştirme ortamında ve yalnız kiracı kimlikleri harf büyüklüğüyle ayrışırsa çıkar. cuid kimlikleri küçük harf olduğu için gerçekçi değil. Üretimdeki R2 harf duyarlı.

## 1. Ne yapıldı
- Kodu okudum: `src/lib/storage.ts`, `evidence/actions.ts`, `evidence-client.tsx`, feedback, cobrand ve RAG depo çağrıları.
- `git worktree add --detach … dev` ile scratchpad'de temiz bir worktree açtım (HEAD `c5e22a6e`, fix ve teardown commit'lerini içeriyor). Ana checkout'a kod yazmadım.
- Kendi Postgres konteynerimi kurdum: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 → `db:rls`. Paylaşılan `fabrika` DB'sine yalnız bir kez `BEGIN READ ONLY` ile sayım sorgusu attım (§2.6).
- devop-fb'nin 33 testini izole DB'de yeniden koştum.
- **Kendi iki kiracılı canlı testimi yazdım:** `tests/sefb-i58-evidence-key.live.test.ts` (7 test, yalnız scratch worktree'de, commit edilmedi). Kiracı kimliklerini önek karışıklığı olacak biçimde verdim: A = `<RUN>a`, B = `<RUN>ab`, yani `B.startsWith(A)` doğru. Aksiyonlar `fabrika_app` (NOBYPASSRLS) üzerinden koşuyor.
- Presigned PUT URL'sini ağ kullanmadan, sahte R2 kimliğiyle inceledim (`tests/sefb-i58-presign.test.ts`).
- 7 mutant uyguladım. Her birini hem devop-fb'nin testlerine hem benimkilere karşı koştum.

## 2. Kanıt

### 2.1 devop-fb testleri, izole DB
```
npx vitest run tests/evidence-object-key.live.test.ts tests/evidence-object-key.test.ts
 Test Files  2 passed (2)
      Tests  33 passed (33)
```
Not: ilk koşuda 3 test kırmızıydı. Nedeni benim kurulum sıramdı: `db:rls-role` tablolardan önce koşmuştu ve yetkiler eksik kalmıştı. `db:rls-role` tekrar koşunca yeşile döndü. Koddan kaynaklanan bir sorun yok.

### 2.2 se-fb iki kiracılı canlı test: 7/7
```
✓ ids really are prefix-confusable (A is a prefix of B)
✓ confirm: A cannot record any spelling of B's key, nor a malformed own key
✓ delete: planted legacy rows of A pointing at B (every spelling) delete no B byte
✓ B's own actions: B cannot record or delete A's key either (reverse direction)
✓ legacy formats: old-generator key (upper-case ext) still deleted; odd-ext key orphaned; mock-r2 URL harmless
✓ createEvidence writes the exact bytes (not a placeholder), under A
✓ FINDING probe: confirm records client-chosen mimeType / size with no allowlist, no HEAD
      Tests  7 passed (7)
```
**Confirm'e denenen 29 düşmanca anahtar**, hepsi `{success:false, error:'invalid_object_key'}` döndü, A'da 0 satır oluştu, B'nin dosyası diskte kaldı:
- B'nin anahtarı
- `A+"b"/…` (= B, önek karışıklığı)
- `A/../B…`, `A/./../B…`
- `A/%2e%2e/B…`, `A/%2E%2E/B…`, `A%2F..%2FB…`, `A/..%2fB…`
- `A//B…`, `//B…`, `/A/x.pdf`
- `A/`, `A`, `A/org-default/`, `A/org-default//x.pdf`, `A/./x.pdf`
- `A` ve `B` büyük harfle
- `A/‥/B…` (U+2025), `A/．．/B…` (tam genişlik), `A/orgç/x.pdf`, NUL
- `A/..\B…`, `A\..\B…`
- baştaki boşluk, sondaki `\n`
- `https://…/A/x.pdf`, `https://…/A/%2e%2e/B…`
- 1030 karakterlik anahtar

Ayrıca anahtar olarak `123`, `null`, `{}`, `['x']` ve `toString`'i B'yi döndüren bir nesne verildi, hepsi reddedildi.

**Delete'e karşı A'nın satırına 9 biçimde B anahtarı yerleştirildi** (düzeltme öncesi kalmış bir satır gibi, `r2ObjectKey` ya da yalnız `fileUrl` olarak):
- `A+"b"/…`, `A/../B…`, `A/%2e%2e/B…`, `A//../B…`
- URL biçimleri `…/A/../B…` ve `…/A/%2e%2e/B…`. WHATWG URL ayrıştırıcısı bunları `/B/…`'ye çözüyor, ilk parça B olduğu için reddediliyor.
- `…/A/..%2fB…`, `…/A%2f..%2fB…`, `…//B…`

Hepsinde satır silindi, **B'nin baytı diskte kaldı**. Ters yönde de sonuç aynı: B, A'nın anahtarını kaydedemiyor ve A'nın satırını silemiyor.

**Pozitif kontrol:** eski üreticinin biçimindeki geçerli anahtar (`A/org-default/cat-03/2025/1a2b3c4d_rapor_pdf.PDF`) silindiğinde dosya da gidiyor. Yani "B'nin dosyası duruyor" sonucu hiç çalışmayan bir silmeden kaynaklanmıyor.

### 2.3 createEvidence gerçek bayt yazıyor: EVET
2 KB'lık yükün diske yazılan hali `Buffer.equals` ile birebir aynı çıktı. Dosya adı `<B>/../../etc/passwd.pdf` verilmesine rağmen anahtarın ilk parçası A. Silince dosya da gidiyor. (devop-fb'nin testi yalnız dosyanın var olup olmadığına bakıyordu, bu yüzden M6 mutantı onun testinde sağ kalıyor, bkz. §2.5.)

### 2.4 MIME izin listesi ve boyut sınırı: UYGULANMIYOR (açık, B-1)
Sahte R2 kimliğiyle `getPresignedUploadUrl` çağrıldı:
```
tnta/org-default/cert/2026/a3eff2b9_evil_html.html | crc32: AAAAAA== | signed: host | host: fonbridge-evidence.probeacct.r2.cloudflarestorage.com
tnta/org-default/cert/2026/63d609ed_x_svg.svg      | signed: host
tnta/org-default/cert/2026/9a0a0459_a_exe.exe      | signed: host
```
- `text/html`, `image/svg+xml` ve `.exe` için gerçek imzalı URL üretiliyor.
- `X-Amz-SignedHeaders=host`, yani `Content-Type` imzaya **bile girmiyor**. Tarayıcı PUT'u istediği tür ve boyutla (R2'nin tek PUT sınırına kadar) yapabilir. Kontrol yalnız istemcide var, sunucuda yok.
- `confirmEvidenceUploadAction` istemcinin verdiği `mimeType` ve `fileSizeBytes`'ı doğrulamadan yazıyor ve nesnenin varlığını da kontrol etmiyor. Canlı testteki kanıt: `text/html`, 2 000 000 000 bayt, hiç yüklenmemiş bir nesne → `success:true`, satır yazıldı, bayt yok.

### 2.5 Mutantlar: 7/7 öldü (se-fb testiyle); 3'ü devop-fb testinde SAĞ
| # | Mutant | devop-fb (33) | se-fb (7) |
|---|---|---|---|
| M1 | `segments[0] !== tenantId` → `!key.startsWith(tenantId)` | 1 fail | 2 fail |
| M2 | boş parça kontrolü kalkar | 3 fail | 1 fail |
| M3 | karakter kümesine `%`, boşluk, `\p{L}` eklenir | 5 fail | 1 fail |
| M4 | kiracı karşılaştırması harf duyarsız | **SAĞ (33 geçti)** | 1 fail |
| M5 | deleteEvidence → doğrudan `deleteFileFromR2` | 1 fail | 1 fail |
| M6 | `uploadFileToR2` gerçek bayt yerine 1 bayt yazar | **SAĞ** | 1 fail |
| M7 | confirm tam-eşitlik kontrolü kalkar (URL kabul edilir) | **SAĞ** | 1 fail |

Komut: `python3 ../mut.py <dosya> <eski> <yeni>`, sonra iki suite koşuldu, sonra `git checkout -- src`. Son `git status`'ta yalnız benim iki test dosyam var, `src` temiz.

### 2.6 Eski kanıt kayıtları
- Paylaşılan `fabrika` DB'sinde salt-okunur sayım (`BEGIN READ ONLY … ROLLBACK`): `Evidence` toplam 92, `r2ObjectKey` dolu 0, uymayan anahtar 0, yalnız `fileUrl` dolu 0. Yerelde bozulacak eski satır yok. Prod DB'ye erişimim yok, devop-fb §4'teki sorgu prod'da koşulmalı.
- Canlı testte eski üretici biçimi (büyük harfli uzantı) silinmeye devam ediyor. Uzantısında boşluk olan eski bir anahtarın satırı siliniyor ama nesne **yetim kalıyor**. Bu güvenli yön ve beklenen davranış. Eski `EvidenceForm` / `createEvidence` biçimindeki `https://mock-r2.example.com/<ad>` kaydı zararsız biçimde reddediliyor (tek parça). `EvidenceForm.tsx` hiçbir yerden import edilmiyor, ölü kod.

### 2.7 Diğer depolama yolları
| Yol | Anahtar | Tür/boyut | Okuma | Sonuç |
|---|---|---|---|---|
| Logo (`cobrand-store.ts:106`) | sunucu, `<agencyId>/agency/cobrand/<uuid>.png` | `sanitizeLogoPng` + `COBRAND_MAX_BYTES`, OWNER/ADMIN | `/api/agency/cobrand-logo`: oturumlu, `nosniff`, `sandbox` CSP, `private` | güvenli |
| Feedback (`feedback/route.ts:17-18`, `submit.ts:98`) | sunucu, `feedback/<tenantId>/<yyyy>/<id>.<ext>` | izin listesi png/jpeg/webp, 2 MB | uygulama içinden okunmuyor | güvenli (ama aynı kovada, B-2'ye bakın) |
| RAG (`api/admin/documents/upload`) | depoya yazmıyor | — | — | ilgisiz |
| GDPR (`deleteUserFilesFromR2`) | `users/<session userId>/` | — | — | güvenli |

Kiracı içi not: `confirm`, A'nın kendi önekindeki kanıt dışı bir anahtarı da kabul ediyor (ör. `A/agency/cobrand/<uuid>.png`). Logo anahtarı istemciye hiç verilmiyor (`hasLogo` boolean) ve UUID tahmin edilemez, bu yüzden istismar edilemez. Kanıt anahtarları ise `getEvidenceItemsAction` ile kiracı içinde görünüyor, ama WRITER o kaydı zaten doğrudan silebiliyor. Bu konuda devop-fb §4'e katılıyorum.

### 2.8 Temizlik
Test sonrası izole DB'de `Tenant|Evidence|User` = `0|0|0` ve `.dev-objects` boş. Paylaşılan DB'ye hiçbir satır yazılmadı.

## 3. Bulgular

| # | Önem | Konum | Bulgu | Durum |
|---|---|---|---|---|
| — | — | `storage.ts:77-96`, `actions.ts:101-104,280-284` | Kiracılar arası confirm/delete (Y-4 çekirdeği) | **KAPANDI**, kanıt §2.2 |
| B-1 | Orta | `storage.ts:130-137`, `actions.ts:60-72,146-147` | Presigned PUT'ta MIME izin listesi ve boyut sınırı yok. `Content-Type` imzalanmıyor. Confirm tür, boyut ve varlık kontrolü yapmıyor. | **AÇIK** |
| B-2 | Orta (`R2_PUBLIC_HOST` ayarlıysa Yüksek) | `storage.ts:36,46-48`, `actions.ts:108,141`, `evidence-client.tsx:262,521,788` | Kanıt dosyası kimliksiz genel URL'den okunabiliyor. URL `fileUrl`'e yazılıyor ve CSV dışa aktarımına giriyor. B-1 ile birleşince genel host'tan `text/html` sunulabilir. | **AÇIK** (koşula bağlı; dev `.env`'de ayarlı değil, prod bilinmiyor) |
| B-3 | Düşük (varsayım: R2'ye karşı koşulmadı) | `storage.ts:13-20,131-136`, `evidence-client.tsx:194-198` | Presigned URL boş gövdenin checksum'ını taşıyor (`x-amz-checksum-crc32=AAAAAA==`, @aws-sdk ≥3.729 varsayılanı). Gerçek bir PUT BadDigest ile reddedilebilir. İstemci `res.ok`'a bakmıyor, böylece bayt olmadan kayıt oluşuyor. | AÇIK, önceden var olan |
| B-4 | Düşük | `actions.ts:159-176` | Confirm'de DB hatası olursa `success:true` ve uydurma bir kanıt dönüyor. Gözlem: `fileSizeBytes=5e9` int taşması → `success:true`, satır yok. Üretimde R2 yoksa presigned yol mock URL'ye düşüyor ve bayt olmadan kayıt açılıyor. | AÇIK, önceden var olan |
| B-5 | Bilgi | `tests/evidence-object-key*.ts` | M4 (harf duyarsızlığı), M6 (bayt eşitliği) ve M7 (confirm tam eşitliği) devop-fb suite'inde sağ kalıyor. | test boşluğu |
| B-6 | Bilgi | `actions.ts:280-287` | Nesne DB silme işleminden önce, transaction içinde siliniyor. DB silme başarısız olursa dosya gider ama satır kalır. | küçük |

**Düzeltme önerileri**
- **B-1:**
  - `getPresignedUploadUrlAction` içine sunucu tarafı izin listesi ekle: pdf, png, jpeg, webp, docx, xlsx. Uzantı ile MIME uyuşmalı.
  - İstemciden beyan edilen boyutu al, üst sınırı uygula (ör. 25 MB).
  - Presign'ı `signableHeaders: new Set(['content-type','content-length'])` ve `ContentLength` ile yap. R2 POST policy desteklemediği için PUT'ta Content-Length imzalanmalı.
  - Confirm'de `HeadObject` ile nesnenin var olduğunu, boyutunu ve türünü doğrula. Kaydı istemcinin beyanına göre değil bu sonuca göre yaz.
- **B-2:**
  - Kova genel erişime kapalı olmalı.
  - `fileUrl` yazılmamalı.
  - İndirme, kiracıyı doğrulayan bir sunucu rotasına taşınmalı: `getPresignedDownloadUrl`, kısa TTL, `Content-Disposition: attachment`.
  - CSV'ye URL yazılmamalı.
- **B-3:** `new S3Client({ …, requestChecksumCalculation: 'WHEN_REQUIRED' })` kullan. İstemcide `if (!res.ok) throw`. HeadObject (B-1) bunu da yakalar.
- **B-4:** DB hatasında `success:false` dön. Üretimde R2 yoksa presign reddedilmeli.
- **B-5:** se-fb testindeki harf, bayt eşitliği ve URL-at-confirm iddiaları kalıcı teste taşınmalı.

## 4. Değişen dosyalar
- Yalnız bu rapor: `docs/agent-results/TASK-MUN80W2VFY56R-se-fb-inceleme58.md`. Kod değişmedi.
- Test dosyalarım (`tests/sefb-i58-evidence-key.live.test.ts`, `tests/sefb-i58-presign.test.ts`) yalnız scratch worktree'de kaldı, commit edilmedi.

## 5. Riskler
- B-1 ve B-2 birlikte en büyük kalan risk. Prod'da `R2_PUBLIC_HOST` ayarlanır ve kova genel olursa, her kanıt (INTERNAL/GİZLİ dahil) URL'yi bilen herkese açık olur. Ayrıca şirket alan adında keyfi HTML ya da SVG barındırılabilir (oltalama).
- `db push` komutu symlink'li `node_modules` üzerinden Prisma client'ı yeniden üretti. Şema ana checkout'la aynı commit'ten geldiği için çıktı da aynı. Yine de not ediyorum.

## 6. Açık sorular
- Prod'da `R2_PUBLIC_HOST` ayarlı mı, kova genel mi? (devop-fb §5 ile aynı soru. B-2'nin önem derecesi buna bağlı.)
- Görevin sarmalayıcısındaki mutlak yol `/Users/macbook/alan/docs/…` ile gövdedeki "SONUÇ DOSYASI + Repo FONBRIDGE" çelişiyor. Önceki raporlar repo içinde olduğu için rapor repo içine yazıldı.

## 7. Sonraki adım
- Tek bir kart açılsın: "Y-4 kalanı: presigned PUT tür/boyut + HeadObject + imzalı indirme + checksum", B-1 ile B-4 arası. Kapsam `storage.ts`, `evidence/actions.ts`, `evidence-client.tsx`. Canlı test ile R2 uyumlu bir mock (ör. MinIO) üzerinde gerçek PUT kanıtı istensin, böylece B-3 varsayımı da doğrulanır.
- devop-fb'nin testine M4, M6 ve M7'yi öldüren iddialar eklensin.

**Karar: ONAY.** `7a83e7d2` ve `d8971c42` doğru ve yeterli: kiracılar arası confirm/delete kapandı ve 29 + 9 düşmanca biçimde ve 7 mutantta tuttu. Ancak Y-4 bir bütün olarak **kapanmadı**. B-1 (MIME/boyut) ve B-2 (genel host) açık ve ayrı kart gerekiyor. devop-fb bunları kendi raporunda kapsam dışı olarak zaten beyan etmişti.
