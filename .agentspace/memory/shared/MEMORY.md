# Memory Index

- [fabrika-local-dev-db](fabrika-local-dev-db.md) — Fabrika yerel dev Postgres'i sıfırdan nasıl kurulur ve neden yerelde RLS gerçekten test edilemez
- [fabrika-prisma7-driver-adapter](fabrika-prisma7-driver-adapter.md) — Fabrika'da Prisma 7 driver adapter zorunlu — çıplak new PrismaClient() ve tsx script'lerinde .env yüklenmemesi tuzağı
- [fabrika-rls-bypass-local-dev](fabrika-rls-bypass-local-dev.md) — Local fabrika DB role is SUPERUSER+BYPASSRLS so RLS is never enforced — prove isolation with a temporary NOBYPASSRLS probe role
- [fabrika-runtime-verification-recipe](fabrika-runtime-verification-recipe.md) — Fabrika'da bir değişikliği gerçekten doğrulama reçetesi — dev sunucu tekliği, curl ile NextAuth oturumu, seed kullanıcıları, DB durumu kontrolü
- [fabrika-withtenant-set-config](fabrika-withtenant-set-config.md) — withTenant() must use set_config() not SET LOCAL — Postgres SET rejects bind parameters, so $executeRaw template literals always fail with 42601

- [agent-exit-129-sighup](agent-exit-129-sighup.md) — Ajan görevi "exit 129" ile düşerse bu SIGHUP'tır (dosya/encoding hatası değil) — kök neden genelde ön planda çalıştırılan pnpm dev
- [fabrika-known-failing-tests](fabrika-known-failing-tests.md) — pnpm test'te taban çizgisi 4 kırmızı — 3 SEDIA ağ testi + 1 RLS testi; bunlar senin değişikliğinden değil, kovalama
- [fabrika-parallel-agent-file-race](fabrika-parallel-agent-file-race.md) — Paralel ajanlar aynı dosyayı yazıyor — yazdığın içerik git add'e kadar hayatta kalmayabilir; commit'ten önce git diff --cached ile staged içeriği doğrula
- [fabrika-prisma-client-type-override](fabrika-prisma-client-type-override.md) — src/types/prisma-override.d.ts @prisma/client'ı gölgeliyor — PrismaClient repoda any, Role gerçek enum olduğu için string literal atanamıyor
- [pnpm-double-dash-passthrough](pnpm-double-dash-passthrough.md) — pnpm run'da "-- --flag" yazma — pnpm ayıracı script'e aynen geçirir ve CLI "Unknown flag --" der; doğrusu pnpm tsx scripts/x.ts --flag
- [fabrika-g0-conversion-rate-formula](fabrika-g0-conversion-rate-formula.md) — Proposal.submitted/Opportunity.g0 oranı stage=G0 ile bölünürse >100% verir; doğrusu toplam opportunity/G0 gate-decision sayısı
- [fabrika-m5-kpi-duplicate-implementations](fabrika-m5-kpi-duplicate-implementations.md) — M5 KPI için iki ayrı success-rate implementasyonu var (queries.ts canlı, fetch-metrics.ts atıl) farklı tanımlarla

- [fabrika-session-tenant-mismatch](fabrika-session-tenant-mismatch.md) — Kiracı-kapsamlı her sayfa 0 gösteriyorsa sorgu değil oturum bozuktur — üyeliği olmayan kullanıcıya auth.ts var olmayan "demo-tenant-hq" kiracısını veriyor

- [fabrika-lighthouse-a11y-two-recurring-defects](fabrika-lighthouse-a11y-two-recurring-defects.md) — Fabrika'da Lighthouse a11y'yi 95 altında tutan iki yapısal kusur — html lang eksikliği ve karanlık temada bg-accent üstü beyaz metin

