# TASK-MTRKV9JGY7OQY — Kiracı sızıntısı: `tenantId` `undefined` iken Prisma `where` koşulunu düşürüyor

**Ajan:** ex-en (Araştırmacı / Explorer) · **Tip:** bug (P0 güvenlik) · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-07
**Commit'ler:** `36ab86c` (düzeltme + testler) · `2e28437` (auth tip borcu) · `2821171` (ekran görüntüleri) — hepsi `dev`

> Kart `blog-yazar`'a atanmıştı; bu oturumda işi ex-en yürüttü. Rapor dosya adı kartta verilen yolu koruyor.

---

## 1. Ne yapıldı

### Kök neden (tek cümle)
`session?.tenantId` `string | null | undefined`; Prisma bir `where` alanı `undefined` ise **o koşulu hiç yazmaz**.
Yani `where: { id, tenantId: undefined }` = `where: { id }` — tahmin edilebilir bir cuid ile kiracı filtresi
olmayan bir okuma. `src/types/prisma-override.d.ts` üretilmiş istemciyi gölgelediği için `tsc` bu uyuşmazlığı
hiç görmedi; kapı bu hatanın üzerinde yeşil kaldı.

### Düzeltilen yüzeyler

| Dosya | Önce | Sonra |
|---|---|---|
| `relationships/[id]/page.tsx` | `const tenantId = session?.tenantId` → `prisma.relationship.findFirst({ where: { id, tenantId } })` ve `prisma.interaction.findMany({ where: { tenantId, relationshipId: id } })` | `requireTenantPage(locale)` + okuma `./data.ts`'e taşındı |
| `relationships/page.tsx` (liste) | `where: tenantId ? { tenantId } : {}` — **boş nesne daha dar sorgu değil, HİÇ filtre değil**: kiracısız oturum veritabanındaki TÜM ilişkileri listeliyordu | `requireTenantPage` + `withTenant` + `where: { tenantId }` |
| `relationships/[id]/data.ts` (**yeni**) | — | `tenantId` zorunlu `string`; Prisma'ya dokunmadan önce runtime'da yeniden doğrulanır (`MissingTenantScopeError`); okuma `withTenantOn` içinde, böylece Postgres RLS de `app.tenant_id` görür (CLAUDE.md §1) |
| `relationships/[id]/detail.tsx` | Elle yazılmış yerel tipler şemada **olmayan** alanlar iddia ediyordu (`Relationship.status`, `.remindAt`, `.createdAt`, `Interaction.createdAt`) ve `Interaction.summary`'yi `String?` iken non-null sayıyordu | `RelationshipRow` / `InteractionRow` (`@/types/db-rows`) |
| `src/lib/auth.ts` | `user` `User \| null` iken `user.id/.email/.name/.image` okunuyordu (4× TS18047, override gizliyordu) | Kullanıcı satırı yoksa oturum açma **reddediliyor** (`return null`), deref edilmiyor |
| `scripts/create-superadmin.ts` | `user.id` `possibly null` | Açık `throw` — seed TypeError yerine sebebi söyleyen bir mesajla düşer |

### Ek olarak temizlenen tip borcu (`2e28437`)
`include: { memberships: true }` — `authorize`'daki arama ve süperadmin seed'i bunları **hiç okumuyor**
(jwt callback kendi aramasını yapıyor, `auth.ts:295`). Bu include `user`'ı `User & { memberships }` yapıyor,
oluşturma yolu ise `$transaction`'dan düz `User` atıyordu: **possibly-null uyarısının asıl sebebi bu TS2322'ydi.**
Kaldırıldı — her oturum açışta boşuna ödenen bir join de gitti.

### Kapsam notu
Kart yalnız `[id]/page.tsx`'i sayıyordu. Liste sayfasını da düzelttim: aynı dizin, aynı hata sınıfı ve
**daha ağırı** (tek kayıt değil, tüm kiracıların tüm kayıtları). Türkçe takma rota
`iliskiler/page.tsx` sadece re-export ediyor, kopya kod yok — kontrol edildi.

---

## 2. Kanıt

### (a) Sızıntı GERÇEK — Postgres'e karşı ölçüldü, iddia değil
Regresyon testinin ilk vakası, düzeltmenin karşı durduğu davranışı **kaydediyor**: aynı sorgu
`tenantId: undefined` ile kiracı B'nin satırını döndürüyor, gerçek bir `tenantId` ile boş dönüyor.

