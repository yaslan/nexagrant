# TASK-MUO122UPRPJQH — fe-fb — İNCELEME-77 B-1 (BLOKE) + D-1/D-2 düzeltmesi

**Durum:** TAMAM
**Dal:** `fe-fb/muo122-confirm-atomic` (dev `19dc119b`'den), kendi worktree'mde. Kapılar yeşil olunca dev'e merge edildi, push yok.
**Ortam:** izole Postgres `fefb122-pg` (127.0.0.1:55122; CI sırası: db push → db:rls-role → apply-migrations ×2 → db:rls → db:seed) ve kendi MinIO'm `fefb122-minio` (127.0.0.1:59122, private kova). Paylaşılan :5433'e yazılmadı.
**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26, vitest 4.1.11, `pgvector/pgvector:pg16`, `bitnamilegacy/minio`). Linux ve Windows'ta koşulamadı, bu makinede yalnız mac var. Koddan çıkarımlar:
- Prod yolu (S3 `HeadObject`/`GetObject IfMatch`/`CopyObject CopySourceIfMatch`/`DeleteObject`) platformdan bağımsız.
- Dev deposu artık `fs.rename(staging→final)` kullanmıyor. `copyFile(staging → final.<rnd>.partial)` + `rename(partial → final)` kullanıyor. Linux'ta ikisi de mac'teki gibi çalışır. Windows'ta `rename` hedefin üzerine yazar (`MoveFileExW REPLACE_EXISTING`). Dosya açıksa (antivirüs, eşzamanlı indirme) `EPERM`/`EBUSY` verebilir. Bu durumda confirm `storage_unavailable` döner, `.partial` silinir, staging yerinde kalır ve yeniden deneme mümkündür. Eskiden aynı durumda staging taşınamıyor ve `object_missing` dönüyordu.
- `deleteObjectBytes` dev yolunda `rm` hatası artık fırlatmıyor, `false` dönüyor. Windows'ta `EBUSY` yüzünden kaydı yapılmış bir confirm'ün hata göstermesi engellenmiş oldu.

## 1. Ne yapıldı

### B-1: confirm sırası (bloke eden bulgu)
Yeni sıra `src/app/[locale]/(app)/[workspace]/evidence/actions.ts` `confirmEvidenceUploadAction` içinde. **Hiçbir depo çağrısı DB transaction'ı içinde değil.**
1. **Zaten kayıtlı mı?** Kısa bir okuma tx'i: `(tenantId, finalKey)` satırı varsa staging silinir ve `already_confirmed` döner. D-3 böylece korunur: confirm sonrası PUT, kayıtlı dosyanın üzerine kopyalanamaz.
2. **Staging'i doğrula, sonra kopyala:** `src/lib/storage.ts` `copyIncomingObject` (yeni; `promoteIncomingObject`'in yerini aldı).
   - Staging önce `HEAD` ile okunur (ETag), sonra `GET Range IfMatch=ETag` ile ilk 16 bayt alınır ve `storedEvidenceMatches` ile kontrol edilir.
   - Ardından `CopyObject CopySourceIfMatch=ETag` yapılır. Staging kontrolden sonra değiştiyse kopya 412 alır. Final anahtarda **yalnızca kontrolden geçmiş baytlar** olabilir.
   - Son olarak **final `HEAD`** yapılır. Boyut ve tür, kontrol edilenle aynı olmalı.
   - Bu fonksiyon hiçbir şey silmez.
3. **Satır:** tek bir `tx.evidence.create`. Boyut ve mime depodan okunan değerlerdir. Eski ikinci adımdaki `updateMany` kalktı.
4. **Staging sil:** commit'ten sonra. Silme başarısız olursa yalnız log düşülür. Aynı anahtarla sonraki confirm 1. adımda `already_confirmed` alır ve silmeyi yeniden dener.

Hata yolları:

| Durum | Dönen | Satır | Staging | Final kopya |
|---|---|---|---|---|
| Depo kapalı / yavaş, kopyadan önce | `storage_unavailable` (404 ise `object_missing`) | yok | **korunur** | yok |
| Kopyadan sonra depo ölür (HEAD başarısız) | `storage_unavailable` | yok | **korunur** | yetim kalabilir (D-3, aşağıda) |
| Kontrol ile kopya arasında staging değişti (412) | `storage_unavailable` | yok | korunur | **yok** |
| Satır kaydı başarısız (P2028 tx süresi, bağlantı) | `save_failed` (**yeni**) | yok | **korunur** | yetim kalabilir |
| Dosyanın kendisi kabul edilmez (tür/boyut/boş) | `unsupported_type` / `file_too_large` / `empty_file` | yok | silinir | hiç yazılmaz |
| Eşzamanlı ikinci confirm | `already_confirmed` (P2002) | 1 | silinir | kazananınki |

- **Sahte başarı kaldırıldı:** "DB offline" dalı (`success: true, id: ev-<ts>`) silindi. Satır yoksa başarı dönmez.
- Yeni hata kodu `save_failed` için i18n eklendi: `messages/{en,tr}.json` → "The document could not be saved. Try again." / "Belge kaydedilemedi. Tekrar deneyin."
- **Yeniden deneme idempotent:** aynı `objectKey` ile tekrar confirm her hata yolunda başarılı oldu (kanıt aşağıda). Başarıdan sonraki tekrar `already_confirmed` döner, ikinci satır oluşmaz.

### D-1: anahtar biçimi sıkı
`finalKeyOfIncoming` artık presign'ın ürettiği biçimi birebir bekliyor: `<t>/incoming/<org>/<kategori>/<yyyy>/<8 hex>_<ad>.<ext>`. Kategori, ad ve uzantı küçük harfle `[a-z0-9_-]` olmalı. `<org>` `incoming` olamaz. `<t>/incoming/incoming/x.pdf` ve iç içe tam biçim reddediliyor. `mock-upload` rotası aynı fonksiyonu kullandığı için dev deposu da 403 dönüyor.

### D-2: `page.tsx` rol bekçisi + K8
`tests/evidence-page-role.test.ts`:
- Sayfa `requireTenantPage` mock'uyla çağrılıyor. `loadEvidenceItems(tenantId, role)` çağrısının MEMBER, GUEST_PARTNER ve TENANT_OWNER için gerçek rolle yapıldığı sınanıyor (K13).
- Küçük harfli açık seviyeler (`internal`, `Internal`, `public`, `consortium`, `' INTERNAL'`) MEMBER için gizli sayılıyor (K8).

### D-3: yetim nesne notu
Kopya başarılı olduktan sonra final HEAD ya da satır kaydı başarısız olursa, final anahtarda satırsız bir kopya kalabilir. Bunu **bilerek silmiyorum.** Aynı anda koşan başka bir confirm o arada satırı yazmış olabilir. O durumda silmek kazananın dosyasını yok eder, yani gerçek veri kaybı olur. Yetim kopya zararsız:
- Hiçbir okuma yolu ona ulaşmaz, çünkü indirme satır ister.
- Yeniden denemede aynı kontrollü baytlarla üzerine yazılır.
- Yalnız depolama maliyeti var.

Temizlik için öneri (ops): satırı olmayan final nesneleri listeleyen periyodik bir süpürücü. `incoming/` lifecycle kuralı bunu kapsamaz. Ayrı kart önerilir.

### Diğer
- `tests/where-guard-src.test.ts`: `evidence/actions.ts id: created.id` KNOWN girdisi bayatladı (`updateMany` artık yok) ve silindi. Bu girdi tam süitte kırmızıydı.
- `scripts/live-skip-gate.ts` + `tests/live-skip-gate.test.ts`: yeni `tests/evidence-confirm-store-faults.live.test.ts` CI'da S3 olmadığı için atlanıyor. `evidence-upload-s3.live` ile aynı gerekçeyle izin listesine eklendi.

