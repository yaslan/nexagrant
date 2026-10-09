# Canlı çıkış kontrol listesi (fonbridge.com)

Kaynak: TASK-MTTOUDNQ97X83 / F-1 (ilk sürüm, 09.09.2026) → **TASK-MUN66WDHX224 (30.09.2026, tamamen yenilendi)**.
Ölçülen ağaç: `dev` @ `4bfc20a5` (yerel), `origin/dev` @ `c5aa48d7`. Ölçüm anı: 29.09.2026 21:43 UTC (30.09 00:43 TRT).

Bu liste tek soruya cevap verir: **bugün canlıya çıkmak için ne hazır, ne eksik, ne patronun elinde?**
Her maddenin yanında onu üreten komut ya da dosya var. Canlıdan önce komutları yeniden koşun; sayı değiştiyse liste eskimiştir.
**Bu listeyi yazan kart canlıya hiçbir şey yazmadı** (yalnız salt-okur `dig`, yerel dosya okuma).

Durum etiketleri: **HAZIR** = repoda var ve kanıtlı · **EKSİK** = bizim (ajan) işimiz, henüz yok · **PATRON** = yalnız patronun yapabileceği iş ya da karar.

## 0. Bugünkü kararlar (bu listenin dayanağı)

| Konu | Karar | Kaynak |
|---|---|---|
| Alan adı | `https://fonbridge.com` kanonik; `www` → kök **301** (tek sıçrama) | patron 29.09, `docs/SMTP-SUNUCU.md` §10 |
| Barındırma | Vulut; cPanel sunucusu `srv.iyisunucu.com.tr` = `77.92.144.187`; DNS `ns1/ns2.iyisunucu.com.tr` | `docs/SMTP-SUNUCU.md` §1.1 |
| E-posta | Seçenek A: Vulut cPanel/Exim, `mail.fonbridge.com`, gönderici `info@fonbridge.com` | `docs/SMTP-SUNUCU.md` |
| İş kuyruğu | graphile-worker (Postgres); web ve worker **ayrı imaj/süreç**; `JOBS_CRON_ENABLED` üretimde zorunlu | `docs/adr/ADR-0008-own-job-queue-graphile-worker.md` §9 |
| Kaldırılanlar | Sentry, Resend, Inngest, Microsoft Entra, Outlook, SAML SSO | patron 29.09 |
| LLM | Anthropic `claude-sonnet-5` (varsayılan) + OpenAI embedding `text-embedding-3-large` | `src/lib/llm.ts:43`, `:613` |
| Giriş | Google OAuth — yeni istemci `fonbridges` GCP projesinde (bugünkü istemci `cevreportal` projesine ait) | patron 29.09 |
| Ücret | Pilot ücretsiz (90 gün Ekip planı); Stripe/iyzico/e-Fatura pilotta **yok** | `docs/adr/ADR-0007-ilkadim-free-pilot.md` |
| Ziyaretçi formu | 12 ay saklama | `src/lib/leads/public-lead-policy.ts:19` (`PUBLIC_LEAD_RETENTION_DAYS = 365`), iş `public-lead-cleanup` 03:45 UTC |

## 1. Özet tablo

