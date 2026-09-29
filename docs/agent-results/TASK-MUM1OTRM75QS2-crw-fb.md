# TASK-MUM1OTRM75QS2 — FB İNCELEME-10 (crw-fb)

Repo `/Users/macbook/alan/FONBRIDGE`, dal `dev`. Kapılar HEAD `a51ccfa3` üzerinde koşuldu. Sonra `7abb31a4` geldi, yalnız rapor. Kod değiştirilmedi. Push yok.

| Kart | Görev                                               | Commit'ler                       | Karar                                                                                                            |
| ---- | --------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1    | TASK-MUM17YBJVAHRR davet kodu paneli (PİLOT KAPISI) | `b11ed48b` `161e594c`            | **DÜZELTME GEREKLİ** (B-1, dar). DoD maddelerinin hepsi sağlanıyor. Kalan tek açık "Tükendi" durumundan geliyor. |
| 2    | TASK-MUM187B5EN9LZ xlsx DoS                         | `50d7e8a9` `7071e451`            | **ONAY** (Ö-1 yeni, bloke etmiyor, yalnız platform_admin)                                                        |
| 3    | TASK-MULQMNMPFY29P ROADMAP güncellemesi             | `4d878b07` `955a481f`            | **ONAY** (K-1)                                                                                                   |
| 4    | TASK-MULXYMNTUELIK E2E kararlılık                   | `9d03f474` `2d4bbbb6` `a7aaf7ca` | **ONAY** (K-1: HMR websocket kök nedeni kanıtlanmadı, Ö-1: artifact boyutu)                                      |

**Pilot kapısı (a) kapanmadı.** Önceki B-1 kapandı: sayfa props'unda ve action yanıtlarında kullanım sayısı yok. Bunu hem testle hem :3000'de canlı doğruladım. Ama benim MILP saldırganım bir şey daha buldu. Saldırgan "hiçbir kurum silinmedi" (D = 0) bilgisine sahipse, "Tükendi" ve "Etkin" durumları funnel'ın yuvarlanmış sayılarıyla birleşince etkin bir kodun kullanımını 1..4 aralığına sıkıştırıyor. Bu, kartın kapatmak istediği sızıntı sınıfının aynısı. "Tükendi" durumu kaldırılınca aynı veride 0 sızıntı kalıyor. Ayrıntı ve somut örnek aşağıda (B-1).

## 1. Ne yapıldı

1. Kapıları kendim koştum (`set -a; source .env; set +a`): typecheck, lint, test, rls:check/verify/bypass-check, i18n:check. İlgili dosyaları ayrıca koştum (canlı DB testleri dahil).
2. **Kart 1:**
   - `usedCount`'un sunucudan çıkabileceği bütün yolları taradım.
   - :3000'de ajans panelini canlı okudum. Oturum yerel demo girişiyle açıldı, veri eklenmedi.
   - Önceki incelemedeki MILP saldırganımı (scipy HiGHS, tam sayılı) kod paneliyle genişlettim ve 3.300'den fazla tabloya karşı koştum.
3. **Kart 2:** Önceki ölçümlerimi aynı dosyalarla tekrarladım: önce doğrudan `readXlsx`, sonra :3000'deki gerçek rota (platform_admin, `mode=preview`). Ardından okuyucuya yeni bir düşmanca girdi sınıfı verdim: paylaşılan dize üzerinden büyütme. Tüm boyutlar sınırlı tutuldu.
4. **Kart 3:** Kapanan 21 maddenin commit'ini `git log` ile doğruladım. Kodu da 3 yerde kontrol ettim: compose, CI ve `alerts-daily`. "Patrona öneri" tablosunun 3 satırını ve pilot kapıları tablosunu kontrol ettim.
5. **Kart 4:**
   - `gh` ile 5 koşunun artifact listesini aldım. Birini indirip trace'ini kendim ayrıştırdım.
   - Playwright 1.62.1 kaynağında networkidle'ın neyi saydığını okudum.
   - se-fb'nin taşımasından sonraki koşulara baktım.

## 2. Kanıt

### Kapılar (HEAD `a51ccfa3`)

