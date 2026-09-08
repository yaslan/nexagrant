# TASK-MTQYXISOPUJ53 — Uydurma veri fallback'leri: kalan 5 noktanın ÖLÇÜMÜ (2. koşu)

**Ajan:** customer-support (CS-EN) · **Tip:** doğrulama + bug · **Tarih:** 2026-09-08 · **Dal:** dev
**Önceki rapor:** `docs/agent-results/TASK-MTQYXISOPUJ53-customer-support.md` (2026-09-07, commit `dc97077`)

Bu koşunun görevi kod yazmak değil **ölçmek**ti: kart `review`de duruyordu ama beş noktanın
gerçekten kapandığı hiç doğrulanmamıştı. Kartın iddiasını onaylamaya değil çürütmeye çalıştım.
**Sonuç: dört nokta gerçekten kapalı, biri kapalı sanılıyordu — bugün hâlâ ekranda uydurma
veri üretiyordu.** Onu düzelttim.

---

## 0. Kartın metnine erişim — dürüst not

Board aracı (`list_tasks`) yalnız başlık döndürüyor, kartın gövdesini döndürmüyor; kart metnini
disk üzerinde de bulamadım (`office-state.json` içinde yok). Bu yüzden "beş nokta"nın listesini
kartın **başlığından** (`client + API + dashboard`) ve kartın gövdesinin 2026-09-07'de
kopyalandığı iki kalıcı kayıttan aldım:

- `docs/agent-results/TASK-MTQYXISOPUJ53-customer-support.md` §0 (kartın iddialarının tablosu),
- `.agentspace/memory/shared/fabrika-fabricated-fallback-antipattern.md` (kart açılırken yazılan
  "hâlâ aynı deseni taşıyan yerler" listesi).

Bu iki kaynağın kesişimi tam beş nokta veriyor ve başlıktaki üç yüzeyle birebir örtüşüyor.
Aşağıdaki tabloda numaralandırdığım liste budur. Kartın gövdesi bundan farklıysa fark benim
göremediğim yerdedir; **bunu bir varsayım olarak işaretliyorum.**

---

## 1. Beş nokta — bugünkü kodda ne oluyor

Ölçüm ortamı: yerel Postgres (`postgres-vector`, 37 saattir ayakta), dev sunucu `:3000`,
**kaydı olmayan gerçek bir kiracı**: `org-y8w2f9` / "İstanbul Teknik Üniversitesi TTO",
kullanıcı `ayse@tto.edu.tr` (TENANT_OWNER).

```
$ select 'Opportunity', count(*) … where "tenantId"='cmtrma93m000e93xk2ivjowpv'
  Opportunity 0 · Evaluation 0 · Effort 0 · Proposal 0 · GateDecision 0 · Invoice 0
```

| # | Yüzey | Nokta | Kayıt yokken bugün ne gösteriliyor | Durum |
|---|---|---|---|---|
| 1 | API | `api/v1/calls/route.ts` — gömülü dört demo çağrı (€180m "EIC Accelerator", "TÜBİTAK 1707") | Gerçek `Topic → Call → Programme` satırları; ölçülmemiş bütçe `null` | **KAPALI** |
| 2 | API | `api/v1/opportunities/route.ts` — iki demo fırsat, boş pipeline'da da patlayan sorguda da | `{"total":0,"data":[]}` | **KAPALI** |
| 3 | dashboard | `dashboard/client.tsx` — `thresholdRate === '0' ? '84.2'`, `hitRate === '0' ? '68.5'`, `personDaysPerOpp === '0' ? '14.2'`, `fundedOpps \|\| 4` | Dosya artık yok; `m5/server/metrics.ts` `measured/NOT_MEASURED` ayrımıyla çalışıyor, boş kiracıda pano "Bu çalışma alanında henüz fırsat yok" diyor | **KAPALI** |
| 4 | client | `notifications/page.tsx` (44, 82) — dört uydurma bildirim + app shell'deki zil ikizi | Sayfa "Henüz bildiriminiz yok."; zil boş, kırmızı nokta yok | **KAPALI** |
| 5 | client | `application/client.tsx` (62, 71, 79) — mount'ta €412.500'lük Fraunhofer/Demo SME konsorsiyumu + 4 WP | €0 bütçe, 0 Kişi-Ay, 0 İş Paketi, bölüm liderleri "Atanmadı", tek aktif yazar oturumdaki gerçek kullanıcı | **KAPALI** |

