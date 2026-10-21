# CLAUDE.md — Fabrika çalışma kuralları

Sen bu depoda çalışan Claude Code'sun. Önce `PROJECT.md`'yi oku; sonra görevle ilgili `docs/` dosyasını. Bu dosya kısa tutulur: kurallar, komutlar, tuzaklar.

## Proje kimliği
- Ürün: **Fabrika** — Avrupa fonları için çok kiracılı proje pipeline SaaS'ı (Next.js 15 + TS + Prisma + Postgres/pgvector; Python worker).
- Diller: UI Türkçe (varsayılan) + İngilizce (`next-intl`). Kod, şema, commit: İngilizce.
- Tek doğruluk kaynağı: `PROJECT.md` → `docs/*.md`. Çelişki görürsen `docs/ROADMAP.md` "Açık kararlar"a yaz, devam etmeden sor.

## Komutlar
```bash
pnpm install
pnpm dev                 # Next.js :3000
pnpm db:setup           # boş DB'yi kurar (CI ile aynı sıra, scripts/db-setup.sh): generate → ensure_rls → db push → db:rls-role → db:rls → apply-migrations → db:rls → seed; tekrar koşulabilir
                         # `pnpm db:migrate` / `prisma migrate deploy|dev|reset` KULLANMA: prisma/migrations bir Migrate geçmişi değil,
                         # prisma.config.ts bunları hiçbir şey uygulamadan durdurur. Canlı: docs/RELEASE_CHECKLIST.md §3.1
pnpm db:seed             # prisma/seed.ts (planlar, modül kataloğu, demo kiracı)
pnpm db:rls              # prisma/rls.sql uygula (psql gerektirmez)
pnpm test                # vitest
pnpm test:e2e            # playwright (baska port/host: E2E_PORT=3100 veya E2E_BASE_URL; spec'ler cerezi `baseURL` fixture'ina yazar, sabit localhost:3000 yazma)
pnpm lint && pnpm typecheck
pnpm gate                # db:generate + lint + typecheck + test + i18n:check + rls:check + rls:bypass-check + rls:verify --require-db + db:rls-role + e2e + alerts:check (kapinin tamami)
                         # Aynı veritabanına iki gate: migration-owner-chain.live advisory lock ile sıra bekler (~30 sn);
                         # e2e için ikinci worktree'de E2E_PORT farklı olmalı.
pnpm rls:verify          # DB gercekten kiraci izolasyonu uyguluyor mu (canli olcum)
pnpm alerts:check        # acik SystemAlert satirlari silinmis kiracilari mi gosteriyor (oksuz alarm kapisi)
pnpm hooks:install       # githooks/ dizinini etkinlestir (pre-commit + pre-push)
pnpm worker:dev          # workers/ (python -m uvicorn app:app --reload)
pnpm jobs:k1             # K1 çağrı toplama işini elle tetikle
pnpm jobs:k2 -- --month 2026-09
```

### Worktree'de gate (izole DB)
Pre-push kancası tam `pnpm gate` koşar; gate'in DB'si checkout'un kendi `.env`'inden gelir. Worktree'de ortak `fabrika` DB'sine (5433) ve 3000 portuna bağlanma; `--no-verify` yok.
```bash
P=55xx                                          # boş bir port seç (lsof -nP -iTCP:$P -sTCP:LISTEN boş dönmeli)
docker run -d --name <is>-pg -e POSTGRES_DB=fabrika -e POSTGRES_USER=fabrika -e POSTGRES_PASSWORD=fabrika \
  -p 127.0.0.1:$P:5432 pgvector/pgvector:pg16
cp .env.example .env && perl -pi -e "s#\@localhost:5433/#\@localhost:$P/#g" .env   # perl: mac ve Linux'ta aynı (sed -i '' yalnız BSD)
perl -pi -e "s|^AUTH_SECRET=\$|AUTH_SECRET=$(openssl rand -base64 32)|" .env
pnpm install --frozen-lockfile && pnpm db:setup  # db:rls-role, DATABASE_URL_RLS_TEST'i bu .env'e ekler
E2E_PORT=<boş port> git push -u origin <dal>     # kanca "→ veritabanı: localhost:$P/fabrika" yazar
docker rm -f <is>-pg                            # iş bitince
```

