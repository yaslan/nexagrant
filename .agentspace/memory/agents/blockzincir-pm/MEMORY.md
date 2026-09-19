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

- [fabrika-react19-render-purity-fixes](fabrika-react19-render-purity-fixes.md) — React 19'un set-state-in-effect ve purity lint hatalarını istisna yazmadan çözen üç desen — Fabrika'da kanıtlanmış

- [price-lock-validation-complete](price-lock-validation-done.md) — TASK-MTR882HVZ8BG7 fiyat kilidi doğrulaması tamamlandı — koda dokunmamış, UI kareleri ve test kanıtı yeterli

- [fabrika-stripe-renewal-price-mechanics](fabrika-stripe-renewal-price-mechanics.md) — Fabrika'da bir Stripe aboneliğinin yenileme tutarını kim/ne zaman belirliyor — checkout'ta bir kez sabitlenir, sonrası Stripe'ın kendi motoru; fiyat kilidi mutlak tutarı değil yüzdeyi dondurur

- [fabrika-stale-board-status-check-git-first](fabrika-stale-board-status-check-git-first.md) — Görev tekrar önüne gelirse önce git log + önceki -N.md raporunu kontrol et; board in_progress diyor diye kör kör yeniden iş yapma

- [fabrika-billing-panel-copy-has-three-surfaces](fabrika-billing-panel-copy-has-three-surfaces.md) — messages/*.json'da plan kartı metni pricing/admin/settings olmak üzere üç bağımsız yerde elle yazılı; biri düzeltilse diğerleri sessizce eski kalabilir
- [fabrika-seed-modulecatalog-requires-is-stale-copy](fabrika-seed-modulecatalog-requires-is-stale-copy.md) — prisma/seed.ts'teki ModuleCatalog.requires alanı gerçek manifestodan bağımsız elle yazılmış bir kopya — gate mantığı hep manifestoyu okur

- [fabrika-m11-partb-local-verification-recipe](fabrika-m11-partb-local-verification-recipe.md) — M11 Part B ekranını yerelde gerçek tarayıcıyla açma reçetesi — doğru URL, oturum mint'i ve iki kapı (plan=ultra + ModuleState=ON); demo login ile ULAŞILAMAZ
- [fabrika-no-session-provider-client-identity](fabrika-no-session-provider-client-identity.md) — Fabrika'da hiçbir yerde <SessionProvider> yok — bir client component'te kullanıcı kimliği lazımsa useOptionalSession() tek başına hep null döner; /api/auth/session'ı fetch et

- [fabrika-idempotency-proof-needs-per-table-counts](fabrika-idempotency-proof-needs-per-table-counts.md) — Bir çekicinin idempotan olduğunu kanıtlarken tabloları TEK TEK say — normalize tablolar sabit dururken audit tablosu (RawFetch) sızabilir

- [fabrika-identity-fallback-doctrine](fabrika-identity-fallback-doctrine.md) — Fabrika'da bir kimlik (ad/kuruluş/imza) eksikse ne yazılır — deponun yerleşik üç kademeli kuralı ve onu uygulayan mevcut yardımcılar
- [fabrika-stash-baseline-can-lie](fabrika-stash-baseline-can-lie.md) — Stash ile "benden mi?" ölçerken baseline iki şekilde YALAN söyler — stash hiç olmamıştır (tırnaksız pathspec) ya da dev server yarım derlenmiştir; ikisini de doğrula
- [fabrika-verify-the-card-recheck-not-just-the-old-report](fabrika-verify-the-card-recheck-not-just-the-old-report.md) — Bir kart "önceki rapor X dedi ama bugünkü grep temiz buldu" diyorsa, ŞÜPHELİ olan eski rapor değil kartın kendi yeniden-ölçümü olabilir — ikisini de kendin koştur

- [fabrika-a-template-may-carry-structure-not-content](fabrika-a-template-may-carry-structure-not-content.md) — Fabrika'da bir "varsayılan şablon" sabiti ne taşıyabilir — resmî iskelet (başlık/limit) EVET, yazar ve metin HAYIR; uydurma kimlik avında content alanlarına da bak

- [fabrika-sibling-task-can-close-your-cards-gap](fabrika-sibling-task-can-close-your-cards-gap.md) — Kart "X ve Y dosyasında da bulundu" diyorsa git log'u o dosya yollarıyla ara, kendi task id'inle değil — başka bir kart aynı gün onları kapatmış olabilir
- [dual-approval-means-two-people](dual-approval-means-two-people.md) — Fabrika'da "çift onay" kuralını uygulama kontrolüyle değil iki unique index'le kur — ve gönderimi sign-off saymayarak akışı iki kişilik tut
- [fabrika-approvals-screen-is-a-stub](fabrika-approvals-screen-is-a-stub.md) — Fabrika /approvals ekranı gerçek ApprovalRequest satırlarını listeliyor ama Onayla/Reddet düğmeleri hiçbir şey yazmayan stub'lara bağlı — ApprovalRequest'i "kullanımda" sanma
- [fabrika-prisma-migrations-are-hand-applied](fabrika-prisma-migrations-are-hand-applied.md) — Fabrika'da şema değişikliği reçetesi — klasörlü migration + prisma migrate deploy + pnpm db:rls; migrate dev KULLANMA, RLS'i hem rls.sql'e hem migration'a yaz
- [fabrika-server-email-locale-pattern](fabrika-server-email-locale-pattern.md) — Sunucu e-postaları next-intl kullanamaz — emsal invite-email.ts'in COPY={tr,en} tablosu; alerts-daily.ts hâlâ sabit İngilizce (bilinen, düzeltilmemiş gap)

- [calendar-connection-token-gate-decision](calendar-connection-token-gate-decision.md) — CalendarConnection token şifreleme kararı KAPANDI — B (ertele+kilitle), makine gate'i src/lib/db.ts'te canlı; M9 OAuth PR'ı bunu bilmeden ilerlemesin

- [fabrika-no-prod-db-from-this-env](fabrika-no-prod-db-from-this-env.md) — Bu ajan ortamından Fabrika üretim veritabanına erişim yok — DATABASE_URL yerel/dev'e işaret ediyor; "canlı DB'ye sor" diyen kartlarda bunu açıkça işaretle
- [fabrika-tcmb-fx-invoice-vuk-rule](fabrika-tcmb-fx-invoice-vuk-rule.md) — Fabrika'da yabancı para faturası için VUK kuralı ne istiyor (TL karşılığı, hangi kur, hangi tarih) ve karar ADR-0002'de bekliyor

- [fabrika-cross-border-transfers-have-no-signed-dpa](fabrika-cross-border-transfers-have-no-signed-dpa.md) — Fabrika 7 yurt dışı alıcıya (Anthropic, OpenAI, Google, Microsoft, Stripe, Resend, Cloudflare) kişisel veri gönderiyor ama hiçbiri için imzalı SCC/DPA eki repoda yok — GDPR md.30 envanterinin en büyük tekil boşluğu

- [fabrika-invoice-export-errors-leak-raw-json](fabrika-invoice-export-errors-leak-raw-json.md) — Fatura indirme linkleri (BillingClient.tsx) düz <a href> — export route'un 7 farklı hata JSON'u (env var adları dahil) kullanıcıya ham İngilizce/JSON olarak düşüyor, hiç Türkçeye çevrilmiyor

- [fabrika-board-audit-report-may-be-misfiled-not-missing](fabrika-board-audit-report-may-be-misfiled-not-missing.md) — Before calling a done card "KANIT YOK", content-grep the task ID across ALL agent-results files, not just filename-match — verification/DOĞRULAMA cards and some closing reports are filed under a DIFFERENT ID (the original card they verify, an ADR name, or a pre-convention name).
- [fabrika-i18n-card-closed-with-zero-report-defect-survived](fabrika-i18n-card-closed-with-zero-report-defect-survived.md) — Concrete confirmed case of a "done" card with zero evidence whose bug survived until an unrelated audit found it — proof that report-existence checks catch real fake closures, not just theoretical ones.

- [fabrika-tenant-bypass-audit-baseline-drifts](fabrika-tenant-bypass-audit-baseline-drifts.md) — withTenant sarmalayıcısız prisma.* çağrılarının sayısı (98/101) sabit bir baseline değil — prisma/rls.sql'deki tenant-model kümesi büyüyor (43→48), yeniden ölçüm yapmadan eski raporun sayısını kullanma

- [fabrika-my-own-bucket-claim-was-wrong-per-line](fabrika-my-own-bucket-claim-was-wrong-per-line.md) — Envanterimde "bu kovadaki her satırda tenantId zaten where'de" dediğim toplu iddia bir satırda YANLIŞTI — kovaya alırken satır satır doğrula, dilimi uygulayan ajan (ben bile olsam) premise'i tekrar ölçmeli
