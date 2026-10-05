# TASK-MTV50DQCQDB7B — Kapanış denetimi: üç kartın kapısı, kapattığı commit'ten ESKİ bir ağaçta mı koştu

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tip:** denetim (salt-okunur) · **Sprint:** SPRINT-S12
**Denetlenen kartlar:** TASK-MTUI9ZBK7W4JY (`3e14b40`) · TASK-MTUI9R0FOOY2J (`aef5706`) · TASK-MTUIPYSSNLVWG (`1d49048`)
**Kapsam:** ölçüm + hüküm + `docs/ROADMAP.md` madde 17 + karar notu. **Kod düzeltilmedi** (kart öyle istedi).

---

## 0. Hüküm özeti (ayrıntı §2–§4)

| Kart | Kapatan commit | Kendi raporunun kapı iddiası | Ölçüm | **Hüküm** |
|---|---|---|---|---|
| TASK-MTUI9ZBK7W4JY | `3e14b40` (09-10 09:05:31) | "`pnpm gate` YEŞİL, HEAD `aef5706`" | Kapı, kapatan commit'ten **10 sa 06 dk ÖNCE** ve **2 commit geride** koştu. İçerik ölçülmüş, **commit kimliği hiç ölçülmemiş**. | **KAPANIR** (kayıtlı çekince: §2.4) |
| TASK-MTUI9R0FOOY2J | `aef5706` (09-09 22:59:33) | Kapı **koşulmadı** (raporun kendi beyanı) | Kendi yazarı koşmadı; ama commit, dev'in 54 sn sonra başlayan kapı koşusunun ağacının **içindeydi**. Kodu değişmedi (test+doküman). | **KAPANIR** |
| TASK-MTUIPYSSNLVWG | `1d49048` (09-10 09:04:02) | Kapı **koşulmadı** (raporun kendi beyanı) | İçeriği dev'in koşusunda ölçülmüş; **commit hâli benim taze koşumda doğrulandı** (typecheck + 15/15). | **KAPANIR** |
| *(yan bulgu)* | — | — | HEAD üzerinde taze kapı **KIRMIZI** — 7 e2e. Kök neden ortam, ürün kodu değil (§5). | **AYRI KART** |

Üç kartın hiçbirinde "testi gevşeterek yeşile çevirme" bulmadım; üçü de kendi kırmızısını
mutasyonla ispatlamış. Bulduğum kusur **zamanlama ve kapsam beyanında**, iddianın içeriğinde değil.

---

## 1. Ne yapıldı

1. Üç raporu uçtan uca okudum.
2. Her raporun iddia ettiği kapı koşusunun, kartı kapatan commit'e göre **önce/sonra** olduğunu `git log` ile ölçtüm.
3. İşaretli DoD kutularının içine bakmayı denedim — **kutu yok** (§3): üç raporun hiçbiri DoD checklist'i taşımıyor. Bunun yerine kutuların işlevsel karşılığı olan **kapanış/yeşil iddialarının içine** baktım ve içinde "ama / ölçmedim / koşulamadı" geçen maddeleri alıntıladım.
4. HEAD üzerinde **tek** taze `pnpm gate` koştum; ham çıktı + HEAD hash + ölçülen ağacın envanteri §4'te.
5. Kapı kırmızı çıktı; kök nedene indirdim (§5) — **düzeltmedim**, adıyla bildiriyorum.
6. `docs/ROADMAP.md` madde 17'yi (yalnız o maddeyi) kapandı olarak güncelledim (§7).
7. Patrona 2 paragraflık karar notu (§6).

### 1.1 Okuyamadığım şey — dürüst kayıt
Kartın tam şartnamesi Task Board'da. `list_tasks` **yalnız başlık/durum/atama** döndürüyor,
`description` döndürmüyor; `attach_to_task` yalnız görsel ekliyor. Uygulamanın yerel
önbelleğinde (`~/Library/Application Support/agentdesk-shell/Cache/`) kart kimliklerini
buldum ama gövde **sıkıştırılmış** ve orada yalnız `task_attachments` sorgusu duruyor —
açıklama metni yok. Yani bu raporu **spawn metnindeki özet şartnameye** göre yazdım.
Ölçülemeyeni "ölçtüm" diye yazmıyorum; DoD kutuları bu yüzden §3'te "kutu bulunamadı"dır.

