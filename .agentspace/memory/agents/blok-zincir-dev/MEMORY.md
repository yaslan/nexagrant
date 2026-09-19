# Memory Index

- [fabrika-idempotent-covers-the-db-not-the-mailbox](fabrika-idempotent-covers-the-db-not-the-mailbox.md) — Bir betik "running twice is safe" diyorsa bu genelde yalnız DB upsert'leri içindir — mail/ödeme/webhook gibi dış yan etkiler ayrıca korunmalı; Fabrika'da esr-calibration --send tam olarak böyleydi

- [fabrika-a-count-is-not-coverage](fabrika-a-count-is-not-coverage.md) — Bir kapı "N kayıt işlendi" sayısına bakıyorsa hâlâ kör — sayı KAPSAM değildir; teyit edilen birim / toplam birim ölç
- [fabrika-silently-dropped-input-inflates-a-success-count](fabrika-silently-dropped-input-inflates-a-success-count.md) — `.find` ile eşleştirilen girdi satırı eşleşmezse sessizce düşer ama sayaçta kalır — anlaşılmayan girdi ya reddedilmeli ya raporlanmalı, asla atlanmamalı

- [a-mock-that-omits-an-export-is-a-structural-guard](a-mock-that-omits-an-export-is-a-structural-guard.md) — Bir modül mock'undan yasak export'u ÇIKARMAK, "şu istemciyi kullanma" kuralını yorum yerine teste bağlar — regresyon üretimde değil süitte kırmızı olur

- [fabrika-two-way-evidence-for-guard-tests](fabrika-two-way-evidence-for-guard-tests.md) — When writing regression tests for guard clauses, verify both RED and GREEN states to prove the test actually measures what it claims

- [reuseExistingServer-symptom-masking](reuseExistingServer-symptom-masking.md) — playwright.config reuseExistingServer:true, eski server varsa testEnv bypass eder; "module env fail" semptomun kök nedeni bu olabilir

- [fabrika-playwright-reuseexistingserver-ci-guard](fabrika-playwright-reuseexistingserver-ci-guard.md) — playwright.config.ts webServer'da reuseExistingServer: !process.env.CI — dev'de true (hızlı), CI'da false (fresh startup, test env vars uygulanır)

- [a-blanket-never-assertion-can-be-the-wrong-one](a-blanket-never-assertion-can-be-the-wrong-one.md) — `not.toContain(X)` görünüşte en güçlü iddiadır ama alan kuralı X'i ZORUNLU kılıyorsa en yanlışıdır — doğru düzeltme silmek değil, 'X tam bir kez, kendini gerekçelendiren yerde' demektir

- [an-audits-best-finding-hides-in-a-passing-clause](an-audits-best-finding-hides-in-a-passing-clause.md) — Bir kural denetiminde en degerli bulgu ihlal edilen maddede degil, GECEN maddenin ic tutarsizliginda cikar — madde madde hukum ver, PASS'i de kanitla

- [a-handed-down-root-cause-is-a-hypothesis](a-handed-down-root-cause-is-a-hypothesis.md) — Görevle birlikte "kök neden ZATEN BULUNDU, tekrar arama" diye gelen teşhis bir hipotezdir — önce tek deneyle ölç, sonra düzelt

- [a-locale-agnostic-test-constant-hides-a-monolingual-page](a-locale-agnostic-test-constant-hides-a-monolingual-page.md) — Bir e2e sabiti tek dilde yazılıysa, o sabiti /en sayfasında arayan iddia sınanamaz hâle gelir — sayfa tek dilli olduğu için geçer, yerelleştirme kırıksa da geçer

- [fabrika-brand-metadata-hardcoding](fabrika-brand-metadata-hardcoding.md) — Fabrika'da brand.ts single-source-of-truth ama page titles, email subjects, calendar headers hardcoded — brand değişiminde HER yüzey (title, email, pdf) kontrol gerekir

- [a-guard-is-blind-to-the-shape-it-was-not-written-for](a-guard-is-blind-to-the-shape-it-was-not-written-for.md) — Bir yasak-değer muhafızı yalnız YAZILDIĞI BİÇİMİ görür — marka adını arayan tarama, aynı markanın alan adı biçimini (küçük harfli fabrika.dev) hiç göremez; muhafız yeşilken bile değer dışarı gitmeye devam eder
- [fabrika-a-red-gate-may-belong-to-a-nested-worktree](fabrika-a-red-gate-may-belong-to-a-nested-worktree.md) — Fabrika'da `pnpm gate` lint aşamasında ~1960 hatayla düşüyorsa suç muhtemelen senin değil — eslint depo içindeki .claude/worktrees/ kopyasını da tarıyor; suçu paylaşılan ağaçta stash ATMADAN, hataları üst dizine göre kovalayarak ölç

- [fabrika-inherited-wip-dangling-crossref](fabrika-inherited-wip-dangling-crossref.md) — Devralınan yarım işte eksik parçayı bulmanın en ucuz yolu — "bkz. X" diyen çapraz referansları izle; hedefte gerekçe yoksa yarım kalan yer orasıdır
