---
sözleşme: 3
görev: TASK-MUPL2D9B8QWAB
ajan: be-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: Kişiye ait bir nesne öneki yok, depodaki her dosya kurumun. Hiçbir şey silmeyen `deleteUserFilesFromR2` ve çağrısı kaldırıldı, Register §15/§17 ve SECURITY_COMPLIANCE düzeltildi. Testler önce kırmızı, sonra yeşil; 5/5 mutant KILLED. Dal `be-fb/u6-r2-user-files` a3e52e93, push/merge yok.
platform: mac (darwin 27.0.0, arm64): MinIO RELEASE.2025-10-15 (brew, Docker'sız) ve izole Postgres 16 (scratchpad, :55493) ile koşuldu. Değişen kod yolu platformdan bağımsız: S3 SDK çağrısının kaldırılması, saf TS, dosya yolu/süreç/kabuk farkı yok. Linux (CI ubuntu) koşulamadı; CI işinde S3 servisi yok, bu yüzden yeni MinIO testi orada atlar. Birim bekçisi ve gdpr canlı testi CI'da koşar. Windows koşulamadı, makine yok; proje Windows'u hedeflemiyor.
sürüm: 1
tarih: 2026-10-01T14:00:19.014Z
---

# U-6 — deleteUserFilesFromR2: ölü `users/` öneki kaldırıldı, kişi silme depoya dokunmuyor

## 1) Ne yapıldı

Kart iki çıkış yolu veriyordu: "gerçek öneklere bağla + sayfala" ya da "önek yoksa kaldır, nedenini yaz". Koddan çıkan sonuç: **kişiye ait bir önek yok.** Bu yüzden ikinci yol uygulandı.

### Önek/sahiplik tablosu (dev 6afd21b7)

| Nesne | Anahtar | Yazan (dosya:satır) | Sahip | Kişi silmede |
|---|---|---|---|---|
| Kanıt (onaylı) | `<tenantId>/<org>/<cat>/<yıl>/<hash>_<ad>.<ext>` | `src/lib/storage.ts:63` (`generateR2ObjectKey`); çağıranlar `storage.ts:421` (`uploadFileToR2`), `evidence/actions.ts:86,345` | **Kurum.** `Evidence`'ta kişi kolonu yok, yalnız `createdBy` metni var (`schema.prisma:1013`) | Dokunulmaz |
| Kanıt (onay bekleyen) | `<tenantId>/incoming/<org>/…` | `storage.ts:174` (`incomingKeyOf`), `api/evidence/mock-upload/route.ts:56` | Kurum | Dokunulmaz |
| Ajans logosu | `<tenantId>/agency/cobrand/<uuid>.png` | `src/lib/agency/cobrand-store.ts:106` | Kurum | Dokunulmaz |
| Geri bildirim ekran görüntüsü | `feedback/<tenantId>/<yıl>/<feedbackId>.<ext>` | `src/lib/feedback/submit.ts:104` | **Kurum.** Satır silmede tutulur, yalnız `userId` NULL'lanır (`users-scheduled-deletion.ts:153`) | Dokunulmaz. Satır kalınca dosya da kalır |
| `users/<userId>/…` | — | **Hiçbir yazan yok.** Yalnız dev'deki `storage.ts:491` silme listesinde geçiyor; `git log -S` ile tarihte de yazan çıkmadı | — | Eski kod bunu listeliyordu, boş döner |
| `User.image` | Google profil URL'si | Auth.js, depoda değil | — | Depo konusu değil |

Kurum dosyası kişi silmede silinmez. Kural kodda (`users-scheduled-deletion.ts:106-113` yorumu), register §15'te ve testlerde sabit.

### Değişiklik
- `deleteUserFilesFromR2` (`storage.ts:481-512`) silindi; kullanılmayan `ListObjectsV2Command`/`DeleteObjectsCommand` importları da kaldırıldı.
- `users-scheduled-deletion.ts`: import ve "1. önce depolama" adımı kaldırıldı. Yerine nedenini anlatan yorum kondu.
- `docs/legal/processing-register.md`: §15 Saklama, Tedbir ve Kaynak satırları; §17 veri kategorileri satırı ("imha sırasında R2 dosyaları" iddiası kaldırıldı).
- `docs/SECURITY_COMPLIANCE.md:126`: silme sırasından "R2 dosyaları" çıkarıldı.
- Testler:
  - `tests/users-scheduled-deletion.test.ts`: depo modülünün tüm silme export'ları kaydediciyle mock'landı, kaldırılan fonksiyon dahil. Yeni test: "leaves the object store alone".
  - `tests/user-erasure-object-store.test.ts` (yeni): gerçek S3/MinIO kullanır, uygulamanın istemcisi istekleri sayan bir proxy'den geçer. 1001 kanıt, 1 staging, 1 logo ve 1 ekran görüntüsü olmak üzere 1004 nesne seed edilir, hepsi uygulamanın kendi anahtar üreticileriyle. Sayım `ContinuationToken` ile sayfalıdır. Testin iddiası: purge depoya 0 istek atar ve 1004 nesnenin hepsi kalır.
  - `tests/gdpr-data-subject.live.test.ts`: `toHaveBeenCalledWith(subject)` yerine `storeDelete` için `not.toHaveBeenCalled()` kondu. Bu bilinçli bir sözleşme değişikliği, test gevşetilmedi; eski iddia ölü kodu sabitliyordu.

## 2) Kanıt (kopyalanmış çıktı)

**Kırmızı (düzeltmeden önce, dev kodu):**
```
tests/users-scheduled-deletion.test.ts
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
    Array [ "deleteUserFilesFromR2", "user-due" ]
      Tests  1 failed | 13 passed (14)

tests/user-erasure-object-store.test.ts  (MinIO)
AssertionError: requests the purge sent to the object store: expected [ Array(1) ] to deeply equal []
+   "GET /u6bucket/?list-type=2&prefix=users%2Fu6-mupl8w4b-user%2F",
      Tests  1 failed | 1 passed (2)
```
Son satır ölü öneki gerçek depoda gösteriyor: purge `users/<id>/` listeliyor ve boş dönüyor.

**Yeşil (a3e52e93):**
```
users-scheduled-deletion + user-erasure-object-store: Test Files 2 passed; Tests 16 passed
gdpr-data-subject.live (CI=true, izole PG):         Test Files 1 passed; Tests 20 passed (20)
Tam vitest (CI=true, DB + MinIO + CI'nin AUTH_SECRET fixture'ı):
 Test Files  308 passed | 2 skipped (310)
      Tests  4160 passed | 9 skipped (4169)          rc=0
live-skip-gate: {"ok":true,"liveFiles":48,"livePassed":471,"skipped":[],"allowed":1,"problems":[]}
tsc --noEmit rc=0 · eslint (tüm repo) rc=0 · prettier --check (yeni dosya) temiz
```
9 atlama: adapters 2, k1-daily-calls 4, sedia-adapter 2 (bunlar canlı olmayan dosyalar) ve k1-embeddings 1 (izinli ücretli opt-in). İlk tam koşuda 3 dosya "AUTH_SECRET is not set" ile düştü. Sebep benim ortamımdaydı: CI bu değeri ci.yml:141'de veriyor. Aynı değerle yeniden koşunca 46/46 geçti, ikinci tam koşu da temiz.

**Mutantlar** (her biri ayrı uygulandı, iki dosya koşuldu, sonra `git checkout HEAD` ile geri alındı ve `tree == HEAD` doğrulandı):

| # | Mutant | Birim | MinIO |
|---|---|---|---|
| M1 | Önek eski hâline: dev'deki `storage.ts` ve iş dosyası olduğu gibi geri (`users/` + tek sayfa) | KILLED (1 çağrı) | KILLED (1 istek) |
| M2 | "Düzeltme" kurum önekine bağlanır, **sayfalama yok** | KILLED | KILLED. Yalnız hayatta-kalma iddiasıyla: `expected 3 to be 1004`. İlk 1000 kurum dosyası silindi, sayfa sınırı tam görünüyor |
| M3 | Kurum önekine bağlanır, sayfalı | KILLED | KILLED. Yalnız hayatta-kalma iddiasıyla: `expected +0 to be 1004` |
| M4 | Yalnız `feedback/<tenant>/` silinir | KILLED | KILLED (2 istek) |
| M5 | `deleteFileFromR2` ile ekran görüntüsü yolu | KILLED (2 çağrı) | KILLED |

M1 gdpr canlı testinde de KILLED: `× erases the due subject for real … AssertionError: expected "vi.fn()" to not be called at all`.

Kartın "sayfalama kaldır" mutantı bu çözümde doğrudan uygulanamıyor, çünkü sayfalayan kod kalmadı. Onun yerine M2 koşuldu: sayfasız silme. Bu mutant >1000 nesnenin neden gerektiğini de gösterdi; 1004 nesneden 3'ü kaldı.

## 3) Değişen dosyalar
Dal `be-fb/u6-r2-user-files`, commit `a3e52e93` (dev 6afd21b7 üstüne), 7 dosya, +339/−50:
`src/lib/storage.ts`, `src/lib/jobs/tasks/users-scheduled-deletion.ts`, `tests/users-scheduled-deletion.test.ts`, `tests/user-erasure-object-store.test.ts` (yeni), `tests/gdpr-data-subject.live.test.ts`, `docs/legal/processing-register.md`, `docs/SECURITY_COMPLIANCE.md`. Push ve merge yapılmadı.

## 4) Riskler
- **Hukuki/ürün kararı örtük kaldı.** Kişinin yüklediği kanıt ve geri bildirim ekran görüntüsü kurumun kaydı sayılıyor. Bu, iş dosyasındaki mevcut karar ("Feedback satırı kurumun") ile tutarlı, ama ekran görüntüsü kişinin ekranını içerebilir. Register §14 bunu zaten "açık" diye işaretliyor. se-fb (U-7) ve DPA ile gözden geçirilmeli.
- **Kurum silme akışı yok.** Dosyalar kurum silinince gitmeli, ama böyle bir akış henüz yok. Register §15'e "açık" olarak yazıldı (ADR-0010).
- Yeni MinIO testi CI'da atlar, çünkü S3 servisi yok; mevcut S3 testleri de aynı durumda. CI'da sözleşmeyi birim bekçisi ve gdpr canlı testi tutuyor. Yeni dosya `.live.` adı taşımıyor, çünkü DB'ye ihtiyacı yok ve live-skip kapısının izin listesine girmesi gerekmiyor.
- Doğrulama MinIO ile yapıldı. R2 listeleme sayfa boyutu da 1000, ama birebir aynı davranış ölçülmedi.

## 5) Açık sorular
- **ADR-0010 taslağında (dal be-fb/p5-tenant-export-prep) düzeltme gerekiyor:** §81 ve Ek tablo satır 102 staging önekini `incoming/<tenantId>/` diye yazıyor. Doğrusu `<tenantId>/incoming/…` (`storage.ts:174`), yani zaten `<tenantId>/` öneki içinde. Kurum silmede üç değil iki önek var: `<tenantId>/` ve `feedback/<tenantId>/` (exports eklenirse üç). O dala bu kartta dokunmadım.
- U-3 (kurum silme) sayfalı önek silicisini yazacak. M2/M3 mutantı ve bu dosyadaki >1000 seed düzeneği oraya taşınabilir.

## 6) Sonraki adım
1. İnceleme (crw/crw2) → dev'e alma (entegrasyon kartı).
2. ADR-0010'daki staging öneki düzeltmesi (be-fb).
3. se-fb: register §14/§15 "kişinin yüklediği dosya kurumun kaydıdır" ifadesini DPA ile hizalasın (U-7).

## Temizlik
Kendi `minio server` sürecim (pid 53546, :59410) ve `pg_ctl` (:55493) durduruldu; `lsof` her iki portta 0 dinleyen gösteriyor. minio-data ve pgdata silindi. `git worktree remove` + `prune` yapıldı; dal ve commit duruyor. `minio` brew paketini ben kurmadım, bu yüzden kaldırmadım. Scratchpad'de yalnız 1.7 MB log/JSON kaldı.