---

## 2. Zamanlama ölçümü (asıl soru)

### 2.1 Ham veri
```
$ git log -5 --date=iso-local --pretty=format:'%h | %ad | %s'
3e14b40 | 2026-09-10 09:05:31 +0300 | test(e2e): make the module gate spec measure something, and stop borrowing demo-tenant
1d49048 | 2026-09-10 09:04:02 +0300 | fix(m6): make a tenant-less scoring call impossible to compile
aef5706 | 2026-09-09 22:59:33 +0300 | test(billing): lock the plan-delete guard against planId/planVersionId drift
290cc8c | 2026-09-09 22:53:28 +0300 | fix(billing): gate checkout behind a session, and send a signed-out cart to login
72dd16f | 2026-09-09 22:46:48 +0300 | fix(billing): stop leaking raw export errors to invoice downloads
```
Raporun beyan ettiği kapı koşusu: **başlangıç 2026-09-09 23:00:27**, süre ~3.7 dk, HEAD `aef5706`.

### 2.2 Zaman ekseni
```
22:59:33  aef5706 commit'lendi                     ← TASK-MTUI9R0FOOY2J'yi kapatan commit
23:00:27  pnpm gate BAŞLADI  (HEAD = aef5706)      ← tek gerçek kapı koşusu
~23:04    pnpm gate bitti, YEŞİL
   …10 saat…
09:04:02  1d49048 commit'lendi                     ← TASK-MTUIPYSSNLVWG'yi kapatan commit
09:05:31  3e14b40 commit'lendi                     ← TASK-MTUI9ZBK7W4JY'yi kapatan commit
```

**Sonuç:** Kapı koşusu, üç kartın **ikisini** kapatan commit'lerden (`1d49048`, `3e14b40`)
**10 saatten fazla ÖNCE** yapıldı. Yalnız `aef5706` kapının ölçtüğü HEAD'in kendisiydi —
ve o kartın yazarı zaten kapıyı koşmadığını yazmış.

### 2.3 Ama "önce koştu" ≠ "yanlış şeyi ölçtü" — içeriği ayrıca ölçtüm
Kapının ölçtüğü şey commit değil, **ağaç**tır. O koşu paylaşılan çalışma ağacında yapıldı ve
o ağaçta her üç kartın da commit'lenmemiş dosyaları duruyordu. Bunun kanıtı üç bağımsız
raporun vitest sayıları — birbirini bracketliyor:

| Kaynak | `pnpm test` sonucu | Yorum |
|---|---|---|
| TASK-MTUI9R0FOOY2J raporu | `139 passed (141)` / `1655 passed` | dse'nin dosyası ağaca girmeden önce |
| TASK-MTUIPYSSNLVWG raporu | `140 passed (142)` / `1670 passed` | +1 dosya, +15 test (kendi dosyası) |
| TASK-MTUI9ZBK7W4JY kapı koşusu | `140 passed (142)` / `1670 passed` | **aynı ağaç** |
| **Benim taze koşum (HEAD)** | `140 passed (142)` / `1670 passed` | **aynı sayılar, commit'li hâlde** |

Yani 23:00'daki kapı, `1d49048`'in ve `3e14b40`'ın **içeriğini** ölçmüştü; sadece o içerik
henüz commit değildi. Benim taze koşumun aynı sayıları vermesi bu zinciri kapatıyor.

### 2.4 Kalan gerçek boşluk — `3e14b40`'ın commit hâli hiç ölçülmedi
Bu, denetimin en keskin bulgusu ve **kartın kendi raporunda yok**:

- dev'in kapısı `3e14b40`'tan **önce** koştu → commit'i değil, commit-öncesi ağacı ölçtü.
- Benim kapım `3e14b40`'tan **sonra** koştu, **ama** `tests/e2e/module-gate.spec.ts` benim
  snapshot'ımdan **6 saniye sonra** (09:26:09) bir başka ajan tarafından yeniden yazılmıştı
  (TASK-MTV4YSO4SEMGG, başlığı `t()`'ye taşıma). Yani benim e2e'm de commit'li spec'i değil,
  **bir sonraki kartın spec'ini** ölçtü.

```
$ git status --porcelain -- tests/e2e/module-gate.spec.ts
 M tests/e2e/module-gate.spec.ts
$ stat -f '%Sm %N' -t '%H:%M:%S' tests/e2e/module-gate.spec.ts
09:26:09  tests/e2e/module-gate.spec.ts        ← kapım 09:26:14'te başladı
```
```
$ git show 3e14b40:tests/e2e/module-gate.spec.ts | grep -n PIPELINE_HEADING
42:const PIPELINE_HEADING = 'Fırsat & Teklif Boru Hattı';     ← commit'li hâl: düz dizge
$ grep -n "PIPELINE_HEADING = {" tests/e2e/module-gate.spec.ts
55:const PIPELINE_HEADING = {                                  ← ölçülen hâl: katalogdan
```

**Bu bir kırmızı değil, bir boşluk:** `3e14b40`'ın commit'lediği (spec = düz dizge) +
(board.tsx = gömülü Türkçe) çifti kendi içinde tutarlıdır ve dev'in koşusunda yeşildi; ağaçtaki
yeni çift (spec = katalog) + (board.tsx = `t()`) de kendi içinde tutarlıdır ve benim koşumda
yeşildi (§4, test 89–91). Ama **hiçbir kapı koşusu tam olarak `3e14b40`'ın ağacını ölçmedi**.
Risk düşük, sıfır değil; kayda geçiriyorum.

Diğer iki kart için böyle bir boşluk **yok** — dosyaları çalışma ağacında temiz, yani benim
kapım onların **commit'li hâlini** ölçtü:
```
src/lib/billing/plan-admin.test.ts             CLEAN (= committed state measured)
src/modules/m6/server/scoring.ts               CLEAN (= committed state measured)
tests/modules/m6/scoring-tenant-scope.test.ts  CLEAN (= committed state measured)
tests/e2e/plan-entitlement.spec.ts             CLEAN (= committed state measured)
scripts/seed-plan-e2e.ts                       CLEAN (= committed state measured)
```
```
$ npx vitest run src/lib/billing/plan-admin.test.ts tests/modules/m6/scoring-tenant-scope.test.ts
 Test Files  2 passed (2)
      Tests  40 passed (40)          ← 25 (plan-admin) + 15 (scoring-tenant-scope)
```

---

## 3. "İşaretli DoD kutularının içine bak" — kutu yok, itiraf var

```
$ grep -n "\[x\]\|\[ \]\|- \[" docs/agent-results/TASK-MTUI9ZBK7W4JY-*.md \
      docs/agent-results/TASK-MTUI9R0FOOY2J-*.md docs/agent-results/TASK-MTUIPYSSNLVWG-*.md
(eşleşme yok — exit 1)
```
Üç raporun **hiçbirinde** DoD checklist'i yok (depodaki başka raporlarda var, ör.
`TASK-MTQ3DLVLT42VF-customer-support.md`). Kutular kart açıklamasında kalmış; §1.1'deki
sebeple onlara erişemedim. Bu yüzden kutunun işlevsel karşılığına — **"bitti/yeşil" diyen
cümlelere** — baktım. Üçü de itirafı cümlenin İÇİNE koymuş; hiçbiri gizlememiş:

**TASK-MTUI9ZBK7W4JY** — başlık "evet, artık kapanıyor" diyor, içi şunu diyor:
> "**Dürüst kayıt için:** bu koşu benim çalışma ağacımdaki commit'lenmemiş değişiklikleri de
> içeriyordu (aşağıdaki 4 dosya) ve ağaçta o sırada başka ajanların işi de duruyordu; yani
> **'yalnız `aef5706`' değil**, '`aef5706` + o anki çalışma ağacı' ölçüldü."