### 1b. Kartın saymadığı, hâlâ AÇIK olan altıncı nokta — bulundu ve düzeltildi

Beş noktayı ölçerken aynı ailenin **client** tarafında yaşayan bir üyesini canlı yakaladım:

**`src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx`** — `DEMO_OPPORTUNITIES`
sabiti. Dört uydurma fırsat, demo seed'in kullandığı id'lerle (`demo-opp-1` … `demo-opp-4`)
anahtarlanmış. Kiracıya daraltılmış sorgu boş dönünce (başka kiracının id'si, silinmiş satır,
patlayan sorgu) sayfa bunlardan birini **o kiracının kendi fırsatıymış gibi** servis ediyordu.
`try/catch` de yalnız `console.warn` yazıp aynı fallback'e düşüyordu — yani kalıcı olarak
bozuk bir sorgu, çalışan bir sayfa gibi görünüyordu.

Bu nokta 2026-09-07'de "başka kartın (TASK-MTQW5BVFW6CMT)" diye bırakılmıştı; o kart kapanmış
görünüyor ama **kod hâlâ ağaçtaydı.** Kart "5 nokta" diyorsa sayım eksikti; kartın kendi
yüzey listesi (`client`) bu dosyayı kapsıyor, o yüzden düzelttim.

---

## 2. Kanıt

### 2.1 ÖNCE — boş kiracı ekranda uydurma fırsat görüyor (gerçek tarayıcı)

`ayse@tto.edu.tr` ile giriş, `/tr/default/pipeline/demo-opp-1/consortium`:

```
signed in as ayse@tto.edu.tr -> http://localhost:3000/tr/default/dashboard
✗ consortium-demo-opp-1        FLEX-GRID  (422 chars)
✗ consortium-demo-opp-3        CIRC-PACK  (431 chars)
✓ consortium-unknown           no fabricated string  (118 chars)
✓ partners                     no fabricated string  (1154 chars)
```

Sayfa gövdesi (`v7-before-consortium-demo-opp-1.txt`):

```
← Back to Pipeline
Consortium Builder

FLEX-GRID: Decarbonised Smart Grid Flexibility Solutions — Stage G0
```

Kare: `docs/agent-results/TASK-MTQYXISOPUJ53-screenshots/v7-before-consortium-demo-opp-1.png`
— sol üstte İTÜ TTO çalışma alanı, sağ üstte Prof. Dr. Ayşe Kaya, ortada bu kiracının
`Opportunity` tablosunda **hiç bulunmayan** bir proje adı ve aşaması.
(`v7-before-consortium-demo-opp-3.png` aynısı, "CIRC-PACK … — Stage G2".)

### 2.2 SONRA — 404, hem gövdede hem HTTP durumunda

```
[A owner tenant] url: http://localhost:3000/tr/main/pipeline/demo-opp-1/consortium
[A owner tenant] header: District renovation pilot — İzmir — Stage G0
[A owner tenant] shows FLEX-GRID? false
[B empty tenant] HTTP 404 | body: "404\nSayfa Bulunamadı\n\nAradığınız sayfa veya geçerli bağlantı"
[B empty tenant] shows FLEX-GRID? false
```

İki yarım kasıtlı: **A**, satırın gerçek sahibi olan kiracının kendi fırsatını görmeye devam
ettiğini gösteriyor — "her şeyi gizle" ucuz düzeltmesi yapılmadı. **B**, kaydı olmayan
kiracının artık uydurma bir fırsat değil gerçek bir 404 aldığını gösteriyor.

