# TASK-MUNQ9EMU84G67: İNCELEME-62, CI AUTH_SECRET düzeltmesi (TASK-MUNEH1IGCQRT6) (be-fb)

**Durum:** TAMAM
**Karar:** ONAY. Bloklayıcı ya da yüksek bulgu yok. İki orta bulgu var (O-1, O-2), ikisi de ayrı bir kartta ele alınabilir.
**İncelenen:** `5f7c168a` (kod), dev merge `c7e081bc`
- Worktree: `git worktree add --detach …/scratchpad/wt62 dev` → `480326f8` (dev ucu)
- `c7e081bc..dev` arasında ci.yml'a dokunan commit yok.
**Platform:** mac (Darwin 27, arm64)
- İzole Postgres konteyneri `befb-i62-pg` (pgvector/pgvector:pg16, 127.0.0.1:55662, DB `befb_i62`). İş bitince silindi.
- Paylaşılan `fabrika-postgres` konteynerine ve başka ajanların DB'lerine dokunulmadı.
- Linux (GitHub `ubuntu-latest`) koşulamadı; bu makinede `act` yok. Değişiklik platforma bağlı değil:
  - Yalnız `process.env` okuyor.
  - `isCi()` GitHub'ın her adımda ayarladığı `CI=true`'yu tanıyor (madde 4).
  - ci.yml'daki değişiklik adım düzeyinde bir `env:`.
  - Süreç, yol ya da kabuk farkı yok. Windows'ta da aynı kod yolu çalışır.

## 1. Ne yapıldı

Ana checkout'a dokunulmadı, kod değiştirilmedi. Mutasyonlar yalnız scratch worktree'de yapıldı ve yedekten geri yüklendi.

**Ortam:**
- Worktree'de `.env` yok, CI ile aynı durum.
- DB hazırlığı ci.yml "Prepare database" sırasıyla yapıldı: `db:generate → prisma db push → db:rls-role → apply-migrations.sh ×2 → db:rls → db:seed`, exit=0.
- psql, docker-exec shim ile çalıştırıldı (`PSQL=`).
- Tüm koşumlarda `DATABASE_URL` ve `DATABASE_URL_RLS_TEST` (`fabrika_app`) process env'den verildi.
- AUTH_SECRET, ci.yml'dan **YAML ayrıştırılarak** okundu (`steps[name=Test].env.AUTH_SECRET`). Yani koşulan değer ci.yml'da yazanın ta kendisi. Değer bu rapora basılmadı.

## 2. Kanıt (madde madde)

### 1. CI=true, AUTH_SECRET yok → iki süit KIRMIZI ✅
```
$ CI=true pnpm exec vitest run tests/oauth-registration.live.test.ts tests/invitation-accept.live.test.ts
exit=1
Error: invitation-accept.live: refusing to skip in CI — AUTH_SECRET is not set. Set a test-only AUTH_SECRET in the Test step of .github/workflows/ci.yml.
Error: oauth-registration.live: refusing to skip in CI — AUTH_SECRET is not set. Set a test-only AUTH_SECRET in the Test step of .github/workflows/ci.yml.
 Test Files  2 failed (2)
```