Ve "Kapı durumu: **YEŞİL**" kutusunun içinde, commit satırının kendisi:
> "**Commit:** `aef5706` (**+ o andaki paylaşılan çalışma ağacı**, benim 4 dosyam dahil)"

→ Yani yeşil kapı hiçbir commit'e ait değil. Bu, §2.4'teki boşluğun ta kendisi — rapor onu
**doğru** tarif etmiş, ama sonucu ("o hâlde `3e14b40` ölçülmemiş olacak") çıkarmamış.

**TASK-MTUIPYSSNLVWG** — "Platform beyanı: … doğrulandı" cümlesinin içinde:
> "**Koşulmadı:** `pnpm test:e2e`, `pnpm gate`, veritabanına dokunan hiçbir komut — bu turda
> blok-zincir-dev'e ayrılmıştı (çakışma kuralı)."

Risk 2'de aynı şey ikinci kez:
> "e2e **koşulamadı** (dev'e ayrılmıştı). … yine de kapı koşusunda M6 senaryoları izlenmeli."

**TASK-MTUI9R0FOOY2J** — "Kanıt" başlığının içinde:
> "`pnpm test` (tam vitest süiti — `pnpm test:e2e`/`pnpm gate`/`pnpm dev` **KOŞULMADI**, çakışma kuralı)"

ve ölçmediğini adıyla söylediği yer:
> "**Kaç satır çelişiyor — ölçülemedi, uydurulmadı:** … Canlı DB'de başka çelişkili satır olup
> olmadığını 'ölçtüm' diye yazmıyorum çünkü **ölçmedim**."

ve kendi kapanışına koyduğu şart:
> "**TASK-MTUI9ZBK7W4JY tamamlanmadan bu görev 'kapalı' sayılmamalı**"
→ Bu şart **artık karşılandı** (`3e14b40` indi). Madde 17 kapanışı buna dayanıyor (§7).

**Denetçi notu:** Bu üç alıntı bir suçlama değil, tersi — üç ajan da kendi eksiğini
raporun içine yazmış. Kusur, bu itirafların **kart kapanışına taşınmamış** olması: üç kart
`review`'a alınırken "kapı yeşil" başlığı görünüyor, bu cümleler görünmüyor.

---

## 4. HEAD üzerinde tek taze `pnpm gate` — HAM ÇIKTI

### 4.1 Koşunun ölçtüğü şeyin künyesi
```
date        : 2026-09-10 09:26:03 +0300
HEAD        : 3e14b404c2b4c9a1792d6034e63b9e86bb57a20c
HEAD short  : 3e14b40
branch      : dev
```
**Ölçülen ağaç = `3e14b40` + o anki paylaşılan çalışma ağacı.** (Bu koşuyu commit'e eşitleyemem:
ağaç bana ait değil, dörder ajan aynı anda yazıyor. §2.4'te eleştirdiğim şeyi kendim
tekrarlamamak için ağacın envanterini veriyorum.) Koşu anında commit'siz **kaynak** dosyalar:
```
messages/en.json                                     (09:25:36)
messages/tr.json                                     (09:25:36)
src/app/[locale]/(app)/[workspace]/pipeline/board.tsx (09:27:10 — koşu SIRASINDA değişti)
src/lib/llm.ts
tests/e2e/module-gate.spec.ts                        (09:26:09 — snapshot'tan 6 sn SONRA)
```
Koşu sırasında **HEAD de ilerledi**: `02f3a20` (09:31:35) indi. İçeriği yalnız
`docs/` + `.agentspace/memory/` — **kaynak dosya yok**, dolayısıyla kapı sonucunu değiştiremez:
```
$ git log --name-only --oneline 3e14b40..HEAD
02f3a20 docs(m6): spike — measure the blast radius of a branded TenantScopedDb, ship no code
.agentspace/memory/agents/blok-zincir-dse/branded-type-fails-where-as-unknown-as-already-lives.md
.agentspace/memory/agents/blok-zincir-dse/dead-overload-that-still-teaches.md
docs/agent-results/TASK-MTV4ZJEECXNDE-blok-zincir-dse.md
```

