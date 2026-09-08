# DOGRULAMA-S12-D7 — son kapanan beş kartın bağımsız ölçümü

**Ajan:** blok-zincir-dse (DSE-EN / Ürün Tasarımcısı) · **Sprint:** S12 Dalga 7 · **Tarih:** 2026-09-08
**Yöntem:** kaynak dosyalara DOKUNULMADAN, ayrı `git worktree` (`/Users/macbook/AgentSpace/.fabrika-d7-verify`,
detached @ `31ed96b`), TEMİZ `pnpm install --frozen-lockfile`, kendi `next dev --port 3170` sunucusu,
gerçek Postgres 16.15 `localhost:5432/fabrika` (mock yok).
**Duruş:** kartın iddiasını onaylamaya değil ÇÜRÜTMEYE çalışıldı — dört ayrı MUTASYON ve bir
karşı-olgusal (counterfactual) build koşuldu. Aşağıdaki her çıktı bu koşudan **kopyalanmıştır**.

## Hüküm tablosu

| # | Kart | Commit | Hüküm |
|---|---|---|---|
| a | TASK-MTS9VGEKE8N3B — `/api/documents/export` auth + kiracı + uydurma kimlik | `96c4166` | **KAPATILABİLİR** |
| b | TASK-MTS9W0C1VC9OS — `resend` beyan edilmemiş bağımlılık | `99536e9` | **KAPATILABİLİR** |
| c | TASK-MTS9C907G4YNW — m10 denetim testi ölü action id'ye bakıyordu | `503c7ec` | **KAPATILABİLİR** |
| d | TASK-MTS9CEDCWKQQK — demo-tenant'ta iki e2e kalıntısı | `16fe122` | **KAPATILABİLİR** |
| e | TASK-MTSAIWF4ENUSL — M10 çift onay kalıcılığı + RLS | `a2b1816` | **KAPATILABİLİR** |

Beşi de ayakta kaldı. Bu sonucun ucuz olmadığını göstermek için §7'de "ne ÖLÇÜLMEDİ" ayrıca yazıldı.

---

## 1. Ne yapıldı

Beş kart için sekiz ayrı canlı ölçüm + dört mutasyon + bir karşı-olgusal build koşuldu. Hiçbir
kaynak dosya kalıcı olarak değiştirilmedi: her mutasyondan sonra dosya yedeğinden geri alındı ve
`git status` temiz doğrulandı. Yazılan tek şey bu rapor ve `DOGRULAMA-S12-D7-screenshots/`.

Ortam kurulumu (ölçümün temiz olduğunun kanıtı):

```
$ git worktree add /Users/macbook/AgentSpace/.fabrika-d7-verify --detach 31ed96b
$ ls -d /Users/macbook/AgentSpace/node_modules /Users/macbook/node_modules
ls: /Users/macbook/AgentSpace/node_modules: No such file or directory
ls: /Users/macbook/node_modules: No such file or directory        # üst dizinde hoisting YOK
$ ls -d .fabrika-d7-verify/node_modules
ls: ... No such file or directory                                 # kurulum öncesi BOŞ
```

---

## 2. (a) TASK-MTS9VGEKE8N3B — belge dışa aktarımı · **KAPATILABİLİR**

Kartın üç iddiası ayrı ayrı ölçüldü. Fikstür **demo-tenant'a değil**, hiç fırsatı olmayan iki
kiracıya (`org-1xnfma`, `org-y8w2f9`) yazıldı ve `finally` bloğunda silindi.

