# TASK-MTVRC1UGA3B6Y — `alertsSweep` sessiz başarısızlığı görünür oldu

**Ajan:** devop-fb (DevOps / Altyapı) · **Tarih:** 2026-09-10
**PLATFORM BEYANI:** macOS (darwin 25.6.0) üzerinde doğrulandı — birim testler, canlı Postgres koşumu
ve gerçek Chromium e2e hepsi bu makinede koştu. Windows/Linux'ta **koşulamadı**; dokunduğum kod yolu
platforma bağlı değil (süreç öldürme, dosya yolu, kabuk adı, DPI, cihaz izni yok — yalnız Prisma
sorguları, zod şeması ve saf TypeScript). Ekran görüntüsündeki tarih/saat biçimi kullanıcının
yerel ayarından gelir, koda gömülü değil.

---

## 0. Kart kapsamı ile kodun uyuşmadığı yer (önce bu)

Kart **`src/lib/inngest/jobs/alerts-daily.ts`** diyor. `alertsSweep` o dosyada değil:
`src/lib/inngest/jobs/alerts-sweep.ts`'te. `alerts-daily.ts` başka bir işi (kayıtlı arama
e-postaları) tutuyor ve `success:false` hiç döndürmüyor — misyon metnindeki davranış
(`success:false` yalnız konsola yazıyor) yalnız `alerts-sweep.ts`'te var:

```
$ grep -rn "alertsSweep" src | grep -v node_modules
src/app/api/inngest/route.ts:11:  alertsSweep,
src/lib/inngest/jobs/alerts-sweep.ts:117:export const alertsSweep = inngest.createFunction(
src/lib/inngest/jobs/index.ts:9:export { alertsSweep } from './alerts-sweep';
```

Misyonu esas aldım: **`alerts-sweep.ts`** düzeltildi, `alerts-daily.ts`'e dokunulmadı. Kapsamın
geri kalanına (`src/lib/observability/**`, `src/lib/env.ts`, kendi test dosyalarım) harfiyen uyuldu;
`src/lib/billing/**`, `tsconfig.json`, `scripts/` kapı betikleri ve başkasının `tests/` dosyaları
**değiştirilmedi**.

---

## 1. ÖNCE ÖLÇÜM — bugün ne oluyor, iz nereye gidiyor

Ölçüm betiği: `.qa-scratch/devop-fb/measure-baseline.ts` (git-ignore'lu; canlı DB'ye salt-okunur,
arıza matrisi bellek-içi sahtelerle — tek satır yazmaz).

```
=== 1. LIVE DB: what trace does a failed sweep leave behind? ===
SystemAlert rows total        : 38
  open (resolvedAt IS NULL)   : 38
  source = 'alerts-sweep'     : 0   <-- rows the sweep itself ever wrote
open rows by source           :
      8  k2_monthly_cordis
      7  k1_daily_calls
      6  cordis-sync
      5  cordis-delta
      4  beta-feedback
      3  invoice_not_issued
      2  invoice_vat_country_unknown
      1  invoice_buyer_identity_missing
      1  invoice_profile_assumed
      1  m10_document_generation_failed

=== 2. LIVE DB: the real sweep, happy path (baseline) ===
return  : {"success":true,"scanned":34,"closed":0}
console : (nothing)

=== 3. FAULT MATRIX: every seam inside the try block (in-memory fakes) ===
A  scan query throws        (systemAlert.findMany)
     return          : {"success":false,"scanned":0,"closed":0}
     rows ACTUALLY closed : 0  []
     console.error   : [alerts-sweep] failed: connect ECONNREFUSED 127.0.0.1:5432
     SystemAlert row written by the sweep: 0 (the function has no write path)
B  tenant lookup throws     (tenant.findMany)
     return          : {"success":false,"scanned":0,"closed":0}
     rows ACTUALLY closed : 0  []
     console.error   : [alerts-sweep] failed: relation "Tenant" does not exist
     SystemAlert row written by the sweep: 0 (the function has no write path)
C  close write throws       (systemAlert.update, first row)
     return          : {"success":false,"scanned":0,"closed":0}
     rows ACTUALLY closed : 0  []
     console.error   : [alerts-sweep] failed: permission denied for table "SystemAlert"
     SystemAlert row written by the sweep: 0 (the function has no write path)
D  close write throws MID-LOOP (row 2 of 3)
     return          : {"success":false,"scanned":0,"closed":0}
     rows ACTUALLY closed : 1  [a1]      <-- SAYAÇ YALANI
     console.error   : [alerts-sweep] failed: permission denied for table "SystemAlert"
     SystemAlert row written by the sweep: 0 (the function has no write path)
```

