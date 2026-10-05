# TASK-MUN2TQ1W6WP8E — FB gizli sütun bekçisi düzeltmesi (İNCELEME-29 B-1, B-2, Ö-1..Ö-3)

**Ajan:** fe-fb · **Sprint:** FB-KAMU-2 · **Dal:** dev · **Tarih:** 29.09.2026
**Kaynak:** `docs/agent-results/TASK-MUN2AMIFGBQ90-crw-fb.md` (İNCELEME-29, bulgular B-1, B-2, Ö-1, Ö-2, Ö-3, K-1 ve MU tablosu)
**Commit'ler:** `d03046cc` (B-1, B-2, Ö-1, Ö-3, Ö-2 belgesi) · `d5f5365f` (Ö-2 E3/E9)

## 1. Ne yapıldı

| Bulgu | Çözüm |
|---|---|
| **B-1** — nesne argümanlı ilişki include'u bekçiden geçiyordu | İlişki alanı artık `rel: true` ve `rel: { … }` biçimlerinin ikisinde de aranıyor. Nesnenin kendi en üst düzeyinde `select` olmalı. Aynı kural `include` altında da `select` altında da geçerli (`select: { invitations: true }` de yakalanıyor). İlişki filtreleri (`some/every/none/is/isNot`) ve iç içe yazma işlemleri (`create/connect/…`) okuma sayılmıyor ve atlanıyor. E1, E2, E11 ve başka şekiller fixture olarak eklendi. |
| **B-2** — izin listesindeki başvuru sayfası korunmuyordu | Önerilen yol **(a)** ile **(b)** birlikte uygulandı. (a) `opportunities/[id]/application/page.tsx` parçaları `include: { applicationParts: { select: { id, part, content } } }` ile okuyor. `hasPortalLink` artık aynı `withTenant` içindeki `applicationPart.findMany({ where: { opportunityId, tenantId, magicTokenHash: { not: null } }, select: { id: true } })` sorgusundan geliyor. Böylece hash sayfanın belleğine hiç girmiyor. `RELATION_INCLUDE_ALLOWLIST` tamamen kaldırıldı. (b) `secret-model-props`'a bu sayfa için bir test eklendi: sahte `opportunity.findFirst`, include `true` ise bütün satırı, `{ select }` ise projeksiyonu döndürüyor. Test `<ApplicationClient>` prop'larında `expectNoSecrets` çalıştırıyor ve `hasPortalLink: true` / `content` alanlarının hâlâ geldiğini doğruluyor. |
| **Ö-1** — `select`'in değeri denetlenmiyordu | Kabul edilen `select` değerleri: bir nesne literal'i ya da aynı dosyada nesne literal'i olarak tanımlanmış UPPER_SNAKE `*_SELECT` sabiti (sabit çözülüp içi taranıyor). `select: undefined`, koşullu select, küçük harfli değişken ve başka dosyadan import edilen sabit reddediliyor. Select içinde modelin gizli sütunu `false` dışında bir değerle yer alırsa ihlal sayılıyor. Bilinçli iki istisna gerekçesiyle `SECRET_SELECT_ALLOWLIST`'te: portal sayfası (hash timing-safe karşılaştırılıyor, sayfada client component yok) ve `addBudgetLineByToken` (yalnız `{ success }` döndürüyor). Bu iki satırın hâlâ var olduğunu bir tazelik testi denetliyor. |
| **Ö-2** — erişim biçimi kaçışları | Ucuz olan iki biçim eklendi: köşeli parantezle erişim `tx['calendarConnection']` (E3) ve opsiyonel zincir `tx.calendarConnection?.findMany` (E9). Metin taramasıyla görülemeyenler bekçinin doc-comment'ine "Known blind spots" başlığıyla yazıldı: takma adlı delegate (E4), `$queryRaw` (E5), `aggregate` (E10), değişkenle verilen ilişki argümanı, src/lib yardımcısından dönen satır. Bunları runtime prop testi tamamlıyor. |
| **Ö-3** — kapsam | Kapsam, yalnız route dosyalarından **src/app altındaki bütün dosyalara** genişletildi. Böylece `_components/*.tsx` gibi server component'ler de taranıyor, `'use server'` modülleri de kapsamda kalmaya devam ediyor. Bu genişlemeden sonra repo taraması 0 ihlal veriyor. `src/lib` yardımcıları bilerek kapsam dışında bırakıldı: `sync.ts` ve `api-auth.ts` sırrı sunucu içinde kullanmak zorunda. Gerekçe bekçi dokümanında. |
| **K-1** — `/tr/<ws>/ayarlar/takvim` 404 | Kapsam dışı, dokunulmadı. crw'nin notu geçerli: `routes.ts:121` TR yolunu üretiyor, `next.config.ts`'de bu yol için rewrite yok ve bugün bu adrese giden link de yok. Ayrı bir kart olarak açılabilir. |

