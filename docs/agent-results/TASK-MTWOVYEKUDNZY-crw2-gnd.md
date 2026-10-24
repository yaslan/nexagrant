---
sözleşme: 3
görev: TASK-MTWOVYEKUDNZY
kod: FA-47
ajan: crw2-gnd
motor: claude
tip: ölçüm
okur: ekip
hüküm: Kısmen bitti: 12 çağrı yerinin 7'si (plan-repository 6 + auth jwt okuması) kapanmış, 2'si bind-tabanlı (karar), 3'ü açık; CHECK E (E1/E2) hiç yazılmamış — DÜZELTME GEREKLİ, kart kapatılamaz.
platform: mac (Darwin 27.0.0). Ölçüm ayrık worktree /Users/macbook/alan/FONBRIDGE-crw2-fa47 (detached, origin/dev 80271979) üzerinde; canlı sonda docker fabrika-postgres (localhost:5433) rolü fabrika_app (rolbypassrls=false). Saf TS + SQL; OS'a bağlı kod yolu yok, Windows/Linux koşulmadı (gerek yok).
sürüm: 1
tarih: 2026-10-19T19:03:19.208Z
---

# FA-47 Tenant-bypass CHECK E — DoD'nin origin/dev (80271979) üzerinde ölçümü

## Kararlar

```karar
kimlik: karar-1
soru: auth.ts:459 ve :836 kayit transaction'lari ciplak prisma.$transaction + bindTransactionToTenant ile calisiyor (canli: RLS altinda satir goruyor) ama withTenant/withSystemScope degil. CHECK E1 yazilinca bu iki blok ne olsun? Baglam: raporun 'Karar baglami' bolumu.
seçenek: A | E1 bind cagrisini tanisin, muaf
seçenek: B | Baseline'a gerekceyle gir
seçenek: C | Kayit akisini iki tx'e bol
öneri: A
karar_kimligi: K-570148
```