### 1.1 Hangi koşullarda `success:false` dönüyor

`try` bloğunun içindeki **her** seam. Üç tane var ve hepsi tek bir `catch`'e düşüyor: aday
sorgusu (`systemAlert.findMany`), kiracı arama (`tenant.findMany`), kapatma yazımı
(`systemAlert.update`, satır başına). Dördüncü bir yol daha var — `AlertsSweepOutputSchema.parse`
— ama girdisi kod tarafından üretildiği için pratikte atmıyor.

### 1.2 Kaç kez oluyor — cevaplanamıyor, ve asıl bulgu bu

Üretim verisinden ölçülemez ve bu bir eksiklik değil, **kusurun kendisi**:

- `source = 'alerts-sweep'` satır sayısı **0** — iş bugüne dek kendisi hakkında tek satır yazmadı.
- Şemada `JobRun` benzeri bir koşum tablosu **yok** (`grep -n "^model " prisma/schema.prisma`
  → job/run/cron adlı model yok).
- İş `throw` etmiyor; `step.run` dönen `success:false`'u okumaz, dolayısıyla Inngest koşumu
  **SUCCEEDED** işaretler → yeniden deneme yok, başarısızlık bildirimi yok.

Yani günlük cron ilk günden beri ölü olsa bile bunu söyleyecek tek yüzey, kimsenin okumadığı bir
`console.error` satırıydı. "Kaç kez oldu" sorusunun cevabı ölçülemiyor **çünkü** hiçbir yere
yazılmıyordu.

### 1.3 Yanında çıkan ikinci kusur: sayaç yalanı (Case D)

`catch` bloğu koşulsuz `scanned:0, closed:0` döndürüyordu. Üç öksüzden ikincisinin `update`'i
patladığında **bir satır gerçekten kapatılmıştı** ve iş sıfır bildirdi. Elle yeniden koşacak
operatör, süpürmenin yarıda kaldığını değil hiç dokunmadığını okuyor. Düzeltildi.

---

## 2. Ne yapıldı

### 2.1 Görünürlük — iki satır, kararlı `dedupeKey` ile

Başarısızlık artık operatörün zaten baktığı yere (`/admin/alerts`) yazılıyor:

| Satır | Seviye | `dedupeKey` | Ne zaman |
|---|---|---|---|
| `Orphan-alert sweep did not complete …` | `info` | `alerts-sweep:run-failed` | Her başarısız koşu. Tekrarlar **bu tek satıra katlanır**; `alertRepeatCount` = ardışık başarısızlık sayısı. |
| `Orphan-alert sweep has failed N or more consecutive runs …` | `error` | `alerts-sweep:failing-repeatedly` | Sayaç eşiğe ulaşınca. |

`dedupeKey` **sabit**. Koşudan koşuya değişen hiçbir şey (hata metni, başarısız aşama, tarama
sayıları) anahtarda değil — hepsi görüntüleme detayı olarak `meta`'da. Gerekçe ex-en'in kuralıyla
aynı (`TASK-MTVRBLKRUUEUM` §1.2): anahtar **hangi problem** olduğunu söyleyeni tutar, **hangi
oluşum** olduğunu söyleyeni almaz. Tamamlanamayan bir süpürme, hangi sorgu patlarsa patlasın tek
problemdir; operatörün eylediği cümle "günlük süpürme koşmuyor".

