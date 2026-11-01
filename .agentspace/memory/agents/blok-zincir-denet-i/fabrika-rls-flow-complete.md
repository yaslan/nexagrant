---
name: fabrika-rls-flow-complete
description: RLS setup tamamlandı — pnpm db:rls-role + pnpm db:rls + test yeşil
metadata:
  type: project
  updatedAt: 2026-09-07
---

## Durum

Fabrika'nın Row Level Security (kiracı izolasyonu) ölçüm sistemi **tamamlandı** (2026-09-07).

**Yapılan:**
1. `pnpm db:rls-role` → RLS-subject role (`fabrika_app`, NOBYPASSRLS) oluşturulur
2. `pnpm db:rls` → 39 kiracıya özel tabloya tenant_isolation politikası uygulanır (1 → 42)
3. `pnpm test tests/rls.spec.ts` → 4/4 geçer (kiracı izolasyonu doğrulanır)
4. `pnpm rls:verify` → tüm 39 tabloda izolasyon aktif (yeşil)

## Kullanım

Yeni geliştirici:
```bash
pnpm db:rls-role     # Rolü oluştur / re-assert
pnpm db:rls          # Politikaları uygula
pnpm test tests/rls.spec.ts  # Doğrula: 4/4
pnpm rls:verify      # Ölçü: yeşil
```

Hiçbir adım önceden beklenmiyor. Yerel DB ilk kez setup'ı çalıştırsa bile sistem hazır.

## Mimarı Notlar

- Beyan (`pnpm rls:check`) vs. Davranış (`pnpm rls:verify`): Script şöyle tasarlandı — beyan yeşilse, davranış da yeşildir. Test suite 4 senaryoyu doğrular (Tenant A ↔ B, cross-tenant read, write rejection).
- `ALTER DEFAULT PRIVILEGES` idempotent — iki kez koş, hata yok.
- Production: `pnpm db:rls` tek sefere; yeni tablo migration'ları otomatik RLS politikası alır.

## İlgili

- [[fabrika-rls-check-is-declaration-not-behaviour]](fabrika-rls-check-is-declaration-not-behaviour.md) — eski durum: beyan yeşil, davranış kırmızı
- TASK-MTRGJ80LV3R7I — tamamlama raporu: docs/agent-results/TASK-MTRGJ80LV3R7I-blok-zincir-denet-i.md

