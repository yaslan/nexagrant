# QA-EN Hafızası

- [RLS Flow Complete](fabrika-rls-flow-complete.md) — Kiracı izolasyonu ölçümü açıldı — pnpm db:rls-role + pnpm db:rls + test 4/4 yeşil
- [G0 Puanlama Fix'lendi](g0-scoring-fixed.md) — G0 hiç hesalanmıyor bug fix'lendi, fırsat oluştur + gate'de çağrılıyor

- [fabrika-assert-both-config-branches](fabrika-assert-both-config-branches.md) — Davranış bir go-live ayarına bağlıysa testi tek ortama sabitleme — iki dalı da doğrula; uydurma cevap her iki dalı da düşürür, test hiçbir ortamda kırılmaz
- [G0 Production Hook](g0-scoring-production-hooked.md) — G0 puanı kanonik scoreG0/decideG0 ile production'da hesalanıyor, rescoreOpportunityG0 hook'u bağlanmış, 28 test yeşil

- [fabrika-schema-done-means-information-schema](fabrika-schema-done-means-information-schema.md) — Bir şema işi "bitti" raporlandıysa tablo gerçekten var demek DEĞİL — typecheck de mock'lu test de yalan söyler; information_schema'ya sor

- [fabrika-check-every-surface-not-the-fix](fabrika-check-every-surface-not-the-fix.md) — "Kanonik hesaplayıcıya bağlandı" raporu bir yüzeyi anlatır, hepsini değil — aynı değeri okuyan her ekranı ayrı ayrı grep'le; Fabrika'da board önbellek kolonunu, detay sayfası canlı hesabı gösteriyordu

- [fabrika-dev-server-500s-after-deleting-a-route-file](fabrika-dev-server-500s-after-deleting-a-route-file.md) — next dev bir route dosyası (loading.tsx/page.tsx) SİLİNDİĞİNDE bayat manifest yüzünden her rotaya 500 verir — bunu regresyon sanma, sunucuyu yeniden başlat; dosya EKLEMEK aynı sorunu yaratmaz
- [fabrika-status-code-needs-session-and-module-on](fabrika-status-code-needs-session-and-module-on.md) — Bir rotanın HTTP durum kodunu ölçerken iki kapı ölçümü sessizce sahteleştirir — oturumsuz istek 307'de durur, modülü OFF kiracı DOĞRU bir 200 (kilit ekranı) döndürür; ikisini de kapatmadan "geçti/kaldı" deme

- [fabrika-e2e-seed-riding-specs-go-red-on-plan-drift](fabrika-e2e-seed-riding-specs-go-red-on-plan-drift.md) — Tohum kiracıya (main / fabrika-beta) binen e2e paketleri plan verisi değişince sessizce kırmızıya döner — modül kapısı render edilir, aranan form/başlık hiç basılmaz; kendi fixture kiracısını kuran paketler etkilenmez
- [playwright-waitforurl-loose-regex-false-red](playwright-waitforurl-loose-regex-false-red.md) — Playwright'ta gevşek bir waitForURL regex'i MEVCUT sayfanın URL'siyle eşleşip anında geçer — gezinme hiç beklenmez ve tıklama testi sahte kırmızı verir; assertion'ı gevşetme, bekleyiciyi sıkılaştır

- [fabrika-fake-showcase-bind-or-remove-needs-a-persistence-check](fabrika-fake-showcase-bind-or-remove-needs-a-persistence-check.md) — "Sahte vitrini gerçek duruma bağla ya da kaldır" kararını vermeden ÖNCE o durumun kalıcı bir tablosu var mı diye bak — yoksa bağlamak yeni bir yalan üretir
- [fabrika-i18n-evidence-bar-forces-whole-file](fabrika-i18n-evidence-bar-forces-whole-file.md) — i18n kartı birkaç satır numarası verse de kanıt "ekran EN'de İngilizce" ise dosyanın TAMAMINI çevir — yarım çeviri kanıt karesini geçemez

- [grep-count-dod-can-hit-a-legitimate-string](grep-count-dod-can-hit-a-legitimate-string.md) — Kart "indirilen dosyada `grep -c X` = 0" diyorsa önce X'in HER geçtiği yeri ayır — ürün markası ile uydurma kimlik aynı dizeyi paylaşabilir; sayıyı tutturmak için meşru olanı silme

- [fabrika-gitignore-does-not-hide-a-file-from-the-gate](fabrika-gitignore-does-not-hide-a-file-from-the-gate.md) — .gitignore'daki geçici script yine de eslint ve tsc tarafından okunur ve pnpm gate'i repo genelinde kırar — probe dosyanı koştuktan sonra SİL, ve yabancı bir kalıntıya dokunmadan kapıyı hariç-tutarak ölç
- [fabrika-superuser-hides-missing-withtenant](fabrika-superuser-hides-missing-withtenant.md) — Kiracı tablosunu withTenant DIŞINDA okumak yerelde DOĞRU görünür — DATABASE_URL SUPERUSER; hatayı görmek için aynı fonksiyonu fabrika_app rolüne bağlı client'la koştur

- [fabrika-a-built-feature-with-no-caller-is-not-shipped](fabrika-a-built-feature-with-no-caller-is-not-shipped.md) — Yeşil birim testi ve temiz typecheck bir özelliğin ÇALIŞTIĞINI kanıtlar, KULLANILDIĞINI değil — bitmiş saydığın her yeni fonksiyon için `grep -rn <isim> src` ile üretim çağıranını ara
- [fabrika-hiding-a-card-is-not-refusing-a-purchase](fabrika-hiding-a-card-is-not-refusing-a-purchase.md) — Görünürlük kusurlarında listeyi ve satın almayı AYRI ölç — kart gizlendiği hâlde endpoint sku'yu elle kabul edebilir; ayrıca "yok" ile "senin değil" tek mesajla cevaplanmalı

- [a-missing-field-card-hides-a-wrong-value-bug](a-missing-field-card-hides-a-wrong-value-bug.md) — Kart 'şu alan yok' diyorsa grep'le doğrulamakla yetinme — yolu koştur ve ÜRETİLEN belgeye bak; eksik alanın yanında çoğu zaman daha ağır bir 'yanlış değer' kusuru duruyor

- [a-fix-can-turn-a-silent-bug-into-an-outage](a-fix-can-turn-a-silent-bug-into-an-outage.md) — Bir düzeltme "sessizce yutma, fırlat" derse, altındaki yazma yolunun gerçekten çalıştığını KANITLA — yoksa kayıp kayıt kusuru tam kesintiye dönüşür
- [grep-count-of-zero-can-mean-the-fix-landed](grep-count-of-zero-can-mean-the-fix-landed.md) — Bir kartın "grep sayısı 0" kanıtı düzeltilmiş kodda da 0 kalır — çağıranı değil tıkacı ölç, yoksa bitmiş işi bitmemiş sanırsın
- [one-action-can-be-billed-twice-in-two-places](one-action-can-be-billed-twice-in-two-places.md) — Bir "tek giriş noktası" birleştirmesini doğrularken adaptörün düşüşünü değil, TEK EYLEMİN defterde kaç satır bıraktığını say — ikinci tahakkuk çağıran modülde durabilir
- [probes-on-a-shared-db-must-run-one-file-at-a-time](probes-on-a-shared-db-must-run-one-file-at-a-time.md) — Aynı kiracı üzerinde çalışan ve kendi satırlarını temizleyen vitest sondalarını TEK ÇAĞRIDA birlikte koşma — dosya paralelliği altında birbirlerinin satırlarını siler ve anlamsız sayı üretirler

- [live-db-probe-beats-a-mocked-prisma-for-filter-shape-bugs](live-db-probe-beats-a-mocked-prisma-for-filter-shape-bugs.md) — Fabrika'da sorgu-şekli kusurlarını yalnız canlı Postgres sondası yakalar — kalıcı `*.live.test.ts` kalıbı, kendi fixture'ı, `describe.skipIf(!HAS_DB)`, sonda kalıntısı bırakma
- [prisma-json-equals-compares-the-whole-document](prisma-json-equals-compares-the-whole-document.md) — Prisma'da Json kolonda `data: { equals: { key: v } }` TÜM belgeyi karşılaştırır — tek alan için `path: ['key'], equals: v` şart; bu kalıp sessizce hiç eşleşmeyen muhafızlar üretir
- [shared-worktree-red-must-be-attributed-before-it-is-reported](shared-worktree-red-must-be-attributed-before-it-is-reported.md) — Paylaşılan ağaçta süit iki koşuda farklı kırmızı veriyorsa suç senin değil olabilir — kendi dosyanı `git stash push -- <file>` ile HEAD'e alıp aynı testi tekrar koş, sonucu rapora KANITLA

- [a-record-is-not-a-document](a-record-is-not-a-document.md) — Bir alanın satıra ve makine formatına yazılması onu BELGEYE yazmaz — insanın eline geçen PDF/HTML'i ayrıca üret ve içine bak
- [my-own-verification-report-goes-stale](my-own-verification-report-goes-stale.md) — Bir kart "QA doğruladı" notuyla geri geldiyse önce doğruladığın commit ile HEAD arasına bak — arada tam o kartın işi inmiş olabilir

- [a-probes-own-format-assumption-fakes-a-red](a-probes-own-format-assumption-fakes-a-red.md) — Sondayı tekrar koşup "regresyon" görürsen önce sondanın kendi iddiasını oku — biçim varsayımı (nokta/virgül, \b sınırı) sahte kırmızı üretir; hükmü SAKLANMIŞ yeşil koşuyla karşılaştırarak ver
- [my-probe-residue-can-block-a-not-valid-constraint](my-probe-residue-can-block-a-not-valid-constraint.md) — Bir CHECK kısıtı NOT VALID kaldıysa suçlu çoğu zaman kendi sondamın bıraktığı satırlardır — satırlara BAK, kalıntıysa sil ve VALIDATE koş; bu bir yayın adımını kapatır

- [a-long-lived-dev-server-holds-a-stale-prisma-client](a-long-lived-dev-server-holds-a-stale-prisma-client.md) — Bir e2e "Argument X must not be null" gibi şema hatası veriyorsa önce dev sunucusunun YAŞINA bak — uzun ömürlü next dev belleğinde eski üretilmiş Prisma istemcisini tutar ve taze süreçte geçen yazma tarayıcıda düşer
- [an-alert-body-that-changes-every-run-defeats-its-own-dedupe](an-alert-body-that-changes-every-run-defeats-its-own-dedupe.md) — Yeni bir SystemAlert çağıranı yazarken meta'yı SABİT tut ve dizileri SIRALA — zaman damgası/hata metni koyan çağıran TASK-MTS80DUAF39Z8'in tekrar korumasını sessizce kapatır; ayrıca satırın ekrana ulaştığını tıklayarak kanıtla
- [prisma-migrate-applies-only-5-of-17-migrations-here](prisma-migrate-applies-only-5-of-17-migrations-here.md) — Fabrika'da prisma migrate hiçbir düz .sql'i uygulamaz — 17 ileri migration'ın 12'si elle koşulmak zorunda ve DB yalnız 5'ini bilir; "migration var" demek "kolon var" DEMEK DEĞİL
- [publishing-e2e-shots-overwrites-a-closed-cards-evidence](publishing-e2e-shots-overwrites-a-closed-cards-evidence.md) — E2E_SHOTS_ROOT=docs/agent-results ile KENDİ spec'inden başkasını koşarsan kapanmış kartların commit'li kanıt karelerini üzerine yazarsın — regresyon paketini bu değişken OLMADAN koştur

- [a-conformance-check-cannot-see-absence](a-conformance-check-cannot-see-absence.md) — Doğru API'nin VARLIĞINA bakarak çalışan her denetçi, o API'nin YOKLUĞUNU göremez — yeşil kapıyı gördüğünde "kaç dosya bu kapıya hiç girmiyor" diye ölç

- [fabrika-main-db-connection-bypasses-rls](fabrika-main-db-connection-bypasses-rls.md) — Fabrika'nın ana DATABASE_URL bağlantısı (fabrika rolü) SUPERUSER+BYPASSRLS'dir — prisma/rls.sql politikaları üretim trafiğinde fiilen etkisizdir, yalnızca ayrı fabrika_app test rolüyle doğrulanır
- [fabrika-tenantid-ternary-fallback-bug-class](fabrika-tenantid-ternary-fallback-bug-class.md) — Fabrika'da tekrarlayan hata sınıfı — session?.tenantId'yi requireTenantPage/Action yerine ham okuyup "tenantId ? {tenantId} : {}" ile filtreyi düşürmek; iki kez düzeltilmiş, üç yerde hâlâ canlı bulundu

- [fabrika-rls-migration-scan-widened-clean-plus-grep-gotcha](fabrika-rls-migration-scan-widened-clean-plus-grep-gotcha.md) — TASK-MTUGK2OUVAFDN sonucu — CalendarConnection'daki 4 RLS sapmasi diger 7 migration dosyasinda TEKRARLANMADI (izole hataydi); ayrica cift-bosluklu FORCE deyimi tek-bosluk grep'i atlatir

- [a-a-twins-failure-mode-does-not-repeat](a-a-twins-failure-mode-does-not-repeat.md) — "Şu dosya çifti, daha önce patlayan ikize benziyor" diye başlayan kart, o ikizin HATA BİÇİMİNİ de miras aldığını varsayar — benzerliği yol deseninden değil, her ekseni tek tek ölçerek doğrula

- [a-green-run-belongs-to-a-file-state-not-a-file](a-green-run-belongs-to-a-file-state-not-a-file.md) — Paylaşımlı ağaçta "1649 test geçti" bir DOSYAYA değil bir dosya DURUMUNA aittir — yeşili md5 ile çivile, ve altında beliren "regresyonu" komşunun mutasyon testi olabileceği için raporlamadan ÖNCE sor
- [fabrika-tenantid-sweep-residue-m6-overload-and-checkout](fabrika-tenantid-sweep-residue-m6-overload-and-checkout.md) — Depo geneli tenantId-filtre-düşürme süpürmesi bitti (TASK-MTUH7CF87SGRR) — canlı 4 satır kaldı ve ikisi de HENÜZ DÜZELTİLMEDİ: m6/scoring.ts'in 2-argümanlı aşırı yüklemesi ve checkout rotasının 'default-tenant' fallback'i

- [a-suggested-fix-can-encode-the-same-bug-it-targets](a-suggested-fix-can-encode-the-same-bug-it-targets.md) — A handed-down fix hypothesis for a money/plan bug ("probably switch to column Y") can itself be the inverted-behavior bug — measure every write path before implementing, especially when the "more specific"-sounding field is the less reliable one

- [a-gate-run-belongs-to-a-tree-not-a-commit](a-gate-run-belongs-to-a-tree-not-a-commit.md) — Paylaşılan ağaçta "kapı X commit'inde yeşil" cümlesi yanlıştır — kapı ağacı ölçer, commit'i değil; kartı kapatan commit'in kendisi hiç ölçülmemiş olabilir
- [fabrika-shared-tree-gate-red-from-a-foreign-dev-server](fabrika-shared-tree-gate-red-from-a-foreign-dev-server.md) — Fabrika'da pnpm gate'in e2e aşaması, makinede başkasının açtığı next dev sunucusunu yeniden kullanır ve testEnv hiç uygulanmaz — 7 fatura testi 503'le yalancı kırmızı verir
- [fabrika-playwright-reuseexistingserver-lokal-risk](fabrika-playwright-reuseexistingserver-lokal-risk.md) — Dev'in CI guard'ına rağmen lokal'de yabancı sunucu env loss riski kalıyor — çözüm: reuseExistingServer: false yapıp tüm ortamlarda yeni sunucu başlat

- [fabrika-error-wrap-needs-a-negative-test](fabrika-error-wrap-needs-a-negative-test.md) — Bir try/catch'in DAR tutulduğunu ancak negatif test kanıtlar — pozitif "doğru tipi fırlatıyor" testi, fonksiyonun tamamını saran aşırı-düzeltmede de yeşil kalır
- [fabrika-named-error-throw-is-half-the-contract](fabrika-named-error-throw-is-half-the-contract.md) — Adlandırılmış hata tipi fırlatmak sözleşmenin yarısıdır — çağıranın blanket catch'i onu yutuyorsa delik hâlâ açık; her yeni throw'da çağıran taraması ZORUNLU

- [a-writing-the-report-is-not-delivering-it](a-writing-the-report-is-not-delivering-it.md) — Paylaşılan ağaçta rapor dosyasını yazmak teslim etmek değildir — commit'le ve git ls-tree ile ağaçta olduğunu doğrula
- [fabrika-systemalert-resolvedat-has-one-writer](fabrika-systemalert-resolvedat-has-one-writer.md) — Fabrika SystemAlert.resolvedAt'i yalnız konsoldaki insan yazıyor — üretici/süpürücü yok, o yüzden 0 alarm çözülmüş

- [a-cleanup-claim-in-a-report-is-a-claim-not-a-fact](a-cleanup-claim-in-a-report-is-a-claim-not-a-fact.md) — A report saying "test data was removed" often means the seed SCRIPT file was deleted, not that the DB rows it wrote were deleted — check live state, not prose

- [fabrika-esr-roster-blocker-confirmed-genuine](fabrika-esr-roster-blocker-confirmed-genuine.md) — E11.3 (TASK-MTQ2KL3JO4MK2) ESR calibration roster blocker independently audited — confirmed genuine external/human dependency, not a hidden code bug

- [a-check-whether-the-invariant-already-lives-in-a-caller](a-check-whether-the-invariant-already-lives-in-a-caller.md) — Dışa açık bir fonksiyonda kusur bulduğunda, düzeltmeden önce ÇAĞIRANLARI oku — kural çoğu zaman zaten orada elle uygulanıyordur; bu hem doğru düzeltmenin kanıtı hem de "üretimde ulaşılabilir mi" sorusunun cevabıdır
- [a-nan-that-never-reaches-the-screen-is-the-dangerous-kind](a-nan-that-never-reaches-the-screen-is-the-dangerous-kind.md) — "NaN kullanıcıya ulaşıyor mu?" diye sorulan kartta doğru cevap çoğu zaman "hayır, daha kötüsü" — karşılaştırma NaN'ı sessizce false'a çevirip makul görünen YANLIŞ bir karar üretir; testi Number.isNaN'a değil ürün anlamına yaz
- [a-product-question-cards-need-the-reachability-path-not-just-the-branch](a-product-question-cards-need-the-reachability-path-not-just-the-branch.md) — "Bu dal yanlış davranıyor" tipi ürün-sorusu kartında asıl iş dalı göstermek değil, kullanıcının o dala GERÇEKTEN nasıl vardığını bulmaktır — Fabrika'da cevap kapıların kendisinde değil, aşamayı kapı koşmadan yazan iki UI yolundaydı