**Aşama (`stage`) bilerek anahtarda değil.** Pazartesi kiracı aramasında, salı kapatma yazımında
patlayan bir iş iki ayrı problem için değil, iki kez başarısız olmuştur; aşamayı anahtara koymak
belirti her yer değiştirdiğinde sayacı sıfırlardı.

### 2.2 Eşik — tek geçici hata kimseyi uyandırmaz

`ALERTS_SWEEP_FAILURE_THRESHOLD` (varsayılan **3**), `src/lib/env.ts` üzerinden. `process.env`
doğrudan okunmuyor (CLAUDE.md). Zod `0`'ı ve sayı olmayan metni **boot'ta** reddediyor:

```
$ ALERTS_SWEEP_FAILURE_THRESHOLD=0 npx tsx -e "import { env } from './src/lib/env'"
❌ Invalid environment variables: ALERTS_SWEEP_FAILURE_THRESHOLD: Too small: expected number to be >=1
$ ALERTS_SWEEP_FAILURE_THRESHOLD=5 …  → set = 5 number
$ ALERTS_SWEEP_FAILURE_THRESHOLD=  …  → blank = 3      (boş = ayarsız)
$ (ayarsız)                          → default = 3 number
```

Eşiğin altında yalnız `info` seviyesinde bir iz kalır; `error` satırı — yani "birini uyandıran"
satır — eşiğe ulaşılmadan **yazılmaz**. Başarılı bir koşu ikisini de `resolveAlerts` ile kapatır,
böylece bir gecelik takılma kendi kendini iyileştirir ve sayaç sıfırdan başlar.

**Sayaç neden bir alarm satırında?** İş bir cron çağrısı olarak koşuyor; modül düzeyinde bir
değişken her koşuda taze sıfır olur ve eşik yapısal olarak asla erişilemez. Migration bu kartın
kapsamında değil, dolayısıyla `SystemAlert` elde olan tek kalıcı depo — ve `recordAlert` zaten
katlanmış `repeatCount`'u döndürüyor: streak o sayı.

### 2.3 Sır sızıntısı: ham hata metni alarma girmiyor

`recordAlert`'in kendi `catch`'i zaten söylüyor: bir sürücü hatası bağlantı dizesini taşıyabilir ve
`SystemAlert`'in RLS politikası **yok**. Bu yüzden `meta.error` yalnız hatanın **sınıfını** ve
varsa sürücü kodunu taşıyor (`PrismaClientValidationError`, `Error:42501`). Tam metin, eskiden
olduğu yerde — iş logunda — kalıyor. Birim testte ve e2e'de ayrıca **iddia ediliyor**.

### 2.4 `env`'i sayı yapmak `pnpm typecheck`'i kırdı — ölçüldü, geri alındı

İlk sürüm `z.coerce.number()` idi. Sonuç:

```
scripts/efatura-preflight.ts(86,35): error TS2322: … 'ALERTS_SWEEP_FAILURE_THRESHOLD' is
  incompatible with index signature. Type 'number' is not assignable to type 'string'.
scripts/efatura-preflight.ts(244,36): error TS2345: … (aynı)
```

`evaluatePreflight(envSource: Partial<Record<string, string | undefined>> = env)` bütün `env`'i düz
bir string haritası olarak alıyor. Kapsamım `scripts/` değil ve `pnpm typecheck` bir kapı — bu yüzden
değişkeni **string** olarak doğrulayıp (`/^[1-9][0-9]*$/`), sayısal görünümü `env.ts`'ten ayrı bir
export olarak veriyorum (`alertsSweepFailureThreshold`). Komşunun dosyasına dokunmadan kapı yeşil.

---

## 3. Doğrulama — kanıt

### 3.1 Canlı Postgres'e karşı 3 gerçek başarısız koşum

Arıza **gerçek** bir `PrismaClientValidationError`: süpürmenin aday sorgusuna `SystemAlert`'te
olmayan bir sütun veriliyor — `alerts-daily`'yi aylarca öldüren hatanın (`include: { tenant: true }`)
tam sınıfı. Diğer her çağrı gerçek istemciye gidiyor, dolayısıyla aşağıdaki satırları **üretim kodu
gerçek tabloya yazdı**. (`.qa-scratch/devop-fb/live-failure-run.ts`)

