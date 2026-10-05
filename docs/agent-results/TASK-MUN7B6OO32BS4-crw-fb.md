# TASK-MUN7B6OO32BS4 — crw-fb — İNCELEME-50 (Sprint FB-KAMU-2)

**Kod değiştirilmedi.** İki teslim incelendi. Dal `dev`. Temiz worktree `391db0ff` (içinde 284ecacb, 0ac5fba3, 59c29737, 2bf3307b var), `git status` boş.

**Platform beyanı:** yalnız **macOS**'ta koşuldu (Darwin 27, arm64, Node 26.5, Docker `pgvector/pgvector:pg16`, Google Chrome + Playwright). Windows ve Linux'ta koşulmadı, çünkü bu makinede yok. İki değişiklikte de platforma bağlı kod yolu yok:
- Kart 1: Next server action, Postgres ve `node:crypto` HMAC kullanıyor. Süreç, dosya yolu ya da kabuk yok.
- Kart 2: saf SQL (Postgres 16).

Tek platform farkı dağıtım topolojisinden geliyor. B-1 (X-Forwarded-For) işletim sisteminden bağımsız, önündeki proxy'ye bağlı.

## Karar

| Kart | Karar |
|---|---|
| TASK-MULR765AR5G0C (fe-fb): PublicLead formu | **DÜZELTME GEREKLİ.** Bloke eden bulgu: B-1 (IP hız sınırı, belgeli prod nginx arkasında atlatılabiliyor). |
| TASK-MUMT3PGX5OK8P (devop-fb): İNCELEME-44 N-1 | **ONAY.** N-1 kapandı: istenen senaryo tek kredi veriyor. N-2 bloke etmiyor ama düzeltilmesi öneriliyor, çünkü rapordaki "sessiz çift kredi olmaz" iddiası yanlış. |

## Ortam (izole, paylaşılan DB'ye yazılmadı)

