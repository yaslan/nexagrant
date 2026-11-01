# TASK-MUNWYYJY6UH64 — FB İNCELEME-74 (crw-fb) · RBAC bekçisi N1–N14 + G5, billing portal, vitest timeout (TASK-MUNSRKW0HJYBV, se-fb, merge f23d79cc)

**Durum:** TAMAM
**Karar:** **ONAY.** Bloke eden bulgu yok. se-fb'nin düzeltmesi dev'de kalabilir. Aşağıdaki Y-1 ve Y-2 için ayrı bir takip kartı açılmalı.
**İncelenen:** dev `6b1341b4`. `f23d79cc`'nin bu commit'in atası olduğunu `git merge-base --is-ancestor` ile doğruladım. Ayrı worktree'de çalıştım (scratchpad). İzole DB: `crwfb74-pg` konteyneri, `127.0.0.1:5474`. Paylaşılan `:5433`'e hiç yazmadım.
**Kod değişmedi.** Mutantlar ve canlı testler yalnız worktree'de koşuldu, koşudan sonra geri alındı. `git status` temiz.
**Ekler:** `docs/agent-results/TASK-MUNWYYJY6UH64-crw-fb-ekler/`

**Platform beyanı:** Her şeyi mac'te doğruladım (Darwin 27, Node, vitest 4.1.11, Postgres 16 + pgvector Docker'da).
- Bekçi saf bir TS AST taraması. Yol ayırıcısını `path.sep` → `/` ile, modülleri `path.posix` ile çözüyor. Koddan okuyunca Windows ve Linux'ta aynı sonucu vermesi gerekir.
- Portal route'u ve vitest ayarı platforma bağlı değil.
- İNCELEME-45 testindeki `process.cpuUsage()` Linux ve Windows'ta da süreç düzeyinde CPU süresi veriyor, işçi thread'i de buna dahil.
- Windows ve Linux'ta koşmadım, çünkü bu makinede yalnız mac var. CI (ubuntu-latest) aynı suitleri koşuyor.

## Özet