## Mimari kurallar (ihlal etme)
1. **Çok kiracılılık:** Her iş tablosunda `tenantId` zorunlu; sorgular `withTenant(prisma, tenantId)` sarmalayıcısından geçer; RLS politikası olmayan tablo PR'ı geçmez.
2. **Modül sistemi:** Her modül `src/modules/<mX>/manifest.ts` (`id, name, version, requires[], recommends[], planTiers[], addOnSku?, routes[], nav[], permissions[], tables[]`) ile kayıtlıdır. Modül kodu başka modülü doğrudan import etmez; `src/core/events` (olay veri yolu) ve `src/core/contracts` (tipli arayüzler) üzerinden konuşur.
3. **Modül durumu:** `ModuleState` tablosu (tenant × module → `off|dev|pilot|on`). Rota koruması `requireModule('M8')` middleware'iyle; UI'da `useModuleEnabled('M8')`. Bağımlılık ve kademeli kapanış mantığı **yalnızca** `src/core/modules/state-machine.ts`'te; UI bu fonksiyonu çağırır, kopyalamaz.
4. **Yetkilendirme:** `PlanEntitlement` + `ModuleState` + rol → `can(user, action, resource)` (`src/lib/authz`). Modül `on` olsa da plan kapsamı dışındaysa kullanılamaz.
5. **YZ:** Tüm LLM çağrıları **`src/lib/llm.ts`** üzerinden; her çağrı `AiUsageLog` yazar (tenant, user, module, purpose, model, tokens, credits, promptHash) ve kredi düşer. Kredi formülü tek bir yerdedir (`creditsForUsage`); ikinci bir kopya çıkarma. İkinci bir adaptör dosyası açma — bir zamanlar `src/lib/ai/llm.ts` vardı ve aynı çağrıyı 7 kat farklı fiyatlıyordu (TASK-MTSXGXBCJ007W). Kullanıcı verisini eğitim için göndermek yok. Prompt'lar dosyada: `src/lib/ai/prompts/<modül>/<ad>.<locale>.ts`, tek yükleyici `renderPrompt(id, vars, locale)` (`src/lib/ai/prompts/index.ts`), dil `promptLocale()` ile kullanıcının UI locale'inden; o dilde metin yoksa `en`. Çağrı noktasına prompt metni yazma. Metin değişikliği davranış değişikliğidir: `tests/prompt-snapshots.test.ts` snapshot'ını bilerek güncelle.
6. **Dış veri:** K1/K2 çekiciler idempotent; ham yanıt `RawFetch` tablosuna (veya R2'ye) kaydedilir, sonra normalize edilir. API şeması değişirse (zorunlu alan yok) `SystemAlert` üret, işi kırma.
7. **Kanıt disiplini:** Kullanıcıya gösterilen her istatistik/oran `Evidence` veya `TopicStat` kaydına bağlıdır; kod içine sabit rakam yazma.
8. **i18n:** Kullanıcıya görünen sabit metin yok; `t('...')`. Yeni anahtar iki dile de eklenir.
9. **Para:** Tüm tutarlar `Int` minor unit (cent) + `currency`; hesaplamalar `src/lib/money.ts`.
10. **Tarih/saat:** DB UTC; çağrı son tarihleri `deadlineAt` (UTC) + `deadlineTz` ("Europe/Brussels"); UI kullanıcı saat diliminde gösterir ve Brüksel saatini de yazar.

## Kod stili
- TypeScript strict, `noUncheckedIndexedAccess`. Zod ile giriş doğrulama (API ve server action).
- Server Actions küçük; iş mantığı `src/modules/*/server/` ve `src/core/*/` içinde saf fonksiyonlar → birim test edilebilir.
- Dosya adları kebab-case; React bileşenleri PascalCase; DB alanları camelCase (Prisma), tablolar PascalCase tekil.
- Her yeni tablo: migration + RLS + seed (gerekiyorsa) + `docs/DATA_MODEL.md` güncellemesi aynı PR'da.
- Test: her kapı kuralı, puanlama fonksiyonu ve modül durum makinesi için birim test zorunlu; her modül için en az bir e2e "mutlu yol".

## Yapma
- F&T Portal'a otomatik gönderim ya da portal oturumu taklidi.
- Evaluator Lens çıktısını "resmî puan" gibi sunma; her yerde "iç ön değerlendirme" etiketi.
- Başarı primini "uygun maliyet" olarak modelleme (`docs/BILLING.md`).
- `any`, `// @ts-ignore`, çevre değişkenlerini doğrudan `process.env` ile okuma (`src/lib/env.ts` kullan).

## Görev akışı
1. `docs/ROADMAP.md`'den görevi al; kabul kriterini oku.
2. Plan yaz (kısa), etkilenen dosyaları listele.
3. Kodla + test + `pnpm lint && pnpm typecheck && pnpm test`.
4. `docs/` etkilendiyse güncelle. Commit mesajı: `feat(m8): consortium role matrix` biçiminde (scope = modül/katman id).
5. PR açıklamasında kabul kriterlerini işaretle.

## Yardımcı komutlar
`.claude/commands/` altında: `/new-module`, `/add-table`, `/review-rls`, `/gate-rule`, `/i18n-check`.
