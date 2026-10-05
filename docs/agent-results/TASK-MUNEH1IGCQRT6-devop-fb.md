# TASK-MUNEH1IGCQRT6: CI'da AUTH_SECRET yok (İNCELEME-54 Y-1, YÜKSEK) (devop-fb)

**Durum:** TAMAM
**Dal:** `devop-fb/muneh1-ci-authsecret`, commit `5f7c168a`, dev'e merge `c7e081bc` (**push yapılmadı**, push 1 Ekim'de)
**Platform:** mac (Darwin 27, izole Postgres konteyneri `devopfb-muneh-pg` :5498, DB `devop_ci54`)

## 1. Ne yapıldı

**(a) Kök neden.** İki süitin `beforeAll`'u şu koşulla sessizce `return` ediyordu:
`if (!rlsUrl || !env.admin || !process.env.AUTH_SECRET) { skipReason = …; return; }`.
DB değişkenleri eksik olduğunda `requireRlsTestUrl` ve `skipOrFailInCi` zaten CI'da hata atıyordu. **AUTH_SECRET** ise hiçbir koruyucudan geçmiyordu. `ci.yml`'da AUTH_SECRET yok, CI'da `.env` de yok. Bu yüzden `beforeEach` → `ctx.skip()` 38 testin hepsini atlıyor ve adım yeşil görünüyordu. AUTH_SECRET dışında eksik bir env yok: DB URL'leri job düzeyinde tanımlı, sahte OAuth sağlayıcısı yerel bir HTTP sunucusu olduğu için Google kimlik bilgisi gerekmiyor.

**Düzeltme:**
- `tests/helpers/live-db-role.ts`:
  - Yeni `requireTestEnv(name, suite)`: değer yoksa yerelde uyarı verip atlar, CI'da hata atar.
  - `skipOrFailInCi`'ye isteğe bağlı bir `fix` ipucu eklendi. Varsayılan metin eskisiyle aynı; AUTH_SECRET hatası artık yanlışlıkla "DB'yi ver" demiyor.
- `tests/oauth-registration.live.test.ts` ve `tests/invitation-accept.live.test.ts`: koşul artık `requireTestEnv('AUTH_SECRET', SUITE)` üzerinden kuruluyor (b).
- `.github/workflows/ci.yml`: **Test** adımına `AUTH_SECRET: 'ci-vitest-auth-secret-fixture-not-for-any-deployment'` eklendi.
  - Değer açıkça test amaçlı, 52 karakter (≥32 kuralını geçiyor).
  - Emekli anahtarın SHA-256 özetiyle eşleşmiyor (kontrol edildi).
  - Yalnız Test adımına eklendi. E2E adımı kendi değerini `playwright.config.ts`'te zaten ayarlıyor.

**(c) Tüm `*.live` taraması (37 dosya).** Her atlama yolu tek tek incelendi (`skipIf`, `ctx.skip`, `skipReason =`, `return`):
- **Aynı delik: `tests/weekly-active-users.live.test.ts`.** `if (!requireRlsTestUrl(…) || !ADMIN_URL) return;` satırı DATABASE_URL eksikken sessizce dönüyordu. Aynı şekilde düzeltildi (`skipOrFailInCi(SUITE, 'DATABASE_URL is not set')`). CI'da DATABASE_URL job düzeyinde tanımlı olduğu için bugün tetiklenmiyordu, ama kural bu yolda da delikti.
- **Bilinçli istisna: `k1-embeddings.live` "REAL OpenAI" kolu.** `K1_EMBEDDINGS_REAL_OPENAI=1` ile açılan, ücretli bir opt-in. Delik değil, dokunulmadı.
- **Diğer 34 dosya** zaten `skipOrFailInCi` veya `requireRlsTestUrl` üzerinden geçiyor. Varsayılan URL + erişilebilirlik kontrolü + `else skipOrFailInCi` kalıbı da buna dahil.

## 2. Kanıt

Tüm koşumlarda `CI=true`, `DATABASE_URL=…:5498/devop_ci54`, `DATABASE_URL_RLS_TEST=fabrika_app@…:5498/devop_ci54` kullanıldı. Worktree'de `.env` yok; CI ile aynı durum.

**DB hazırlığı (ci.yml "Prepare database" sırası):** `prisma db push → db:rls-role → apply-migrations.sh ×2 → db:rls → db:seed`, exit=0. psql, docker-exec shim ile (`PSQL=`) çalıştırıldı.

