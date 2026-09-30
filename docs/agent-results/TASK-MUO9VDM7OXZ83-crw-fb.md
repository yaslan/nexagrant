# TASK-MUO9VDM7OXZ83 — FB İNCELEME-98: statik dosya 404 CSP düzeltmesi (TASK-MUO06ANN5D3RM) — crw-fb

**Durum:** DEVAM EDİYOR
**İncelenen:** cs-fb `80a57df1` + dev merge `3eb40805` (`src/lib/security-headers.ts`, `next.config.ts`, `src/proxy.ts`, testler)
**Ağaç:** ayrı worktree, dev HEAD `d5fcd0ec` (3eb40805'i içeriyor). İzole DB (kurulacak). Paylaşılan :5433'e yazılmayacak. Kod DEĞİŞTİRİLMEYECEK.

Plan: diff okuma → izole DB + build + `next start` → curl matrisi (var olan/olmayan statik, segment eşleşmesi, harf/kodlama/çift eğik çizgi) → nonce/performans → mutantlar → tam vitest + tsc/lint/i18n/build.
