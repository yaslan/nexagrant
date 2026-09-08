# DOĞRULAMA — S12 Dalga 4 · blok-zincir-dse

**Rol:** bağımsız doğrulama. Hiçbir kaynak dosya değiştirilmedi.
**Ölçüm tarihi:** 2026-09-08 · **Ölçülen commit:** `37202a5` (dal `dev`)
**Ortam:** ayrı `git worktree` + `next dev --webpack --port 3130` (paylaşılan ağaçta ikinci `next dev` mümkün değil), gerçek Postgres `localhost:5432/fabrika`.
**Kanıt dizini:** `docs/agent-results/DOGRULAMA-S12-D4-screenshots/`

| Kart | Hüküm |
|---|---|
| (i) TASK-MTS6M5819RW93 — "Aramayı Kaydet" gerçek yazma akışı (`266f00b`) | **KAPATILABİLİR** — kartın iddiası doğrulandı. Ayrı bir kusur bildiriliyor (§1.6). |
| (ii) TASK-MTS6LZOD715WM — m11 uydurma ortak yazarlar (`22b5406`) | **KAPATILABİLİR** — kartın kapsamı için. **AÇIK KALAN** aynı sınıftan bir kusur: `src/app/api/documents/export/route.ts:35-36` (§2.5). |

---

## 1. Kart (i) — "Aramayı Kaydet" gerçek yazma akışı

Kartın iddiası: tarayıcıdan kaydedince gerçek Postgres'te `SavedSearch` satırı oluşuyor; kiracı izolasyonu var; sil/listele çalışıyor; `alerts-daily` bu satır için gerçek eşleşme sayısı üretiyor.

Ölçüm yöntemi: butona **gerçek tarayıcıda** (Playwright/Chromium, kredensiyel girişi) basıldı; satırın varlığı uygulamadan bağımsız, doğrudan `pg` istemcisiyle sorgulandı.

### 1.1 Yazma — DOĞRU

Başlangıç: `SELECT count(*) FROM "SavedSearch"` → **0**.
alice@fabrika.test (`demo-tenant`) `/tr/main/calls` ekranında arama kutusuna yazıp "Aramayı Kaydet"e bastı.

```
[V] SavedSearch rows BEFORE: 0
[V] SavedSearch rows AFTER click: 1
[V] ROW: {"id":"cmts9h0cc0000mrxk1vd045hp","tenantId":"demo-tenant",
          "userId":"demo-user-alice","name":"dse-verify-1788847259659",
          "filters":{"q":"dse-verify-1788847259659","status":["OPEN","FORTHCOMING"]},
          "notify":true,"lastRunAt":null,"createdAt":"2026-09-08T03:01:00.924Z"}
```

Satır gerçek; `tenantId` ve `userId` oturumdan geliyor, `filters` ekrandaki arama durumunun karşılığı.
Kare: `i-01-calls-before.png`, `i-02-after-save.png`.

### 1.2 Kiracı izolasyonu — DOĞRU

İkinci kiracı (ayse@tto.edu.tr, `cmtrma93m000e93xk2ivjowpv` — İTÜ TTO) ve aynı kiracıdaki başka kullanıcı (bob@fabrika.test) kendi oturumlarıyla ölçüldü:

```
[V] tenant B (İTÜ TTO) GET /api/saved-searches -> 200 {"success":true,"searches":[]}
[V] tenant B DELETE A-row -> 404 {"success":false,"error":"Kayıtlı arama bulunamadı."}
[V] A-row still present after cross-tenant delete: 1
[V] SAME-tenant OTHER user (bob) GET -> 200 {"success":true,"searches":[]}
```

İkinci kiracı satırı **görmüyor** ve id'sini bilerek **silemiyor** (404, satır yerinde kalıyor).
Ek olarak liste kullanıcıya özel: aynı kiracıdaki başka bir üye de görmüyor — `route.ts` `tenantId` + `userId` ile daraltıyor. Kare: `i-03-bob-no-list.png`.

### 1.3 Listeleme ve silme — DOĞRU

Sayfa yenilendi; kayıt listede göründü, sonra **ekrandaki "Sil" düğmesiyle** silindi:

```
[V] name visible in A saved-search list: 1
[V] list entries rendered: 2
[V] SavedSearch rows AFTER UI delete: 0
```

Kare: `i-04-list-visible.png`, `i-06-list-two.png`, `i-07-after-delete.png`.

### 1.4 alerts-daily gerçek eşleşme sayısı — DOĞRU

Tarayıcıdan `q=energy` ile bir kayıt oluşturuldu; `since` tohumlanmış `Topic.fetchedAt`'lerin öncesine çekildi; sonra işin **kendi export'ları** (`SAVED_SEARCH_ALERT_QUERY`, `matchCountQuery`) gerçek Prisma istemcisiyle çalıştırıldı — taklit yok:

```
[M] SAVED_SEARCH_ALERT_QUERY returned 1 row(s)
[M] search=energy | since=2000-01-01T00:00:00.000Z
    | where={"fetchedAt":{"gt":"2000-01-01T00:00:00.000Z"},
             "status":{"in":["OPEN","FORTHCOMING"]},
             "OR":[{"title":{"contains":"energy","mode":"insensitive"}},
                   {"description":{"contains":"energy","mode":"insensitive"}}]}
    | REAL matchCount=231
[M] control q=climate -> matchCount=239
[M] control q=digital  -> matchCount=290
```

Cron'un sorgusu tarayıcıdan yazılan satırı **okuyor** ve 1288 satırlık gerçek `Topic` tablosu üzerinde **gerçek bir sayım** (231) üretiyor. Anlamsız terim için 0 dönmesi de doğru davranış.

### 1.5 Temizlik

Ölçüm satırları silindi; `SavedSearch` tekrar **0 satır**. Geçici olarak açılan `ModuleState` (M11) ve `Subscription.planId` değişikliği geri alındı (§2.3).

### 1.6 AÇIK KALAN (bu kartın iddiasını çürütmez, ama yolun üstünde) — `resend` beyan edilmemiş bağımlılık

`src/lib/inngest/jobs/alerts-daily.ts:4` → `import { Resend } from 'resend'`
`src/actions/user/request-deletion.ts:4` → aynı import.
`src/app/api/saved-searches/route.ts:5` bu iş dosyasından `SavedSearchFiltersSchema` import ettiği için **`resend` artık bir API rotasının derleme grafiğinde**.

Ölçüm:

```
$ grep -c resend package.json      -> 0
$ grep -c resend pnpm-lock.yaml    -> 0
$ ls node_modules/resend           -> resend -> .pnpm/resend@6.25.0/... (Sep 3)
```

`resend` yerel `node_modules`'ta var ama **ne `package.json`'da ne `pnpm-lock.yaml`'da**. Kilit dosyasına sadık temiz kurulumda (`pnpm install --frozen-lockfile`) paket gelmiyor ve rota derlenmiyor — bu koşuda birebir üretildi:

```
Error: Module not found: Can't resolve 'resend'
  > 4 | import { Resend } from 'resend';
Import trace: ./src/lib/inngest/jobs/alerts-daily.ts
              ./src/app/api/saved-searches/route.ts
GET /api/saved-searches 500
```

Yani CI'da / temiz kurulumda "Aramayı Kaydet" **500 veriyor**. Yerelde çalışmasının tek sebebi elle kurulmuş phantom paket. Düzeltmedim (kural b); `package.json` `dependencies`'e `resend` eklenmesi gerekiyor. Ölçümün geri kalanını yapabilmek için paketi **yalnız atılabilir worktree'ye** kopyaladım, depo dokunulmadı.

### 1.7 AÇIK KALAN — `alerts-daily.ts:36-38` yorumu artık yanlış

```
36: * ever writes one: there is no API route that creates a `SavedSearch` row,
38: * only sleeps 500ms and shows a toast — it calls no API and touches no table.
```

`266f00b` tam da bu rotayı ekledi. Yorum, kendisini yanlışlayan commit'te güncellenmemiş; `filters` sözleşmesi hakkında okuyucuyu yanıltıyor.

---

## 2. Kart (ii) — m11 uydurma ortak yazarlar

### 2.1 grep bugün ne veriyor

```
$ grep -rn "Klaus Müller\|Sofia Rossi\|Marcus Schmidt\|Selin Kaya\|Mehmet Yılmaz\|Demo SME Consultancy" src/
```

