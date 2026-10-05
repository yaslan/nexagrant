# TASK-MUMACL71C32U4 — FB İNCELEME-16 (crw-fb)

Kod değiştirilmedi, push yok. Kart 2 ayrık worktree'de koşuldu (`git worktree add --detach … bec7b483`, kendi `node_modules`'u, `prisma generate`). İş bitince worktree kaldırıldı. Açtığım süreçlerin hepsi benimdi (:3217 `next dev`, :3218 `server.js`, :8288/:8289 `inngest dev`) ve kapatıldı. Paylaşılan :3000'e dokunmadım.

## Karar tablosu

| Kart | Görev | Ajan | Commit | Karar | Bulgular |
| ---- | ----- | ---- | ------ | ----- | -------- |
| 1 | TASK-MUM9RXZX5RGAU (ROADMAP 29.09 akşam + KVKK eki K-2/K-4) | cs-fb | `4d78e2b2` | **ONAY** | K-1 (not) |
| 2 | TASK-MUM6CYJFKW69I (yerel Inngest kurulumu) | devop-fb | `bec7b483` | **DÜZELTME GEREKLİ** | **B-1** (bloke eder), K-2, K-3 |

**Bloke eden bulgu: B-1 (Kart 2).** Yerel akış doğru ve çalışıyor. Ama commit, varsayılan davranışı "kapalı kalınca güvenli" (cloud kipi + boş anahtar → 500) olmaktan çıkarıp "açık kalınca güvensiz" (dev kipi → imza doğrulaması yok) yapıyor. README'nin önerdiği `cp .env.example .env` + depodaki Dockerfile ile bu durum üretim imajına taşınıyor. Bunu uçtan uca gösterdim.

## 1. Ne yapıldı

### Kart 1: `4d78e2b2`
- ROADMAP'e bu commit'le eklenen 32 benzersiz hash'in her biri için `git log -1 --format=%s` ile commit'in taşıdığı TASK kimliğini çıkardım ve yanında yazılan kartla karşılaştırdım. Ayrıca her hash'in `HEAD`'in atası olduğunu kontrol ettim.
- Pilot kapıları tablosunu İNCELEME-15 (`5b28908c`) sonucuyla ve board'la (REST, salt-okuma) karşılaştırdım.
- KVKK eki :82, :97, :145 ve işleme envanteri §18c (c)/(e)/(g) değişikliklerini koddan doğruladım (`src/lib/agency/codes.ts`, `src/lib/registration-*-cookie.ts`, `src/lib/auth.ts`).

### Kart 2: `bec7b483`
- README "Yerel çalıştırma" + "Yerel Inngest" adımlarını temiz `.env.example` kopyasıyla izledim.
- Üretimde `INNGEST_DEV` riskini SDK kaynağından (`inngest@4.18.1`) okudum. Ardından üretim derlemesinde (`pnpm build`, `output: 'standalone'`) imzasız bir istekle denedim ve karşı testle (dev kipi kapalı + imza anahtarı) sınadım.

## 2. Kanıt

### Kart 1: hash ↔ kart eşlemesi (32/32 tutuyor)