### 2. CI=true, ci.yml değeriyle → 38 test gerçekten koşuyor ve PASSED ✅
JSON raporlayıcıyla sayıldı; atlanan yok:
```
$ CI=true AUTH_SECRET=<ci.yml'dan> pnpm exec vitest run <iki süit> --reporter=json
exit=0
38 {"passed":38}
```
Tam CI benzetiminde de aynı sonuç (`pnpm test`, CI=true, Test adımının env'i): `oauth {"passed":20} inv {"passed":18} wau {"passed":3}`.

### 3. CI yok, AUTH_SECRET yok → yerel atlama korunuyor ✅
```
$ env -u CI pnpm exec vitest run <iki süit>
exit=0   Test Files 2 passed (2)   Tests 38 skipped (38)
stderr | tests/oauth-registration.live.test.ts
oauth-registration.live skipped: AUTH_SECRET is not set
 ↓ … [DATABASE_URL_RLS_TEST / DATABASE_URL / AUTH_SECRET not set]
```

### 4. Uç durumlar: `isCi()` ve `requireTestEnv` (tsx ile doğrudan çağrı)
```
isCi undefined false | "" false | "0" false | "false" false | "FALSE" false | " false " false | " " false
isCi "true" true | "1" true | "yes" true | "no" true | "off" true
CI=undefined X_T=undefined -> undefined(skip)     CI="true" X_T=undefined -> THROW
CI=undefined X_T=""        -> undefined(skip)     CI="true" X_T=""        -> THROW
CI=undefined X_T=" "       -> returned " "        CI="true" X_T=" "       -> returned " "
CI=undefined X_T="\t\n"    -> returned "\t\n"     CI="true" X_T="x"       -> returned "x"
```
- **Boş string** eksik sayılıyor, CI'da hata atıyor. Doğru.
- **Yalnız boşluk** dolu sayılıyor. Bu sessiz bir atlama değil: test gerçekten koşuyor. Kanıt: `CI=true AUTH_SECRET=" "` ile `invitation-accept.live` → `18 passed (18)`, exit 0. Sahte yeşil üretmiyor, bulgu değil.
  - Not: uygulamanın `assertAuthSecretConfigured` fonksiyonu trim'li boşu reddediyor. Test yardımcısının daha gevşek olması zararsız, çünkü atlama yolu açmıyor.
- **`isCi()`** GitHub'ın `CI=true` değerini tanıyor ve temkinli davranıyor: "no" ve "off" bile CI sayılıyor. Hata payı sahte kırmızı yönünde, sahte yeşil yönünde değil. Bu fonksiyon bu işte değişmedi.
- `fix` parametresinin varsayılanı (`DB_FIX`) eski metinle birebir aynı. Diğer 30+ çağrı yerinin mesajı değişmedi.

### 5. `*.live` taraması (37 dosya, `tests/`)
Toplam 39 dosya bulundu. İkisi `docs/agent-results/TASK-MUNOE0Q4FR2J-se-fb-ekler/` altında, vitest `**/docs/**` ile hariç tutuyor. Kalan 37 dosyada `skipIf`, `runIf`, `ctx.skip`, `.skip(`, `skipReason =`, `if (!X) return;` ve `.todo/.only` kalıpları tek tek incelendi:

| Grup | Dosyalar | CI'da atlama mümkün mü? |
|---|---|---|
| `beforeAll` + `skipReason` + `ctx.skip` | action-missing-id, agency-funnel, agency-invite, agency-report, consortium-find-candidates-pilot, evidence-object-key, invitation-mail-limit, seat-assignment-authz, invitation-accept, oauth-registration | Hayır. Her `skipReason` atamasından önce ya da hemen ardından `requireRlsTestUrl`, `skipOrFailInCi` ya da `requireTestEnv` hata atıyor ("not applied" migration kolları dahil). |
| Modül düzeyi `HAS_DB` / `REACHABLE` / `dbReachable` + `describe.skipIf` | billing-k1, invitation-retention, iyzico-rls, k1-embeddings, pipeline-surface, public-lead, stale-relationship-reminder, stripe-event-retention, stripe-idem-rls, topic-match-nightly, application-outcome, concept-template, gdpr, k3, m9-brief, m9-calendar, relationship-owner, stripe-idem, stripe-tenant-scope | Hayır. `requireRlsTestUrl` ya da `else/if … skipOrFailInCi` modül yüklenirken hata atıyor. Hook'lardaki `if (!HAS_DB) return;` satırları yalnız atlanmış bir describe'ın kurulum ve temizlik adımları. |
| `beforeAll` + `ctx.skip()` | cordis-partner-profile, registration-consent, system-alert, weekly-active-users (düzeltildi), system-scope | Hayır. |
| Atlama yolu yok | bearer-token-hash, calendar-token-db | Atlama yolu yok; DB yoksa zaten kırmızı. |
| `auditevent-null-system-only` | | CI'da hayır. Yerelde ise bkz. **O-2**. |
| Bilinçli istisna | `k1-embeddings` `describe.skipIf(!REAL)` (`K1_EMBEDDINGS_REAL_OPENAI=1`) | Ücretli bir opt-in. Tam koşumda `*.live` içinde atlanan **tek** test bu. |

Tam koşumdan ölçüm: `live files 37, live passed 326`. Atlanan tek canlı test: `k1-embeddings.live :: K1 embeddings (live, REAL OpenAI)`.

**Sonuç:** CI'da başka bir sessiz atlama yolu kalmadı. Yazarın taramasıyla uyuşuyor. Küçük bir düzeltme: yazar "diğer 34 dosya skipOrFailInCi ya da requireRlsTestUrl üzerinden geçiyor" demiş, ama `bearer-token-hash` ve `calendar-token-db` ikisini de kullanmıyor. Bu iki dosyada hiç atlama yolu olmadığı için sonuç değişmiyor.

### 6. ci.yml'daki anahtar test amaçlı, gerçek ya da emekli değil ✅
Değer basılmadı; yalnız özet ve bayrak olarak karşılaştırıldı:
```
ci len 52  sha256 prefix 614f02c2446d
retired digest match: false          (src/lib/auth-secret.ts RETIRED_SECRET_SHA256 9804925c…)
assertAuthSecretConfigured({AUTH_SECRET: ci}): OK (length + not retired)
.env* AUTH_SECRET values compared: 10, equal to ci: 0   (16 FONBRIDGE worktree'sinin .env/.env.local/.env.production*)
git log --all -S'<değer>' → yalnız 5f7c168a (.github/workflows/ci.yml) + 28e9791a (yazarın raporu)
```
- Değer kendini açıkça tanımlıyor ("…fixture-not-for-any-deployment" biçiminde).
- e2e değeriyle aynı kalıpta, ama ondan **farklı**.
- Hiçbir yerel ya da dağıtım `.env`'iyle eşleşmiyor. Emekli anahtar değil. Git geçmişinde başka bir yerde görünmüyor.

### 7. Test dışındaki adımlar etkilenmemiş ✅
ci.yml, `5f7c168a~1` ile `dev` arasında YAML düzeyinde karşılaştırıldı:
```
job keys same except steps: true      top-level same: true
step count 14 vs 14
  checkout / pnpm / node / install / prisma validate / generate / Prepare database / Lint / Typecheck  SAME
  Test                               DIFF keys:env
  Install Playwright browsers / Build for E2E (next build) / E2E Test / Upload E2E traces   SAME
Test env keys: ["AUTH_SECRET"]
```
- Adım düzeyindeki `env:` başka adımlara geçmez.
- E2E kendi AUTH_SECRET'ını `playwright.config.ts`'ten alıyor, bu dosya değişmedi.

### 8. Mutasyon: `requireTestEnv` ve `skipOrFailInCi` bozulunca kırmızı oluyor mu?
Scratch worktree'de, iki süit üzerinde denendi:

| Mutant | CI, AUTH_SECRET yok | CI, ci.yml değeri (gerçek CI) |
|---|---|---|
| M1: `requireTestEnv` içindeki `skipOrFailInCi` → `console.warn` | exit 0, **38 skipped** (hayatta kaldı) | exit 0, 38 passed (hayatta kaldı) |
| M2: `skipOrFailInCi`'de `if (isCi())` → `if (false)` | exit 0, **38 skipped** (hayatta kaldı) | exit 0, 38 passed (hayatta kaldı) |
| M3: `if (value) return value` → `return undefined` | – | exit 0, **38 skipped** (hayatta kaldı, **CI yeşil**) |

- Mutantlar kaldırılınca, orijinal kod aynı senaryoda (madde 1) KIRMIZI. Yani düzeltmenin kırmızı davranışını tek başına bu satırlar taşıyor, doğru yerdeler.
- Ancak bu davranışı sabitleyen bir test yok: `live-db-role.ts`'nin birim testi yok (`grep` ile yalnız `.live` dosyaları ve `seed.ts` bulunuyor).
- Gerçek CI yapılandırmasında (AUTH_SECRET var) **hiçbir mutant yakalanmıyor**. M3 ise tam da düzeltilen hatanın biçiminde (38 skipped + yeşil adım) CI'a geri dönebiliyor. Bkz. **O-1**.

### Tam CI benzetimi ve bilinen kırmızı
`CI=true AUTH_SECRET=<ci.yml> pnpm test --reporter=json` (makine yükü 70, başka ajanlar koşuyordu):
```
total 3104 {"passed":3070,"skipped":9,"failed":25}
```
- 25 kırmızının 24'ü yükten kaynaklanan zamanlama hatası (`expected 8858 to be less than 3000`, özellik testlerinde süre sınırı, pdf worker, i18n script).
- Aynı 12 dosya `--no-file-parallelism` ile yeniden koşuldu, **AUTH_SECRET'lı ve AUTH_SECRET'sız sonuç birebir aynı**:
```
--- with ci AUTH_SECRET      Tests 1 failed | 140 passed (141)   Test Files 1 failed | 12 passed (13)
--- without AUTH_SECRET      Tests 1 failed | 140 passed (141)   Test Files 1 failed | 12 passed (13)
FAIL tests/teardown-where-guard.test.ts … stale-relationship-reminder.live.test.ts:395 where: args (not a const object literal)
```
Kalan tek kırmızı bilinen ve bu işten bağımsız (TASK-MUNQ9IGG6R59R). Karara etkisi yok. AUTH_SECRET'ın eklenmesi başka hiçbir testin sonucunu değiştirmiyor.

## 3. Bulgular

- **B:** yok.
- **Y:** yok.
- **O-1 (orta): Koruma testsiz; CI yapılandırmasında gerilemesi görünmez.**
  - `requireTestEnv`, `skipOrFailInCi` ve `isCi` için birim testi yok.
  - CI'da AUTH_SECRET tanımlı olduğu için CI dalı hiç çalışmıyor. M1 ve M2 CI'da fark edilmiyor.
  - M3 (ya da ileride bir süitin `skipReason` koşulunu başka bir yoldan kurması) 38 testi yine "skipped + yeşil adım" durumuna düşürür, düzeltilen hatanın ta kendisi.
  - Öneri (ikisi birlikte ya da biri):
    - (a) `tests/helpers/live-db-role.test.ts`: `CI=true` + eksik/boş değer → throw; CI yok → undefined + uyarı; değer var → değerin kendisi. M1, M2 ve M3'ü öldürür.
    - (b) Daha kalıcı çözüm: CI Test adımında JSON raporlayıcı + küçük bir kontrol. `*.live.test.ts` içinde `skipped` > 0 ise (izinli liste: `k1-embeddings … REAL OpenAI`) adım kırmızı olsun. Bu, mekanizmadan bağımsız olarak her sessiz atlamayı yakalar.
  - Bu kartın DoD'u (38 test CI'da koşuyor, eksik env kırmızı) karşılandığı için bloklamıyor.
