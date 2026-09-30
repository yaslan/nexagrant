# TASK-MUO3B9HCYR1NG — crw-fb — İNCELEME-82: kanıt confirm atomikliği (TASK-MUO122UPRPJQH, fe-fb, c1936413 + merge 9aa5c286)

**Durum:** TAMAM
**Karar:** ONAY, bloke eden bulgu yok. B-1 kapandı: yavaş, kapalı ya da yarıda ölen depoda ve satır kaydı hatasında dosya kaybolmuyor, sahte başarı dönmüyor, aynı confirm yeniden denenince başarılı oluyor. Bu 19 ayrı arıza yolunda canlı olarak doğrulandı. D-1 ve D-2 de kapalı. Yeni bir yarış bulgusu var (Y-1, DÜŞÜK-ORTA): iki confirm üst üste binerse kayıtlı dosya, `success` dönen confirm'den sonra aynı tür ve uzunlukta başka bir içerikle değişebiliyor. Ayrıca iki test boşluğu var (T-1, T-2). Üçü de ayrı kartla izlenebilir.
**İncelenen:** `c1936413` (dev merge `9aa5c286`), dev HEAD `8ddcb5b6` üzerinde ayrı worktree. Kod değiştirilmedi. Mutantlar dosyanın kopyasından geri yazıldı (`git status --short src` → boş).
**Ortam:** izole Postgres `crwfb82-pg` (127.0.0.1:55482). CI sırası: `db push` → `db:rls-role` → `apply-migrations` ×2 → `db:rls` → `db:seed`. Makinede psql olmadığı için `apply-migrations` psql'i kabın içinde çalıştıran bir sarmalayıcıyla (`psql82`) koştu. MinIO `crwfb82-minio` (127.0.0.1:59482) kullanıldı; önünde istek başına arıza enjekte eden kendi HTTP proxy'im vardı. Paylaşılan :5433'e yazılmadı.
**Kart spec'i:** `list_tasks` kart açıklamasını döndürmüyor. Bu yüzden delegasyon metnindeki deneme listesine uydum: B-1 canlı tekrarı, adım adım arıza, eşzamanlılık, D-1, D-2, mutantlar, kapılar.

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26, vitest 4.1.11, `pgvector/pgvector:pg16`, `bitnamilegacy/minio`). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız mac var. Koddan çıkarımlar:
- Prod yolu (S3 HEAD / ranged GET IfMatch / CopyObject CopySourceIfMatch / HEAD / DELETE) ve Y-1 yarışı platformdan bağımsız.
- Dev deposu `copyFile(staging → final.<rnd>.partial)` + `rename(partial → final)` kullanıyor.
  - Linux'ta mac'teki gibi çalışır.
  - Windows'ta `rename` hedefin üzerine yazar. Hedef açıksa `EPERM`/`EBUSY` verir; kod bu durumda `.partial`'ı siler ve `storage_unavailable` döner, staging yerinde kalır.
  - Y-1 dev deposunda da aynı biçimde geçerli, çünkü `rename` kayıtlı dosyanın üzerine yazar.
- mac APFS büyük/küçük harf duyarsız. `org=INCOMING` gibi bir anahtar `T/INCOMING/...` final yoluna gider. Bu yol diskte `T/incoming/...` ile aynı dizine düşer, ama o yola eşlenen geçerli bir staging anahtarı yok: segment sayısı tutmuyor. Bunu D-1 denemeleriyle kontrol ettim, çakışma yok.