**17 satır.** Her 17'si de **yorum**; hiçbiri canlı kod/string değil. Her isabetin satır başı ayrı ayrı sınıflandırıldı:

| Sınıf | Dosya:satır |
|---|---|
| COMMENT | `src/app/[locale]/(app)/layout.tsx:45` |
| COMMENT | `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx:68` |
| COMMENT | `src/app/[locale]/admin/blog/page.tsx:17` |
| COMMENT (blok gövdesi) | `src/app/[locale]/login/AuthCard.tsx:298` |
| COMMENT (blok gövdesi) | `src/components/UserMenu.tsx:517` |
| COMMENT | `src/lib/user-display.ts:5` |
| COMMENT | `src/lib/blog.ts:4`, `:5` |
| COMMENT | `src/lib/workspaces.ts:9` |
| COMMENT | `src/lib/document-exporter.ts:43` |
| COMMENT | `src/lib/auth.ts:15` |
| COMMENT | `src/modules/m11/types.ts:107`, `:108`, `:109` |
| COMMENT | `src/modules/m11/ui/PartBCollaborativeEditor.tsx:130`, `:184`, `:191` |

`AuthCard.tsx:298` ve `UserMenu.tsx:517` `//` veya `*` ile başlamadığı için ayrıca elle açıldı: ikisi de `{/* ... */}` bloklarının **gövde satırları** (TASK-MTRNQHC3IV2BE açıklamaları). Yani grep'in verdiği sayı sıfır olmadığı hâlde **çalışan üründe uydurma ad yok** — kalanlar "burada şu vardı, kaldırıldı" kayıtları.

### 2.2 Part B editörü ekranı — TEMİZ

M11 `ultra` planı + `ModuleState=ON` gerektiriyor; `demo-tenant` `pro` olduğu için önce plan kilidi göründü ("Full Application Production modülü aboneliğinizin kapsamı dışında"). Ölçüm için ikisi de **geçici** açıldı, sonra geri alındı.

Editör yüklendikten sonra ekran metninde 12 uydurma ad arandı (`Klaus Müller`, `Sofia Rossi`, `Marcus Schmidt`, `Selin Kaya`, `Mehmet Yılmaz`, `Demo SME Consultancy`, `Fraunhofer`, `Politecnico`, `Siemens`, `METU TTO`, `Ayşe Kaya`, `Can Aksoy`):

```
[V3] editor default view        -> fabricated names: 0 (none)
[V3] panel: Sürüm Geçmişi       -> fabricated names: 0 (none)
[V3] panel: İnceleme Yorumları  -> fabricated names: 0 (none)
[V3] panel: YZ Eş-Yazar Asistanı-> fabricated names: 0 (none)
```

Yorumların "eskiden burada uydurma ortak yazar vardı" dediği tam üç yüzey de artık boşluğu dürüstçe söylüyor:

- bölüm başlıkları: `Lider: Atanmadı` / `Sorumlu: Atanmadı` (4 bölümde de)
- Sürüm Geçmişi: `Bu bölüm için henüz kayıtlı bir sürüm yok.`
- İnceleme Yorumları: `Bu bölüm için henüz bir inceleme yorumu bulunmuyor.` (sayaç `(0)`)

Kare: `ii-01-partb-editor.png`, `ii-02-version-history.png`, `ii-03-review-comments.png`, `ii-04-ai-coauthor.png`.

### 2.3 Geçici DB değişiklikleri geri alındı

`Subscription.planId` `ultra`→`pro`, geçici `ModuleState` (M11) satırı silindi. Doğrulandı:
`demo-tenant` → `pro`; `ModuleState` yalnız M1/M5/M6/M8/M10.
(Listede görünen `plan-e2e-*` kiracıları benim değil — paralel koşan geli-tirici'nin e2e fixture'ları.)

### 2.4 GERÇEK dışa aktarım dosyaları — TEMİZ

Dosyalar bu koşuda üretildi, diske yazıldı ve **içine bakıldı**:

```
$ curl ".../api/documents/export?type=PART_B&format=docx&title=DSE-Verify" -o export-partb.docx
  docx HTTP 200 bytes=4185
$ curl ".../api/documents/export?type=PART_B&format=pdf&title=DSE-Verify"  -o export-partb.html
  pdf/html HTTP 200 bytes=7737

$ grep -c "<12 uydurma ad>" export-partb.docx   -> 0
$ grep -c "<12 uydurma ad>" export-partb.html   -> 0
$ grep -o "Dr\.…\|Prof\.…\|Doç\.…" export-partb.*  -> (hiç yok)
```

Dosyalar dizinde duruyor: `export-partb.docx`, `export-partb.html`.
Çıktının kimlik alanları dürüst: `Lider yazar atanmadı`, `İmzalayan atanmadı`, `imzacı atanmadı. İmza alanı, imzalayan kayıt olarak atandığında doldurulur.`

**Kartın kapsamı için hüküm: kapatılabilir.**

### 2.5 AÇIK KALAN — dışa aktarım hâlâ uydurma bir kuruluş adı basıyor

`src/app/api/documents/export/route.ts:35-36`

```ts
opportunityTitle: 'HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems & Battery Tech',
tenantName: 'FonBridge Teknoloji A.Ş.',
```

Bu iki string **kartın grep listesinde olmadığı için** temizlikten kurtulmuş, ama tam olarak aynı sınıftan bir kusur: her kiracının indirdiği her Part B belgesinde "Başvuran Kuruluş: FonBridge Teknoloji A.Ş." ve gerçek olmayan bir çağrı kimliği yazıyor. Bu koşuda üretilen iki dosyanın ikisinde de görülüyor (`grep -c` → 2 isabet), PDF çıktısının görünür metninde:

```
Proje / Çağrı Adı:  HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems & Battery Tech
Başvuran Kuruluş:   FonBridge Teknoloji A.Ş.
```

Kimlik dürüstlüğü kartı bu iki satırı kapsamadan tam kapanmış sayılmaz.

### 2.6 AÇIK KALAN — dışa aktarım rotasında kiracı koruması yok

`src/app/api/documents/export/route.ts:7-27`

- Rotada `auth()` / `requireTenantApi` / `withTenant` **yok** — oturumsuz `curl` ile 200 aldım (§2.4'teki iki dosya oturumsuz üretildi).
- `partId` doğrudan `prisma.applicationPart.findUnique({ where: { id: partId } })` ile okunuyor (`route.ts:18`) — `tenantId` daraltması yok. Başka kiracının `ApplicationPart` id'sini bilen biri o kiracının Part B içeriğini DOCX olarak indirebilir. CLAUDE.md §1 ihlali.

(`ApplicationPart` tablosu şu an boş olduğu için sızıntıyı canlı veriyle gösteremedim; kusur kod yolunda ve koşulsuz.)

### 2.7 Gözlem — `.docx` aslında düz XML

`generateDocxBuffer` çıktısı zip değil:

```
$ file export-partb.docx
export-partb.docx: XML 1.0 document text, Unicode text, UTF-8 text
```

WordprocessingML düz XML; `.docx` uzantısıyla sunuluyor. Word çoğu durumda açar, ama gerçek OOXML paketi değil. Kart kapsamı dışı, bilgi olarak bırakıyorum.

---

## 3. Kapı

```
$ pnpm lint       -> temiz (çıktı yok)
$ pnpm typecheck  -> temiz (çıktı yok)
$ pnpm test       -> Test Files 100 passed | 2 skipped (102)
                     Tests     1148 passed | 8 skipped (1156)
```

Atlanan 8 test / 2 dosya bende değil, mevcut durum — bu koşuda hiçbir test gevşetilmedi veya atlanmadı.

## 4. Dokunulmadığının kanıtı

`git status --short -- src/ messages/ package.json pnpm-lock.yaml prisma/ tests/` çıktısındaki değişik dosyalar (`admin/alerts/*`, `k2-monthly-cordis.ts`, `system-alert.ts`, `cordis-k2-job.test.ts`, `m10-audit-identity.spec.ts`) **paralel çalışan diğer ajanların** yarım işi; ben hiçbirini stage etmedim ve hiçbir kaynak dosyayı değiştirmedim. Bu görevin tek yazdığı şeyler: bu rapor ve `DOGRULAMA-S12-D4-screenshots/` altındaki kanıtlar.
