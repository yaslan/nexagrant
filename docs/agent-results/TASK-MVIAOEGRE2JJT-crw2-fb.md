---
sözleşme: 3
görev: TASK-MVIAOEGRE2JJT
kod: TASK-MVIAOEGRE2JJT
ajan: crw2-fb
motor: claude
tip: karar
okur: ekip
hüküm: Kısmen bitti: inceleme tamam, hüküm DÜZELTME GEREKLİ. Y1 canlı testi gerçek DB'de koşuyor ve mutantı yakalıyor, ama CI'da opt-in değişkeni olmadığı için dosya "refusing to skip in CI" hatasıyla düşüyor (bloker). Faz 3'teki i18n ve Y8 atıf metni hâlâ `isTr ?` ile geliyor.
platform: mac (darwin) üzerinde, izole Postgres konteynerinde (pgvector pg16, :5613) doğrulandı. CI (Linux) davranışını `CI=true` vererek yerelde taklit ettim. Değişen kodda platforma özgü yol yok (Node/Prisma/Next), bu yüzden Windows ve Linux'ta aynı davranış beklenir. Windows'ta koşulamadı, çünkü bu ofiste Windows makinesi yok.
sürüm: 1
tarih: 2026-10-23T05:08:26.102Z
---

# FO-113 yeniden inceleme (crw2-fb) — feat/partner-search-interreg

## Ne yapıldı
Kod değiştirmedim, yalnız inceledim. `feat/partner-search-interreg` HEAD'i (3e7bed63) için ayrık bir worktree açtım ve `pnpm install` ile `prisma generate` çalıştırdım. Ardından `crw2-fo113-pg` adlı izole bir Postgres konteyneri kurdum. Şemayı `fabrika` DB'sinden `pg_dump -s` ile aldım; veri kopyalanmadı ve paylaşılan DB'ye yazılmadı. İş bitince konteyneri ve worktree'yi sildim.

## Kanıt (ham çıktı)

**(a) Canlı Y1 testi, izole DB'de:**
```
KEEP_EU_LIVE=1 DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:5613/fabrika perl -e 'alarm 900; exec @ARGV' pnpm vitest run tests/keep-eu-sync.live.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
exit=0
```
Testin gerçekten ölçtüğünü mutantla gösterdim. `keep-eu-sync.ts:677`'deki koşulu `if (country) fill.country = country; fill.name = partnerName;` yaptım, yani eski "üzerine yaz" davranışını geri getirdim:
```
× keep.eu leaves an existing CORDIS organisation name, country and city unchanged
× keep.eu fills only the fields that were empty
Expected: "CORDIS Registered GmbH"  Received: "keep.eu Ad Ltd"
Tests  2 failed | 1 passed (3)
```
Mutantı geri aldım. `afterAll` temizliği çalışıyor: koşudan sonra `CordisOrganization` satır sayısı 0.

**CI taklidi (opt-in değişkeni yok):**
```
CI=true KEEP_EU_LIVE= ... pnpm vitest run tests/keep-eu-sync.live.test.ts
Error: keep-eu-sync.live: refusing to skip in CI — KEEP_EU_LIVE=1 is not set ...
 Test Files  1 failed (1)
```
`grep -rn KEEP_EU_LIVE .github scripts package.json githooks` yalnız test dosyasının kendisinde eşleşme buldu.

**Kartın vitest listesi ve v1-partners testi:**
```
perl -e 'alarm 900; exec @ARGV' pnpm vitest run tests/keep-eu-sync.test.ts tests/partner-interreg-filter.test.ts tests/admin-interreg-actions.test.ts tests/blog-content.test.tsx tests/blog-markdown-edit.test.ts tests/api/v1-partners.test.ts
 Test Files  6 passed (6)
      Tests  71 passed (71)
exit=0
```
**Lint ve typecheck:**
```
pnpm lint      → ✖ 4 problems (0 errors, 4 warnings)  lint=0
pnpm typecheck → $ tsc --noEmit                        tc=0
```
**B3:** `git grep "yasinaslan|assign-ultra-lifetime|OMURBOYU20" -- src scripts prisma package.json` hâlâ eşleşme veriyor. Ancak bu eşleşmelerin tamamı `8b34f7a5^`'te, yani bu dalın tabanında da vardı (demo-login, create-superadmin, katalog kuponu). Bu daldan gelen bir şey değil. Betik dosyası yok, `package.json` ve `seed-tenant-workspace.ts` diff'inde lifetime/ultra/128800 satırı da yok. Kartın "git grep boş" şartı tabandaki satırlar yüzünden harfiyen sağlanamaz. Daldan gelen bir kalıntı ise yok.

## Bulgular (önem sırasına göre)

### BLOKER
**K1 · Canlı Y1 testi CI'ı kırıyor.** Yer: `tests/keep-eu-sync.live.test.ts:31` ve `.github/workflows/ci.yml:164-169`. CI'da `CI=true` ayarlı, `KEEP_EU_LIVE` ise ayarlı değil. Bu durumda `skipOrFailInCi` modül kapsamında hata fırlatıyor ve Test adımı kırmızı oluyor. Değişken verilmeyip yalnız skip'e izin verilseydi de sonuç değişmezdi: `scripts/check-live-skips.ts` atlanan her `*.live` testini zaten kırmızı sayıyor.
- **Düzeltme:** `ci.yml` Test adımının `env:` bloğuna `KEEP_EU_LIVE: '1'` eklensin. CI'daki DB atılacak bir servis konteyneri, test satırları da koşuya özel id taşıyor ve sonunda siliniyor, yani güvenli.
- Ek kanıt: değişiklik sonrası yerelde `CI=true KEEP_EU_LIVE=1` ile koşu ve `check-live-skips` çıktısı rapora konsun.