## 2. Kanıt

### Mutantlar (temiz worktree `d5f5365f`; her mutanttan sonra `git checkout HEAD --`, sonunda `git status` = clean)
```
## MU1 calendar select names accessToken  exit=1
    × src/app files and server actions never read a secret model without select
    × calendar settings page: <CalendarClient> props carry no OAuth token
    Tests  2 failed | 37 passed (39)
## MU2 tx['calendarConnection'] without select  exit=1
    Tests  2 failed | 37 passed (39)          ← önce yalnız prop testi yakalıyordu; artık bekçi de
## MU3 crw verbatim: pre-fix page, destructure dropped  exit=1
    × src/app files and server actions never read a secret model without select
    × application page: <ApplicationClient> learns a portal link exists, never its hash
    Tests  2 failed | 37 passed (39)
    tsc_exit=0                                ← tsc hâlâ kör, iki test kapısı kırmızı
## MU3b new page: relation select names magicTokenHash, passed on  exit=1
    Tests  2 failed | 37 passed (39)
## MU3c new page: relation include with orderBy (E1), no select  exit=1
    Tests  2 failed | 37 passed (39)
## MU3d new page: relation include true (old shape)  exit=1
    Tests  2 failed | 37 passed (39)
## MU4 calendar select: undefined (E6)  exit=1
    Tests  2 failed | 37 passed (39)
clean
```
MU3, crw'nin mutantının birebir kopyası: sayfa `7bb11e85` sürümüne döndürüldü ve aynı iki satır değiştirildi. Önceden 18/18 yeşildi, şimdi 2 kapı kırmızı. Betik: `scratchpad/mutants.py` (repoya eklenmedi).

### crw'nin kaçış denemeleri (`findOffences` üzerinden, E1..E11)
```
PROBE E1 relation include with args, no select: offences=1
PROBE E2 relation include with where: offences=1
PROBE E3 bracket accessor: offences=1
PROBE E4 aliased delegate: offences=0          ← bilinen kör nokta (belgelendi)
PROBE E5 raw SQL: offences=0                   ← bilinen kör nokta (belgelendi)
PROBE E6 select: undefined: offences=1
PROBE E7 conditional select: offences=1
PROBE E8 select naming the secret: offences=1
PROBE E9 optional-chained op: offences=1
PROBE E10 aggregate of secret: offences=0      ← bilinen kör nokta (belgelendi)
PROBE E11 relation select with nested include: offences=1
```
Önce 0/11 yakalanıyordu, şimdi 8/11. Kalan 3 kaçışın repoda karşılığı yok (crw'nin grep'i) ve bekçi dokümanında listeli.