HTTP durumu ayrıca ölçüldü çünkü bu depoda 404 gövdesinin HTTP 200 ile döndüğü bilinen bir
tuzak var (`fabrika-notfound-returns-http-200`): oturumlu istekte **HTTP 404** geliyor.

Kareler: `v7-after-consortium-owner-tenant.png`, `v7-after-consortium-empty-tenant-404.png`.

### 2.3 Boş kiracıyla tam tur — ekranda uydurma rakam yok

Aynı boş kiracıyla gezilen sayfalar; her sayfanın metni 27 uydurma dizgiye karşı tarandı
(84.2 / 68.5 / 14.2 / 412.500 / Fraunhofer / Demo SME / FLEX-GRID / EIC Accelerator /
GIB2026 / 32.220 / Alice / Bob / %92 …):

```
✓ dashboard        ✓ pipeline        ✓ partners        ✓ notifications
✓ person-days      ✓ billing         ✓ evidence        ✓ relationships     ✓ approvals
```

Ekranda okunanlar (metin dökümleri `.txt` olarak yanlarında):

| Sayfa | Boş kiracıda ne yazıyor |
|---|---|
| Panel | "Bu çalışma alanında henüz fırsat yok" + neyin ne zaman görüneceğinin açıklaması |
| Pipeline | G0 0 · G1 0 · G2 0 · G3 0 · G4 0 |
| Adam-Gün | "Toplam: 0 saat (0.0 AG)" · "Henüz efor kaydı yok." |
| Bildirimler | "Henüz bildiriminiz yok." (zil de boş) |
| Ortaklar | "Toplam 0 Ortak Profili Bulundu" · "Aradığınız kriterlere uygun CORDIS ortağı bulunamadı." |
| Faturalandırma | FREE · 10/10 kredi · 1/1 koltuk · 1/1 çalışma alanı · gerçek kiracı adı; demo fatura yok |
| Değerlendirmeler | "Değerlendirilmedi" · "0 (0 İnsan, 0 YZ)" · "Henüz bir ön değerlendirme bulunmuyor." |
| Başvuru (M11) | €0 · 0 Kişi-Ay · 0 İş Paketi · bölüm liderleri "Atanmadı" |
| Dokümanlar (M10) | "0 Doküman Mevcut" · onay akışında doküman yok |

### 2.4 API — gerçek anahtarla, kaydı olmayan kiracı adına

`/api/v1/*` anahtarsız 401 döner, bu yüzden boş kiracıya geçici bir `ApiKey` satırı açtım
(iş bitince silindi, §4):

```
$ curl -H "x-api-key: fp_live_qa_MTQYXISOPUJ53_v7" localhost:3000/api/v1/opportunities
{"success":true,"meta":{"tenantId":"cmtrma93m000e93xk2ivjowpv","total":0,…},"data":[]}
HTTP 200

$ curl … /api/v1/partners?limit=3
{"success":true,"meta":{"total":0,…},"data":[]}
HTTP 200

$ curl … /api/v1/calls?limit=3
{"data":[{"topicId":"ESC-HUMAID-2021-QUAL-LABEL-FP","title":"Quality Label Humanitarian Aid …",
 "programme":"Horizon Europe","deadlineAt":"2021-09-22T17:00:00.000Z","deadlineTz":"Europe/Brussels",
 "budgetTotalEur":null,"budgetPerProjectEur":null,"expectedGrantRangeEur":null,…}]}
```

İki şey birden görünüyor: satırlar gerçek `Topic` kayıtları (eski demo dizisindeki €180m
"EIC Accelerator" yok), **ve** ölçülmemiş bütçe alanları tahmin edilmiyor, `null` dönüyor.

### 2.5 Kod tarafı — A/B temel ölçümü (ortak ağaçta stash edemeden)