### DÜZELTME (DoD açığı, kural #8)
**K2 · Y8 ve Faz 3 i18n tamamlanmadı.** Yerler:
- `src/app/[locale]/(app)/[workspace]/partners/page.tsx:439-440`: atıf metni `isTr ? … : …` ile geliyor; kart bunun i18n anahtarıyla gelmesini istiyor.
- Aynı dosyada toplam 17 `isTr ?` var (örneğin `:465`, `:492-493`). `PartnerFilters.tsx` içinde 11 tane.
- `admin/interreg/client.tsx:58`: varsayılan sorgu Türkçe sabit (`'Sürdürülebilir turizm ve kültürel miras'`).
- `src/lib/blog-markdown-edit.ts:155`: varsayılan değer `fallbackText = 'Bağlantı'`.

Senaryo: `/en/<ws>/partners?min_projects=3` sayfasındaki çip Türkçe yanlış göstermiyor, ama metinler `messages/*` dışında kalıyor ve `i18n:check` bunları görmüyor. be-fb'nin erteleme gerekçesi "paylaşımlı ağaçta messages/*.json'da başkasının commit'siz değişikliği var" idi. Bu gerçek bir engel değil: ayrık bir worktree'de çalışılarak aşılabilir.

### ÖNERİ (bloke etmez)
**K3 · Boş ülke doldurulunca `isTurkish` güncellenmiyor.** Yer: `src/lib/keep-eu-sync.ts:677`. CORDIS satırında `country=null, isTurkish=false` var ve keep.eu `TR` getiriyor. Bu durumda ülke `TR` oluyor ama `isTurkish` false kalıyor. `partners/page.tsx:110` (`is_turkish=true` filtresi) bu kurumu kaçırıyor. Canlı testteki `PIC_FILL` kurumu tam bu durumda, ama `isTurkish` assert edilmiyor.
- **Düzeltme:** ülke dolduruluyorsa `fill.isTurkish = country === 'TR'` da yazılsın, teste de assert eklensin.

**K4 · Admin RAG sorgusunun actor atfı eksik (Faz 3 #13).** Yer: `src/app/[locale]/admin/interreg/actions.ts:43-46`. `requirePlatformAdmin()` `{ userId }` döndürüyor ama sonuç atılıyor. `retrieveChunks(input.query, input.topK)` actor almadan çağrılıyor, bu yüzden embedding çağrısının `AiUsageLog` satırında `userId` boş kalıyor. be-fb raporunda bu madde için bir erteleme notu da yok.
- **Düzeltme:** `const { userId } = await requirePlatformAdmin(); retrieveChunks(q, k, undefined, { userId })`.

**K5 · `routes.ts`'teki kullanılmayan anahtarlar ertelendi.** Gerekçe yazılmış, kabul edilebilir. Takip için kart açılsın.

## Kapanış tablosu
| Madde | Durum | Kanıt |
|---|---|---|
| B1 commit kodu | ✅ | da9368da, c5e38741 ve c12afb44 FO-113 kodunu taşıyor. FO-58/61/33 kart notları **yok** (lider yapmalı). |
| B2 UA / 403 | ✅ | `keep-eu-sync.ts:43` dürüst UA; `:521-531` 403 durumunda `keep_eu_forbidden` alarmı ve `forbidden`; retry yok. |
| B3 lisans betiği | ✅ | Betik yok; dal diff'inde lifetime satırı yok. Kalan eşleşmeler tabandan geliyor. |
| Y1 | ✅ | Canlı test 3/3, mutantta kırmızı. K1 (CI) açık. |
| Y2 RawFetch gövdesi ve hash | ✅ | `:542-555` |
| Y3 timeout | ✅ | `:507`, `:566-572` |
| Y4 / Y5 / Y6 / Y7 | ✅ | `:1017` COUNT DISTINCT; CLI `exitCode` ve `finally`, `--source-db-only`; `page.tsx:115-122` HAVING; groupBy/distinct |
| Y8 atıf | ⚠️ | İçerik doğru, ama i18n anahtarı yok (K2). |
| Faz 3 | ⚠️ | Zod ✅, isSafeUrl ✅, eslint ignore ✅, M1 ✅, deleteMany hack temizlendi ✅. i18n ❌ (K2), actor ❌ (K4), routes ertelendi. |
| Tarayıcı doğrulaması | ❌ | c5e38741 sonrası tekrar yapılmadı. Karttaki ekran görüntüleri değişiklikten önce alınmış. |

## Değişen dosyalar
- `docs/agent-results/TASK-MVIAOEGRE2JJT-crw2-fb.md` (bu rapor). Kodda değişiklik yok.

## Riskler
- K1 düzeltilmeden merge edilirse CI'ın Test adımı her koşuda kırmızı olur.

## Açık sorular
- Görev metnindeki KANIT parantezi `/Users/macbook/alan/docs/agent-results/TASK-MVIAOEGRE2JJT-be-fb-2.md` yolunu gösteriyordu. Bu yol hem repo dışında hem de yazarın raporu. O dosyanın üzerine yazmadım; bu rapor kartın belirttiği kendi yolumda duruyor.

## Sonraki adım
be-fb şunları yapmalı: K1 (ci.yml'e tek satır), K2 (i18n anahtarları, ayrık worktree'de), K3 ve K4 (küçük düzeltmeler) ve tarayıcıda yeniden doğrulama. Lider de FO-58/61/33 kartlarına not düşmeli. Bunlardan sonra crw2-fb yeniden inceleyecek.