## 1. Ne yapıldı
- `c1936413` diff'ini satır satır okudum: `actions.ts`, `storage.ts`, i18n, live-skip-gate. İstemcideki `evidence-client.tsx` confirm çağrısına da baktım; yeni `save_failed` kodu `upload.error.*` üzerinden gösteriliyor.
- Kendi saldırı suite'imi yazdım: `zz-crwfb82-attack.live.test.ts`, 23 test. Gerçek MinIO, gerçek Postgres (RLS rolü) ve gerçek server action'larla koşuyor. İçinde B-1 tekrarı, 10 depo arıza noktası, 4 DB arıza noktası, staging DELETE hatası, reddedilen dosya, 2× ve 5× eşzamanlı confirm, iki yarış senaryosu ve docker pause/stop var.
- D-1 için 21 anahtar atlatma denemesi yaptım (`zz-crwfb82-d1.test.ts`). Presign → confirm gidiş-dönüşünü 35 garip dosya adı ve kategori birleşimiyle denedim.
- 14 mutant koştum (`mut82.py`). Bunlar fe-fb'nin M1–M13'ünden farklı. Hedef, repodaki 10 evidence suite'i (112 test).
- Tam `npx vitest run` ve typecheck/lint/i18n/build koştum.

## 2. Bulgular (önem sırasıyla)

### Y-1 — DÜŞÜK-ORTA (bloke etmiyor): üst üste binen iki confirm, `success` dönmüş bir satırın dosyasını değiştirebiliyor
**Yer:** `src/app/[locale]/(app)/[workspace]/evidence/actions.ts` ("zaten kayıtlı mı?" `findFirst` → `copyIncomingObject` → `create`), `src/lib/storage.ts` `copyIncomingObject`.

"Kayıtlı mı?" okuması kopyalamayla atomik değil. Unique index yalnız *satırı* korur, final anahtara yapılan `CopyObject`'i korumaz.

Senaryo:
1. Confirm A, v1'i final anahtara kopyalar.
2. İmzalı PUT URL'si 15 dakika geçerli. URL'yi tutan kişi staging'e aynı tür ve uzunlukta v2 yükler.
3. Confirm C başlar. A'nın satırı henüz commit edilmediği için C "kayıtlı değil" görür, v2'yi kontrol eder ve kopyalar.
4. A satırını yazar ve `success` döner.
5. C'nin kopyası A'nın commit'inden **sonra** iner. C `P2002` → `already_confirmed` alır, ama final anahtarda artık v2 durur.

Canlı kanıt (`attack-lines.txt`, RACE-2). Depo yavaşlığı proxy ile kuruldu: A'nın final HEAD'i 1,5 sn, C'nin CopyObject'i 2,5 sn, A'nın staging DELETE'i 4 sn.
```
RACE-2 → A={"success":true,"evidence":{"id":"cmuo4im79…"}} C={"success":false,"error":"already_confirmed"} rows=1 rowId==A: true
   final==v1: false  final==v2: true  download of A's row serves: % FORGED   certificate, valid until 2099
```
Diğer sıralamada (RACE-1) C satırı kazanıyor ve satır ile dosya tutarlı kalıyor, ikisi de v2. Kullanıcının ilk confirm'ü ise `already_confirmed` görüyor.

**Neden gerileme:** 2efa909f'de satır önce ekleniyordu. İkinci confirm unique kilidinde bekleyip `P2002` ile *kopyalamadan önce* duruyordu. Kodda "a second confirm … stops here, before it copies anything over the first one's file" yazıyordu. B-1'i kapatan yeni sıra bu garantiyi, kopya anındaki kısa pencere için kaldırdı. fe-fb raporundaki "Final anahtara denetimsiz bayt yazılamaz" cümlesi doğru: v2 de kontrolden geçmiş bir dosya. Ama "kayıtlı dosya confirm'den sonra değişmez" (D-1/D-3 niyeti) artık her durumda doğru değil. `actions.ts`'teki "a PUT to the staging key after confirm cannot reach the recorded file" yorumu da bu pencerede geçerli değil.

**Etki neden sınırlı:**
- Confirm çağırabilen, kiracıda `edit_proposal` yetkisi olan biri olmalı.
- İmzalı URL'yi tutuyor olmalı. Pratikte bu, yükleyicinin kendisi demek.
- Pencere yalnız A'nın kopyası ile C'nin kopyası arasındaki süre. Confirm'ler bitince dosya sabit. Kimsenin satırı "doğrulayabileceği" bir an bu pencereye düşmüyor.
- Form `isUploading` ile çift tıklamayı kilitliyor.
- Üçüncü bir kişi URL'yi ele geçirse bile PUT tek başına final'e ulaşmaz; yetkili bir kullanıcının aynı anda ikinci bir confirm göndermesi gerekir.

