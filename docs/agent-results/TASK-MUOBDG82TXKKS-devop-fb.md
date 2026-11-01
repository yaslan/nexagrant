# TASK-MUOBDG82TXKKS — devop-fb — FB İNCELEME-103: confirm havuz düzeltmesi, push öncesi son inceleme

**Durum:** TAMAM
**Karar:** **ONAY — push'a engel yok.** İNCELEME-92'deki B-1, Y-2 ve Y-3 kapandı. Bunu fe-fb'nin testleriyle değil, kendi saldırı suite'imle gösterdim. Bu suite uygulama havuzunu ve kilit havuzunu **mock'suz** kullanıyor ve `fabrika_app` rolüyle koşuyor. Kalan her şey düşük seviyede ve push'u bloke etmiyor:
- iki test boşluğu (T-6, T-7),
- havuz dışında, düzeltmeden önce de var olan bir gözlem (G-1).

**İncelenen:** TASK-MUO9IFMMVRUDJ (fe-fb) `54167534`, dev merge `6d791a4c`.
- Denemeler dev `1c85d126` üzerinde, ayrı worktree'de yapıldı. Bu commit'te `src/lib/db.ts`, `src/lib/storage.ts`, `evidence/actions.ts` ve iki test dosyası `6d791a4c` ile birebir aynı (`git diff --stat` boş).
- Mutantlar ikinci bir worktree'de koşuldu.

**Ortam:**
- İzole Postgres `devopfb103-pg` (127.0.0.1:55203, `pgvector/pgvector:pg16`) ve MinIO `devopfb103-minio` (127.0.0.1:59203, `bitnamilegacy/minio`).
- Kurulum CI sırasıyla yapıldı: `db push` → `db:rls-role` → `apply-migrations` ×2 (psql kabın içinde, sarmalayıcıyla; ikisi de "41 files applied") → `db:rls` → `db:seed`.
- Paylaşılan :5433'e hiç bağlanılmadı. Kod değiştirilmedi. Saldırı suite'i repoya girmedi, yalnız ekte duruyor.

Koşmadan önce doğrulanan URL'ler (parola maskeli):
```
kapılar / fe-fb suite'leri / mutantlar:  DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55203/fabrika
                                          DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@127.0.0.1:55203/fabrika
saldırı suite'i (uygulama ve kilit havuzu gerçek, RLS rolüyle):
                                          DATABASE_URL=postgresql://fabrika_app:***@127.0.0.1:55203/fabrika   (suite içinde: "app pool role=fabrika_app")
```

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26.5, vitest 4.1.11, Docker'da pg16 + MinIO). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız mac var. Koddan çıkarımlar:
- Değişiklik platforma bağlı değil. `pg.Pool`, `set_config(…, true)` ve `pg_advisory_xact_lock` Postgres ile Node tarafında çalışıyor. `AbortSignal.timeout` Node'un kendi zamanlayıcısı.
- D6 süreç ölümü denemesi POSIX sinyali kullanıyor (SIGKILL/SIGSTOP). Windows'ta SIGSTOP karşılığı yok. Ancak kilidi bırakan şey Postgres tarafı: bağlantı kopunca ya da `idle_in_transaction_session_timeout` dolunca kilit düşüyor. Bu yüzden donma ya da ölümün etkisi her işletim sisteminde aynı.
- Prod Linux konteynerinde uzun ömürlü bir Node süreci. Süreç başına en fazla 10 + 3 Postgres bağlantısı açılıyor.

## 1. Ne yapıldı

1. Diff'i ve kütüphane iç yapısını okudum: `@prisma/client` 7.10 TransactionManager ve `@prisma/adapter-pg` 7.10 `startTransaction`. İki soruyu koddan cevapladım:
   - **Tx başlatma `maxWait` ile yarıda bırakılırsa bağlantı sızar mı?** Sızmaz. Prisma geç gelen başlangıcı bekliyor ve `ROLLBACK` + `rollback()` ile kapatıyor (`#o(a)`). D2'de ölçüldü: 6 sn sonra kilit havuzunda `idle in transaction` bağlantı yok.
   - **İdle-kill bağlantısı süreci çökertir mi?** Çökertmez. adapter-pg, tx süresince bağlantıya `error` dinleyicisi takıyor, bu yüzden "unhandled error" oluşmuyor. D4'te ölçüldü: ölen bağlantı havuza geri dönmüyor.