```
run 1 -> {"success":false,"scanned":0,"closed":0}
run 2 -> {"success":false,"scanned":0,"closed":0}
[alerts-sweep] consecutive failed runs: 3 (alert threshold 3)
run 3 -> {"success":false,"scanned":0,"closed":0}
=== after: ===
state: 2 row(s) with source='alerts-sweep'
  [info ] key=alerts-sweep:run-failed repeat=3 resolved=NO
          message: Orphan-alert sweep did not complete — see meta for the stage and the job log for the full error
          meta   : {"error":"PrismaClientValidationError","stage":"scan","threshold":3,"alertDedupeKey":"alerts-sweep:run-failed","alertLastSeenAt":"2026-09-10T17:44:33.978Z","alertRepeatCount":3,"closedBeforeFailure":0,"scannedBeforeFailure":0}
  [error] key=alerts-sweep:failing-repeatedly repeat=1 resolved=NO
          message: Orphan-alert sweep has failed 3 or more consecutive runs — stale alerts are no longer being closed
          meta   : {"error":"PrismaClientValidationError","stage":"scan","alertDedupeKey":"alerts-sweep:failing-repeatedly","consecutiveFailures":3}
```

**3 başarısızlık → 3 satır DEĞİL, 2 satır** (biri `alertRepeatCount: 3` ile katlanmış).

### 3.2 Kendi kendini iyileştirme — canlı

```
healthy run -> {"success":true,"scanned":34,"closed":0}
=== after: ===
  [info ] key=alerts-sweep:run-failed repeat=3 resolved=2026-09-10T17:44:49.964Z
          meta   : {… "alertResolvedBy":"producer" …}
  [error] key=alerts-sweep:failing-repeatedly repeat=1 resolved=2026-09-10T17:44:49.972Z
          meta   : {… "alertResolvedBy":"producer" …}
```

Sonra temizlik: `cleanup: deleted 2 alerts-sweep row(s)`.

### 3.3 GERÇEK TARAYICI — `/admin/alerts`, Chromium

Yeni kalıcı spec: `tests/e2e/alerts-sweep-failure-console.spec.ts` (kendi kendine yeter:
`beforeAll` gerçek arızayı 3 kez tetikler, `afterAll` satırları siler).

```
$ E2E_PORT=3411 E2E_SHOTS_ROOT=docs/agent-results npx playwright test \
    tests/e2e/alerts-sweep-failure-console.spec.ts --project=chromium
  ✓  1 [chromium] › tests/e2e/alerts-sweep-failure-console.spec.ts:99:7 › a repeatedly failing
     alerts sweep reaches the alerts console › a platform admin sees one folded ×3 breadcrumb
     and one error alert (2.7s)
  1 passed (6.5s)
```

Kareler:

- `docs/agent-results/TASK-MTVRC1UGA3B6Y-screenshots/01-alerts-console.png` — konsolun en üstünde
  iki satır: **Hata / `alerts-sweep`** ("has failed 3 or more consecutive runs") ve
  **Bilgi / `alerts-sweep`** ("did not complete") satırının yanında **`×3`** rozeti.
- `docs/agent-results/TASK-MTVRC1UGA3B6Y-screenshots/02-alert-detail.png` — satır açılmış,
  `meta` görünür: `"error": "PrismaClientValidationError"`, `"stage": "scan"`, `"threshold": 3`,
  `"alertRepeatCount": 3`; sağda **"Tekrar: 3"**.

Spec ayrıca gövdede `Unknown field` ve `postgresql://` **olmadığını** iddia ediyor — ham sürücü
metni ekrana ulaşmıyor.

### 3.4 Kapılar

