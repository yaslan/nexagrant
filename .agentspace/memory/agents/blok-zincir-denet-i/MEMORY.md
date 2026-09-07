# QA-EN Hafızası

- [RLS Flow Complete](fabrika-rls-flow-complete.md) — Kiracı izolasyonu ölçümü açıldı — pnpm db:rls-role + pnpm db:rls + test 4/4 yeşil
- [G0 Puanlama Fix'lendi](g0-scoring-fixed.md) — G0 hiç hesalanmıyor bug fix'lendi, fırsat oluştur + gate'de çağrılıyor

- [fabrika-assert-both-config-branches](fabrika-assert-both-config-branches.md) — Davranış bir go-live ayarına bağlıysa testi tek ortama sabitleme — iki dalı da doğrula; uydurma cevap her iki dalı da düşürür, test hiçbir ortamda kırılmaz
- [G0 Production Hook](g0-scoring-production-hooked.md) — G0 puanı kanonik scoreG0/decideG0 ile production'da hesalanıyor, rescoreOpportunityG0 hook'u bağlanmış, 28 test yeşil

- [fabrika-schema-done-means-information-schema](fabrika-schema-done-means-information-schema.md) — Bir şema işi "bitti" raporlandıysa tablo gerçekten var demek DEĞİL — typecheck de mock'lu test de yalan söyler; information_schema'ya sor
