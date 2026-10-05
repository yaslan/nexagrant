# Memory Index

- [ui-audit-metrics-sources](ui-audit-metrics-sources.md) — UI metric sources audit: G0 seed hardcoding, Başarı Oranı case bug, Evaluator Lens label missing
- [e11-2-feedback-validation](e11-2-feedback-validation.md) — E11.2 Feedback & Triage System validation results and known status

- [fabrika-playwright-dogfood-recipe](fabrika-playwright-dogfood-recipe.md) — Fabrika'da düşman-kullanıcı testi için çalışan reçetem — Playwright'ı test değil düz script olarak koş, sunucu eyleminin POST gövdesini yakala; "hiçbir şey olmuyor" şikâyetinin kök nedeni orada

- [fabrika-board-cards-are-not-db-rows](fabrika-board-cards-are-not-db-rows.md) — Fabrika pipeline panosunda gördüğün kart sayısı DB satır sayısı değil — bellek içi mağaza koşulsuz yazıyor; dogfood'da her ekran sayısını SQL ile karşılaştır

- [fabrika-blame-e2e-failure-without-stashing](fabrika-blame-e2e-failure-without-stashing.md) — Ortak ağaçta stash edemediğinde bir e2e hatasının senin olup olmadığını kanıtlama — kendi bileşeninin BULUNMADIĞI bir sayfada aynı hatayı say

- [fabrika-mint-a-session-cookie-to-test-unreachable-states](fabrika-mint-a-session-cookie-to-test-unreachable-states.md) — Fabrika'da adsız/rolsüz oturum credentials girişiyle ÜRETİLEMEZ — session çerezini uygulamanın kendi AUTH_SECRET'ıyla üretip gerçek tarayıcıya koy, giriş koduna dokunma

- [fabrika-fabricated-identity-fix-pattern](fabrika-fabricated-identity-fix-pattern.md) — Fabrika'da uydurma kişi adı kusurunun yerleşik düzeltme deseni — ApprovalActor/userId, displayUserName zinciri ve tablo açmak yerine eksik alanı adıyla bildirme
- [fabrika-unreachable-server-action-probe](fabrika-unreachable-server-action-probe.md) — Fabrika'da bir Next server action'ın gerçekten çağrılabilir olup olmadığını ölç — istemci import etmiş olması yetmez, .next manifest + gerçek POST ile yokla

- [fabrika-app-shell-carries-its-own-fake-data](fabrika-app-shell-carries-its-own-fake-data.md) — Bir sayfadaki uydurma veriyi temizlemek yetmez — Fabrika'da app shell (UserMenu) aynı uydurmayı her rotada ayrıca taşıyordu; temizlikten SONRA ekran görüntüsü al
- [fabrika-source-guard-tests-must-strip-comments](fabrika-source-guard-tests-must-strip-comments.md) — Uydurma dizgiyi arayan kaynak-koruma testi yorumları ayıklamalı — Fabrika'da düzeltilen dosya sildiği metni yorumda alıntılıyor, aksi halde kendi düzeltmen testi kırar
- [fabrika-use-server-exports-must-be-async](fabrika-use-server-exports-must-be-async.md) — Fabrika'da 'use server' modülünün HER export'u async fonksiyon olmalı — hata sınıfı/tip/sabit oraya konulamaz, ayrı bir lib dosyasına al

- [fabrika-public-figure-audit-procedure](fabrika-public-figure-audit-procedure.md) — Herkese açık bir sayfadaki rakam denetiminde "bağla ya da çıkar" pratikte HEP "çıkar"dır — Evidence kiracıya özel+RLS, public sayfanın tenant'ı yok; önce DB'de ölç, çünkü rakam kaynaksız değil ÇELİŞİK çıkabilir

- [fabrika-threshold-rate-tile-is-not-the-export-success-rate](fabrika-threshold-rate-tile-is-not-the-export-success-rate.md) — Fabrika panosunda "Eşik Üstü Oranı" kutucuğunun paydası GÖNDERİLEN TEKLİFLER, dışa aktarımdaki "Başarı Oranı"nınki FIRSAT SAYISI — iki farklı sayı, kart metinleri bunları sürekli karıştırıyor

- [fabrika-empty-tenant-audit-needs-module-and-plan-rows](fabrika-empty-tenant-audit-needs-module-and-plan-rows.md) — "Kaydı olmayan kullanıcıyla gez" denen uydurma-veri denetimi Fabrika'da doğrudan yapılamaz — boş kiracı her sayfada modül/plan kapısına takılır; geçici ModuleState + Subscription satırı aç, gez, birebir sil