Yeni koruma testi HEAD sürümüne karşı da koşuldu (`git show HEAD:<dosya>` ile geçici kopya):

```
BEFORE (HEAD)        invented-in-code: 6/6 DEMO_OPPORTUNITIES,FLEX-GRID,TWIN-HYDRO,CIRC-PACK,
                     CLEAN-PORT,HORIZON-CL5-2024-D3-01-01 | console.warn-catch: true | recordAlert: false
                     => guard FAIL
AFTER  (worktree)    invented-in-code: 0/6 - | console.warn-catch: false | recordAlert: true
                     => guard PASS
```

Yani koruma testi düzeltmeden önce **kırmızıydı**; testi geçirmek için kod değil, kodu
düzeltmek için test yazıldı.

### 2.6 Kapılar

```
$ npx vitest run
  Test Files  101 passed | 2 skipped (103)
       Tests  1186 passed | 8 skipped (1194)

$ npx vitest run tests/fabricated-fallbacks.test.ts
       Tests  20 passed (20)          # 17 → 20 (M8 konsorsiyum için 3 yeni)

$ npx playwright test tests/e2e/fabricated-fallbacks.spec.ts
       4 passed (3.9s)

$ npx eslint "<consortium/page.tsx>"     → 0 sorun

$ npx tsc --noEmit
  src/lib/billing/plan-repository.ts(142,27): error TS18046: 'assignments' is of type 'unknown'.
  tests/plan-visibility-rls.spec.ts(165,25): error TS2347: Untyped function calls may not accept type arguments.
```

**İki tsc hatası benim değil:** ikisi de başka bir ajanın uçuştaki faturalandırma işi
(`plan-repository.ts` değiştirilmiş, `plan-visibility-rls.spec.ts` takip edilmeyen yeni dosya).
Benim dokunduğum iki dosyada 0 hata.

---

## 3. Değişen dosyalar

