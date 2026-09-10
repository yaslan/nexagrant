# Memory Index

- [fabrika-g0-evidence-placeholder-laundering](fabrika-g0-evidence-placeholder-laundering.md) — Kanıt kaydını non-null bir sütuna yazarken koyduğun dolgu değeri, bir sonraki koşuda "ölçülmüş veri" diye geri okunur — bayrakla işaretle, hem create hem update dalında koru

- [ui-guard-behind-hidden-control-is-dead-code](ui-guard-behind-hidden-control-is-dead-code.md) — Koşullu render edilen bir kontrolün kendi hata guard'ı ölü koddur — hata mesajının biçimini düzeltmek yetmez, kontrolü görünür kılıp sebebi söyletmeden düzeltme DOĞRULANAMAZ

- [focus-restore-must-wait-for-enabled](focus-restore-must-wait-for-enabled.md) — Kapanan bir hata bandının odağını geri verirken tıklama anında focus() çağırmak işe yaramaz — hedef düğme o anda disabled olur; odak, düğme yeniden etkinleştikten sonra bir efektle verilmeli

- [fabrika-default-0-columns-hide-absence](fabrika-default-0-columns-hide-absence.md) — Fabrika'da `Float @default(0)` sütunlar yokluğu ölçülmüş sıfır gibi gösteriyor — ayrımı okuma katmanında `MetricValue`/`null` ile taşı, UI'da değil
- [fabrika-e2e-fixture-pattern](fabrika-e2e-fixture-pattern.md) — Fabrika'da gerçek-tıklama kanıtı üretmenin çalışan yolu — scripts/seed-m6-e2e.ts kalıbıyla kendi idempotent fixture'ını yaz, ortak seed'i onarmaya çalışma

- [fabrika-dashboard-outcome-has-no-live-ui-surface](fabrika-dashboard-outcome-has-no-live-ui-surface.md) — Pano kartlarının hiçbiri Proposal.outcome okumuyor — "Eşik Üstü Oranı" anahtarı var ama render edilmiyor; iki CSV uç noktasından biri yetim (ölçüldü 2026-09-07)

- [e11-3-calibration-status](e11-3-calibration-status.md) — E11.3 ESR Calibration mevcut durumu (fixture yeniden üretildi, doğruluk ölçümleri tamamlandı, ortak anketi yanıtları bekleniyor)

- [fabrika-i18n-locales-dead-pattern](fabrika-i18n-locales-dead-pattern.md) — src/locales/{locale}/{namespace}.json pattern is dead code — next-intl reads only messages/{locale}.json; spot & delete these files if you see them

- [fabrika-module-gated-e2e-needs-own-tenant](fabrika-module-gated-e2e-needs-own-tenant.md) — Modül kapılı ekranın e2e'si demo-tenant'ı ödünç alamaz — M9 gibi modüller hem plana hem ModuleState'e bağlı ve demo-tenant'ın planı koşum sırasında değişiyor; kendi kiracını kur

