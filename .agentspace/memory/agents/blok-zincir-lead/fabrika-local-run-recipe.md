---
name: fabrika-local-run-recipe
description: Fabrika'yi lokalde ayaga kaldirma tarifi ve acilistaki BILLING_ACTIVE_TIER uyarisinin zararsiz oldugu
metadata:
  type: project
  updatedAt: 2026-09-09
---

Fabrika'yi lokalde calistirmak icin docker-compose'un `fabrika-web` servisine gerek yok:
yalnizca `postgres-vector` container'i ayakta olsun (pgvector/pgvector:pg16, 5432), sonra
`pnpm db:generate && pnpm dev` yeterli. Next.js 16.3.4 + Turbopack, ~260ms'de `Ready`, `/` ve `/tr` HTTP 200.

Acilis logunda cikan `[WARN] BILLING_ACTIVE_TIER is unset; selling at list price with no campaign discount`
bir HATA DEGILDIR — kampanya indirimi tanimlanmadiginda liste fiyatiyla satisi bildiren normal varsayilan.
Bunu "uygulama bozuk" diye raporlama; kampanya istenirse tier kodu (ILK5, SONRAKI10, LANSMAN50, KURUCU40,
GROWTH30, SCALE20, PROMO10) set edilir.

Ilgili: [[fabrika-a-green-gate-may-predate-the-commit-it-closes]]