- Worktree: scratchpad `wt` @ `391db0ff`, `pnpm install --frozen-lockfile --offline`.
- DB: kendi konteynerim `crwfb-i50` (127.0.0.1:55550/crwfb50). `.env` ana dosyadan DB URL'leri ve ödeme/AI anahtarları çıkarılarak üretildi; `5433` geçmiyor.
- Kurulum sırası:
  1. `prisma db push`
  2. `apply-migrations.sh`: 36 dosya
  3. `db:rls-role`
  4. `db:rls` (politikalar 28 → 112)
  5. `apply-migrations.sh` (rol GRANT'leri için ikinci kez)
  6. `prisma generate`
  7. `db:seed`
- İş bitince dev sunucusu (pid 51736), worker (pid 49484), konteyner ve worktree kapatıldı. Hepsi benimdi. Başka oturumun worker'larına (83301, 84035) dokunulmadı.

## Ortak kanıt: tam süit ve kapılar

```
pnpm exec vitest run   (izole + seed'li DB, temiz worktree 391db0ff)
 Test Files  244 passed | 2 skipped (246)
      Tests  2866 passed | 8 skipped (2874)          exit=0
hedefli: public-lead.live 11 + public-lead unit 9 + public-lead-cleanup 4 + cron-tenant-scope 14 = 38/38
rls:check=0  rls:bypass-check=0  i18n:check=0  typecheck=0
```

---

## (1) TASK-MULR765AR5G0C: PublicLead iletişim formu (fe-fb)

### Kontrol listesi

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Açık rıza zorunlu, sunucuda doğrulanıyor | ✅ | `submitPublicLead` önce `consent !== true` kontrolü yapıyor, şemada da `z.literal(true)` var. Ham HTTP POST ile `consent:false` gönderildi → `consent_required`, 0 satır. Kutu varsayılan olarak işaretsiz (tr ve en: `checked=false`). Rıza verilmeden gönderim 0 satır yazıyor. |
| Rıza metni sürümü kaydediliyor | ✅ | `consentVersion` sunucu sabitinden yazılıyor, eski sürüm reddediliyor (`consent_outdated`). Y-3'e bak. |
| Honeypot | ✅ (naif botlar için) | Ham POST'ta `website` dolu → `ok`, 0 satır. |
| Hız sınırı atlatılabiliyor mu | ❌ **Evet** | **B-1** |
| Kişisel veri loglanmıyor | ✅ | Kod: honeypot dalı yalnız `source`, hata dalı yalnız `error.name` logluyor. Gerçek HTTP koşusundan sonra `next.log`'da e-posta ya da IP deseni yok (`crwfb-`, `@example.test`, `198.51`, `10.9.` → 0 eşleşme). |
| 12 ay saklama tek sabit | ✅ | `PUBLIC_LEAD_RETENTION_DAYS = 365`. Silme işi, admin ekranı ve rıza metni aynı sabiti okuyor (390 px'te "keep them for 12 months"). Yorum hâlâ "PROPOSAL, NOT DECIDED" diyor, Y-2'ye bak. |
| Gece silme yalnız süresi dolanı siliyor, boş/undefined `where` yok | ✅ | `purgeablePublicLeadWhere` geçersiz cutoff'ta `RangeError` fırlatıyor. `retentionDays < 1` ise yine fırlatıyor. Filtre `createdAt < cutoff`. Mutant L4 (fırlatma yerine `{}`) öldü. Canlı test sınırın 1 ms ötesini siliyor, tam sınırı ve 364 günlük satırı tutuyor. |
| Admin listesi yalnız platform admin (sunucu tarafı), dışa aktarım yok | ✅ | Hem layout (`isPlatformAdminSession` → `notFound`) hem sayfa (`requirePlatformAdmin`) kontrol ediyor. Gerçek HTTP: anonim → **404**, `alice@fabrika.test` (isPlatformAdmin=f) → **404**, `admin@yasinaslan.com.tr` (isPlatformAdmin=t) → **200** "İletişim talepleri". Dışa aktarım kontrolü (csv/export/download) **0**. Tabloyu okuyan başka rota yok (`grep PublicLead src` → yalnız lib, action, admin sayfası, iş). |
| RLS/bypass-check kaydı gerekçeli | ✅ | `SYSTEM_WIDE` + `CATALOGUE_REASONS` + baseline D kaydı gerekçeli. `rls:bypass-check=0`. RLS'siz tablo `User` standardında. Sıkılaştırma önerisi raporda açık soru olarak duruyor, kabul edilebilir. |
| tr/en ve 390 px | ✅ | tr 1280 ve en 390 gerçek tıklama. Yatay taşma 0 px. Başarı başlığı odak alıyor. Kareler aşağıda. |
| Test verisi tek id ile silindi | ✅ | Kendi koşumda 24 satırın her biri `DELETE … WHERE id=$1` ile, `rowCount=1` kontrolüyle silindi. Kalan: 0. |

### Bulgular (önem sırasına göre)

**B-1 (BLOKE EDİYOR, güvenlik/kötüye kullanım): IP hız sınırı, belgeli prod topolojisinde istemci tarafından seçilen IP'ye göre sayıyor.**
- **Yer:** `src/lib/leads/public-lead.ts:75-79`, `clientIpFrom`: `x-forwarded-for` başlığının **ilk** değerini alıyor.
- **Neden sorun:** `docs/SMTP-SUNUCU.md:571`'deki prod nginx `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` kullanıyor. Bu direktif istemcinin gönderdiği değeri korur, gerçek adresi **sona ekler**. Yani ilk değer her zaman saldırganın yazdığı değerdir. Başka bir proxy ya da IP okuyucu yok: bu, repodaki ilk IP tabanlı kontrol.
- **Gerçek HTTP kanıtı** (`next dev :3950`, sayfadan yakalanan gerçek server-action isteği tekrar oynatıldı, betik `TASK-MUN7B6OO32BS4-screenshots/lead-xff-e2e.mjs`):
  ```
  A spoofed first hop, same real IP 198.51.100.77, 12 requests: ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,ok
    stored rows=12 distinct ipHash=12            ← sınır 10/saat, 12'si de yazıldı
  B honest header, 11 requests: ok,ok,ok,ok,ok,ok,ok,ok,ok,ok,rate_limited   ← kontrol: sınır çalışıyor
  ```
  Başlık `X-Forwarded-For: 10.9.<i>.1, 198.51.100.77` biçiminde, yani nginx'in ürettiği şekilde.
- **Etkisi:** E-posta sınırı yalnız küçük harfe çevirmeyle çalışıyor. `a+1@…`, `a+2@…` gibi her yeni adres yeni bir kova açıyor. İkisi birleşince tek makineden sınırsız satır yazılabiliyor. Sonuç: kişisel veri biçiminde çöp satırlar, admin listesinin boğulması ve tablo büyümesi.
- **Ek not:** Bu fe-fb raporunda "Riskler" altında yazılmış ve devop-fb'ye devredilmiş. Ancak belgelenen nginx zaten bu hâlde. Ayrıca `docker-compose.yml:27` `3000:3000` portunu tüm arayüzlere açıyor. Proxy atlanırsa başlık tamamen serbest kalır. Bu ikinci konu bu kartın kapsamı dışında.
- **Düzeltme (en küçük):** Tek güvenilir proxy varken **en sağdaki** değeri al (nginx'in eklediği gerçek adres). Sayıyı bir env ile yapılandırılabilir yap (`TRUSTED_PROXY_HOPS=1`). Alternatif: nginx'e `proxy_set_header X-Real-IP $remote_addr;` ekle ve `X-Real-IP`'yi önceliklendir. Bu durumda `docs/SMTP-SUNUCU.md` de güncellenmeli. `public-lead.test.ts`'teki "takes the first X-Forwarded-For hop" testi şu an güvensiz davranışı sabitliyor. Mutant L3 (son değeri al) bu testi kırdı. Test yeni davranışa göre yeniden yazılmalı ve sahte ilk değerle bir canlı test eklenmeli.

**Y-1 (test boşluğu): iki zaman penceresi sabiti de testle sabitlenmemiş.**
- Mutant L1 `EMAIL_WINDOW_MS` 24 sa → 2 sa: **sağ kaldı** (24/24).
- Mutant L2 `IP_WINDOW_MS` 1 sa → 1 dk: **sağ kaldı** (24/24).
- **Neden:** Testlerde tüm istekler aynı `NOW` ile gidiyor. Tek zaman noktası "+1 gün +1 sn". Sınırın hemen içinde bir nokta yok.
- **Düzeltme:** Pencerenin hemen içinden birer istek ekle (ör. e-posta için `NOW − 23 sa`, IP için `NOW − 59 dk`, `createdAt` ile tohumlanmış satır) ve reddedildiğini doğrula.

**Y-2 (belge ve karar izi): 12 ay kararı koda ve belgelere işlenmemiş.** Patron kararı 30.09: 12 ay. Değer doğru (`365`), ama:
- `public-lead-policy.ts:10-16` hâlâ "PROPOSAL, NOT DECIDED — KARAR GEREKLİ" diyor.
- `processing-register.md` §18d "TASLAK" durumunda.

Yorum "karar: patron 30.09.2026, 12 ay" olarak güncellenmeli. §18d'deki süre satırı cs-fb incelemesinde kesinleştirilmeli.

**Y-3 (KVKK izi): rıza metni saklama sabitinden türüyor ama sürüm artışı zorlanmıyor.** `consent_label` içindeki `{months}` değeri `PUBLIC_LEAD_RETENTION_DAYS`'ten hesaplanıyor. Biri sabiti değiştirip sürümü (`2026-09-30.1`) artırmayı unutursa iki şey olur:
- Yeni satırlar görmedikleri bir metne "rıza verdi" diye kaydedilir.
- Silme işi eski satırlara yeni süreyi uygular. Süre uzatıldıysa bu, rıza verilen süreyi aşar.

Kural şu an yalnız yorumda yazıyor. **Düzeltme:** Sürümü, render edilmiş tr/en metnin özetine bağlayan küçük bir test ekle. Metin ya da süre değişip sürüm değişmezse test kırmızı olmalı.

**Ö-1 (öneri):** Mutant L6 (saklanan `consentVersion` istemciden alınır) sağ kaldı. Bu **eşdeğer bir mutant**: şema `z.literal(PUBLIC_LEAD_CONSENT.version)` ile ikisini zaten eşitliyor. Kusur yok, bilgi için yazıldı.

**Ö-2 (öneri):** Admin sayfası yükleme hatasında `console.error(errorMessage(e))` yapıyor (`admin/leads/page.tsx`). `findMany` ya da `count` hatası pratikte değer içermez, ama `public-lead.ts` hata yolunda bilinçli olarak yalnız `error.name` logluyor. Tutarlılık için aynı kural burada da uygulanabilir.

### Mutantlar (benim koşum: izole DB, her birinden sonra `cmp` ile geri yükleme doğrulandı)

```
BASE                                          24 passed (24)
L1 EMAIL_WINDOW 24h -> 2h                     24 passed          SAĞ  → Y-1
L2 IP_WINDOW 1h -> 1min                       24 passed          SAĞ  → Y-1
L3 clientIpFrom: son XFF değeri               1 failed | 23      ÖLDÜ (test güvensiz davranışı sabitliyor → B-1)
L4 where-guard: throw yerine {}               1 failed | 23      ÖLDÜ
L5 sunucu rıza ön-kontrolü silindi            2 failed | 22      ÖLDÜ
L6 consentVersion istemciden                  24 passed          eşdeğer (şema literal) → Ö-1
```

### Kareler (`docs/agent-results/TASK-MUN7B6OO32BS4-screenshots/`)

`tr-form-1280.png`, `tr-success-1280.png`, `en-form-390.png`, `en-success-390.png`. Koşu çıktısı:

```
[tr 1280] consent default checked=false
  without consent: Göndermek için açık rıza kutusunu işaretleyin. · rows=0
  after consent: "Teşekkürler, talebiniz alındı." · overflow px=0 · rows=1
[en 390] consent default checked=false
  without consent: Tick the explicit consent box to send the form. · rows=0
  after consent: "Thank you, we have your request." · overflow px=0 · rows=1
C raw POST honeypot filled (body changed=true) → ok · rows=0
C raw POST consent:false → consent_required · rows=0
admin /tr/admin/leads as anonymous → 404 · export controls=0
admin /tr/admin/leads as alice@fabrika.test → 404 · export controls=0
admin /tr/admin/leads as admin@yasinaslan.com.tr → 200 İletişim talepleri · export controls=0
cleanup: 24 ids deleted one by one · left with run tag=0
```

`alice` girişinde oturumun gerçekten açıldığını ayrıca doğrulamadım. İki kontrol de sunucu tarafında ve kodda doğrulandı.

---

## (2) TASK-MUMT3PGX5OK8P: İNCELEME-44 N-1 düzeltmesi (devop-fb, 2bf3307b)

### İstenen senaryo: ileri → geri → ileri → aynı ay yeniden koşu, gerçek worker ile

Worker `pnpm jobs:worker` (`JOBS_CRON_ENABLED=false`), iş `pnpm jobs:enqueue -- credits-monthly-grant --period P`. Geri dönüş başlıktaki SQL ile yapıldı: `DROP INDEX` + `DROP COLUMN`. Yeniden uygulamada dosyanın tamamı psql ile koşuldu. Betik: `TASK-MUN7B6OO32BS4-screenshots/n1-scenario.sh`. Dosya parmak izleri devop'un raporuyla aynı: düzeltilmiş `216ef3df0ce4`, eski `7dbf6a673472`.

```
== period 2026-10, reapply file 216ef3df0ce4          (DÜZELTME)
R1 after first run: 1 rows, sum=500, stamped=1
G rollback (header SQL)
F2 re-apply: ALTER TABLE UPDATE 1 UPDATE 0 CREATE INDEX
R2 same month again: 1 rows, sum=500, stamped=1       ← TEK KREDİ ✅   worker: grantedCount 0, alreadyGrantedCount 1

#### MUTANT (eski dosya, 2bf3307b^)
== period 2026-11, reapply file 7dbf6a673472
F2 re-apply: ALTER TABLE UPDATE 0 CREATE INDEX       after re-apply: stamped=0
R2 same month again: 2 rows, sum=1000                 ← ÇİFT KREDİ (mutant yakalandı)
```

### Test mutantları (`cron-tenant-scope.test.ts`, izole DB)

```
C2-M1 eski dosya (re-stamp yok)                2 failed | 12 passed   ÖLDÜ
C2-M2 re-stamp regex → LIKE 'monthly_grant:%'  14 passed              SAĞ  (pratikte eşdeğer: bu önekle yalnız iş yazıyor)
C2-M3 re-stamp "grantPeriod IS NULL" silindi    14 passed              eşdeğer (NOT EXISTS satırın kendisini görüyor)
C2-P  önerilen N-2 varyantı (aşağıda)           14 passed              mevcut testlerle uyumlu
```

### Bulgular

**N-2 (bloke etmiyor, düzeltilmesi öneriliyor): "anahtarla asla çakışmaz" iddiası yanlış. Başarısız yeniden uygulama, anahtarı olmayan kısmi bir durum bırakıyor ve sonraki koşu yeniden kredi yazıyor.**
- **Yer:** `prisma/migrations/credit-ledger-grant-period.sql:60-65` ve başlık 22-29. Raporun §4 maddesi: "Oluşursa `CREATE UNIQUE INDEX` yüksek sesle düşer ve sessiz çift kredi olmaz."
- **Önkoşul:** Bir ay için iki iş satırı var. Bu, N-1 hasarı bir ortamda zaten oluşmuşsa gerçekleşir: eski dosya geri alınıp yeniden uygulanmış ve aynı ay yeniden koşulmuş. Bunun üstüne bir geri dönüş ve yeniden uygulama daha gelirse sorun çıkar.
- **Mekanizma:** Re-stamp tek bir `UPDATE`. İçindeki `NOT EXISTS` ifadenin başındaki anlık görüntüyü okuyor. Bu yüzden aynı aydaki iki NULL satırın ikisini de damgalıyor ve `CREATE UNIQUE INDEX` düşüyor. Dosya transaction içinde değil: `apply-migrations.sh` `-f` kullanıyor, `-1` yok. Bu yüzden kolon ve damgalar kalıyor, **anahtar oluşmuyor**. Sonraki koşuda `createMany skipDuplicates` bir kısıt bulamıyor ve satırı ekliyor.
- **Canlı kanıt** (gerçek worker):
  ```
  #### A: N-1 hasarı eski dosyayla üretildi
  R2 same month again: 2 rows, sum=1000
  #### B: düzeltilmiş dosya, bir geri dönüş daha sonrası
  F2 re-apply: ALTER TABLE UPDATE 2 UPDATE 0 ERROR:  could not create unique index "CreditLedger_tenantId_grantPeriod_key"
               DETAIL:  Key ("tenantId", "grantPeriod")=(demo-tenant, 2026-12) is duplicated.
     after re-apply: 2 rows, sum=1000, stamped=2      ← kolon + damgalar kaldı
  R2 same month again: 3 rows, sum=1500               ← ÜÇÜNCÜ kredi
  pg_indexes: CreditLedger_pkey, CreditLedger_tenantId_createdAt_idx   ← anahtar yok
  ```
  Kaydedilen worker çıktısı: `"period":"2026-12","grantedCount":1,…,"totalCreditsGranted":500`. Migration hata verdikten sonra da kredi yazıldı.
- **Neden ONAY'ı düşürmüyor:** İstenen senaryo (tek geri dönüş) doğru çalışıyor. Bu durum için önce N-1 hasarının oluşmuş olması, sonra ikinci bir geri dönüş gerekiyor. Devop'un raporuna göre canlıya uygulanmadı.
- **Düzeltme (5 satır, denendi):** Re-stamp'i eski-iş doldurması gibi `row_number` ile yaz. Böylece her (kiracı, ay) için yalnız bir satır damgalanır:
  ```sql
  UPDATE "CreditLedger" c
     SET "grantPeriod" = s.p
    FROM (SELECT id, "tenantId", substr("refId", 15) AS p,
                 row_number() OVER (PARTITION BY "tenantId", "refId" ORDER BY "createdAt", id) AS rn
            FROM "CreditLedger"
           WHERE reason = 'monthly_grant' AND "grantPeriod" IS NULL
             AND "refId" ~ '^monthly_grant:[0-9]{4}-(0[1-9]|1[0-2])$') s
   WHERE c.id = s.id AND s.rn = 1
     AND NOT EXISTS (SELECT 1 FROM "CreditLedger" x
                      WHERE x."tenantId" = s."tenantId" AND x."grantPeriod" = s.p);
  ```
  Aynı hasarlı durumda bu varyantın sonucu:
  ```
  F2 re-apply: ALTER TABLE UPDATE 1 UPDATE 0 CREATE INDEX
  R2 same month again: 3 rows, sum=1500 (yeni satır yok) · worker: grantedCount 0, alreadyGrantedCount 1
  pg_indexes: … CreditLedger_tenantId_grantPeriod_key
  ```
  Mevcut test 14/14 geçiyor (C2-P). Önceden oluşmuş fazla kredi olduğu gibi kalır. Raporun §6'daki izleme sorgusu bunu gösterir. Ayrıca iki şey düzeltilmeli: başlıktaki "can never clash with the key" cümlesi ve raporun §4 iddiası.
- İsteğe bağlı: `apply-migrations.sh`'a `--single-transaction` eklemek bu tür kısmi durumları proje genelinde kapatır. Ancak bu tüm dosyaları etkiler, ayrı bir kart olmalı.

---

## Değişen dosyalar

- `docs/agent-results/TASK-MUN7B6OO32BS4-crw-fb.md`: bu rapor.
- `docs/agent-results/TASK-MUN7B6OO32BS4-screenshots/`: 4 kare, `lead-xff-e2e.mjs`, `n1-scenario.sh`.

Kod değiştirilmedi.

## Riskler

- B-1 düzeltilmeden form prod'a çıkarsa hız sınırı yalnız naif botları durdurur.
- N-2: bir ortamda N-1 hasarı oluşmuş ve ikinci bir geri dönüş yapılmışsa, migration hata verse bile kredi yazılmaya devam eder.

## Açık sorular

- B-1 düzeltmesi hangi yoldan yapılsın: uygulamada en sağdaki değeri almak mı, nginx'te `X-Real-IP` mi? Karar devop-fb ve fe-fb'nin. Ben uygulama tarafını ve belgeyi birlikte öneriyorum.
- `docker-compose.yml`'deki `3000:3000` yayını prod'da `127.0.0.1:3000:3000` olmalı mı? Bu kartın kapsamı dışında, devop-fb'ye not.

## Sonraki adım

1. fe-fb: B-1, Y-1, Y-2, Y-3 → yeniden inceleme.
2. devop-fb: N-2 düzeltmesi (row_number varyantı, başlık ve rapor cümlesi). Küçük bir kart yeterli.
