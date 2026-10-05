# AKTAR-MURBCJ0A-1 — Yönetici blog yazıları kalıcı (bellekten veritabanına) · de-fb

**Hüküm:** BAŞARILI — blog yazıları `BlogPost` tablosunda; admin'in eklediği yazı sunucu süreci öldürülüp yeniden başlatıldıktan sonra da 200 dönüyor (kanıt §2.6). Kapsam içi tüm kapılar yeşil. Push yapılmadı.
**Tip:** bug (canlıya çıkış denetimi kritik bulgu cae-fb K-3) · **Dal:** `de-fb/blog-persist` (taban dev@542e64d8) · **Ağaç:** `/Users/macbook/alan/FONBRIDGE-wt-defb-blog`
**Platform:** yalnız **macOS** (Darwin 27, Postgres 16 docker `fabrika-postgres`:5433, Chromium/Playwright) üzerinde doğrulandı. Değişen kodda platforma bağlı yol yok (süreç öldürme, dosya yolu, kabuk yok; yalnız Prisma/SQL/React). `scripts/apply-migrations.sh` bash+psql ister, bu değişmedi; CI'da ubuntu-latest'te aynı sırayla koşar. Windows/Linux'ta yerel koşu **yapılmadı** (bu makinede yok); CI Linux koşusu push edilmediği için yok.

**Commit'ler (sırayla):**
| SHA | İçerik |
|---|---|
| `0291c19e` | `BlogPost` modeli + `prisma/migrations/add-blog-post.sql` (+`.down.sql`), `apply-order.txt` sonuna ekleme, `rls-models` SYSTEM_WIDE + `rls-coverage` sınıflandırma testi |
| `c1d98677` | Veri katmanı (async okuma, doğrulamalı yazma + AuditEvent), action'lar `{ok}` sonucu, tüketiciler, seed (`pnpm db:seed-blog`), i18n hata mesajları, testler |
| `8c473423` | Yakalanan hata → yalnız kapalı kod (api-error-body-guard), form etiket-input bağı, E2E kalıcılık spec'i |

`dev@1b43b434`'e (güncel uç) `git merge-tree` ile **temiz** birleşiyor.

---

## 1. Ne yapıldı