### (b) `pnpm vitest run tests/relationship-tenant-scope.test.ts --reporter=verbose`
```
 ✓ M4 relationship detail — tenant scope > the leak is real: Prisma drops an undefined tenantId from the where clause 6ms
 ✓ M4 relationship detail — tenant scope > tenant A cannot load tenant B’s relationship 6ms
 ✓ M4 relationship detail — tenant scope > tenant A still loads its own relationship and interactions 5ms
 ✓ M4 relationship detail — tenant scope > interactions never cross tenants even when the relationship id is known 3ms
 ✓ M4 relationship detail — tenant scope > a undefined tenant never reaches the database 0ms
 ✓ M4 relationship detail — tenant scope > a null tenant never reaches the database 0ms
 ✓ M4 relationship detail — tenant scope > a empty string tenant never reaches the database 0ms
 ✓ M4 relationship detail — tenant scope > a whitespace tenant never reaches the database 0ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```
"Sorgu hiç çalışmıyor" iddiası sözle değil ölçümle: dokunulduğunda fırlatan bir sahte istemci geçiliyor ve
`client.touched` **0** olarak doğrulanıyor.

### (c) GERÇEK TARAYICI — `pnpm exec playwright test relationship-tenant-isolation`
```
Running 3 tests using 1 worker
[seed-relationship-e2e] ready — A=rel-e2e-tenant-a/rel-e2e-relationship-a B=rel-e2e-tenant-b/rel-e2e-relationship-b
  ✓  1 › M4 relationships — tenant isolation › tenant A signs in and reads its own relationship (1.1s)
  ✓  2 › M4 relationships — tenant isolation › tenant B’s relationship id shows 404 for tenant A, and leaks no field (1.7s)
[seed-relationship-e2e] rolled back
  ✓  3 › M4 relationships — tenant isolation › the list shows tenant A’s rows only (1.1s)

  3 passed (4.4s)
```
Ekran görüntüleri (`docs/agent-results/TASK-MTRKV9JGY7OQY-screenshots/`):
- `01-tenant-a-own-relationship.png` — A kendi kaydını ve etkileşimini görüyor (regresyon yok)
- `02-tenant-b-id-404.png` — A oturumuyla B'nin id'si: **404 ekranı**, B'nin hiçbir alanı yok
- `03-list-tenant-a-only.png` — listede yalnız A'nın satırı

Her iki testin de **boş yere geçmediği** ayrıca doğrulanıyor: 2. test B'nin satırının veritabanında
gerçekten durduğunu, 3. test iki fixture satırının da orada olduğunu önce assert ediyor.

### (d) Statü 200 mü 404 mü — ölçüldü, varsayılmadı
Tarayıcı 404 ekranını gösteriyor ama HTTP statüsü 200. Sebep aynı dev sunucuda **iki yönlü ölçüldü**:
`src/app/[locale]/(app)/[workspace]/loading.tsx` yerindeyken aynı istek `PROBE_STATUS=200`, dosya
geçici olarak kenara alındığında `PROBE_STATUS=404`. Yani Next kabuğu akıtıyor (streaming), 200 başlığı
`notFound()` çalışmadan önce tele çıkıyor. Test bu yüzden statüye değil **ekrana** bakıyor. (Dosya
ölçümden hemen sonra geri kondu.) → Ayrı bir bulgu olarak §5'te.

### (e) Kapı (bu düzeltmeden sonra, ana ağaçta)
```
pnpm typecheck   → tsc --noEmit, çıktı yok (temiz)
pnpm test        → Test Files 82 passed | 2 skipped (84) · Tests 904 passed | 8 skipped (912)
pnpm lint        → 84 problems (0 errors, 84 warnings)   ← uyarılar önceden var (TASK-MTREJ27YUPSY7)
pnpm rls:check   → ✅ 41/41 kiracıya özel model RLS politikasına sahip
pnpm rls:verify  → ✅ Veritabanı 41 tablonun tamamında izolasyonu uyguluyor
```

### (f) Asıl kanıt: override kapalıyken hatalar gitti mi?
`typecheck` bu hata sınıfına kör olduğu için ölçüm, **HEAD'den açılan izole bir git worktree'de**
`src/types/prisma-override.d.ts` devre dışı bırakılarak tekrarlandı (ana ağaca ve paralel kartlara
dokunulmadı; worktree ölçüm sonunda silindi):