**Kod**
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx`
  — `DEMO_OPPORTUNITIES` sabiti ve `opportunity = DEMO_OPPORTUNITIES[id] ?? null` fallback'i
    silindi; yerine ne silindiğini alıntılayan bir yorum.
  — `catch` artık `recordAlert({ source: 'consortium_page_query_failed' })` yazıp sayfayı
    "okunamadı" bandına düşürüyor (CLAUDE.md kural 6). **"Okuyamadım" ile "bu kiracıda böyle
    bir fırsat yok" iki ayrı cevap; yalnız ikincisi 404.**
  — `notFound()` `try` bloğunun dışında kaldı (içeride kalsa `catch` onu yutardı).

**Test**
- `tests/fabricated-fallbacks.test.ts` — `describe('M8 consortium page …')`, 3 test:
  uydurma dizgiler kodda yok · sessiz `console.warn` yakalama yok, `recordAlert` var ·
  `notFound()` `catch`ten sonra çağrılıyor.

**Kanıt**: `docs/agent-results/TASK-MTQYXISOPUJ53-screenshots/v7-*.png` + `.txt`

**Temizlik**: `scripts/_tmp-cs/` ağaçtan kaldırıldı (§4).

**Commit'ler** — bu koşumun işi iki commit'e dağıldı, sebebi paylaşılan ağaçtaki bir yarış:
- `73b24e6` — dosyalarım staged beklerken **başka bir ajanın commit'i tüm stage'i yuttu**
  (kod, testler, rapor ve 44 kanıt dosyası o commit'in içinde, ama mesajı başka bir işi
  anlatıyor: "docs(memory): a local superuser hides a missing withTenant…"). İçerik güvende,
  yalnız mesaj yanıltıcı. Bilinen tuzak: `fabrika-concurrent-commit-steals-your-stage`.
- `56b5541` — `fix(m8): count the removed demo opportunities correctly (four, not five)`;
  ayrık bir index ile commit edildi, pre-commit kapısı temiz.

---

## 4. Bıraktığım hiçbir iz yok — geri alma listesi

Ölçüm için gereken her satır açıldı ve **silindi**; sayımla doğrulandı:

| Ne | Neden gerekti | Silindi mi |
|---|---|---|
| `ModuleState` × 10 (`csv7-*`, boş kiracı) | Modülsüz kiracıda her sayfa "modül kapalı" diyor, uydurma veri ölçülemiyordu | ✓ 10 satır silindi |
| `Subscription` (boş kiracı, `pro` → `ultra`) | M8/M10/M11 plan kapsamı dışındaydı | ✓ silindi (`Subscription` toplamı 1'e döndü) |
| `Opportunity` `csv7-probe-opp` | M11 başvuru sayfasının boş durumunu görmek için | ✓ silindi (boş kiracıda tekrar 0 fırsat) |
| `ApiKey` `csv7-key` | `/api/v1/*` anahtarsız 401 dönüyor | ✓ silindi |
| `scripts/_tmp-cs/` | Önceki koşumdan kalan `probe1.ts` | ✓ dizin kaldırıldı |
| `scripts/_tmp-csv7/` | Bu koşumun probe/tour script'leri | ✓ dizin kaldırıldı |

```
ApiKey csv7                      0
Opportunity csv7                 0
Subscription (empty tenant)      0
ModuleState csv7                 0
Opportunity in empty tenant      0
Subscription total               1     # yalnız demo-tenant/pro, koşum öncesiyle aynı
```

`SystemAlert` tablosunda son 2 saatte **hiç yeni satır yok** — hiçbir sorgu patlamadı, yani
yeni `recordAlert` yolu ölçüm sırasında tetiklenmedi (o yol birim testle sabitlendi, canlı
değil; §5.4).

---

## 5. Riskler

1. **Konsorsiyum sayfası artık 404 verebiliyor.** Daha önce `demo-opp-1` … `demo-opp-4`
   id'leriyle gelen HERHANGİ bir kiracı dolu bir sayfa görüyordu. Demo turu bu id'lerden
   birine link veriyorsa artık 404 görecek — istenen davranış bu, ama satış demosu bu
   linki kullanıyorsa haberdar edilmeli.
2. **Sorgu patladığında sayfa yerine uyarı bandı çıkıyor.** Kullanıcı boş bir ekran yerine
   "okunamadı, kaydedildi" görecek; karşılığında `SystemAlert` yazılıyor.
3. `scripts/_tmp-cs/` dizinini kaldırdığımda içinde **başka bir ajanın** dosyası vardı
   (§6.1) — silmeden bekledim, dizin kendi kendine boşalınca kaldırdım. Aynı adı iki ajanın
   kullanması tekrar edebilir.

---

## 6. Açık sorular / başkasının kartındaki bulgular (DOKUNMADIM, adıyla bildiriyorum)

1. **`scripts/_tmp-cs/g0-sql.ts`** — bu koşum sırasında (12:36) dizine **başka bir ajan**
   genel amaçlı bir SQL çalıştırıcı bıraktı. Benim değil, silmedim; dizin sonradan
   boşaldığı için kaldırabildim. Paralel dalgada iki ajan aynı geçici dizin adını
   kullanıyor — çakışma riski.

2. **`src/modules/m10/server/actions.ts:120, 192`** — `mockUrl =
   \`https://storage.fabrika.app/docs/…\`` hâlâ `FollowupDoc.contentUrl`'e yazılıyor.
   Hiçbir yere çıkmayan bir link; uydurma *rakam* değil, eksik obje-depolama özelliği.
   Ayrı kart konusu (önceki raporumda da bildirilmişti, hâlâ açık).

3. **`src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations/…`** — insan
   değerlendirme formunun kaydırıcıları **4.0 / 4.0 / 3.8** ile açılıyor. Bunlar eski
   uydurma `generateAiEvaluation` fallback'inin rakamlarıyla aynı. Gösterilen bir ölçüm
   değil, bir form varsayılanı — ama dikkatsiz bir kullanıcı bunu kendi değerlendirmesi
   olarak kaydedebilir ("tahmini varsayılan da bir uydurmadır" kuralı). Ayrı kart.

4. **`src/app/api/cagrilar/route.ts:90-97`** — SEDIA'dan gelen bir topic'in çağrı kimliği
   yoksa DB'ye `callIdentifier: 'HORIZON-DEFAULT'`, `title: 'Horizon Call'` yazılıyor.
   Bilinmeyeni tahminle doldurmak; `null` olmalı. Ayrı kart.

5. **`ModuleState` tablosunda öksüz satırlar:** `f10-empty-tenant` ve `f10-full-tenant`
   için `M5=ON, M6=ON` satırları duruyor ama bu kiracılar `Tenant` tablosunda yok — e2e
   fixture'ının geri alma adımı `ModuleState`i bırakıyor. E2E altyapısı kartının konusu
   (TASK-MTS9C07AQ6DNO).

6. **Konsorsiyum sayfası i18n dışı:** "Consortium Builder", "← Back to Pipeline",
   "Stage {stage}" sabit İngilizce (CLAUDE.md kural 8 `t('...')` istiyor). Kapsamım değildi;
   yalnız kendi eklediğim uyarı metnini iki dile yazdım (sayfanın mevcut `isTr` kalıbıyla).

---

## 7. Sonraki adım

- Konsorsiyum sayfası için bir e2e "boş kiracı → 404" senaryosu. Bugün yazmadım çünkü
  `scripts/seed-*-e2e.ts` fixture'ları şu anda başka bir ajanın (TASK-MTS9C07AQ6DNO)
  üzerinde çalıştığı paylaşımlı dosyalar; canlı tarayıcı kanıtı + kaynak koruması + A/B
  temel ölçümü şimdilik yeterli, fixture serbest kalınca eklenmeli.
- §6'daki 2, 3 ve 4 numaralı bulgular için kart açılması.

---

## 8. Definition of Done

- [x] Beş nokta tek tek açıldı; her biri için bugünkü kodun kayıt yokken ne gösterdiği yazıldı (§1)
- [x] Kartın sayımı ölçüldü: 4 nokta gerçekten kapalı, 1'i (dashboard) dosya taşındığı için
      kapalı, **kartın saymadığı 6. nokta açıktı** ve düzeltildi (§1b)
- [x] Gerçek tarayıcıda, kaydı olmayan gerçek bir kiracıyla 9 sayfa gezildi; ekranda uydurma
      rakam çıkmadığı karelerle ve metin dökümleriyle gösterildi (§2.3)
- [x] Kalan nokta düzeltildi: `DEMO_OPPORTUNITIES` söküldü, sessiz `catch` `recordAlert`e
      bağlandı, `notFound()` `try` dışına alındı (§3)
- [x] Düzeltmenin iki yarısı da kanıtlandı: sahibi olan kiracı kendi satırını görmeye devam
      ediyor, boş kiracı **HTTP 404** alıyor (§2.2)
- [x] A/B temel ölçümü: koruma testi HEAD'e karşı FAIL, düzeltme sonrası PASS (§2.5)
- [x] `pnpm test` (1186 geçti), e2e (4 geçti), eslint 0, tsc benim dosyalarımda 0 (§2.6)
- [x] `scripts/_tmp-cs/` ağaçtan kaldırıldı; ölçüm için açılan 13 DB satırının hepsi silindi
      ve sayımla doğrulandı (§4)
- [x] İlgisiz kusurlar düzeltilmedi, adıyla bildirildi (§6)
- [x] Kişisel veri paylaşılmadı: ekran görüntülerindeki tek kişi test kullanıcısı
      (`ayse@tto.edu.tr`, seed satırı), müşteri verisi yok