2. fe-fb'nin iki suite'ini benim ortamımda koştum: `evidence-confirm-store-faults` ve `lock-pool`, **22/22 yeşil** (`fefb-suites.txt`).
3. Kendi saldırı suite'imi yazdım: `zz-devopfb103.live.test.ts`, D1–D7. Uygulama ve kilit havuzu gerçek, tenant kontrolü (`requireTenantAction` → pilot kontrolü) gerçek, depo proxy'li MinIO. D6 için ayrıca bir çocuk süreç suite'i var. Sonuç **7/7 yeşil**.
4. 12 yeni mutant (Q1–Q12) yazdım ve önce fe-fb'nin evidence + lock-pool suite'lerine (131 test) karşı koştum. Hayatta kalanları sonra kendi suite'ime karşı koştum.
5. Tam kapıları koştum (§2).

### Denemeler ve sonuçları (`attack103-log.txt`)

**D1 — kendi B-1 senaryom.** Depodaki her çağrı 2.5 sn geciktirildi (HEAD+GET+Copy+HEAD zinciri ≈ 10 sn). A kiracısı aynı anda 10 confirm gönderdi. B kiracısı 12 sn boyunca her 250 ms'de 5 paralel sorgu attı, gerçek uygulama havuzundan (`withTenant`). `pg_stat_activity` her saniye örneklendi.
```
D1 confirms: ok@12596, ok@12596, ok@12596, save_failed@5023, save_failed@5021, … (7× save_failed ≈5.03 sn)
D1 B probes: 235 total, 0 FAIL, max 27 ms, p50 6 ms
D1 pg_stat_activity 1.0s app:idle=10 fonbridge-lock-pool:idle in transaction=3   (… 10.1 sn'ye kadar aynı)
D1 peak lock-pool conns=3 peak app-pool idle-in-tx (≥1 s)=0
D1 retries: ok,ok,ok,ok,ok,ok,ok
```
- B'nin sorgularının hiçbiri düşmedi; en yavaşı 27 ms sürdü. İNCELEME-92'de aynı durumda B'nin sorgusu 1001 ms'de "timeout exceeded" alıyordu.
- Uygulama havuzunda 1. saniyeden sonra tx tutan bağlantı yok. Kilit havuzu 3 bağlantıda kalıyor.
- Sahte başarı yok: her `ok`'ta tam 1 satır var. Her `save_failed`'da satır yok ve staging nesnesi baytı baytına duruyor. 7 yeniden denemenin 7'si başarılı.
- Not: 0. saniye örneğinde `app:idle in transaction=10` görünüyor. Bu, her confirm'ün başındaki kısa pilot kontrolü (`requireTenantAction` → `withTenant`), kopya değil. 1. saniyeden itibaren 0.

**D2 — 3 bağlantılık kilit havuzu doluyken 4. ve 5. confirm.** İlk üç confirm'ün kopyası tutuldu, sonra iki confirm daha gönderildi.
```
D2 4th/5th: {"success":false,"error":"save_failed"} in 5004 ms | {"success":false,"error":"save_failed"} in 5004 ms
D2 warn: [confirmEvidenceUploadAction] DB error: Transaction API error: Unable to start a transaction in the given time.
D2 while full: fonbridge-lock-pool:idle in transaction=3
D2 first three: ok,ok,ok     D2 after (6 s): (kilit havuzunda idle-in-tx yok)     D2 retry: ok,ok
```
- Beklenen davranış görüldü: 5.0 sn bekleme, ardından yeniden denenebilir `save_failed`. Arayüz bunu "Belge kaydedilemedi. Tekrar deneyin." (`messages/tr.json:269`) olarak gösteriyor.
- Log mesajı anlamlı (P2028).
- Satır yok, staging nesnesi korunuyor, final anahtar boş. Sahte başarı yok ve geç başlayan tx'ten sızan bağlantı yok.