- **O-2 (orta, önceden vardı, bu işin kapsamı dışında): `auditevent-null-system-only.live` yerelde atlamayı geçti sayıyor.**
  - Kod: `if (!ready || !rls) return expect(skipReason).toBeTruthy();` (satır 87, 101, 113). Yerelde RLS URL'i yokken 3 test "passed" görünüyor, "skipped" değil.
  - CI'da güvenli, çünkü öncesinde `requireRlsTestUrl` ve `skipOrFailInCi` hata atıyor.
  - `system-scope.live` aynı kalıptan zaten kurtarılmıştı (yorum satırı 76-77). Tutarlılık için `ctx.skip(skipReason)`'a çevrilmeli.

## 4. Değişen dosyalar
- Yalnız bu rapor: `docs/agent-results/TASK-MUNQ9EMU84G67-be-fb.md`.
- Kod değişmedi. Mutasyonlar scratch worktree'de yapıldı, yedekten geri yüklendi, `git status` temiz.

## 5. Riskler
- Gerçek GitHub runner'da ilk koşum yapılmadı; `act` yok. 38 testin CI'da ilk kez koşacağını yazar da belirtmiş. Yerel CI benzetimi ve temiz DB'de yeşiller.
- Tam koşum bu makinede yük altında 24 zamanlama kırmızısı verdi. CI runner'da görülmesi beklenmez, ama `rag-pdf-*` ve `funnel.attack` gibi süre sınırlı testler yavaş bir runner'da da kırılabilir. Bu iş ile ilgisi yok.

## 6. Açık sorular
- O-1 için ayrı kart açılsın mı? Öneri: (b), CI'da `*.live` skipped=0 kapısı.

## 7. Sonraki adım
- 1 Ekim push'unda CI Test adımında `oauth-registration.live` (20) ve `invitation-accept.live` (18) testlerinin **passed** olarak göründüğünü doğrula.
- O-1 ve O-2 için kart aç.
- Temizlik yapıldı: `befb-i62-pg` konteyneri ve `wt62` worktree'si silindi.