```
1) ANONYMOUS (no cookie), tenant A partId  ->  HTTP 401
   body: {"error":"Unauthorized","message":"Oturumunuz bir çalışma alanına bağlı değil. ...","code":"TENANT_SCOPE_REQUIRED"}

2) SESSION in tenant A, asking for tenant B partId  ->  HTTP 404
   body: {"error":"Not Found","code":"PART_NOT_FOUND"}
   leaks tenant B secret text? no
   leaks tenant B call title? no

3) SESSION in tenant A, own partId (positive control)  ->  HTTP 200 bytes=4290
   contains "FonBridge": true          <-- yalnız ürün altbilgisi, aşağıya bak
   contains "HORIZON-CL5-2026-D3-01": false
   contains "Owner Kuruluşu": true      <-- kiracının GERÇEK Tenant.name'i
   contains "D7-PROBE-CALL-A": true     <-- Opportunity.title'dan
   signature copy: ["İmzalayan atanmadı","İmzalayan atanmadı","İmzalayan atanmadı"]

4) DOCX for own part: HTTP 200 bytes=1273
   docx contains "FonBridge": false
   docx contains "HORIZON-CL5-2026-D3-01": false
   docx contains "Owner Kuruluşu": true
   dates printed in docx: []            <-- sahte signedAt YOK
   docx signature copy: []

5) ANONYMOUS docx for tenant B part (the original exploit): HTTP 401 bytes=148 leaks secret? false

6) SESSION in tenant A, partId that exists NOWHERE -> HTTP 404
```

- **Oturumsuz curl 401 mi?** Evet — hem HTML hem DOCX biçiminde, gövde sızdırmadan.
- **Başka kiracının `ApplicationPart` id'si 404 mü?** Evet. Ayrıca (6) ile **hiç var olmayan** bir id
  de aynı 404'ü veriyor: cevap bir id yoklama kehanetine (id oracle) dönüşmüyor. Bu, kartın
  metninde geçen "ayırt etmez" iddiasının ölçülmüş hâli.
- **Uydurma kuruluş / çağrı / sahte `signedAt` kaldı mı?** Hayır. Başvuran kuruluş kiracının
  gerçek adı, çağrı adı `Opportunity.title`, imza alanı "İmzalayan atanmadı", DOCX'te hiç tarih yok.

Ekran kanıtı: `DOGRULAMA-S12-D7-screenshots/01-export-tenant-a-real-identity.png` (TR),
`02-export-en-nothing-signed.png` (EN), `03-export-anonymous-401.png`, `04-export-cross-tenant-404.png`.

**"FonBridge" yanlış alarm değil, ama kusur da değil.** Dışa aktarılan HTML'de tek bir "FonBridge"
geçiyor ve o **altbilgi** satırı: `FonBridge — Ufuk Avrupa & TÜBİTAK doküman üretim motoru | Sayfa 1 / 1`.
Kartın kusuru `tenantName: 'FonBridge Teknoloji A.Ş.'` idi — yani BAŞVURAN KURULUŞ alanı; o gitmiş.
Altbilgideki "FonBridge" ürünün kendi markası (`login/AuthCard.tsx`, `terms/page.tsx`, `admin/layout.tsx`
ve logo `alt` metni hep bu adı kullanıyor). Sonraki okuyan bunu tekrar kusur sanmasın diye yazıldı.

**EN belgede Türkçe kaldı mı?** İlk taramam "evet" dedi, **yanlış alarmdı**: EN çıktıda kalan tek
Türkçe dize `Owner Kuruluşu`, o da kiracının veritabanındaki adı — arayüz metni değil, VERİ.
Görünen tüm EN kopya İngilizce ("Applicant organisation", "No signatory assigned", "Page 1 / 1").

Ayrıca repodaki iki e2e spec'i de bağımsız olarak koştum (7 test, hepsi yeşil):

```
✓ signed out: the export refuses with 401 and hands over no content
✓ tenant A clicks "Resmî DOCX İndir" and gets its OWN organisation, not FonBridge
✓ tenant A asking for tenant B's partId gets 404 and none of B's text
✓ tenant B asking for tenant A's partId gets 404 as well
✓ the printable document follows the session language and states nothing was signed
✓ Part B editor — tr / en: no invented author, organisation or prose reaches the screen
7 passed (13.1s)
```

---

## 3. (b) TASK-MTS9W0C1VC9OS — `resend` bağımlılığı · **KAPATILABİLİR**

Kartın bütün meselesi "phantom `node_modules`" olduğu için ölçüm **sıfırdan kurulmuş** bir
`node_modules` üzerinde yapıldı.