**Öneri** (en küçük doğru değişiklikten başlayarak):
- (a) Rezervasyon satırı. Kısa bir tx'te satırı ekle; boyut ve mime NULL olsun, bu unique rezervasyon olur. Commit et, sonra kontrol et ve kopyala, sonra ikinci kısa tx'te boyut ve mime'ı yaz. Kaybeden confirm `P2002` ile kopyalamadan durur. Hata olursa satırı sil, staging kalsın; B-1 garantileri korunur.
  - Bu sırada liste ve indirme yolları, boyutu NULL olan satırı "hazır değil" saymalı.
- (b) Alternatif: `CopyObject`'e hedef koşulu (`If-None-Match: *`) ekle. R2 ve MinIO'nun CopyObject'te bu başlığı destekleyip desteklemediğini **doğrulamadım**, bu bir varsayım.
- Regresyon testi: RACE-2 (`zz-crwfb82-attack.live.test.ts`, "concurrency 2"). Beklenen: `final == v1`.

### T-1 — DÜŞÜK (test boşluğu): D-1 anahtar deseninden `^` düşerse iç içe atlatma geri açılıyor, hiçbir test kırmızı olmuyor
Mutant **N7** (`/^incoming…/` → `/incoming…/`) SAĞ KALDI: 112/112 yeşil. Bu mutantta (`n7.txt`):
```
T/incoming/incoming/org-default/certificate/2026/deadbeef_x_pdf.pdf → "T/incoming/org-default/certificate/2026/deadbeef_x_pdf.pdf"   (final = yine bir staging anahtarı)
```
Bu tam olarak İNCELEME-77 D-1 açığı. `tests/evidence-incoming-key.test.ts`'deki "nested incoming, full shape below it" girdisinde `org` segmenti yok. Bu yüzden çapasız desen o girdiyle de eşleşmiyor ve test mutantı yakalamıyor. Mevcut kod doğru; dev HEAD'de iki girdi de `null` dönüyor.

**Öneri:** Red listesine `${T}/incoming/incoming/org-default/certificate/2026/deadbeef_n_pdf.pdf` ve `${T}/incoming/zzz/incoming/org-default/…` eklensin.

### T-2 — DÜŞÜK (test boşluğu): dev deposunda B-1 garantisi ve ön-kontrol DB hatası bekçisiz
- **N9** SAĞ KALDI: dev deposu staging'i yine `rename` ile taşıyor, eski davranış. Dev'de satır kaydı başarısız olursa staging kaybolur ve yeniden deneme `object_missing` alır. Prod'u etkilemez.
- **N5** SAĞ KALDI: "kayıtlı mı?" okumasındaki DB hatası yutulup kopyaya devam ediliyor. O çağrı için D-3 korumasını kaldırıyor. Benim suite'im (`findFirst DB error → save_failed`) bunu yakalıyor, repo suite'i yakalamıyor.

**Öneri:** `evidence-dev-store.live`'a "create hatası → staging duruyor" testi, fault suite'ine ön-kontrol DB hatası testi eklensin.

### Bilgi
- **Sonuç ekvivalan ya da temizlik niteliğindeki sağ kalanlar:**
  - N8: final HEAD'de tür karşılaştırması. `MetadataDirective: COPY` türü koruyor.
  - N12: ETag yoksa `*`. MinIO ve R2 her zaman ETag döner.
  - N13: dev `.partial` artığı.
  - N14: dev kopya sonrası doğrulama.