1. **Şema** — `prisma/schema.prisma` `model BlogPost`: `slug @unique`, title, excerpt, content, category, readTime, `publishedAt DateTime`, `authorName/authorRole/authorAvatar` **opsiyonel**, image, `featured`, `createdById` (FK yok: kullanıcı silinince yazı engellenmez/silinmez), createdAt/updatedAt, `@@index([publishedAt])`. Kiracısız.
2. **Migration** — `prisma/migrations/add-blog-post.sql`, projenin el-yazımı deseninde (`add-public-lead.sql` şablon): `CREATE TABLE/INDEX IF NOT EXISTS`, index adları Prisma'nın kendi adları (push'lu DB'de çift index olmasın), CHECK yok (push'lu DB'de kaybolur; doğrulama uygulamada), `fabrika_app` GRANT. `.down.sql` guard'lı. `apply-order.txt` **sonuna** eklendi.
3. **RLS** — `scripts/rls-models.ts` SYSTEM_WIDE'a gerekçesiyle eklendi (anonim ziyaretçiye gösterilen platform içeriği, kiracı yok, yazma yalnız `/admin/blog` + `requirePlatformAdmin`). `tests/rls-coverage.test.ts`'e 3 açık sınıflandırma testi: tenantId yok, SYSTEM_WIDE'da / politikada yok, migration "RLS: none, on purpose" gerekçesini taşıyor.
4. **Seed** — 4 açılış yazısı `src/lib/blog-seed.ts`'e taşındı (TASK-MTRNQHC3IV2BE / MTS6MRKDP168Q başlık açıklaması aynen korundu, tarihler `Date` oldu). `seedBlogPosts()` = slug'a göre `upsert`, `update: {}` → **yalnız ekler**, admin düzenlemesini ezmez. `pnpm db:seed-blog` (`scripts/seed-blog-posts.ts`) + `prisma/seed.ts` çağırır. `scripts/README.md`'ye satır.
5. **Veri katmanı** — `src/lib/blog.ts`: modül dizisi **kalktı**. `getBlogPosts/getFeaturedBlogPosts/getBlogPostBySlug` async, DB'den. `create/update/delete/toggleFeatured` → sunucu doğrulaması + yazma + `AuditEvent` (`blog.post.created|updated|deleted|featured`, actorId, tenantId NULL) **tek transaction**, `withSystemScope('platform-admin', …)` içinde (NULL-kiracılı AuditEvent strict politikada system_scope ister). Saf kısım (tipler, `BLOG_WRITE_ERRORS`, `validateBlogInput`, `slugifyTitle`, `formatBlogDate`, `mergeBlogPatch`) `src/lib/blog-shared.ts`'te — client component Prisma'yı paketine çekmesin diye; `blog.ts` `export *` ile yeniden ihraç eder.
   - Doğrulama: başlık 3–200, slug `^[a-z0-9]+(-[a-z0-9]+)*$` 3–120, özet 10–500, içerik 20–50.000, kategori 1–60, okuma süresi 1–30, yazar ≤120 (unvan/portre yalnız adla), görsel/portre yalnız `https` + `next.config.ts` `images.remotePatterns` host'ları (port/kimlik bilgisi yok). Slug tekilliği: unique index → P2002 → `slug_taken`.
   - Türkçe slug: eski `[^a-z0-9]+` "Çağrı Şartları"nı `a-r-artlar`'a çeviriyordu (RED çıktısında görüldü); artık `cagri-sartlari`.
   - Tarih: `publishedAt` DateTime, gösterimde `formatBlogDate(date, locale)` → "28 Ağustos 2026" / "28 August 2026" (UTC).
