# Kalite kapısı (`pnpm gate`) — yeni bir makinede yeşil koşturma tarifi

Kapı = `gate:core` (`package.json`): `db:generate → lint → typecheck → test → i18n:check → rls:check → rls:bypass-check → rls:verify --require-db → db:rls-role → test:e2e → alerts:check`. `pnpm gate` bunu makine çapındaki kilitle (`scripts/gate-lock.mjs`, aynı anda tek gate) koşar. `githooks/pre-push` da aynısını koşar (`pnpm hooks:install`).

## Sonuç önbelleği, sıra ve belge-yalnız yol (FO-339)

Aynı kodu üç kez tam koşmamak için (yazar gate'i, pre-push kancası, inceleyici) `pnpm gate` üç kademeli karar verir (`scripts/gate-lock.mjs` + `scripts/gate-cache.mjs`):

1. **Önbellek hit:** `git rev-parse HEAD^{tree}` + `pnpm-lock.yaml` hash'i için `~/.cache/fonbridge-gate-pass/<tree>` kaydı varsa `önbellek: <tree> <tarih>` basılır ve tam gate atlanır. Kayıt yalnız `gate:core` exit 0 iken, çalışma ağacı baştan sona temizken (`git status` boş, untracked dahil) ve koşu boyunca tree değişmediyse yazılır. Kırmızı koşu yazmaz. **Kirli ağaçta kayıt ne yazılır ne okunur** (FO-348 K3): yerel kirli kod yeşil sayılmaz. Kilit alındıktan sonra kayıt yeniden okunur (FO-348 K4): kuyrukta beklerken aynı tree için yeşil kayıt yazıldıysa ikinci kez koşmadan çıkılır. Tree ve lock hash'i kilit alındıktan sonra alınır (FO-348 K6).
2. **Belge-yalnız kısa yol (allowlist, FO-348 K2):** `origin/dev...HEAD` farkının **her** dosyası `docs/**/*.md` ise tam gate yerine `lint` + `i18n:check` koşar. Tek bir dosya bile bu dışındaysa tam gate koşar. Dışarıda kalanlar:
   - kök dosyalar (`README.md` dahil), `.github/**`, `content/**`, `messages/**`, `src/**`, `tests/**`, `prisma/**`, `scripts/**`, `githooks/**`, `config/**`;
   - `docs/` altındaki `.md` olmayan her dosya (`.csv`, `.txt`, `.json`, görseller…) ve büyük harfli `.MD`;
   - istisna listesi (`FULL_GATE_DOCS` in `scripts/gate-cache.mjs`, büyük/küçük harf duyarsız): `docs/BILLING.md` (`src/lib/billing/catalog.test.ts` okur), `docs/legal/**` (`compliance/dpa` sayfası render eder), `docs/BETA_DATA/**` (`scripts/beta-pricing-survey.ts` girdisi okur).

   Fark `--no-renames` ile alınır: `git mv src/x.ts docs/x.ts` kaynak yolu da farkta gösterir ve tam gate tetikler (FO-348 K1). Kirli ağaç ya da boş fark tam gate'e düşer. Kısa yol kayda yazılmaz; tam gate yerine geçmez.
3. **Tam gate:** diğer her durum. `gate:core` adımları değişmedi.

Yeni bir belge bir istisnaya ihtiyaç duyarsa (ör. bir test ya da sayfa onu okuyorsa) `FULL_GATE_DOCS`'a yorumuyla ekle ve `tests/gate-cache.test.ts` içindeki istisna vakasına bak.

Kilit sırası: bekleyenler `~/.cache/fonbridge-gate.lock.queue/` altında bilet bırakır; kilidi yalnız en eski canlı bilet alır. Bekleme satırı sıra no'sunu, önündeki iş sayısını ve tahmini başlama saatini basar (tahmin: `~/.cache/fonbridge-gate.lock.history.jsonl` medyanı; geçmiş yoksa 30 dk). Eski sürümle kilidi alan bir bekleyen bilet bırakmadığı için araya girebilir; kilit dizininin biçimi (`owner.json`) değişmedi.

Bilinen kalan risk (FO-348 K6): kayıt yazımı yalnız koşu sonunda tree'yi karşılaştırır; koşu sırasında bir dosya değiştirilip geri alınırsa bu yakalanmaz. Tam kapama için koşunun tree'sinin ayrı bir worktree'de koşması gerekir (yapılmadı).

Önbelleği bilerek atlamak: `FONBRIDGE_GATE_NO_CACHE=1 pnpm gate`. Aynı değişken `pnpm gate:isolated` (argümansız) için de geçerlidir: önbellek ve belge-yalnız kısa yolu kapanır, izole DB'li tam gate koşar. Önbelleği temizlemek: `~/.cache/fonbridge-gate-pass/` dizinini silmek güvenlidir.

`pnpm gate:isolated` (argümansız) aynı kararı önce verir; önbellek ya da belge-yalnız ise konteyner kurmadan doğrudan `pnpm gate`'e geçer.

## Kısa yol: `pnpm gate:isolated` (önerilen)

```bash
pnpm install --frozen-lockfile
pnpm storage:up                 # MinIO :9000 (yoksa); mailpit :1025/:8025 docker-compose'tan
pnpm gate:isolated
# push: kancanın gate'i de aynı izole ortamda koşar (--no-verify yok)
pnpm gate:isolated git push -u origin <dal>
```

`scripts/gate-isolated.sh` şunları yapar, sonra **değiştirilmemiş** `pnpm gate`'i koşar:

1. Boş bir port üzerinde yeni `pgvector/pgvector:pg16` konteyneri (CI'ın imajı), DB adı `fabrika_gate` — `fabrika` değil: `tests/expert-prereg-retention.live.test.ts` o adda kendini atlar. Paylaşılan `:5433` veritabanına ve oradaki `fabrika_app` parolasına dokunmaz.
2. `pnpm db:setup` (CI'ın kullandığı yol: ensure_rls → db push → db:rls-role → db:rls → migrations → db:rls → seed).
3. `pnpm storage:setup` ile `test-evidence` + `test-public` (anonim okuma) bucket'ları.
4. CI'ın test değerleri: `DATABASE_URL`, `DATABASE_URL_RLS_TEST` (`fabrika_app_ci`), `AUTH_SECRET` + `KEEP_EU_LIVE=1` (vitest), `R2_*` → MinIO (e2e); `E2E_PORT` (3400'den başlar; kilit alındıktan sonra `gate-lock.mjs` seçer, FO-388).
5. Çıkışta konteyneri siler (`GATE_KEEP=1` tutar) ve `next dev`'in yeniden biçimlendirdiği `tsconfig.json`'ı, başta temizse geri alır.

Buradaki değerler `./.env`'den önce gelir (vitest ve playwright süreç ortamını öncelikli okur); checkout'un kendi `.env`'i karışmaz. Tüm kimlik bilgileri atılabilir yerel değerlerdir (ci.yml'deki ile aynı); sır değildir.

## Elle koşarken düşülen 6 tuzak — FO-161

`.env`'li elle tarif (worktree başına kalıcı izole DB): `CLAUDE.md` "Worktree'de gate".

`pnpm gate`'i doğrudan, paylaşılan `fabrika-postgres :5433` üzerinde koşacaksan:

| # | Belirti | Sebep | Çözüm |
|---|---------|-------|-------|
| 1 | `28P01 password authentication failed for user "fabrika_app"`, ~31 canlı test kırmızı | `fabrika_app` küme genelinde tek; parolası başka bir checkout'un `.env`'indeki `DATABASE_URL_RLS_TEST` ile kurulmuş | O checkout'un `DATABASE_URL_RLS_TEST`'ini kopyala; ya da `pnpm db:rls-role:rollback` + `pnpm db:rls-role` (diğer checkout'ları kırar — ya da izole yol) |
| 2 | `rls:verify --require-db` → `ExpertFounderCounter` permission denied | `DATABASE_URL_RLS_TEST` tanımsız / rol `db:rls`'ten sonra kuruldu | `pnpm db:rls-role && pnpm db:rls`, `DATABASE_URL_RLS_TEST` export |
| 3 | e2e `admin-blog-image-upload` kırmızı / atlandı | MinIO'da `test-public` yok, `R2_*` boş | `R2_BUCKET=test-evidence R2_PUBLIC_BUCKET=test-public pnpm storage:setup` + ci.yml E2E adımındaki `R2_*` |
| 4 | Davet/posta testleri 500 ya da SMTP hatası | `.env.example`'daki boş anahtarlar rastgele doldurulmuş | SMTP'yi `playwright.config.ts`'e bırak (mailpit :1025); vitest SMTP'siz koşmalı |
| 5 | e2e `EADDRINUSE :3000` | Başka bir `next dev` 3000'de | `E2E_PORT=<boş port>` |
| 6 | Sonraki koşuda `server-action-rbac-guard` B-1 kırmızı | e2e'nin `next dev`'i `tsconfig.json`'ı yeniden yazdı | `git checkout -- tsconfig.json` |
| 7 | e2e'nin çoğu (FO-254 koşusunda 342 test) 0 ms'de kırmızı, `browserType.launch: Executable doesn't exist ... chrome-headless-shell` | Playwright chromium binary'si `~/Library/Caches/ms-playwright` altında yok (yeni makine ya da Playwright sürümü değişti); birim testler yeşil kalır | `pnpm exec playwright install chromium`, sonra koşuyu yeniden başlat |
| 8 | `rls:verify --require-db` → `<Tablo>: politika kümesi {…}, beklenen tam {system_scope} — fazla: <ad> (<komut>)` | Bir `system_scope` tablosunda (`PublicLead`, `ExpertPreRegistration` …) elle ya da başka bir araçla eklenmiş ikinci bir politika var; permissive olduğu için `system_scope`'u deler (NG-183) | `pnpm db:rls` (NG-183 bloğu yabancı politikayı düşürür); bilerek eklendiyse ADR-0009 §8.e bak. İstisna yok (NG-188): NG-52'nin `ExpertPreRegistration` · `expert_directory (SELECT)` politikası `ExpertDirectoryEntry` görünümüyle değişti; geri gelirse bu satır onu da gösterir → `pnpm db:rls` |

Uzun koşular (`pnpm gate` ~10 dk; kilit bekleyen koşu daha uzun sürer) foreground Bash'te 600 sn sınırına takılabilir: `run_in_background` ile koş, logu dosyaya yaz (`… > log 2>&1; echo GATE_EXIT=$? >> log`).

Ek: `CI=true` verirsen `keep-eu-sync.live` `KEEP_EU_LIVE` tanımsızsa "CI'da atlanamaz" diye düşer; ya ikisini birlikte ver (CI gibi) ya da hiçbirini.

## CI karşılığı

`.github/workflows/ci.yml` aynı kontrolleri ayrı adımlarda koşar: `pnpm db:setup` (iki kez, idempotans), `rls:verify --require-db` (DB'siz exit 1), `rls:bypass-check`, `alerts:check`, lint, typecheck, vitest + canlı-atlama kapısı (`scripts/check-live-skips.ts`), e2e. YAML doğrulaması: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -no-color`.

## Platform

Betikler bash (macOS 3.2 ve Linux bash ile uyumlu; `/dev/tcp` port yoklaması bash yerleşiği). Docker ve pnpm gerekir. Windows'ta yalnız WSL/Git Bash içinde çalışır; denenmedi.

## e2e sunucusu koşu ortasında kapanırsa (FO-385)

Belirti: testler bir noktadan sonra `ERR_CONNECTION_REFUSED` veya `ERR_EMPTY_RESPONSE` ile düşer. Önce kodu değil, logun sonundaki `[e2e-server-diag]` satırlarını oku. `pnpm gate:isolated` bu satırları çıkışta bir kez daha basar. Düz `pnpm test:e2e`te yalnız `[WebServer]` önekiyle koşu sırasında görünürler.

| Olay | Anlamı | Bakılacak yer |
|---|---|---|
| `signal-received` + `server-exit` | Sunucu dışarıdan sinyal aldı. `next dev` `SIGTERM`te 0 ile çıkar, yani `code:0` temiz bitiş demek değildir; kanıt `signal-received` satırıdır. | Aşağıdaki gönderen araması |
| Yalnız `server-exit` (`signal-received` yok) | Sinyal yakalanamadı (`SIGKILL`: `code` boş, `signal` dolu) ya da sunucu kendi düştü (`code` sıfırdan farklı). | `freeMemMb`, `load`, logdaki son `[WebServer]` hatası |
| `server-port-closed` | Süreç duruyor, port 30 saniyedir kapalı. | `processes` listesi |
| `wall-clock-jump` | Süreç `gapSec` saniye çalışamadı: makine uyudu veya donduruldu. `lastSleep` macOS'ta uykunun nedenini yazar (`Clamshell Sleep` = kapak kapandı). Bu aralıkta `net::ERR_NETWORK_IO_SUSPENDED` ve `ENOTFOUND` beklenir; kod hatası değildir. | `pmset -g log` |
| `runner-gone` | Runner sunucuyu kapatmadan bitti; denetleyici yetim sunucu bırakmamak için sunucuyu kapattı. | Runner için `signal-received` |

Sunucu hazır olduktan sonra ölürse denetleyici (`tests/e2e/support/server-supervisor.mjs`) runner'a `SIGINT` yollar. Koşu kırmızı biter, kalan testler dakikalarca boşa düşmez. Yeniden başlatma ve yeniden deneme yoktur.

**Gönderen araması.** macOS ve Node sinyali kimin yolladığını söylemez. O yüzden gönderen, zaman eşleşmesiyle bulunur: `~/.claude/projects/*/*.jsonl` içinde olayın zamanından hemen önceki `pkill`, `killall`, `kill` komutlarına bak. FO-385'te incelenen dört sonlanmanın zamanı ve süreç listesi, başka projedeki bir oturumun makine geneli `pkill -f` komutlarıyla zaman olarak uyuşuyor. Bu bir eşleşmedir, kanıt değildir: gönderen kaydı yok, yani `pkill` komutunun sunucuya gittiği gösterilmedi. Teşhisin canlı yakaladığı olaylarda paralel koşan sunucular aynı anda `SIGTERM` aldı; bu da zaman uyumudur, gönderen kanıtı değildir.

**Kural.** Bu makinede `pkill -f` ile `next dev`, `next-server` veya `@playwright/test` hedefleme: desen, başka ajanın sunucusuna da uyar. Kendi sürecini `kill <pid>` ile durdur.

`uncaughtException: Error: aborted` (`ECONNRESET`) satırları ölüm nedeni değildir: yeşil koşularda da onlarca kez görünür ve sunucu ayakta kalır.

Bilinen açık (e2e portu, FO-388 ile düzeltildi): Eskiden `gate-isolated` e2e portunu kilitten önce, "ilk boş" diye seçiyordu. Kuyrukta bekleyen koşu sırası gelene kadar bu portun başkası tarafından alındığını göremiyordu (FO-386: 27 dk bekledikten sonra `http://localhost:3400 is already used`). Şimdi e2e portu `scripts/gate-lock.mjs` kilidi alındıktan sonra, birim ve i18n adımlarından önce, 3400'den ilk boş port olarak seçilir ve koşunun ortamına (`E2E_PORT`) yazılır. Elle verilen `E2E_PORT` değiştirilmez: kilit alındığında doluysa koşu hemen `E2E_PORT <p> dolu` hatasıyla düşer, komut çalışmaz. Kanıt: `tests/gate-lock.test.ts` (kuyrukta bekleyen koşu, taban port dolu olduğunda başka port seçer; düzeltme öncesi bu test kırmızıydı).

Konteyner portu (`GATE_PG_PORT`) aynı sınıf hatadan etkilenmez: konteyner `docker run -d` ile portu hemen bağlar ve kilit beklerken de tutar; ön kontrol bu portu dolu görür (bash ile ölçüldü, FO-388). İki başlatma aynı boş portu aynı anda seçerse ikincisi `Bind for 127.0.0.1:<port> failed: port is already allocated` ile çıkış 125 verir; bu açık bir hatadır, sessiz değildir. Yeniden denemeye gerek yok, yeniden çalıştır.

Port yoklaması (FO-388, üçüncü inceleme): bir port boş sayılması için dört adreste de boş olmalı: `127.0.0.1`, `0.0.0.0`, `::1`, `::`. macOS'ta ölçüldü (Node): her dinleyici türü yalnız kendi adresinde görünür; tek adres yoklaması wildcard ve loopback dinleyicilerini kaçırır. `next dev --port` (Next 16.4.3) `::` dinler; yalnız `127.0.0.1` yoklayan eski sürüm bunu boş sayıp koşuyu `already used` ile kırmızı bitiriyordu. Yalnız `EADDRINUSE` meşgul demektir; IPv6 yoksa ilgili adres atlanır. Vaka başına testler: `tests/gate-lock.test.ts`.

Betiğin kendi ön seçimi (kilidi almayan `gate-isolated.sh <komut>` yolu, ör. `git push`): betik portu `E2E_PORT`'a yazar ve aynı değeri `FONBRIDGE_E2E_PORT_PREPICK` ile işaretler. `gate-lock.mjs` AUTO modunda bu işaretli değeri sessizce yok sayar ve kilitten sonra yeniden seçer. İşaretsiz bir `E2E_PORT` elle verilmiştir: yok sayılır ve stderr'de `⚠ E2E_PORT=<p> elle verilmiş ama FONBRIDGE_E2E_PORT_AUTO=1; yok sayıldı` uyarısı çıkar. Hata vermez, push'u kırmaz. Karar testleri: `tests/gate-isolated-e2e-port.test.ts` (`GATE_ISOLATED_DRY_RUN=1` karar satırını basar).

Bayat kilit temizliği (`clearIfStale`): sahip okunup kilit taşınana kadar başka bir süreç kilidi alabilir. Bu yüzden önce taşınır, sonra taşınanın sahibine bakılır; hâlâ aynı ölü sahipse silinir, değilse geri adlandırılır. Okuma-taşıma arası yarış test edilemez (araya girmek için üretim koduna kanca gerekir); test yalnız normal yolu doğrular.

Hâlâ geçerli: kilidi almayan bir komutu `gate-isolated.sh <komut>` ile verirsen (ör. `pnpm gate:isolated pnpm test:e2e`), e2e portu bu yolda kilitten önce seçilir. Paralel koşuda orada `E2E_PORT` ver.

## Founder-number kırmızısı (FO-380)

`tests/expert-prereg.live.test.ts` "founder number race" testinin FO-250 döneminde (2026-10-30) görülen kırmızısı yeniden üretilemedi. Ölçüm: tam gate, 36 `yes` yükü altında (load1 ~23 → ~84), izole DB'de yeşil (6357 birim, 489 e2e); founder testi üç ayrı izole koşumda geçti. Ham çıktı ve yük kaydı: `docs/agent-results/TASK-MW2MMHM0Q18US-devop-fb.md`.

Eşzamanlılık garantisi kodda: atama `pg_advisory_xact_lock` altında (`src/lib/expert-prereg/server/verify.ts`), sayaç yalnız yükselir (`founder-counter.ts`), `founderNumber` `@unique` ve tek satırlık sayaç `CHECK (id = 1)`.

Kırmızı yeniden görülürse:
1. Gate logunu sakla (`gate-isolated` çıktısının tamamı; `GATE_KEEP=1` ile konteyneri de tut). Yük kaydı (`uptime`) ve koşunun `E2E_PORT` / `GATE_PG_PORT` değerleri logda kalsın.
2. Hatanın tam süitte mi, tek dosyada mı olduğuna bak. Tek dosyada geçiyorsa yarış değil, koşu sırası (`expert-prereg-reissue.live.test.ts` aynı tabloyu kullanır; `tests/helpers/expert-prereg-live-lock` ile seri tutulur) ya da zaman aşımıdır. `DB_CONNECT_TIMEOUT_MS=10000` gate-isolated'ta ayarlıdır.
3. Hata numara çakışması ya da boşluk gösteriyorsa gerçek eşzamanlılık hatasıdır: `verify.ts` kilidini ve unique kısıtı kontrol et, testi gevşetme. Sayaç ile `max(founderNumber)` farkı, kilit dışından yazım olduğunu gösterir.
4. Kırmızı yalnız bağlantı zaman aşımıysa (`DB_CONNECT_TIMEOUT_MS`) ve koşu paylaşımlı `:5433` DB'ye karşıysa, koşu izole değildi: `pnpm gate:isolated` ile yeniden koş.
5. Üç koşu da yeşilse kırmızıyı kaydet ve kartı kapatma; ham log olmadan kök neden yazma.


## ExpertDirectoryEntry mutasyon testleri ve eski `rls.sql` (NG-206)

`tests/rls-verify-system-scope-policy-set.live.test.ts` içindeki iki NG-188 mutasyon testi (görünümü bozulmuş haliyle commit edip `finally`'de geri yükler) `fabrika` adlı paylaşılan geliştirme veritabanında **atlanır**; atlama `WARNING ... skipped` satırıyla nedenini yazar. Yalnız izole bir veritabanında (ör. `pnpm gate:isolated` ya da kendi Docker Postgres'in) ya da GitHub Actions'ta koşar. İzole veritabanında koşmak için `RLS_MUTATION_DB` ortam değişkeni o veritabanının adına (`current_database()`) birebir eşit olmalıdır; `pnpm gate:isolated` bunu kendi açtığı veritabanı için (`fabrika_gate`) otomatik ayarlar. GitHub Actions dışında `fabrika` adı `RLS_MUTATION_DB` ile onaylanmaz (NG-206 D-B1); GitHub Actions'ta (`ci.yml` servis konteyneri `fabrika`) testler bu adda koşar. Süreç kesilirse görünüm mutasyonlu kalabildiği için bu ayrım bilerek yapıldı (NG-203 D-B1).

D-B2 uyarısı (NG-206): NG-188 (`e511961d`) zaten `origin/dev`'de. NG-52'nin `expert_directory` politikasını taşıyan eski `prisma/rls.sql` ile (NG-188 öncesi bir dal ya da worktree) `pnpm db:rls` ya da `pnpm db:setup` koşulursa, görünümün uygulandığı bir veritabanında politika geri gelir ve sealed `expert-directory` kapsamı `fullName`, `email`, ORCID'i yeniden okuyabilir (NG-185 F-1). Bu bir hatadır: politikanın geri gelmesi ancak NG-188'i bilerek geri alırken (eski `rls.sql` ile birlikte) kabul edilebilir. Eski tabanlı worktree'ler paylaşılan veritabanına `db:rls` koşmamalı. Paylaşılan veritabanı güncel `prisma/rls.sql` ile en az bir kez `pnpm db:rls` görmediyse bir kez koşulmalı (NG-183 bloğu yabancı `expert_directory` politikasını düşürür).

`E2E_SHOTS_ROOT=docs/agent-results` e2e kanıtını (ör. `lead-transfer-consent` → `NG-179-evidence/`) bilerek git'te izlenen klasöre yazar; varsayılan koşu yalnız git-ignored `test-artifacts/` altına yazar (NG-217).

## CI e2e: bellek eşiği ve kırmızı artefaktı (NG-288)

Belirti: E2E sırasında `[WebServer] ⚠ Server is approaching the used memory threshold, restarting...`, ardından `ERR_CONNECTION_RESET` ve soğuk derleme zaman aşımları (koşu 44821853657, attempt 1: 12 test düştü). Neden: `next dev` (Next 16.4.5) kendini yeniden başlatır; kontrol `node_modules/next/dist/server/lib/utils.js` `getMemoryRestartStats` — kullanılan heap, heap sınırının %80'ini geçerse. Sınır V8 varsayılanıdır (runner'da ~4 GiB). Kapatma anahtarı `experimental.devMemoryThresholdRestart` (varsayılan `true`) paylaşılan `next.config` içinde; yerel kapı bunu değiştirmez.

CI'da çözüm: e2e adımı `NODE_OPTIONS=--max-old-space-size=6144` ile koşar (`playwright.config.ts` bunu web sunucusuna `WEB_SERVER_NODE_OPTIONS` üzerinden geçirir). Yerel `pnpm gate` ve `pnpm gate:isolated` bu değişkeni kendi koymaz; davranışları aynıdır. Bu bir tampondur, sızıntı düzeltmesi değildir.

Ölçüm: e2e adımı her 60 saniyede web sunucusunun RSS toplamını `[e2e-mem]` önekiyle job logunda basar, ayrıca runner'ın varsayılan heap sınırını. Okuma: `gh run view <id> --log | grep '\[e2e-mem\]'`. RSS sürekli artıyorsa sızıntı şüphesi; düz kalıyorsa eşik yalnız birikmiş derleme önbelleğindendir. `approaching the used memory threshold` satırı 0 olmalı.

Kırmızı artefakt: `Upload E2E traces and report` adımı (`if: failure()`) `test-results/` ve `playwright-report/` dizinlerini `e2e-results-<run_id>-<attempt>` adıyla yükler, 14 gün saklar. Kanıt: kırmızı koşu 44824635892 bu artefaktı taşıyor (8.6 MB; trace'ler `playwright-report/trace` içinde). Artefakt indirmek: `gh run download <run_id> -R yaslan/nexagrant -n e2e-results-<run_id>-<attempt>`.