| Dosya | TASK-MTRKA25R5M3SY ölçümü (önce) | Şimdi |
|---|---|---|
| `relationships/[id]/page.tsx` | 2 × TS2322 (`string \| null \| undefined` → `string`) | **0** |
| `src/lib/auth.ts` | 4 × TS18047 + 1 × TS2322 (`memberships`) | **0** (aşağıdaki enum hariç) |
| `scripts/create-superadmin.ts` | 1 × TS18047 + 1 × TS2322 | **0** |

`auth.ts`'te kalan tek hata bilerek bırakıldı — başka bir gruba ait:
```
src/lib/auth.ts(218,19): error TS2322: Type 'string' is not assignable to type 'Role | undefined'.
```
Bu, ölçüm raporunun **Grup 3 (enum uyuşmazlığı)** kalemidir; çalışma zamanında geçerli bir literal
yazıldığı sürece çalışır ve bu kartın tanımladığı kusur değildir.

---

## 3. Değişen dosyalar

**Yeni**
- `src/app/[locale]/(app)/[workspace]/relationships/[id]/data.ts` — kiracı kapsamlı yükleyici + `MissingTenantScopeError`
- `scripts/seed-relationship-e2e.ts` — iki kiracılı fixture (idempotent, `--rollback`)
- `tests/relationship-tenant-scope.test.ts` — 8 vakalık regresyon (Postgres'e karşı)
- `tests/e2e/relationship-tenant-isolation.spec.ts` — 3 vakalık gerçek tarayıcı testi
- `docs/agent-results/TASK-MTRKV9JGY7OQY-screenshots/{01,02,03}*.png`

**Değişen**
- `src/app/[locale]/(app)/[workspace]/relationships/[id]/page.tsx`
- `src/app/[locale]/(app)/[workspace]/relationships/page.tsx`
- `src/app/[locale]/(app)/[workspace]/relationships/[id]/detail.tsx`
- `src/lib/auth.ts`
- `scripts/create-superadmin.ts`

---

## 4. Riskler

1. **`authorize` artık kullanıcı satırı yoksa `null` dönüyor.** Doğru davranış (geçersiz kimlik bilgisi),
   ama daha önce bu yol `TypeError` ile 500 veriyordu; log'da artık `[Auth.authorize] sign-in refused: no user row`
   satırı aranmalı. Oturum açma akışının bozulmadığı gerçek tarayıcıda doğrulandı (§2c, test 1).
2. **`include: { memberships: true }` kaldırıldı.** `authorize` ve seed bunları okumuyordu (grep ile doğrulandı,
   okuyan tek yer `auth.ts:295`, o dokunulmadı). Gelecekte biri `user.memberships`'i `authorize` içinde okumaya
   kalkarsa include'u geri koymalı.
3. **Liste sayfası artık kiracısız oturumda boş liste değil, yönlendirme yapıyor.** Kasıtlı: `requireTenantPage`
   anonim ziyaretçiyi girişe, üyeliksiz kullanıcıyı `/no-workspace`'e gönderir.
4. Fixture ile üretim verisi karışmaz: tüm id'ler `rel-e2e-*` önekli, `afterAll` geri alıyor; koşu sonrası
   veritabanında **0** artık satır kaldığı doğrulandı.

---

## 5. Açık sorular / başka kartlara devredilenler

1. **(app) segmentinde `notFound()` HTTP 200 dönüyor.** `[workspace]/loading.tsx` yüzünden yanıt akıtılıyor;
   §2d'de iki yönlü ölçüldü. Bu, M4'e özel değil — **`(app)` altındaki her 404 için geçerli** ve arama
   motorları/API istemcileri açısından yanlış sinyal. Ayrı bir kart hak ediyor.
2. **`/tr` ve `/en` ana sayfaları şu an 500 veriyor.** Bu, `playwright.config.ts`'in hazırlık probu'nu
   düşürüyor: Playwright sunucuyu "kapalı" sanıp ikinci bir dev sunucu başlatmaya çalışıyor ve
   `EADDRINUSE` ile ölüyor — yani **repo config'iyle e2e şu an hiç kimse için koşmuyor**. Bu koşuda
   dev sunucusuna doğrudan bakan scratch bir config kullanıldı (repo dışında, commit edilmedi).
   Ana sayfa 500'ü M4 ile ilgisiz; `messages/*.json` geçerli JSON ve `landing` namespace'i yerinde —
   sebep başka. **Bloklayıcı, ayrı kart gerekiyor.**
3. `src/lib/auth.ts(218)` `string → Role` enum uyuşmazlığı — Grup 3, bu kartın kapsamı dışında.
4. `detail.tsx`'te `setInteractions` kullanılmıyor (lint uyarısı, önceden var): etkileşim eklendikten sonra
   zaman çizelgesi ancak sayfa yenilenince güncelleniyor. Ürün kusuru, güvenlik değil.

### 5.5 AYNI HATA BAŞKA YÜZEYLERDE DE VAR — repo geneli tarama (P0, kapsam dışı)

Kartı kapatmadan önce aynı kalıbı repo genelinde taradım. `relationships/` tek örnek değil.
**Aşağıdakiler DÜZELTİLMEDİ** (başka kartların dosyaları); kanıtla birlikte devrediyorum:

| Dosya:satır | Kalıp | Kiracısız oturumda ne oluyor | Ağırlık |
|---|---|---|---|
| `(app)/[workspace]/concept-notes/[id]/page.tsx:26` | `where: tenantId ? { id, tenantId } : { id }` | Kiracı filtresi **açıkça** düşürülüyor — tahmin edilebilir bir cuid ile başka kiracının konsept notu okunur | 🔴 en ağırı |
| `(app)/[workspace]/evidence/page.tsx:22` | `where: tenantId ? { tenantId } : {}` | Veritabanındaki **tüm** kanıt kayıtları listelenir (üstelik `claimLinks` + `claim` include'uyla) | 🔴 |
| `(app)/[workspace]/concept-notes/page.tsx:25` | `where: tenantId ? { tenantId } : {}` | Tüm kiracıların konsept notları listelenir | 🔴 |
| `(app)/[workspace]/concept-notes/page.tsx:30` | `where: tenantId ? { OR: [{ tenantId: null }, { tenantId }] } : { tenantId: null }` | Şablonlar; `null` dalı kasıtlı görünüyor (global şablon) — **doğrulanmadı, varsayım** | 🟠 |
| `api/billing/checkout/route.ts:124` | `session?.tenantId \|\| 'default-tenant'` | Uydurma bir kiracı id'si; `withTenant('default-tenant', …)` ile fiyat kilidi okunuyor ve Stripe'a `client_reference_id` olarak gidiyor. **Bu veritabanında `Tenant.id = 'default-tenant'` satırı YOK** (ölçüldü: 0 satır), yani bugün sömürülebilir değil — ama o id'li bir kiracı yaratıldığı an yabancı bir checkout onun fiyat kilidini alır. `src/lib/tenant.ts`'in yasakladığı "fallback tenant" kalıbı. | 🟠 mayın |

**Temiz çıkanlar** (aynı `session?.tenantId` okumasını yapıyor ama sorgudan ÖNCE kapatıyor — yanlış alarm değil,
doğru kalıbın satır içi hâli): `(app)/[workspace]/approvals/page.tsx` (`if (tenantId)` sarmalayıcı),
`api/dashboard/export-csv/route.ts` (401), `api/concept-notes/[id]/export/route.ts` (401).
Türkçe takma rota `iliskiler/page.tsx` sadece re-export.

Tarama komutları (tekrarlanabilir):
```
grep -rn "tenantId ?" src --include="*.ts" --include="*.tsx"
grep -rn "session?.tenantId\|session\.tenantId" src --include="*.ts" --include="*.tsx"
```

---

## 6. Sonraki adım

- Kartı **review**'a al.
- §5.2 (ana sayfa 500 → e2e kapısı kapalı) için P0 bir kart açılmalı: kapı gerçekten koşmadan hiçbir
  e2e kanıtı repo config'iyle tekrarlanamaz.
- **§5.5 için yeni bir P0 kart açılmalı** — `concept-notes/[id]/page.tsx`, `concept-notes/page.tsx`,
  `evidence/page.tsx`. Bu üçü bu kartla aynı kusurun aynı sınıfı; düzeltme reçetesi hazır:
  `requireTenantPage` + `withTenant`, koşullu `where` tamamen kaldırılır. Regresyon testi olarak
  `tests/relationship-tenant-scope.test.ts` + `scripts/seed-relationship-e2e.ts` şablon alınabilir.
  (Görev panosu MCP sunucusu bu oturumda bağlantısını kaybettiği için kartı ben açamadım.)
- `api/billing/checkout/route.ts:124`'teki `'default-tenant'` fallback'i faturalandırma kartına eklenmeli.
- Kalıcı çözüm: `session?.tenantId`'yi doğrudan bir `where` içine sokmayı yasaklayan bir lint/sözleşme
  kuralı — TASK-MTRKVWOGQFSO3'ün (şema sözleşmesi kapısı) doğal devamı.
