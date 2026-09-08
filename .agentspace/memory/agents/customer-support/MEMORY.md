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