- **Commit'ten sonra cevap kaybolursa:** kullanıcı `save_failed` görüyor ama satır ve dosya yerinde. Yeniden denemede `already_confirmed` alıyor ve staging temizleniyor. Veri kaybı yok, yalnız mesaj yanıltıcı.
- **Arayüzde yeniden deneme:** "Tekrar deneyin" formu yeniden gönderir. Bu yeni bir presign ve yeni bir anahtar demek. Sunucudaki aynı-anahtar idempotentliğini UI kullanmıyor. Eski staging (lifecycle kuralı) ve olası yetim final kopya (D-3, süpürücü kartı) geride kalıyor.
- **`rag-pdf-worker-isolation` "fast" testi** tam koşuda iki kez de kırmızıydı (6,0 sn ve 6,9 sn). Tek başına yeşil. Makinenin yük ortalaması 32–44'tü. Bu işle ilgisi yok; süreye bağlı bir assert yük altında kırılıyor. Ayrı bir kararlılık notu olarak iletilebilir.

## 3. Kanıt
Ekler: `docs/agent-results/TASK-MUO3B9HCYR1NG-crw-fb-ekler/`.

**B-1 tekrarı ve adım adım arıza** (`attack-lines.txt`). Her satırdan sonra aynı anahtarla temiz bir yeniden deneme yapıldı. Her birinde sonuç `success`, 1 satır, final baytları yüklenenle aynı, staging yok.
```
slow-after-copy (12475 ms) → success=true rows=1 finalEqUpload=true staging=false        (İNCELEME-77'de: success=true, id=ev-…, rows=0, dosya yok)
staging HEAD dropped / 503  → storage_unavailable  rows=0 stagingIntact=true final=false
staging HEAD 404            → object_missing       rows=0 stagingIntact=true final=false
ranged GET dropped / 500    → storage_unavailable  rows=0 stagingIntact=true final=false
CopyObject dropped/500/412  → storage_unavailable  rows=0 stagingIntact=true final=false
final HEAD dropped          → storage_unavailable  rows=0 stagingIntact=true final=true (yetim, D-3)
final HEAD 404              → object_missing       rows=0 stagingIntact=true final=true
findFirst DB error          → save_failed          rows=0 stagingIntact=true final=false
create rolled back          → save_failed          rows=0 stagingIntact=true final=true
P2028 (kilitli unique, confirm 6711 ms) → save_failed rows=0 stagingIntact=true
reply lost after commit     → save_failed rows=1 staging=true → retry already_confirmed, staging=false
staging DELETE 500          → success=true rows=1 staging=true → again already_confirmed, staging=false
refused (HTML .pdf)         → unsupported_type rows=0 staging=false final=false
2x confirm → ok,already_confirmed rows=1 finalEqUpload=true
5x confirm → ok,already_confirmed ×4 rows=1 finalEqUpload=true staging=false
docker PAUSE 8s → success=true ms=8176 rows=1 finalEqUpload=true staging=false
docker STOP → storage_unavailable ms=116 rows=0 stagingIntact=true → docker start → retry success, finalEqUpload=true
RACE-1 / RACE-2 → Y-1 (yukarıda)
Tests  2 failed | 21 passed (23)      (iki kırmızı = Y-1'in iki sıralaması; beklenen)
```

**D-1** (`d1-probes.txt`). 21 denemenin 17'si `null` döndü. Bunlar: iç içe (kısa, tam, çift), `..`, `%2F`, sonda `\n`, başta `/`, `//`, `.PDF`, 9 haneli hash, fazladan segment, unicode, URL biçimi, dizi, başka kiracı. Kalan 4'ü final anahtar döndü ve hiçbiri staging anahtarı değil:
- `INCOMING` ve `Incoming` org → `T/INCOMING/…`, `T/Incoming/…`. S3 büyük/küçük harf duyarlı, dev APFS'te de çakışma yok (platform beyanına bakın).
- `category=incoming` → `T/org-default/incoming/…`.
- Başka kiracının id'si org olarak → yine kendi kiracı öneki altında kalıyor.

Presign → confirm gidiş-dönüşünde 35 birleşimin hiçbiri kırılmadı (`BELGE.PDF`, `Ş ğ ü.pdf`, 300 karakter, `.pdf`, uzantısız, `İzin Belgesi`, `../x` …).

**D-2:** `evidence-page-role.test.ts`, benim kısmi mutantım N11'i ("yalnız MEMBER'da rol yok sayılır") öldürdü. fe-fb'nin M11/M12'si de öldürülmüştü.