- [fabrika-g0-scoring-three-implementations](fabrika-g0-scoring-three-implementations.md) — G0 skoru için üç ayrı ve çelişkili gerçeklik var (rastgele sayı, 0-10 model, PROJECT.md'nin 0-100 ağırlıkları) ve 70 eşiğinin hangisine uygulandığı karara bağlı


- [agentspace-delegate-splits-numbered-lists](agentspace-delegate-splits-numbered-lists.md) — agentspace_delegate objective'indeki numaralı/madde listesini alt-görevlere böler — tek ajana verilecek çok adımlı iş listesiz yazılmalı

- [fabrika-docker-broken-symlink](fabrika-docker-broken-symlink.md) — Bu makinede docker "yok" DEĞİL — /usr/local/bin/docker kırık symlink; çalışan CLI /Applications/Docker.app/Contents/Resources/bin/docker ve postgres-vector ayakta
- [fabrika-migrations-are-not-prisma-migrate](fabrika-migrations-are-not-prisma-migrate.md) — Fabrika'da prisma/migrations elle yazılmış düz SQL — Prisma Migrate DEĞİL; pnpm db:migrate koşmak veritabanını sıfırlatabilir, doğru yol prisma db execute --file

- [fabrika-team-handover-cekirdek](fabrika-team-handover-cekirdek.md) — Fabrika iki ajan takımı arasında devredildi — eski *-0c1f10 takımı ile yeni Çekirdek takımını raporlarda ayırt etme kuralı

- [fabrika-dashboard-hardcoded-kpi-fallback](fabrika-dashboard-hardcoded-kpi-fallback.md) — KPI panosu (dashboard/client.tsx) gerçek metrik 0 geldiğinde sabit demo rakamlarına düşüyor — CLAUDE.md §7 kanıt disiplinini ihlal ediyor

- [fabrika-board-cards-go-stale](fabrika-board-cards-go-stale.md) — Fabrika görev panosundaki in_progress kartlar bitmiş işi gösteriyor olabilir — kartı koda karşı doğrulamadan iş dağıtma
- [fabrika-k1-upstream-sources](fabrika-k1-upstream-sources.md) — K1'in üç dış kaynağının 2026-09-06'da ölçülmüş gerçek durumu — SEDIA arama yanıtı açıklamayı zaten taşır (topicDetails çağrısı gereksiz), Eurostars portalı 403, TÜBİTAK /en/funding 404

- [fabrika-worker-panes-die-uncommitted](fabrika-worker-panes-die-uncommitted.md) — Fabrika'da worker pane'ler ~30 dakikada code 129 ile ölüyor ve commit edilmemiş işi ağaçta bırakıyor — lider kurtarmak zorunda

- [fabrika-fabricated-fallback-antipattern](fabrika-fabricated-fallback-antipattern.md) — Fabrika kod tabanında yaygın anti-desen — DB/LLM hatasında uydurma rakam render edip DB'ye yazan "demo fallback"lar; CLAUDE.md kural 7 ihlali, gördüğün yerde temizle
- [fabrika-g0-score-never-computed](fabrika-g0-score-never-computed.md) — Fabrika'da G0 kapı puanı hiç hesaplanmıyor — g0Score seed'den statik ya da Math.random() ile geliyor, kanonik scoreG0() üretimde hiç çağrılmıyor (ölçüldü 2026-09-07)

- [fabrika-stripe-idempotency-guard-dead](fabrika-stripe-idempotency-guard-dead.md) — Fabrika'da Stripe webhook'unun idempotency kapısı fiilen kapalı — `data: { equals: { stripeEventId } }` tam-belge eşitliği arıyor, asla eşleşmiyor; webhook kopyalarken bunu kopyalama

- [fabrika-dashboard-outcome-case-mismatch](fabrika-dashboard-outcome-case-mismatch.md) — Fabrika dashboard başarı oranını %0 gösteriyor — kod ABOVE_THRESHOLD arıyor, DB above_threshold tutuyor (ölçüldü 2026-09-07)
- [fabrika-i18n-dead-catalog-trap](fabrika-i18n-dead-catalog-trap.md) — Bir modül JSON i18n katalog dosyası src/locales/<lang>/<mod>.json altına yazılırsa next-intl onu hiç okumaz — DoD "i18n tamam" iddiası doğru olsa bile UI hard-coded kalır
- [fabrika-m6-disclaimer-surfaces](fabrika-m6-disclaimer-surfaces.md) — Evaluator Lens (M6) skoru gösteren beş yüzey ve her birinin "iç ön değerlendirme" etiketini nereden aldığı — yeni copy icat etme, m6.internalPreAssessment anahtarlarını kullan

- [fabrika-dev-server-stale-prisma-client](fabrika-dev-server-stale-prisma-client.md) — Fabrika'da uzun süredir ayakta olan dev sunucusu şema değişikliğinden sonra BAYAT Prisma istemcisi taşır — özellik sessizce çalışmaz, "Unknown field" hatası yutulur; sunucuyu öldürmeden ayırt etme yöntemi
- [fabrika-no-sentry-systemalert-decision](fabrika-no-sentry-systemalert-decision.md) — Patron kararı 2026-09-07 — Fabrika'da Sentry KULLANILMAYACAK; hata/geri bildirim izleme kendi SystemAlert tablosu + /admin/alerts ekranı üzerinden yürüyor
- [fabrika-workspace-url-segment-is-decorative](fabrika-workspace-url-segment-is-decorative.md) — Fabrika'da /{locale}/{workspace}/... yolundaki workspace segmenti kiracıyı BELİRLEMEZ — tenant yalnız oturumdan gelir; URL'e herhangi bir slug yazılabilir, izolasyon testini URL üzerinden kurma

- [fabrika-done-reports-can-be-wrong](fabrika-done-reports-can-be-wrong.md) — Fabrika'da worker "bitti + DoD 5/5" raporu verdiği halde özellik hiç çalışmayabiliyor — M9.2 örneği (2026-09-07): brief hiç kaydedilmiyordu, i18n iddiası yalandı
- [fabrika-module-state-not-enforced](fabrika-module-state-not-enforced.md) — ModuleState (OFF/DEV/PILOT/ON) hiçbir route'ta kontrol edilmiyor — checkModuleAccess/requireModule hiç çağrılmıyor, sistemik ve M9'a özgü değil

- [fabrika-e2e-own-fixture-hides-route-bugs](fabrika-e2e-own-fixture-hides-route-bugs.md) — Kendi kiracısını seed eden e2e testi yeşilken aynı rota demo-tenant'ta sonsuz iskelette takılabiliyor — M6 panel rotası örneği (2026-09-07)
- [fabrika-gate-engine-has-no-callers](fabrika-gate-engine-has-no-callers.md) — evaluateGate() Fabrika'da hiçbir uygulama kodundan çağrılmıyor — yalnız testler çağırıyor; kullanıcının gördüğü tek "Kapıyı Değerlendir" düğmesi bir alert() tiyatrosu
- [fabrika-post-commit-stamp-must-not-fail-request](fabrika-post-commit-stamp-must-not-fail-request.md) — Doğruluk kaynağı satır yazıldıktan SONRA çalışan "sonucu damgala" güncellemesi korumasızsa, kaydedilmiş bir bildirimi kullanıcıya "kaydedilemedi" diye gösterir — Fabrika'da gerçek gönderimde ölçüldü
- [fabrika-theme-tokens-not-dark-variant](fabrika-theme-tokens-not-dark-variant.md) — Fabrika UI'da renk için ham Tailwind paleti + dark: varyantı yerine globals.css tema token'ları kullan — arka planı boyayıp metni temaya bırakan satır koyu temada okunmaz oluyor

- [agentspace-browser-session-is-shared-between-agents](agentspace-browser-session-is-shared-between-agents.md) — Gömülü tarayıcı tüm ajanlar için TEK oturum — paralel bir ajan giriş yaparsa senin oturumun ortasında kullanıcı/kiracı değişir ve testin sessizce yanlış veriyi ölçer
- [agentspace-browser-type-does-not-update-react-state](agentspace-browser-type-does-not-update-react-state.md) — agentspace_browser'ın type eylemi DOM'a yazıyor ama React onChange'i tetiklemiyor — disabled={!state} olan submit düğmeleri tıklanamaz kalıyor, sessizce
- [fabrika-agents-share-one-working-tree](fabrika-agents-share-one-working-tree.md) — Fabrika'da paralel ajanlar TEK çalışma ağacını paylaşır — commit ederken yalnız kendi yollarını ver, `git commit -a`/çıplak `git add .` başkasının yarım işini yutar
- [fabrika-ci-has-no-remote](fabrika-ci-has-no-remote.md) — Fabrika deposunun git remote'u YOK — .github/workflows/ci.yml hiçbir zaman koşmaz, kapı yalnız lokal komutlardır
- [fabrika-force-server-action-failure-in-browser](fabrika-force-server-action-failure-in-browser.md) — Bir server action'ın hata dallarını GERÇEK tarayıcıda, action dosyasına dokunmadan tetiklemenin iki yolu — page.route abort (fırlatma) ve elde kurulmuş RSC flight gövdesiyle fulfill (belirli bir dönüş değeri)
- [fabrika-module-gate-is-opt-in](fabrika-module-gate-is-opt-in.md) — Fabrika'da modül kapısı sayfa başına opt-in — moduleGate() çağırmayan yeni bir sayfa kapalı modülü herkese açar; server action'da assertModuleAccess ilk satır olmalı
- [fabrika-notfound-returns-http-200](fabrika-notfound-returns-http-200.md) — Fabrika'da notFound() çağıran sayfa doğru 404 EKRANINI gösterir ama sunucu HTTP 200 döner — "404 çalışıyor" kanıtını ekran görüntüsüne dayandırma, durum kodunu ayrıca ölç
- [fabrika-usetranslations-breaks-existing-tests](fabrika-usetranslations-breaks-existing-tests.md) — Bir bileşene useTranslations eklemek onun MEVCUT testlerini kırar — bu repoda global next-intl kurulumu yok, her render NextIntlClientProvider ile sarılmalı

- [fabrika-concurrent-commit-steals-your-stage](fabrika-concurrent-commit-steals-your-stage.md) — Fabrika'da index paylaşıldığı için başka bir ajanın commit'i senin stage'lediğin dosyaları kendi commit'ine alabilir — commit çağrın "no changes added" derse işin kaybolmadı, HEAD'e bak
- [fabrika-css-uppercase-turkish-dotted-i](fabrika-css-uppercase-turkish-dotted-i.md) — CSS text-transform uppercase under html lang="tr" Turkish-cases hardcoded/untranslated text — English words get an incorrect dotted İ (e.g. "Consortium" → "CONSORTİUM")
- [fabrika-db-seed-broken-on-empty-db](fabrika-db-seed-broken-on-empty-db.md) — pnpm db:seed BOŞ bir veritabanında P2003 ile düşüyor — seedG0DemoEvidence, hiçbir seeder'ın üretmediği demo-topic-1..6 Topic id'lerine TopicMatch bağlıyor; düşünce sonraki tüm seed adımları (teklifler, M6 paneli, gate kararları) hiç koşmuyor
- [fabrika-esr-calibration-fixture-lost-in-s10-rebuild](fabrika-esr-calibration-fixture-lost-in-s10-rebuild.md) — S10 çökme dalgasının şema rebuild'i esr-calibration kiracısını (20 örnek fırsat, scripts/esr-calibration.ts) sildi — TASK-MTQ2KL3JO4MK2 devam etmeden önce --apply ile yeniden üretilmeli
- [fabrika-module-off-blocks-platform-admin-too](fabrika-module-off-blocks-platform-admin-too.md) — ModuleState OFF (missing row) blocks a page for EVERYONE including platform admin — no bypass; and /admin/modules has a race bug where rapid sequential ON clicks on dependent modules can silently revert to OFF
- [fabrika-render-loop-reads-as-infinite-skeleton](fabrika-render-loop-reads-as-infinite-skeleton.md) — "Sonsuz iskelet" şikâyeti genelde veri katmanı değil, kabuktaki sınırsız React render döngüsüdür — React 19 bileşen yığını basmaz, console.error'ı addInitScript ile sarıp JS yığınını yakala
- [fabrika-rls-can-silently-disappear](fabrika-rls-can-silently-disappear.md) — Şema yeniden kurulunca RLS politikaları uçar ve hiçbir şey söylemez — kırmızı RLS testini "ortam hatası" sanma, ölç
- [fabrika-task-id-reuse-in-wave](fabrika-task-id-reuse-in-wave.md) — The same TASK-xxxx id can be handed to multiple agents for unrelated work in a closing wave — evidence/screenshot folders under that id may hold another task's files

- [fabrika-free-string-columns-fail-silently](fabrika-free-string-columns-fail-silently.md) — Serbest string sütunu literal ile karşılaştırmak sessizce 0 üretir — tarama tarifi ve Fabrika'daki 9 sütunun sonucu (ölçüldü 2026-09-07)
- [fabrika-honest-fallback-over-invented-identity](fabrika-honest-fallback-over-invented-identity.md) — Fabrika'da bir `||` fallback'i eksik veriyi UYDURUYORSA bu bir bug'dır — kimlik/rol için doğru cevap gerçek veriden türetmek ya da "bilinmiyor" demek, en yüksek/en tanıdık değeri varsaymak değil
- [fabrika-prove-the-fix-against-the-real-database](fabrika-prove-the-fix-against-the-real-database.md) — Kiracı izolasyonu düzeltmesini mock'la değil gerçek Postgres'e karşı kanıtla — eski kodu geçici geri alıp e2e'yi koşmak "kusur teorikti" tartışmasını tek çıktıyla bitirir
- [fabrika-shared-json-whole-file-add-swallows-others-edits](fabrika-shared-json-whole-file-add-swallows-others-edits.md) — messages/tr.json veya messages/en.json'a `git add <o dosya>` çağırmak, tam o anda dosyayı düzenleyen başka bir ajanın commit'lenmemiş satırlarını da stage'ler — dosya yolu tekil olsa bile içerik paylaşılıyor
- [fabrika-tenant-filter-check-the-write-too](fabrika-tenant-filter-check-the-write-too.md) — Bir fonksiyonda kiracı filtresiz OKUMA bulduğunda aynı fonksiyondaki YAZMAYA da bak — Fabrika'da kapı motorunda okuma rapor edilmişti, asıl ağır kusur update({where:{id}}) idi

- [fabrika-client-priced-checkout-was-undercharging](fabrika-client-priced-checkout-was-undercharging.md) — Fabrika checkout istemciden fiyat alıyordu — saldırı kadar önemlisi meşru mutlu yolun 12 kat eksik fatura kesmesiydi; istemci fiyatı yasaklandığında ekranlar da aynı sürümde düzelmeli
- [fabrika-three-pricing-universes](fabrika-three-pricing-universes.md) — Fabrika'da fiyat üç ayrı yerde koda gömülüydü ve sunucu hiçbirini bilmiyordu — kanonik katalog USD 3 plan (patron kararı, 2026-09-07)

- [fabrika-env-flip-restarts-shared-dev-server](fabrika-env-flip-restarts-shared-dev-server.md) — Sunucu-tarafı bir env değişkenini gerçek tarayıcıda doğrulamak için .env'e satır ekle — Next dev kendini yeniden başlatır, paylaşılan :3000 sunucusunu öldürmen gerekmez; sonra .env'i geri al
- [fabrika-i18n-messages-cannot-hold-arrays](fabrika-i18n-messages-cannot-hold-arrays.md) — messages/tr.json ve en.json'da dizi kullanma — tests/i18n.test.ts her yaprağın boş olmayan STRING olmasını şart koşuyor; özellik listelerini f1..fN anahtarlarına aç

- [fabrika-seed-was-broken-mid-run](fabrika-seed-was-broken-mid-run.md) — Fabrika'da pnpm db:seed ortada durup fixture'ların yarısını yazmayabiliyordu — e2e "benim yüzümden mi" sorusunda önce seed'in exit kodunu kontrol et

- [fabrika-i18n-check-parametrized-key-false-positive](fabrika-i18n-check-parametrized-key-false-positive.md) — pnpm i18n:check parametreli t('key', {…}) çağrılarını göremez ve anahtarı "unused" sayar — bu bir hata değil; ayrıca komut bu depoda zaten exit 1 dönüyor ve pnpm gate'in parçası değil
- [fabrika-lifetime-sale-is-never-persisted](fabrika-lifetime-sale-is-never-persisted.md) — Ömür boyu lisans satışı hiçbir yere yazılmıyor — Stripe webhook'u yalnız abonelikli oturumu işliyor
- [fabrika-public-count-over-rls-table](fabrika-public-count-over-rls-table.md) — Herkese açık bir sayfada kiracıya özel bir tablonun sayısını göstermek gerekiyorsa düz SELECT sessizce 0 döner — prisma/rls.sql'e SECURITY DEFINER sayaç fonksiyonu koy ve "sayı okunamadı"yı sıfırdan ayır

- [fabrika-billing-ui-lives-in-two-namespaces](fabrika-billing-ui-lives-in-two-namespaces.md) — Fiyat rozetleri ÜÇ panelde birden yaşıyor (pricing, settings, admin) — biri düzeltilip diğer ikisi unutuluyor
- [fabrika-plan-card-copy-contradicts-plan-grants](fabrika-plan-card-copy-contradicts-plan-grants.md) — Plan kartlarındaki özellik satırları (koltuk/kredi/modül) i18n metni — yetkilendirmenin koştuğu PLAN_GRANTS ile sekiz yerde çelişiyor, yani kullanıcı kartta okuduğunu almıyor

- [fabrika-concurrent-agents-and-git-reset-hard](fabrika-concurrent-agents-and-git-reset-hard.md) — Aynı depoda iki ajan çalışırken `git reset --hard` diğerinin commit'lenmemiş işini siler — sprint maxConcurrent yalnız SPRINT görevlerini sıralar, sprint dışı pane'i durdurmaz
- [fabrika-grep-count-drop-may-be-comments](fabrika-grep-count-drop-may-be-comments.md) — Bir denetim göstergesini grep sayısıyla kapatma — kalan eşleşmeler düzeltmeyi ANLATAN yorumlar olabilir; sayı değil bağlam karar verir
- [fabrika-new-workspace-page-must-enter-route-catalog](fabrika-new-workspace-page-must-enter-route-catalog.md) — [workspace] altına yeni sayfa eklemek src/lib/modules/route-catalog.ts kaydı olmadan tamam değil — route-catalog testi kırmızıya döner ve kapıyı SONRAKİ karta miras bırakır
- [fabrika-playwright-caret-hide-fake-hydration-error](fabrika-playwright-caret-hide-fake-hydration-error.md) — Playwright'ın page.screenshot() varsayılanı sahte React hidrasyon uyuşmazlığı üretir — caret 'initial' ile kapat
- [fabrika-shared-dev-db-can-be-reset-under-you](fabrika-shared-dev-db-can-be-reset-under-you.md) — Paylaşılan dev veritabanı başka bir ajanın prisma migrate dev'i altında sıfırlanabilir — CLI boş DB'yi, çalışan :3000 sunucusu hâlâ eskisini görür

- [fabrika-rls-check-is-declaration-not-behaviour](fabrika-rls-check-is-declaration-not-behaviour.md) — `pnpm rls:check` yeşilken izolasyon ölçülmemiş olabilir — davranışı `pnpm rls:verify` + tests/rls.spec.ts ölçer; 2026-09-07'de bunlar 42501 (şema yetkisi yok) ile kırmızıydı

- [fabrika-dual-approval-fully-in-memory](fabrika-dual-approval-fully-in-memory.md) — src/lib/dual-approval.ts'nin HER iki yarısı da (M10 belge onayı VE Onay Merkezi/ApprovalRequest) DB'ye yazmıyor — cross-user onayla/reddet akışı gerçek tıklamayla asla doğrulanamaz

- [fabrika-dead-pane-work-measure-before-discarding](fabrika-dead-pane-work-measure-before-discarding.md) — Pane ölünce ağaçta kalan yarım işi atma — önce typecheck+test ile ölç, çoğu kez derleniyor ve testleri geçiyor

- [fabrika-e2e-blocked-by-landing-page-500](fabrika-e2e-blocked-by-landing-page-500.md) — Ana sayfa (/tr) 500 verdiği sürece pnpm test:e2e HİÇBİR testi koşturamaz — Playwright webServer yoklaması / adresine gider; çözüm E2E_BASE_URL'i giriş sayfasına almak

- [fabrika-stage-only-your-hunks-from-shared-json](fabrika-stage-only-your-hunks-from-shared-json.md) — messages/*.json gibi paylaşılan bir dosyada yalnız KENDİ hunk'larını commit'lemenin yolu — `git diff` çıktısını hunk'lara böl, seninkileri filtrele, `git apply --cached` ile yalnız onları index'e uygula

- [fabrika-prisma-generate-alone-changes-nothing](fabrika-prisma-generate-alone-changes-nothing.md) — prisma generate'i kapıya eklemek TEK BAŞINA hiçbir şey korumaz — prisma-override.d.ts'teki ambient declare module gerçek tipleri gölgeler; asıl ucuz kapı M8'in schema-contract tarayıcısı
- [fabrika-typecheck-is-blind-to-db-calls](fabrika-typecheck-is-blind-to-db-calls.md) — pnpm typecheck DB çağrılarına kör — prisma generate kapıda değil, model delegate'leri any; şemada olmayan tabloya çağrı yeşil geçiyor

- [fabrika-prisma-mock-makes-green-tests-for-crashing-calls](fabrika-prisma-mock-makes-green-tests-for-crashing-calls.md) — vi.mock ile elle yazılan prisma sahtesi, şemada OLMAYAN bir delegate'i mock'larsa çöken çağrıyı yeşil geçirir — sahte yalnız gerçek delegate'leri açmalı ve upsert'ü PK semantiğiyle uygulamalı

- [fabrika-db-mock-invents-the-model](fabrika-db-mock-invents-the-model.md) — vi.mock('@/lib/db') şemayı mock'a tanımlatıyor — hayali bir modeli mock'lamak testi yeşil tutarken uç nokta bozuk kalıyor; rota testinde eşlemeyi alan-alan ve boş/404 durumunu iddia et
- [fabrika-schema-contract-guard-misses-relation-names](fabrika-schema-contract-guard-misses-relation-names.md) — schema-contract.test.ts repo-sweep'i yalnız phantom MODEL yakalar; phantom RELATION (include:{x:true}) sadece SCANNED listesindeki (M8) dosyalarda kontrol edilir — M2 bu boşlukta kaldı

- [fabrika-api-v1-needs-a-handmade-apikey](fabrika-api-v1-needs-a-handmade-apikey.md) — /api/v1/* rotalarını curl ile doğrulamak için ApiKey satırını elle açman gerekir — seed böyle bir satır üretmiyor, api-auth.ts yorumu üretiyormuş gibi yazıyor
- [fabrika-undefined-tenantid-drops-the-where-clause](fabrika-undefined-tenantid-drops-the-where-clause.md) — Prisma bir where alanı undefined ise o koşulu HİÇ yazmaz — session?.tenantId doğrudan where'e girerse kiracı filtresi sessizce düşer; typecheck bunu göremez, hâlâ taşıyan 3 sayfa listeli

- [fabrika-prove-a-prisma-query-shape-without-a-db](fabrika-prove-a-prisma-query-shape-without-a-db.md) — Prisma argümanları bağlantıdan ÖNCE doğrulanır — kapalı bir porta bağlanan client ile "şema reddetti" (PrismaClientValidationError) ile "tele ulaştı" (PrismaClientKnownRequestError) ayırt edilir; her test dosyası kendi sorgu şeklini VERİTABANISIZ kanıtlayabilir
- [fabrika-swallowed-catch-returns-fake-success](fabrika-swallowed-catch-returns-fake-success.md) — Fabrika'da `catch { console.warn(...) }` + sabit `return { success: true }` deseni yazma başarısızlığını yeşil tike çeviriyor — bir catch bloğu, dönüş değerini DEĞİŞTİRMİYORSA hatayı raporlamıyor, gizliyor demektir

- [fabrika-card-numbers-may-live-in-the-test-fixture](fabrika-card-numbers-may-live-in-the-test-fixture.md) — Kart "ekran şu uydurma rakamı gösteriyor" diyorsa rakamı ÜRÜN kodunda değil TÜM repoda ara — Fabrika'da en az bir kez kaynak testin fixture'ı çıktı, üretim kodu zaten doğruydu
- [fabrika-e2e-fixture-needs-modulestate](fabrika-e2e-fixture-needs-modulestate.md) — ModuleState seed etmeyen bir e2e fixture'ı specini modül kilidinde öldürür ve hata "element(s) not found" der — kilidi arama, önce fixture'ın ModuleState satırını say
- [fabrika-llm-fallback-is-fabricated-data](fabrika-llm-fallback-is-fabricated-data.md) — LLM çağrısı düşünce yazılan "yedek" metin uydurma veridir — anahtar geçersizken (401) kullanıcının gördüğü TEK içerik odur; iddia içermeyen taslak yaz, kredi düşme, taslak olduğunu söyle
- [fabrika-phantom-model-bug-also-lives-in-the-python-worker](fabrika-phantom-model-bug-also-lives-in-the-python-worker.md) — TS tarafında temizlenen "olmayan modele yazma" hatası workers/cordis/main.py içinde HÂLÂ duruyor — Organization/Participation/Project tabloları şemada yok
- [fabrika-rls-is-fully-covered-dont-reopen](fabrika-rls-is-fully-covered-dont-reopen.md) — 2026-09-07 ölçümü — rls:check 41/41 beyan, rls:verify canlı DB'de 41/41 uyguluyor; eski kartlardaki "39/39" sayısı bayat, burada açılacak kart YOK
- [fabrika-staged-work-gets-swallowed](fabrika-staged-work-gets-swallowed.md) — Fabrika'da git add ile commit arası saniyeler güvenli değil — başka ajanın pathspec'siz commit'i sahnelenmiş işini yutar; add+commit'i tek adımda ve pathspec ile yap
- [fabrika-vitest-response-body-reads-once](fabrika-vitest-response-body-reads-once.md) — vi.spyOn(fetch).mockResolvedValue(new Response(...)) ikinci çağrıda BOŞ gövde döndürür — aynı Response nesnesi tekrar okunamaz; mockImplementation kullan

- [fabrika-eslint-rule-can-be-on-without-being-in-config](fabrika-eslint-rule-can-be-on-without-being-in-config.md) — DÜZELTME — bir kural eslint.config.mjs'te görünmüyor diye kapalı DEĞİLDİR; Fabrika'da react-hooks/set-state-in-effect ilk günden beri error, "0 uyarı" ise susturulmuş ihlal demekti — kuralın durumunu `eslint --print-config` ile oku
- [fabrika-unused-var-sweep-is-a-bug-hunt](fabrika-unused-var-sweep-is-a-bug-hunt.md) — no-unused-vars borcunu `_` ön ekiyle susturma — Fabrika'da bulguların önemli kısmı gerçek hatanın parmak izi (kullanılmayan `t` = sabit metin, kullanılmayan loading flag = kredi yakan çift tık); ayrıca satır-N bulgusunu tam-dosya replace ile düzeltme

- [fabrika-ab-baseline-without-git-stash](fabrika-ab-baseline-without-git-stash.md) — Testin senin değişikliğinden mi kırmızı olduğunu paylaşılan ağaçta ölçmenin yolu — `git stash` DEĞİL, sadece kendi dosyalarını `git show HEAD:` sürümüyle geçici takas et
- [fabrika-commit-with-a-throwaway-index](fabrika-commit-with-a-throwaway-index.md) — Başka ajanın stage'lediği dosyalar dururken kendi işini commit etmenin temiz yolu — GIT_INDEX_FILE ile geçici index; sonra gerçek index'i HEAD'e senkronla yoksa commit'in geri alınabilir
- [fabrika-idempotency-which-tables-must-stay-flat](fabrika-idempotency-which-tables-must-stay-flat.md) — "İşi iki kez koştur, satır sayısı değişmesin" testinde Fabrika'da yalnız normalize tablolar sabit kalır — RawFetch gün-aşırı büyür, SystemAlert HER koşuda büyür; ölçümü arka arkaya yap ve dünün sayısına karşı okuma
- [fabrika-k2-worker-200-is-not-proof](fabrika-k2-worker-200-is-not-proof.md) — K2'nin "success true" raporu kanıt değildir — /jobs/cordis işi BackgroundTasks'a atıp hemen 200 döner ve boru hattı hatayı print ile yutar; worker'ın gerçekten yazıp yazmadığını yalnız tablo sayımı gösterir
- [fabrika-next-intl-ships-every-message-to-public-html](fabrika-next-intl-ships-every-message-to-public-html.md) — next-intl tüm mesaj paketini HER sayfanın HTML'ine gömer — admin/uygulama içi bir string herkese açık landing'de de servis edilir; public metin denetimini ham HTML'de değil body.innerText üzerinde yap
- [fabrika-parallel-e2e-must-use-own-port](fabrika-parallel-e2e-must-use-own-port.md) — Aynı anda e2e koşan iki ajan tek dev sunucuyu paylaşır (reuseExistingServer) — her worker'a kendi E2E_PORT'unu ver, yoksa başkasının build'ini ölçer
- [fabrika-stage-one-hunk-of-a-shared-file](fabrika-stage-one-hunk-of-a-shared-file.md) — Paylaşılan bir dosyayı (messages/*.json) senden başka bir ajan da düzenlediyse `git add <yol>` onun işini de alır — hunk'ı `git apply --cached` ile izole et; `git add -p` bu ortamda interaktif olduğu için yok
- [fabrika-typecheck-incremental-cache-can-hide-errors](fabrika-typecheck-incremental-cache-can-hide-errors.md) — pnpm typecheck (tsc --noEmit --incremental) can report clean while a real, pre-existing error sits in a file you never touched — the gitignored tsconfig.tsbuildinfo cache skips re-checking files whose dependency graph looks unchanged since the last run

- [fabrika-fire-and-forget-worker-fakes-success](fabrika-fire-and-forget-worker-fakes-success.md) — İşi arka plana atıp hemen 200 dönen bir worker, çağıranın "success:true" raporunu kanıt olmaktan çıkarır — K2/CORDIS'te ölçüldü

- [fabrika-alert-dedupe-needs-stable-meta](fabrika-alert-dedupe-needs-stable-meta.md) — SystemAlert dedupe'u (level,source,message,meta) kimliğine dayanır — meta'sında koşudan koşuya değişen veri taşıyan uyarı ASLA katlanmaz; K1'in duplicateIdentifiers listesi böyle
- [fabrika-amend-can-hijack-a-later-commit](fabrika-amend-can-hijack-a-later-commit.md) — Paylaşılan dev dalında git commit --amend ÇALIŞTIRMA — HEAD senin commit'inden ilerlemiş olabilir, amend sessizce BAŞKA bir ajanın commit'ini ele geçirir ve onun kodunun ihtiyaç duyduğu içeriği siler
- [fabrika-dotenv-after-imports-never-reaches-env-ts](fabrika-dotenv-after-imports-never-reaches-env-ts.md) — scripts/run-k2-monthly.ts gibi dosyalarda dotenv.config() import'lardan SONRA calisir ama ESM import'lari HOISTED — src/lib/env.ts .env'i hic gormez, env.WORKER_TOKEN bos gider
- [fabrika-live-postgres-for-evidence](fabrika-live-postgres-for-evidence.md) — Canli Postgres kaniti icin docker postgres-vector kabini kullan — kabin ici POSTGRES_USER/PASSWORD .env'deki DATABASE_URL ile AYNI DEGIL; TCP baglantisi .env parolasini ister, docker exec psql soket-guveniyle gecer
- [fabrika-parallel-dev-server-needs-a-worktree](fabrika-parallel-dev-server-needs-a-worktree.md) — Next 16 aynı dizinde ikinci `next dev`'i reddediyor — paralel e2e için `git worktree` + node_modules/.env symlink + kendi portun; ölçülmüş kurulum burada
- [fabrika-prisma-client-side-defaults-are-not-db-defaults](fabrika-prisma-client-side-defaults-are-not-db-defaults.md) — Prisma'da @updatedAt ve @default(cuid()) veritabaninda DEFAULT birakmaz — Prisma disindan (Python worker, ham SQL, psql) yazan her istemci bu sutunlari kendi doldurmali

- [zsh-does-not-word-split-unquoted-vars](zsh-does-not-word-split-unquoted-vars.md) — Bash aracının kabuğu zsh — `CMD $LISTE` tek bir argüman olur, bash'teki gibi bölünmez; dosya listesini değişkende taşıma, satır içi yaz ya da `${=LISTE}` kullan