```
$ pnpm install --frozen-lockfile
✓ Lockfile passes supply-chain policies
Lockfile is up to date, resolution step is skipped
Packages: +1226
Done in 5.9s using pnpm v11.25.0
EXIT=0
$ cat node_modules/resend/package.json | grep '"version"'
  "version": "6.25.0"

$ npx prisma generate   -> GEN_EXIT=0
$ pnpm build            -> BUILD_EXIT=0
```

**Karşı-olgusal (bu fix gerçekten yük taşıyor mu?).** Kurulumu bozmadan yalnız `resend` paketini
`node_modules`'tan çıkardım — yani "beyan edilmemiş bağımlılık"ın temiz makinedeki hâli:

```
$ mv node_modules/resend _d7/resend-hidden && pnpm build
BUILD_EXIT=1
Error: Turbopack build failed with 3 errors:
Error: Module not found: Can't resolve 'resend'
> 4 | import { Resend } from 'resend';                 (src/actions/user/request-deletion.ts)
> 91 |   const { Resend } = await import('resend');
> 4 | import { Resend } from 'resend';                 (src/lib/inngest/jobs/alerts-daily.ts)

$ mv _d7/resend-hidden node_modules/resend && pnpm build
BUILD_EXIT_AFTER_RESTORE=0
```

Bağımlılık gerçekten gerekli ve gerçekten beyan edilmiş.

**"Aramayı Kaydet" gerçekten yazıyor mu?** Evet — ve ölçülen kod **201**, kartın metnindeki "200"
gevşek bir ifade; 201 Created bir başarısızlık değil, oluşturma için doğru koddur.

```
SavedSearch rows before: 0
POST /api/saved-searches -> HTTP 201
   body: {"success":true,"search":{"id":"cmtshikox000d2gxklwl3z4by","tenantId":"cmtrhjys...","userId":"d7-saved-search-user",
          "name":"D7 probe search 1788860770828","filters":{"q":"hydrogen","status":["OPEN"]},"notify":true,...}}
   DB row actually written? YES
GET  /api/saved-searches -> HTTP 200, own rows: 1
POST anonymous -> HTTP 401 (must be 401)
CLEANUP: SavedSearch rows back to 0 (before 0)
```

İlk denemem HTTP 400 aldı (`filters.status` dizi bekliyor, ben dize yollamıştım) — 500 değil, 400.
Yani rota bozuk değildi, benim yükümdü; doğru şekilde 201 döndü. Bunu raporluyorum çünkü
"400 gördüm, kart yanlış" diye kapatmak kolay olurdu.

Bağımsız kapı ölçümü (aynı temiz kurulumda):

```
=== typecheck ===  TYPECHECK_EXIT=0
=== vitest ===     Test Files 100 passed | 2 skipped (102)
                   Tests 1172 passed | 8 skipped (1180)     TEST_EXIT=0
=== lint ===       ✖ 1 problem (0 errors, 1 warning)        LINT_EXIT=0
                   (tek uyarı BENİM geçici `_d7/sweep.mjs` betiğimde, repo kodunda değil)
```

1172 sayısı `a2b1816` commit mesajındaki iddiayla birebir uyuşuyor.

---

## 4. (c) TASK-MTS9C907G4YNW — m10 denetim testi · **KAPATILABİLİR**

Önce temel koşu:

```
✓ 1 the approval record names the session that acted, and each step names its own actor (951ms)
✓ 2 an identity-less visitor never reaches the approval surface (893ms)
✓ 3 an unauthorised write is refused by the action itself — measured on a LIVE action id (845ms)
3 passed (3.5s)
```

Yeşil olması hiçbir şey kanıtlamaz — **kendim bozdum, kendim ölçtüm.**

**MUTASYON 1 — uydurma sabit aktör** (`requireApprovalActor` → `displayName: 'Dr. Mehmet Yılmaz'`):

```
Expected substring: "E2E Approver A mtsheicl"
Received string:    "08.09.2026 12:43:02 · FINANCE · Dr. Mehmet Yılmaz — Doküman Çift Onaylı ... Gönderildi"
1 failed  (test 1) · 2 passed
```