### 4.2 Ham çıktı
```
START 09:26:14
$ prisma generate                     → ok
$ eslint
✖ 2 problems (0 errors, 2 warnings)   → docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/*.mts (önceden var)
$ tsc --noEmit                        → çıktı yok = temiz
$ vitest run --passWithNoTests
 Test Files  140 passed | 2 skipped (142)
      Tests  1670 passed | 8 skipped (1678)
$ tsx scripts/i18n-check.ts
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
$ tsx scripts/check-rls.ts
✅ SUCCESS: All 44 tenant-scoped models have RLS policies registered.
$ tsx scripts/check-rls-live.ts
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
✅ 44 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü: okuma ve yazma, kiracı sınırında reddedildi.
$ playwright test
  ✓   89 tests/e2e/module-gate.spec.ts:64:7 › a module page is never served without a session (642ms)
  ✓   90 tests/e2e/module-gate.spec.ts:86:7 › M5 is ON, so the pipeline board renders — and /firsatlar is the same module (919ms)
  ✓   91 tests/e2e/module-gate.spec.ts:103:7 › M3 is OFF, so the Evidence Pack is refused — and the reason is the switch (883ms)
  ✓  103 tests/e2e/plan-entitlement.spec.ts:100:7 › Basic cannot reach M6 and Ultra can (2.6s)
  7 failed
    tests/e2e/invoice-export-real-record.spec.ts:150:7 › the tenant own invoice renders that row, and nothing invented
    tests/e2e/invoice-foreign-currency-export.spec.ts:166:7 › the USD document prices the sale in dollars …
    tests/e2e/invoice-foreign-currency-export.spec.ts:203:7 › the XML declares one currency and uses it on every amount
    tests/e2e/invoice-foreign-currency-export.spec.ts:213:7 › the XML carries the TCMB rate the row was issued at
    tests/e2e/invoice-foreign-currency-export.spec.ts:259:7 › the printable page a customer sees agrees with itself
    tests/e2e/invoice-write-path.spec.ts:131:5 › a payment issues one invoice, and the export route serves it
    tests/e2e/invoice-write-path.spec.ts:192:5 › two concurrent payments get two distinct numbers
  1 skipped
  139 passed (3.5m)
[ELIFECYCLE] Command failed with exit code 1.
EXIT_CODE=1
END 09:30:08
```

### 4.3 Kapı hükmü
**KIRMIZI (exit 1).** İlk 7 aşama geçti; 8. aşama (`test:e2e`) 7 testte kırıldı.
Üç denetlenen kartın kendi testleri (89, 90, 91, 103 + vitest 40/40) **yeşil** —
kırmızı onların kapsamında değil, fatura ihracat yolunda.

> Not: arka plan görevi bildirimi "exit code 0" dedi; bu **sarmalayıcı** kabuğun çıkışıdır
> (son komut `echo` idi). Kapının gerçek çıkışı log'daki `EXIT_CODE=1`'dir. Kapıyı yeşil
> göstermemek için bunu açıkça yazıyorum.

---

## 5. AYRI KART — kapıyı kırmızı yapan şey ürün kodu değil, koşum ortamı

**Belirti:** 7 fatura e2e'si `expect(res.status()).toBe(200)` yerine **503** alıyor.

**Kök neden (ölçüldü, tahmin değil):** `playwright.config.ts:46` `reuseExistingServer: !process.env.CI`.
Makinede **zaten koşan** bir `next dev` vardı ve Playwright kendi sunucusunu başlatmak yerine
onu yeniden kullandı — o sunucuda `testEnv` (`playwright.config.ts:22-28`) **hiç uygulanmadı**:

```
$ lsof -nP -iTCP:3000 -sTCP:LISTEN ; ps -o lstart= -p 68432
node 68432 …  Thu Sep 10 09:25:27 2026   next-server (v16.3.4)   ← kapım 09:26:14'te başladı
$ ps eww -o command= -p 68432 | tr ' ' '\n' | grep -c INVOICE_SUPPLIER
0                                        ← sunucunun ortamında supplier değişkeni YOK
$ grep -ac "invoice supplier identity not configured" .next/dev/logs/next-development.log
14                                       ← 503'ü üreten dalın kendi log satırı
$ grep -c INVOICE_SUPPLIER .env
0
```
Zincir tam: `.env`'de değişken yok → yabancı dev sunucusu onlarsız ayakta →
`buildInvoiceDocument` `SupplierNotConfiguredError` atıyor →
`export/route.ts:129-135` **503** dönüyor → 200 bekleyen 7 test kırmızı.

**Bu bir regresyon DEĞİL, yalancı kırmızı.** Testler doğru davranıyor: TASK-MTU26XBVZ6H1O tam da
"503 dalında sessizce yeşil olmasınlar" diye bunları 200'e bağlamıştı. **Testi gevşetmedim.**

**Doğrulamayı tamamlayamadığım yer — dürüst kayıt:** Aynı 7 spec'i env'i taşıyan kendi
sunucumda koşmayı denedim (`E2E_PORT=3100`), Next reddetti:
```
$ E2E_PORT=3100 npx playwright test tests/e2e/invoice-*.spec.ts
[WebServer] ⨯ Another next dev server is already running.
[WebServer] - PID: 68432 …  or run kill 68432 to stop it and start a new one.
Error: Process from config.webServer was not able to start. Exit code: 1
```
`kill 68432` **yapmadım** — o süreç kardeş pane'e ait, kural gereği dokunulmaz. Bu yüzden
"env verilince 7'si de yeşil" iddiasını **ölçmedim**; kanıtım kök nedenin kendisi
(sunucunun boş ortamı + 14 satırlık log + `.env`'de sıfır eşleşme), yeşil bir koşu değil.

**Neden ayrı kart:** kusur kapının **güvenilirliğinde** — aynı commit, makinede kimin dev
sunucusu açık olduğuna göre yeşil veya kırmızı veriyor. Bu bir "yalancı kırmızı"yı bugün
üretti; ters yönde **yalancı yeşil** de üretebilir (bayat sunucu = bayat kod). Öneri (bu kartta
uygulamadım): `.env.example`'a `INVOICE_SUPPLIER_*` eklemek **yetmez** — asıl düzeltme kapı
koşarken `reuseExistingServer`'ı kapatmak ya da sunucunun ortamını koşumdan önce doğrulamak.
Depoda bu tuzağı zaten tarif eden not var: `.agentspace/memory/agents/blok-zincir-dev/fabrika-playwright-reuseexistingserver-ci-guard.md`
— o not riski yalnız CI'ya bağlamış; bu ölçüm **paylaşılan geliştirme makinesinde de**
gerçekleştiğini gösteriyor.

**Yolda görülen, düzeltilmeyen (bildirim):** `pnpm lint`'teki 2 uyarı
(`docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts`, `f4-rag-probe.mts` —
kullanılmayan `R` ve `_url`). Kapı `--max-warnings` kullanmadığı için kırmızı yapmıyor.
Üç raporun ikisi de bunu zaten bildirmiş; ben de dokunmadım.

---

## 6. Patrona karar notu — silinen planın CANCELED tarihçesi

**Gerilim.** `publishVersion` (`plan-repository.ts:690-694`) abonelikleri yeni sürüme taşırken
bunu bilerek yalnız canlı satırlarla sınırlar ve gerekçesini yorumda yazar: *"Scoped to
LIVE_SUB_STATUSES on purpose: a CANCELED row keeps the version it ended on, so the history
still says what it was sold under."* Yani ürün, iptal edilmiş bir aboneliğin
`planVersionId`'sini **tarihsel bir kayıt** sayıyor: "bu müşteri şu sürümün şartlarıyla
ayrıldı". Ne var ki `deletePlan` (`:775-785`) aynı kaydı sessizce siliyor. Silme muhafızı
yalnız **canlı** abonelikleri sayıyor (`countLiveSubscriptions`, `LIVE_SUB_STATUSES =
ACTIVE|TRIALING|PAST_DUE`), dolayısıyla yalnızca CANCELED satırların bağlı olduğu bir plan
"kimse kullanmıyor" sayılıp silinebiliyor; ardından `tx.planVersion.deleteMany({ where:
{ planId } })` sürümleri kaldırıyor ve `Subscription.planVersionId` üzerindeki FK
(`schema.prisma:315`, `onDelete: SetNull`) o iptal satırlarının sürüm işaretçisini **NULL'a
düşürüyor**. Sonuç: `publishVersion`'ın korumak için özel kod yazdığı tarihçe, `deletePlan`
tarafından uyarısız siliniyor — üstelik operatöre "N canlı abonelik var" uyarısı da
gösterilmiyor, çünkü guard bu satırları hiç görmüyor. Bu bir veri **kaybı** kapısıdır, bir
hata değil: kod yazıldığı gibi çalışıyor, iki yer birbiriyle çelişiyor.

**Karar gereken şey, ve seçenekler.** Soru şudur: *iptal edilmiş bir abonelik, artık var
olmayan bir planın sürümünü hatırlamalı mı?* (a) **"Tarihçe korunur"** dersen `deletePlan`
canlı olmayan referansları da saymalı ve plan silinmek yerine **arşivlenmeli** —
`archivePlan` zaten var ve tam bu amaçla yazılmış ("still resolvable by everything that
references it"); bu, `publishVersion`'ın niyetiyle tutarlı olur ve muhasebe/denetim tarafında
"hangi şartlarla satıldı" sorusunu cevaplanabilir bırakır. (b) **"Silinen plan tümüyle
gider"** dersen `publishVersion`'daki yorum yanıltıcıdır ve düzeltilmelidir; ayrıca iptal
satırının sürüm bilgisini kaybetmemek için terimlerin `Subscription` üzerine (ya da bir
denetim kaydına) **kopyalanması** gerekir — işaretçi yerine anlık görüntü. Benim önerim
**(a)**: `archivePlan` zaten mevcut, değişiklik guard'ın sayım kapsamını genişletmekle sınırlı
ve geri dönülemez veri kaybını geri dönülebilir bir arşivlemeye çeviriyor — (b) ise şema
değişikliği ve migration gerektiriyor. **Bu kartta hiçbir şeyi düzeltmedim**; karar patronun,
ve hangi seçenek seçilirse seçilsin ayrı bir kart ister. Madde 17 bu gerilimi **kapsamıyor**
(§7): orada karara bağlanan şey guard'ın `planId` sayması, bu ise silmenin tarihçeye etkisi.

---

## 7. `docs/ROADMAP.md` madde 17 — kapandı olarak güncellendi

Yalnız 143. satır (madde 17) değişti; tek hunk:
```
$ git diff --stat -- docs/ROADMAP.md
 docs/ROADMAP.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
$ git diff -U0 -- docs/ROADMAP.md | grep -c "^@@"
1
```
Başlığa `[KAPANDI 2026-09-10]` eklendi ve kapanış gerekçesi yazıldı: maddeyi açık tutan tek
şart, TASK-MTUI9R0FOOY2J raporunun kendi koyduğu şarttı ("TASK-MTUI9ZBK7W4JY tamamlanmadan
kapalı sayılmamalı"); o kart `3e14b40` ile indi, `setPlan()` artık `planVersionId: null` da
yazıyor, cırcırı üreten yol kapandı. §6'daki `SetNull`/tarihçe gerilimi maddenin **dışında**
bırakıldı ve bu rapora işaret edildi.

---

## 8. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `docs/ROADMAP.md` | yalnız madde 17 (143. satır) — kapandı işareti + gerekçe + §6'ya çapraz referans |
| `docs/agent-results/TASK-MTV50DQCQDB7B-blok-zincir-denet-i.md` | bu rapor (YENİ) |
| `.agentspace/memory/agents/blok-zincir-denet-i/*.md` | §11'deki hafıza kayıtları |

**Kod DEĞİŞTİRİLMEDİ.** Denetlenen üç kartın dosyalarına, `src/`'e, `tests/`'e dokunulmadı.
`git add -A` / `git commit -a` kullanılmadı; yalnız yukarıdaki yollar adıyla eklendi.

---

## 9. Riskler

1. **Bu raporun kapı kanıtı da bir commit'e ait değil** — §4.1'de künyesini verdim. Paylaşılan
   ağaçta çalışırken bundan kaçış yok; tek savunma envanteri yazmak. §2.4'ü kendi koşuma da
   uyguluyorum.
2. **`3e14b40`'ın commit hâli hâlâ ölçülmemiş durumda** (§2.4). Ağaçtaki i18n işi (TASK-MTV4YSO4SEMGG)
   commit'lendiğinde koşulacak ilk kapı bunu kapatacak; o kapı kırmızı olursa sebebi bu
   kartlarda değil, iki değişikliğin kesişiminde aranmalı.
3. **Kapı bugün kırmızı** (§5). Yalancı kırmızı olduğuna dair kanıtım kök nedendir, yeşil bir
   koşu değil — kardeş süreci öldüremediğim için o koşuyu yapamadım. Env'i taşıyan bir
   makinede tekrar koşulmalı.
4. **DoD kutuları okunamadı** (§1.1/§3). Hüküm, kutuların değil raporların içeriğine dayanıyor.
   Kartlarda kutu metni farklıysa hüküm değişebilir.

## 10. Açık sorular

1. §6'daki karar: `archivePlan` genişletilsin mi (a), yoksa `publishVersion`'ın yorumu mu
   düzeltilsin (b)? Ayrı kart açılsın mı?
2. §5 için ayrı kart açayım mı — yoksa `pnpm gate` sahibi olan kart altında mı ele alınsın?
3. `list_tasks` `description` döndürmediği sürece denetçi kartların DoD kutularını okuyamaz.
   Board aracına `get_task` eklenmesi istenir mi?

## 11. Sonraki adım

- Patron §6 ve §10.1'e karar versin; kararla birlikte kart açılsın.
- §5 için ayrı kart (kapı güvenilirliği) — bendeki öneri `reuseExistingServer` + env doğrulaması.
- Üç kart `review` → `done` alınabilir (hükümler §0); `3e14b40` için §9.2 not düşülsün.

---

## Platform beyanı

**mac** (darwin 25.6.0, Apple Silicon, zsh) üzerinde doğrulandı: `pnpm gate` tam koşu
(8 aşama, `EXIT_CODE=1`), hedefli `vitest`, Playwright/Chromium ile gerçek tarayıcı koşusu,
ve `git`/`lsof`/`ps`/`stat` ile canlı süreç ölçümü.

**Windows / Linux: koşulamadı** — bu turda o platformlarda makine yok. Bu görevde
**kaynak kodu değiştirmedim**, dolayısıyla ürün davranışı için taşınabilirlik iddiam yok.
Ancak §5'te kullandığım **teşhis yolu platforma bağlıdır** ve koddan şunu söyleyebilirim:
`lsof -nP -iTCP:3000`, `ps eww`, `stat -f` ve `.next/dev/logs/` okuması **POSIX/macOS'a
özgüdür** — Linux'ta `ps eww` ve `lsof` çalışır ama `stat -f '%Sm'` GNU `stat` ile
uyumsuzdur (`stat -c %y` gerekir); Windows'ta üçü de yoktur (karşılıkları
`Get-NetTCPConnection` / `Get-Process`). Kök nedenin **kendisi** (Playwright'ın
`reuseExistingServer` ile yabancı bir sunucuyu yeniden kullanması) platformdan bağımsızdır:
`playwright.config.ts:46`'daki koşul yalnız `process.env.CI`'ya bakar, işletim sistemine
bakmaz — yani aynı yalancı kırmızı/yeşil Windows ve Linux'ta da üretilir. Değiştirdiğim tek
dosya `docs/ROADMAP.md` (düz metin) olduğu için platform farkı taşımaz.