6. **Action'lar** — `requirePlatformAdmin()` (yetkisiz → mevcut desen gibi `PLATFORM_ADMIN_REQUIRED` throw, `admin-actions-authz` testi değişmeden geçer), sonra `{ ok: true, post } | { ok: false, error: <kod> }`. Yalnız `ok:true`'da `revalidatePath`: `/[locale]/blog`, `/[locale]/blog/[slug]`, `/[locale]` (BlogSection), `/[locale]/admin/blog`.
7. **Admin UI** — başarı bildirimi yalnız `ok:true`'da; hata kodu modalda/üstte `t('errors.<kod>')` ile, modal açık kalır. `adminBlog.errors.*` tr/en'de `BLOG_WRITE_ERRORS` ile **birebir aynı yazım** (test pinliyor). Okuma hatası boş tablo değil uyarı bandı. Form etiketleri `htmlFor/id` ile bağlandı (önceden bağsızdı — erişilebilirlik + `getByLabel`).
8. **Tüketiciler** — blog listesi, yazı sayfası, `BlogSection` (async server component; okuma hatasında bölümü gizler, landing'i düşürmez), admin sayfa/client.
9. **XSS (madde 6)** — kanıtlandı, **sanitizer gerekmedi**: `content` `blog/[slug]/page.tsx` `renderBlogContent`'te satır satır React **metin düğümü** olarak basılıyor, yalnız `<strong>/<h*>/<ul>` elemanları üretiliyor; blog dosyalarında `dangerouslySetInnerHTML`/`innerHTML` yok (grep boş). E2E yapıştırılan `<script>` ve `<img onerror>`'ın HTML'de `&lt;script&gt;` olarak kaçtığını, DOM'da `img[src=x]` olmadığını ve `window.__blogXss`'in tanımsız kaldığını ölçüyor. Asıl risk görsel URL'iydi (yabancı host → `next/image` throw → landing 500); host listesiyle kapatıldı, `javascript:`/`data:`/http/port reddediliyor.

## 2. Kanıt

### 2.1 RED (uygulamadan önce, yeni live test eski koda karşı)
```
     × create stores exactly one row, readable from another connection, and audits it
     × a slug that is already taken is refused with slug_taken and stores nothing new
     × server-side validation refuses a malformed slug, an empty body and a foreign image host
     × anonymous is refused by every action and the table does not change
     × the admin of another tenant is refused by every action and the table does not change
     × update persists, keeps the slug, and handles the byline exactly as given
     × toggle flips featured in the database and the featured read follows it
     × delete removes the row for every reader; a second delete reports not_found
     × a slug derived from a Turkish title is transliterated, not mangled
      Tests  9 failed (9)
```
(eski kod: `"success": true`, `"slug": "a-r-artlar-ve-renciler-i-in-g-ncel-hibe-…"`, `"publishedAt": "2 Ekim 2026"` string döndü, DB'de satır yok)

### 2.2 GREEN — tam vitest süiti (CI komutuyla, throwaway DB `fb_defb_blog`, fabrika_app)
```
vitest exit=0
 Test Files  317 passed | 2 skipped (319)
      Tests  4272 passed | 54 skipped (4326)
live-skip gate: 52 live files, 470 live tests passed, 44 allowed skip(s)
```
Yeni/değişen: `tests/blog-posts.live.test.ts` (9), `tests/blog-validation.test.ts` (~35), `tests/rls-coverage.test.ts` (+3), `marketing-unsourced-figures`, `fabricated-identity-strings` (+1), `admin-actions-authz`, `api-error-body-guard` hepsi yeşil.

### 2.3 Kapılar
```
$ pnpm typecheck        → tsc --noEmit (çıktısız, 0 hata)
$ pnpm lint             → ✖ 9 problems (0 errors, 9 warnings)   # 9 uyarının hiçbiri değişen dosyalarda değil (accept.ts, e2e-profile-save.spec.ts, settings-profile-update.test.ts)
$ pnpm i18n:check       → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
$ pnpm rls:bypass-check → ✅ SUCCESS: no new tenant bypass. 0 call site(s) allowed with a recorded reason, 38 on the sanctioned cross-tenant path, 0 still owed.
$ pnpm rls:verify       → ✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
$ pnpm rls:check        → ✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
```
`rls:bypass-check` yeni `withSystemScope` çağrısı için `scripts/tenant-bypass-baseline.json`'a `kind: system-scope`, gerekçeli **1 kayıt** eklendi (37→38).

### 2.4 Migration'ın CI/E2E zincirinde uygulandığının kanıtı
CI (`.github/workflows/ci.yml` "Prepare database") ve E2E DB'si aynı zinciri kullanır: `prisma db push` → `pnpm db:rls-role` → `scripts/apply-migrations.sh` ×2 → `pnpm db:rls` → `pnpm db:seed`; Playwright web sunucusu ve testler bu `DATABASE_URL`'i kullanır. `apply-migrations.sh` listede olmayan/diskte olmayan dosyada **hiçbir şey uygulamadan düşer** — `add-blog-post.sql` listede, yani CI'da atlanamaz. Throwaway DB'de birebir koşturuldu:
```
🚀  Your database is now in sync with your Prisma schema.
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
psql:prisma/migrations/add-blog-post.sql:48: NOTICE:  relation "BlogPost" already exists, skipping     # push'lu DB: no-op
apply-migrations: 43 files applied as fabrika
apply-migrations: 43 files applied as fabrika      # 2. koşu (idempotentlik)
✅ prisma/rls.sql applied. Policies in public: 28 → 112
```
Push'suz yol (canlı/Supabase gibi tabloyu yalnız migration kurar): tablo DROP → betik:
```
==> [43/43] add-blog-post.sql
apply-migrations: 43 files applied as fabrika
indexes: BlogPost_pkey, BlogPost_slug_key, BlogPost_publishedAt_idx   # çift index yok
grants:  fabrika_app|INSERT,SELECT,UPDATE,DELETE
prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script  → "Blog" geçen satır: 0  (şema ↔ migration kayması yok)
```
`pnpm db:seed` artık `seedBlogPosts` çağırıyor → CI/E2E DB'sinde 4 yazı var (E2E'de "İlginizi Çekebilecek Diğer Yazılar" kartları ekran görüntüsünde).

### 2.5 Seed idempotentliği
```
{"before":0,"inserted":4,"kept":0,"after":4}
{"before":4,"inserted":0,"kept":4,"after":4}          # 2. koşu no-op
UPDATE 1  (admin düzenlemesi taklidi: title='ADMIN EDIT')
{"before":4,"inserted":0,"kept":4,"after":4}          # düzenleme korundu
count | distinct slug | authorName NULL  →  4|4|4      # yinelenen yok, uydurma yazar yok
'${' içeren içerik: 0   (PRODUCT_NAME çözülmüş)
```

### 2.6 E2E (gerçek tıklama) + sunucu yeniden başlatma
`E2E_PORT=3317 pnpm exec playwright test tests/e2e/admin-blog-persistence.spec.ts …`
```
✓ 1 publish → the row is in Postgres → a signed-out request gets 200, markup stays text (3.8s)
✓ 2 the same title again is refused with the slug_taken message, and nothing is added (876ms)
✓ 3 delete → the row is gone from Postgres → the public page is a 404 (608ms)
✓ hydration-clean ×3, st6-marketing-figures, render-purity-refactor …
  1 failed   13 passed (1.9m)
```
Tek kırmızı `identity-strings.spec.ts:80 › the workspace switcher …` — uygulama başlığındaki çalışma alanı menüsü (blog'a dokunmayan yol). **Taban dev@542e64d8'de** ayrı geçici ağaçta aynı DB'ye karşı koşuldu: aynı şekilde `✘ … 1 failed` → önceden var olan, bu işle ilgisiz.

Yeniden başlatma (spec süreç dışından DB okusa da, ayrıca elle ölçüldü; yalnız kendi başlattığım süreçler durduruldu):
```
srv1 pid=77404 up
admin notice: Blog yazısı kaydedildi.                       # admin editöründe gerçek tıklama
srv1 GET /tr/blog/yeniden-baslatma-kaniti-1790970869: 200
port 3318 listener after kill: none
GET while down: 000
srv2 listener=77688 (old was 77422)                         # YENİ süreç
srv2 GET /tr/blog/yeniden-baslatma-kaniti-1790970869: 200   # eski kodda burada 404'tü
srv2 /tr/blog lists it: 1
srv2 /tr landing BlogSection contains it: 1
DB: yeniden-baslatma-kaniti-1790970869|demo-user-admin|t ; AuditEvent: blog.post.created|tenantId NULL|demo-user-admin
```
Ekran görüntüleri (git-dışı): `test-artifacts/AKTAR-MURBCJ0A-1-blog-screenshots/01-admin-saved.png`, `02-public-post.png` (tarih "2 Ekim 2026", `<script>`/`<img onerror>` düz metin), `03-slug-taken.png`.

## 3. Değişen dosyalar
- Şema/migration: `prisma/schema.prisma`, `prisma/migrations/add-blog-post.sql`, `add-blog-post.down.sql`, `apply-order.txt`
- RLS: `scripts/rls-models.ts`, `scripts/tenant-bypass-baseline.json`
- Seed: `src/lib/blog-seed.ts` (yeni), `scripts/seed-blog-posts.ts` (yeni), `prisma/seed.ts`, `package.json` (`db:seed-blog`), `scripts/README.md`
- Veri katmanı: `src/lib/blog.ts`, `src/lib/blog-shared.ts` (yeni)
- UI/tüketici: `src/app/[locale]/admin/blog/{actions.ts,page.tsx,client.tsx}`, `src/app/[locale]/(marketing)/blog/page.tsx`, `…/blog/[slug]/page.tsx`, `src/components/BlogSection.tsx`, `messages/{tr,en}.json` (`adminBlog`)
- Testler: `tests/blog-posts.live.test.ts`, `tests/blog-validation.test.ts`, `tests/e2e/admin-blog-persistence.spec.ts` (yeni); `tests/rls-coverage.test.ts`, `tests/marketing-unsourced-figures.test.ts`, `tests/fabricated-identity-strings.test.ts`, `tests/admin-actions-authz.test.ts`
- Bu rapor.

Test değişiklikleri **gevşetme değil**: `marketing-unsourced-figures` aynı kaldırılmış dizeleri artık DB'ye girecek içerikte (`BLOG_SEED_POSTS`) pinliyor; `fabricated-identity-strings`'in bellek-dizisi `updateBlogPost` testleri saf `mergeBlogPatch` testlerine + live DB testine taşındı ve "isim silinince byline tümden silinir" kontrolü eklendi (eski kodda `author: undefined` eski yazarı **koruyordu** — yorumla çelişen gizli hata); `admin-actions-authz` mock'ları yeni dönüş şekline uyarlandı, yetki iddiaları aynı.

## 4. Riskler
- **Canlı/Supabase'e çıkış sırası:** `scripts/apply-migrations.sh` (add-blog-post.sql) → `pnpm db:seed-blog` (bir kez) → yeni kod. Migration uygulanmadan kod deploy edilirse `/tr/blog` ve yazı sayfası 500; landing `BlogSection` kendini gizler (landing düşmez). Seed koşulmazsa blog boş görünür (veri uydurulmaz).
- **Seed yeniden koşusu:** admin'in **sildiği** bir açılış yazısını geri getirir (insert-only, silme kaydı tutulmuyor). Ortam başına bir kez koşulmalı — README ve betik başlığında yazıyor. `pnpm db:seed` her koşuda çağırır (dev/CI için uygun).
- **Paralel migration (be-fb Onay Merkezi):** benim dosya adım `add-blog-post.sql`, be-fb'nin dalında (`be-fb/approvals-persist`) ölçüm anında yeni migration **yoktu**. İkisi de `apply-order.txt` **sonuna** ekleyeceği için ikinci merge'de bu dosyada metin çakışması çıkar; çözüm iki satırı da tutmak (sıra: önce merge edilen). Tablolar bağımsız, sıra anlamsal olarak önemsiz.
- Görsel host listesi `next.config.ts` ile elle eşleşik; `tests/blog-validation.test.ts` iki listeyi eşit tutuyor (biri değişince kırmızı).
- `createdById` FK'siz: kullanıcı silinirse id asılı kalır (kişisel veri değil, tek başına cuid).

## 5. Açık sorular
- Admin formunun varsayılan okuma süresi `'5 min read'` (TR arayüzde İngilizce, önceden var olan) — E2E görüntüsünde "• 5 min read". Kapsam dışı bıraktım; isteyen olursa i18n'e taşınabilir.
- Admin editörü hâlâ çoğunlukla gömülü Türkçe metin (i18n baseline'da 23 literal, artmadı). Yeni eklenen tüm mesajlar katalogda.

## 6. Sonraki adım
- crw incelemesi → `dev`'e merge (temiz). Merge sonrası CI'ın "Prepare database" adımında `[43/43] add-blog-post.sql` satırı görülmeli.
- Canlıya: §4 sırası (migration → `pnpm db:seed-blog` → deploy).
- `npm run results:index` bu repoda yok — atlandı.
- Throwaway DB `fb_defb_blog` yerel Postgres'te duruyor (paylaşılan `fabrika`'ya dokunulmadı); istenirse `DROP DATABASE fb_defb_blog`.