| # | Önem | Bulgu | Bloke? |
|---|---|---|---|
| Y-1 | Orta | Bekçi, çözemediği import'ta sessizce duruyor. Sekiz yaygın re-export ya da sarmalama biçiminin hepsi (R1–R8) readOnly altındaki yazmayı kaçırıyor. Bu biçimler doc-comment'te "görülmeyenler" arasında yazmıyor. | Hayır. Gerçek ağaçta bugün etkilenen yol yok (§1.3) |
| Y-2 | Orta | N4 (`can`'e sabit rol) yalnız sözdizimiyle yakalanıyor. Rolü istemci girdisinden alan `can(input.role, …)` ve 5 sabit-rol varyantı geçiyor (S3–S8) | Hayır. Gerçek ağaçtaki 10 `can` çağrısının hepsi oturum rolünü kullanıyor |
| D-1 | Düşük | Yerel gölgeleme: `const can = () => true` ya da `requireTenantAction` adlı bir parametre gerçek kontrol sayılıyor (S1, S2) | Hayır |
| D-2 | Düşük | Yazma metodu takma adla ya da dolaylı çağrılıyor (`const del = tx.evidence.deleteMany`, `.call`, `[m]`, `Reflect.apply`), SQL değişkende tutulup `$queryRaw(q)` ile koşuluyor, yazma sınıf/nesne yardımcısında duruyor (W1–W7, W9). Bunların hepsi görünmüyor | Hayır |
| D-3 | Düşük | İçteki `function` bildirimi hoisted olduğu için kontrolden ÖNCE çağrılabiliyor, bekçi bunu görmüyor (E4) | Hayır |
| Ö-1 | Öneri | `src/lib/agency/report.test.ts` property testi load 107'de 100.5 sn sürdü, bütçesi 120 sn. Sıradaki flake adayı bu. Bu diff'ten önce de vardı | — |
| ✓ | — | Portal: iki kiracının sahibi oturumdaki kiracının portalını alıyor, 500 yanıtı sabit cümle. Canlı DB'de yeni route 6/6 yeşil, eski route 6/6 kırmızı | — |
| ✓ | — | Timeout değişikliği gerçek bir kırmızıyı gizlemiyor. 30 000 sayfanın hepsini ayrıştıran mutant hâlâ kırmızı. 5 sn'yi aşan 28 testin hiçbiri hıza bağlı bir doğruluk iddiası taşımıyor (§3) | — |
| ✓ | — | Tam `vitest run` iki kez yük altında koşuldu (load 33→107): `3256 passed \| 22 skipped` ×2, EXIT=0 ×2. tsc, lint ve build EXIT=0 | — |

## 1) RBAC bekçisi: yeni mutant sınıfları

Düzenek `ekler/zz-crwfb-i74-mutants.test.ts`, bekçinin export ettiği `findingsFor(file, text, overlay)`'i çağırıyor. Başka modüller `overlay` ile sanal olarak veriliyor, ağaca dokunulmuyor. Çıktı `ekler/mutants-run2.txt`.

**Pozitif kontroller (düzenek sağlam mı?):** 7 kontrolün 7'si beklendiği gibi çıktı.
- C1 readOnly doğrudan yazma → KIRMIZI
- C2 `export { wipe as x } from` barrel → KIRMIZI (`via wipe (lib/i74/c2impl)`)
- C3 üst düzey yardımcı kontrolden önce → KIRMIZI
- C4 `can('TENANT_OWNER', …)` → KIRMIZI
- C5 `Role.TENANT_OWNER` → KIRMIZI
- C6 satır içi `` $queryRaw`DELETE…` `` → KIRMIZI
- C7 iyi biçim → YEŞİL

### 1.1 Yakalananlar (bekçi sağlam)

| Sınıf | Mutant | Sonuç |
|---|---|---|
| try/finally | T1 `try { check } finally { write }` | KIRMIZI: finally, try öncesindeki durumla geziliyor |
| try/finally | T2 yardımcıda `try { if(!can) throw } finally { return }` (return istisnayı yutar) | KIRMIZI: `returnsIn` sızıntıyı görüyor |
| try/catch | T3 `catch (e) { if (x) throw e }` (koşullu yeniden fırlatma) | KIRMIZI |
| Ters erken dönüş | E1 `if (can(..)) return` · E2 `if (!can(..) && false) return` · E3 `if (!can(..)) {} else return` | 3/3 KIRMIZI |
| Döngü | E5 kontrol `for…of []` içinde | KIRMIZI |
| Derinlik | L6: 6 modüllük zincir | KIRMIZI |

se-fb'nin geri-alma iddiasından iki tanesini kendim denedim:
- `MAX_DEPTH = 0` → N14/G5 ve G5-6 seviye testleri kırmızı (`2 failed | 31 passed`).
- "Async kontrolde await şartı yok" → N2 kırmızı (`1 failed | 32 passed`).

### 1.2 Kaçanlar

Hepsi YEŞİL (kaçtı). "Belgeli" sütunu, doc-comment'teki "What stays out of reach" listesinde yazıp yazmadığını gösteriyor.

| # | Mutant | Belgeli mi |
|---|---|---|
| D1, D2 | Dinamik `import()` (readOnly altında ve kontrolden önce) | ✔ belgeli |
| L7, L8, L12 | 7, 8 ve 12 modüllük zincir | ✔ belgeli (MAX_DEPTH) |
| W8 | Model erişimcisi argümanla veriliyor: `wipeVia(tx.evidence)` | ✔ belgeli |
| **R1** | Barrel: `import { w } from './impl'; export { w };` | ✘ |
| **R2** | Barrel: `import { w } …; export default w;` | ✘ |
| **R3** | Barrel: `export const w2 = w;` (import edilen fonksiyonun takma adı) | ✘ |
| **R4** | `export * as ns from './impl'` + `ns.wipe()` | ✘ |
| **R5** | `import * as ns` + `ns['wipe']()` | ✘ |
| **R6** | `import * as ns` + `const { wipe } = ns` | ✘ |
| **R7** | Başka modülde `export const wipe = wrap(async …)` (ör. React `cache()` biçimi) | ✘ (N10 bunu yalnız `'use server'` modülünde reddediyor) |
| **R8** | Başka modülde `export const repo = { async wipe() {…} }` | ✘ |
| E4 | İç `function` bildirimi, kontrolden önce çağrılıyor (hoisting) | ✘ |
| S1 | `const can = () => true` yerel gölgeleme | ✘ |
| S2 | `requireTenantAction` adlı varsayılan parametre | ✘ |
| **S3** | `can(input.role, …)`: rol action argümanından geliyor | ✘ |
| S4 | Fonksiyon içinde `const r = 'TENANT_OWNER'` | ✘ (`consts` yalnız üst düzeyi okuyor) |
| S5 | `import { Role as R }` + `R.TENANT_OWNER` | ✘ (yalnız `Role` adı tanınıyor) |
| S6 | `$Enums.Role.TENANT_OWNER` | ✘ |
| S7 | `` `TENANT_${'OWNER'}` `` şablonu | ✘ (yalnız NoSubstitution şablonu tanınıyor) |
| S8 | `('TENANT_OWNER' \|\| role)` | ✘ |
| W1 | `const del = tx.evidence.deleteMany; del(…)` | ✘ |
| W2 | `const { deleteMany } = tx.evidence` | ✘ |
| W3 | `tx.evidence.deleteMany.call(tx.evidence, …)` | ✘ |
| W4 | `tx.evidence[m](…)` (`m = 'deleteMany'`) | ✘ |
| **W5** | `const q = Prisma.sql\`DELETE …\`; tx.$queryRaw(q)` | ✘ (SQL_WRITE yalnız argümanın metnine bakıyor, o da `q`) |
| W6 | Aynı dosyada `const helpers = { wipe: (tx) => … }` | ✘ |
| W7 | Aynı dosyada `class Wiper { static run() }` | ✘ |
| W9 | `Reflect.apply(tx.evidence.deleteMany, …)` | ✘ |

**Toplam:** 39 mutantın 8'i kırmızı, 31'i kaçtı (7 pozitif kontrol bu sayıya dahil değil). Kaçan 31 mutantın 6'sı belgeli sınırlar içinde (D1, D2, L7, L8, L12, W8), 25'i belgesiz.

### 1.3 Gerçek ağaç: FP sayısı ve "görünmeyen import" ölçümü

Bekçinin bir kopyasına sayaç koydum (`follow()` içinde `exportedFn` null döndüğünde). Kopya ağaca girmedi. Çıktı `ekler/guard-instr.txt`:

```
findings=0 files=37 keys=128 visitedModules=80 misses=60
```

- **FP = 0.** Gerçek ağaçta hiç bulgu yok. se-fb'nin ölçümüyle aynı: 80 modül, 0 bulgu.
- **60 "miss" oldu.** Yani bekçinin takip etmeye çalışıp bulamadığı 60 import var. Hepsi fonksiyon olmayan değerler:
  - sabitler (`PRODUCT_NAME`, `DEFAULT_SCORING_WEIGHTS` …),
  - zod şemaları,
  - Error sınıfları,
  - `logger`, `env`,
  - `icsProvider = new IcsProvider()`.
- **Belgesiz biçimlerin gerçek ağaçtaki izleri:**
  - `src/lib/email/mailer.ts:164` `reportMailNotConfigured`, `recordAlert`'i **dinamik import** ile çağırıyor. `recordAlert` `db.systemAlert.create/update` yazıyor. Action'lardan çağıranlar iki tane: `admin/settings/actions.ts#sendSmtpTestEmail` önce `requirePlatformAdmin()` çağırıyor, `request-deletion` ise ALLOWED listesinde. Açık yok.
  - `src/lib/scoring/embeddings.ts:151` içindeki `class Run` `$executeRaw` yazıyor. Onu kullanan tek yer `runK1Embeddings`, o da yalnız job'dan çağrılıyor (`lib/jobs/tasks/k1-embeddings.ts`). Action yolunda değil.
  - `$queryRaw*(değişken)` biçimi `src/` altında hiç yok. `rag.ts:505`'in argümanı satır içi bir `SELECT`.
  - `export * as` biçimi `src/` altında hiç yok.

**Sonuç:** Bugünkü "0 bulgu" gerçek. Açık bir yazma gizlenmiyor. Ama bekçi çözemediği import'ta **fail-open**: sessizce duruyor. Bu yüzden yarın R1/R3/R7 biçiminde yazılmış bir yardımcı bekçiyi kör bırakır ve hiçbir test kırmızı olmaz.

### Y-1 önerilen düzeltme (ayrı kart)

1. Çözümlemeyi genişlet:
   - `import { x }` + `export { x }` (R1),
   - `export default <ident>` (R2),
   - `export const a = <ident>` (R3),
   - `export * as ns` (R4),
   - `ns['x']` (R5),
   - `const { x } = ns` (R6),
   - `export const x = f(<fn>)` için argümandaki fonksiyonları gez (R7).
2. Ardından fail-closed ol. Takip edilen import `src/` altında bir modüle çözülüyor ama adı çözülemiyorsa, ve hedef modülde (TRUSTED dışında) bir yazma varsa bulgu üret. Bugünkü 60 miss'in hedef modüllerinde yazma olmadığı için FP beklemem. Bu varsayımı `guard-instr` ile doğrulamak gerekir.
3. Kaçan her biçim için bekçinin kendi-mutant testini ekle. En azından R1, R3 ve R7 gerekli.

### Y-2 önerilen düzeltme

`can` ve `canConfirmSeat`'in rol argümanının kökünü veri akışıyla kısıtla. Kök, aynı fonksiyonda `requireTenantAction` / `assertTenantActionRole` / `requireTenantApi` / `auth()` sonucundan alınmış bir bağlama olmalı (`role`, `scope.role`, `sessionObj?.role`). `asRole(…)` ve `as Role` sarmalayıcıları soyulabilir.

Gerçek ağaçtaki 10 çağrının hepsi bu biçimde:
- `asRole(role)`, `asRole(scope.role)`, `role as Role`,
- `dashboard/export-csv.ts:33` `sessionObj?.role`.

`sessionObj`'in kaynağı ayrıca doğrulanmalı. Bunu yapınca S3–S8 kapanır, S1 ve S2'nin (D-1) yarısı da kapanır. D-1 için ayrıca `checkName`, çağrılan adın fonksiyon kapsamında yeniden bildirilmediğine bakmalı.

D-2 için en ucuz fail-closed adım: `$queryRaw*` çağrısının argümanı düz bir tanımlayıcıysa (W5) bunu yazma say. Bugün `src/`'de bu biçimde çağrı yok, yani 0 FP. W1–W4, W6, W7 ve W9 doc-comment'teki "stays out of reach" listesine eklenmeli, çünkü şu an listede yoklar.

## 2) Billing portal (canlı, izole DB)

Test dosyası `ekler/zz-crwfb-i74-portal.live.test.ts`. Repoya eklenmedi, `afterAll` kendi satırlarını siliyor.
- Yalnız `auth()` ve Stripe SDK sahte. `requireTenantApi`, `withSystemScope` ve `withTenant` gerçek.
- DB `crwfb74-pg:5474`. Test başka bir DB URL'si görürse koşmayı reddediyor.
- Kiracılar: A, X ve S'nin Stripe müşterisi var (`cus_A74`, `cus_X74`, `cus_S74`), N'nin yok.

**Yeni route (dev)** (`ekler/portal-live-dev.txt`), `Tests 6 passed (6)`:
```
P1#0..4 session=A → 200 cus_A74; session=X → 200 cus_X74        (A ve X'in sahibi, 5 kez sırayla)
P2 → 403 {"error":"No tenant found or insufficient permissions"} stripe=0   (A'da ADMIN, X'te OWNER, oturum A)
P3 → 403 … stripe=0                                                (oturum A diyor, JWT rolü OWNER, A'da üyeliği yok)
P4 oturum yok → 401 · kiracısız oturum → 401 TENANT_SCOPE_REQUIRED
P5 → 500 {"error":"Failed to create portal session"} bodyHasTenant=false logHasTenant=true
P6 Stripe "Invalid API Key provided: sk_test_… cus_S74" fırlatıyor → 500 aynı sabit cümle, bodyHasStripeText=false, logHasStripeText=true
```

**Aynı test eski route'a karşı** (`git show f23d79cc^1:…/route.ts`, sonra geri alındı; `ekler/portal-live-oldroute.txt`), `Tests 6 failed (6)`:
```
P1#0 session=A → 200 cus_A74; session=X → 200 cus_A74     ← X oturumunda A'nın portalı
P2 → 200 …/cus_X74 stripe=1                                ← A'da ADMIN, X'in portalını açıyor
P3 → 200 …/cus_X74 stripe=1
P4 kiracısız oturum → 200 …/cus_A74
P5 → 500 {"error":"No Stripe customer found for tenant cmunx9zm…"} bodyHasTenant=true
```

Değerlendirme: Ö-A ve Ö-B kapandı. Üyelik rolü JWT'den değil DB satırından okunuyor (P3). `{ write: true }` bilinçli olarak yok: süresi dolmuş pilot da ödeme yapabilmeli. Bu karar makul.

## 3) Timeout / CPU değişikliği gerçek bir kırmızıyı gizliyor mu?

- **İNCELEME-45 (CPU ölçümü) mutantı** (`ekler/i45-mutant.txt`). `rag-pdf.worker.ts`'e sayfa sayısı kontrolünden önce `await parser.getText({ first: 1, last: total })` ekledim. Sonuç kodu aynı kalıyor (`too_many_pages`), yalnız maliyet değişiyor. Test `× … Test timed out in 30000ms` ile **kırmızı** oldu. Koruduğu regresyon hâlâ yakalanıyor. Mutant geri alındı.
- **Hızı tek bütçesi 5 sn varsayılanı olan test var mı?** Hostile-input testlerini taradım (`repeat(`, ReDoS, quadratic).
  - Tek aday `k3-topic-stats-parse` "refuses a start tag longer than the cap". Açık bir süre bütçesi yok. Kapağı kaldırınca `expected null to match { code: 'MALFORMED' }` ile düşüyor. Yani hata koduna bakıyor, timeout'a dayanmıyor.
  - Aynı dosyadaki diğer hostile testler kendi `ms < 1000` bütçesini taşıyor.
- **5 sn'yi aşan 28 test** (`ekler/slow-tests.txt`, iki koşunun JSON raporundan):
  - property taramaları: `agency/report`, `funnel.attack` ×12, `withholding-rounding`, `invoice-writer`, `vat-by-country`,
  - kaynak tarayıcılar: `where-guard-src`, `teardown-where-guard`, `use-server-exports`, `prisma-delegate-types`,
  - RAG PDF testleri, `cordis-partner-profile.live`.

  Hiçbiri "hızlı olmalı" diye bir doğruluk iddiası taşımıyor. Hız iddiası olan RAG testleri kendi bütçelerini ya da CPU ölçümünü koruyor. Bu yüzden 30 sn yalnız yük gürültüsünü emiyor.
- **Ö-1:** `src/lib/agency/report.test.ts` "300 random tables" load 107'de 100.5 sn sürdü (koşu 1'de 87 sn), bütçesi 120 sn (`report.test.ts:125`). Payı %16. Bu diff'ten önce de vardı ama sıradaki sahte kırmızı en çok buradan gelir. Tabloları 300'den ~100'e indirmek ya da CPU ile ölçmek önerilir.
- RAG olay-döngüsü testinde `maxParseMs` 150 sn'ye çıktı. Assertion'lar (`worstGapMs < 500`, ping sayısı) değişmedi. Süre sınırı bir sonraki testte 500 ms ile ayrıca doğrulanıyor. Gizlenen bir iddia yok.