**D3 — tx'e yerel sınırlar oturuma sızmıyor.** Beş yoldan geçildi: başarı, `already_confirmed`, `object_missing`, **gerçek `statement_timeout`** (admin, `Evidence` tablosunu 8 sn `ACCESS EXCLUSIVE` kilitledi) ve **gerçek `lock_timeout`** (admin, confirm kilidini 12 sn tuttu). Ardından kilit havuzunun canlı bağlantılarının **hepsi** aynı anda okundu.
```
D3 paths: already=already_confirmed missing=object_missing stmt=save_failed@5021ms lock=save_failed@10016ms
D3 lock pool: pid 794/798/797 → lock_timeout=0 statement_timeout=0 idle=0   live=797,798,794  (canlı bağlantıların tamamı)
D3 app pool: ["0/0/0"]
```
Ardından iki staging dosyasının confirm'ü de başarılı oldu.

**D4 — idle-kill edilen bağlantı havuza ölü dönmüyor.**
```
D4 killed tx: "Client has encountered a connection error and is not queryable" after 2836 ms; next 9 lock-pool tx: ok ×9
```

**D5 — RACE-N (İNCELEME-92 RACE-1/2).** 3 tur yapıldı; her turda 6 eşzamanlı confirm ve araya 6 farklı içerikli PUT.
```
D5 r0: storage_unavailable×2,success,already_confirmed×3 rows=1 copies=3 lateCopiesAfterSuccess=0 finalUnchanged=true size==row=true
D5 r1: storage_unavailable×3,success,already_confirmed×2 rows=1 copies=4 lateCopiesAfterSuccess=0 finalUnchanged=true size==row=true
D5 r2: storage_unavailable×3,success,already_confirmed×2 rows=1 copies=4 lateCopiesAfterSuccess=0 finalUnchanged=true size==row=true
```
İNCELEME-92 ile aynı sonuç: `success` dönen confirm'den sonra final nesneye hiç kopya inmedi. Kilit havuzuna taşınmak Y-1 garantisini bozmadı.

**D6 — süreç ölümü.** Kilidi **ayrı bir süreç** tutuyor: gerçek confirm koşan, kopyası hiç cevaplanmayan bir vitest çocuk süreci.
```
SIGKILL: holder=fonbridge-lock-pool/idle in transaction; lock released 37 ms after signal; retry=success rows=1 final==uploaded=true
SIGSTOP: holder=fonbridge-lock-pool/idle in transaction; confirm-while-held=save_failed in 10013 ms; lock released 19434 ms after signal; retry=success rows=1 final==uploaded=true
```
- Süreç ölünce kilit 37 ms'de bırakılıyor.
- Süreç donunca kilit ~20 sn'de bırakılıyor (`idle_in_transaction_session_timeout`). İNCELEME-92'de kilit TCP keepalive'a kadar, yani saatlerce tutuluyordu. **Y-2 kapandı.**

**D7 — kilit havuzu kiracılar arasında paylaşımlı.** Depo sağlıklıyken A kiracısı aynı anda 150 confirm gönderdi (`object_missing` yolu); bu sırada B kiracısı tek bir confirm gönderdi. 4 koşu (`d7.txt`):
```
flood A: {"object_missing":150}                                              | B confirm: success in 668 ms
flood A: {"object_missing":150}                                              | B confirm: success in 2171 ms
flood A: {"object_missing":150}                                              | B confirm: success in 2498 ms
flood A: {"object_missing":141,"THROW timeout exceeded when trying to connect":9} | B confirm: success in 2865 ms
```
- B'nin confirm'ü her koşuda başarılı, ama selin önünde 0.7–2.9 sn bekliyor.
- Seldeki `THROW`'lar kilit havuzundan değil, confirm'ün **başındaki** pilot kontrolünden geliyor: uygulama havuzu, `connectionTimeoutMillis` 1 sn. Ayrıntı G-1'de.