## Ne yapıldı
Kart `get_task` ile tam okundu. `origin/dev` (80271979, PR #117 merge) ayrık detached worktree'ye alındı (`/Users/macbook/alan/FONBRIDGE-crw2-fa47`), paylaşılan ağaçta checkout yapılmadı, kod değiştirilmedi. `pnpm install --offline` + `pnpm db:generate`; `pnpm rls:bypass-check`, `pnpm rls:check` koşuldu; salt-okunur bir TS sondası (`probe-fa47.ts`, worktree'de, commit edilmedi) `DATABASE_URL` (fabrika) ve `DATABASE_URL_RLS_TEST` (fabrika_app) ile aynı sorguları yan yana ölçtü. Kartın eski satır numaraları `git show 029d9c5d:<dosya>` ile fonksiyon adına çevrildi.

**Satır numarası uyarısı:** karttaki 12 satır Dilim 6 raporu §5'in (2026-09-11) ölçümü; kart 2026-10-07'de açılmış ama o tarihte plan-repository tarafı zaten 29 Eyl'de kapanmıştı. Bu yüzden "12 çağrı yerinin hiçbiri yapılmadı" da, "hepsi yapıldı" da yanlış.

## Kanıt (ham çıktı)

### Kapı, origin/dev'de
```
$ pnpm rls:bypass-check
Sanctioned cross-tenant escapes: 44 call site(s) via withSystemScope, measured.
✅ SUCCESS: no new tenant bypass. 0 call site(s) allowed with a recorded reason, 44 on the sanctioned cross-tenant path, 0 still owed.
$ pnpm rls:check
✅ SUCCESS: All 47 tenant-scoped models have RLS policies registered.
```
```
$ grep -n "CheckId" scripts/tenant-bypass-scan.ts
90:export type CheckId = 'A' | 'B1' | 'B2' | 'C' | 'D';
$ grep -n "'E'" scripts/check-tenant-bypass.ts        → (boş)
$ grep -c '"check": "E' scripts/tenant-bypass-baseline.json → 0
```
Tüm uzak dallar tarandı (`git show <dal>:scripts/tenant-bypass-scan.ts | grep E1/E2`): hiçbir dalda CHECK E yok. `git log --all --grep 'FA-47|MTWOVYEKUDNZY|CHECK E'`: bu karta ait commit yok. Açık PR'lar (#119, #94, #92, #28) taramaya dokunmuyor.

### Canlı sonda — fabrika_app (rolbypassrls=false) vs fabrika
```
RLS role: [{"rolname":"fabrika_app","rolbypassrls":false}]
#9  tenants page: tenants admin=40 rls=40; sum(users+workspaces) admin=48 rls=0
#12 plan assignments: plans admin=7 rls=7; assignments admin=1 rls=0
#11 tenant.subscription: admin=ACTIVE rls=null (rls tenant row found=true)
S1  membership.count(tenant): admin=1 bare-$transaction=0 set_config-bound(auth.ts style)=1 withTenantOn=1
```
Okuma: Şekil 2'nin üç açık okuması fabrika_app'te "ikna edici boş" döner (kiracı satırı var, ilişkisi yok). Şekil 1 sınıfı doğrulandı: çıplak `$transaction` 0, `set_config` ile bağlanmış tx 1, `withTenantOn` 1.

### 12 çağrı yeri — madde madde

| # | Kart (eski satır) | Güncel origin/dev | Durum | Kanıt |
|---|---|---|---|---|
| 1 | auth.ts:246 (credentials kayıt) | auth.ts:459 `prisma.$transaction` + :503 `bindTransactionToTenant(tx, tenant.id)` | **KARAR BEKLİYOR** | Canlı: set_config-bound=1 → RLS altında çalışıyor. Ama sarmal `withTenant`/`withSystemScope` değil; CHECK E1 yazılırsa bu blok bulgu üretir. Gerekçe `src/lib/legal/registration-consent.ts:28-41` (kiracı tx ortasında doğuyor, withTenant açılamaz). |
| 2 | auth.ts:438 (OAuth createUser) | auth.ts:836 `prisma.$transaction((tx)=>bootstrapOAuthTenant(tx,…))`; `oauth-registration.ts:283` bind | **KARAR BEKLİYOR** | Aynı mekanizma. |
| 3 | plan-repository.ts:679 publishVersion | :712 `withSystemScope('platform-admin','plan-admin.publishVersion')` | **KARŞILANDI** | 12aacc7d (2026-09-29, TASK-MULUJ8O4JH1PF) |
| 4 | :779 archivePlan | :814 withSystemScope | **KARŞILANDI** | 12aacc7d |
| 5 | :792 deletePlan | :830 withSystemScope | **KARŞILANDI** | 12aacc7d |
| 6 | :809 setPlanVisibility | :847 withSystemScope | **KARŞILANDI** | 12aacc7d |
| 7 | :829 assignPlanToTenant | :883 `withTenant(tenantId, …)` | **KARŞILANDI** | 2c35e535 (2026-09-29, TASK-MULRSG6T55LO0) |
| 8 | :853 unassignPlanFromTenant | :949 withTenant | **KARŞILANDI** | 2c35e535 |
| 9 | admin/tenants/page.tsx:25 Tenant→_count users/workspaces | :25-32 hâlâ çıplak `prisma.tenant.findMany({ include:{ _count:{ select:{ users, workspaces }}}})` | **AÇIK** | Canlı: 48 → 0. Admin ekranı her kiracıyı "0 üye / 0 çalışma alanı" gösterir. |
| 10 | auth.ts:373 User→memberships | :732 `withSystemScope('tenant-discovery','auth.jwt.membership', tx=>tx.user.findUnique({include:{memberships…}}))` | **KARŞILANDI** | b8f1f9a2 (2026-10-01, TASK-MUPYHVSBW47GD) |
| 11 | billing.ts:81 Tenant→subscription | :80 `getEntitlements(tenantId, client?)` → `db = client ?? prisma`. 7 çağıran `tx` veriyor; **1 çağıran vermiyor**: `src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx:142` | **AÇIK (1 çağrı)** | Canlı: ACTIVE → null. Faturalama sayfası ödeyen kiracıya Discover (FALLBACK_PLAN_ID) gösterir, `live=false`. |
| 12 | plan-repository.ts:364 Plan→assignments | :391-398 `listPlansForAdmin` çıplak `prisma.plan.findMany({ include:{ assignments… }})` | **AÇIK** | Canlı: 1 → 0. Özel plan "hiçbir kiracıya atanmamış" görünür. |

### Karttan sonra ortaya çıkan ek E1 adayı (kapsam notu, bulgu)
`src/lib/billing/subscription-sync.ts:959` (b4f12a8a, 2026-10-03, "ensure Stripe invoice write lock stays active until commit"): çıplak `prisma.$transaction(async tx => { tx.tenant.findUnique…; createInvoiceForPayment(tx,…) })`. `invoice-writer.ts` içinde `Invoice` (4) ve `TenantBillingIdentity` (1) yazılıyor; ikisi de `tenantScopedModels()` listesinde; dosyada `set_config`/`withTenant` yok. fabrika_app'te INSERT `tenant_isolation` WITH CHECK'e takılır, `catch` yutar → ödeme geçer, fatura sessizce kesilmez. (Yazma olduğu için canlı ölçülmedi; koddan çıkarım.) CHECK E1 yazıldığında bu 9. blok olur. `k2-cordis/importer.ts` (5 blok) ve `k3-topic-stats/importer.ts:227` SYSTEM_WIDE modellere dokunur, E1 kapsamı dışı.

## DoD maddeleri
- [ ] **12 çağrı yeri sarmalı** — 7 KARŞILANDI (#3-8, #10), 2 KARAR (#1-2 bind), 3 AÇIK (#9, #11, #12).
- [ ] **Her biri için fabrika_app pozitif kırmızı-önce kanıtı rapora** — kartın yazarı tarafından yazılmış rapor yok (`docs/agent-results/TASK-MTWOVYEKUDNZY-*` boş). Bu inceleme açık olanların "sarmasız 0" yarısını ölçtü; "sarmalı N" yarısı düzeltme ile gelecek.
- [ ] **CHECK E (E1+E2) taramada, E2 DMMF tabanlı** — AÇIK: `scripts/tenant-bypass-scan.ts:90` CheckId'de E yok; `CHECK_EXPLANATIONS` ve DMMF kullanımı yok.
- [ ] **Bozuk fixture bulgu üretiyor / düzeltilmiş üretmiyor** — AÇIK (CHECK E olmadığı için ölçülemez).
- [x] **`pnpm gate` yeşil** — bu kartın dalı yok; origin/dev'de `rls:bypass-check` + `rls:check` yeşil (yukarıda). Tam gate bu incelemede koşulmadı (e2e/alerts bu kartı ölçmez).
- [x] **Baseline'a gerekçesiz kayıt girmedi** — E kaydı yok (0); mevcut kayıtlar yalnız D. Trivially karşılanıyor, çünkü E yok.
- [ ] **Platform beyanı** — yazar raporu yok. Bu raporun beyanı yukarıda.
- [ ] `check-tenant-bypass.ts:169` kind↔check kuralı yalnız D'yi tanıyor; E ailesi eklenmemiş.

## Değişen dosyalar
Yok (kod değiştirilmedi, merge/push yok). Worktree `/Users/macbook/alan/FONBRIDGE-crw2-fa47` ve içindeki `probe-fa47.ts` inceleme sonunda kaldırıldı.

## Riskler
- #11'in açık çağrısı kullanıcıya görünen bir sayfa: fabrika_app'e geçişte ödeyen kiracının faturalama sayfası yanlış plan gösterir. Öncelik en yüksek.
- #9/#12 platform-admin ekranları: yanlış ama "temiz" veri (0), hata yok → fark edilmez.
- subscription-sync.ts:959: fatura kaybı, hata yutulur. Kart kapsamına alınmalı (ek E1).
- bind-tabanlı iki kayıt transaction'ı CHECK E1 yazılınca kırmızı olur; kural ya `bindTransactionToTenant` çağrısını blok içinde tanımalı ya da baseline'a gerekçeyle (registration-consent.ts:28-41) girmeli — bu, kartın "ideal sıfır kayıt" hedefiyle çelişir, karar gerekir (karar bloğu açıldı).

### Karar bağlamı (auth.ts:459 / :836)
Her iki blok `prisma.$transaction` içinde önce `tx.tenant.create`, sonra `bindTransactionToTenant(tx, tenant.id)` = `set_config('app.tenant_id', …, true)` çağırır; `withTenantOn` ile aynı mekanizma. Canlı sonda (S1 satırı) bağlanmış tx'in satır gördüğünü gösteriyor. `registration-consent.ts:28-41` withTenant'ın neden açılamadığını belgeliyor (tenant tx ortasında doğuyor). Seçenekler: **A** E1 kuralı blok içindeki bind çağrısını tanısın ve muaf saysın (sıfır baseline kaydı) · **B** iki blok baseline'a gerekçeyle girsin (kartın "ideal sıfır kayıt" hedefi bozulur) · **C** kayıt akışı iki tx'e bölünsün: tenant create withSystemScope, geri kalan withTenant (atomiklik kaybı; registration-consent.ts bunu bilerek reddediyor). Öneri A.

## Sonraki adım — kalan iş (kart taslağı)
**Başlık:** FA-47b · CHECK E (E1+E2) + kalan 3 nested okuma + subscription-sync E1
**Yapılacaklar:**
1. `src/app/[locale]/admin/tenants/page.tsx:25` → `withSystemScope('platform-admin','admin.tenants.list', tx => tx.tenant.findMany({include:{_count…}}))`; baseline'a D kaydı gerekçeyle.
2. `src/lib/billing/plan-repository.ts:391 listPlansForAdmin` → `withSystemScope('platform-admin','plan-admin.listPlans', …)`; baseline D.
3. `settings/billing/page.tsx:142` → `withTenant(tenantId, tx => getEntitlements(tenantId, tx))` (zaten 7 çağıran böyle); ya da `getEntitlements`'ın `client` parametresini zorunlu yap (tip düzeyinde kapı).
4. `subscription-sync.ts:959` → `withTenant(tenantId, async tx => {…})` (tenantId elde; Tenant okuması SYSTEM_WIDE olduğu için etkilenmez).
5. Faz 2 aynen kart: `CheckId`'ye `'E'`; E1 süslü-parantez dengeli `$transaction` bloğu + `tx.<accessor>` ∈ tenantScoped; E2 `Prisma.dmmf.datamodel.models` ile `f.kind==='object' && tenantScoped.has(f.type)`; `check-tenant-bypass.ts:169` kuralına E ailesi; bozuk/düzeltilmiş fixture testi.
6. E1 için `bindTransactionToTenant(tx, …)` çağrısı içeren blok → karara göre ya muaf ya baseline.
7. Her düzeltme için fabrika_app pozitif-yönlü sonda (bu rapordaki sonda deseni şablon: `createDbClient(DATABASE_URL_RLS_TEST)` + `withTenantOn`, aynı sorgu admin/rls yan yana).
**Doğrulama:** `pnpm rls:bypass-check` E1/E2 bulgu sayısı: fixture ile ≥1, düzeltilmiş ağaçta 0 (ya da yalnız gerekçeli baseline); `pnpm gate` yeşil.