## 4) Tam koşum ve kapılar

Env: `CI=true`, `AUTH_SECRET` ci.yml'deki değer, DB `crwfb74-pg`. DB CI'daki sırayla hazırlandı: `db push` → `db:rls-role` → 39 migrasyon ×2 → `db:rls` (28 → 112 politika) → seed. Kayıt `ekler/db-prep.txt`.

Tam koşumlar (`ekler/fullrun.out`), aynı anda tsc ve lint de koşuyordu:
```
== run 1 start 12:50:08  load 33.70 → end 12:52:14 load 67.92
 Test Files  271 passed | 2 skipped (273)
      Tests  3256 passed | 22 skipped (3278)      EXIT=0
== run 2 start 12:52:14  load 67.92 → end 12:54:38 load 106.99
 Test Files  271 passed | 2 skipped (273)
      Tests  3256 passed | 22 skipped (3278)      EXIT=0
```

Atlananlar: `evidence-upload-s3.live` 13 (S3 ortamı yok), `k1-daily-calls` 3, `adapters` 2, `sedia-adapter` 2, `k1-embeddings.live` 1. se-fb'nin koşularında da atlanan sayısı 22'ydi. Bu diff'le ilgili değil.

Kapılar (`ekler/gates.txt`):
```
npx tsc --noEmit -p .   → EXIT=0 (4 dk 25 sn, load ~33)
pnpm lint               → EXIT=0
pnpm build              → EXIT=0 · ✓ Compiled successfully · static pages 31/31 · i18n check passed
```