- [fabrika-first-matching-element-is-the-hidden-mobile-one](fabrika-first-matching-element-is-the-hidden-mobile-one.md) — Fabrika app shell mounts UserMenu twice (mobile md:hidden FIRST, desktop second) — a Playwright .first() resolves to the invisible mobile copy and click times out
- [fabrika-negative-only-assertions-pass-on-a-screen-that-never-opened](fabrika-negative-only-assertions-pass-on-a-screen-that-never-opened.md) — An anti-fabrication e2e block built only from not.toContain() also passes when the panel never opened — always add one positive assertion that the surface is really on screen

- [fabrika-withholding-rate-validation-logic-duplicate](fabrika-withholding-rate-validation-logic-duplicate.md) — Withholding rate validation happens in two places separately (withholdingRateLabel + generateUblTrXml guard) — consolidate into single helper to prevent consistency drift

- [fabrika-admin-shell-compliance-badges-were-fiction](fabrika-admin-shell-compliance-badges-were-fiction.md) — Fabrika admin layout carried three hardcoded "RLS enforced" badges that contradicted the measured reality (BYPASSRLS role) — grep the app shell for compliance-sounding UI text, not just data-fake screens

- [fabrika-evidence-audit-duplicates-and-drift](fabrika-evidence-audit-duplicates-and-drift.md) — Fabrika kanıt-disiplini (CLAUDE.md kural 7) taraması bir dosyada bitmez — aynı sahte iddia başka dosyada kopyalanmış olabilir, ve hardcoded "config facts" da zamanla koddan sapabilir

- [fabrika-payment-taken-no-invoice-is-silent](fabrika-payment-taken-no-invoice-is-silent.md) — Fabrika'da ödeme alınıp fatura kesilemediğinde kullanıcıya HİÇBİR ŞEY söylenmiyor — faturalama ekranı "henüz fatura düzenlenmedi" diyor; TenantBillingIdentity'ye yazan hiçbir kod yok
- [fabrika-text-inventory-must-hunt-missing-messages](fabrika-text-inventory-must-hunt-missing-messages.md) — Kullanıcı-metni envanterinde asıl bulgu "kötü metin" değil "hiç metin olmayan yol"dur — ve aynı görev-ID'li eski rapor bayat olabilir, iddialarını koda karşı doğrula

- [fabrika-ignored-result-claim-needs-a-destination-trace](fabrika-ignored-result-claim-needs-a-destination-trace.md) — "Dönüş değeri kullanılmıyor" iddiasını atama arayarak kurma — atanmış olabilir ama varış noktası kullanıcı değil bir webhook gövdesi olabilir; sinyali gideceği yere kadar izle

- [fabrika-guard-test-scan-reach-is-the-first-thing-to-audit](fabrika-guard-test-scan-reach-is-the-first-thing-to-audit.md) — Yeşil bir kaynak-koruma testi ürün hakkında değil, testin TARAMA ERİŞİMİ hakkında kanıttır — büyük/küçük harf, uzantı filtresi ve kök listesi üçünü de ölç

- [fabrika-demo-seat-address-is-a-map-key](fabrika-demo-seat-address-is-a-map-key.md) — Fabrika'da giriş sayfasındaki demo adresini değiştirmek görünen bir metin değil — DEMO_PROFILES'ın ANAHTARI; eşleşme kaçarsa giriş yine başarılı olur ve sessizce jenerik kuruluşa düşer, kanıt tenant.name'dir
- [fabrika-prove-a-red-gate-is-not-yours-by-reverting-only-your-files](fabrika-prove-a-red-gate-is-not-yours-by-reverting-only-your-files.md) — Paylaşılan ağaçta kırmızı bir kapının senin olmadığını KANITLAMANIN yolu — stash değil, yalnız KENDİ dosyalarını HEAD'e döndürüp aynı testleri tekrar koşmak

- [fabrika-efatura-support-surface-already-clean-2026-09-10](fabrika-efatura-support-surface-already-clean-2026-09-10.md) — 2026-09-10 itibarıyla e-Fatura'nın destek yüzeyi (env şeması, hata metinleri, runbook) zaten tamam — bu kart yeniden gelirse sıfırdan başlama, önce koda karşı hızlı yeniden-doğrula
- [fabrika-piping-a-cli-to-head-masks-its-exit-code](fabrika-piping-a-cli-to-head-masks-its-exit-code.md) — $? sonrası bir CLI'ın çıkış kodunu ölçerken çıktısını head/tail'e borulamak $?'yi borunun SON komutuna (head) maskeler — ayrı dosyaya yönlendir ya da PIPESTATUS kullan

- [fabrika-measure-a-transaction-boundary-at-the-wire](fabrika-measure-a-transaction-boundary-at-the-wire.md) — Bir fonksiyonun kaç SQL transaction açtığını pg_stat_database.xact_commit ile ÖLÇEMEZSİN (aralıklı flush, hep 0 okur) — pg.Client.prototype.query'yi yamayıp BEGIN/COMMIT'i tel seviyesinde kaydet