| Kapı                    | Sonuç                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm typecheck`        | rc=0                                                                                        |
| `pnpm lint`             | rc=0                                                                                        |
| `pnpm test`             | rc=0 — `Test Files 191 passed \| 2 skipped (193)` · `Tests 2202 passed \| 8 skipped (2210)` |
| `pnpm rls:check`        | rc=0 — "every one of them carries ENABLE + FORCE + tenant_isolation in its own migration"   |
| `pnpm rls:verify`       | rc=0 — "47 kiracıya özel tabloda … izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü"         |
| `pnpm rls:bypass-check` | rc=0 — "no new tenant bypass … 32 on the sanctioned cross-tenant path, 0 still owed"        |
| `pnpm i18n:check`       | rc=0 — "both catalogs agree, every key used in src/ resolves …"                             |

İlgili dosyalar ayrıca koşuldu: `tests/k3-topic-stats-parse`, `src/lib/agency/`, `ajans/actions.test.ts`, `tests/agency-invite.live`, `tests/agency-funnel.live`. Sonuç: `Test Files 8 passed (8) · Tests 120 passed (120)`, atlanan yok.

**Not (dal durumu):** Yerel `dev` ile `origin/dev` ayrışmış. `git rev-list --count origin/dev..dev` = **49**, ters yönde **6**. Kart 1–3 yalnız yerelde. Kart 4'ün `9d03f474`'ü yalnız `origin/dev`'de. Bu yüzden yukarıdaki kapılar Kart 4'ün `ci.yml`/`playwright.config.ts` değişikliğini içermiyor. Kart 4'ü CI koşularıyla (Linux) doğruladım.

### Kart 1: sunucu yanıtında sayı yok

- `grep -rn usedCount src` (testler hariç): yalnız `codes.ts:76` (sunucu tipi `InviteCodeRecord`), `:90` (durum hesabı), `:201` (select) ve iki yorum satırı. Dışarı çıkan tek tip `InviteCodeSummary`. Bu tipte `usedCount` alanı yok. Sayfa, pano action'ı ve B1'in `listAgencyInviteCodesAction`'ı üçü de `listInviteCodesIn` → `inviteCodeRow` yolundan geçiyor.
- Ret denetimi (`note_agency_invite_rejection`) `reason='exhausted'`'i ajansın kiracısına yazıyor. `src` içinde bu satırları ajansa okutan bir ekran yok (`grep agency.invite` → yalnız `created`/`revoked` yazımı). Şu an bir kanal değil. B2 panosuna "denenen kod" eklenirse kanala dönüşür (bkz. Ö-2).
- Saf fonksiyon (`tsx`, gerçek `validateInviteCodeInput` + `inviteCodeRow`):

```
maxUses=5 ret: INVALID_MAX_USES
maxUses=6 kabul
kod paneli: [[6,"exhausted"],…,[6,"active"]] usedCount alanı var mı: false
```

- **Canlı :3000** (demo girişi `b2v0219-ajans@example.org` → 302, `/tr/ajans` 200, 160.685 bayt). DB'deki tek kod 10 hakkılı ve 6 kez kullanılmış:

```
usedCount 0 · "used 0 · "6 / 10" 0 · "6/10" 0
props: \"hint\":\"5WZ2\",…,\"maxUses\":10,\"status\":\"revoked\",…
funnel: "registered":{"state":"count","value":5}
```

Önceki incelemede aynı sayfada "5" ile kesin "6" yan yana duruyordu. Artık kesin sayı görünmüyor.

### Kart 1: kendi saldırganım (MILP, funnel + kod paneli)

Yöntem: `milp2.py` + `gen2.ts` (scratchpad).

- **Veri:** `gen2.ts` her tabloyu gerçek `buildAgencyFunnel` ile yayımlıyor: none görünümü, orgType görünümü ve her il görünümü. Her kod gerçek `inviteCodeRow` + JSON'dan geçiyor. Saldırgan yalnız `maxUses` ve `status` görüyor. Üreteç ayrıca `usedCount` alanı sızarsa hata fırlatıyor.
- **Saldırganın kısıtları:**
  - her yayımlanan sayı `[max(5, v−2), v+2]` aralığında;
  - taban hücrelerde alt küme ilişkileri, tam sayı ve ≥0;
  - her kod grubu için Σ kullanım(g) = R(g) + D(g);
  - "Tükendi" ⇒ kullanım = max;
  - "Etkin" ve max ≥ 6 ⇒ kullanım ≤ max − 1;
  - iptal edilmiş ya da süresi dolmuş kod ⇒ 0 ≤ kullanım ≤ max.
- **Hedefler:** gerçek değeri 1..4 olan her gizli nicelik. Bunlar gizli hücreler, adım farkları ve her kodun kullanımı.
- **Ölçüt:** önce MILP en küçük değeri alınıyor. En küçük değer ≥ 1 ise en büyük değer de alınıyor. Sızıntı ölçütü 1 ≤ min ve max ≤ 4. LP ile budama yok, sonuçlar kesin sınır.
- **Değişkenler:**
  - üreteç: kurum düzeyi (`org`) ya da fe-fb'nin hücre üreteci (`cell`);
  - kod dağılımı: ajans geneli, **tür başına** ya da **il başına**;
  - ajansın kod verme biçimi: `six` (6 hakkılı kodlar art arda, biri tükenince yenisi) ya da `mix` (6–20 arası; iptal ve süresi dolmuş kodlar da var);
  - silinen kurum: `free` (D ≥ 0, saldırgan bilmiyor; fe-fb'nin modeli) ya da `zero` (D = 0 ve saldırgan bunu biliyor).

| Model                                                         | Tablo                    | Sızan tablo | Ne sızdı                         |
| ------------------------------------------------------------- | ------------------------ | ----------- | -------------------------------- |
| **pozitif kontrol:** eski panel (`≥5` kesin, `<5`), D ≥ 0     | 160 (global 60 + il 100) | **2 + 7**   | kod kullanımları (ör. `[1,4]`)   |
| yeni panel, D ≥ 0, 3 dağılım × 2 üreteç × 2 strateji          | 1.200                    | **0**       | —                                |
| yeni panel, **D = 0**, aynı 12 yapılandırma                   | 1.200                    | **17**      | **yalnız etkin kodun kullanımı** |
| yeni panel, D = 0, saldırgan il kümesini bilmiyor (hayali il) | 400 (4 yapılandırma)     | **4**       | etkin kodun kullanımı            |
| **"Tükendi" durumu yok** (yalnız max), D = 0                  | 1.100 (11 yapılandırma)  | **0**       | —                                |

D = 0 dökümü, sızan tablo / 100: cell-global mix 0, six 2 · cell-il mix 2, six 2 · cell-tür mix 1, six 4 · org-global mix 0, six 2 · org-il mix 0, six 2 · org-tür mix 0, six 2.

Hiçbir koşuda funnel hücresi ya da adım farkı sızmadı. Sızan her hedef bir "Etkin" kodun kullanım sayısı. Örnekler:

- `code#5[*|Tokat,active,max6] true=2 ILP=[2,2]`
- `code#1[UNIVERSITY|*,active,max12] true=1 ILP=[1,2]`
- `code#4[*|*,active,max6] true=3 ILP=[2,3]`

