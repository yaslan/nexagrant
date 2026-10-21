# TASK-MVIAOEGRE2JJT (FO-113) — FO-110 inceleme bulgularının düzeltilmesi

Dal: `feat/partner-search-interreg` · Ajan: be-fb · Platform: macOS (darwin), Postgres :5433 (`fabrika`), dev sunucu :3000

## Ne yapıldı

- **B2 (keep.eu erişimi):** Tarayıcı User-Agent taklidi kaldırıldı; dürüst UA `FonBridge/1.0 (+https://fonbridge.com/contact)`. 403 artık tekrar denenmez, `keep_eu_forbidden` SystemAlert'i üretilir ve `success:false` döner. `/contact` yolunun var olduğu doğrulanmadı.
- **B3 (lisanssız betik):** `scripts/assign-ultra-lifetime.ts` silindi, `package.json`'daki `db:assign-ultra-lifetime` satırı kaldırıldı, `prisma/seed-tenant-workspace.ts` üst commit sürümüne döndürüldü (lifetime/ultra/OMURBOYU20 dalı yok).
- **B1:** Commit ayrımı YAPILMADI (bkz. Açık sorular).
- **Y1:** CORDIS organizasyonu yalnızca yoksa oluşturulur; varsa yalnızca boş `nameNormalized/country/city` doldurulur. `name`/`isTurkish` üzerine yazılmaz (FO-58).
- **Y2:** RawFetch payload'ı tam gövdeyi saklar; hash yalnızca gövde üzerinden (`fetchedAt` hash'e girmez).
- **Y3:** 30 sn `AbortSignal.timeout`; zaman aşımı `keep-eu-sync:timeout` alarmı üretir.
- **Y4:** Partner sayısı `COUNT(DISTINCT organisationId)` ile hesaplanır (en çok 10 ülkenin toplamı değil).
- **Y5:** `upstreamOk` eklendi. Upstream hatasında DB'den yeniden indeksleme yalnızca `allowDatabaseFallback` ile açılır; `success = upstreamOk && skippedCount === 0`.
- **Y6:** Partners sayfasında `min_projects` artık SQL'de (`GROUP BY … HAVING COUNT(*) >= n`) uygulanır; sayfalamadan sonra filtrelenmez.
- **Y7 (kısmi):** Interreg dalında sınırsız `participations` taraması, nested `take: 200` + `groupBy` ile sayım/EC toplamı/koordinatör sayısı hesaplanır. `route.ts` içindeki `participations` include'u hâlâ sınırsız (bkz. Açık sorular).
- **Y8:** Sayfaya CORDIS (CC BY 4.0, Avrupa Komisyonu) ve keep.eu/Interact atfı eklendi.
- **Ö1 (kısmi):** Aktif filtre çipleri ("Interreg Partners", "Min. 3 Projects") ve atıf metni TR/EN; "Trakya Üni." etiketi kaldırıldı.
- **Ö2/Ö3/Ö4/Ö6:** Boş beneficiary guard, `KEU:` önekiyle proje id, `typeof deleteMany` kontrolü kaldırıldı, reload'da `splitKeepEuKey`.
- **Ö5:** `src/app/[locale]/admin/interreg/actions.ts` içinde Zod: programmeIds (regex, ≤500), query (1–500), topK (int 1–20).
- **Ö7:** Kullanılmayan `CordisOrganizationRow` silindi.
- **Ö8/Ö9:** `isSafeUrl` artık `//` ve `/\` reddeder, `http:` reddeder; `https:`, `mailto:`, yerel yol ve `#` kabul eder. Blok ve satır içi kullanımı aynı fonksiyonu kullanır.
- **Alarm modülü:** Partners sayfasındaki `M8` → `M1` (sayfa M1 kapısıyla korunuyor).
- **Koordinatör rolü:** `'lead'` kaldırıldı; sync yalnızca `'coordinator'` yazdığı için sayım tutarlı.
- **CLI (`scripts/run-keep-eu-sync.ts`):** `--limit` için `parseLimit` (geçersiz değer → çıkış 2, NaN yok); `--help` ve dry-run `return` ile çıkıyor; dry-run `persist:false` (RawFetch/alarm yazmaz); canlı çalıştırmada `Upstream OK` satırı; `process.exit` yerine `process.exitCode` (finally'deki `prisma.$disconnect()` çalışsın).
- **Lint:** `eslint.config.mjs` içine `.claude-fo49/**` ignore eklendi (scratch kopyalar lint'i kırıyordu).
- **blog-markdown-edit:** `insertLink` için opsiyonel `fallbackText` parametresi (varsayılan `'Bağlantı'`, çağıranlar henüz yerelleştirmiyor).

## Kanıt (ham çıktı)

- `pnpm typecheck` → `$ tsc --noEmit`, exit 0.
- `pnpm lint` → `✖ 4 problems (0 errors, 4 warnings)`, exit 0 (kalan uyarılar bu kartın dosyalarında değil: `src/lib/invitations/accept.ts`, `tests/e2e/fixtures/concept-template-tenant.ts`, `tests/settings-profile-update.test.ts`).
- `perl -e 'alarm 900; exec @ARGV' pnpm vitest run tests/keep-eu-sync.test.ts tests/partner-interreg-filter.test.ts tests/admin-interreg-actions.test.ts tests/blog-content.test.tsx tests/blog-markdown-edit.test.ts` →
  ```
  Test Files  5 passed (5)
       Tests  60 passed (60)
  ```
- Yeni testler (`tests/keep-eu-sync.test.ts`, `tests/blog-content.test.tsx`):
  - (b) Y4: 12 ülke, 12 kurum → `totalPartnersCount === 12`.
  - (d) B2: 403 → `fetch` tek çağrı, `refused access` alarmı, mesajda "Interact".
  - (e) Y3: `TimeoutError` → "did not answer within 30s" alarmı.
  - dry-run (`persist:false`) 403'te alarm yazmıyor.
  - (f) `isSafeUrl`: `//host`, `/\host` reddi; `https`, `mailto`, `/tr/...`, `#...` kabulü; `http:` reddi.
- Tarayıcı doğrulaması (gerçek sayfa, dev sunucu, `fabrika` DB, yalnızca okuma):
  - `http://localhost:3000/tr/default/partners?is_interreg=true&min_projects=3` → "Toplam 43 Interreg Ortak Profili Bulundu", kaynak `cordis_organization_interreg`, tüm satırlar TOPLAM PROJE ≥ 3. Ekran görüntüsü: `docs/agent-results/TASK-MVIAOEGRE2JJT-evidence/partners-tr-is_interreg-min3.png`
  - `http://localhost:3000/en/default/partners?is_interreg=true&min_projects=3` → "Found 43 Interreg Partner Profiles", çipler "Interreg Partners" / "Min. 3 Projects". Ekran görüntüsü: `docs/agent-results/TASK-MVIAOEGRE2JJT-evidence/partners-en-is_interreg-min3.png`
  - Kart metnindeki `isInterreg=true` parametresi sayfada okunmuyor (sayfa `is_interreg` okur; API `isInterreg` okur). Kartın verdiği URL ile sayfa filtre uygulamıyor; sayfa `cordis_partner_profile` kaynağına düşüyor (ekran görüntüsü için bkz. yukarıdaki çalışma dosyası, aynı komutla doğrulandı).

## Değişen dosyalar

- `src/lib/keep-eu-sync.ts`, `scripts/run-keep-eu-sync.ts`, `scripts/assign-ultra-lifetime.ts` (silindi), `package.json`, `prisma/seed-tenant-workspace.ts`
- `src/app/[locale]/(app)/[workspace]/partners/page.tsx`, `PartnerFilters.tsx`, `src/app/api/v1/partners/route.ts`
- `src/app/[locale]/admin/interreg/actions.ts`
- `src/components/blog/blog-content.tsx`, `src/lib/blog-markdown-edit.ts`
- `eslint.config.mjs`
- `tests/keep-eu-sync.test.ts`, `tests/blog-content.test.tsx`
- `docs/agent-results/TASK-MVIAOEGRE2JJT-be-fb.md`, `docs/agent-results/TASK-MVIAOEGRE2JJT-evidence/*.png`

## Riskler

- **(a) gerçek-DB Y1 testi yazılmadı/koşulmadı.** Throwaway DB (`fabrika_fo113`) oluşturuldu; `prisma migrate deploy` eski bir migration'da (`FollowupDoc` yok) kırıldı; `prisma db push` Prisma'nın "Claude Code tarafından çağrıldı" koruması ile durduruldu (`--accept-data-loss` gerektiriyor). Koruma aşılmadı. Oluşturulan DB düşürüldü. Paylaşımlı `fabrika` DB'sine yazılmadı.
- **Y6 ve sayfanın SQL yolu otomatik testle değil**, yalnızca tarayıcı doğrulamasıyla kanıtlandı.
- **CLI canlı koşulmadı** (`KEEP_EU_API_KEY` ve keep.eu erişimi yok); yalnızca typecheck/lint ile doğrulandı.
- **`git grep yasinaslan` kabul kriteri** repo genelinde karşılanamaz: demo e-postası `admin@yasinaslan.com.tr` mevcut testler, dokümanlar ve kodda çok yerde geçiyor. Kapsam kontrolü yalnızca bu dalda eklenen satırlara uygulanmalı (kontrol yapılmadı).
- `messages/*.json` ve `pipeline/board.tsx` ortak çalışma ağacında başka ajanlara ait değişiklikler içeriyor; bu kart onlara dokunmadı ve commit'e almadı.
- FO-112 yama dosyası (`FO-112-evidence/orphan-*.patch`) okunmadı, uygulanmadı.

## Açık sorular

1. **B1 commit ayrımı:** `feat/partner-search-interreg` hiç push edilmemiş; tüm kart işleri tek dal geçmişinde (`8b34f7a5`…`2e903bda`). Geçmişi yeniden yazmak (soft reset + bölme) üst commit'lerdeki diğer ajanların işini riske atar. Karar: geçmişi yeniden yazmadan, bu düzeltmeleri ayrı bir FO-113 commit'i olarak eklemek mi, yoksa ayrımı lider mi yapsın?
2. **(a) gerçek-DB testi için** bir throwaway DB'ye şema kurulumu gerekiyor. `prisma db push` için kullanıcı onayı (Prisma'nın `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` mekanizması) veya başka bir yol (ör. mevcut bir `fabrika_*` test DB'si) onaylanmalı.
3. **Kart URL'si:** `isInterreg=true` mi yoksa `is_interreg=true` mi kullanılacak? Sayfa `is_interreg` okuyor; kart metni yanlış olabilir.

## Sonraki adım

- (a) testi için onay alındığında `tests/keep-eu-sync.live.test.ts` (Y1: mevcut CORDIS adının korunması, KEU: prefix'li proje).
- `route.ts` `participations` include'unun aggregate'e çevrilmesi (Y7'nin kalanı).
- Kalan i18n: `admin/interreg/client.tsx` varsayılan sorgu ve `tr-TR` biçimleme; `blog-markdown-edit` çağıranlarının `fallbackText` ile yerelleştirilmesi; `routes.ts` kullanılmayan anahtarlar.

Hüküm: Kısmen bitti — B2/B3/Y1–Y6/Y8, Ö2–Ö9 ve tarayıcı doğrulaması tamam; (a) gerçek-DB testi ve B1 commit ayrımı açık.