```
$ npx tsc --noEmit ; echo "TYPECHECK_EXIT=$?"
TYPECHECK_EXIT=0

$ npx eslint . ; echo "LINT_EXIT=$?"
LINT_EXIT=0

$ npx tsx scripts/check-orphan-alerts.ts
açık SystemAlert satırı            : 40
  meta.tenantId taşıyan             : 3
  tenant'ı YAŞAYAN                  : 3
  tenant'ı SİLİNMİŞ (öksüz)         : 0
  hiç tenant adı geçmeyen (normal)  : 37
✅ Öksüz alarm yok…
ALERTS_CHECK_EXIT=0

$ npx vitest run src/lib/inngest src/lib/observability
 Test Files  4 passed (4)
      Tests  47 passed (47)
```

`pnpm alerts:check` yapısal olarak da etkilenmiyor: yazdığım iki satır `meta.tenantId`
**taşımıyor**, kapı ise yalnız ölü kiracı adı taşıyan açık satırlara bakıyor.

### 3.5 Bana ait OLMAYAN kırmızı (ayrımla)

Tam `npx vitest run` sırasında 2 dosya kırmızı — **ikisi de komşunun** (`st1`,
TASK-MTVSBEO7VX6Y4, `src/lib/billing/**`, `stripeEventLog` uygulaması yarım):

```
 ❯ src/lib/billing/subscription-sync-tenant-scope.test.ts (7 tests | 7 failed)
 ❯ src/lib/billing/subscription-sync.test.ts (12 tests | 10 failed)
 Test Files  2 failed | 155 passed | 2 skipped (159)
$ git status --porcelain src/lib/billing/
 M src/lib/billing/subscription-sync.ts        (commit'siz, benim değil)
```

Bir ara `npx tsc --noEmit` de aynı dosyadan iki `TS2304: Cannot find name 'auditForStripeEvent'`
verdi; komşu düzenlemeyi bitirdikten sonra typecheck 0'a döndü. Kalan 155 dosya yeşil.

Commit'ten hemen önce komşu (`st2`, TASK-MTVPPDW8NXKLD, commit `4bf0154`)
`noUncheckedIndexedAccess: true`'yu kalıcı açtı; ölçümü **tazeledim**. Yeni bayrakla tek kırmızı,
yine bana ait olmayan bir dosya:

```
$ npx tsc --noEmit
tests/e2e/document-export-tenant-isolation.spec.ts(70,9): error TS18048: 'body' is possibly 'undefined'.
tests/e2e/document-export-tenant-isolation.spec.ts(71,37): error TS2345: Argument of type 'string | undefined' …
TYPECHECK_EXIT=2
```

Bu dosya `st5`'in (TASK-MTVT0VLF4AP19) ve bana açıkça "DOKUNMA" denen dosya — düzeltmedim, adıyla
bildiriyorum. Kendi dosyalarım yeni bayrak altında **0 hata**:

```
$ npx tsc --noEmit 2>&1 | grep -E "alerts-sweep|env\.ts|observability"
(çıktı yok)
```

`pnpm gate` **bütünüyle koşulmadı** — `test:e2e` tüm süiti komşuların yarım işiyle birlikte koşacaktı
ve sonucu kimseye atfedilemezdi; bunun yerine kapıların her birini ayrı ayrı koştum (yukarıda).

---

## 4. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/inngest/jobs/alerts-sweep.ts` | Aşama takibi; başarısızlıkta **gerçek** `scanned`/`closed`; `raiseFailureAlerts` (info streak + eşikte error); `clearFailureAlerts` (başarıda çözme); `safeErrorLabel`; `AlertsSweepDb`'ye `create`. |
| `src/lib/inngest/jobs/alerts-sweep.test.ts` | Sahte istemci gerçek bir bellek-içi `SystemAlert` tablosuna çevrildi (dedup gerçekten koşsun diye); mevcut 5 test korundu, 7 yeni test. |
| `src/lib/env.ts` | `ALERTS_SWEEP_FAILURE_THRESHOLD` (string, doğrulanmış) + `alertsSweepFailureThreshold` sayısal export. |
| `tests/e2e/alerts-sweep-failure-console.spec.ts` *(yeni)* | Gerçek arıza → gerçek tarayıcı → konsol satırı + `×3` rozeti + sızıntı yok. |
| `docs/INNGEST.md` | `alerts-sweep` işi hiç belgelenmemişti; iş tablosu, sağlık alarmları, yeni env değişkeni, "Common Issues" satırı. |
| `docs/agent-results/TASK-MTVRC1UGA3B6Y-screenshots/*.png` | Kanıt kareleri. |