### Kapılar (temiz worktree @ `d5f5365f`, `pnpm install --frozen-lockfile` + `prisma generate`)
```
vitest guard + props + m9-calendar-connect → Test Files 3 passed (3) · Tests 52 passed (52)   (baseline, d03046cc)
vitest guard + props (d5f5365f)              → Tests 39 passed (39)
tsc_exit=0
pnpm lint → lint_exit=0
pnpm build → build_exit=0
```
Paylaşılan ağaçta da güncel HEAD'de (`a2c2a9b3`, be-fb'nin updateMany guard commit'i sonrası) guard + props **39/39** yeşil.
Paylaşılan ağaçta `tsc` 3 hata veriyor: `api/invitations/route.ts:128` ve `billing/seat-limit.ts:58` içindeki `acceptedAt` (commit'lenmemiş şema değişikliği; Prisma client yeniden üretilmemiş) ile `tests/helpers/where-guard-scan.ts:212`. Üçü de başka ajanların commit'lenmemiş işine ait. Benim üç dosyamda tsc hatası 0. Bu nedenle kapı kanıtı temiz worktree'den alındı.

**Tam süit koşulmadı:** izole bir DB kurulmadı, paylaşılan DB'de de toplu silme yapılmadı. Değişiklik yalnız mock'lu testlere ve bir sayfanın okuma şekline dokunuyor. Başvuru sayfası canlı ölçülmedi: demo-tenant'ta M11 kapalı. Crw'nin gerekçesiyle aynı şekilde, ortak DB'deki modül bayrağı başka ajanları etkileyeceği için çevrilmedi. Sayfanın prop sözleşmesi runtime testiyle sabitlendi.

## 3. Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/page.tsx`: select'li okuma ve `hasPortalLink` için hash filtresi
- `tests/secret-model-select-guard.test.ts`: dedektörün yeniden yazımı (ilişki nesnesi, select değeri, gizli alan, E3/E9), kapsam, sınır listesi, allowlist ve 32 fixture
- `tests/secret-model-props.test.tsx`: başvuru sayfası testi, include'u anlayan sahte `opportunity.findFirst` ve `applicationPart.findMany`
- `docs/agent-results/TASK-MUN2TQ1W6WP8E-fe-fb.md` (bu rapor)

## 4. Riskler
- **Davranış değişikliği:** `hasPortalLink` artık ikinci bir sorguyla (aynı transaction ve tenant içinde) hesaplanıyor. Parça sayısı fırsat başına en fazla 2, bu yüzden maliyeti ihmal edilebilir. Sayfaya giden `part` nesnesinde `tenantId/opportunityId/createdAt/updatedAt` artık yok. `client.tsx` yalnız `id/part/content/hasPortalLink` alanlarını okuyor (grep ile doğrulandı).
- **Yanlış pozitif olasılığı:** src/app içindeki bir destructure'da ilişki adıyla `{`'nin yan yana gelmesi (örneğin `{ apiKeys: { … } }`) ihlal sayılabilir. Bugün repoda böyle bir satır yok. Olursa ihlal mesajı satırı gösteriyor.
- **Bekçinin yeni kuralı:** select bir değişkense ve adı `*_SELECT` biçiminde değilse ya da sabit başka bir dosyadan import ediliyorsa, gizli model için ret veriliyor. Bugün 0 ihlal var. İleride import edilen bir select sabiti gerekirse sabit o dosyaya taşınmalı ya da kural genişletilmeli.

## 5. Açık sorular
- K-1 için ayrı bir kart açılsın mı? (TR `ayarlar/takvim` rewrite'ı ya da routes.ts'ten kaldırılması.)

## 6. Sonraki adım
- crw-fb: İNCELEME-29 yeniden kontrolü (MU1..MU4 ve E1..E11 yukarıda).
- İsteğe bağlı: `src/lib` yardımcılarının dönüş tipini sırsız bir tip ile sınırlayan bir tip testi (Ö-3'ün kalan yarısı).

## Platform
- **Doğrulandığı yer:** macOS (Darwin 27.0.0), Node + pnpm 11.25, vitest 4.1.11, Next 16 prod build (temiz worktree).
- Değişiklik platformdan bağımsız: Prisma `select`/`include` semantiği, RSC prop serileştirmesi ve metin tabanlı statik tarama. Bekçi dosya yollarını `path.sep` → `/` ile normalleştiriyor, bu yüzden Windows'ta kapsam ve allowlist anahtarları aynı kalır. Yolda kabuk, süreç ya da ikili dosya adı geçmiyor.
- Windows ve Linux **koşulamadı**, çünkü bu makinede yalnız macOS var. Koddan bakınca aynı sonuç beklenir.
