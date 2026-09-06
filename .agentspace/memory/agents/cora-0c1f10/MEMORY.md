# Memory Index

- [inngest-setup-complete](inngest-setup.md) — Inngest job orchestration is set up with 5 scheduled jobs and strong typing; ready for cloud credentials
- [i18n-system](i18n-system.md) — Fabrika's i18n setup with next-intl, message structure, audit tool (scripts/i18n-check.ts) gates PRs
- [k1-adapter-pattern](k1-adapter-pattern.md) — K1 adapter implementation: pagination, enrichment, schema drift via hash, HTML parsing patterns, error resilience

- [additive-table-extension-pattern](additive-table-extension-pattern.md) — When a spec asks for a table that already exists in another shape, extend it with a discriminator column instead of rewriting — pattern used for Fabrika's Evaluation table
- [seed-idempotency-pattern](seed-idempotency-pattern.md) — Fabrika seed'inde idempotency için deterministik demo-* id + upsert deseni ve seed/RLS sıralaması

- [agentspace-browser-login-without-typing](agentspace-browser-login-without-typing.md) — agentspace_browser'ın type eylemi onay round-trip'inde 504 veriyor — Fabrika'ya girişi şifresiz demo butonuna tıklayarak yap

- [fabrika-prisma-generate-required-after-schema-edit](fabrika-prisma-generate-required-after-schema-edit.md) — Fabrika'da şemaya alan eklemek yetmez — pnpm prisma generate + dev sunucu restart şart; typecheck bu hatayı ASLA yakalamaz

- [labelled-dataset-without-new-tables](labelled-dataset-without-new-tables.md) — Etiketli bir değerlendirme/kalibrasyon veri seti için yeni tablo açma — Opportunity + Proposal.outcome + GateDecision.inputs zinciri zaten tahmin/gerçek/özellik taşıyor

- [m6-evaluator-scoring-model](m6-evaluator-scoring-model.md) — M6 scoring: 4 criteria (1–5 scale), 70% consensus, ESR normalization (0–15 → 1–5)
