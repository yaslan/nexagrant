# FO-256 — DB_CONNECT_TIMEOUT_MS (test/gate pg pool timeout)

**Hüküm:** Bitti: `DB_CONNECT_TIMEOUT_MS` env.ts üzerinden eklendi (varsayılan 1000 ms, prod/dev değişmedi), gate ortamına 10000 verildi; lint, typecheck ve ilgili birim testler yeşil; commit yerel dalda (`be-fb/fo256-db-connect-timeout`), push YOK.

**Platform:** mac (darwin, Darwin 27.2.0, zsh) — doğrulandı. Windows/Linux koşulamadı (bu değişiklik yalnız env okuma ve shell'de `export` satırı; platforma özgü yol/süreç kodu yok, dolayısıyla aynı davranır).

## Ne yapıldı

- `src/lib/env.ts`: opsiyonel `DB_CONNECT_TIMEOUT_MS` (zod: pozitif tam sayı string, ≤ 60000; boş = tanımsız). Sayısal görünüm `dbConnectTimeoutMs` (tanımsızsa 1000).
- `src/lib/db.ts` `createDbClient`: `connectionTimeoutMillis: dbConnectTimeoutMs`; çağıranın `poolOptions.connectionTimeoutMillis` değeri hâlâ üstün (spread sırası değişmedi). "1s fast timeout for instant fallback in dev" yorumu düzeltildi.
- `scripts/gate-isolated.sh`: `export DB_CONNECT_TIMEOUT_MS=10000` — tek yer. Gate'in tüm süreçleri (vitest + Playwright `webServer.env`, `...process.env` ile miras alır) bunu görür.
- `.env.example`: `DB_CONNECT_TIMEOUT_MS=` (boş bırakılır, prod'da da boş).
- `docs/DEVOPS-POSTGRES-SETUP.md`: bir paragraf.
- `src/lib/db-connect-timeout.test.ts` (yeni): 5 test grubu, 9 test case.

## Kısa timeout'a dayanan testler

`grep -rn "connectionTimeoutMillis\|service-busy\|pool timeout" tests/` ve `src/` taraması: kısa timeout'a bağımlı bir test yok. `UNREACHABLE_DB` kullanan `alerts-daily.test.ts` ve `calendar/__tests__/sync.test.ts` `127.0.0.1:1`e bağlanır — bağlantı reddi anlık olduğundan 10 s değeri onları etkilemez; ikisi de yeşil geçti (aşağıda).

## Kanıt (ham çıktı)

Yeni birim test (`pnpm exec vitest run src/lib/db-connect-timeout.test.ts`):
```
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  20:13:08
   Duration  2.95s
```
Kapsam: unset → 1000 · boş → 1000 · `10000` → 10000 (env ve pool'da) · `poolOptions` env'i ezer · `abc`, `0`, `-5`, `1.5`, `60001` → boot'ta `DB_CONNECT_TIMEOUT_MS` hatası.

Lint (`pnpm lint`):
```
✖ 4 problems (0 errors, 4 warnings)
LINT_EXIT=0
```
Uyarılar değiştirdiğim dosyalarda değil (`invitations/accept.ts`, `e2e/fixtures/concept-template-tenant.ts`, `settings-profile-update.test.ts`).

Typecheck (`pnpm typecheck`): ilk koşuda 644 hata — sebebi worktree'de Prisma client üretilmemiş olması (`@prisma/client` `PrismaClient` export etmiyordu). `pnpm exec prisma generate` sonrası:
```
TC_EXIT=0
0 error TS
```

İlgili testler (`src/lib/db-connect-timeout.test.ts`, `calendar/__tests__/sync.test.ts`, `jobs/tasks/__tests__/alerts-daily.test.ts`):
```
 Test Files  3 passed (3)
      Tests  39 passed (39)
```

Gate script sözdizimi: `bash -n scripts/gate-isolated.sh` → temiz.

## Kapsam dışı / koşulmadı

- **Tam gate koşulmadı, push yapılmadı** (talimat gereği; makinede FO-255 push treni çalışıyor).
- "Gate env'inde değerin uçtan uca uygulandığı" kanıtı: birim test env→pool eşlemesini kanıtlıyor; gerçek e2e sunucusu ayağa kaldırılıp pool ayarı loglanmadı (gate koşulmadığı için). Bu, FO-255 trenine eklendiğinde ilk kontrol edilecek nokta.

## Değişen dosyalar

- `src/lib/env.ts`
- `src/lib/db.ts`
- `src/lib/db-connect-timeout.test.ts` (yeni)
- `scripts/gate-isolated.sh`
- `.env.example`
- `docs/DEVOPS-POSTGRES-SETUP.md`
- `docs/agent-results/TASK-MVV85303WX2IK-be-fb.md` (bu dosya)

Commit: `b69dc7a5 feat(db): DB_CONNECT_TIMEOUT_MS for the test/gate pool (FO-256)` — yerel `be-fb/fo256-db-connect-timeout`, origin'e push edilmedi.

## Riskler

- Gate'teki `10000` yalnız `gate-isolated.sh` üzerinden geçer. CI'da (`ci.yml`) bu env tanımlı değil → CI 1000 ms ile koşmaya devam eder. Kasıtlı: task "gate/test ortamı" dedi ve CI'a dokunmak kapsam dışıydı; CI'da aynı yük sorunu görülürse ayrıca eklenmeli.
- Prod'a yanlışlıkla `DB_CONNECT_TIMEOUT_MS` konursa üst sınır 60 s; env'de boş bırakılmalı (`.env.example` ve doküman belirtiyor).

## Açık sorular

- Yok.

## Sonraki adım

- FO-255 push treninin sonunda: `pnpm gate` koşulup e2e sunucusunda pool ayarının 10000 geldiği doğrulanmalı, sonra push.

## Not (sonuç dosyası konumu)

Kart `FONBRIDGE/docs/agent-results/` yolunu istiyor; bu dosya dal içinde (`be-fb/fo256-db-connect-timeout`) commit edildi. Aynı dosyanın bir kopyası ana FONBRIDGE ağacına (`/Users/macbook/alan/FONBRIDGE/docs/agent-results/TASK-MVV85303WX2IK-be-fb.md`) konuldu; ana ağaç `feat/partner-search-interreg` dalında ve kirli olduğundan oraya commit atılmadı.