**Sorulara yanıt:**

- **Birleşik yanıt ve D ≥ 0 (fe-fb'nin tehdit modeli):** 1.200 tabloda açık yok. Kodlar il ya da tür başına dağıtıldığında da yok. fe-fb'nin kapısı ve benim saldırganım bu modelde aynı sonuca varıyor.
- **Kodlar il/tür başına dağıtıldığında:** Açık yalnız D = 0 bilgisiyle var. "Tükendi" gösterilmeyince bu açık da kapanıyor.
- **Açık: B-1, aşağıda.**

### Kart 2: ölçümler (yeniden)

Doğrudan `readXlsx` (tsx, `--max-old-space-size=1024`). Önceki koşudaki dosyaların aynısı kullanıldı:

```
z-row-10000.xlsx   630 bytes  11 ms ERR <row> has no matching </row>.     (önce 144 ms)
z-row-40000.xlsx   848 bytes  14 ms ERR …                                  (önce 1758 ms)
z-row-160000.xlsx 1720 bytes  18 ms ERR …                                  (önce 26613 ms)
z-c-40000 16 ms · z-si-40000 18 ms (ikisi de MALFORMED)
z-wide.xlsx  474872 bytes  67 ms ERR Workbook allocates more than 2000000 row and cell slots.  (önce 372 ms, 336 MB)
z-wide8.xlsx 474915 bytes  92 ms ERR (aynı)                                                    (önce 2681 ms, 1704 MB)
```

Gerçek rota (:3000, platform_admin demo girişi, `mode=preview`):

```
z-row-10000  -> 400 in 0.027s   {"error":"not_xlsx","message":"<row> has no matching </row>."}
z-row-40000  -> 400 in 0.013s
z-row-160000 -> 400 in 0.017s   (önce 40000 bile 9.49 s)
z-wide8      -> 413 in 0.039s   {"error":"too_large",…"2000000 row and cell slots."}
```

Büyüme eğrisi testleri, sayfa yolu tekilleştirme, sütun dolgusu bütçesi ve K-2 reddi testte ✓ (`-t` ile verbose): "refuses unclosed <row> tags in linear time", "reads a worksheet part once however many <sheet> entries point at it", "stops a column-padding bomb at the cell budget", "refuses a rate column whose scale can only be guessed".

**Yeni girdi: paylaşılan dize büyütmesi** (Ö-1). Tek bir büyük `<si>` var ve her satırın konu kodu hücresi bu dizeyi gösteriyor (`t="s"><v>0</v>`):

```
amp  1 MB × 500  satır  10442 B  read 29 ms  parse 1238 ms
amp  1 MB × 1000 satır  19545 B  read 29 ms  parse 2525 ms
amp  1 MB × 2000 satır  36985 B  read 41 ms  parse 5080 ms
amp  4 MB × 500  satır  13349 B  read 41 ms  parse 4851 ms      → süre ∝ satır × dize uzunluğu
ampl 1 MB('a') × 100 satır  3395 B  rss 214 MB · × 300 satır 6929 B  rss 397 MB (rejected[0].topicCode.len 1000000)
rota: amp 1 MB × 2000 (37 KB dosya) -> 500 in 5.15 s {"error":"import_failed"}   (:3000 ardından 200, ayakta)
```

### Kart 3: doğrulanan maddeler

`git log -1` konu satırları, ROADMAP'teki iddiayla karşılaştırıldı:

| ROADMAP iddiası                                                         | Commit / kod                                                                                                    | Sonuç |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----- |
| compose'da redis+mailpit, :5433 (`e5a6ebd5`)                            | "compose on :5433 with redis+mailpit" · `docker-compose.yml:62 redis:` `:79 mailpit:`                           | ✓     |
| CI migrations iki kez (`22c4d508`, `754aa884`)                          | "apply prisma/migrations in CI, twice" · `ci.yml:95-96` iki kez `scripts/apply-migrations.sh`                   | ✓     |
| demo girişi kilidi (`f3cb2536`, `f7a36779`)                             | "gate password-less Credentials sign-in…" · "build-time demo-login lock…"                                       | ✓     |
| CI fabrika_app + BYPASSRLS'te düşme (`2d94335c`, `6c7cfe0c`)            | iki konu satırı birebir                                                                                         | ✓     |
| AuditEvent NULL satırları (`12aacc7d`)                                  | "AuditEvent NULL rows readable/writable in system scope only"                                                   | ✓     |
| kamu TL paketleri + koltuk (`2c35e535`), faturalama bypass (`2e932ca0`) | ikisi de birebir                                                                                                | ✓     |
| G0 `g0-compute.ts` (`e816fa9f`)                                         | `git log --diff-filter=A -- src/lib/scoring/g0-compute.ts` → `e816fa9f` (konu "docs sync", ama dosyayı ekliyor) | ✓     |
| dashboard sabitleri silindi (`ed391943`, TASK-MTQWBAJ2T5XSV)            | diff'te `-…'84.2'…`, gövdede TASK-MTQWBAJ2T5XSV                                                                 | ✓     |

"Patrona öneri" tablosundan 4 satırı kontrol ettim:

- MTVU4JH5YT6UD → `0a136fbf` "move the Stripe idempotency key out of AuditEvent" ✓.
- MTVRC1UGA3B6Y → `19475379` ✓. `grep -c dedupeKey src/lib/inngest/jobs/alerts-daily.ts` = 0 ✓ ("dedupeKey yok" iddiası doğru).
- MTU27WLNS25BZ → `ce141010` + rapor `71621c27` ✓.
- MTVU6SDYSFIXU → `a97b863e` ✓.

Pilot kapıları tablosu (a–e) 29.09 anına göre doğru. (a) satırı "bağımsız inceleme bekliyor" diyor, bu da doğru. Uydurma bulamadım.

### Kart 4: CI kanıtı

```
gh api …/runs/<id>/artifacts:
36503801522: e2e-results-36503801522-1 66261606B
36503809474: e2e-results-36503809474-1 4428732B
36503812341: e2e-results-36503812341-1 20960823B
36503806283: e2e-results-36503806283-1 1594690155B   ← start modu, 71 kırmızı
36508751097: e2e-results-36508751097-1 21397616B
gh run download 36503809474 -n e2e-results-36503809474-1 → exit=0
  playwright-report/index.html + test-results/m9-ics-download-…/trace.zip
```

Trace'i kendim ayrıştırdım (`0-trace.network` + `0-trace.trace`):

```
00:49:36.530Z 304 …/[turbopack]_browser_dev_hmr-client_hmr-client_ts_1mojsay._.js
00:49:36.655Z 101 ws://localhost:3000/_next/hmr?id=sml_4OJ3lWTodP-mVKTZs
00:49:37.042Z 200 /__nextjs_font/geist-latin.woff2
error: page.waitForLoadState: Test timeout of 60000ms exceeded.   console: [HMR] connected
```

devop-fb'nin gözlemi tekrarlandı.

Playwright 1.62.1 kaynağı (`coreBundle.js`, frames.ts):

- networkidle `frame._inflightRequests` kümesiyle sayılıyor. Bu kümeye `requestStarted` ile giriliyor.
- WebSocket `Network.webSocketCreated` → `onWebSocketCreated` ile ayrı bir yoldan geliyor. `_isExcludedFromNetworkIdle` yalnız favicon ve `eventsource`'u dışlıyor.
- Yani açık bir websocket networkidle'ı **bekletmez**. Bkz. K-1.

se-fb'nin networkidle taşımasından sonra:

```
36508751097 push 056e83f6  E2E=failure (1 failed, 174 passed; saved-search:49 waitForRequest)  Upload=success
36510434729 push 959bf02c  E2E=success · 36510439038 dispatch E2E=success · 36510445197 dispatch E2E=success
```

## 3. Bulgular

### Kart 1: TASK-MUM17YBJVAHRR

**B-1: "Tükendi"/"Etkin" durumu + funnel yuvarlaması + D = 0 → etkin kodun kullanımı 1..4 aralığına düşüyor.**

- Yer: `src/lib/agency/codes.ts:87-92` (`inviteCodeStatus`: `usedCount >= maxUses && maxUses >= MIN_MAX_USES` → `exhausted`, yoksa `active`).
- Mekanizma:
  - "Tükendi" kodun kullanımını kesin veriyor (= max).
  - "Etkin" (max ≥ 6) kullanımı ≤ max − 1 sınırına koyuyor.
  - Hiçbir kurum silinmediyse (pilotta olağan durum) R = Σ kullanım.
  - Funnel'ın tür ya da il görünümündeki alt sınırlar R'yi yukarıdan ve aşağıdan sıkıştırıyor. Kalan fark etkin koda düşüyor.
- **Somut örnek** (MILP örneği `org-global-zero-six #17`; sayılar gerçek fonksiyonlardan, `tsx` çıktısı):

  ```
  27 kurum (13 MUNICIPALITY, 14 UNIVERSITY; Samsun, Tokat, ilsiz), silinen yok
  pano: ajans geneli "25" · tür görünümü MUNICIPALITY "15", UNIVERSITY "15" (diğer türler "<5")
  kod paneli: [6,"exhausted"] ×4, [6,"active"]      (ajans kodları 6'şar hakla art arda vermiş)
  ```

  Saldırgan şunu hesaplıyor:
  - Türler ayrık. "15" = 13..17 olduğundan R ≥ 13 + 13 = **26**.
  - "25" = 23..27 olduğundan R ≤ **27**.
  - D = 0 olduğundan R = 4 × 6 + a.
  - Sonuç: **a ∈ [2, 3]** (gerçek 3).

  Etkin kod o hafta bir etkinlikte dağıtılıyorsa bu "o etkinlikten 2–3 kurum kayıt oldu" demek. K-1'in engellemek istediği tam olarak bu. Yan etki olarak R'nin yuvarlama bandı da 23..27'den 26..27'ye daralıyor.

- **Yaygınlık:** D = 0 modelinde 1.200 tablonun 17'si. Kodlar il ya da tür başına dağıtılınca da var (`code#5[*|Tokat,active,max6] true=2 ILP=[2,2]`). Saldırgan il kümesini bilmese de var (400 tablonun 4'ü).
- **Neden fe-fb'nin kapısı yakalamıyor:** `funnel.attack.test.ts` D'yi serbest değişken olarak modelliyor (`DELETED`, Σ used = R + D, D ≥ 0). D ≥ 0 modelinde benim saldırganım da 0 buluyor.
- **D = 0 varsayımı neden gerçekçi:** Kurum silme KVKK talebi ve bekleme süresi gerektiriyor. Pilotta ilk aylarda silinen kurum olmaması olağan. Ajans bu kurumları kendisi davet ettiği için "kimse ayrılmadı" bilgisine kolayca sahip olabilir. fe-fb'nin R-2 notu D'nin kendisini de hassas sayıyor.
- **Düzeltme seçenekleri** (seçim leed-fb/HUKUK-5'in):
  1. **"Tükendi" durumunu kaldırmak.** Tükenen kod "Etkin" görünür. Bu fe-fb'nin §5 açık soru 1'deki seçeneği. MILP: aynı D = 0 verisinde **1.100 tablonun 0'ı** sızdı. R-2 (D kanalı) de bununla kapanır. Bedeli: ajans tükenen kodu kayıt olamayan kurumdan öğrenir. Bu bant dışı bir kanal ama "tam sayı" vermiyor.
  2. Durumu tutmak ve bu kalıntıyı R-1/R-2 ile birlikte HUKUK-5'e **açıkça risk kabulü** olarak yazmak. Bu durumda kapı (a) bir karar kaydıyla kapanır, kodla değil.
  3. Hangisi seçilirse seçilsin: `funnel.attack.test.ts`'e D = 0 varyantı eklenmeli (`hi[deleted] = 0`) ve bu örnek teste konmalı (bkz. Ö-1).

**Ö-1: Saldırgan kapısı D = 0 bilgisini modellemiyor** (`funnel.attack.test.ts`, `DELETED` değişkeni). Öneri: özellik testinin tohumlarını bir de `hi[DELETED] = 0` ile koşmak. Bu, B-1'in regresyon kapısı olur.

**Ö-2: Ret denetim satırları (`agency.invite.rejected`, `reason`, `codeId`) ajansın kiracısında duruyor** (`prisma/migrations/fix-agency-invite-rejection-audit.sql:45-64`). Migration yorumu "B2 panosu hangi kodun denendiğini gösterebilsin" diyor. Bugün bu satırları gösteren bir ekran yok, bu yüzden kanal değil. Pano bu satırları gösterirse `reason='exhausted'` durum paneliyle aynı bilgiyi, maxUses < 6 olan eski kodlar için de (R-1) verir. Pano kartına not olarak eklenmeli.

**Doğrulanan DoD maddeleri:**

- Sayı gösterilmiyor, yalnız durum: kod ✓ + canlı ✓.
- Sunucu yanıtında `usedCount` yok: 3 çıkış da `inviteCodeRow`'dan geçiyor. `actions.test.ts` ve canlı test ✓.
- maxUses ≥ 6: sunucu (`validateInviteCodeInput`: 5 ret, 6 kabul) + UI (`min={MIN_MAX_USES}`, "En az 6") ✓.
- maxUses < 6 olan eski kodlar "tükendi" göstermiyor (`codes.ts:90`) ✓.
- Saldırgan kod panelini modelliyor (R ≤ Σ used, used ≤ max, tükendi ⇒ used = max) ✓, ama D ≥ 0 ile (Ö-1).
- A/B örneği kırmızıdan yeşile: rapor çıktısı var. Test bugün yeşil ✓.
- K-1 zaman kanalı: `agency-channel-notice-addendum.md` §3.1 notu ✓.

### Kart 2: TASK-MUM187B5EN9LZ

DoD'nin hepsi sağlanıyor, ölçümleri kendim tekrarladım:

- 160.000 kapanmayan `<row>`: 26,6 sn → **18 ms** (fonksiyon) / **17 ms** (rota).
- Sayfa yolları tekilleştirildi. 8 sayfalı bomba 1,7 GB yerine 92 ms'de TOO_LARGE veriyor.
- Hücre bütçesi 2M.
- Sütun dolgusu bütçeye yazılıyor.
- K-2 belirsiz ölçekte `HorizonLayoutError` veriyor.
- Büyüme eğrisi testi var.

**Ö-1: Paylaşılan dize büyütmesi. İşlem süresi "satır × dize uzunluğu" ile büyüyor, reddedilen satırlar dizenin kopyasını tutuyor.**

- Yer:
  - `xlsx.ts:249-251` (`t="s"` hücresi paylaşılan dizeye referans veriyor, uzunluk sınırı yok);
  - `horizonDashboard.ts:277` ve `:317` (`cell(row,'topicCode').trim().toUpperCase()` her satırda dizenin tamamını kopyalıyor);
  - `:318-319` (`rejected.push({ topicCode: codeRaw, … })` kopyayı tutuyor);
  - `route.ts:29` (`rejected.slice(0, LIST_CAP=1000)` JSON'a giriyor).
- Senaryo:
  - 1 MB'lık tek bir `<si>` ve 2.000 satır, her satırda `<c t="s"><v>0</v></c>`. Dosya 37 KB.
  - Rota **5,15 sn** olay döngüsünü tutuyor ve 500 `import_failed` dönüyor. JSON en fazla 1.000 × 1 MB'lık dizeyi taşımaya çalışıyor.
  - Küçük harfli dizede (`toUpperCase` yeni kopya üretiyor) 7 KB'lık dosyada 300 satır 397 MB RSS tutuyor.
  - Sınır: `sharedStrings` parçası en fazla 50 MB, satır en fazla 100.000. Kestirim: 40 MB × 100.000 satır saatler sürer. 40 MB × 25 reddedilen satır ≈ 1 GB. Bunu koşmadım: paylaşımlı makinede çökertme denemesi yok.
- Bloke etmiyor. Rota yalnız platform_admin (önceki Ö-1 ile aynı gerekçe). Başlık yorumundaki "Time. … the scan stays linear" iddiası yalnız tarayıcı için doğru, ayrıştırma katmanı için değil.
- Düzeltme:
  - okuyucuda hücre metni sınırı (ör. `maxCellChars: 32 * 1024`, aşan hücreye TOO_LARGE ya da MALFORMED);
  - `rejected[].topicCode` ve `detail` 120 karaktere kırpılsın;
  - teste "1 MB `<si>` × 2.000 satır < 1 sn" büyüme testi eklensin.

**K-1:** `route.ts`'in `Content-Length` olmadan gövdeyi sınırsız okuması (önceki K-3) açık. be-fb kapsam dışı dedi. Kayıt olarak kalsın.

### Kart 3: TASK-MULQMNMPFY29P

**K-1:** Pilot kapıları (a) satırı bu incelemeyle değişiyor: B-1 açık. Karar ya "Tükendi durumunu kaldır" olur ya da HUKUK-5 risk kabulü olur. ROADMAP'te (a)'nın "Kart / sahip" sütununa bu rapor eklensin. Diğer her şey doğrulandı (yukarıdaki tablo). `e816fa9f`'in konu satırı "docs sync" ama `g0-compute.ts`'i ekleyen commit bu. ROADMAP bu açıdan doğru.

### Kart 4: TASK-MULXYMNTUELIK

DoD'nin hepsi sağlanıyor:

- Başarısızlıkta artifact yükleniyor. Artifact'ı indirdim ve trace'i açtım.
- `E2E_WEB_SERVER=dev|start` anahtarı var. Push ve PR'da `inputs.e2e_server` boş olduğu için `dev` kullanılıyor. `start`'ta `DEMO_LOGIN_ENABLED` verilmiyor.
- 3 koşu belgeli.
- Gerekçe doğru: start koşusundaki 71 kırmızının hepsi demo girişinden.

**K-1: Kök neden adayı için kanıt yetersiz ve mekanizma büyük olasılıkla yanlış.**

- Playwright'ta açık bir websocket networkidle'ı bekletmez (kaynak alıntısı yukarıda). "Son olay HMR websocket'i, sonra 58 sn sessizlik" gözlemi doğru ve tekrarlanıyor, ama nedensellik kurmuyor.
- Takılan şey büyük olasılıkla trace'e yazılmayan, bitmemiş bir HTTP isteği. Devop-fb'nin kendi "dürüst sınır" notu da bunu söylüyor.
- Asıl kanıt, pratik düzeltmenin tuttuğu: networkidle kaldırıldıktan sonra `959bf02c`'de **3/3 yeşil** (push + 2 dispatch).
- Adın kesinleşmesi gerekiyorsa `InflightRequests` yardımcısıyla tek bir koşu yeter. Networkidle zaten yasaklandığı (lint) için bu artık pilot için gerekli değil.

**Ö-1: `start` koşusunun artifact'ı 1,59 GB** (`e2e-results-36503806283-1`). Çok kırmızılı tek bir koşu Actions depolama kotasını doldurabilir. Öneri:

- `trace: 'retain-on-first-failure'` ya da yalnız ilk N başarısız testin trace'i;
- ya da `workflow_dispatch` koşularında `retention-days: 3`.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MUM1OTRM75QS2-crw-fb.md` (bu rapor). Başka dosyaya dokunulmadı.

## 5. Riskler

- B-1'in ciddiyeti D = 0 varsayımına bağlı. D ≥ 0 modelinde (fe-fb'nin modeli) 1.200 tabloda açık yok. Hangi tehdit modelinin geçerli olduğu bir hukuk ya da ürün kararı.
- MILP üreteçleri benim modelim: ajans kodları gruplara ayırıyor, tükenince yenisini veriyor. Başka dağıtım biçimleri, örneğin kurum başına tek kod, koşulmadı.
- Kart 4'ün değişikliği yerel `dev`'de yok (dal ayrışması, 49/6). Yerel kapılar onu kapsamıyor. Birleştirme leed-fb'nin işi.
- Kart 2 Ö-1'in büyük boyutlu hali (40 MB × 100k) koşulmadı. Kestirim, ölçülen doğrusal ilişkiden çıkarıldı.

## 6. Açık sorular

1. **leed-fb / HUKUK-5:** B-1 için hangi seçenek: "Tükendi" durumunu kaldırmak mı, risk kabulü mü? İkinci seçenek R-1 ve R-2 ile tek bir karar kaydında toplanabilir.
2. **leed-fb:** `dev` ↔ `origin/dev` ayrışması (49/6) ne zaman birleştirilecek?

## 7. Sonraki adım

- fe-fb: B-1 kararına göre ya `inviteCodeStatus`'tan `exhausted` dalı kaldırılır (i18n + test güncellemesiyle), ya da karar kaydı eklenir. Her iki durumda Ö-1 (D = 0 varyantı) teste girer.
- be-fb: Kart 2 Ö-1 için küçük kart (hücre metni sınırı + `rejected` kırpma).
- cs-fb: ROADMAP pilot kapısı (a) satırını bu kararla güncellesin.

**Platform beyanı:** İnceleme **macOS**'ta yapıldı (Darwin 27, Node 26.5.0, :3000 dev sunucusu, yerel Postgres 5433, scipy 1.13.1). Kart 4'ün kanıtı **Linux**'tan (GitHub Actions ubuntu-latest) geliyor. Artifact'ı macOS'ta indirip ayrıştırdım. Kart 1–3'teki kod saf TypeScript, SQL ve zip/dize işlemesi. Dosya yolu, süreç, kabuk ya da ekran/DPI'a bağlı kod yolu yok, bu yüzden Windows ve Linux'ta aynı davranış beklenir. Windows koşulamadı, çünkü bu ortamda Windows makine yok.