## 2. Kanıt
Ekler: `docs/agent-results/TASK-MUO122UPRPJQH-fe-fb-ekler/`.

**Yeni arıza suite'i (`tests/evidence-confirm-store-faults.live.test.ts`)**, gerçek MinIO önünde süreç içi arıza proxy'siyle:
```
yeni kod : Tests 6 passed (6)
eski kod (HEAD'deki actions.ts + storage.ts geri konunca):
  × crw-fb's case: every store call after the copy takes 6 s …        → expected [] to have a length of 1 but got +0
  × the row save outlives its transaction …                            → { success: true, evidence: … } (sahte başarı)
  × the store is down before the copy …                                → object_missing, staging yok
  × the store dies right after the copy …
  × the staging object is replaced between the check and the copy …
  Tests 5 failed | 1 passed (6)
```

**crw-fb'nin kendi saldırı suite'i yeni koda karşı** (`crwfb77-attack-full.log`; portlar kendi MinIO'ma çevrildi, repoya girmedi):
```
slow-after-copy (12264 ms) → success=true id=cmuo1vu6t… rows=1 staging=false final=true
   (önce: success=true id=ev-1790765373540 rows=0 staging=false final=false)
die-after-copy → {"success":false,"error":"storage_unavailable"} rows=0 staging=true final=true
  retry → {"success":true,…}
down-before-copy → {"success":false,"error":"storage_unavailable"}   (retry success)
slow-copy pair → first={"success":true,…} second={"success":false,"error":"object_missing"} rows=1 final=true
5x confirm → ok,already_confirmed,object_missing,already_confirmed,object_missing   (1 satır, dosya sağlam)
confirm A/incoming/incoming/x.pdf → invalid_object_key
Tests 8 passed (8)
```
Bu suite `down-before-copy` için `object_missing` bekliyordu. Kod artık daha doğru olan `storage_unavailable` dönüyor. Yalnız bu beklenti güncellendi, ilk koşuda 1 kırmızı buydu (`crwfb77-attack-rerun.txt`).

**Docker ile gerçek kesinti** (`zz-docker-fault.live.test.ts`, `docker-fault.log`):
```
PAUSE8s → {"success":true,"evidence":{"id":"cmuo1xgo3…"} ms=8328 rows=1 finalEqualsUpload=true staging=false
STOP → {"success":false,"error":"storage_unavailable"} rows=0 stagingEqualsUpload=true
STOP retry (docker start sonrası) → {"success":true,…} rows=1 finalEqualsUpload=true staging=false
```

**D-1 canlı, dev deposu** (crw-fb `zz-crwfb77-dev`, `crwfb77-dev-rerun.log`):
```
PUT nested staging → 403
confirm nested → {"success":false,"error":"invalid_object_key"}
row key = undefined          (satır yok; betik satır varsaydığı için sonra `row!.id`'de düşüyor, beklenen)
```

**Mutantlar** (`mutants.txt`, 6 kanıt suite'ine karşı, **13/13 KILLED**; `git status src` sonrası yalnız bu işin değişiklikleri kaldı, `cmp` ile doğrulandı):
```
KILLED M1  staging satırdan ÖNCE silinir (eski sıra)
KILLED M2  DB hatasında sahte başarı geri
KILLED M3  CopySourceIfMatch yok
KILLED M4  "zaten kayıtlı" ön-kontrolü yok
KILLED M5  kalıcı retde staging silinmez
KILLED M6  geçici hatada da staging silinir
KILLED M7  D-1 org=incoming kontrolü yok
KILLED M8  D-1 eski gevşek biçim
KILLED M9  kopya sonrası final HEAD doğrulaması yok
KILLED M10 başarı sonrası staging silinmez
KILLED M11 page.tsx rolü yok sayar (K13)
KILLED M12 seviye büyük/küçük harf duyarsız (K8)
KILLED M13 kopya öncesi staging doğrulaması yok
```

**Kapılar** (`gates.txt`, `build.log`, `full-vitest.log`):
```
typecheck rc=0 · lint rc=0 · i18n ✅ both catalogs agree · build rc=0
CI=true npx vitest run (izole DB + MinIO env): Test Files 285 passed | 2 skipped (287) · Tests 3460 passed | 9 skipped (3469) · rc=0
  atlanan tek live test: k1-embeddings (izinli, ücretli opt-in); iki evidence S3 suite'i atlanmadan koştu
```
İlk build denemesi Turbopack "Symlink node_modules points out of the filesystem root" hatası verdi. Sebep ortamdı: worktree'deki `node_modules` symlink'i. `pnpm install --offline` ile gerçek kurulum yapıldı, build rc=0. İlk tam koşudaki tek kırmızı `where-guard-src` bayat girdisiydi; düzeltildi.

## 3. Değişen dosyalar
- `src/lib/storage.ts`: `copyIncomingObject` (yeni, `promoteIncomingObject` kaldırıldı), `isFinalUploadRefusal`, sıkı `finalKeyOfIncoming`, `deleteObjectBytes` dev yolu fırlatmıyor.
- `src/app/[locale]/(app)/[workspace]/evidence/actions.ts`: yeni confirm sırası, sahte başarı kaldırıldı, `save_failed`.
- `messages/en.json`, `messages/tr.json`: `upload.error.save_failed`.
- `tests/evidence-confirm-store-faults.live.test.ts` (yeni), `tests/evidence-incoming-key.test.ts` (yeni), `tests/evidence-page-role.test.ts` (yeni), `tests/evidence-mock-upload-gate.test.ts` (iç içe anahtar 403).
- `tests/where-guard-src.test.ts` (bayat girdi), `scripts/live-skip-gate.ts` + `tests/live-skip-gate.test.ts` (izin listesi).

## 4. Riskler
- **Yetim final kopya (D-3):** yukarıda anlatıldı. Veri kaybı yok, yalnız maliyet. Süpürücü için ayrı kart gerekli.
- **S3 istemcisinde istek zaman aşımı yok.** Depo cevap vermezse (docker pause) confirm, depo dönene kadar bekliyor. Artık tx içinde olmadığı için veri kaybı yok. Ama sunucu eylemi platform limitine kadar askıda kalabilir. `requestHandler: { requestTimeout }` eklenmesi ayrı bir karar: bütün R2 çağrılarını etkiler.
- **Çift tık:** eşzamanlı ikinci confirm, kazanan staging'i sildiyse `object_missing` ("depoya ulaşmadı") görebilir, oysa belge kaydedilmiştir. Tek satır, dosya sağlam. Yalnız mesaj yanıltıcı. Form zaten `isUploading` ile düğmeyi kilitliyor.
- **Eşzamanlı yarış:** iki confirm aynı anda "kayıtlı değil" görürse ikisi de kopyalar. Kopyalar yalnız kontrolden geçmiş, ETag'e sabitlenmiş baytlardır. Final anahtara denetimsiz bayt yazılamaz.
- Migration yok, şema değişmedi.

## 5. Açık sorular
- R2'de `CopyObject` sonrası final HEAD'de boyut ve tür karşılaştırılıyor, ETag karşılaştırılmıyor. R2 kopyada ETag'i koruyor olsa bile bunu MinIO dışında doğrulayamadım. Karşılaştırma bilerek boyut ve türle sınırlı tutuldu. Prod'da bir kez gerçek R2 ile confirm denemesi önerilir.
- `requestTimeout` kararı (risklerde).

## 6. Sonraki adım
- crw-fb yeniden inceleme: `tests/evidence-confirm-store-faults.live.test.ts` ve ekteki `zz-docker-fault.live.test.ts` aynı `EVIDENCE_S3_TEST_*` ile koşulabilir.
- Ayrı kart önerisi: yetim final nesne süpürücüsü ve S3 istek zaman aşımı.
- Temizlik: `fefb122-pg` ve `fefb122-minio` kapları rapordan sonra kaldırıldı.
