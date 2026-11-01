# TASK-MTUGU8O95B925 — Admin/kullanıcı ekranlarında kalan kanıtsız "durum" iddiaları

## 1. Ne yapıldı

Önceki kartımın (`TASK-MTUGKEF9KENK`) §1'inde bildirip kapsam dışı bıraktığım iki bulgudan
başlayarak, admin konsolunun tamamını ve kullanıcıya görünen diğer ekranları aynı desen için
taradım: yüzde ifadeleri, "N/N" sayaçları, "Aktif"/"Operational" durum etiketleri, veriye
bağlı olmayan tam-dolu ilerleme çubukları.

### Bulgular ve kararlar

| # | Konum | İddia | Karar | Gerekçe |
|---|---|---|---|---|
| 1 | `admin/layout.tsx` (header) | `Sistem Durumu: Aktif (%100 Operational)` | **Kaldırıldı** | Kendi önceki kartımda RLS rozetleri için tespit ettiğim, henüz düzeltilmemiş ikinci bulgu. Hiçbir sağlık kontrolüne/Evidence kaydına bağlı değil. Bugün ucuz bir canlı kaynak yok (bir health-check endpoint'i inşa etmek ayrı, daha büyük bir iş) → sahte rakam üretmek yerine kaldırdım. |
| 2 | `admin/layout.tsx` (sol menü "Sistem Sağlığı" kutusu) | `100% OK` + tam dolu (`h-full w-full`) yeşil ilerleme çubuğu | **Kaldırıldı** | Aynı gerekçe — koda gömülü, hep-yeşil hep-%100 render edilen bir çubuk, arkasında hiçbir ölçüm yok. |
| 3 | `admin/settings/page.tsx` (Veritabanı & RLS paneli) | `RLS Policy Kapsam: 30 / 30 Tablo (%100)` | **Kaldırıldı** | Önceki kartımda `admin/layout.tsx`'te aynı iddiayı (`RLS Güvenlik: 30/30 Tablo`) kaldırmıştım ama tarama o dosyayla sınırlıydı — bu, **aynı yanlış iddianın farklı bir dosyadaki kopyası**. Ana `DATABASE_URL` `fabrika` rolüyle (SUPERUSER+BYPASSRLS) bağlanıyor (`src/lib/db.ts`, `prisma/rls-app-role.sql`) — RLS bu bağlantıda hiç değerlendirilmiyor, iddia ölçülebilir gerçekle çelişiyor. |
| 4 | `admin/settings/page.tsx` (sayfa başlığı yanı) | `Config Active` rozeti | **Kaldırıldı** | Görev talimatındaki "Aktif" durum etiketi deseniyle birebir örtüşüyor. SMTP/AI ayarlarının gerçekten dolu/geçerli olup olmadığına bakmadan koşulsuz render ediliyor — hiçbir state'e bağlı değil. Gerçek bir "yapılandırıldı mı" kontrolü kurmak (DB okuma + form state) bu kartın kapsamının dışında; kaldırdım. |
| 5 | `admin/settings/page.tsx` (YZ paneli) | `Varsayılan LLM Model: Claude 3.5 Sonnet / GPT-4o` | **Bağlandı** (gerçek kaynağa) | Kontrol ettim: gerçek varsayılan `src/lib/llm.ts`'teki `DEFAULT_MODELS` sabiti — anthropic için **`claude-sonnet-5`**, `Claude 3.5 Sonnet` değil (dosyadaki yorum bunu açıkça "current değil" diye işaretliyor). Yani bu sadece kanıtsız değil, **yanlıştı**. `DEFAULT_MODELS`'i `llm.ts`'te `export` ettim ve sayfaya import ederek değeri koddan türettim — artık ikinci bir kopya yerine tek doğruluk kaynağından okunuyor. |
| 6 | `admin/settings/page.tsx` (YZ paneli) | `Aylık Varsayılan Kredi: 500 Kredi (Team Plan)` | **Bağlandı** (gerçek kaynağa) | Kontrol ettim: `src/lib/billing/catalog.ts`'teki `PLAN_GRANTS`'te "Team Plan" diye bir paket **yok** (planlar: Discover/Basic/Pro/Ultra); 500 kredi rakamı `Pro` paketine ait, `free` (yeni kiracıya atanan gerçek varsayılan, bkz. `subscription-sync.ts:511,570`) paketine değil — onun kredisi 10. Yani hem paket adı hem "varsayılan" iddiası yanlıştı. `PLAN_GRANTS`'i import edip `free` planın gerçek `aiCreditsMonthly` ve `name` alanlarını render ettim; satır etiketini de gerçeğe uyacak şekilde "Varsayılan Plan Kredisi" olarak değiştirdim. |
| 7 | `admin/settings/page.tsx` (YZ paneli) | `Inngest Cron Suite: 7 Aktif Görev` | **Dokunulmadı — doğrulandı, doğru** | `src/app/api/inngest/route.ts`'teki `functions: [...]` dizisini saydım: gerçekten 7 kayıtlı iş var (`k1DailyCalls`, `k2MonthlyCordis`, `alertsDaily`, `creditsMonthlyGrant`, `m4WeeklySummary`, `usersScheduledDeletion`, `feedbackWeeklyDigest`). Sayı doğru ve koddan doğrulanabilir; "Aktif" kelimesi burada "cron ile zamanlanmış/kayıtlı" anlamında, sistemin canlı sağlık durumu iddiası değil. Dinamik olarak bağlamadım çünkü bunun için `route.ts`'i (bir API route dosyası, yan etkili modül) bir sayfa bileşenine import etmek gerekirdi — riskli/gereksiz; statik sayı zaten koddan doğrulanmış durumda. |
| 8 | `admin/settings/page.tsx` (Veritabanı paneli) | `Driver Adapter: @prisma/adapter-pg (Prisma 7)`, `Vector Extension: pgvector 1536d` | **Dokunulmadı — doğrulandı, doğru** | `package.json`'da `@prisma/adapter-pg@^7.10.0`, `prisma@7.10.0`; `prisma/schema.prisma`'da `Unsupported("vector(1536)")`. Bunlar mimari/sürüm bilgisi, bir "sağlık/uyum" iddiası değil — CLAUDE.md kural 7'nin hedeflediği "istatistik/oran" sınıfından değil. |
| 9 | `i18n-check/page.tsx` | `100% Localization Parity Achieved` | **Dokunulmadı — zaten doğru desen** | Bu sayfa `messages/tr.json`/`en.json`'ı **istek anında dosyadan okuyup gerçekten karşılaştırıyor** (`parityMatch = missingInEn.length === 0 && missingInTr.length === 0`); rakam gömülü değil, canlı hesaplanıyor. Rule 7'nin istediği tam da bu — örnek olarak iyi, bulgu değil. |
| 10 | `turkiyeye-acik-cagrilar/page.tsx` | "...%100 doğrudan hibe alabilir" | **Dokunulmadı — kapsam dışı** | Bu, Fabrika'nın kendi sistem durumuyla ilgili bir iddia değil; Horizon Europe programının (dış, kamuya açık) hibe oranını anlatan içerik metni. Rule 7'nin hedeflediği "platformun kendi ölçülen durumu" değil. |

### Kod değişiklikleri özeti

- `src/app/[locale]/admin/layout.tsx`: header'daki "System Health Badge" (#1) ve sol menüdeki
  "Sistem Sağlığı" kutusu + ilerleme çubuğu (#2) tamamen kaldırıldı; artık kullanılmayan
  `Activity` (lucide-react) import'u temizlendi.
- `src/app/[locale]/admin/settings/page.tsx`: "Config Active" rozeti (#4) ve "RLS Policy
  Kapsam: 30/30 Tablo" satırı (#3) kaldırıldı; artık kullanılmayan `Sliders` import'u
  temizlendi. "Varsayılan LLM Model" (#5) ve "Aylık Varsayılan Kredi" → "Varsayılan Plan
  Kredisi" (#6) satırları gerçek kod sabitlerinden (`DEFAULT_MODELS`, `PLAN_GRANTS`) türetildi.
- `src/lib/llm.ts`: `DEFAULT_MODELS` sabiti `export` edildi (tek satır) — başka davranış
  değişikliği yok.
- `messages/tr.json` / `messages/en.json`: yeni `adminSettings` namespace'i — üç anahtar
  (`defaultLlmModelLabel`, `defaultPlanCreditsLabel`, `creditsUnit`), her iki dile de eklendi.
  Sayfa artık bu iki satır için `getTranslations({ locale, namespace: 'adminSettings' })`
  kullanıyor (`params` prop'u bu yüzden sayfaya eklendi — önceden yoktu).

### Bilinçli kapsam sınırı

`admin/settings/page.tsx`'teki diğer bütün etiketler (`Driver Adapter:`, `Vector Extension:`,
`Sistem & Küresel Konfigürasyon`, panel başlıkları vb.) ve `admin/layout.tsx`'teki footer/nav
metinleri zaten bu karttan önce de düz string'ti (t() kullanmıyordu) — bu, CLAUDE.md kural
8'in genel, dosya çapında bir borcu; bu kartın kapsamı yalnız kural-7 (kanıt disiplini)
ihlalleriydi. Yalnız **bu karttaki fix'in ürettiği/değiştirdiği** iki satırı (`Varsayılan LLM
Model`, `Varsayılan Plan Kredisi`) t()'ye taşıdım; dosyanın geri kalanını i18n'e çevirmek
ayrı, çok daha büyük bir iş (muhtemelen kendi kartı).

Diğer admin sayfalarını (`alerts`, `audit`, `billing`, `blog`, `cordis`, `feedback`, `modules`,
`tenants`) da aynı desen için grep'ledim (`Operational`, `%100`, `100%`, `Sistem Durumu`,
`h-full w-full`, `>Aktif<`) — bu iki dosya (`layout.tsx`, `settings/page.tsx`) dışında hiçbir
eşleşme yok.

## 2. Kanıt

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok — temiz)

$ npx eslint 'src/app/[locale]/admin/layout.tsx' 'src/app/[locale]/admin/settings/page.tsx' 'src/lib/llm.ts'
(çıktı yok — 0 hata/uyarı)
[Not: repo genelinde `pnpm lint` şu an bağımsız bir nedenle kırık — bkz. §4 Riskler]

$ pnpm i18n:check
Summary:
  Static keys used in code: 1075
  Dynamic key patterns:     31
  Keys in messages/tr.json: 1428
  Keys in messages/en.json: 1428
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.

$ pnpm test
 Test Files  137 passed | 2 skipped (139)
      Tests  1634 passed | 8 skipped (1642)
(hiçbir test bozulmadı)

$ git diff --stat -- 'src/app/[locale]/admin/layout.tsx' 'src/app/[locale]/admin/settings/page.tsx' 'src/lib/llm.ts' 'messages/tr.json' 'messages/en.json'
 messages/en.json                         |  5 ++++
 messages/tr.json                         |  5 ++++
 src/app/[locale]/admin/layout.tsx        | 39 +--------------------------
 src/app/[locale]/admin/settings/page.tsx | 45 +++++++++++++++++---------------
 src/lib/llm.ts                           |  2 +-
 5 files changed, 36 insertions(+), 60 deletions(-)
```

Doğrulama kaynakları (elle okundu):
- `src/lib/db.ts`, `prisma/rls-app-role.sql` — ana bağlantının BYPASSRLS olduğu (bulgu #3).
- `src/lib/llm.ts:30-43` — gerçek varsayılan model `claude-sonnet-5` (bulgu #5).
- `src/lib/billing/catalog.ts:402-439`, `src/lib/billing/subscription-sync.ts:511,570` —
  gerçek plan listesi ve yeni kiracıya atanan varsayılan (`free`) (bulgu #6).
- `src/app/api/inngest/route.ts:15-23` — 7 kayıtlı iş, sayıldı (bulgu #7).
- `package.json:48-49,97`, `prisma/schema.prisma:168,483,1110` — Prisma/pgvector sürümleri
  (bulgu #8).

## 3. Değişen dosyalar

- `src/app/[locale]/admin/layout.tsx` — iki kanıtsız "sistem sağlığı" rozeti/kutusu kaldırıldı,
  kullanılmayan `Activity` import'u temizlendi.
- `src/app/[locale]/admin/settings/page.tsx` — "Config Active" rozeti ve yanlış "RLS 30/30"
  satırı kaldırıldı; "Varsayılan LLM Model" ve "Varsayılan Plan Kredisi" satırları gerçek kod
  sabitlerinden türetildi ve t()'ye taşındı; kullanılmayan `Sliders` import'u temizlendi.
- `src/lib/llm.ts` — `DEFAULT_MODELS` export edildi.
- `messages/tr.json`, `messages/en.json` — yeni `adminSettings` namespace'i (3 anahtar).
- `docs/agent-results/TASK-MTUGU8O95B925-customer-support.md` — bu rapor.

Commit ATILMADI (görev talimatı gereği) — değişiklikler çalışma ağacında bırakıldı. Önceki
kartımın (`TASK-MTUGKEF9KENK`) commit edilmemiş değişiklikleri (`docs/ROADMAP.md` madde 16
dahil) korunuyor, üzerine yazılmadı.

## 4. Riskler

- Repo genelinde `pnpm lint` şu anda **benim değişikliğimle ilgisiz** bir nedenle kırık:
  `src/app/[locale]/(app)/[workspace]/dashboard/loading.tsx` dosyası çalışma ağacında silinmiş
  görünüyor (`git status` → `D  ...dashboard/loading.tsx`) ve ESLint bu dosyayı okumaya çalışıp
  `ENOENT` ile patlıyor. Bu, ortak ağaçta eşzamanlı çalışan başka bir ajanın (bu turda
  `pnpm dev`/`pnpm test:e2e`/`pnpm gate` benim payıma değil, blok-zincir-dev'e ayrılmıştı)
  sürmekte olan işi olabilir — dokunmadım, silinmiş dosyayı geri getirmedim. Kendi
  dosyalarımı tek tek `npx eslint <dosyalar>` ile doğruladım (temiz).
- `admin/layout.tsx`'te kaldırılan iki kutu, konsolu görsel olarak biraz daha sade bırakıyor
  (header'da artık sadece logo+chevron+kullanıcı menüsü; sol menüde artık alt kutu yok). Bilinçli
  tercih — önceki kartla aynı gerekçe (sahte rozeti tutmak kural 7'yi ihlal etmeye devam ederdi).
- `admin/settings/page.tsx`'in geri kalanı hâlâ i18n'e taşınmamış durumda (bkz. "Bilinçli
  kapsam sınırı") — ayrı bir karar/kart gerektirir.
- Görsel/tarayıcı doğrulaması yapılamadı (`pnpm dev` bu turda benim payımda değildi) — yalnız
  statik analiz + testlerle doğrulandı.

## 5. Açık sorular

- `admin/settings/page.tsx`'in kalan düz-string etiketlerinin (Driver Adapter, Vector
  Extension, panel başlıkları vb.) i18n'e taşınması ayrı bir kart mı olmalı?
- `dashboard/loading.tsx` silinmesi (bkz. Riskler) kasıtlı bir iş mi yoksa yarım kalmış bir
  değişiklik mi — ilgili ajanla/PM ile teyit edilmeli, ben dokunmadım.

## 6. Sonraki adım

- PM/Patron, kalan i18n borcu (`admin/settings/page.tsx`'in geri kalanı) için ayrı bir kart
  açsın ya da isterse önceliklendirmesin (kural 8'in genel borcu, bu kartın kapsamı değildi).
- `dashboard/loading.tsx` durumu, o dosyaya dokunan ajanla netleştirilsin.

## Platform beyanı

Doğrulama **mac (Darwin 25.6.0)** üzerinde yapıldı — `pnpm typecheck`, hedefli `eslint`,
`pnpm i18n:check`, `pnpm test` bu platformda koşuldu ve temiz geçti (repo-geneli `pnpm lint`
benimle ilgisiz bir ENOENT nedeniyle kırık — yukarıda açıklandı). Bu değişiklik yalnız
JSX/metin kaldırma, iki sabitin `export` edilip bir sayfaya import edilmesi ve i18n anahtarı
ekleme; süreç yönetimi, dosya yolu, kabuk/ikili, ekran/DPI ya da izin gibi platforma bağlı
hiçbir kod yoluna dokunulmadı — Windows/Linux'ta davranış farkı beklenmiyor. Görev talimatı
gereği `pnpm dev` / `pnpm test:e2e` / `pnpm gate` ve DB'ye dokunan hiçbir komut koşulmadı (bu
turda blok-zincir-dev'e ayrılmıştı); görsel/tarayıcı doğrulaması bu yüzden yapılamadı.
