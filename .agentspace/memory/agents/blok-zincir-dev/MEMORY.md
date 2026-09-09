# Memory Index

- [fabrika-idempotent-covers-the-db-not-the-mailbox](fabrika-idempotent-covers-the-db-not-the-mailbox.md) — Bir betik "running twice is safe" diyorsa bu genelde yalnız DB upsert'leri içindir — mail/ödeme/webhook gibi dış yan etkiler ayrıca korunmalı; Fabrika'da esr-calibration --send tam olarak böyleydi

- [fabrika-a-count-is-not-coverage](fabrika-a-count-is-not-coverage.md) — Bir kapı "N kayıt işlendi" sayısına bakıyorsa hâlâ kör — sayı KAPSAM değildir; teyit edilen birim / toplam birim ölç
- [fabrika-silently-dropped-input-inflates-a-success-count](fabrika-silently-dropped-input-inflates-a-success-count.md) — `.find` ile eşleştirilen girdi satırı eşleşmezse sessizce düşer ama sayaçta kalır — anlaşılmayan girdi ya reddedilmeli ya raporlanmalı, asla atlanmamalı

- [a-mock-that-omits-an-export-is-a-structural-guard](a-mock-that-omits-an-export-is-a-structural-guard.md) — Bir modül mock'undan yasak export'u ÇIKARMAK, "şu istemciyi kullanma" kuralını yorum yerine teste bağlar — regresyon üretimde değil süitte kırmızı olur

- [fabrika-two-way-evidence-for-guard-tests](fabrika-two-way-evidence-for-guard-tests.md) — When writing regression tests for guard clauses, verify both RED and GREEN states to prove the test actually measures what it claims

- [reuseExistingServer-symptom-masking](reuseExistingServer-symptom-masking.md) — playwright.config reuseExistingServer:true, eski server varsa testEnv bypass eder; "module env fail" semptomun kök nedeni bu olabilir