**Mutantlar** (`mutants.txt`), 10 evidence suite'ine (112 test) karşı. 8 KILLED, 6 SURVIVED:
```
KILLED   N1 404 de yeniden-denenebilir         KILLED   N2 her depo hatası object_missing
KILLED   N3 satır hatasında staging silinir     KILLED   N4 zaten-kayıtlı dalı staging silmez
SURVIVED N5 ön-kontrol DB hatası yutulur → T-2  KILLED   N6 her hata kalıcı sayılır (staging silinir)
SURVIVED N7 desende ^ yok → T-1                 SURVIVED N8 final HEAD'de tür yok (ekvivalan)
SURVIVED N9 dev staging'i taşır → T-2           KILLED   N10 P2002'de sahte başarı
KILLED   N11 D-2 yalnız MEMBER                  SURVIVED N12 ETag yoksa * (pratikte ekvivalan)
SURVIVED N13 dev .partial artığı (temizlik)     SURVIVED N14 dev kopya doğrulaması (temizlik)
git status --short src after restore: []
```

**Kapılar** (`gates2.txt`, `full-vitest-summary.txt`, `build-tail.txt`):
```
typecheck rc=0 · lint rc=0 · i18n ✅ both catalogs agree · build rc=0
  (ƒ /[locale]/[workspace]/evidence · ƒ /api/evidence/[id]/download · ƒ /api/evidence/mock-upload)
CI=true npx vitest run (izole DB + MinIO env):
  Test Files 1 failed | 288 passed | 2 skipped (291) · Tests 1 failed | 3579 passed | 9 skipped (3589)
  tek kırmızı: rag-pdf-worker-isolation "128 MB … fast" (6,9 sn > 2 sn) — tek başına 1/1 yeşil, load avg 32–44
  evidence suite'leri (S3 dahil, atlanmadan): 9 dosya / 108 test yeşil
```
İlk tam koşuda (`[koşu-1]` satırları) ek bir kırmızı vardı: `teardown-where-guard`. Sebebi benim ağaçta unuttuğum `zz-*` dosyam. Dosyalar eklere taşındı ve ikinci koşu temiz ağaçta yapıldı; tsc ve lint'teki kırmızılar da aynı dosyalardandı.

## 4. Değişen dosyalar
Kod değişmedi. Yalnız bu rapor ve ekleri eklendi:
- `docs/agent-results/TASK-MUO3B9HCYR1NG-crw-fb.md`
- `docs/agent-results/TASK-MUO3B9HCYR1NG-crw-fb-ekler/`: saldırı, D-1 ve N7 suite'leri (repoya girmedi), `mut82.py`, `psql82`, koşu çıktıları. Kimlik bilgileri ortamdan okunuyor; dosyalarda sır yok.

## 5. Riskler
- Y-1 yukarıda anlatıldı. Düzeltme (a) seçilirse B-1'in fault suite'i ve benim suite'im aynen yeniden koşulmalı, çünkü rezervasyon satırı yeni bir "satır var, dosya yok" durumu getirir.
- S3 isteklerinde zaman aşımı yok. fe-fb bunu açık soru olarak bıraktı. docker pause'ta confirm depo dönene kadar bekledi (8 sn). Artık veri kaybı yok, yalnız bekleme var.

## 6. Açık sorular
- Y-1 için (a) rezervasyon satırı mı, (b) koşullu CopyObject mi? (b) için R2 desteği doğrulanmalı. Ben (a)'yı öneriyorum.
- Y-1 ayrı kart mı olsun, yoksa D-3 süpürücü kartıyla birlikte mi ele alınsın? Karar liderin.

## 7. Sonraki adım
- fe-fb için kart: Y-1 (+ RACE-2 regresyon testi), T-1 (iki red girdisi), T-2 (dev create-hatası ve ön-kontrol DB hatası testleri).
- Temizlik: `crwfb82-pg` ve `crwfb82-minio` kapları ve worktree kaldırılacak.