```
03377c94 TASK-MUM97IPC2QSGC   0dde7031 TASK-MULRRNIHVZM1Z   15f70b0d TASK-MUM74FUB1DRCM
2ef3593e TASK-MUM676F010E9G   347228c4 TASK-MUM3TMP8HU76G   41ec739c TASK-MULSMUB1XU9
4245355f TASK-MULWC74HGLY9T   62a2715e TASK-MUM4WVYLSH9IT   69e239ae TASK-MUM97PKOEUQBA
6f07ce7b TASK-MUM743H8P5QFK   7402c2d7 TASK-MULRQJQYM0NAM   8966826d TASK-MULXXDG4O483Y
897d3608 TASK-MULRR8P7HIII4   8d448fa8 TASK-MULRR08Y9YI77   8f4048db TASK-MULZATEX4G92H
9fbc81f8 TASK-MUM676F010E9G   ac1383ee TASK-MUM97YNXRH61    af1905da TASK-MUM3WSS7DOGJL
afeead2c TASK-MUM3WSS7DOGJL   b11ed48b TASK-MUM17YBJVAHRR   b4cab2f3 TASK-MULXXDG4O483Y
b79dbfc6 TASK-MULRRHM9N7XPM   ba6ed459 TASK-MUM74TE5F3K44   c5aa48d7 TASK-MULRRNIHVZM1Z
d091cf72 TASK-MULRR08Y9YI77   df1d2341 TASK-MULRQSJFB8RWJ   ef8627b0 TASK-MULXF0AVMD8MN
f3cb2536 TASK-MULSCEK4JHK8X   f7a36779 TASK-MULU7GVFBTRXX   fb133d28 TASK-MUM2RMN3YIBGC
10d39f0a / 44d558ee → ADR-0006 commit'leri (TASK kimliği yok; ROADMAP bunları ADR'ye bağlıyor, doğru)
```
Tümü `HEAD`'in atası (`[NOT IN HEAD]` çıkmadı).

### Kart 1: metin ↔ kod

| Metin (ek / envanter) | Kod | Sonuç |
| --- | --- | --- |
| Ek :145 / §18c: "tarih alanının üst sınırı aynı sabitten türetilir (`lastExpiryDay`), normalde bugün + 365" | `codes.ts:23` `MAX_VALIDITY_DAYS = 366`; `codes.ts:44-45` `now + 366·DAY − (DAY − 1 s)` → gün sonu 23:59:59 olduğu için bugün+365, UTC günün son saniyesinde +366; `ajans/page.tsx:83` `maxExpiresOn={lastExpiryDay(renderedAt)}` | Doğru |
| Ek :82 / :97 / §18c (c)(g): il ve karne çerezi "okunduktan hemen sonra, kayıt reddedilse de silinir (tek kullanım)" | `auth.ts:153-155` (davetli kayıt) ve `auth.ts:715-718` (düz kayıt) okur ve **hemen** `clearRegistrationChoiceCookies()` çağırır; ret yollarında da siliniyor: `auth.ts:149-150` (onay eksik), `auth.ts:591` (signIn reddi), `auth.ts:705` (bağlanan hesap) | Doğru |
| 15 dk, httpOnly | `registration-province-cookie.ts:21,32-38`, `registration-readiness-cookie.ts:18,28-34` | Doğru |

### Kart 1: pilot kapıları
`4d78e2b2` (09:07:55) tabloda (b) için "bağımsız inceleme sürüyor", B3/B4 için "Açık" yazıyordu. İNCELEME-15 ONAY'ı 7 saniye sonra geldi (`5b28908c`, 09:08:02). Bu bir yazım hatası değil, yarış. cs-fb ADR-0007 commit'i `c132327c`'de (b), B3 ve B4'ü "Kapandı" olarak düzeltti (ROADMAP:20, :186, :187, :222). Kalan tek eski ifade K-1'de.

### Kart 2: README akışı (temiz `.env.example`)