`src/lib/observability/system-alert.ts` **değiştirilmedi** — gereken her şey (`dedupeKey`,
`resolveAlerts`, `client` enjeksiyonu) zaten vardı. Reuse > icat.

---

## 5. Riskler

1. **Alarmı, işin patladığı veritabanına yazıyoruz.** `SystemAlert` okunamaz/yazılamaz durumdaysa
   (bağlantı kesintisi, o tabloda iptal edilmiş grant) `recordAlert` tekrar-arama sorgusunu bile
   koşamaz, `failed` döner ve hiçbir şey saklanmaz — geriye yine log satırı kalır. Bunu kapatmak
   için `recordAlert`'i "arama patlarsa körlemesine yaz" yapmak gerekirdi; bu da TASK-MTS80DUAF39Z8'in
   kaldırdığı satır selini geri getirirdi. Bilinçli tercih, kodda ve testte (`failEveryRead`)
   yazılı. Toplam kesinti dışarıdan zaten görünür; aylarca sessizce `success:false` dönen bir iş
   değildi.
2. **`info` satırı da bir satırdır.** "Tek geçici hata alarm üretmesin" kuralını `error` seviyesinde
   uyguladım; `info` breadcrumb'ı sayacın kalıcı deposu olduğu için yazılmak zorunda. Konsolda
   seviye filtresi var ve `info` "Hata seviyesi" sayacına girmiyor.
3. **Operatör `info` satırını elle "çözüldü" işaretlerse sayaç sıfırlanır** — `recordAlert`'in
   belgelenmiş davranışı (çözülmüş satır pencereyi kapatır). Kasıtlı: tik atılmış bir alarmın
   arkasında sayaç ilerlemesin.
4. **Katlanan satırın `message`/`meta`'sı ilk oluşumunkidir**; tekrarda yalnız sayaç ve
   `alertLastSeenAt` güncellenir. Yani `stage` alanı "ilk hangi aşamada patladı"yı gösterir.
   `recordAlert`'in mevcut sözleşmesi, değiştirmedim.
5. Yeni e2e spec `pnpm test:e2e` süresine ~7 sn ekliyor ve `admin@yasinaslan.com.tr` yoksa
   kendini `skip` ediyor.

## 6. Açık sorular

1. **Kart `alerts-daily.ts` diyordu, iş `alerts-sweep.ts`'teydi** (§0). Kartın kapsam satırı
   düzeltilsin mi, yoksa `alerts-daily`'de de ayrı bir sağlık kartı mı açılacak? `alerts-daily`
   başarısızlığı zaten `recordAlert` ile yazıyor ama **`dedupeKey`'siz** — mesajı
   `"${n} of ${m} saved-search alerts failed"` biçiminde ve `n`/`m` her koşuda değişiyor, yani
   kimliği her gün farklı → katlanmıyor. Ayrı kart önerilir; bu kartta **dokunmadım**.
2. Başarısız süpürmenin Inngest tarafında da **başarısız** görünmesi (yani `throw` edip yeniden
   deneme alması) istenir mi? Bugünkü "asla atma" sözleşmesini korudum; alarm görünürlüğü sorunu
   çözüyor, ama yeniden deneme ayrı bir kazanç olurdu.
3. Kalıcı bir `JobRun` tablosu (migration) bu tür soruları ("kaç kez oldu") tek seferde çözerdi;
   kapsam dışıydı.

## 7. Sonraki adım

- Komşu `src/lib/billing/**` işini bitirince tam `pnpm gate` bir kez uçtan uca koşulmalı.
- §6.1'deki `alerts-daily` `dedupeKey` eksiği için kart açılması.
- Üretimde ilk 04:15 koşumundan sonra `/admin/alerts` → kaynak filtresi `alerts-sweep`: satır
  **olmaması** beklenen durumdur.
