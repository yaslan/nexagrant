# PM-EN (blockzincir-pm) Hafıza İndeksi

- [E11.4 Pricing Validation](e11-4-pricing-valid.md) — Kapatıldı, fiyat kuralları ✓
- [E11.3 ESR Calibration Status](e11-3-calibration-status.md) — Fixture 80%, anket 2026-09-20 bekleniyor

- [board-card-verification-s8](board-card-verification.md) — Two stale in_progress cards verified and closed — Docker/Postgres RLS, E10.2 a11y/i18n

- [board-card-verification-s9-s10](board-card-verification-s9-s10.md) — S9-S10 review'daki 6 kart doğrulandı — 4 gerçekten bitmiş (done), 2'sinde raporun DoD iddiası kodla çelişiyordu (in_progress'e geri alındı)

- [P1-5 .ics RFC 5545 fixed](p1-5-ics-rfc5545-fixed.md) — generateIcsContent düzeltildi+testli; caller-side Markdown/süre/deterministik-UID hâlâ açık

- [fabrika-blame-the-e2e-failure-with-a-stash](fabrika-blame-the-e2e-failure-with-a-stash.md) — Paralel ajan dalgasında bir e2e hatasının senin değişikliğinden mi geldiğini 40 saniyede kanıtlama — yalnız KENDİ dosyalarını git stash edip testi tekrar koş
- [fabrika-server-action-replay-proves-a-gate](fabrika-server-action-replay-proves-a-gate.md) — Bir yetki kapısının UI'da değil gerçekten sunucuda durduğunu kanıtlama yöntemi — Playwright ile next-action POST'unu yakala, kapıyı kapat, aynı POST'u replay et

- [fabrika-prisma-findmany-any-inference-gap](fabrika-prisma-findmany-any-inference-gap.md) — Fabrika'da prisma.<model>.findMany() TÜM modeller için `any[]` dönebiliyor — TopicMatch'e özgü değil, repo genelinde bilinen bir gap; scripts/rescore-g0.ts'te de elle-tip ile atlatılmış

- [fabrika-engine-vs-caller-product-rules](fabrika-engine-vs-caller-product-rules.md) — PM kararı — GÜVENLİK kuralı motora, ÜRÜN kuralı çağırana; Fabrika kapı motorunda tenantId motora gömüldü ama deletedAt (arşiv) bilerek çağıranda bırakıldı

- [fabrika-server-side-price-source-decision](fabrika-server-side-price-source-decision.md) — "Aktif indirim kademesi nereden gelmeli" sorusunun Fabrika'daki cevabı: DB abone sayısı seed verisiyle kirli, env değişkeni seçildi — ve yıllık fiyatta indirim bir kez uygulanır

- [fabrika-capability-parity-not-price-parity](fabrika-capability-parity-not-price-parity.md) — Fabrika'da EUR 5 plan → USD 3 plan geçişinin eşleme kuralı — fiyat eşliği imkânsızdı, yetenek eşliği seçildi ve fazla kapasite seatsExtra'ya taşındı
- [fabrika-plan-id-rename-blast-radius](fabrika-plan-id-rename-blast-radius.md) — Fabrika'da bir plan id'sini değiştirmek 5 dosyayı değil ~20'yi kırar — derleyicinin bulduğu yerler ve bulamadığı yerler
- [fabrika-stash-pop-can-silently-fail](fabrika-stash-pop-can-silently-fail.md) — git stash pop bir e2e koşusunun ürettiği artefakt dosya yüzünden sessizce başarısız olabilir — çalışma ağacı temiz görünür, işin hâlâ stash'tedir