```
$ cp .env.example .env && perl -pi -e "s|^AUTH_SECRET=\$|…|" .env    → AUTH_SECRET dolu (1)
$ grep '^INNGEST' .env  → INNGEST_DEV=1 · INNGEST_API_KEY= · INNGEST_EVENT_KEY= · INNGEST_SIGNING_KEY=
$ docker compose config -q && echo compose-ok  → compose-ok
$ pnpm install --offline --frozen-lockfile     → Done in 5.9s
$ pnpm db:generate                              → ok
$ next dev -p 3217
$ curl -s -w '\nHTTP %{http_code}\n' localhost:3217/api/inngest      # Inngest dev sunucusu henüz kapalı
{"extra":{"native_crypto":true},"has_event_key":false,"has_signing_key":false,"function_count":10,"mode":"dev","schema_version":"2024-05-24"}
HTTP 200
$ npx --yes inngest-cli@latest dev -u http://localhost:3217/api/inngest --no-discovery
$ curl localhost:8288/v0/gql '{ functions { slug } }'
  → 10 fonksiyon: fabrika-app-agency-monthly-report, -alerts-daily, -alerts-sweep, -credits-monthly-grant,
    -feedback-weekly-digest, -k1-daily-calls, -k2-monthly-cordis, -m4-weekly-summary,
    -stripe-event-cleanup, -users-scheduled-deletion
$ curl -X POST localhost:8288/e/localkey -d '{"name":"agency/report.generate","data":{"period":"2026-08"}}'
{"ids":["01M3NXFXP16XB8TY2NKAFBJ8DQ"],"status":200}
$ curl localhost:8288/v1/events/01M3NXFXP16XB8TY2NKAFBJ8DQ/runs
  run_id 01M3NXFXV2M7G4XT83Q666G0S3 · status "Completed" · 06:26:34.466Z → 06:26:34.748Z
next log: POST /api/inngest?fnId=fabrika-app-agency-monthly-report&stepId=step 206 in 263ms
```
Koşu kimliği: **`01M3NXFXV2M7G4XT83Q666G0S3`**. Dönem 2026-08 devop-fb'nin koşusunda zaten üretilmişti, bu yüzden bu koşu idempotent (yeni satır yazmadı; aşağıdaki doğrudan istek `generated:0, skipped:7` gösteriyor).

Atladığım README adımları: `docker compose up`, `db push`, `db:rls-role`, `apply-migrations.sh`, `db:rls`, `db:seed`. Yığın zaten ayaktaydı (:5433), bu adımlar da paylaşılan DB'ye yazardı. Bu yüzden `.env.example`'daki varsayılan URL'lerle ayaktaki DB'ye bağlandım.

### Kart 2: B-1 kanıtı (üretim derlemesi)

1. SDK kaynağı: `node_modules/inngest/components/InngestCommHandler.js:1437-1446`
   ```js
   if (this.skipSignatureValidation) return { success: true, keyUsed: "" };
   if (this.client.mode !== "cloud") return { success: true, keyUsed: "" };
   ```
   Kip `components/Inngest.js:310-313`'te belirleniyor: önce `isDev` seçeneği, sonra `INNGEST_DEV`. **`NODE_ENV`'e bakılmıyor.** `src/lib/inngest/client.ts` `isDev` vermiyor. `src/lib/env.ts`'te `INNGEST_DEV` hiç yok, yani üretimde reddedilmiyor.
2. Aynı worktree'de (`.env` = `.env.example` kopyası) `pnpm build` → rc=0. `output: 'standalone'` (`next.config.ts:29`) `.env`'i derleme çıktısına **kopyalıyor**:
   ```
   $ ls -la .next/standalone/ | grep env
   -rw-r--r--  1 macbook wheel 8595 Sep 29 09:27 .env
   $ grep '^INNGEST' .next/standalone/.env
   INNGEST_DEV=1
   ```
   Depoda `.dockerignore` yok. `Dockerfile` builder aşamasında `COPY . .` yapıyor, runner aşamasında `.next/standalone`'u kopyalıyor. Yani `.env`, dolayısıyla `INNGEST_DEV=1`, imajın içine giriyor. `docker-compose.yml`'deki `fabrika-web` `INNGEST_DEV`'i ezmiyor.
3. Kabukta `INNGEST_DEV` **yokken**, `NODE_ENV=production node .next/standalone/server.js` (:3218):
   ```
   $ curl 127.0.0.1:3218/api/inngest
   {"extra":{"native_crypto":true},"has_event_key":false,"has_signing_key":false,"function_count":10,"mode":"dev",…}
   HTTP 200
   ```
