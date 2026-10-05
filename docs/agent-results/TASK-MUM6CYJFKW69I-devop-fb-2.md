# TASK-MUM6CYJFKW69I: yerel Inngest, düzeltme turu (devop-fb, 2. rapor)

Bu tur, İNCELEME-16'nın (TASK-MUMACL71C32U4, crw-fb) DÜZELTME GEREKLİ kararına yanıttır: B-1, K-2 ve K-3.

## 1. Ne yapıldı

**B-1 (bloke eden bulgu): üretim derlemesinde iki kilit.**
1. **İstemci kilidi.** `src/lib/inngest/client.ts` artık `isDev: INNGEST_BUILT_FOR_PRODUCTION ? false : undefined` alıyor. Sabit `src/lib/env.ts`'te `process.env.NODE_ENV === 'production'` olarak tanımlı. Next bu ifadeyi derleme anında literal'e çeviriyor (derlenmiş chunk'ta `"INNGEST_BUILT_FOR_PRODUCTION",0,!0`). Bu yüzden çalışma zamanında `NODE_ENV=test` vermek kilidi açmıyor. SDK kipi seçerken önce `isDev` seçeneğine bakıyor (`inngest/components/Inngest.js:310`). Sonuç: üretim derlemesi her zaman bulut kipinde çalışıyor ve imza doğruluyor. `next dev` ile testlerde `undefined` kalıyor, yani yerel akış değişmedi.
2. **Başlangıç reddi.** `src/lib/env.ts` şemasına `INNGEST_DEV` eklendi. Yanına `assertInngestDevModeAllowed()` geldi. Bu fonksiyon `src/instrumentation.ts`'ten, `assertDemoLoginAllowed` ile aynı kalıpta çağrılıyor. Üretim derlemesi (ya da `NODE_ENV=production`) `INNGEST_DEV` açıkken başlamıyor: açıklayıcı bir mesaj basıyor ve `exit 1` ile çıkıyor. "Açık" sayılan değerler `1`, `true` ve URL biçimindeki değerler (SDK bunları dev sunucu adresi olarak okuyor). "Kapalı" sayılanlar boş değer, `0`, `false` ve `undefined`. Neden şema `refine` yerine başlangıçta kontrol: `next build` sırasında `.env`'de `INNGEST_DEV=1` olsa bile derleme bozulmuyor (ölçüldü, rc=0). Yerel geliştirici derlemesi de CI da etkilenmiyor.

**K-2:** `.dockerignore` eklendi. İçerik: `.env*` (`!.env.example` hariç), `node_modules`, `.next`, `.venv`, `coverage`, `out`, `build`, `*.tsbuildinfo`, `test-artifacts`, `test-results`, `playwright-report`, `.git`, `.github`, ajan dizinleri (`.agentspace`, `.claude`, `.gemini`, `.qwen`, `.dev-objects`).

**K-3:** README'deki `echo 'INNGEST_DEV=1' >> .env` satırı `printf '\nINNGEST_DEV=1\n' >> .env` oldu. README ve `.env.example`'a iki not eklendi: üretim derlemesinin dev kipine girmediği, `.env`'in imaja girmediği, yerel `pnpm start` için `INNGEST_DEV=0`.

Regresyon testi: `tests/inngest-dev-mode.test.ts` (6 test).
- Assert için dört test: üretim derlemesi × her `NODE_ENV` reddediliyor; `NODE_ENV=production` reddediliyor; kapalı değerler kabul ediliyor; üretim dışında dev kipi serbest.
- SDK kip önceliği için iki test: `isDev:false` ile `INNGEST_DEV=1` birlikteyken `cloud`, `isDev:undefined` ile `INNGEST_DEV=1` birlikteyken `dev`. SDK yükseltmesi öncelik sırasını değiştirirse bu testler kırılır.

## 2. Kanıt

Tüm derlemeler izole bir worktree'de yapıldı (`scratchpad/wt`, HEAD `858c139a` + bu değişiklikler). O worktree'deki `.env`, yerel `.env` artı `INNGEST_DEV=1`. Bu, incelemedeki senaryonun aynısı. İmza anahtarı sahte (`signkey-test-…`).

**Derleme `.env`'de INNGEST_DEV=1 varken de geçiyor:**
```
$ pnpm build   → rc=0
$ grep '^INNGEST_DEV' .next/standalone/.env
INNGEST_DEV=1
```

**Kilit 2, başlangıç reddi (derleme A, tam düzeltme):**
```
--- NODE_ENV=production, .env INNGEST_DEV=1
exit=1
❌ INNGEST_DEV is on in a production server. Dev mode skips request signature checks on /api/inngest, so anyone could run the scheduled jobs. Remove INNGEST_DEV (or set it to 0) and set INNGEST_SIGNING_KEY. For a local `pnpm start`, run it as `INNGEST_DEV=0 pnpm start`.
--- NODE_ENV=test, .env INNGEST_DEV=1
exit=1
❌ INNGEST_DEV is on in a production server. …
```
Derlenmiş sabit: `e.s(["INNGEST_BUILT_FOR_PRODUCTION",0,!0,…])`. İstemci tarafı: `isDev:!n.INNGEST_BUILT_FOR_PRODUCTION&&void 0`, yani `false`.

**Kilit 1 tek başına, istemci (derleme B).** Başlangıç assert'i yalnız bu scratch derlemede yorum satırına alındı. Amaç, `INNGEST_DEV=1`'in SDK'ya ulaştığı durumu görmek:
```
=== build B, NODE_ENV=test, INNGEST_DEV=1 (.env), unsigned
GET  /api/inngest                                   {"message":"Unauthorized"}  HTTP 401
POST /api/inngest?fnId=fabrika-app-agency-monthly-report&stepId=step   {"message":"Unauthorized"}  HTTP 401
=== build B, NODE_ENV=production, INNGEST_DEV=1 (.env), unsigned
GET  {"message":"Unauthorized"}  HTTP 401
POST {"message":"Unauthorized"}  HTTP 401
```

**RED kontrolü (derleme C, HEAD'deki `client.ts`, `isDev` yok).** Aynı imzasız istek:
```
"mode":"dev"
GET HTTP 200
[{"id":"e8512f…","mode":"sync","op":"StepRun","name":"generate-agency-reports",…
POST HTTP 206
```
Düzeltme olmadan adım imzasız istekle koştu, düzeltmeyle 401 döndü.

**K-2, Docker build context'i.** Tek amaçlı bir `busybox` Dockerfile ile `COPY . /ctx` yapıldı, context worktree:
```
. .. .dockerignore .env.example .gitignore AGENTS.md CLAUDE.md Dockerfile … src tests … workers
env files:
.env.example
```
`.env` context'e girmiyor. `INNGEST_DEV=1` burada yalnız şablondan geliyor ve Next `.env.example`'ı yüklemiyor. Context boyutu 127 MB; `node_modules`, `.next` ve `.venv` dışarıda kaldı.

**K-3:**
```
$ printf 'A=true' > t.env; grep -q '^INNGEST_DEV=' t.env || printf '\nINNGEST_DEV=1\n' >> t.env; od -c t.env
A = t r u e \n I N N G E S T _ D E V = 1 \n
```

**Birim testi, tip ve lint kontrolü (güncel HEAD `488313b1` üzerinde):**
```
$ npx vitest run tests/inngest-dev-mode.test.ts tests/inngest.test.ts tests/inngest-jobs.test.ts src/lib/demo-login.test.ts
 Test Files  4 passed (4)
      Tests  20 passed (20)
$ npx tsc --noEmit -p tsconfig.json   → değişen dosyalarda hata yok
$ npx eslint src/lib/env.ts src/lib/inngest/client.ts src/instrumentation.ts tests/inngest-dev-mode.test.ts  → temiz
```

## 3. Değişen dosyalar
- `src/lib/inngest/client.ts`: `isDev` kilidi
- `src/lib/env.ts`: `INNGEST_DEV` şema alanı, `INNGEST_BUILT_FOR_PRODUCTION`, `assertInngestDevModeAllowed`, `InngestDevModeInProductionError`
- `src/instrumentation.ts`: assert çağrısı
- `tests/inngest-dev-mode.test.ts` (yeni)
- `.dockerignore` (yeni)
- `.env.example`, `README.md`: notlar ve K-3

## 4. Riskler
- **Dockerfile'daki imaj zaten derlenmiyordu. Bu değişiklikten bağımsız, önceden var olan bir sorun.** `docker build .` deps aşamasında (`RUN pnpm install --frozen-lockfile`) düşüyor: `Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite`. Sebep, `node:20-alpine` ile `packageManager: pnpm@11.25.0`'ın uyumsuz olması (pnpm 11 Node 22+ istiyor). Bu aşama yalnız `package.json` ile `pnpm-lock.yaml`'ı kopyalıyor, `.dockerignore`'dan etkilenmiyor. Bu yüzden tam imaj üzerinde uçtan uca test yapılamadı; K-2'yi build context'ini inceleyerek doğruladım. İmaj düzelince ikinci bir etki olacak: eskiden `COPY . .` host'taki `node_modules`'u (macOS ikilileri) deps aşamasının üstüne yazıyordu, artık yazmayacak. Bu doğru olan davranış, ama builder aşamasında `prisma generate` gerekip gerekmediği imaj ilk kez derlenince görülecek. Ayrı bir kart öneriyorum: base imajı `node:22-alpine` yapmak ve derlemeyi `prisma generate` ile uçtan uca koşmak.
- Yerelde `pnpm build && pnpm start` artık `.env`'de `INNGEST_DEV=1` varken başlamıyor. Bu bilinçli bir tercih: mesaj ve README çözümü gösteriyor (`INNGEST_DEV=0 pnpm start`). CI'da (`ci.yml`, `a11y-check.yml`) `INNGEST_DEV` tanımlı değil, etkisi yok. Playwright'ın `E2E_WEB_SERVER=start` kipi yerelde `.env`'den `INNGEST_DEV=1` okursa aynı şekilde durur; o durumda da `INNGEST_DEV=0` verilmesi gerekiyor.
- Geri alma: tek commit, `git revert <sha>`. Veri ya da şema değişikliği yok.

## 5. Açık sorular
- Dockerfile'ın Node sürümü (yukarıdaki risk) için ayrı kart açılsın mı? Önerim evet, devop-fb'ye.

## 6. Sonraki adım
- crw-fb yeniden incelesin. Adımlar yukarıdaki komutlarla tekrarlanabilir. Derleme B için `src/instrumentation.ts`'teki `assertInngestDevModeAllowed();` satırı yalnız scratch kopyada yorum satırına alınmalı.
- Push yapılmadı. Push 1 Ekim'de.

**Platform beyanı:** Yalnız macOS'ta (Darwin 27, arm64; Docker Desktop 29.7.2) koşuldu. Kilitler platformdan bağımsız: `process.env.NODE_ENV` derleme anında literal oluyor, SDK kip seçimi ve Next instrumentation her işletim sisteminde aynı çalışıyor. Linux üretim imajı (`node:20-alpine`) buna dahil, ama o imaj yukarıdaki pnpm/Node sorunu yüzünden derlenmiyor. Linux ve Windows'ta koşulamadı (bu makinede yok). README'deki `grep`/`printf >>` satırı POSIX kabuk istiyor; Windows'ta Git Bash ya da WSL gerekir.
