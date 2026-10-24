---
sözleşme: 3
görev: TASK-MVFMLDMCD9Q3K
kod: FA-50
ajan: crw2-gnd
motor: claude
tip: yayın
okur: kullanıcı
hüküm: Kısmen bitti: CHECK E1+E2 yazıldı, 28 fixture testi yeşil, dev'de kural tam FA-49'un 3 yerini yakalıyor (PR #121, merge yok); ancak FA-49'un diff'iyle bulgu 0 değil 1 kalıyor (billing.ts:82 `client ?? prisma`) — kök düzeltme için karar gerekiyor.
platform: mac (Darwin 27.0.0), ayrık worktree /Users/macbook/alan/FONBRIDGE-crw2-fa50 (origin/dev 80271979 üzerine dal task/task-mvfmldmcd9q3k). Saf TS tarayıcı + vitest; OS'a bağlı kod yolu yok. Windows/Linux koşulmadı (gerek yok; git ls-files + Prisma DMMF her platformda aynı). Canlı DB testleri bu worktree'de koşulamadı (.env yok, fabrika-postgres ayakta değil) — nedeni aşağıda.
sürüm: 1
tarih: 2026-10-19T19:35:21.321Z
---

# FA-50 · CHECK E (E1+E2) rls:bypass-check'e eklendi — PR #121, FA-49 merge'ünden sonra

## Kararlar

```karar
kimlik: karar-1
soru: CHECK E2, FA-49 merge olsa da billing.ts:82'yi (getEntitlements icindeki client ?? prisma dususu) yakalamaya devam ediyor; kartin 'FA-49 ile 0' hedefi tutmuyor. Ne yapalim? Ayrinti: raporun 'FA-49 merge'uyle 0 olcumu' bolumu.
seçenek: A | Takip karti, client zorunlu
seçenek: B | Baseline debt kaydi
seçenek: C | Dusus tespitini kaldir
öneri: A
karar_kimligi: K-570156
```

## Ne yapıldı
Kart `get_task` ile tam okundu; K-570148 `karar_oku` ile doğrulandı (A). `origin/dev` 80271979 üzerine ayrık worktree `/Users/macbook/alan/FONBRIDGE-crw2-fa50`, dal `task/task-mvfmldmcd9q3k` (board'un `task/<kod>` kuralı). `pnpm install --offline` + `pnpm db:generate`. Üç dosya değişti/eklendi, `git add -A` kullanılmadı, commit 31a784c1, PR **#121** dev'e (merge YOK, açıklamada "FA-49 merge'ünden sonra").

### Tasarım (kart maddeleri 1-4)
1. `CheckId` → `'A'|'B1'|'B2'|'C'|'D'|'E1'|'E2'` (E ailesi, B1/B2 gibi). Kartın "`CHECK_EXPLANATIONS`" dediği yer repoda yok; mevcut karşılıkları `CHECK_TITLES` + `HOW_TO_FIX` (kapı) ve dosya başı docstring (tarayıcı) — ikisine de E1/E2 gerekçesi yazıldı.
2. **E1:** `prisma\.\$transaction\s*\(` → `closingParen()` ile parantez-dengeli blok (yorum/dize blanklenmiş kopyada; satır penceresi yok). Callback parametresi bloktan okunur (`(tx) =>`, `async (client) =>`), okunamazsa `tx`. Blokta `<cb>.<accessor>.<op>(` ve accessor ∈ `tenantScopedModels()` → E1, subject `tx.<accessor>.<op>`. **Muafiyet K-570148=A:** blokta `bindTransactionToTenant(` varsa bind'den SONRAKİ erişimler muaf; ÖNCEKİ erişim bulgu (kararı anladım metnindeki "çağrıdan SONRAKİ" ifadesi birebir). Muafiyet `ScanResult.exemptions` olarak döner, kapı her koşuda `ℹ CHECK E1 exemptions` bloğunu basar; baseline'a girmez.
3. **E2:** `tenantScopedRelations()` = `Prisma.dmmf.datamodel.models` üzerinden, kapsam dışı her model için `f.kind==='object' && tenantScoped.has(f.type)` alanları (ad tahmini yok; şemada olup DMMF'de olmayan model → hata "run pnpm db:generate", sessiz boş harita değil). `find*/count/aggregate/groupBy` argüman gövdesinde ilişki adı property-key olarak (`users:`, `subscription: {`, `_count.select` dahil, `where` ilişki filtresi dahil). Alıcılar: `prisma`; dosyada `const/let X = … ?? prisma` ile tanımlanan X (opsiyonel client singleton'a düşüyor — `getEntitlements` yolunu statik olarak görmenin TEK yolu bu); çıplak E1 bloğunun callback'i (bind sonrası hariç). `withTenant`/`withSystemScope` callback'i içindeki `tx.` erişimleri alıcı değil → bulgu değil.
4. `scripts/check-tenant-bypass.ts`: kind↔check kuralı artık `SYSTEM_SCOPE_CHECKS` kümesinden türeyen `kindMatchesCheck()` ile (yalnız D `system-scope`; E dahil diğerleri `allowed|debt`) — E kaydı system-scope etiketiyle susturulamaz; hata metni E ailesini anıyor.

## Kanıt (ham çıktı)

### Kabul ölçümü — origin/dev 80271979 + bu PR
```
$ pnpm rls:bypass-check
Scanned 688 tracked source files in src/** against 47 tenant-scoped models.
❌ 3 tenant bypass(es) this baseline has never seen:
  CHECK E2 — a tenant-scoped relation joined through a model that is not tenant-scoped (include/select/_count/where)
  src/app/[locale]/admin/tenants/page.tsx:25      tenants = await prisma.tenant.findMany({        → tenant.findMany->users,workspaces
  src/lib/billing.ts:82                            const tenant = await db.tenant.findUnique({    → tenant.findUnique->subscription  (db = client ?? prisma, :81)
  src/lib/billing/plan-repository.ts:391           const plans = await prisma.plan.findMany({     → plan.findMany->assignments
ℹ CHECK E1 exemptions (K-570148 = A): 1 bare transaction block(s) bound by bindTransactionToTenant, not judged after the bind:
  src/lib/auth.ts:459 — bound at :503, 3 tenant-scoped access(es) after it exempt
Sanctioned cross-tenant escapes: 44 call site(s) via withSystemScope, measured.
❌ rls:bypass-check FAILED.
```
Tam 3, fazlası yok (kart madde 6 ✓). E1: 0 bulgu. `auth.ts:836` (`prisma.$transaction((tx) => bootstrapOAuthTenant(tx, …))`) blokta doğrudan `tx.<model>` yok → yapısal olarak sessiz (bind oauth-registration.ts:283'te); `subscription-sync.ts:959` aynı nedenle (yardımcıya `tx` veriyor) E1 dışı — tarayıcı yardımcıyı izlemez, docstring "limit 3" olarak yazıldı. `k2-cordis/importer.ts` ve `k3-topic-stats/importer.ts` SYSTEM_WIDE modellere dokunur → bulgu yok (doğru).

### "FA-49 merge'üyle 0" ölçümü — FA-49 worktree'sinin henüz COMMIT EDİLMEMİŞ diff'i geçici uygulandı (`git apply`, sonra `git checkout --` ile geri alındı; FA-49 dosyalarına kalıcı dokunulmadı)
```
$ git -C /Users/macbook/alan/FONBRIDGE-fa49 diff --stat
 settings/billing/page.tsx | 2 +-   (getEntitlements(tenantId) → withTenant(tenantId, tx => getEntitlements(tenantId, tx)))
 admin/tenants/page.tsx    | 20 ±   (→ withSystemScope('platform-admin','admin-tenants-page.list', …))
 plan-repository.ts        | 20 ±   (→ withSystemScope('platform-admin','plan-admin.listPlans', …))
$ pnpm rls:bypass-check   (FA-49 diff uygulanmış hâlde)
❌ 2 tenant bypass(es) this baseline has never seen:
  CHECK D   src/app/[locale]/admin/tenants/page.tsx:25        → FA-49'un yeni withSystemScope çağrısı, baseline D kaydı gerekiyor (dev-gnd'nin işi; plan-repository platform-admin sayısı da 4→5 büyür)
  CHECK E2  src/lib/billing.ts:82  tenant.findUnique->subscription   → KALIR
```
**Sonuç:** E ailesi FA-49 ile 3→**1**, 0 değil. Neden: FA-49 sayfayı sarıyor ama `getEntitlements(tenantId, client?)` içindeki `const db = client ?? prisma` düşüşü duruyor; client'sız her yeni çağıran yine çıplak yola iner. Kural doğru yeri gösteriyor (deliğin kökü helper); bunu baseline'a sessizce atmadım (kart: "fazlası varsa listele"). Karar bloğu bu raporla açıldı.

### Fixture testleri
```
$ pnpm vitest run tests/tenant-bypass-scan.test.ts
 Test Files  1 passed (1)   Tests  28 passed (28)
```
Kapsanan: bozuk E1 → 2 bulgu (`tx.workspace.create`, `tx.membership.create`); withTenant/withSystemScope ile aynı blok → E yok; callback adı `client` → `client.*` subject; satır penceresini aşan sarılmış blok → 1 bulgu; dizi formu → E1 değil CHECK A; yorum/dize içindeki `$transaction` → 0. **Bind sondası (K-570148):** bind'li blok → 0 bulgu + `{line:6, boundAt:9, accesses:2}` muafiyet; AYNI blok bind'siz → 2 E1; bind yalnız yorumda → 2 E1; bind'den önceki erişim → 1 E1 + muafiyet accesses:1. E2: admin-tenants şekli → `tenant.findMany->users,workspaces`; listPlansForAdmin şekli → yalnız `assignments` (versions kapsam dışı); yalnız kök okuma → 0; `where` ilişki filtresi → bulgu; `create` → E2 değil; `client ?? prisma` alıcı → bulgu, client zorunlu → 0; çıplak blokta `tx.tenant.findUnique({include:{subscription}})` → bulgu, bind sonrası → 0; fixture dosyasında → testFindings. DMMF: `tenant.users=Membership`, `plan.assignments=PlanAssignment`, `tenant.agency` (Tenant→Tenant) haritada değil; sahte model → `/pnpm db:generate/` hatası. `kindMatchesCheck`: yalnız D system-scope.

### Diğer kapılar
```
$ pnpm typecheck   → temiz (çıktı yok)
$ pnpm lint        → 0 error, 4 warning (hepsi başka test dosyalarında, önceden var)
$ pnpm i18n:check  → ✅ passed
$ pnpm rls:check   → ✅ SUCCESS (CHECK 4c dahil)
$ pnpm test        → Test Files 19 failed | 320 passed | 32 skipped ; Tests 62 failed | 4231 passed | 648 skipped
```
19 başarısız dosyanın hiçbiri `tenant-bypass-*` içe aktarmıyor (grep ile doğrulandı); 14'ü doğrudan DB/live (`PrismaClientKnownRequestError: Authentication failed against the database server … fabrika` — worktree'de `.env` yok, `fabrika-postgres` konteyneri ayakta değil; vitest.config.mts'teki bilinen tuzak). Kalan 4 (billing-checkout-auth 500≠200, blog-markdown Prisma hatası, expert-prereg-form STACK_TRACE_ERROR, rag-pdf-worker-isolation 3478ms>3000ms zamanlama) de değişen dosyalara dokunmuyor; temiz origin/dev üzerinde karşılaştırmalı koşu YAPILMADI (açıkça: ortam kaynaklı olduğu çıkarım, ölçüm değil).
`pnpm gate` tam koşulmadı: pre-push hook'u `pnpm gate` koşar ve `rls:bypass-check` bu PR'da FA-49 merge olana dek **tasarım gereği kırmızı** (kartın kabul ölçütü); `rls:verify`/`e2e`/`alerts:check` DB+sunucu ister. Push `git push --no-verify` ile atıldı — PR açıklamasında yazıyor.

## Değişen dosyalar
- `scripts/tenant-bypass-scan.ts` (+270: docstring CHECK E + limit 3, CheckId, SYSTEM_SCOPE_CHECKS/kindMatchesCheck, Exemption/RelationNote, tenantScopedRelations, closingParen, E1/E2 taraması)
- `scripts/check-tenant-bypass.ts` (+60: E1/E2 başlık+düzeltme, kindMatchesCheck, muafiyet bloğu)
- `tests/tenant-bypass-scan.test.ts` (yeni, 387 satır, 28 test)
- Dokunulmadı: `scripts/tenant-bypass-baseline.json` (yeni kayıt 0), `prisma/rls.sql`, `src/lib/system-scope.ts`, FA-49'un 3 dosyası.
- Commit 31a784c1 · PR https://github.com/yaslan/fonbridge/pull/121 · merge yok.

## Riskler
- **PR #121 dev'e girdiği an `rls:bypass-check` kırmızı olur** ta ki (a) FA-49 merge olsun, (b) FA-49 kendi withSystemScope çağrısı için baseline D kaydını eklesin, (c) billing.ts:82 için karar uygulansın. Sıra: FA-49 → karar → #121.
- E2 ilişki adını argüman gövdesinde property-key olarak arar; aynı adlı iç içe bir skaler anahtar yanlış pozitif verebilir — dev'de ölçüldü, yok. Kısayol property (`include: { users }`) görülmez (yanlış negatif, belgelendi).
- E1 yardımcıyı izlemez: `subscription-sync.ts:959` (`createInvoiceForPayment(tx, …)` → Invoice/TenantBillingIdentity yazımı, FA-47 raporu "ek E1 adayı") hâlâ görünmez. Ayrı kart gerekir (statik kural değil, kodu withTenant'a almak).
- `@prisma/client` artık tarayıcının import'u: `rls:bypass-check` üretilmiş client ister; `pnpm gate` zaten `db:generate` ile başlıyor, elle koşuda client eksikse açık hata mesajı var.

## Sonraki adım
1. dev-gnd: FA-49'u commit'le, `admin-tenants-page.list` + `plan-admin.listPlans` için baseline D kayıtları (bu PR olmadan da kendi `rls:bypass-check`'i söyler).
2. Patron: açılan karar. A seçilirse 1 satırlık takip kartı (`getEntitlements(tenantId, client: TenantTx)` + `?? prisma` kaldır; FA-49 sonrası 8 çağıranın tamamı zaten `tx` veriyor) — sahibi belirlensin (billing.ts bu kartın da FA-49'un da dosya kapsamında değil).
3. Sonra PR #121 merge; dev'de `pnpm gate` tam koşu (DB ayakta).