**MUTASYON 2 — oturum koruması sökülmüş** (`signDocument`'ta `requireTenantAction()` yerine sabit kiracı):

```
Error: an identity-less caller signed a document
expect(received).toBeNull()
Received: 2026-09-08T09:43:25.732Z
1 failed  (test 3) · 2 passed
```

Her iki mutasyon geri alındı, `git status` temiz. Test **gerçekten kırmızı veriyor** ve doğru testi
kırmızı veriyor: kimlik mutasyonu 1. testi, yetki mutasyonu 3. testi düşürüyor.

Spec'i ayrıca okudum; kartın "artık ölü id'ye bakmıyor" iddiasını taşıyan üç koruma yerinde:
(i) `expect(anonRes.status()).not.toBe(404)` — bir 404 korumadan sayılmıyor, (ii) çapraz-kiracı
tekrar oynatma, (iii) **pozitif kontrol** (aynı id oturumla 200 döner ve gerçekten yazar) ki
"imza yok" sonucu "istek hiç ulaşmadı" anlamına gelemesin. `page.request` yerine izole `request`
fikstürü kullanılıyor — çerez kavanozu boş, yani "anonim" çağrı gerçekten anonim.

---

## 5. (d) TASK-MTS9CEDCWKQQK — demo-tenant kalıntıları · **KAPATILABİLİR**

**Fırsat sayısı gerçekten 5 mi?** Evet. (`demo-tenant` = slug `fabrika-beta`; panoda "demo-tenant"
diye geçen kiracının **id**'si budur, slug'ı değil — arayan kişi `slug='demo-tenant'` ile arayıp
bulamayabilir.)

```
 slug             | opportunity_count
 esr-calibration  | 20
 fabrika-beta     |  5      <-- demo-tenant
 g0-e2e           |  2
 org-1xnfma       |  0
 org-y8w2f9       |  0
```

**Yetim kayıt var mı?** İki katmanda ölçüldü. Önce `opportunityId` taşıyan dokuz tablonun tamamı:

```
ApplicationPart 0 · ConceptNote 0 · ConsortiumSeat 0 · Effort 0 · Evaluation 0
FollowupDoc 0 · GateDecision 0 · Proposal 0 · ProposalUsage 0 · Opportunity(self) 0
```

Sonra kolon adına güvenmeyen **şema geneli süpürme** (text/varchar `= ANY`, json/jsonb `::text LIKE`):

```
SWEPT columns: text/varchar=442 json/jsonb=26 total=468
REFERENCES FOUND: 0
```

Silinen iki id'ye (`cmtrmwgmy001493xkt7gyg4mm`, `cmtrmxtin0002d9xk0cif5ky6`) veritabanının hiçbir
yerinde referans yok. Yedek dosyası da yerinde ve geri alınabilir durumda
(`TASK-MTS9CEDCWKQQK-backup.json`: iki satırın tam JSON'u + dokuz çocuk tablonun hepsi boş).

**İki e2e spec artık rollback çağırıp kalıntı bırakmıyor mu?** Arka arkaya İKİ koşu:

```
===== RUN 1 =====   7 passed (7.0s)
  demo_opps=5  f10_opps=0  f10_tenants=0  cal_conns=0
===== RUN 2 =====   7 passed (5.6s)
  demo_opps=5  f10_opps=0  f10_tenants=0  cal_conns=0
```

Kod tarafında da doğrulandı: `fabricated-fallbacks.spec.ts:60` ve `m9-calendar-connect.spec.ts:63`
dosya kapsamında `test.afterAll(... await rollback())` çağırıyor.

**Dürüstlük payı:** "bu iki satır e2e kalıntısıydı" iddiası verinin kendisinden ispatlanamaz.
Veriden görülebilen: aynı başlık, aynı `topicId`, 61 saniye arayla, `demo-user-superadmin` sahipli,
sıfır çocuk kayıt. Bu tabloyla tutarlı ama tek başına kesin değil; kartın dayanağı PATRON ONAYI ve
o onay kart metninde duruyor. Silme betiği (`scripts/task-mts9cedcwkqqk-delete.ts`) `deleteMany`
+ `id IN (...)` kullanıyor — toplu yüklem yok, yani yanlış satır silme riski taşımıyor.

---

## 6. (e) TASK-MTSAIWF4ENUSL — M10 çift onay kalıcılığı · **KAPATILABİLİR**

**Sayfa yenilemeden sağ çıkıyor mu?** Evet — gerçek tıklama, gerçek F5:

```
✓ 1 a finance approval is still there after the page is reloaded (2.3s)
✓ 2 the finance approver cannot also approve legal, and nothing is written when they try (1.4s)
2 passed
```

Ekran kanıtı: `DOGRULAMA-S12-D7-screenshots/05-m10-approval-survives-reload.png` — yenilemeden
SONRA Aşama 1 ve 2 "Tamamlandı", Aşama 3 "Sırada", ve onay kaydında bu koşuda üretilmiş
(`E2E Submitter mtshktl0`, `E2E Finance mtshktl0`) iki ayrı isim duruyor. Sabit ya da varsayılan
bir ad bu satırları üretemez.

**MUTASYON 3 — kalıcılık sökülmüş** (`tx.dualApprovalStep.create` silindi):

```
✘ 1 a finance approval is still there after the page is reloaded (10.7s)
✘ 2 the finance approver cannot also approve legal ... (10.6s)
    Expected: "PENDING_LEGAL_APPROVAL"
    Received: "PENDING_FINANCE_APPROVAL"
2 failed
```

Test gerçekten kalıcılığı ölçüyor.

**Aynı kişi iki departmanı onaylayabilir mi?** Hayır — ve kartın asıl iddiası "bu kural uygulama
seviyesinde değil, UNIQUE INDEX'te" idi. Bunu **MUTASYON 4** ile çürütmeye çalıştım:
`refusalForDepartmentApproval`'daki `SAME_ACTOR_BOTH_DEPARTMENTS` satırını tamamen sildim.

```
✓ 1 a finance approval is still there after the page is reloaded (983ms)
✓ 2 the finance approver cannot also approve legal, and nothing is written when they try (1.2s)
2 passed
```

Uygulama seviyesindeki kural yokken bile ret AYNI şekilde geliyor ve ekranda görünüyor: yazma
veritabanı indeksinde patlıyor ve `uniqueViolationRefusal(e)` bunu kullanıcı metnine çeviriyor.
Kartın iddiası **ölçülerek** doğru. İndeksler:

```
DualApprovalStep_followupDocId_department_key   UNIQUE ("followupDocId", department)
DualApprovalStep_followupDocId_actorUserId_key  UNIQUE ("followupDocId", "actorUserId")
```

**Yeni tablonun RLS'i gerçekten uygulanıyor mu?** Üç ayrı ölçüm.

1. Metadata:
```
DualApprovalStep: rls_enabled=true  rls_forced=true
policy tenant_isolation  cmd=ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))
```

2. `pnpm rls:verify` (canlı):
```
Kiracıya özel model: 42 · RLS açık tablo: 48 · tenant_isolation politikası: 42
✅ Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

3. **Gerçek çapraz-kiracı denemesi** — iki kiracıya birer satır yazıp RLS'e tabi (`NOBYPASSRLS`)
   `fabrika_app` rolüyle okumaya/yazmaya çalışarak:

```
ROLE: {"current_user":"fabrika_app","bypass":false,"super":false}
NO app.tenant_id set: visible rows=0
READ as fabrika_app with app.tenant_id=g0-e2e-tenant  → 1 row  (kendi satırı)
   targeted read of other tenant's row id=d7-probe-step-b → 0 row(s) (blocked)
READ as fabrika_app with app.tenant_id=esr-calibration → 1 row  (kendi satırı)
   targeted read of other tenant's row id=d7-probe-step-a → 0 row(s) (blocked)
CROSS-TENANT INSERT (ctx=g0-e2e-tenant, row labelled esr-calibration):
   REFUSED — new row violates row-level security policy for table "DualApprovalStep"
CLEANUP: DualApprovalStep back to 0 (baseline 0) · leftover probe FollowupDoc rows: 0
```

Okuma iki yönde de engelleniyor, çapraz-kiracı yazma reddediliyor, hiçbir satır artmıyor.

**Bu maddede kartı kapatan ama okuyanın bilmesi ZORUNLU olan bir sınır var** — §7.1.

---

## 7. Ne ÖLÇÜLMEDİ / sınırlar

### 7.1 Yerelde ÇALIŞAN UYGULAMA zaten RLS'ten muaf
`.env`'deki `DATABASE_URL` rolü `fabrika`; ölçüldü:

```
 rolname      | rolsuper | rolbypassrls
 fabrika      | true     | true
 fabrika_app  | false    | false
```

Yani §6'daki RLS kanıtı **veritabanının** politikayı uyguladığını gösterir (ve gösterir), ama
uygulamanın kendi bağlantısı bu politikadan MUAFTIR. Pratik sonucu: (a) maddesindeki 404'ü
üreten şey RLS değil, rotadaki açık `tenantId` yüklemidir — ki bu iyi haber (kayış RLS olmadan
da tutuyor), fakat "RLS uygulanıyor" cümlesini uygulama üzerinden ölçmeye kalkan biri yerelde
yanlış sonuç alır. Bu kartın açtığı bir kusur değil, ortamın önceden var olan durumu.

### 7.2 Ölçümler ANLIK; veritabanını başka pane'ler de değiştiriyor
Bu koşu sırasında `g0-e2e-tenant` kiracısı **canlı olarak kayboldu** (ölçüm başında 5 kiracı /
g0-e2e'de 2 fırsat vardı, sonunda 4 kiracı / g0-e2e yok). S12 Dalga 7'de yedi ajan aynı yerel
Postgres'e karşı paralel çalışıyor. `demo-tenant=5` sonucunu bu yüzden ölçümün başında ve
sonunda İKİ kez aldım, ikisi de 5. Yine de bu rapordaki tüm satır sayıları anlık değerlerdir.

### 7.3 Yapılmayanlar
- (b)'deki "Aramayı Kaydet" **API üzerinden** ölçüldü; `/calls` ekranındaki düğmeye gerçek
  tıklamayla ölçülmedi — çünkü o düğme için hiçbir e2e spec'i yok (§8.4).
- Üretim ortamı, üretim veritabanı ve gerçek e-posta gönderimi ölçülmedi.
- Mutasyonlar yalnız §4 ve §6'daki dört noktaya uygulandı; her kod yolu mutasyon-test edilmedi.

---

## 8. Açık sorular — bu koşuda GÖRÜLEN, ama DÜZELTİLMEYEN kusurlar

Hiçbiri bu beş kartın kapsamında değil; adlarıyla bildiriyorum, dokunmadım.

**8.1 — Dışa aktarılan belgede sahte kurumsal başlık.** `src/lib/document-exporter.ts:252`:

```ts
<div class="logo-badge">${isTubitak ? 'TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ PAKETİ' : 'EUROPEAN COMMISSION - HORIZON EUROPE'}</div>
```

Her belgenin tepesine iki sabit kurum rozetinden biri basılıyor; hiçbir kayda bağlı değil
(kanıt: `01-export-tenant-a-real-identity.png` — benim uydurma `D7-PROBE-CALL-A` fikstürüm bile
"EUROPEAN COMMISSION" başlığı altında indi). Bu, kartın kapattığı uydurma-kimlik ailesinin
aynısı ama daha ağırı: kiracının ürettiği bir taslak, Komisyon'dan geliyormuş gibi görünen bir
başlıkla indiriliyor. CLAUDE.md'deki "iç ön değerlendirmeyi resmî gibi sunma" ilkesiyle aynı
gerekçe burada da geçerli. **Yeni kart açılmalı.**

**8.2 — "Doküman Ref" ve "Tarih" indirme anında uyduruluyor.** `route.ts` `id: doc-export-${Date.now()}`
üretiyor, `document-exporter.ts:256` `new Date().toLocaleDateString(...)` basıyor. Ekranda
`Doküman Ref: doc-export-1788860849392 | Sürüm v1 · Tarih: 08.09.2026` görünüyor — hiçbir kayda
karşılık gelmeyen bir referans numarası, kayıt numarası gibi. Kaldırılan sahte `signedAt`'in
hafif akrabası; aynı belgeyi iki kez indiren iki farklı "ref" alır.

**8.3 — `format=docx` gerçek bir .docx değil.** Yanıt `PK` ile başlamıyor; düz
WordprocessingML XML (`<?mso-application progid="Word.Document"?>`), OOXML zip değil.
Word açar, ama `.docx` uzantısı + OOXML MIME tipiyle servis ediliyor ve standart zip tabanlı
her araç (unzipper dahil, bu koşuda `Error: FILE_ENDED` ile patladı) bunu okuyamaz.

**8.4 — "Aramayı Kaydet" düğmesinin e2e kapsaması YOK.** `tests/e2e/` altında saved-search'e
değen tek spec yok. TASK-MTS9W0C1VC9OS tam da bu düğmenin sessizce kırılmasıydı; regresyonu
yakalayacak test hâlâ yok.

**8.5 — `pnpm build` her koşuda i18n kapısını sessizce düşürüyor.**
```
🌐 Checking i18n translations...
⚠️  Could not run i18n check: Command failed: tsx scripts/i18n-check.ts
$ npx tsx scripts/i18n-check.ts ; echo $?
1     ("missingInTurkish": ["Consortium.status.${seat.status}", "Pipeline.detail.tab.${tab}", ...])
```
Betik şablon değişkeni içeren `t()` çağrılarını literal anahtar sanıp 1 dönüyor; build bunu
uyarıya çevirip geçiyor. Yani i18n kapısı fiilen KAPALI — CLAUDE.md kural 8'i koruyan denetim
hiçbir koşuda gerçekten çalışmıyor.

**8.6 — e2e koşusu çalışma ağacını kirletiyor.** m10 spec'leri ekran görüntülerini doğrudan
`docs/agent-results/TASK-*-screenshots/` altındaki **commit'li** dosyaların üzerine yazıyor;
her koşudan sonra `git status` 8 değişmiş binary gösteriyor. Bu koşuda `git checkout --` ile
geri alındı, ama gate'i koşan herkes farkında olmadan bu dosyaları commit edebilir.

---

## 9. Değişen dosyalar

Bu görev **hiçbir kaynak dosyayı değiştirmedi**. Eklenenler:

- `docs/agent-results/DOGRULAMA-S12-D7-blok-zincir-dse.md` (bu rapor)
- `docs/agent-results/DOGRULAMA-S12-D7-screenshots/01..06*.png` (6 kanıt karesi)

Geçici ölçüm betikleri (`_d7/*.mjs`) ve `node_modules` yalnız
`/Users/macbook/AgentSpace/.fabrika-d7-verify` worktree'sinde kaldı, repoya girmedi.
Dört mutasyonun hepsi geri alındı; worktree'de `git status` izlenen dosyada temiz.
Veritabanına yazılan her fikstür `finally` bloğunda silindi ve sayımla doğrulandı
(`d7_parts=0 · d7_saved=0 · fixture_opps=0 · demo_opps=5`).

## 10. Riskler

- §7.1: yerelde uygulama RLS'ten muaf koşuyor. Üretimde `fabrika_app` benzeri bir
  `NOBYPASSRLS` rol kullanılmıyorsa, RLS politikaları hiçbir zaman devreye girmez ve tek
  savunma hattı koddaki açık `tenantId` yüklemleri olur.
- §8.5: i18n kapısı fiilen kapalı olduğundan, CLAUDE.md kural 8 ihlalleri kapıdan geçebilir.
- §7.2: paylaşılan yerel veritabanına yedi ajan aynı anda yazıyor; sayıma dayalı her kart
  (fırsat sayısı, alert sayısı, satır sayısı) ölçüldüğü dakikaya bağlıdır.

## 11. Sonraki adım

1. §8.1 için P1 kart aç — sahte Komisyon başlığı, uydurma-kimlik ailesinin kapanmamış son üyesi.
2. §8.5 için kart aç — i18n kapısı çalışmıyor; `scripts/i18n-check.ts` şablon değişkenli
   `t()` çağrılarını anahtar sanmamalı, ve build bu betiğin hatasını yutmamalı.
3. §8.4 için kart aç — "Aramayı Kaydet" düğmesine e2e regresyon testi.
4. §8.2, §8.3, §8.6 backlog'a.
5. Beş kart `review` → `done`'a alınabilir.