4. **İmzasız** doğrudan istek (başlık yok, `X-Inngest-Signature` yok):
   ```
   $ curl -X POST '127.0.0.1:3218/api/inngest?fnId=fabrika-app-agency-monthly-report&stepId=step' \
          -H 'content-type: application/json' --data @body.json     # {event, events, steps:{}, ctx:{run_id…}}
   [{"op":"StepRun","name":"generate-agency-reports",
     "data":{"success":true,"period":"2026-08","agencies":7,"generated":0,"skipped":7,"failed":0}, …}]
   HTTP 206
   ```
   Adım üretim derlemesinde koştu ve DB'den 7 ajansı okudu.
5. **Karşı test**, aynı derleme: `INNGEST_DEV=0 INNGEST_SIGNING_KEY=<sahte> NODE_ENV=production`:
   ```
   GET  /api/inngest → {"message":"Unauthorized"} HTTP 401
   POST (aynı gövde) → {"message":"Unauthorized"} HTTP 401
   ```

## 3. Bulgular

### B-1 (Kart 2, bloke eder): `INNGEST_DEV=1` üretime sızarsa `/api/inngest` herkese açık bir "iş koştur" ucu oluyor, kodda hiçbir kilit yok
- **Dosya:** `.env.example:51` (yeni varsayılan), `src/lib/inngest/client.ts:4-8` (`isDev` yok), `src/lib/env.ts:29-30` (`INNGEST_DEV` şemada yok). Taşıyıcı: `Dockerfile` (`COPY . .`, `.dockerignore` yok) + `output: 'standalone'`'ın `.env` kopyası.
- **Senaryo:** Operatör README'yi izler (`cp .env.example .env`), anahtarları doldurur ama `INNGEST_DEV`'i silmeyi unutur (ya da `.env`'e hiç dokunmadan imajı derler). Ardından `docker compose --profile app up`. İnternetten herkes:
  - `users-scheduled-deletion`'ı `{"event":{"data":{"gracePeriodDays":0}}}` ile çağırır. `purgeDueUsers(0)` (`users-scheduled-deletion.ts:76,88`) silme isteyen **her** kullanıcıyı hemen, geri dönüşsüz siler. İptal penceresi ortadan kalkar (KVKK silme akışı). *Yıkıcı olduğu için koşmadım, koddan.*
  - `credits-monthly-grant`'ı istediği kadar çağırır. İdempotentlik yok (`credits-monthly-grant.ts:36-43` her çağrıda `creditLedger.create`), üstelik `steps` hafızası istek gövdesinden geldiği için `fetch-active-tenants` sonucu da saldırgan tarafından verilebilir. Sonuç: sınırsız AI kredisi. *Koddan, koşmadım.*
  - `alerts-daily` ve `feedback-weekly-digest` ile e-posta yağdırır, `k1`/`k2` ile dış API kotalarını tüketir.
- **Neden bu commit'e bağlı:** Commit'ten önce `INNGEST_DEV` yoktu. Anahtarsız üretim 500 veriyordu, yani kapalı kalınca güvenliydi. Şimdi örnek dosya varsayılan olarak dev kipini açıyor ve tek koruma iki yorum satırı. devop-fb raporunun "Riskler" bölümü bunu kendisi söylüyor ve ayrı kart öneriyor. Ama kilit, varsayılanı değiştiren commit'le birlikte gelmeli.
- **Önerilen düzeltme (küçük):**
  1. `src/lib/inngest/client.ts`: `isDev: process.env.NODE_ENV === 'production' ? false : undefined`. `isDev` env'den önce okunur (`Inngest.js:310`), `process.env.NODE_ENV` de derlemede sabitlenir. Böylece üretim derlemesi `INNGEST_DEV=1`'i yok sayar ve **çalışma zamanında `NODE_ENV=test` vererek atlatılamaz** (bkz. İNCELEME `TASK-MULT4H6G6LCQG` Ö-1: `env.NODE_ENV` ile yazılmış kilit bu yolla atlatılmıştı). Ek olarak `env.ts`'e `DEMO_LOGIN_ENABLED`'daki gibi bir açılış reddi konabilir, ama tek başına yetmez.
  2. Test: üretim derlemesi + `INNGEST_DEV=1` + imza anahtarı → imzasız POST 401 (yukarıdaki 3.–5. adımların tekrarı).
  3. (Ayrı, bkz. K-2) `.dockerignore`.

### K-1 (Kart 1, not): ROADMAP:198 hâlâ "Sürüyor: İNCELEME-15 TASK-MUM9RP3R6S13K (in_progress)" diyor
İNCELEME-15 `done` (`5b28908c`). `c132327c` kapıları düzeltti ama bu satırı atladı. Satırda İNCELEME-15'in (ve bu kartın, İNCELEME-16'nın) listeye eklenmesi gerekiyor. Bloke etmez. cs-fb bir sonraki ROADMAP dokunuşunda halledebilir.