| # | Madde | Durum | Kanıt (kısa) |
|---|---|---|---|
| 1.1 | DNS bölgesi `fonbridge.com` | **PATRON** | `dig +norec SOA fonbridge.com @ns1/ns2.iyisunucu.com.tr` → `REFUSED` (29.09 21:43 UTC); aynı NS'de `usfinbridge.com` → `NOERROR`; `@8.8.8.8` A/AAAA/MX/TXT → `SERVFAIL` |
| 1.2 | Uygulama sunucusu (web + worker + Postgres 16/pgvector) nerede koşacak | **PATRON** | `77.92.144.187` paylaşımlı cPanel/Exim sunucusu; Docker, uzun yaşayan worker süreci ve pgvector'ün orada olup olmadığı **ölçülmedi**. `<APP_IP>` hâlâ yok (`docs/SMTP-SUNUCU.md` §8 madde 2) |
| 1.3 | Ters vekil + TLS + `www`→kök 301 | **EKSİK** (1.2'ye bağlı) | Caddyfile hazır (`docs/SMTP-SUNUCU.md` §10.1), kurulmadı |
| 1.4 | SMTP (`mail.fonbridge.com`) | **PATRON** | 1.1'e bağlı; kutular, DKIM, AutoSSL `docs/SMTP-SUNUCU.md` §8 |
| 2 | Üretim ortam değişkenleri | **EKSİK** (liste hazır, değerler PATRON) | §2 |
| 3 | Migration sırası + geri dönüş | **HAZIR** (2 not) | §3 |
| 4 | Yedekleme / felaket kurtarma | **EKSİK** | repoda `pg_dump`/geri yükleme betiği ya da belgesi yok (§4) |
| 5 | İzleme / alarm | **EKSİK** (kısmi) | `SystemAlert` yalnız `/[locale]/admin/alerts` ekranında; e-posta/push yok; dış kalp atışı yok (§5) |
| 6 | GitHub push + CI | **PATRON** (push) / **EKSİK** (yerel kanca) | `dev` origin'den **223 commit** ileride; `core.hooksPath` var olmayan dizini gösteriyor (§6) |
| 7 | Anahtar yenileme (OpenAI) | **PATRON** | anahtar sohbette açığa çıktı → yenile + harcama limiti (§2.3) |
| 8 | Dosya depolama (R2) | **PATRON** (karar) | R2 yoksa yükleme **sahte presigned URL** döner, dosya saklanmaz (§2.2) |

---

## 2. Üretim ortam değişkenleri

Karşılaştırma: `src/lib/env.ts` (zod şeması, 46 anahtar) ↔ `.env.example` (76 anahtar) ↔ koddaki `process.env.*` okumaları.
Komut (yeniden üretmek için):

```sh
grep -oE '^  [A-Z_0-9]+:' src/lib/env.ts | tr -d ' :' | sort > /tmp/schema.txt
grep -oE '^#?[[:space:]]*[A-Z_0-9]+=' .env.example | sed -E 's/^#?[[:space:]]*//; s/=//' | sort -u > /tmp/example.txt
comm -23 /tmp/schema.txt /tmp/example.txt      # şemada olup örnekte olmayan → boş (30.09)
```

Sonuç: **şemadaki her anahtar `.env.example`'da var.** Fark ters yönde ve şemanın dışında (aşağıda).

### 2.1 Zorunlu — boşsa üretim çalışmaz ya da çekirdek işlev düşer

| Değişken | Nerede | Değer / not | Durum |
|---|---|---|---|
| `NODE_ENV=production` | env.ts | imajda `Dockerfile` ayarlar | HAZIR |
| `DATABASE_URL` | env.ts, `src/lib/db.ts` | uygulama rolü **`fabrika_app`** (BYPASSRLS yok) — `pnpm rls:verify` | PATRON (sunucu) |
| DB TLS: `DATABASE_URL`, `JOBS_DATABASE_URL` ve migration/`rls.sql` URL'inin sonu | `certs/supabase-prod-ca-2021.crt`, `certs/README.md` (TASK-MUOG51GJ3PUOG R-S7) | **`?sslmode=verify-full&sslrootcert=/app/certs/supabase-prod-ca-2021.crt`** (imaj dışında: `certs/`'in mutlak yolu). node-pg (web, worker, tsx betikleri) ve psql bunu URL'den okur, sunucuyu CA'ya ve ana bilgisayar adına karşı doğrular. **Prisma CLI** (`db push`, `migrate diff --from-config-datasource`) bu iki parametreyi tanımaz (`verify-full`'u `prefer` sayar, yanlış CA ile de bağlanır; crw2-fb Y-1). Aynı URL'i verin, elle değiştirmeyin: `prisma.config.ts` (`prisma/cli-url.ts`) CLI'ya `sslmode=require&sslaccept=strict&sslcert=<CA mutlak yolu>` biçimini kendisi verir; CA dosyası yoksa komut bağlanmadan durur. Dönüşmüş biçimi node-pg'ye **vermeyin** (`sslcert`'i istemci sertifikası sayar, bağlanamaz). `--from-url`/`--to-url` ile URL'i doğrudan Prisma'ya vermek bu dönüşümü atlar: kullanmayın. **Yasak:** `sslmode=require`'ı CA'sız bırakmak (node-pg `SELF_SIGNED_CERT_IN_CHAIN` ile bağlanamaz), `uselibpqcompat=true`, `rejectUnauthorized:false`. Kanıt: `DATABASE_URL=<app URL> pnpm rls:verify --require-db` → exit 0 (TLS kurulamazsa exit 1, eskisi gibi "ATLANDI" + exit 0 değil); worker URL'i: `psql "<jobs URL>" -c 'select current_user'` | HAZIR (CA repoda, imajda); PATRON (URL'ler) |
| `AUTH_SECRET` | `src/lib/auth-secret.ts` | ≥32 karakter, `openssl rand -base64 32`; eksik/kısa/eski anahtar → sunucu **başlamaz** (`src/instrumentation.ts`) | PATRON |
| `NEXT_PUBLIC_APP_URL=https://fonbridge.com` | env.ts, `.env.example:6` | davet/e-posta bağlantıları; yanlışsa yalnız uyarı (instrumentation) | PATRON |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | `src/lib/auth.ts:331` | **yeni `fonbridges` GCP istemcisi**; yönlendirme URI'si `https://fonbridge.com/api/auth/callback/google` (`basePath: "/api/auth"`, `trustHost: true`). `GOOGLE_CLIENT_*` yalnız eski ad | PATRON |
| `DEMO_LOGIN_ENABLED` | env.ts, `src/lib/demo-login.ts` | **boş ya da `false`**; üretimde `true` → sunucu başlamaz | HAZIR (kodla korunuyor) |
| `JOBS_CRON_ENABLED` (yalnız worker) | env.ts `jobsCronEnabled` | `false` → sonra `true` (§3.3 sırası); boşsa üretim worker'ı **başlamaz** | HAZIR (kodla korunuyor) |
| `SMTP_HOST=mail.fonbridge.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM="FonBridge <info@fonbridge.com>"` | env.ts, `src/lib/email/mailer.ts` | boşsa hiç posta gitmez ve üretimde `SystemAlert` yazılır; `SMTP_USER` kararı S-1 bekliyor (`info@` mi, ayrı `bildirim@` mi — `docs/SMTP-SUNUCU.md` §8 madde 4) | PATRON |
| `ANTHROPIC_API_KEY` | env.ts, `src/lib/llm.ts` | `.env`'de var (patron) | PATRON (üretime taşı) |
| `OPENAI_API_KEY` | env.ts | **açığa çıktı → yenile**, eskisini iptal et, OpenAI panelinde aylık harcama limiti | PATRON |

### 2.2 İşlevsel — boşsa uygulama açılır ama bir özellik sessizce ya da alarmla düşer

| Değişken | Boşsa ne olur | Durum |
|---|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_HOST` | `src/lib/storage.ts:13` istemci `null`; `:82` "Dev Mode Fallback" **sahte presigned URL** üretir → kanıt/dosya yüklemesi başarılı görünür ama dosya **saklanmaz**. Ayrıca `.env.example:109` `R2_BUCKET=fabrika`, kodun varsayılanı `fonbridge-evidence` (`storage.ts`) — biri seçilmeli | **PATRON** (R2 hesabı mı, başka depolama mı) + EKSİK (üretimde sahte URL yerine hata/alarm) |
| `WORKER_URL`, `WORKER_TOKEN` | `k2-monthly-cordis` (ayda bir, 1'i 04:00 UTC) `http://localhost:8000`'e gider → Python CORDIS servisi (`workers/cordis`) yoksa iş düşer, `job-queue` alarmı | PATRON (pilotta CORDIS aylık yenileme gerekli mi?) |
| `FEEDBACK_DIGEST_TO` | haftalık geri bildirim özeti hesaplanır, gönderilmez | PATRON (adres) |
| `JOBS_DATABASE_URL` | boş = `DATABASE_URL`. Worker ilk açılışta `graphile_worker` şemasını **kurar** → bu rolün şema oluşturma yetkisi olmalı; `fabrika_app`'in yoksa ayrı rol gerekir (ADR-0008 §6.6) | EKSİK (rol yetkisi canlı DB'de ölçülecek) |
| `NEXT_PUBLIC_POSTHOG_KEY/HOST` | analitik yok (zararsız) | isteğe bağlı |
| `BETA_SUPPORT_EMAIL`, `BETA_FEEDBACK_EMAIL` | varsayılan `info@fonbridge.com` (`src/lib/beta/constants.ts:49-50`; 01.10.2026'ya dek `support@`/`feedback@fabrika.dev` idi, TASK-MUPIR7Y1P7AH4) → davet e-postası, takvim ORGANIZER'ı ve beta rehberi bu adresi gösterir. Kutunun gerçekten posta alması Vulut panelinde kurulur | HAZIR (kod) / **PATRON** (info@fonbridge.com kutusu + MX/SPF/DKIM) |
| `docs/BETA_DATA/generated/` (git dışı) | 06.09.2026 çıktıları eski adresi (`support@fabrika.dev`), eski takvim UID'sini ve "Fabrika" adını taşıyor. `pricing-survey/` 01.10.2026'da yeniden üretildi. `invites/`, `calendar/`, `onboarding-summary.json`, `esr-calibration/` **gönderimden hemen önce** gerçek DB'ye karşı `pnpm tsx scripts/beta-onboarding.ts --apply` ve `pnpm tsx scripts/esr-calibration.ts --apply` ile yeniden üretilmeli. Dry-run çıktısı `DRY-RUN-TOKEN` ve localhost bağlantısı taşır, gönderilemez. P-7 (gün/saat) kararı da bundan önce verilmeli | **EKSİK** (gönderim öncesi adım) |
| `NEXT_PUBLIC_SMTP_FROM_ADDRESS` | varsayılan `info@fonbridge.com` (doğru) | HAZIR |

### 2.3 Pilotta boş kalmalı (ADR-0007)

`STRIPE_*`, `IYZICO_*`, `BILLING_ACTIVE_TIER`, `EFATURA_INTEGRATOR_*`, `INVOICE_SUPPLIER_*` → **boş bırakın**. iyzico boşken webhook her teslimi reddeder (env.ts yorumu), demo anahtara düşmez. `IYZICO_BASE_URL` sandbox varsayılanı pilotta önemsiz.

### 2.4 `.env.example`'da olup kodda hiç okunmayan (ölü) anahtarlar

Komut: her anahtar için `grep -rqsw KEY src scripts prisma next.config.* prisma.config.* package.json Dockerfile docker-compose.yml .github`.

`AI_PROVIDER`, `APIFY_TOKEN`, `CORDIS_H2020_ZIP_URL`, `CORDIS_HE_ZIP_URL`, `DATABASE_URL_MIGRATE`, `DEFAULT_LOCALE`, `EMBEDDING_DIM`, `EMBEDDING_MODEL`, `EMBEDDING_PROVIDER`, `SEDIA_API_KEY`, `SEDIA_SEARCH_URL`, `SEDIA_TOPIC_DETAILS_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_REST_URL`.

Bunları üretimde doldurmak **hiçbir şeyi değiştirmez** (ör. `EMBEDDING_MODEL` değiştirilse de kod `text-embedding-3-large` kullanır, `src/lib/llm.ts:613`). Ayrıca `REDIS_URL` yalnız `docker-compose.yml`'de geçiyor, kodda okunmuyor. Temizlik ayrı kart (EKSİK, bloklayıcı değil).

Kaldırılan servislerin (Sentry, Resend, Inngest, Entra, Outlook, SAML) hiçbir anahtarı `.env.example` ya da `src/lib/env.ts`'de **yok** (`grep -iE 'inngest|resend|sentry|entra|azure|outlook|saml|microsoft'` → boş). HAZIR.

---

## 3. Şema: migration sırası ve geri dönüş

### 3.1 Uygulama sırası — HAZIR

`prisma migrate deploy` düz `.sql` dosyalarını görmez; tek yol `scripts/apply-migrations.sh` (sıra: `prisma/migrations/apply-order.txt`, `psql -v ON_ERROR_STOP=1`). Liste ile disk uyuşmazsa betik koşmaz.

```
$ bash scripts/apply-migrations.sh --list | wc -l
42
$ bash scripts/apply-migrations.sh --list | tail -6
k1-embedding-hash.sql
m4-stale-reminder-idempotency.sql
add-api-key-rate-window.sql
evidence-unique-object-key.sql
m4-stale-digest-user-claim.sql
revoke-api-role-function-execute.sql
```

Canlı DB'de sıra (CI'daki `Prepare database` adımıyla aynı, `.github/workflows/ci.yml:99`):

- [ ] 0. **Önce yedek** (§4.1) — geri dönüşün tek güvenli yolu.
- [ ] 0a. **Go-live ön kontrolü R-1** (TASK-MUOG51GJ3PUOG; kaynak `docs/agent-results/TASK-MUOEY2GBFHY7U-crw2-fb.md` §Riskler R-1). 1. adımdan (`db push`) **önce**, sahip rolüyle:
  ```bash
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/golive/r1-topicmatch-check.sql
  ```
  Betik yalnız okur (`BEGIN READ ONLY` … `ROLLBACK`; yazma denemesi `cannot execute … in a read-only transaction` verir). K1 anahtarının NULLS NOT DISTINCT olup olmadığına ve aynı (tenantId, topicId) için birden fazla K1 satırı (`opportunityId IS NULL`) bulunup bulunmadığına bakar. Çıkış kodu her durumda 0'dır; kararı son satır verir:
  - `R1_SONUC | TEMIZ` (anahtar `t`, mükerrer 0) → devam.
  - `R1_SONUC | DB_PUSH_ONCESI` (boş DB, `TopicMatch` yok) → devam. Kontrolü 1. adımdan sonra, 3. adımdan önce bir kez daha koşun.
  - `R1_SONUC | NULLS_DISTINCT` (anahtar `f`, mükerrer 0) ya da `ANAHTAR_YOK` → devam. 3. adımdaki `topicmatch-per-opportunity` anahtarı tek komutta NULLS NOT DISTINCT'e çevirir.
  - `R1_SONUC | DUR_MUKERRER` (mükerrer çiftler üstte listelenir) → **DUR.** Temizlik kararı patronundur (K1 türetilmiş veridir, yeniden hesaplanır). Bu durumda 3. adım `topicmatch-per-opportunity/migration.sql` içinde `could not create unique index … is duplicated` ile durur (exit 3). Veri silmez, eski anahtar yerinde kalır (ölçüldü: satır sayısı ve içerik md5'i önce ve sonra aynı; `docs/agent-results/TASK-MUOG51GJ3PUOG-devop-fb-ekler/B2-migration-durur.txt`). Mükerrerleri elle silmeyin.
  - `R1_SONUC | RLS_KOR` → sayım güvenilmez: rol FORCE RLS altında satırları göremiyor (`system_scope` politikası yok ve rol süper kullanıcı değil). Süper kullanıcıyla ya da `pnpm db:rls` sonrası yeniden koşun.
  Betik `SET LOCAL app.system_scope = 'on'` ile yalnız kendi işlemi için RLS kapsamını açar. Bu satırı çıkarmayın: `TopicMatch` FORCE RLS altındadır ve süper kullanıcı olmayan rol kapsam olmadan 0 satır görür; mükerrer varken `NULLS_DISTINCT` diye yanlış "devam" sonucu çıkar (ölçüldü, aynı ekler `B3-rls-kapsam.txt`).
- [ ] 1. `pnpm exec prisma db push` — **`--accept-data-loss` VERMEYİN**. Veri kaybı gerektiren bir fark varsa komut durur; o durumda dur ve incele. `DATABASE_URL` §2.1'deki `verify-full&sslrootcert` sonekini taşır; Prisma CLI'nın TLS doğrulamasını `prisma.config.ts` kurar (TASK-MUOG51GJ3PUOG Y-1). Önce salt-okuma kontrol: `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code > /dev/null; echo $?` → `0` (fark yok) ya da `2` (fark var) bağlandı demektir; `P1011 … certificate was not trusted` → CA ya da ana bilgisayar adı yanlış, **dur** (doğrulamasız bağlanmaz). `sslrootcert not found` → CA yolu yanlış. **Not:** macOS host'unda Prisma CLI canlı Supabase'e P1011 ile bağlanamaz (Darwin Security.framework, EKU doğrulaması eksikliği — ölçüldü TASK-MUOG51GJ3PUOG-devop-fb-risk1.md). **Çözüm:** Bu adımı Linux konteynerinden koşun:
  ```bash
  docker run --rm \
    -v <repo-path>:/src:ro \
    -v <certs-path>:/src/certs:ro \
    -e DATABASE_URL="<postgresql://…&sslrootcert=/build/app/certs/prod-ca-2021.crt>" \
    -e CI=true \
    node:22-alpine sh -c 'cp -r /src /build/app && cd /build/app && \
      npm install -g pnpm && pnpm install --frozen-lockfile && \
      pnpm exec prisma db push'
  ```
  Konteyner çıktısında "fark yok" (exit 0) ya da "fark var" (exit 2) görebilirsiniz; "P1011" yok olmalı. İlk defa bu yol koşulursa takvim saat kısıtı yoktur (Network indirmesi ~40 sn). Bu adım çalıştıktan sonra runner-up 3. adımdan §3.1 2a (c) adımını bir kez daha koşmalı (claim taşıma penceresi kontrolü).
- [ ] 2. `pnpm db:rls-role` — `fabrika_app` rolü (sonraki adımların `GRANT … TO fabrika_app` satırları bunu arar).
- [ ] 2a. **Eski worker'ı durdur. ZORUNLU, atlanamaz.** Yeni sürümün `legacyClaims` koruması bu adımın yerini tutmaz; yalnız bir sırayı kapatır (gerekçe ve ölçüm aşağıda, **Claim taşıma penceresi**). Yeni worker §3.3'te kalkana kadar bu DB'de hiçbir worker koşmaz.
  - **İlk canlı kurulumda** eski worker yoktur. 2a o zaman yalnız "bu DB'ye bağlı koşan bir worker yok" kontrolüdür: aşağıdaki (b) ve (c) adımları.
  - (a) Durdur: SIGTERM gönder. Worker elindeki işi bitirir ve `graceful shutdown complete` yazar. Konteynerdeyse `docker stop -t 300 <eski-worker>` kullanın; bu repodaki compose ile `docker compose --profile app stop -t 300 fabrika-worker`. Docker varsayılan olarak 10 sn sonra SIGKILL gönderir; `-t` değerini bir M4 koşusundan uzun tutun (koşu süresi ölçülmedi, 300 bir varsayımdır). Compose servisinde `stop_grace_period` yok, yani `docker compose up` konteyneri yeniden oluştururken eskisini 10 sn sonra öldürür: önce `stop -t 300`, sonra `up`.
  - (b) Durduğunu kontrol et: logun son satırlarında `graceful shutdown complete` görünmeli. Sonra sahip rolüyle (worker ayrı bir `JOBS_DATABASE_URL` rolüyle bağlanıyorsa `graphile_worker` şemasını o rol kurmuştur; sahip rolü okuyamazsa o rolle) `SELECT count(*) FROM graphile_worker.jobs WHERE locked_at IS NOT NULL;` → **0** olmalı. 0 değilse ve hiçbir worker koşmuyorsa, iş yarıda öldürülmüştür (ör. SIGKILL). Kilit 4 saat sonra düşer ve iş yeni worker'da yeniden koşar; M4 için bu zararsızdır (yeni kod eski claim'i okur). Ama 0 değilse ve bir worker hâlâ bağlıysa, **devam etmeyin**: o worker'ı bulun ve durdurun.
  - (c) Bugünkü eski claim'lerin listesini al (3. adımdan **önce**). Bu liste aşağıdaki tespit kontrolünün tabanıdır:
    ```bash
    cat > m4-claims.sql <<'SQL'
    BEGIN;
    SELECT enter_system_scope('platform-aggregate') \g /dev/null
    SELECT DISTINCT "userId" COLLATE "C" FROM "Membership"
     WHERE "staleDigestOn" >= (now() AT TIME ZONE 'UTC')::date ORDER BY 1;
    COMMIT;
    SQL
    psql -Atq "$DATABASE_URL" -f m4-claims.sql > m4-claims-before.txt   # DATABASE_URL = sahip rol
    wc -l < m4-claims-before.txt                                         # sayıyı not edin (N0)
    ```
    `enter_system_scope` satırını çıkarmayın. `Membership` FORCE RLS altındadır ve süper kullanıcı olmayan sahip rolü kiracı bağlamı olmadan **0 satır** okur, yani yanlışlıkla "temiz" görünür (ölçüldü: 3 claim varken düz sorgu 0 döndü). `COLLATE "C"` ve aşağıdaki `LC_ALL=C comm` aynı bayt sırasını kullanır; DB collation'ı ile kabuk yerel ayarı farklıysa `comm` yanlış satır bildirmez.
- [ ] 3. `DATABASE_URL=<sahip rol> scripts/apply-migrations.sh` — 42 dosya; iki kez koşmak güvenli (CI her push'ta iki kez koşuyor). Son satır `apply-migrations: 42 files applied as <sahip rol>` olmalı.
  - **Hangi rolle (İNCELEME-106 I-1, TASK-MUOEGWSV8I7H0):** şemanın ve tabloların **sahibi** olan rolle. Süper kullanıcı değil, BYPASSRLS değil, **asla `fabrika_app` değil**. CI süper kullanıcıyla koşar, canlı koşmaz; aradaki iki farkı betik kendisi kapatır ya da koşmadan önce durur:
    - (i) **Parametre yetkisi GEREKMEZ (TASK-MUOG51GJ3PUOG, 01.10.2026).** Eskiden 23. dosyadan itibaren 4 fonksiyon tanımında `SET app.system_scope = 'on'` taşıyordu; PostgreSQL bunu yalnız süper kullanıcıya ya da `SET ON PARAMETER` yetkisi olan role yazdırır ve o yetkiyi yalnız süper kullanıcı verebilir. Supabase'de süper kullanıcı (`supabase_admin`) bize kapalı, `postgres` bu yetkiyi veremez (ölçüldü: `permission denied for parameter app.system_scope`). Fonksiyonlar artık bayrağı gövdede `set_config(..., true)` ile açıp her RETURN'den önce çağıranın değerine döndürür; hata işlemi (ya da çağıranın savepoint'ini) geri alınca bayrak da geri alınır. Sızan bir `on` bile `fabrika_app`'e bir şey açmaz (`system_scope_open()` sahip yetkisi ya da mühür ister). Betik, süper kullanıcı ya da yetkili olmayan bir rolle koşarken fonksiyon başlığında `SET app.system_scope` taşıyan bir dosya görürse **hiçbir dosyayı uygulamadan** durur ve dosyayı adıyla söyler. `prisma/migration-owner-grant.sql` kaldırıldı; daha önce verilmiş bir yetki varsa `prisma/migration-owner-grant-rollback.sql` ile geri alın.
    - (ii) **Backfill'ler FORCE RLS altında:** kiracı tabloları `FORCE ROW LEVEL SECURITY`'dir. Sahip rolü kiracı bağlamı olmadan bu tablolarda 0 satır okur ve günceller. Betik bu yüzden her dosyayı `app.system_scope = 'on'` oturumuyla koşar. Bu, `prisma/rls.sql`'in mevcut `system_scope` politikasını açar; politika değişmez, hiçbir rol BYPASSRLS almaz. Bu olmadan 8 backfill dosyası sessizce 0 satır güncelliyordu. `retire-eur-plan-ladder.sql` ise emekli planı silip abonelikleri silinmiş plana işaret eder bırakıyordu (ölçüldü, TASK-MUOEGWSV8I7H0 §2.2). `system_scope` politikası olmayan bir FORCE tablo varsa betik **koşmadan önce** durur ve tabloları listeler. Çözüm: önce `pnpm db:rls`, sonra betiği yeniden koşun. Taze bir DB'de ilk koşudan sonra `db:rls`'ten önce yapılan ikinci koşu bu yüzden durur. Beklenen davranış budur. Ön-kontrolün göremediği durum (İNCELEME-115 Ö-4, TASK-MUOGMUUAWFEQX): `db:rls` hiç koşmamış ama **veri içeren** bir DB'de tablolar koşu başında henüz FORCE değildir; bir dosya (ör. `add-feedback.sql`) tabloyu koşu sırasında FORCE yapar ve sonraki backfill onu 0 satırla geçer. Betik bunu dosyalardan **sonra** yakalar: `system_scope` politikası olmayan bir FORCE tabloda satır varsa (`pg_stat_user_tables.n_live_tup > 0`) `these FORCE RLS tables hold rows but have no system_scope policy` der ve exit 1 verir. Bu durumda uygulamayı başlatmayın ve betiği **yalnızca yeniden koşmayın**: yeniden koşu atlanan her adımı yapmaz (ölçüldü: `rename-feedback-alert-columns.sql` ikinci koşuda eski olay kimliklerini arşivlemeden siler). Koşudan önce alınan yedeği geri yükleyin, `pnpm db:rls`, sonra betik.
    - (iii) **Kalıcı varsayılan yasak:** `SET` yetkisi olan bir rol (süper kullanıcı, ya da eski (i) yetkisini almış sahip) `ALTER DATABASE … SET app.system_scope = 'on'` da yazabilir (ölçüldü). Bu, `fabrika_app` dahil her yeni oturumda kiracı yalıtımını kapatır. Betik böyle bir varsayılan görürse, koşudan önce ya da sonra, exit 1 verir. Sahip rolü zaten kendi tablolarında RLS'yi kapatabilir, yani bu yeni bir güç değildir. Ama sessiz bir yoldur. **Asla elle yazmayın.**
  - **Doğrulama sorgusu** (sahip rolüyle, 3. adımdan sonra; beklenen tek satır `<sahip rol>|f|f|f|0|0`):
    ```sql
    SELECT current_user,
           r.rolsuper, r.rolbypassrls,
           has_parameter_privilege('app.system_scope', 'SET')                  AS can_set,
           has_parameter_privilege('fabrika_app', 'app.system_scope', 'SET')::int AS app_can_set,
           (SELECT count(*) FROM pg_db_role_setting s, unnest(s.setconfig) c
             WHERE c LIKE 'app.system\_scope=%')                                AS stored_defaults
      FROM pg_roles r WHERE r.rolname = current_user;
    ```
    Ardından 5. adımdaki `pnpm rls:verify` (`fabrika_app` ile) kiracı yalıtımının sürdüğünü ölçer.
  - **Zincir `m4-stale-digest-user-claim.sql`'de `deadlock detected` ile durursa** (R-2 Ö-1, TASK-MUPBP1QYZ9993; kaynak `docs/agent-results/TASK-MUPBP1QYZ9993-crw-fb.md` §3 Ö-1): sorun yok, **aynı komutu yeniden koşun**. Bu durumda psql exit 3 verir, `ON_ERROR_STOP` ile zincir durur ve son satır `42 files applied` olmaz. Neden: dosyanın DO bloğu önce `Membership` üzerinde ACCESS EXCLUSIVE kilit alır, sonra `User` satırlarını günceller. Aynı anda bir backfill hedefi `User` satırını kilitleyip `Membership`'e dokunan bir uygulama işlemi (ör. hesap silme cascade'i) kilitleri ters sırada ister. DO bütünüyle geri alınır: `Membership` FORCE RLS `true` kalır, veri kaybı olmaz (ölçüldü 3/3). Dosya idempotenttir, öncesindeki 40 dosya da öyledir (yukarıda: iki kez koşmak güvenli). Bu yüzden yeniden koşu yeterlidir; son satır `42 files applied` olmalı. Olasılık düşüktür: yalnız ilk yayında, eski sürümün `Membership` claim'i yazdığı kullanıcılarda ve tek ifadelik bir kullanıcı silmenin kısa penceresinde. Bu not **yalnız** `deadlock detected` içindir. Betik `these FORCE RLS tables hold rows but have no system_scope policy` ile durursa yeniden koşmayın, yukarıdaki (ii)'yi uygulayın.
  - Down dosyaları (§3.2) da aynı betikle ve aynı sahip rolüyle koşulur: `DATABASE_URL=<sahip rol> scripts/apply-migrations.sh --down <dosya>.down.sql`. Düz `psql -f` ile koşulan down dosyası ilk satırında durur (İNCELEME-115 Ö-2, §3.2).
- [ ] 4. `pnpm db:rls` — kiracı politikaları + sistem kapsamı fonksiyonları.
  - `system_scope` politikası imzalıdır (TASK-MUOGMQK3JAH4Y, ADR-0009): `fabrika_app` için yalnız `enter_system_scope()` açar; düz `SET app.system_scope` yalnız tablonun sahibi rolde işe yarar (apply-migrations oturumu, SECURITY DEFINER fonksiyonlar). `rls.sql` sırrı `fabrika_private.system_scope_key` tablosunda tutar ve ilk koşuda `CREATE SCHEMA fabrika_private` yapar. Bu yüzden onu koşan rolün veritabanında şema oluşturma yetkisi olmalı (DB sahibi olan migration rolünde var). Sır yenileme: `TRUNCATE fabrika_private.system_scope_key` + `pnpm db:rls`. O anda açık işlemlerde kapsam, işlem bitene kadar kapalı kalır.
- [ ] 5. `pnpm rls:verify --require-db` gerçek `fabrika_app` ile exit 0 (`--require-db`: DB'ye ulaşılamazsa exit 1; bayraksız sürüm ATLANDI deyip exit 0 verir). Supabase'de ayrıca `anon`/`authenticated`'ın şema sahibinin hiçbir fonksiyonunu çağıramadığını denetler (R-S2). Kiracı tablolarında `FORCE ROW LEVEL SECURITY` da denetlenir (bir migration FORCE'u kapatıp geri koymazsa exit 1).
- [ ] 6. **Web**'i yeni sürümle kaldır, sonra worker (§3.3).

**Claim taşıma penceresi (İNCELEME-95 B-1, İNCELEME-102 Y-1; TASK-MUOADTEOQVL4Z, TASK-MUOBQUZJGRYV9):** `m4-stale-digest-user-claim.sql` M4 özetinin günlük claim'ini `Membership.staleDigestOn`'dan `User.staleDigestOn`'a taşır. O ana kadarki claim'leri de bir kez `Membership` → `User` yönünde kopyalar (backfill). İki sürüm artık claim'i iki ayrı yerde tutar:

- **Eski** sürüm (f7a6dcf5 öncesi) yalnız `Membership.staleDigestOn`'u okur ve yazar. Yeni sürümün claim'ini **göremez**.
- **Yeni** sürüm `User.staleDigestOn`'a yazar. Ayrıca bugünkü eski claim'i de okur (`stale-reminder.ts` `legacyClaims`).

Bu yüzden koruma **tek yönlüdür**. İkinci özet, bir kullanıcının o UTC gününde her iki sürümden de özet alması demektir. İzole ortamda gerçek eski/yeni worker ve mailpit ile ölçüldü (İNCELEME-102, `docs/agent-results/TASK-MUOB16SD93PD9-crw-fb.md` §2.1):

| 3. adımdan sonra aynı UTC gününde sıra | Sonuç | Neden |
|---|---|---|
| 2a uygulandı: eski worker 3. adımdan önce durdu | **1 özet** | Eski claim backfill ile `User`'a kopyalandı |
| 2a atlandı: önce **eski** worker iş aldı, sonra yeni | **1 özet** | Yeni sürüm `legacyClaims` ile eski claim'i gördü |
| 2a atlandı: önce **yeni** worker iş aldı, sonra eski | **2 özet** | Eski sürüm `User` claim'ini okuyamaz |

Son satırda eski worker'ın iş alması için 07:00 cron tiki gerekmez. graphile-worker kaçan tiki `_private_known_crontabs.last_execution`'dan başlayarak doldurur ve iki sürüm aynı cron kimliğini (`m4-stale-relationships`) paylaşır. Yani bir tiki hangi worker koştuysa öbürü onu yeniden doldurmaz. İkinci işi getiren şey bir yeniden deneme ya da elle eklenen bir iştir (`pnpm jobs:enqueue`). Eski worker günlerce ayakta kalırsa bu risk her gün yeniden açılır. Bu yüzden 2a zorunludur. `legacyClaims` yalnız 2a'nın gözden kaçırdığı durumda ikinci savunmadır.

`scripts/apply-migrations.sh`'i yeniden koşmak ters yönü **kapatmaz**. Backfill yalnız `Membership` → `User` yönünde kopyalar; eski worker `User`'ı hiç okumaz.

Kaçan tik: eski worker durduğu sırada kaçan 07:00 tikini yeni worker açılışta `fill=6h` ile koşar. Yeni worker 13:00 UTC'den sonra açılırsa o günün özeti ertesi sabaha kalır. Bu bir gecikmedir, e-posta kaybı değildir.

**Tespit — eski worker 3. adımdan sonra da koştu mu?** Yeni sürüm `Membership.staleDigestOn`'a bugünü yazmaz: kodu o kolona hiç yazmaz, 3. adım yeniden koşulunca da yazmaz. `m4-stale-reminder-idempotency.sql`'in backfill'i NULL üyeliklere son damga gününü yazar, ama `User.staleDigestOn`'u o günü zaten kapsayan kullanıcıyı atlar. Yeni sürüm damgayı claim'le aynı anda (aynı `now`) attığı için kendi gönderdiği her özet bu koşula girer. Bu atlama olmadan, yeni worker özet gönderdikten sonra zinciri aynı gün yeniden koşmak (ikinci yayın, hotfix) tespiti eski worker olmadan da tetikliyordu (İNCELEME-106 Y-1, ölçüldü; düzeltme TASK-MUOBQUZJGRYV9). Bu yüzden 3. adımdan sonra o kolona düşen yeni bir claim, eski bir worker'ın hâlâ koştuğunu gösterir. İstisna (dar): aynı gün başka bir kullanıcıya özetle bildirilmiş bir ilişkinin sahibi değişir ve yeni sahip o gün özet almamışsa, zincirin yeniden koşusu yeni sahibe bu claim'i yazar. Bu yüzden aşağıdaki 1. adımda önce log ile doğrulayın.

- [ ] Yeni worker kalktıktan sonra ve **aynı UTC gününün sonundan önce** (23:59 UTC; en iyisi 13:00 UTC'den sonra, telafi penceresi kapanınca) 2a (c)'deki dosyayı yeniden koşun:
  ```bash
  psql -Atq "$DATABASE_URL" -f m4-claims.sql > m4-claims-after.txt
  LC_ALL=C comm -13 m4-claims-before.txt m4-claims-after.txt     # boş olmalı
  ```
  Sonuç boşsa pencere kapalıdır. Başka bir şey yapmayın.
- [ ] Ertesi UTC günü aynı dosyayı bir kez daha koşun. Çıktı **tamamen boş** olmalıdır: yayından sonraki hiçbir günde `Membership` claim'i olmaz.

Bu iki kontrolden birinin çıktısı boş değilse:

1. **Eski worker hâlâ bir yerde koşuyor.** Onu hemen bulun ve 2a (a)–(b) ile durdurun. Önce aşağıdaki log satırıyla ya da bağlantıyla doğrulayın; ikisi de yoksa yukarıdaki dar istisnayı (aynı gün sahip değişikliği + zincirin yeniden koşusu) düşünün. Bağlı istemcileri görmek için sahip rolüyle: `SELECT usename, client_addr, application_name, backend_start FROM pg_stat_activity WHERE datname = current_database();` Bilinen web ve yeni worker dışındaki bağlantı eski worker adayıdır. graphile-worker ve Prisma bağlantılarında `application_name` boştur (yalnız kilit havuzu ayarlar, `src/lib/db.ts`), yani aynı rolle bağlanan iki worker yalnız `client_addr` ve `backend_start` ile ayrılır: `backend_start`'ı yeni worker'ın açılış saatinden **eski** olan bağlantılar eski worker adayıdır. Worker kuyruğa `JOBS_DATABASE_URL` ile (yoksa `DATABASE_URL`) bağlanır; bu genelde sahip roldür. Süper kullanıcı olmayan bir rol, başka rollerin satırlarında `client_addr`'ı boş görür (`pg_read_all_stats` rolü bunu açar). Konteyner ortamında logdan da görülür: `docker logs --timestamps --since <3. adımın saati> <eski-worker> 2>&1 | grep '\[m4-stale-relationships\] DONE'`. Satırdaki `"digestsSent":N`, o koşunun gönderdiği özet sayısıdır.
2. **Kaç kişiye ikinci özet gitti?** İki sürümün de bugün claim yazdığı kullanıcılar, 2a (c) listesinde olanlar hariç:
   ```bash
   cat > m4-double.sql <<'SQL'
   BEGIN;
   SELECT enter_system_scope('platform-aggregate') \g /dev/null
   SELECT DISTINCT m."userId" COLLATE "C" FROM "Membership" m JOIN "User" u ON u.id = m."userId"
    WHERE m."staleDigestOn" >= (now() AT TIME ZONE 'UTC')::date
      AND u."staleDigestOn" >= (now() AT TIME ZONE 'UTC')::date ORDER BY 1;
   COMMIT;
   SQL
   psql -Atq "$DATABASE_URL" -f m4-double.sql | LC_ALL=C comm -23 - m4-claims-before.txt | wc -l
   ```
   Bu, tablonun üçüncü satırıdır (ölçülen durumda doğru kullanıcıyı buldu). Tespit çıktısı boş değil ama bu sayı 0 ise, eski worker yeni worker'dan **önce** koşmuş ve `legacyClaims` ikinci özeti engellemiştir. **Sayıyı zinciri yeniden koşmadan önce alın.** Zincir, eski worker'ın claim'inden sonra yeniden koşulursa `m4-stale-digest-user-claim.sql` backfill'i o claim'i `User`'a da kopyalar. Bu kopya korumanın parçasıdır. Ama bundan sonra sayı, eski worker'ın önce koştuğu ve **tek** özet alan kullanıcıları da içerir, yani yalnız üst sınırdır (TASK-MUOBQUZJGRYV9 ölçümü: eski worker önce, yeni sonra: 1 e-posta; sayı yeniden koşudan önce 0, sonra 1). Yine de 1. adım gereklidir: eski worker ayakta kaldıkça her gün bir yeniden deneme ya da elle eklenen iş ikinci özeti gönderebilir.
3. **Veriyi elle düzeltmeyin.** Claim'ler gün bazlıdır; eski worker durunca ertesi gün kendiliğinden düzelir. `Membership.staleDigestOn`'u silmek ya da `apply-migrations.sh`'i yeniden koşmak ikinci özeti geri almaz. Giden e-posta geri alınamaz. Olayı yayın notuna **yalnız sayı** olarak yazın, adres ya da ad yazmayın.

**`legacyClaims` ne zaman kaldırılır (İNCELEME-102 Ö-4):** Okuma yalnız `>= bugün` claim'lerine bakar. Eski worker tamamen durduktan sonraki UTC gününden itibaren işlevsizdir. `Membership.staleDigestOn` kolonuyla **aynı yayında** kaldırılır, ancak şu üç koşulun hepsi sağlanınca:
- Her ortamda (canlı, staging, varsa demo) yayından sonraki bir günde `m4-claims.sql` boş döner. Yani hiçbir yerde f7a6dcf5 öncesi bir worker yok. (Zincirin o gün yeniden koşulması bu sonucu bozmaz; yukarıdaki backfill atlaması.)
- f7a6dcf5 öncesine geri dönüş planı yok.
- Kaldıran kart, kolonu şemadan çıkarınca `tsc`'nin verdiği hataların hepsini kapatır: `legacyClaims` ve çağrısı, ayrıca `tests/stale-relationship-reminder.live.test.ts`'deki B-1, T-3 ve eski üyelik claim'i testleri (İNCELEME-102 ölçümü: 10 hata). Aynı kart, veri içeren bir kolonun `prisma db push` (`--accept-data-loss` yasak) ile nasıl düşürüleceğini de yazmalıdır: düşürme dosyası push'tan önce mi koşacak, yoksa kolon önce NULL'lanacak mı?

Yalnız `legacyClaims`'i kaldırıp kolonu bırakmak, eski worker kalmışsa tablonun ikinci satırını da 2 özete çevirir. Kolon düşürüldükten sonra hâlâ koşan bir eski worker ise hata verir (`tenantsFailed`) ve özet göndermez.

**Bilinen pencere (İNCELEME-12 K-6):** zincir koşarken 23. dosya (`add-agency-invite-code.sql`) ile 30. dosya (`agency-invite-no-max-uses.sql`) arasında `redeem_agency_invite()` eski gövdededir: `maxUses = NULL` olan davet kodları reddedilir (ölçüm: 23.–30. dosyalar 1,2 sn). Düşük trafik saatinde koşun; zincir yarıda kalırsa pencere açık kalır. Kontrol: `SELECT prosrc LIKE '%maxUses%' FROM pg_proc WHERE proname = 'redeem_agency_invite';` → `false` olmalı. İlk canlı kurulumda (boş DB, kullanıcı yok) bu pencere etkisizdir.

### 3.2 Geri dönüş — HAZIR (2 not)

- Her düz dosyanın yanında `<ad>.down.sql`, klasörlünün yanında `down.sql` vardır; **ters sırayla, her dosya için bir çağrı** uygulanır. Komut (sahip rolüyle, §3.1 adım 3 ile aynı rol):
  ```bash
  DATABASE_URL=<sahip rol> scripts/apply-migrations.sh --down <ad>.down.sql        # ya da <klasör>/down.sql
  ```
  Başarıda son satır `apply-migrations: rolled back with <dosya> as <sahip rol>` olur. Betik ileri dosyalardaki kontrollerin aynısını yapar (yetki, politikasız FORCE tablo, kalıcı `app.system_scope` varsayılanı) ve dosyayı `app.system_scope = 'on'` oturumuyla koşar. **Düz `psql -f <dosya>.down.sql` kullanmayın; koşmaz da.** Her down dosyası `prisma/migration-down-guard.sql`'i içerir ve betik dışında `rollback files run with scripts/apply-migrations.sh --down <file>, not plain psql` diyerek hiçbir satırı çalıştırmadan durur (exit 3). Neden (İNCELEME-115 Ö-2, TASK-MUOGMUUAWFEQX, ölçüldü): sahip rolü bu oturum olmadan FORCE RLS tablolarında hiçbir kiracı satırı görmez. `rename-feedback-alert-columns.down.sql` o durumda **0 satırı geri yükleyip arşivi siliyor ve exit 0 veriyordu**, yani eski olay kimlikleri kalıcı olarak kayboluyordu. Aynı DB kopyasında `--down` ile bütün arşivlenmiş satırlar geri geldi (süper kullanıcıyla aynı sonuç).
- **Not 1 — down dosyası olmayan 3 migration** (ölçüm: listedeki her dosya için `.down.sql`/`down.sql` arandı):
  - `credit-ledger-grant-period.sql` — geri dönüş dosyanın **başlık yorumunda**: `DROP INDEX IF EXISTS "CreditLedger_tenantId_grantPeriod_key"; ALTER TABLE "CreditLedger" DROP COLUMN IF EXISTS "grantPeriod";`. Kredi miktarı değişmez. Yeniden ileri alındığında dosya kendi damgalarını `refId`'den (`monthly_grant:YYYY-MM`) geri üretir ve eski-iş satırlarını ayıyla işaretler; yani geri-ileri güvenli. **Ama:** geri dönüş penceresinde `credits-monthly-grant` koşarsa (ayın 1'i 06:00 UTC) tekrar koruması yoktur → geri dönüşte worker'ı `JOBS_CRON_ENABLED=false` ile tutun.
  - `add-calendar-connections/migration.sql`, `add-m9-meeting-schedule/migration.sql` — klasörlü, `down.sql` yok. İkisi de yeni tablo kurar; geri dönüş `DROP TABLE` (veri gider). Canlının ilk kurulumunda geri dönüş zaten "yedekten geri yükle"dir.
- **Not 2 — pratik kural:** şema geri dönüşü yerine **yedekten geri yükleme** (§4.2) tercih edilir; down dosyaları yalnız tek bir migration'ı geri almak içindir.

### 3.3 Web ve worker dağıtım sırası (ADR-0008 §9.2) — HAZIR

İmajlar: `docker build --target runner .` (web, varsayılan son aşama) ve `docker build --target worker .` (`Dockerfile:36`). Not: hedefin adı `runner`dır, `web` değil.

İlk canlı kurulumda eski Inngest zamanlayıcısı canlıda hiç koşmadığı için 2. adım yalnız "Inngest hesabında bu uygulama kayıtlı değil" kontrolüdür:

- [ ] 1. Web'i kaldır.
- [ ] 2. Inngest panosunda FonBridge uygulaması yok ya da "Functions" boş (eski zamanlayıcı tik atmıyor).
- [ ] 3. Worker'ı `JOBS_CRON_ENABLED=false` ile kaldır (şemayı kurar; `job-queue:cron-disabled` uyarısı beklenir). Eski worker §3.1 2a'da durdurulmuş ve (b) kontrolünden geçmiş olmalı (**zorunlu**). Eski ve yeni sürümün worker'ı aynı anda koşmaz: `legacyClaims` yalnız eski → yeni sırasını korur (claim taşıma penceresi, §3.1).
- [ ] 4. Worker'ı `JOBS_CRON_ENABLED=true` ile yeniden başlat. **Tek bir** cron'lu worker yeter; iki worker aynı DB'de güvenlidir (her tik bir kez koşar).
- [ ] 5. İlk günlük tikten sonra (en geç 02:00 UTC `k1-daily-calls`) `/[locale]/admin/alerts`'te `job-queue` kaynağı ve worker logu kontrol.

Geri dönüşte sıra ters: önce worker'ı durdur, sonra web'i geri al. `m4-stale-digest-user-claim.down.sql` yeni sürümün o günkü claim'lerini üyeliklere geri kopyalamaz: geri dönüş günü yeni sürümün özet gönderdiği bir kullanıcı eski sürümden ikinci özeti alabilir. Bu, §3.1 tablosunun üçüncü satırıyla aynı durumdur. Geri dönüşü 07:00–13:00 UTC dışında yapın ya da eski worker'ı ertesi UTC gününe kadar `JOBS_CRON_ENABLED=false` ile tutun. `m4-double.sql` (§3.1) geri dönüşten sonra **koşmaz**: down dosyası `User.staleDigestOn`'u düşürür. İkinci özeti saymak için down dosyasından **önce** yeni sürümün bugünkü claim'lerini kaydedin (`User` tablosunda RLS yok):
```bash
psql -Atq "$DATABASE_URL" -c "SELECT id FROM \"User\" WHERE \"staleDigestOn\" >= (now() AT TIME ZONE 'UTC')::date ORDER BY 1" > m4-user-today.txt
```
Aynı UTC gününün sonunda `psql -Atq "$DATABASE_URL" -f m4-claims.sql | comm -12 m4-user-today.txt - | wc -l` iki özet alan kullanıcı sayısını verir (izole DB'de denendi: doğru kullanıcıyı buldu). İleri yayın aynı gün yapıldıysa 2a (c) listesindekileri çıkarın.

---

## 4. Yedekleme ve felaket kurtarma — EKSİK

Repoda Postgres yedekleme/geri yükleme betiği, zamanlayıcısı ya da belgesi **yok** (`grep -rE 'pg_dump|pg_restore|pgbackrest|wal-g'` repoda sonuç vermiyor; `scripts/compare-production-backup.ts` bir dosya ağacı karşılaştırıcısı, DB yedeği değil). Uygulama sunucusu belli olmadan (madde 1.2) kurulamaz; plan aşağıda.

### 4.1 Günlük yedek (öneri — sunucu belli olunca EKSİK kartı)

- Yönetilen Postgres seçilirse: sağlayıcının otomatik günlük yedeği + PITR (en az 7 gün). Aşağıdaki mantıksal yedek yine de alınır (sağlayıcı dışı kopya).
- Kendi sunucumuzda: her gün 01:30 UTC (en erken iş 02:00 UTC'den önce)
  `pg_dump --format=custom --no-owner --file=fonbridge-$(date -u +%F).dump "$BACKUP_DATABASE_URL"`
  - `BACKUP_DATABASE_URL`: salt okur ama RLS'i atlayabilen ayrı rol (`fabrika_app` RLS yüzünden kiracı satırlarını **göremez**; onunla alınan yedek boş çıkar).
  - `graphile_worker` şeması dahil (kuyruk durumu); `pgvector` uzantısı hedefte kurulu olmalı.
  - Saklama: 7 günlük + 4 haftalık + 12 aylık. **Sunucu dışına** kopya (R2/S3 ya da Vulut yedek alanı), şifreli (`age`/`gpg`); anahtar sunucuda değil, patronun kasasında.
  - Başarısızlık: betik çıkış kodu ≠ 0 → `SystemAlert(source='db-backup', level='error')` + dış kalp atışı (§5.3).
- **KVKK notu:** kişisel verinin imhası (`users-scheduled-deletion`, `public-lead-cleanup` 12 ay) yedeklerde saklama süresi kadar gecikir → yedek saklama süresi (en uzun 12 ay) `docs/legal/processing-register.md`'ye yazılmalı. Geri yüklemeden sonra imha işleri bir kez elle koşulur (`pnpm jobs:enqueue -- users-scheduled-deletion`, `-- public-lead-cleanup`) ki geri gelen silinmiş kayıtlar yeniden silinsin.

### 4.2 Geri yükleme testi planı (canlıdan önce bir kez, sonra ayda bir)

1. Boş bir Postgres 16 + pgvector (yerelde `docker compose up -d postgres-vector` ayrı bir veri hacmiyle ya da geçici VM).
2. `pg_restore --no-owner --dbname=<test> fonbridge-<tarih>.dump`
3. `pnpm db:rls-role && pnpm db:rls && pnpm rls:verify` → exit 0.
4. Satır sayıları karşılaştır: `Tenant`, `User`, `CreditLedger`, `AuditEvent` (kaynak ile ± o günün yazımları).
5. Uygulamayı bu DB'ye bağla, giriş + bir kiracı sayfası açılıyor.
6. Süreyi yaz (RTO ölçümü). Hedef öneri: **RPO ≤ 24 saat, RTO ≤ 4 saat** (pilot için; patron onaylar).

### 4.3 Felaket kurtarma (sunucu kaybı)

- Kod: GitHub (`origin`) — push edilmemiş commit felakette kaybolur (§6).
- İmaj: yeniden `docker build` (dış kayıt defteri yok).
- Sırlar: üretim `.env`'i sunucudan başka **bir yerde de** (patronun parola kasası) tutulmalı; aksi hâlde `AUTH_SECRET` kaybı tüm oturumları, `CALENDAR_ENCRYPTION_KEY` kaybı şifreli takvim bağlantılarını geri dönülmez kılar.
- DNS: TTL'ler canlı öncesi kısa (300 sn) tutulursa yeni IP'ye geçiş dakikalar sürer.

---

## 5. İzleme — `SystemAlert` kime, nasıl ulaşıyor? — EKSİK (kısmi)

### 5.1 Bugünkü durum (koddan)

- Tek yazıcı `recordAlert()` (`src/lib/observability/system-alert.ts`): satır `SystemAlert` tablosuna yazılır. **Hiçbir şey dışarı gönderilmez** — dosya başlığı: "Alerts now land in the `SystemAlert` table and are read by platform admins at /[locale]/admin/alerts. Nothing leaves the deployment." (Sentry kaldırıldı, yerine bu geldi.)
- Yani alarm **çekme** (pull) usulü: biri `/[locale]/admin/alerts` ekranını açmadıkça kimse görmez. E-posta, SMS, push **yok**.
- Tekrar eden hata yeni satır açmaz, `alertRepeatCount` artar (TASK-MTS80DUAF39Z8) — tek satır ≠ az sorun.
- Worker sağlığı: `job-queue-health` her saat :05 UTC kaçırılmış tik / tükenmiş / takılmış işi `SystemAlert`'e yazar (ADR-0008 §9.3). **Sınır:** cron'lu hiç worker yoksa bu alarm da yazılmaz — sessiz kalır.
- `pnpm alerts:check`: açık alarmların silinmiş kiracıyı göstermediğini ölçer (kapıda).

### 5.2 Canlıdan önce kapatılması gerekenler

- [ ] **EKSİK — alarm e-postası:** `error` seviyeli yeni (ya da tekrar sayacı eşiği aşan) `SystemAlert` için günlük/saatlik özet e-postası (mevcut `smtpMailer` ile, yeni bir iş `alerts-ops-digest`). Alıcı adresi **PATRON** (öneri: `info@fonbridge.com` ya da ayrı `ops@`). Kişisel veri taşımaz (alarm satırı zaten taşımıyor).
- [ ] **EKSİK — dış kalp atışı (ADR-0008 §9.3 "henüz yok"):** harici uptime izleyici (ör. UptimeRobot/Better Stack ücretsiz katman — **PATRON** hesap açar):
  - `https://fonbridge.com/` (ya da bir sağlık ucu) 5 dk'da bir, 200 bekler.
  - Worker: `graphile_worker._private_known_crontabs` içinde `job-queue-health` `last_execution` 70 dk'dan eskiyse alarm — bunun için web'de yetki gerektiren küçük bir sağlık ucu gerekir (EKSİK kartı).
  - Yedek betiği (§4.1) bitince bir "check-in" URL'ine ping.
- [ ] Log toplama: web ve worker stdout'u — Docker `json-file` sürücüsü ile `max-size=50m, max-file=5` (disk dolmasın). Sunucu belli olunca.

### 5.3 Yayından sonraki ilk 24 saat

- [ ] `/[locale]/admin/alerts` → `source='users-scheduled-deletion'` alarmı **yok** (iş 03:00 UTC). Varsa ve `failureKinds` `P2011` ise §3.1 adım 3 atlanmıştır.
- [ ] `source` `job-queue` ile başlayan `error` alarmı yok; `job-queue:cron-disabled` yok (yani 3.3 adım 4 yapıldı).
- [ ] SMTP yoksa her gönderim denemesi `SystemAlert` yazar → e-posta ile ilgili alarm yok.

### 5.4 HSTS ramp-up (ilk hafta → sonra)

Strict-Transport-Security başlığı Caddy tarafından gönderilir (uygulama eklemez). Kurulum sırası:

1. **Gün 1 (yayından sonra):** Caddyfile'da `header Strict-Transport-Security "max-age=300"` ile başla.
   ```bash
   curl -sI https://fonbridge.com/ | grep -i strict-transport
   # Beklenen: strict-transport-security: max-age=300
   ```

2. **Gün 8 (toplam 7 gün geçtikten sonra):** Caddyfile güncellemesi:
   ```caddy
   header Strict-Transport-Security "max-age=31536000"  # 1 yıl
   ```
   Caddy reload sonra doğrula:
   ```bash
   curl -sI https://fonbridge.com/ | grep -i strict-transport
   # Beklenen: strict-transport-security: max-age=31536000
   ```

3. **Gün 366 (opsiyonel):** `includeSubDomains` eklenebilir (cPanel subdomains kalıcı olarak kilitlenmeyecekse).

---

## 6. GitHub push (1 Ekim) ve CI

Ölçüm (30.09 00:43 TRT, yerel referanslar; `git fetch` koşulmadı):

```
$ git rev-list --count origin/dev..dev
223
$ git log -1 --format='%h %aI' origin/dev
c5aa48d7 2026-09-29T07:26:22+03:00
$ git remote -v
origin  https://github.com/yaslan/fonbridge.git
```

- **PATRON — push:** patron kararı push 1 Ekim. 223 commit (en eski 29.09 07:27, en yeni 30.09 00:42). Push, kodun makineden çıktığı an; o güne kadar tek kopya bu makine (felaket riski §4.3).
- **CI — HAZIR:** `.github/workflows/ci.yml` `push`/`pull_request` → `main`, `dev`. Postgres 16 + pgvector servis konteyneri; `db push` → `db:rls-role` → `apply-migrations.sh` **iki kez** (idempotensi kapısı) → `db:rls` → `db:seed` → lint, typecheck, test, `next build`, e2e. **GitHub sırrı gerektirmez** (`grep secrets\. .github/workflows/*.yml` boş), yani push'tan sonra ek ayar olmadan koşar. Ayrıca `check-rls.yml`, `i18n-check.yml`, `a11y-check.yml`.
- **EKSİK — yerel pre-push kapısı devre dışı:** `git config core.hooksPath` → `/Users/macbook/AgentSpace/fabrika/githooks` — bu dizin **yok** (`ls` → No such file or directory). Repodaki `githooks/pre-push` (`pnpm gate`) bu yüzden push'ta **koşmaz**. Düzeltme (yerel, geri alınabilir): `git config core.hooksPath githooks` — geri alma: eski değeri geri yaz. Push'u yapan makinede ayarlanmalı; bu kart ayarı değiştirmedi (paylaşımlı ağaç, diğer ajanların commit'lerini etkiler — patron/lider onayı).
- Push öncesi öneri (PATRON ya da lider): temiz bir worktree'de `pnpm gate` bir kez (fe-fb 30.09 ölçümü: install/tsc/lint/i18n/rls/build 0; vitest 2814/2822, 2 bilinen kararsız test — `docs/agent-results/TASK-MUN66PFFWT9MA-fe-fb.md`).
- İlk push'ta CI kırmızı çıkarsa: `docs/agent-results/` altındaki son kapı ölçümleriyle karşılaştır; kararsız testi yeniden koş (rerun), gerçek kırmızıyı düzelt.

---

## 7. Diğer notlar (bloklayıcı değil, bilinmeli)

- `src/lib/llm.ts:85` `'M6:evaluation': 'claude-opus-5'` — varsayılan `claude-sonnet-5`, ama M6 değerlendirme görevi Opus'a gidiyor. Karar "claude-sonnet-5" ise bu satır bilinçli bir istisna mı, maliyet açısından patron teyit etmeli (**PATRON**, soru).
- `src/components/PublicFooter.tsx` ve bazı hukuk belgeleri hâlâ `info@usfinbridge.com` diyor (`docs/SMTP-SUNUCU.md` §9) — fe/cs işi.
- HSTS Caddyfile'da `max-age=300` ile başlıyor (`docs/SMTP-SUNUCU.md` §10.1); bir hafta sorunsuzsa büyütülür.

---

## 8. Patronun yapacakları — tek sıralı liste

Sıra bağımlılığa göre; her adım bir öncekini bekler (paralel yapılabilenler aynı numarada harfle).

1. **Uygulama sunucusu kararı:** web + worker + Postgres 16 (pgvector) nerede koşacak? `77.92.144.187` paylaşımlı cPanel sunucusu; orada Docker/uzun yaşayan süreç/pgvector olup olmadığını Vulut'a sor. Olmuyorsa Vulut VPS (öneri: 2 vCPU / 4 GB / 60 GB SSD) — **`<APP_IP>`**'yi bize ilet.
2. **fonbridge.com'u `srv.iyisunucu.com.tr` cPanel'ine ekle** (bugün NS'ler `REFUSED`). NS değişmez.
3. Zone Editor: kök `A` → `<APP_IP>`, `www` → kök, `mail A 77.92.144.187`, MX, SPF, DMARC, DKIM (2048 bit) — tam liste `docs/SMTP-SUNUCU.md` §3.0/§8 madde 3. TTL 300.
4. Posta kutuları `info@` + `dmarc@`; **S-1 kararı** (uygulama `info@` ile mi, ayrı `bildirim@` ile mi göndersin — öneri ayrı kutu). AutoSSL çalıştır.
5. Vulut'a tek bilet (`docs/SMTP-SUNUCU.md` §8 madde 7 a–g) + 1. maddedeki sunucu sorusu aynı bilette.
6. **Google OAuth:** `fonbridges` GCP projesinde OAuth istemcisi (Web). Yetkili yönlendirme URI'si **`https://fonbridge.com/api/auth/callback/google`**, JavaScript kaynağı `https://fonbridge.com`. OAuth izin ekranı: uygulama adı FonBridge, destek e-postası `info@fonbridge.com`, yayın durumu "Üretim" (test modunda yalnız eklenen test kullanıcıları girebilir). `cevreportal` istemcisini üretimde kullanma.
7. **OpenAI anahtarını yenile:** yeni anahtar üret, açığa çıkanı **iptal et**, projeye aylık harcama limiti koy. Anthropic konsolunda da aylık limit.
8. **Dosya depolama kararı:** Cloudflare R2 hesabı + bucket (`fonbridge-evidence`) + erişim anahtarı ve public host — ya da pilotta dosya yükleme kapalı. (Karar yoksa yüklemeler sessizce kaybolur, §2.2.)
9. **Üretim `.env`'ini sunucuda bizzat doldur** (repoya/sohbete yazma): §2.1'in tamamı, §2.2'de seçtiklerin; `AUTH_SECRET` yeni üret (`openssl rand -base64 32`); `DEMO_LOGIN_ENABLED` boş; `JOBS_CRON_ENABLED=false` (worker için). Bir kopyasını parola kasana koy (§4.3).
10. **Alarm alıcı adresi** (`SystemAlert` özeti için) ve **uptime izleyici hesabı** (§5.2).
11. **RPO/RTO hedefini onayla** (öneri RPO ≤ 24 sa, RTO ≤ 4 sa) ve yedeğin sunucu dışı konumunu seç (§4.1).
12. **1 Ekim: GitHub push** (`git push origin dev`) — öncesinde push yapılacak makinede `git config core.hooksPath githooks` (§6). CI yeşilini gör.
13. 1–11 bitince haber ver → biz (onayla): sunucuya Caddy + Docker kurulumu, §3.1 şema sırası, §3.3 web→worker sırası, §4.2 geri yükleme testi, `docs/SMTP-SUNUCU.md` §7 posta ölçümleri, `docs/SMTP-SUNUCU.md` §10.3 yönlendirme ölçümleri.
14. **Canlıya geçiş onayı** (açık, yazılı). Onaysız hiçbir adım canlıya yazılmaz.

## 9. Dev entegrasyon prosedürü (TASK-MUOFCOKBQBUSQ)

1. İşçi ajan yalnız kendi worktree'sinde ve kendi dalında çalışır. Ana checkout'ta (`/Users/macbook/alan/FONBRIDGE`, dal `dev`) tracked dosya değiştirmez, `dev` ref'ini de ilerletmez. Merge'ü yalnız entegratör (devop-fb) yapar.
2. Entegratör başlamadan önce `git status --short --untracked-files=no` çıktısını ≥20 sn arayla iki kez alır. Çıktıda başka birinin tracked değişikliği varsa durur. Değişikliğin sahibi kapandıysa değişiklik kaybolmasın diye önce kurtarılır: `git diff -- <dosya> > x.patch`, ardından `git worktree add <wt> -b <sahip>/<iş>-wip dev`, `git -C <wt> apply x.patch`, `git -C <wt> commit -- <dosya>` ve `git diff dev <dal> | cmp - x.patch`. Ancak bu kanıttan sonra ana checkout'ta `git checkout -- <dosya>` koşulur.
3. Yalnız inceleme raporu TAMAM/ONAY olan ve görev metninde adı geçen dal merge edilir: `git merge --no-ff <dal>`. Çakışma olursa entegratör durur ve raporlar, çakışmayı çözmez. Merge'den önce `git merge-tree --write-tree HEAD <dal>` ile çakışma olup olmadığına bakılır.
4. Her merge'den sonra kapılar CI sırasıyla koşulur. DB, izole ve sıfırdan kurulmuş bir Postgres'tir (ör. `devopfb-int-pg`, 127.0.0.1:55223; :5433 yasak, `.env`'e dokunulmaz). DB hazırlığı `prisma db push → db:rls-role → apply-migrations ×2 → db:rls → db:seed` sırasıyla yapılır. Kapılar: `lint`, `typecheck`, tam `vitest run` + `check-live-skips`, `build`. Şema veya RLS değiştiyse bunlara `rls:check`, `rls:bypass-check` ve `rls:verify` eklenir. `DATABASE_URL`, `DATABASE_URL_RLS_TEST` ve `CI=true` komut satırında verilir ve çıktıya basılır.
5. Ham çıktılar `docs/agent-results/<TASK>-devop-fb-ekler/` altına yazılır. Bir kapı 0'dan farklı biterse sonraki dala geçilmez.
6. Her adımdan önce ve sonra `git reflog -3 dev` kontrol edilir. Entegratörün yapmadığı bir `dev` hareketi görülürse raporda "eşzamanlı yazıcı" olarak kaydedilir. Kapılar o hareketi de kapsayacak biçimde yeniden koşulur.
7. Commit'ler `git commit -- <yollar>` ile atılır; geniş `git add -A` kullanılmaz. İş bitince `git merge-base --is-ancestor <sha> dev` ile her dalın dev'de olduğu kanıtlanır. Push yalnız ayrı ve açık onayla yapılır.
