# Sürüm Notları — Sprint S12

**Durum: Kapı yeşil.** Bu belgenin önceki taslağında kapı kırmızıydı (React Strict Mode'da
7 e2e testi çift-render nedeniyle başarısız oluyordu); kök neden bulunmuş ama düzeltilmemişti.
Bu turda giderildi (`2a83253`). Son ölçülen tam `pnpm gate` koşusu 8 aşamanın 8'ini de yeşil
verdi: lint 0 hata (2 önceden var olan uyarı), tsc temiz, vitest 1670 geçti / 8 atlandı, i18n
iki katalog da 1436 anahtar ve eşit, RLS 44/44 tablo canlı ölçümle (`fabrika_app`,
bypassrls=false) doğrulandı, e2e 146 geçti / 1 atlandı (`3e14b40`'ın commit gövdesinde
alıntılanan koşu). Bu belge `dev` dalındaki commit'lere dayanır (2026-09-08 → 2026-09-10);
yalnızca commit gövdesinde kanıtı olan değişiklikler listelenmiştir. `docs(memory)` ve
salt-dahili `docs(agent-results)` kart-kapanış commit'leri bu listeden çıkarılmıştır.

---

## Türkçe

### Bilinen sorun — çözüldü
Kök neden `c0caeaf`'te bulunmuş ama düzeltilmemişti: her route'un altındaki `loading.tsx`
bir Suspense sınırı açıyor, bu yüzden Next sayfa daha kararını vermeden app shell'i erkenden
akıtıyordu. Sunucu, render'ı bitmiş sayfayı `<div hidden id="S:0">` içinde body'nin sonuna
park ederken istemci aynı alt ağacı yerinde tekrar render ediyordu — belge aynı pencerede her
id ve başlığın iki kopyasını taşıyordu. Ölçüm: kopya `load` olayından sonra da hayatta
kalıyordu (568 ms'de readyState=complete, ikinci kopya ~156 ms sonra düşüyor), hem `next dev`
hem prod build'de tekrarlanıyordu; önceki tema hipotezi iki ayrı deneyle çürütülmüştü.
Düzeltme: `(app)` altındaki 18 `loading.tsx` sınırı ve artık kullanılmayan
`WorkspaceLoadingSkeleton` kaldırıldı; kural `tests/app-shell-no-loading-boundary.test.ts`
ile kilitlendi — test, `loading.tsx`'i geçici olarak geri koyup kırmızıya döndüğü kanıtlanarak
yazıldı (`2a83253`).

### Faturalama & ödeme güvenliği
- **Anonim bir çağrı artık ödenebilir bir Stripe oturumu açamıyor.** `POST /api/billing/checkout`
  tenant'ı `session?.tenantId || 'default-tenant'` diye çözüyordu — hiçbir oturum kontrolü yoktu,
  hiçbir seed'de veya şemada karşılığı olmayan bir tenant id'siyle gerçek bir Checkout Session
  açılabiliyordu. Rota artık kayıtlı aramaların, davetlerin ve belge export'unun kullandığı aynı
  `requireTenantApi()` kapısından geçiyor; oturumsuz sepet artık çıplak "Unauthorized" yerine
  login'e (dönüş adresiyle) yönlendiriliyor, sepet localStorage'da kalıyor (`290cc8c`).
- **Fatura indirme linkleri artık ham hatayı sızdırmıyor.** XML/PDF linkleri düz `<a href>` idi;
  export başarısız olduğunda (ör. eksik tedarikçi kimliği) rotanın ham JSON hata kodu — en kötü
  durumda eksik ortam değişkeni adlarını içeren `missing` dizisi — doğrudan müşterinin tarayıcısına
  düşüyordu. İndirme artık `fetch()` üzerinden, hata koduna göre çevrilmiş bir bildirimle ve
  buton üzerinde "hazırlanıyor" durumuyla çalışıyor; export rotası `missing`'i yanıt gövdesinde
  artık tekrar etmiyor (operatör için loglamaya devam ediyor) (`72dd16f`).
- **Plan silme muhafızı, `planId`/`planVersionId` sapmasına karşı regresyon testiyle kilitlendi.**
  Her `Subscription` yazma yolu ölçüldü: `planId` koşulsuz yazılan ve her okuyucunun
  (`getEntitlements`, `computePublishImpact`, `docs/BILLING.md`) "hangi plan" diye baktığı tek
  alan; `planVersionId` ayrı, bilerek bayat bırakılabilen bir alan. Muhafızı `planVersionId`'ye
  bağlamak, düzeltmek istediği hatayı tersinden yeniden üretirdi. İki düşmanca test eklendi:
  yanıltıcı bir `planVersionId`'ye sahip canlı bir abonelik yine de silmeyi engelliyor, boş bir
  plan yine de siliniyor (`aef5706`).

### E-Fatura
- **Satır seviyesinde tevkifat (withholding) alt toplamları** UBL-TR XML'e eklendi — patron
  kararı 2026-09-09 (`18106a4`). Belge toplam tevkifatı satır toplamlarıyla artık birebir
  eşleşiyor (kanıtlanan örnek: 24000 kuruş).
- **Tevkifat oranı etiketi** artık gerçek satır verisinden türetiliyor; basılı faturadaki sabit
  kodlanmış "(9/10)" etiketi kaldırıldı (`ccc15b7`).
- **Geçersiz tevkifat oranları artık XML'e hiç yazılmıyor.** `0.67` gibi ondalık bir oran,
  `generateUblTrXml` tarafından sessizce kabul edilip belgeye basılıyordu — CLAUDE.md kural 7'nin
  ihlali. Artık `withholdingRateLabel()`'in doğrulaması XML üretiminden önce çalışıyor: etiket
  boş dönerse Tevkifat kalemi de yazılmıyor. 7 yeni test + mevcut 33 tevkifat/e-fatura testi
  geçti (`ce14101`).
- **Döviz cinsinden kesilen faturalarda TCMB kuru ve TL karşılığı artık belgenin kendisinde**
  basılı sayfada ve XML'de gösteriliyor (`8118b54`).
- **KDV ve tevkifat yuvarlama kuralı tek fonksiyona indirgendi** (`src/lib/money.ts`)
  (`34a5a53`, `6bbd1c3`, `1547db2`, `dc4da6f`).
- **UBL-TR XML tutarları artık kuruş (minor unit) cinsinden hesaplanıyor**, sıfır oranlı satışa
  sabit yazılan hatalı `%20 KDV` satırı da düzeltildi (`34a5a53`).
- Kesilmiş `INVOICE_VAT_RATE` ortam değişkeni koddan, önişlem raporundan, testlerden ve
  dokümandan tamamen kaldırıldı (`e011561`).
- Fatura export kapısındaki testler güçlendirildi: iki para biriminin karışmadığını doğrulayan
  test eskiyen "hiç ₺ basılmasın" iddiasının yerini aldı (`e236d2b`); env eksikken 503,
  mevcutken 200+XML uçtan uca doğrulandı (`3e865d4`).

### Çok kiracılılık (RLS) sertleştirmeleri
- **Üç ekranda kiracı filtresi sessizce düşüyordu.** Kanıt Paketi ve iki concept-note ekranı
  `tenantId ? { tenantId } : {}` deseniyle sorgu kuruyordu — false dalı daha dar bir sorgu
  değil, filtresizliğin ta kendisiydi (`{}` tüm kiracıların satırını seçiyordu). Aynı desen
  daha önce M4 ilişki ekranında düzeltilmişti (TASK-MTRKV9JGY7OQY). Üç ekran da artık
  `requireTenantPage` üzerinden zorunlu bir `tenantId` alıyor, sorgu `withTenantOn` içinde
  koşuyor; 20 birim test mutasyonla doğrulandı — ternary geri konunca hepsi kırmızıya dönüyor
  (`d1de9d4`).
- **İki tablo hem statik hem canlı RLS taramasından muaftı.** `ClaimEvidenceLink` ve
  `EvidenceReminder`, `SYSTEM_WIDE` listesinde oturuyordu; ikisi de bir kiracının verisini
  diğerine taşıyabilecek şekilde bağlıydı (Evidence hatırlatma e-postaları dahil). `tenantId`
  kolonu eklendi, ikisi `tenant_isolation`'a taşındı. `AuditEvent.tenantId` nullable olduğu
  için silme/imha kayıtları da (`request-deletion.ts`, `users-scheduled-deletion.ts`,
  `export-data.ts`) SQL'de `NULL = 'x'` hiçbir zaman doğru olmadığından hem yazılamaz hem
  okunamaz durumdaydı — `tenant_or_shared` desenine taşındı. RLS'i gerçekten uygulayan bir
  rolde (`fabrika_app`, bypassrls kapalı) doğrulandı: `rls:check` 43 → 44 model, `rls:verify`
  yeşil, çapraz kiracı yazma hâlâ reddediliyor (`af75623`).
- **`CalendarConnection` RLS politikası referans desenden dört noktada sapıyordu**:
  `RESTRICTIVE` + permissive politika yok (kiracıyı kendi verisinden mahrum bırakıyor),
  `FORCE ROW LEVEL SECURITY` eksik, `current_setting` çağrısında `missing_ok` yok, ve hiçbir
  yerde olmayan bir `is_system` atlama kavramı. `prisma/rls.sql`'deki kanonik desenle
  hizalandı (`374709f`).
- **M6 puanlama fonksiyonlarında kiracısız bir çağrı artık derlenmiyor.**
  `calculateCriterionAverage`, `calculateEvaluationScore` ve `getScoreDistribution`'ın
  iki-argümanlı aşırı yüklemesinde `tenantId` opsiyoneldi; boş bırakıldığında sorguyu
  daraltmıyor, `reviewer: { tenantId }` filtresini tamamen düşürüp global prisma istemcisine
  (RLS'in sınırlamadığı bir role) kaçıyordu. Depoda bu dalı kullanan tek bir çağıran yoktu —
  sızıntı gerçekleşmemişti — ama imza, bunu bir sonraki geliştiriciye meşru gösteriyordu.
  `tenantId` artık her iki aşırı yüklemede zorunlu; 15 yeni test 6 derleme-zamanı
  (`@ts-expect-error`) + çalışma-zamanı reddi olarak kilitliyor (`1d49048`).

### YZ / RAG katmanı
- **RAG kütüphanesi artık boş ya da başarısız bir aramada uydurma "kanıt" üretmiyor.**
  `retrieveChunks`, veritabanı hatası ya da boş sonuçta üç sabit kodlanmış sahte CORDIS
  projesini (%94/%88/%81 skorla) döndürüyordu; bu veriler `generateSectionDraft` üzerinden
  doğrudan modele "kaynak" olarak gidiyor, admin RAG test ekranında da korpusun çalıştığının
  kanıtı gibi gösteriliyordu. `OPENAI_API_KEY` yokken `getEmbedding` de metnin ilk 1536 karakter
  kodunu "embedding" diye gerçek `Chunk` tablosuna yazıyordu. İkisi de kaldırıldı: başarısız
  arama artık hata fırlatıyor, boş korpus boş liste dönüyor. Mutasyonla doğrulandı: sahte
  veriler geri konunca 7 test, sahte embedding geri konunca 9 test kırmızıya dönüyor (`45580ed`).
- **İki paralel RAG yolu birleştirildi.** `src/lib/ai/rag.ts`, önceki bir LLM temizliğinden
  (`b6f1642`) arta kalan ikinci bir chunker ve ikinci bir similarity search'tü; kiracı bağlamı
  olmayan bağlantıda koşuyordu, `src/modules/m2/server/actions.ts` ona gerçek bir tenant id
  geçiriyordu — ana bağlantı `fabrika_app`'e taşındığı gün bu çağrı hatasız ama sessizce yalnız
  paylaşılan korpusu döndürecekti. Depoda artık tek bir similarity search var ve `withTenant`
  içinde koşuyor; PDF alma da her ifadesi için `withTenant`'a bağlandı. `pnpm typecheck` temiz,
  vitest 1649 geçti (`d27d8f4`).

### Admin konsolu
- **Kanıtsız güvenlik ve sağlık rozetleri kaldırıldı.** Admin panelinde sabit yazılmış
  "RLS Protected", "RLS Policy %100 Enforced" ve "30/30 Tablo" rozetleri hiçbir
  Evidence/TopicStat kaydına bağlı değildi — ve iddia zaten yanlıştı: ana `DATABASE_URL`,
  RLS'in hiç değerlendirilmediği bir SUPERUSER+BYPASSRLS rolüyle bağlanıyor. Ayarlar sayfası
  artık "Claude 3.5 Sonnet / 500 Kredi" gibi sabit metin yerine `src/lib/llm.ts`'ten gerçek
  varsayılan modeli ve faturalama kataloğundan gerçek kredi miktarını okuyor (`fd49ba4`).

### i18n
- **Pazaryeri (M8) istemci bileşeninde `t()` kullanımı sıfırdı**, 41'den fazla kullanıcıya
  görünen Türkçe metin doğrudan koda gömülüydü — İngilizce locale'de sessizce Türkçe
  gösteriyordu. Tümü `messages/tr.json` / `messages/en.json`'da yeni bir `m8` isim alanına
  taşındı (`a7c8483`).

### Sepet & Ön Yüz
- **Sepet, sayfa yenilendiğinde artık silinmiyor.** Sepet ve çerez bildirimi bileşenleri
  render sırasında `localStorage` okuyordu; sunucu boş sepetle render ediyor, istemcinin
  hydration'ı bunu localStorage'a geri yazıp müşterinin sepetini sessizce siliyordu. Artık
  `useIsHydrated()` kancasından geçiyorlar (`30daa48`), regresyon testi eklendi (`e502c9c`).
- **Tema artık sunucuda, `fabrika-theme` çerezinden çözümleniyor**; dört kez raporlanan
  "Encountered a script tag" React konsol uyarısı üç başarısız denemenin ardından kalıcı
  olarak giderildi (`0d16788`). Ölçüldü: 117 rotadan 116'sı zaten dinamikti (ƒ), tema değişikliği
  hiçbirinin statikliğini bozmadı. Safari/Firefox'ta çerez yoksa sistem-koyu kullanıcı bir kare
  açık tema görüp hydration'da düzeliyor (bilinçli olarak kabul edilen bedel).

### KVKK / Veri Silme (M4)
- **Başarısız bir imha artık alarm üretiyor.** `purgeDueUsers()` daha önce yalnızca konsola
  `console.error` yazıyordu; artık `failedCount > 0` olduğunda platform admin panelinde
  (`/admin/alerts`) görünen bir `SystemAlert` yazıyor. Alarm gövdesi yalnızca id ve hata kodu
  taşıyor — e-posta ya da ham hata metni yok (`3fab40b`).
- **İmha ile sahipsiz kalan ilişki artık yeniden atanabiliyor.** `Relationship.ownerUserId`
  imha sırasında boşaltıldığında hiçbir yazma yolu yoktu; artık `updateRelationship` bu alanı
  Zod + yetki kontrolü + kiracı üyelik doğrulamasıyla kabul ediyor; kiracı dışı bir id,
  var-olmayan bir id ile aynı yanıtı alıyor (id probe'unu engellemek için) (`3fab40b`).
- **Sahipsiz-kayıt gruplama kuralındaki `undefined`/`null` hatası düzeltildi:** `=== null`
  kontrolü bir `undefined` sahibi de geçiriyordu, bu da iki farklı kiracının sahipsiz
  kayıtlarını `t1:undefined` diye tek bir hayali alıcı altında toplayabiliyordu — kiracı
  sınırını aşan bir bildirim riski (`f5fd3c6`).

### Beta / ESR Anketi
- **Süresini tutamayacak bir ESR anket gönderimi artık reddediliyor.** Önizleme
  (`--preflight`) 13 gün kaldığını (partnerlere borçlu olunan 14 günün altında) uyarıyordu ama
  bu uyarı `--send` komutunu durdurmuyordu. `deadlineWindow()` artık her iki tarafın da
  paylaştığı tek kural; sınır tam pencerede ölçüldü: `--deadline=2026-09-21` reddedildi
  ("13 gün, 1 gün eksik"), `--deadline=2026-09-22` kapıdan geçti (`e96801f`).

### Kalite kapısı / CI
- `pnpm test:e2e` artık `pnpm gate` içinde çalışıyor; CI'a Postgres/pgvector servisi eklendi,
  `reuseExistingServer` CI'da kapatıldı (`1ffd154`).
- **`module-gate.spec.ts`'in üç testinden hiçbiri gerçekte bir modül sayfasına ulaşmıyordu.**
  Oturumsuz `/en/default/...` açıyorlardı; `(app)` layout'u anonim ziyaretçiyi zaten login'e
  yönlendiriyordu (`c915bc43`'ten beri) ve giriş ekranı da bir `<h1>` taşıdığından
  `expect(bodyText).toBeTruthy()` ve `h1.isVisible()` ikisi de o ekranda geçiyordu. Üstelik
  `default`, demo-tenant'ın workspace'i bile değil — otomatik sağlanan geçici kiracılara verilen
  slug. Spec artık kendi `basic` planındaki tenant'ını taşıyor (M5 açık → panoyu göstermeli,
  M3 kapalı → MODULE_OFF reddini göstermeli); mutasyonla üç yönden kırmızıya döndüğü kanıtlandı
  (layout yönlendirmesi kaldırılınca, yanlış hedefe yönlendirilince, iki modül anahtarı yer
  değiştirince). Aynı commit'te `plan-entitlement.spec.ts`'in paylaşılan `demo-tenant`'ın
  planını değiştirip `afterAll`'da geri alması da durduruldu — artık kendi `lens` fixture'ını
  kullanıyor (`3e14b40`).
- **Son ölçülen tam `pnpm gate` koşusu** (module-gate ve plan-entitlement düzeltmelerini de
  içeren çalışma ağacında): lint 0 hata, tsc temiz, vitest 1670 geçti / 8 atlandı, i18n 1436
  anahtar eşit, RLS 44/44 canlı ölçüm, e2e 146 geçti / 1 atlandı — `ELIFECYCLE` yok. Bu koşu
  `d27d8f4`'ü (RAG birleştirmesi) de kapsıyor (`3e14b40`'ın commit gövdesi).

---

## English

### Known issue — resolved
Root-caused but not fixed in `c0caeaf`: a route-level `loading.tsx` is a Suspense boundary,
and it made Next flush the app shell before the page had finished deciding what it was. The
server parked the fully rendered page in `<div hidden id="S:0">` at the end of `<body>` while
the client rendered the same subtree in place — the document carried two copies of every id
and heading in that window. Measured: the duplicate outlived `load` (readyState=complete at
568 ms, second copy dropped ~156 ms later), and it reproduced on both `next dev` and a
production build; the earlier theme hypothesis had already been disproved by two separate
experiments. Fix: the 18 `loading.tsx` boundaries under `(app)` and the now-unused
`WorkspaceLoadingSkeleton` were removed outright; the rule is enforced by
`tests/app-shell-no-loading-boundary.test.ts`, proved red by temporarily re-adding a
`loading.tsx` (`2a83253`).

### Billing & payment security
- **An anonymous call can no longer open a payable Stripe session.** `POST
  /api/billing/checkout` resolved its tenant as `session?.tenantId || 'default-tenant'` with
  no session gate at all — a real Checkout Session could be created under a tenant id that
  exists in no seed or schema. The route now uses the same `requireTenantApi()` gate as
  saved searches, invitations and document export; a signed-out cart is now redirected to
  login (with a return address) instead of a bare "Unauthorized", and the cart survives in
  localStorage (`290cc8c`).
- **Invoice download links no longer leak the raw error.** The XML/PDF links were plain
  `<a href>`; a failed export (e.g. missing supplier identity) put the route's raw JSON error
  code — worst case, the `missing` array naming server env vars — straight into the customer's
  browser. Downloads now go through `fetch()` with a translated toast per error code and a
  "preparing" state on the button; the export route no longer echoes `missing` in the response
  body (it still logs it, for an operator) (`72dd16f`).
- **The plan-delete guard is now locked against `planId`/`planVersionId` drift with a
  regression test.** Every `Subscription` write path was measured: `planId` is the only field
  written unconditionally and the one every reader (`getEntitlements`,
  `computePublishImpact`, `docs/BILLING.md`) treats as "which plan"; `planVersionId` is a
  separate, deliberately-stale concept. Keying the guard off it would have reproduced the
  exact inverted bug it was meant to fix. Two adversarial tests were added: a live
  subscription still blocks deletion when its `planVersionId` misleadingly points elsewhere,
  and an empty plan still deletes (`aef5706`).

### E-Invoice
- **Line-level withholding tax subtotals** added to the UBL-TR XML — boss decision
  2026-09-09 (`18106a4`). The document's total withholding now matches the sum of its line
  withholdings by construction (verified example: 24,000 kuruş).
- **Withholding rate label** is now derived from actual line data instead of a hardcoded
  "(9/10)" on the printed invoice (`ccc15b7`).
- **Invalid withholding rates can no longer reach the XML.** A rate like `0.67` was
  previously accepted silently and printed on the document by `generateUblTrXml` — a
  violation of CLAUDE.md rule 7. The existing `withholdingRateLabel()` validation now guards
  XML generation: an empty label means no Tevkifat line either. 7 new tests plus the
  existing 33 withholding/e-invoice tests pass (`ce14101`).
- **The TCMB exchange rate and its lira equivalent are now shown on the document itself**
  (printed page and XML) for foreign-currency invoices (`8118b54`).
- **VAT and withholding rounding consolidated into single functions**
  (`src/lib/money.ts`) (`34a5a53`, `6bbd1c3`, `1547db2`, `dc4da6f`).
- **UBL-TR XML amounts now computed in minor units (kuruş)**, also fixing a hardcoded
  `%20 VAT` line printed on a zero-rated sale (`34a5a53`).
- The retired `INVOICE_VAT_RATE` environment variable was removed outright from code, the
  preflight report, tests and setup docs (`e011561`).
- Invoice export gate tests strengthened: a test checking the two currencies are never mixed
  replaced a stale "never print ₺" assertion (`e236d2b`); the 503-without-env /
  200-with-env behaviour was verified end to end (`3e865d4`).

### Multi-tenancy (RLS) hardening
- **Three screens silently dropped the tenant filter.** The Evidence Pack and two
  concept-note screens built their `where` clause as `tenantId ? { tenantId } : {}` — the
  false branch was not a narrower query, it was no filter at all (`{}` selected every
  tenant's rows). The same shape had already been fixed on the M4 relationship screen
  (TASK-MTRKV9JGY7OQY). All three now resolve a required tenant through `requireTenantPage`
  and run inside `withTenantOn`; 20 unit tests verified by mutation — reinstating the ternary
  turns them all red (`d1de9d4`).
- **Two tables were exempt from both the static and live RLS scans.** `ClaimEvidenceLink`
  and `EvidenceReminder` sat in the `SYSTEM_WIDE` list while joining one tenant's data to
  another's (including recipient e-mails on reminders). A `tenantId` column was added and
  both moved to `tenant_isolation`. `AuditEvent.tenantId` being nullable also meant erasure
  records (`request-deletion.ts`, `users-scheduled-deletion.ts`, `export-data.ts`) were both
  unwritable and unreadable, since `NULL = 'x'` is never true in SQL — moved to the
  `tenant_or_shared` pattern. Verified against a role RLS actually applies to (`fabrika_app`,
  bypassrls off): `rls:check` 43 → 44 models, `rls:verify` green, cross-tenant writes still
  refused (`af75623`).
- **The `CalendarConnection` RLS policy diverged from the reference pattern on four points**:
  `RESTRICTIVE` with no permissive policy (locking tenants out of their own rows), missing
  `FORCE ROW LEVEL SECURITY`, `current_setting` without `missing_ok`, and an `is_system`
  bypass that exists nowhere else. Brought in line with the canonical policy in
  `prisma/rls.sql` (`374709f`).
- **A tenant-less call into M6 scoring can no longer compile.** `calculateCriterionAverage`,
  `calculateEvaluationScore` and `getScoreDistribution` each carried a two-argument overload
  whose `tenantId` was optional; omitting it dropped the `reviewer: { tenantId }` filter
  entirely and escaped to the global prisma client, which connects as a role RLS does not
  constrain. Nothing in the repo took that branch — nothing leaked — but the signature made
  the unscoped call look legitimate. `tenantId` is now required on both overloads; 15 new
  tests lock it with 6 compile-time (`@ts-expect-error`) plus runtime refusals (`1d49048`).

### AI / RAG layer
- **The RAG library no longer invents "evidence" on a failed or empty search.**
  `retrieveChunks` answered a database error or empty result with three hardcoded fake
  CORDIS projects at fixed 94%/88%/81% scores; those reached the model as sourced evidence
  via `generateSectionDraft`, and the admin RAG tester showed the same rows back as proof the
  corpus worked. `getEmbedding` also substituted the text's first 1536 character codes as an
  "embedding" whenever `OPENAI_API_KEY` was unset, writing it into the real `Chunk` table.
  Both are gone: a failed search now throws, an empty corpus returns an empty list. Verified
  by mutation: restoring the fake rows fails 7 tests, restoring the fake embedding fails 9
  (`45580ed`).
- **Two parallel RAG paths were merged into one.** `src/lib/ai/rag.ts` was a second chunker
  and a second similarity search left behind by an earlier LLM cleanup (`b6f1642`), running
  on a connection with no tenant context — `src/modules/m2/server/actions.ts` fed it a real
  tenant id, and the day the main connection moves to `fabrika_app` that call would have
  quietly returned only the shared corpus. There is now one similarity search in the repo and
  it runs inside `withTenant`; the PDF ingest path was closed the same way for every
  statement. `pnpm typecheck` clean, vitest 1649 passed (`d27d8f4`).

### Admin console
- **Unevidenced security and health badges removed.** The admin panel hardcoded "RLS
  Protected", "RLS Policy 100% Enforced" and "30/30 Tables" badges with no backing
  Evidence/TopicStat record — and the claim itself was false: the main `DATABASE_URL`
  connects as a SUPERUSER+BYPASSRLS role, so RLS is never evaluated on it. The settings page
  now reads the real default model from `src/lib/llm.ts` and real plan credits from the
  billing catalog instead of a hardcoded "Claude 3.5 Sonnet / 500 Credits" string (`fd49ba4`).

### i18n
- **The marketplace (M8) client component had zero `t()` usage**, with 41+ user-facing
  Turkish strings baked into the code — silently showing Turkish under the English locale.
  All of them moved into a new `m8` namespace in `messages/tr.json` and `messages/en.json`
  (`a7c8483`).

### Cart & Frontend
- **The cart is no longer wiped on page reload.** The cart and cookie-consent components
  read `localStorage` during render; the server rendered an empty cart, and the client's
  hydration wrote that empty state back to storage, silently erasing the customer's cart.
  Both now gate on `useIsHydrated()` (`30daa48`), with a regression test added (`e502c9c`).
- **Theme preference now resolved server-side from the `fabrika-theme` cookie**, fixing an
  "Encountered a script tag" React console warning reported four times and surviving three
  earlier fix attempts (`0d16788`). Measured: 116 of 117 routes stayed dynamic, none lost
  static status. Safari/Firefox users with no cookie may see one light-theme frame before
  hydration corrects it (accepted trade-off).

### GDPR / Erasure (M4)
- **A failed erasure now raises an alert.** `purgeDueUsers()` previously only logged to
  `console.error`; it now writes a `SystemAlert`, visible on `/admin/alerts`, carrying only
  ids and error codes — no subject email, no raw error text (`3fab40b`).
- **A relationship orphaned by erasure can now be reassigned.** `updateRelationship` accepts
  the field behind Zod validation, a permission check and a tenant-membership check; a
  cross-tenant id gets the same response as a non-existent one to prevent id probing
  (`3fab40b`).
- **Fixed a `null`/`undefined` bug in the unassigned-owner grouping rule** that could fold
  unassigned relationships from two different tenants into one fake `t1:undefined` recipient
  — a cross-tenant notification risk (`f5fd3c6`).

### Beta / ESR Survey
- **An ESR survey send that cannot honour its own deadline is now refused.** The preflight
  check already warned when the deadline window was short, but `--send` did not enforce it.
  `deadlineWindow()` is now shared by both; verified at the boundary: `--deadline=2026-09-21`
  is refused ("13 days, 1 day short"), `--deadline=2026-09-22` passes (`e96801f`).

### Quality gate / CI
- `pnpm test:e2e` now runs inside `pnpm gate`; CI gained a Postgres/pgvector service, and
  `reuseExistingServer` is disabled in CI (`1ffd154`).
- **None of `module-gate.spec.ts`'s three tests actually reached a module page.** They
  opened `/en/default/...` with no session; the `(app)` layout has redirected anonymous
  visitors to login since `c915bc43`, and the sign-in screen also carries an `<h1>`, so
  `expect(bodyText).toBeTruthy()` and `h1.isVisible()` both passed on it. `default` is not
  even demo-tenant's workspace — it is the slug auto-provisioning gives throwaway tenants.
  The spec now owns a tenant on plan `basic` (M5 on must render the board, M3 off must
  render the MODULE_OFF refusal), proved red by mutation three ways (removing the redirect,
  redirecting to the wrong destination, swapping the two module switches). The same commit
  stopped `plan-entitlement.spec.ts` from flipping the shared `demo-tenant`'s plan and
  restoring it in `afterAll` — it now uses its own `lens` fixture (`3e14b40`).
- **Last measured full `pnpm gate` run** (on a tree including the module-gate and
  plan-entitlement fixes): lint 0 errors, tsc clean, vitest 1670 passed / 8 skipped, i18n
  1436 keys equal, RLS 44/44 measured live, e2e 146 passed / 1 skipped — no `ELIFECYCLE`.
  That run also covers `d27d8f4` (the RAG merge) (per `3e14b40`'s commit body).

---

*Bu rapor `git log --oneline dev` ve ilgili commit gövdelerinden üretilmiştir
(TASK-MTU64VO8UILP2), HEAD `3e14b40`'a kadar. Yalnızca test/dokümantasyon amaçlı memory-note
commit'leri (`docs(memory): ...`) ve tamamen dahili kart-kapatma raporları (`docs(agent-results):
...`) bu listeye dahil edilmemiştir. `1d49048` ve `3e14b40`, ilk tam yeşil `pnpm gate` koşusundan
(`aef5706` üzerinde ölçüldü) sonra commit'lendi; `1d49048` typecheck/lint/birim testleriyle,
`3e14b40` ise hedef e2e specleriyle ve mutasyon testleriyle ayrı ayrı doğrulandı — HEAD'de ayrıca
bir tam `pnpm gate` koşusu bu raporun kanıt tabanında yoktur.*