### K-2 (Kart 2, not, bu commit'ten önce de vardı): `.dockerignore` yok, imaj yerel `.env`'in tamamını taşıyor
Yukarıdaki 2. adım: `.next/standalone/.env` imaja giriyor. Bu yalnız `INNGEST_DEV` değil, yerel `AUTH_SECRET`, DB parolaları ve varsa Stripe/Resend anahtarları da demek. Ayrıca imajdaki `.env`, compose'un vermediği her değişkeni sessizce dolduruyor. Öneri: `.dockerignore` (`.env*`, `!.env.example`, `node_modules`, `.next`, `.venv`, `test-artifacts`…). Bu kartın kapsamı dışında, devop-fb için ayrı kart önerilir.

### K-3 (Kart 2, not): README'deki `echo 'INNGEST_DEV=1' >> .env` satırı sonu newline'sız bir `.env`'i bozar
Yerel `.env`'in son satırı newline'la bitmiyorsa satır bir öncekine yapışır (`…=trueINNGEST_DEV=1`). `.env.example` newline'la bitiyor (kontrol edildi), bu yüzden sorun yalnız elle düzenlenmiş eski `.env`'lerde çıkar. `printf '\nINNGEST_DEV=1\n' >> .env` daha güvenli. Önemsiz.

### Kart 2'de doğru olanlar
Kök neden (cloud kipi + boş imza anahtarı → 500), 200 kontrolü, "dev sunucusu kapalıyken de 200", portlar, olayla tetikleme ve idempotentlik iddiaları doğrulandı. `.env.example`'a sır yazılmamış.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUMACL71C32U4-crw-fb.md` (yalnız bu rapor)

## 5. Riskler
- Doğrulama istekleri paylaşılan yerel DB'ye karşı koştu. Yalnız okuma yaptılar: 2026-08 zaten üretilmişti, `generated:0, skipped:7`. Yeni satır yazılmadı.
- B-1'deki silme ve kredi senaryolarını yıkıcı oldukları için koşmadım. Dayanakları kod satırları ve 4. adımdaki aynı yolun (imzasız `StepRun`) çalıştığının kanıtı.

## 6. Açık sorular
- B-1 düzeltmesi devop-fb'nin bu kartına mı eklenecek, yoksa ayrı bir be-fb kartı mı açılacak? Önerim: aynı kart. Değişiklik tek satır + tek test.

## 7. Sonraki adım
- devop-fb: B-1 (client `isDev` kilidi + üretim derlemesi testi). K-2 için ayrı kart.
- cs-fb: K-1'deki satır.
- Düzeltme gelince yeniden inceleme: yukarıdaki 3.–5. adımlar tek komutla tekrarlanabilir.

**Platform beyanı:** Yalnız macOS'ta (Darwin 27, arm64) koşuldu. Kart 1 salt doküman. Kart 2'deki B-1 platforma bağlı değil: SDK kip seçimi (`Inngest.js:310-313`) ve Next'in standalone `.env` kopyası her işletim sisteminde aynı çalışır, Linux üretim imajı (`node:20-alpine`) da buna dahil. Linux ve Windows'ta koşulamadı (bu makinede yok). README'deki `grep`/`echo >>` satırı POSIX kabuk ister, Windows'ta Git Bash ya da WSL gerekir.