- [fabrika-e2e-red-check-module-lock-first](fabrika-e2e-red-check-module-lock-first.md) — "element not found" ile düşen Fabrika e2e'sinde ÖNCE error-context.md'deki main bloğuna bak — modül kilidi ekranıysa kusur test edilen özellikte değil, fikstürün planı/ModuleState'i eksik
- [fabrika-second-dev-server-port-isolation](fabrika-second-dev-server-port-isolation.md) — Başka worker 3000'i tutuyorsa ikinci dev sunucusu aynı dizinde açılmaz — repo'nun rsync kopyası + cp -Rc ile klonlanmış node_modules tek çalışan yol (symlink Turbopack'te reddediliyor)

- [fabrika-grep-hits-can-be-all-comments](fabrika-grep-hits-can-be-all-comments.md) — Fabrika'da "uydurma isim" kartlarında grep sıfır dönmez — kaldırılan isimler açıklama yorumlarında yaşamaya devam eder; her isabeti kod/yorum diye sınıflandır ve hükmü ekrandan + gerçek dışa aktarım dosyasından ver
- [fabrika-phantom-dep-hides-in-shared-node-modules](fabrika-phantom-dep-hides-in-shared-node-modules.md) — Fabrika'da bir import yerelde çalışıp CI'da patlayabilir — paket node_modules'ta var ama package.json/pnpm-lock.yaml'da yok; ayrı worktree'de `pnpm install --frozen-lockfile` bunu anında ortaya çıkarır
- [fabrika-verification-script-gotchas](fabrika-verification-script-gotchas.md) — Fabrika'da elle doğrulama betiği yazarken dört tuzak — betiği worktree köküne koy, `@playwright/test`ten import et, dev sunucusunda networkidle bekleme, Prisma 7 için çıplak PrismaClient yerine pg ya da tsx

- [fabrika-verification-recipe-mutation-and-counterfactual](fabrika-verification-recipe-mutation-and-counterfactual.md) — Fabrika'da bir kapanmış kartı bağımsız doğrularken yeşil test kanıt DEĞİLDİR — kusuru kendin geri koy (mutasyon) ve bağımlılık için paketi node_modules'tan çıkar (karşı-olgusal build); ikisi de ucuz ve ikisi de kartı gerçekten sınar

- [fabrika-getbyrole-alert-hits-feedbackwidget](fabrika-getbyrole-alert-hits-feedbackwidget.md) — Fabrika e2e'sinde sayfa geneli getByRole('alert')/('status') kullanma — FeedbackWidget her uygulama sayfasında kendi role=alert düğümünü mount ediyor ve testin çalışan özelliği kırmızı gösteriyor
- [mutation-must-actually-narrow](mutation-must-actually-narrow.md) — Mutasyon testinde YEŞİL sonuç önce mutasyonu suçlar, testi değil — kusuru gerçekten sokup sokmadığını doğrula (fikstür satırının alanı zaten null'sa "lastRunAt: null" hiçbir şeyi daraltmaz)

- [fabrika-e2e-probe-rows-must-be-deleted-and-labelled](fabrika-e2e-probe-rows-must-be-deleted-and-labelled.md) — Fabrika'da canlı DB'ye karşı e2e kanıt üretirken sağlayıcıyı taklit ettiysen ürettiğin satırların rakamları ÖLÇÜM DEĞİLDİR — raporda bunu yaz ve satırları sonra sil, yoksa bir sonraki okuyan onları gerçek kullanım sanır
- [fabrika-fallback-catch-swallows-the-fix-you-just-made](fabrika-fallback-catch-swallows-the-fix-you-just-made.md) — Fabrika'da mock/demo geri düşüşü olan bir fonksiyona zorunlu bir yan etki (kayıt yazma) eklersen geniş catch onu sessizce yutar — ayrı hata sınıfı yaz ve her catch'te rethrow et, yoksa test yeşil kalırken delik geri gelir
- [fabrika-importer-count-is-not-caller-count](fabrika-importer-count-is-not-caller-count.md) — Fabrika'da eski bir denetim raporunun "çağıran sayısı" rakamı modülü import edenleri saymış olabilir — göç kartına başlamadan önce sembolü `await X(` ile ayrı say, yoksa kapsamı fazla tahmin edersin
- [fabrika-split-a-card-blocked-on-a-price-decision](fabrika-split-a-card-blocked-on-a-price-decision.md) — Fiyat/iş kararı bekleyen bir kartta durma — mimari yarısını, HİÇBİR müşterinin fiyatını artırmayan seçenekle yap ve kararı tek bir saf fonksiyona indir

- [flat-scratchpad-backup-collides-on-basename](flat-scratchpad-backup-collides-on-basename.md) — A/B ölçümü için dosyaları düz bir scratchpad'e basename ile yedekleme — bu repoda src/lib/rag.ts ve src/lib/ai/rag.ts aynı adı taşıyor ve geri yükleme yanlış içeriği yazdı

- [fabrika-vitest-runs-keyless-and-hides-console](fabrika-vitest-runs-keyless-and-hides-console.md) — Fabrika'da vitest .env'i process.env'e taşımaz — OPENAI_API_KEY tüm süitte unset, yani her "anahtar yoksa uydur" dalı sessizce koşuluyor ve testler ona bel bağlıyor; ölçmek için --reporter=verbose şart, varsayılan reporter geçen testin console çıktısını GİZLER

- [fabrika-401-is-a-flow-step-not-an-error-state](fabrika-401-is-a-flow-step-not-an-error-state.md) — Bir API'ye 401 kapısı eklerken o cevabı gösteren istemciyi de tasarla — Fabrika'da sepet çekmecesi ham "Unauthorized" basıyordu; doğru davranış giriş sayfasına callbackUrl ile gitmek (sepet localStorage'da yaşadığı için kayıp yok)
- [fabrika-api-route-session-gate-is-requiretenantapi](fabrika-api-route-session-gate-is-requiretenantapi.md) — Fabrika'da bir API rotasına oturum kapısı koyarken tek doğru desen requireTenantApi() (src/lib/tenant.ts) ve kapı gövde okunmadan/fiyatlama yapılmadan ÖNCE gelir — reddin maliyeti sıfır olmalı
- [fabrika-jsdom-tests-have-no-localstorage](fabrika-jsdom-tests-have-no-localstorage.md) — Fabrika'nın vitest/jsdom ortamında localStorage TANIMSIZ ve @testing-library/user-event kurulu değil — bileşen testinde Storage'ı elle kur, tıklama için fireEvent kullan

- [fabrika-type-level-tenant-guard-and-ts-expect-error-test](fabrika-type-level-tenant-guard-and-ts-expect-error-test.md) — Fabrika'da opsiyonel tenantId taşıyan bir aşırı yükleme bug sınıfıdır — parametreyi zorunlu yap + assertTenantScope koy, ve "artık derlenmiyor"u @ts-expect-error ile teste yaz (tsconfig **/*.ts içerdiği için pnpm typecheck bunu zorlar)

- [branded-type-fails-where-as-unknown-as-already-lives](branded-type-fails-where-as-unknown-as-already-lives.md) — Bir yapısal tipi markalamanın (nominal) getirisi, o tipin çağrı yerlerinde kaç `as unknown as` olduğuyla ters orantılıdır — markayı ölçmenin doğru yolu hata SAYISI değil hataların KİMDE olduğudur.
- [dead-overload-that-still-teaches](dead-overload-that-still-teaches.md) — Bir hata düzeltmesi "opsiyonel parametreyi zorunlu yaptım" diye kapandığında ölü aşırı yükleme geride kalır — silinmesi bedelsizdir ve @ts-expect-error negatif muhafızları silmeden sonra da tatmin olur; ama ikizi komşu dosyada hâlâ açık olabilir.

- [fabrika-agent-results-are-write-once](fabrika-agent-results-are-write-once.md) — docs/agent-results/ kanıt dosyaları BİR KEZ yazılır — pre-commit hook var olan dosyanın içeriğini değiştiren commit'i durdurur; düzeltme ana rapora değil -2.md'ye yazılır
- [fabrika-deleting-an-overload-can-silently-void-a-ts-expect-error](fabrika-deleting-an-overload-can-silently-void-a-ts-expect-error.md) — Bir aşırı yüklemeyi silerken @ts-expect-error muhafızları HÂLÂ hata veriyor diye rahatlama — sebebi değişmiş olabilir; muhafızın yük taşıdığını kanıtlamak için hatayı geri koy ve TS2578 gör
- [fabrika-e2e-env-comes-from-playwright-not-dotenv](fabrika-e2e-env-comes-from-playwright-not-dotenv.md) — Fabrika e2e'si 503/eksik-config veriyorsa .env'e bakma — playwright.config.ts testEnv'i KENDİ başlattığı sunucuya enjekte eder; kırmızı, başkasının başlattığı sunucuya bağlanmaktan gelir
- [fabrika-prove-a-red-gate-is-not-yours-by-counterfactual](fabrika-prove-a-red-gate-is-not-yours-by-counterfactual.md) — Paylaşılan ağaçta kapı kırmızıysa "benim değil" DEME, ÖLÇ — aynı spec'i değişikliğin geri alınmış ve geri konmuş haliyle koş; ayrıca depo İÇİNDEKİ yabancı worktree'ler pnpm test/lint sayılarını üçe katlar
- [fabrika-noUncheckedIndexedAccess-false-positive-pattern](fabrika-noUncheckedIndexedAccess-false-positive-pattern.md) — 171 hatanın çoğu tek desen: length-check sonrası index erişimi, TS daraltamıyor; bayrak tek global tsconfig anahtarı, TÜM dilimler bitene kadar açılamaz
