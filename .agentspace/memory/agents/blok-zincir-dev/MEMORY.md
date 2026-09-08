# Memory Index

- [fabrika-idempotent-covers-the-db-not-the-mailbox](fabrika-idempotent-covers-the-db-not-the-mailbox.md) — Bir betik "running twice is safe" diyorsa bu genelde yalnız DB upsert'leri içindir — mail/ödeme/webhook gibi dış yan etkiler ayrıca korunmalı; Fabrika'da esr-calibration --send tam olarak böyleydi
