# TASK-MUM6CYJFKW69I — Yerel Inngest kurulumu (devop-fb)

## 1. Ne yapıldı
- **Kök neden:** `inngest@4.18.1` varsayılan olarak bulut kipinde çalışır. `INNGEST_DEV` yokken ve
  `INNGEST_SIGNING_KEY` boşken SDK imza anahtarı ister (`helpers/env.js`: "In cloud mode but no signing
  key found. For local dev, set the INNGEST_DEV=1 env var"). Bu yüzden `/api/inngest` her istekte 500
  döner ve yerelde hiçbir cron koşmaz.
- `.env.example`: `INNGEST_DEV=1` eklendi. Yanına ne işe yaradığı, yokken ne olduğu ve canlıda
  kaldırılması gerektiği yazıldı. Yerel `.env`'de olan ama örnekte eksik `INNGEST_EVENT_KEY=` da eklendi.
  Sır yazılmadı; anahtarlar boş kaldı.
- `README.md`: "Yerel Inngest (cron'lar ve elle tetikleme)" bölümü eklendi. İçeriği: eski `.env`'ler için
  tek satırlık düzeltme, curl ile 200 kontrolü, dev sunucusu komutu
  (`npx --yes inngest-cli@latest dev -u http://localhost:3000/api/inngest`), portlar (:8288 arayüz/API,
  :8289 bağlantı), Invoke ve Send test event farkı, canlı/staging notu.
- Kod değişmedi.

## 2. Kanıt
**Önce (paylaşılan :3000, `.env`'de INNGEST_DEV yok):**
```
$ curl -s -w '%{http_code}' http://localhost:3000/api/inngest
{"code":"internal_server_error"}500
```
**Sonra (temiz klon, `git clone --branch dev` @03377c94 + bu iki dosya, README adımları:
`cp .env.example .env` + AUTH_SECRET perl satırı + `docker compose config -q` → compose-ok,
`pnpm install`, `pnpm db:generate`, `next dev -p 3100`; DB URL'leri ayaktaki fabrika yığınından):**
```
$ curl -s -w '\nHTTP %{http_code}\n' localhost:3100/api/inngest     # Inngest dev sunucusu henüz kapalı
{"extra":{"native_crypto":true},"has_event_key":false,"has_signing_key":false,"function_count":10,"mode":"dev","schema_version":"2024-05-24"}
HTTP 200
```
**Inngest dev sunucusu** (`inngest-cli` v1.45.1): :8288 ve :8289 dinliyor (lsof). 10 fonksiyonun hepsi
senkronlandı (`fabrika-app-agency-monthly-report` … `fabrika-app-users-scheduled-deletion`).
Next logunda `PUT /api/inngest 200` görünüyor.

**Arayüzden tetikleme** (AgentSpace tarayıcısı, gerçek tıklama): Functions → agency-monthly-report →
Invoke → "Invoke Function" → "Function invoked" bildirimi. Runs sekmesinde **Completed** göründü.
- Koşu kimliği **`01M3NWPZVQ6B2GFCQ75PPW0D02`**, olay `inngest/function.invoked`, çıktı:
  `{"agencies":7,"failed":0,"generated":7,"period":"2026-08","skipped":0,"success":true}`
- Olay yolu (`agency/report.generate`, `{"period":"2026-08"}`) koşu **`01M3NWRPFSGQZQRCPVBAEN7VZ9`**:
  `{"agencies":7,"failed":0,"generated":0,"period":"2026-08","skipped":7,"success":true}`. İdempotent,
  ikinci koşu hiçbir şey eklemedi.
- Next logu: `POST /api/inngest?fnId=fabrika-app-agency-monthly-report&stepId=step 206`.

## 3. Değişen dosyalar
- `.env.example`
- `README.md`
- `docs/agent-results/TASK-MUM6CYJFKW69I-devop-fb.md`

## 4. Riskler
- **Paylaşılan :3000 hâlâ 500 veriyor.** Ortak `.env`'e ve çalışan sunucuya dokunmadım (sahibi
  leed-fb, README "Paylaşılan dev sunucusu"). Düzeltmek için `.env`'e `INNGEST_DEV=1` eklenip sunucu
  yeniden başlatılmalı. Bu, sunucunun sahibinin kararı.
- **Doğrulama koşusu paylaşılan yerel DB'ye yazdı.** 2026-08 dönemi için 7 ajans raporu oluştu. Veri
  yerel geliştirme verisi ve koşu idempotent (tekrarında `skipped`). Geri almak gerekirse o dönemin
  rapor satırları silinmeli.
- **Canlıya `INNGEST_DEV=1` sızarsa** SDK dev kipine geçer ve imzasız istekleri kabul eder. Bunu
  `.env.example` ve README'de yazılı olarak uyardım. Kodda koruma yok; bir boot kontrolü
  (`NODE_ENV=production` iken `INNGEST_DEV` reddedilsin, `DEMO_LOGIN_ENABLED` gibi) ayrı kart olarak
  önerilir.
- `src/lib/inngest/client.ts` `apiKey: env.INNGEST_API_KEY` geçiyor. Bu, v4 istemci seçeneği olarak
  görünmüyor (etkisiz olabilir). Kapsam dışı, not olarak bırakıldı.

## 5. Açık sorular
- Paylaşılan :3000 `.env`'ine `INNGEST_DEV=1` eklenip sunucu yeniden başlatılsın mı? (leed-fb/patron)
- Canlı için `INNGEST_DEV` boot koruması kartı açılsın mı?

## 6. Sonraki adım
- :3000 sahibi `.env`'e satırı ekleyip yeniden başlatır ve README'deki curl adımıyla 200'ü görür.

## Geri alma
`git revert <bu commit>`. Yalnız doküman ve örnek env değişti; çalışan hiçbir şey etkilenmez.

**Platform beyanı:** Yalnız macOS'ta (Darwin 27, arm64) doğrulandı. Değişiklik doküman ve env
örneğinden ibaret. `inngest-cli` npx ile Linux ve Windows ikilisi de indirir. README'deki
`grep`/`echo >>` satırı POSIX kabuk ister: Windows'ta Git Bash ya da WSL gerekir, orada satırı elle
ekle. Windows ve Linux koşulamadı (bu makinede yok).
