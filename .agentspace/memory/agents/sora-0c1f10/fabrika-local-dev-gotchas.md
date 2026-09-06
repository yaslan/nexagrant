---
name: fabrika-local-dev-gotchas
description: Fabrika reposunda yerel doğrulama tuzakları — Postgres/docker yok, dev server 3000'de zaten açık, demo credentials ile giriş, çerez banner'ı tıklamayı bloke ediyor.
metadata:
  type: project
updatedAt: 2026-09-06
---

Bu makinede (macbook, /Users/macbook/AgentSpace/fabrika) UI doğrulaması yaparken:

1. **Postgres ÇALIŞMIYOR** ve `docker`/`psql` CLI'ları PATH'te yok. `DATABASE_URL` localhost:5432'yi
   gösterir ama bağlantı reddedilir. Bu yüzden seed/`prisma migrate` gerektiren görevler bu makinede
   BİTİRİLEMEZ — "sorgu bozuk" gibi görünen hatalar aslında ortam kaynaklıdır (cora'nın Exit 129'u buydu).
   Sayfaların çoğu try/catch ile in-memory store'a düşüp yine de render eder; "sayfa açıldı" ≠ "veri doğru".
2. **Dev server genelde zaten :3000'de açıktır** (`pnpm dev` ikinci kez çalıştırılırsa "Another next dev
   server is already running" ile ölür). Önce localhost:3000'i dene.
3. **Giriş:** `/tr/giris` → demo credentials provider; şifre serbest, e-posta yeterli.
   `admin@yasinaslan.com.tr` = TENANT_OWNER + platform admin (KPI paneli `evaluate_gates` ister).
   Panel URL kalıbı: `/{locale}/{workspace}/dashboard`, workspace slug'ı `default`.
4. **Çerez banner'ı ilk tıklamayı bloke eder** ("başka bir öğe var (üstte overlay?)" hatası).
   Önce `button[aria-label="Tümünü Kabul Et"]` tıkla, sonra forma dokun.
5. `pnpm typecheck` repo genelinde başka ajanların commit edilmemiş dosyalarından ötürü kırmızı olabilir;
   yalnız kendi dosyalarını temizle, başkasının açık çalışmasına (ör. `src/lib/billing.ts`) dokunma.

İlgili: [[fabrika-beta-onboarding-e11]]