**Önce (hata yeniden üretildi, düzeltmesiz, AUTH_SECRET yok):**
```
 Test Files  2 passed (2)
      Tests  38 skipped (38)
```

**Sonra, env yok → KIRMIZI:**
```
exit=1
Error: invitation-accept.live: refusing to skip in CI — AUTH_SECRET is not set. Set a test-only AUTH_SECRET in the Test step of .github/workflows/ci.yml.
Error: oauth-registration.live: refusing to skip in CI — AUTH_SECRET is not set. Set a test-only AUTH_SECRET in the Test step of .github/workflows/ci.yml.
 Test Files  2 failed (2)
```

**Sonra, env var (ci.yml'daki değer) → 38 test gerçekten koşuyor ve yeşil:**
```
exit=0
 Test Files  2 passed (2)
      Tests  38 passed (38)
```

**Yerel (CI yok, AUTH_SECRET yok) davranış korunuyor:** `stderr | oauth-registration.live skipped: AUTH_SECRET is not set`, testler atlandı, dosya yeşil.

**Tam CI benzetimi (`pnpm test`, CI=true, Test adımının env'i), JSON raporlayıcıyla:**
```
total 3104 passed 3094 failed 1 skipped 9
live files 37 live tests passed 326
```
- `*.live` içinde atlanan tek test: `k1-embeddings.live :: K1 embeddings (live, REAL OpenAI)`. Bilinçli opt-in.
- Diğer 8 atlama `*.live` dışında: `adapters`, `k1-daily-calls`, `sedia-adapter` (ağ ya da `it.skip`), kapsam dışı.
- **Tek kırmızı önceden vardı**, bu işten kaynaklanmıyor. Bkz. Riskler.

**Merge sonrası dev ağacında:** `oauth-registration + invitation-accept + weekly-active-users` → `Tests 41 passed (41)`.

**Diğer kontroller:**
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `ci.yml` YAML ayrıştırması → Test adımı `{'run': 'pnpm test', 'env': {'AUTH_SECRET': 'ci-vitest-…'}}`

**`act` bu makinede kurulu değil** (`act not found`), `actionlint` de yok. Workflow doğrulaması görevin izin verdiği yerel CI=true benzetimiyle yapıldı. GitHub Actions her adımda `CI=true` ayarladığı için `isCi()` gerçek koşumda da doğru sonucu verir.

## 3. Değişen dosyalar
- `.github/workflows/ci.yml`
- `tests/helpers/live-db-role.ts`
- `tests/oauth-registration.live.test.ts`
- `tests/invitation-accept.live.test.ts`
- `tests/weekly-active-users.live.test.ts`

## 4. Riskler
- **CI tam koşumda bugün yine KIRMIZI olacak, bu işten bağımsız bir nedenle:** `tests/teardown-where-guard.test.ts`, `tests/stale-relationship-reminder.live.test.ts:395 where: args (not a const object literal)` satırını yakalıyor.
  - Taban commit'imde (`f4582b89`), değişikliğim stash'lenmişken de kırmızı. dev'de de aynı.
  - Kaynak TASK-MULQL2NYKRGJX (`9229fef4`, se-fb). Başka ajanın dosyası olduğu için dokunulmadı.
  - 1 Ekim push'undan önce o görevde düzeltilmeli.
- 38 test artık CI'da gerçekten koşuyor. Bu testlerin CI ortamında daha önce hiç koşmadığını unutmayın. Burada temiz bir CI benzeri DB'de yeşil geçtiler; gerçek runner'da ilk koşumda zamanlamaya bağlı bir fark çıkarsa bu düzeltmenin sonucu değil, önceden görünmeyen bir durumdur.

## 5. Açık sorular
- Yok.

## 6. Sonraki adım
- 1 Ekim push'unda CI "Test" adımında `oauth-registration.live` (20) ve `invitation-accept.live` (18) testlerinin **passed** olarak göründüğünü doğrula (skipped değil).
- Geri alma: `git revert -m 1 c7e081bc`.
- İzole DB `devop_ci54` (`devopfb-muneh-pg` konteyneri) yeniden üretim için duruyor. İş bitince `docker rm -f devopfb-muneh-pg` ile kaldırılabilir.
