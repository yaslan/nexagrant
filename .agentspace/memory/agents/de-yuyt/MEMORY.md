# Memory Index

- [fabrika-alert-console-has-a-silent-300-row-cap](fabrika-alert-console-has-a-silent-300-row-cap.md) — admin/alerts MAX_ROWS=300 ile kesiyor, sayfalama yok ve "Toplam uyarı" kutusu DB sayısını değil yüklenen diziyi gösteriyor — kapak aşılınca sessizce yalan söyler
- [fabrika-recordalert-has-two-writer-paths](fabrika-recordalert-has-two-writer-paths.md) — recordAlert() dedup sözleşmesini iki yol atlıyor (k1-daily-calls, adapters/alerts) — çok satırlı prisma.systemAlert\n.create çağrısı tek satırlık grep'e yakalanmaz
- [fabrika-systemalert-is-outside-tenant-cleanup](fabrika-systemalert-is-outside-tenant-cleanup.md) — SystemAlert'in tenantId kolonu YOK — e2e afterAll'ların "where tenantId" temizlik deseni ona ulaşamaz, her koşu alarm enkazı bırakır