Build notu: Worktree'deki `node_modules` symlink'ini Turbopack reddediyor ("Symlink [project]/node_modules is invalid, it points out of the filesystem root"). Bu yüzden worktree'ye `pnpm install --offline --frozen-lockfile` ile gerçek `node_modules` kurdum. Vitest ve tsc symlink'le sorunsuz çalıştı.

## 5) Değişen dosyalar
- `docs/agent-results/TASK-MUNWYYJY6UH64-crw-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUNWYYJY6UH64-crw-fb-ekler/` (kanıt; `**/docs/**` vitest'in dışında)

Kod değişmedi.

## 6) Riskler
- Y-1 ve Y-2 bugün sömürülen bir açık değil. Bekçinin bir **sonraki** refactor'da kör kalma riski. Özellikle R7 riskli, çünkü Next'te `cache()`/sarmalayıcı biçimi yaygın. Doc-comment "calls are followed into imported functions" dediği için okuyan kişi kapsamı olduğundan geniş sanabilir.
- Ö-1: `agency/report` testinin bütçe payı %16.

## 7) Açık sorular
- Y-1 için fail-closed yaklaşımı mı (çözülemeyen import + hedefte yazma → bulgu), yoksa yalnız çözümlemeyi genişletmek mi? Ben ikisini birlikte öneriyorum.
- Y-2'de `dashboard/export-csv.ts:33`'teki `sessionObj?.role` hangi kaynaktan geliyor? Veri akışı kuralı onu kabul edecek mi, yoksa ALLOWED gerekecek mi?

## 8) Sonraki adım
- Lider: TASK-MUNSRKW0HJYBV'yi `done` durumuna alabilir.
- Y-1, Y-2 ve D-1..D-3 için tek bir takip kartı (bekçi v3) açılmalı. Kabul ölçütü: bu raporun mutant düzeneği (`ekler/zz-crwfb-i74-mutants.test.ts`) R1–R8 ve S3–S8'de kırmızı olmalı, gerçek ağaçta 0 bulgu kalmalı.
- Ö-1 için ayrı küçük bir test kartı açılabilir.

## 9) Temizlik
```
docker rm -f crwfb74-pg
git worktree remove --force <scratchpad>/wt
```
```
$ docker rm -f crwfb74-pg                              → crwfb74-pg
$ docker ps -a | grep -c crwfb74                        → 0
$ git worktree list | grep -c <scratchpad-oturum-id>    → 0
```
Test satırları konteynerle birlikte gitti. Paylaşılan `:5433`'e ve başka konteynerlere dokunulmadı.