### Bulgular

Bloke eden bulgu yok.

#### T-6 — DÜŞÜK (test boşluğu): gerçek `withTenantLockPool`'un kuyruk süresini koruyan test yok
- Evidence suite'leri `withTenantLockPool`'u mock'luyor ve `maxWait`'i mock'un içinde **kendisi** veriyor. `lock-pool.live` testi ise kuyruğu yalnız 0.4 sn'lik sorgularla sınıyor.
- Bu yüzden iki mutant fe-fb'nin 131 testinin hepsinden sağ çıkıyor: Q5 (`maxWait` yok → Prisma varsayılanı 2 sn) ve Q6 (`connectionTimeoutMillis` yok → 1 sn).
- Etki: 4. confirm 5 sn yerine 1–2 sn'de `save_failed` alır. Veri kaybı yok, yalnız tasarlanan bekleme süresi sessizce değişir.
- Benim D2 testim (4.5–7 sn aralığı) ikisini de öldürüyor.
- **Öneri:** `lock-pool.live.test.ts`'e bir test eklenmeli: havuz dolu, `LOCK_POOL_MAX+1`'inci tx ≈ `LOCK_POOL_QUEUE_MS`'de düşüyor.

#### T-7 — DÜŞÜK (test boşluğu): kopyadan sonraki geri-okuma HEAD'inin süre sınırı test edilmiyor
- Q4 (geri-okuma HEAD'i `opts` olmadan) hem fe-fb'nin suite'lerinden hem benimkinden sağ çıktı.
- Etki küçük: bu noktada CopyObject **bitmiş**, final nesnede kontrol edilmiş baytlar var. Takılan HEAD tx'i ancak boşta kalma (20 sn) ya da tx zaman aşımıyla bitirir. Sonuç `save_failed` olur, satır yazılmaz, staging korunur, yeniden deneme çalışır. Y-1 penceresi açılmaz, çünkü kopya zaten inmiş.
- **Öneri:** T-5 HEAD/GET testlerine üçüncü bir kardeş test eklenmeli: final anahtara HEAD tutulunca confirm, `timeLeft` içinde `storage_unavailable` dönmeli.

#### G-1 — DÜŞÜK, bu değişiklikten ÖNCE de var, kapsam dışı: pilot kontrolü havuz beklemesinde `save_failed` değil exception veriyor
- `requireTenantAction` → `assertTenantWritable` → `withTenant`, confirm'deki `try`'ın **dışında**.
- Uygulama havuzu (10 bağlantı, 1 sn bekleme) aşırı yükte bağlantı veremezse confirm `save_failed` döndürmüyor, "timeout exceeded when trying to connect" hatasıyla fırlatıyor (D7'de 150'de 9).
- Bu, tüm server action'ların ortak davranışı ve fe-fb'nin değişikliği bunu ne getirdi ne kötüleştirdi. Kilit havuzu zaten bu yükü uygulama havuzundan çekti.
- Yalnız izleme notuna ekliyorum: aşağıdaki "timeout exceeded" alarmı uygulama havuzundan da gelebilir.

#### Gözlem — Y-3 hesabında Prisma saati bir ifade erken başlıyor (bulgu değil)
- Prisma'nın tx zamanlayıcısı `BEGIN`'den hemen sonra başlıyor (`startedAt = Date.now()`). `txStartedAt` ise callback'in başında, yani `set_config('app.tenant_id')` sonrasında ölçülüyor. Aradaki fark tek bir kilitsiz ifadenin gidiş-dönüşü.
- Pay 2 sn olduğu için bu ancak o ifade 7 sn'yi aşarsa önemli olur. Ayrıca kopya o anda bitmiş olduğundan Y-1 açılmaz. Değişiklik gerekmiyor.

### Doğrulanan (sorun yok)
- **B-1 kapandı:** D1 (B'nin 235 sorgusunda 0 hata) ve fe-fb'nin B-1 testi yeşil.
- **Y-2 kapandı:** D6 SIGSTOP'ta kilit 19.4 sn'de bırakıldı.
- **Y-3 kapandı:** gerçek `statement_timeout` 5.02 sn (D3); fe-fb'nin Y-3 idle, tx ve statement testleri yeşil.
- **T-3 (sızma):** D3'te 5 yolun ardından kilit havuzunun tüm canlı bağlantılarında `0/0/0`. Q1 ve Q2 T-3 testiyle ölüyor.
- **T-4:** fe-fb'nin T-4 testi yeşil; N7 fe-fb raporunda ölüyor.
- **T-5:** Q3 (CopyObject süre sınırsız) 3 testle ölüyor. HEAD ve GET için N8/N8b fe-fb raporunda. Açık kalan yalnız T-7.
- **İNCELEME-77 B-1 garantileri:** "a slow or failing store never loses the upload" describe'ının 7 testi yeşil. D1 ve D2'de sahte başarı yok.
- **RACE-1/2:** D5 ve fe-fb'nin RACE-2 / "five confirms at once" testleri yeşil.

## 2. Kanıt

**fe-fb suite'leri** (`fefb-suites.txt`): `Test Files 2 passed (2) · Tests 22 passed (22)`

**Saldırı suite'i** (`attack103-summary.txt`, satırlar `attack103-log.txt`): `Tests 7 passed (7)`

**Mutantlar:** fe-fb'nin evidence + lock-pool suite'lerine (131 test) karşı **8/12 KILLED** (`mutants103.txt`). Hayatta kalan 4'ü kendi suite'ime karşı koşuldu (`mutants103-attack.txt`).
```
KILLED   Q1  idle_in_transaction oturum düzeyi (is_local=false) → T-3
KILLED   Q2  statement_timeout oturum düzeyi (is_local=false)   → T-3, Y-3 tx, kilit-bekleme
KILLED   Q3  CopyObject süre sınırsız                           → kopya süre sınırı, Y-3 idle, Y-3 tx
SURVIVED Q4  geri-okuma HEAD süre sınırsız                      → benim suite'im de SURVIVED → T-7
SURVIVED Q5  withTenantLockPool maxWait yok (2 sn)              → benim D2 + D1 KILLED → T-6
SURVIVED Q6  kilit havuzu connectionTimeoutMillis yok (1 sn)    → benim D2 + D1 KILLED → T-6
KILLED   Q7  CONFIRM_IDLE_MS 20 → 60 sn                         → Y-2 ve Y-3 testleri
KILLED   Q8  CONFIRM_MARGIN_MS 2 sn → 0                         → Y-3
SURVIVED Q9  "kalan < 1 sn" kontrolü yok                        → neredeyse eşdeğer (aşağıda)
KILLED   Q10 txStartedAt kilitten SONRA ölçülüyor               → Y-3 tx
KILLED   Q11 statement_timeout 5 → 50 sn                        → Y-3 statement_timeout
KILLED   Q12 kilit havuzu application_name yok                  → lock-pool
restored: git status src clean   (her mutanttan sonra doğrulandı)
```
- **Q9:** kendi suite'imde D7 ile "KILLED" göründü, ama bu **sahte**. Q9 D7'nin yolunu değiştirmiyor. Hata G-1'deki uygulama havuzu zaman aşımıydı (D7 aynı hatayı mutantsız kodda da 2/3 kez verdi; testi `catch` ekleyerek düzelttim, sonra 4/4 yeşil).
- Q9 gerçekte neredeyse eşdeğer. Kontrol olmadan `timeLeft ≤ 0` durumunda `AbortSignal.timeout(-n)` `RangeError ERR_OUT_OF_RANGE` fırlatıyor, tx geri alınıyor ve sonuç `storage_unavailable` yerine `save_failed` oluyor. İkisi de yeniden denenebilir, kayıp yok. Kontrolün yararı yalnız daha doğru bir hata kodu.

**Tam kapılar** (`gates103.txt`, aynı worktree, saldırı dosyaları kaldırılmış halde):
```
CI=true npx vitest run (izole DB + MinIO, AUTH_SECRET test değeri):
 Test Files  297 passed | 2 skipped (299)
      Tests  3870 passed | 9 skipped (3879)
vitest rc=0 · typecheck rc=0 · lint rc=0 · i18n rc=0 (✅ i18n check passed: both catalogs agree…) · build rc=0 (env -u NODE_ENV next build)
```

## 3. Değişen dosyalar
Kod değişmedi. Yalnız şunlar eklendi:
- `docs/agent-results/TASK-MUOBDG82TXKKS-devop-fb.md`
- `docs/agent-results/TASK-MUOBDG82TXKKS-devop-fb-ekler/`: `zz-devopfb103.live.test.ts.txt`, `zz-devopfb103-child.live.test.ts.txt`, `attack103-log.txt`, `attack103-summary.txt`, `d7.txt`, `fefb-suites.txt`, `mut103.py`, `mutants103.txt`, `mutants103-attack.txt`, `gates103.txt`
- Repo dışında: `/Users/macbook/alan/docs/agent-results/TASK-MUO823LSVGKD-devop-fb.md`. Görev notunun KANIT satırı bu yolu istediği için yalnız bu rapora bir yönlendirme dosyası yazdım.

## 4. Riskler
- **Paylaşımlı kilit havuzu (bilinçli takas, fe-fb Risk 1):** depo yavaşken süreç başına en fazla 3 confirm aynı anda ilerliyor, fazlası 5 sn sonra `save_failed` alıyor, ve bu **tüm kiracılar** için geçerli. Depo sağlıklıyken 150'lik selde B'nin confirm'ü başarılı ama 0.7–2.9 sn bekliyor (D7). Yeniden deneme her durumda çalışıyor, veri kaybı yok.
- **Bağlantı bütçesi:** süreç başına 10 + 3. Prod'daki replika sayısı × 13 ≤ `max_connections` (ya da PgBouncer) olmalı.
- **İzleme notu** (İNCELEME-92 satır 118'in güncellemesi):
  - (a) `pg_stat_activity` içinde `application_name='fonbridge-lock-pool' AND state='idle in transaction'` sayısı 1 dakikadan uzun süre `3 × süreç sayısı` düzeyindeyse, bu depo yavaşlığının erken işaretidir → uyarı.
  - (b) `[confirmEvidenceUploadAction] DB error: Transaction API error: Unable to start a transaction in the given time` log sayısı → kilit havuzu doluluğu.
  - (c) "timeout exceeded when trying to connect" artık uygulama havuzunun **genel** doygunluğunu gösteriyor (G-1). Yavaş depo bu alarmı artık tetiklememeli; tetikliyorsa başka bir kaynak var.

## 5. Açık sorular
- Prod replika sayısı ve `max_connections` / PgBouncer? (fe-fb'nin sorusuyla aynı; 10 + 3 hesabı için.)

## 6. Sonraki adım
- **Push'a engel yok.** Push lidere ait.
- **Küçük test kartı (fe-fb, bloke etmez):**
  - T-6: gerçek `withTenantLockPool`'un kuyruk süresi testi (Q5 ve Q6'yı öldürmeli).
  - T-7: geri-okuma HEAD'inin süre sınırı testi (Q4'ü öldürmeli).
  - İstenirse D2 doğrudan taşınabilir (ekteki dosya).
- **G-1:** ayrı ve düşük öncelikli bir kart olarak ele alınabilir: pilot kontrolü havuz beklemesinde exception yerine anlamlı bir hata dönsün. Bu inceleme kapsamında değil.
- **Temizlik:** `devopfb103-pg` ve `devopfb103-minio` kapları ile `wt103` ve `wt103m` worktree'leri rapordan sonra kaldırıldı.
