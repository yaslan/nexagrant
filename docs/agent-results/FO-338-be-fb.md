# FO-338 — admin partner-search sayaç sorgusu fonksiyona çıkarıldı; BUG-1 testi onu çağırıyor

**Kart:** TASK-MVYDSU2JD37HL · **Ajan:** be-fb · **Kaynak:** FO-335 Ö-1 · **Dal:** `be-fb/fo338-partner-search-count` (base `origin/dev` @ e297aad1)

**hüküm:** Bitti: Sayım sorgusu `countOpenIngestionAlerts` fonksiyonunda; sayfa ve BUG-1 testi onu çağırıyor; mutant (kaynak `PARTNER_SEARCH_SOURCE`) canlı testi kırıyor, geri alınca yeşil.
**platform:** mac (macOS 27.2, Darwin) — izole Postgres (pgvector:pg16 Docker konteyneri) üzerinde koşuldu. Windows/Linux koşulamadı: test Docker ile izole DB gerektiriyor; kod yolunda platforma bağlı bir şey yok (Prisma sorgusu + sabit string).

## Ne yapıldı
1. `src/modules/m1/server/partner-search/alerts.ts` (yeni): `countOpenIngestionAlerts(db)` — `systemAlert.count({ source: PARTNER_SEARCH_ALERT_SOURCE, resolvedAt: null })`. `db` parametresi `Pick<typeof prisma,'systemAlert'>` tipinde; test aynı fonksiyonu gerçek Prisma istemcisiyle çağırır.
2. `src/app/[locale]/admin/partner-search/page.tsx`: inline sayım yerine `countOpenIngestionAlerts(prisma)`; artık `PARTNER_SEARCH_ALERT_SOURCE` import'una gerek yok.
3. `tests/partner-search-acceptance.live.test.ts`: BUG-1 testi `countOpenIngestionAlerts(prisma)` çağırıyor (eski inline sorgu kaldırıldı). Davranış değişmedi.

Davranış değişikliği yok: sorgu aynı kaynak sabitine ve aynı filtreye bakıyor.

## Kanıt (ham çıktı)
Typecheck (`pnpm typecheck`) → `tsc --noEmit` çıkış 0 (node_modules + `prisma generate` sonrası).

Yeşil (değişiklik hâli), izole DB:
```
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

Mutant (`alerts.ts`: `PARTNER_SEARCH_ALERT_SOURCE` yerine `PARTNER_SEARCH_SOURCE` — eski hatalı kaynak):
```
       × BUG-1: the console figure counts the open ingestion alerts 4ms
 FAIL  tests/partner-search-acceptance.live.test.ts > ... > BUG-1: the console figure counts the open ingestion alerts
AssertionError: expected 0 to be greater than 0
      Tests  1 failed | 8 passed (9)
```

Mutant geri alındı; yeniden koşu:
```
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

Tam gate (`bash scripts/gate-isolated.sh`, `pnpm gate` izole DB'de): `[gate-isolated] ok: gate green on an isolated database` → `GATE_EXIT=0`. Log'da WebServer `Error: aborted` satırları var (e2e istemci iptalleri); gate çıkışı 0.

## Değişen dosyalar
- `src/modules/m1/server/partner-search/alerts.ts` (yeni)
- `src/app/[locale]/admin/partner-search/page.tsx`
- `tests/partner-search-acceptance.live.test.ts`
- `docs/agent-results/FO-338-be-fb.md` (bu rapor)

## Riskler
- Yok davranışsal risk; yalnız yapı ve test. Sayfa ve test artık aynı fonksiyonu paylaştığından, sorgunun kaynağı değişirse test kırılır (istenen).
- Canlı test izole DB gerektirir (`SHARED` koruması); paylaşımlı `fabrika` DB'de koşmaz.

## Açık sorular
Yok.

## Sonraki adım
Draft PR (base `dev`) — gate yeşil olduktan sonra `gate-isolated.sh git push` ile push, `gh pr create --draft`.
