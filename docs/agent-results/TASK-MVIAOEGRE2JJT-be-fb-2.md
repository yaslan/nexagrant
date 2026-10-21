# TASK-MVIAOEGRE2JJT (FO-113) — 2. geçiş (be-fb)

Bu dosya ilk kanıt dosyasını (`TASK-MVIAOEGRE2JJT-be-fb.md`) ezmez; ilk geçişin raporu olduğu gibi kalır.

## Bu geçiş

Commit'ler: `da9368da` (önceki oturumun düzeltmeleri, değişmedi) · `c5e38741` (bu geçiş). Geçmiş yeniden yazılmadı; B1 kararı: düzeltmeler yeni commit olarak eklendi.

- **Y7 (tamam):** `src/app/api/v1/partners/route.ts` — `participations` include'u kaldırıldı. Interreg bayrağı `findMany({ distinct: ['organisationId'] })` ile, toplamlar `groupBy(organisationId, role)` ile alınıyor; `coordCount` artık `'coordinator'` rolüne bakıyor. Sayfanın DB fallback dalı (non-Interreg) da aynı şekilde `groupBy`/`distinct` kullanıyor; sınırsız `participations` include'u yok.
- **Ö-i18n (kısmi):** `admin/interreg/client.tsx` sayı biçimlemesi artık `useLocale()` ile (`tr-TR` sabiti yok).
- **Testler:** `tests/partner-interreg-filter.test.ts` sahte Prisma istemcisine `cordisParticipation.findMany/groupBy` eklendi (route artık bu sorguları kullanıyor).

Kanıt (bu geçiş, mac/darwin):
- `pnpm lint` → exit 0.
- `pnpm typecheck` → `$ tsc --noEmit`, exit 0, 0 hata.
- `perl -e 'alarm 900; exec @ARGV' pnpm vitest run tests/keep-eu-sync.test.ts tests/partner-interreg-filter.test.ts tests/api/v1-partners.test.ts tests/blog-content.test.tsx tests/blog-markdown-edit.test.ts` → `Test Files 5 passed (5)`, `Tests 59 passed (59)`, skipped 0.
- `git diff 8b34f7a5^..HEAD -U0 | grep '^+' | grep 'yasinaslan\|assign-ultra-lifetime'` → yalnızca bu raporun kendi metnindeki satırlar; kod ve betik satırı yok. `git grep` ile `src`, `scripts`, `prisma`, `package.json` içinde eşleşme yok.

**Ertelenenler (gerekçeli):**
- **Ö-i18n kalanı:** `partners/page.tsx` (~40 `isTr ?` metni), `PartnerFilters.tsx`, `AdminSidebarNav.tsx`, `admin/interreg/client.tsx` varsayılan sorgu (satır 48) ve `blog-markdown-edit` `fallbackText` çağıranları yeni `t()` anahtarları gerektiriyor. `messages/en.json` ve `messages/tr.json` ortak çalışma ağacında başka ajanların commit'siz değişikliklerini taşıyor; bu geçişte onlara dokunulmadı. Anahtarlar, o dosyalar temizlendikten sonra ayrı bir commit'te eklenmeli.
- **`routes.ts` kullanılmayan anahtarlar:** aynı nedenle (ortak alan) ertelendi; silme diff'i başkasının commit'iyle çakışabilir.
- **Kart notları (B1):** FO-58 / FO-61 / FO-33 kartlarına "8b34f7a5 bu kartı done saymaz; keep.eu Interreg işi FO-113'te" notu bu geçişte düşülmedi (kart düzenleme aracı yalnız durum/atama ile sınırlı). Lider tarafından yapılmalı.

**Açık kalanlar:**
- **(a) gerçek-DB Y1 testi — koşulamadı.** Bu geçişte `tests/keep-eu-sync.live.test.ts` yazılmadı. Neden: yerel şema kurulumu için `prisma db push` gerekiyor ve Prisma koruması bunu durdurdu; `scripts/apply-migrations.sh` da boş DB'de önce base tablolar için `db push` ister. `fabrika` (5433) ve `fo48-pg` (5548) başka ajanların test/dev DB'leri; bunlara yazılmadı. Onay gelirse yol: izole bir konteyner + `db push` onayı + `scripts/apply-migrations.sh`, sonra Y1 testi.
- **Tarayıcı doğrulaması (bu geçişte yeniden yapılmadı):** Y7 ve `groupBy` değişikliği sonrası partners sayfası gerçek tarayıcıda tekrar kontrol edilmedi; önceki doğrulama (43 kayıt) değişiklik öncesine ait.

Hüküm: Kısmen bitti — Y1–Y8 (Y7 dahil) ve B2/B3 kod olarak tamam, lint/typecheck/vitest yeşil; açık kalanlar: (a) gerçek-DB testi, Faz 3 i18n kalanı ve kart notları, sonrası tarayıcı yeniden doğrulaması.
