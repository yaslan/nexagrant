# TASK-MTUH7CF87SGRR — Depo geneli `tenantId ?` süpürmesi (salt-okunur)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tip:** salt-okunur denetim/triyaj · **Tarih:** 2026-09-09
**Kod değişmedi, dosya silinmedi, commit atılmadı.** Bu tur yalnız ölçüm.

**Platform beyanı:** macOS (Darwin 25.6.0, zsh). Kullanılan araçlar `grep`, dosya okuma ve `pnpm typecheck` — hepsi platformdan bağımsız. Taranan kod saf TypeScript; bulgular **Windows ve Linux'ta birebir aynıdır**, çünkü hiçbiri süreç/kabuk/dosya-yolu/ekran davranışına bağlı değil.
**Koşulamayan:** `pnpm dev`, `pnpm test:e2e`, `pnpm gate` ve veritabanına dokunan komutlar — **sebebi: görevin ÇAKIŞMA KURALI** bunları açıkça yasakladı. Dolayısıyla aşağıdaki hiçbir iddia canlı bir sorgu koşusuna değil, **kod okumasına** dayanır ve öyle etiketlenmiştir.

---

## 0. Tek cümlelik cevap

Depoda bu hata sınıfının **canlı hâli 4 satıra inmiş**: `src/modules/m6/server/scoring.ts`'de 3 satır (gerçek sızıntı şekli, ama **bugün hiçbir üretim çağıranı yok**) ve `src/app/api/billing/checkout/route.ts:84`'te 1 satır (uydurma `'default-tenant'` kimliği + rotada **hiç oturum kapısı yok**). Diğer 14 eşleşmenin tamamı ya bilinçli paylaşımlı/platform yolu ya da doğru korunmuş yanlış pozitif.

---

## 1. Aramanın kapsamı (bir sonraki tarayıcı bunu tekrar etmesin)

**Dizinler:** `src/**` (`.ts` + `.tsx`), test dosyaları hariç. `tests/**` yalnız çağıran sayımı için okundu.

**Aranan desenler — hepsi koşuldu:**

| # | Desen | Neyi yakalar |
|---|---|---|
| 1 | `tenantId\s*?` (üçlü operatör; `tenantId?:` ve `tenantId ??` elendi) | `tenantId ? {...} : {...}` — filtre düşüren klasik şekil |
| 2 | `: {})` ve `? {...} : {})` | **spread ile** filtre düşürme (`...(tenantId ? { tenantId } : {})`) — değişken başka bir adla sarmalanmışsa desen 1 bunu kaçırır |
| 3 | `session?.tenantId`, `session.user?.tenantId` | kanonik `requireTenant*` yerine ham okuma |
| 4 | `where: {}` / `where: { }` | boş filtre |
| 5 | `'default-tenant'`, `'demo-tenant`, `findFirst()` | uydurma/fallback kiracı kimliği |
| 6 | `where` bloğu içinde çıplak `tenantId,` + her dosyada `tenantId`'nin **kaynağı** | Prisma'nın `undefined` alanı YAZILMAMIŞ sayması (doğrudan atama sınıfı) |
| 7 | `tenantId: null` / `OR: [{ tenantId: null }, ...]` | bilinçli paylaşımlı daralma (sızıntı DEĞİL — ayırmak için) |

**Desen 6 neden önemliydi:** görev metninin uyardığı gibi üçlü operatörle sınırlı kalmadım. Ancak ölçüm şunu gösterdi: `where` içinde çıplak `tenantId,` kullanan **her** üretim dosyasında `tenantId`'nin kaynağı ya `requireTenant*`/`scope` (garanti `string`) ya da hemen üstünde bir `if (!tenantId) → reddet` kapısı. **Bu sınıfta tek bir canlı bulgu çıkmadı** — bulgular yalnız desen 1, 2 ve 5'ten geldi.

---

## 2. Kova 1 — Gerçek sızıntı riski (4 satır)

### 1.1 `src/modules/m6/server/scoring.ts:401, 451, 544` — filtre düşüren üç iç fonksiyon

| Satır | Kod | `withTenant` içinde mi? |
|---|---|---|
| `:401` | `...(tenantId ? { reviewer: { tenantId } } : {})` | **HAYIR** (tenantsız dalda global `prisma`) |
| `:451` | `reviewer: { evaluationId, ...(tenantId ? { tenantId } : {}) }` | **HAYIR** (aynı) |
| `:544` | `...(tenantId ? { reviewer: { tenantId } } : {})` | **HAYIR** (aynı) |

**Tek cümlelik gerekçe:** `tenantId` boşsa `where`'den kiracı koşulu tamamen kalkar ve sorgu **tüm kiracıların `Score` satırları** üzerinde çalışır — bir kriterin ortalaması bütün müşterilerin puanlarından hesaplanır.

**Tenantsız dalın gerçekten erişilebilir olduğu — ölçüldü:**
```
src/modules/m6/server/scoring.ts:382-385
    if (tenantId) {
      return withTenant(tenantId, (tx) => calculateCriterionAverageInternal(tx, criterionId, tenantId));
    }
    return calculateCriterionAverageInternal(prisma as unknown as TenantScopedDb, criterionId);
```
İki argümanlı aşırı yükleme (`calculateCriterionAverage(criterionId)`) **açıkça global `prisma`'yı ve `tenantId: undefined`'ı** geçiriyor. Aynı üçlü yapı `calculateEvaluationScore` (`:432-434`) ve `getScoreDistribution` (`:524-526`) için de var.

**⚠ Azaltıcı ve önemli olgu — bugün tetiklenemez:** bu üç export'un **`src/` altında tek bir üretim çağıranı yok**:
```
$ grep -rn "calculateCriterionAverage\|calculateEvaluationScore\|getScoreDistribution" src tests | grep -v "scoring.ts:"
tests/modules/m6/scoring.test.ts:3,4,5      (import)
tests/modules/m6/scoring.test.ts:28  calculateCriterionAverage(mockDb, 'crit-1', 'tenant-a')
tests/modules/m6/scoring.test.ts:68  calculateEvaluationScore(mockDb, 'eval-1', 'tenant-a')
tests/modules/m6/scoring.test.ts:83  getScoreDistribution(mockDb, 'crit-1', 'tenant-a')
```
Üç test de **üç argümanlı** (kiracılı) biçimi kullanıyor. Yani tehlikeli dal **hiçbir yerden çağrılmıyor** — dolu ama tetiği çekilmemiş silah. Bu, bulgunun önemini düşürür ama **sıfırlamaz**: aşırı yükleme imzası iki argümanlı çağrıyı davet ediyor, ve o çağrıyı yazacak bir sonraki geliştirici hiçbir uyarı almayacak (`pnpm typecheck` temiz geçiyor, çünkü imza bunu meşru kılıyor).

### 1.2 `src/app/api/billing/checkout/route.ts:84` — uydurma kiracı + oturum kapısı yok

```
84:    const tenantId = session?.tenantId || 'default-tenant';
```

**Tek cümlelik gerekçe:** oturumsuz bir istek reddedilmek yerine **var olmayan bir kiracı kimliğiyle** ödeme akışına devam ediyor.

Ölçülenler:
- **Rotada hiç oturum kapısı yok.** `grep -n "401\|Unauthorized\|requireTenantApi\|if (!session" src/app/api/billing/checkout/route.ts` → **hiç eşleşme yok**. `POST` anonim erişilebilir.
- **`'default-tenant'` depoda başka hiçbir yerde geçmiyor** — ne `prisma/seed.ts`'te, ne `scripts/`'te, ne şemada:
  ```
  $ grep -rn "default-tenant" prisma/ scripts/ src/
  src/app/api/billing/checkout/route.ts:84:    const tenantId = session?.tenantId || 'default-tenant';
  ```
  Yani **kiracılar-arası okuma sızıntısı DEĞİL**: `tierForTenant('default-tenant')` hiçbir fiyat kilidi bulamaz (paylaşımlı vitrin fiyatı uygulanır) ve `priceLineForTenant` o kimliğe atanmamış özel planları reddeder.
- Değer `client_reference_id: tenantId` olarak **Stripe'a gidiyor** (`:300`). Karşı taraf bunu tüketiyor: `src/lib/billing/lifetime-licence.ts:159`. Orada **açık bir savunma var** ve iyi çalışıyor:
  ```
  166:  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, ... });
  167:  if (!tenant) throw new Error(`Lifetime checkout ${session.id} names an unknown tenant: ${tenantId}`);
  ```
  Yani uydurma kimlik **yazma yoluna ulaşamıyor** — webhook gürültülü biçimde reddediyor.

**Kalan gerçek risk (sızıntı değil, ama gerçek):** kimliği doğrulanmamış biri Stripe Checkout Session'ı **oluşturabiliyor**; o oturum ödense bile webhook `unknown tenant` diye 500 verip Stripe'ı yeniden denemeye sokar — yani **kaydedilemeyen bir tahsilat** ve kimlik doğrulaması olmayan bir maliyet/kötüye kullanım yüzeyi. Doğru düzeltme `|| 'default-tenant'`'ı kaldırıp rotaya `requireTenantApi` koymaktır.

---

## 3. Kova 2 — Bilinçli, filtreyi KALDIRMAYAN yollar (sızıntı sayılmadı)

Görev metninin özellikle uyardığı ayrım: bu desenler filtreyi kaldırmaz, **paylaşımlı/genel kümeye DARALTIR**.

| Dosya:satır | Kod | Neden doğru |
|---|---|---|
| `src/app/[locale]/(app)/[workspace]/concept-notes/data.ts:48` | `where: { OR: [{ tenantId: null }, { tenantId }] }` | Görev metnindeki kanonik "bilinçli yol" deseni: paylaşımlı şablon + kendi kayıtları. Filtre duruyor. |
| `src/lib/rag.ts:407` | `...(tenantId ? [tenantId] : [])` | **Bağlı SQL parametresi dizisi**, filtre değil. Filtrenin kendisi `:391-395`'te ayrıca kuruluyor ve kiracısız dalda `"tenantId" IS NULL`'a **daralıyor**. Ayrıca çağrı `withTenant` içinde. |
| `src/app/api/billing/quote/route.ts:40, 56` | `session?.tenantId ?? null` → `tenantId ? tierForTenant(tenantId) : null` | Anonim fiyat teklifi kasıtlı: kiracı yoksa **genel vitrin** fiyatı. Kiracı verisi okunmuyor. |
| `src/app/[locale]/pricing/page.tsx:72` | `session?.tenantId ?? null` | Aynı — herkese açık fiyat sayfası. |
| `src/lib/billing/storefront.ts:132` | `tenantId ? plansVisibleToTenant(tenantId) : listPublicPlans()` | Dal **daha dar** bir sorguya gidiyor (yalnız public planlar), filtresize değil. |
| `src/actions/user/export-data.ts:217` | `...(tenantId ? { tenantId } : {})` | **`where` değil, `create`'in `data`'sı.** Kiracısız bir `AuditEvent` yazmak bilinçli platform-kapsamı davranışı (af75623 "null-tenant audit"). Okuma filtresi değil. |

---

## 4. Kova 3 — Yanlış pozitif: ham okuma ama doğru korunmuş (6 satır)

Hepsi `session?.tenantId` ile ham okuyor (kanonik `requireTenant*` kullanmıyor), ama **hemen ardından reddediyor** — filtre hiçbir dalda düşmüyor:

| Dosya:satır | Koruma |
|---|---|
| `src/app/[locale]/(app)/[workspace]/approvals/page.tsx:16` | `if (tenantId) { … }` — sorgu yalnız kiracı varsa koşuyor, yoksa boş liste |
| `src/app/[locale]/(app)/[workspace]/dashboard/page.tsx:50` | `if (!tenantId) return <Notice … />` |
| `src/app/[locale]/(app)/[workspace]/dashboard/export-csv.ts:25` | `if (!tenantId) return { success: false, error: 'Unauthorized' }` — ayrıca `withTenant` kullanıyor |
| `src/app/api/concept-notes/[id]/export/route.ts:12` | `if (!tenantId) return 401` |
| `src/app/api/dashboard/export-csv/route.ts:16` | `if (!tenantId) return 401` |
| `src/app/api/feedback/route.ts:34` | `if (!session?.user \|\| !tenantId) return 401` |

**Not (iyileştirme, hata değil):** altısı da doğru davranıyor ama kuralı **elle** tekrar ediyor. `requireTenantPage`/`requireTenantApi` kullansalardı koruma imzadan gelirdi. Bu bir sızıntı değil, dayanıklılık farkı.

Ayrıca, yorum satırı olarak eşleşen ve **zaten düzeltilmiş** 10 konum var (`evidence/page.tsx`, `evidence/data.ts`, `concept-notes/page.tsx`, `concept-notes/data.ts`, `concept-notes/[id]/*`, `relationships/page.tsx`, `relationships/[id]/data.ts`, `src/lib/db.ts:89`, `src/lib/tenant.ts:11`) — hepsi kaldırdıkları hatalı satırı yorumlarında **alıntılıyor**, bu yüzden grep'e takılıyorlar. Kod değil, belge.

---

## 5. `withTenant` sütunu (görevin özellikle istediği ayrım)

`src/lib/db.ts:140` — `withTenantOn` artık ilk iş olarak `assertTenantScope(tenantId, 'withTenantOn')` çağırıyor; boş/`''`/`null`/`undefined` kiracı **`MissingTenantScopeError` ile reddediliyor**. Yani `withTenant`'tan geçen bir çağrının risk profili yapısal olarak farklı: kiracısız çağrı sessizce genişlemez, **fırlatır**.

| Bulgu | `withTenant`'tan geçiyor mu | Sonuç |
|---|---|---|
| m6 `scoring.ts` — kiracılı dal (`:383, :434, :526`) | **Evet** | Güvenli; `assertTenantScope` boş kiracıyı zaten reddeder |
| m6 `scoring.ts` — kiracısız dal (`:385` ve kardeşleri) | **Hayır** — global `prisma`, `tenantId: undefined` | **Kova 1** |
| `checkout/route.ts:84` | İlgisiz (Prisma `where`'i yok; değer Stripe'a gidiyor) | **Kova 1**, farklı sınıf |
| Kova 3'ün 6 satırı | 1'i evet (`dashboard/export-csv.ts`), 5'i hayır | Hepsi kapı ile korunuyor |

Depoda `withTenant(` kullanan **33** üretim dosyası var.

---

## 6. Sayım

| Kova | Satır |
|---|---|
| Kova 1 — gerçek risk | **4** (m6 scoring ×3, billing checkout ×1) |
| Kova 2 — bilinçli paylaşımlı/platform yolu | 6 |
| Kova 3 — yanlış pozitif (korunmuş ham okuma) | 6 |
| Belge/yorum eşleşmesi (düzeltilmiş hatanın alıntısı) | 10 |

---

## 7. Kanıt (kopyalanmış çıktı)

```
$ grep -rn --include="*.ts" --include="*.tsx" ": {})" src | grep -v "\.test\." | grep tenantId
src/actions/user/export-data.ts:217:        ...(tenantId ? { tenantId } : {}),
src/modules/m6/server/scoring.ts:401:      ...(tenantId ? { reviewer: { tenantId } } : {}),
src/modules/m6/server/scoring.ts:451:      reviewer: { evaluationId, ...(tenantId ? { tenantId } : {}) },
src/modules/m6/server/scoring.ts:544:      ...(tenantId ? { reviewer: { tenantId } } : {}),

$ grep -rn --include="*.ts" --include="*.tsx" "where:\s*{}" src | grep -v "\.test\."
        (hiç eşleşme yok)

$ grep -rn "default-tenant" prisma/ scripts/ src/
src/app/api/billing/checkout/route.ts:84:    const tenantId = session?.tenantId || 'default-tenant';

$ grep -n "401\|Unauthorized\|requireTenantApi\|if (!session" src/app/api/billing/checkout/route.ts
        (hiç eşleşme yok — rotada oturum kapısı yok)

$ grep -rn "calculateCriterionAverage\|calculateEvaluationScore\|getScoreDistribution" src tests | grep -v "scoring.ts:"
tests/modules/m6/scoring.test.ts:3,4,5,28,68,83   (yalnız test, hepsi 3-argümanlı kiracılı biçim)

$ grep -n "assertTenantScope" src/lib/db.ts
118:export function assertTenantScope(
140:  assertTenantScope(tenantId, 'withTenantOn');

$ pnpm typecheck
$ tsc --noEmit
        (hata yok)
```

---

## 8. Değişen dosyalar

Yalnız bu rapor: `docs/agent-results/TASK-MTUH7CF87SGRR-blok-zincir-denet-i.md` (yeni).
**Hiçbir kaynak dosya değiştirilmedi, commit atılmadı.**

## 9. Riskler

1. **Bulgular kod okumasıdır, koşum değil.** DB ve e2e yasaktı; "filtre düşüyor" iddiası SQL'in gerçekten kiracılar-arası satır döndürdüğünü **canlı ölçmedi**. m6 için bu ölçüm zaten yapılamaz — çağıran yok.
2. **Statik koruma hâlâ yok.** Bu desen depoda en az beş kez düzeltildi (`d1de9d4`'te üç sayfa, TASK-MTRKV9JGY7OQY'de bir sayfa, `relationships/[id]/data.ts`) ve her seferinde elle bulundu. Ne lint kuralı ne CI grep'i bunu yakalıyor. Bir koruma yazılacaksa **iki yazım biçimini de** kapsamalı: doğrudan `where: tenantId ? {...} : {...}` ve spread hâli `...(tenantId ? {...} : {})`. (Bu turda m6'nın üç satırı **her iki aramada da** çıktı — desen 2'yi ayrıca koşmam onları bulmak için gerekli değildi, ama `tenantId` değişkeni başka bir adla sarmalanmış bir spread'i yalnız desen 2 yakalardı.)
3. **`src/lib/rag.ts` bu tur boyunca oynaktı.** Aynı oturumda paylaşımlı ağaçta iki kez altımdan değişti (bkz. TASK-MTU6KE36HAFJR raporu §5.1). Bu dosyaya dair yukarıdaki satır numaraları md5 `dbb496e077c57b602022e0b224971458` durumuna aittir.
4. Kova 3'teki 6 satır bugün doğru; **korumaları imzadan değil elden geliyor**, dolayısıyla bir refactor sırasında sessizce kaybolabilirler.

## 10. Açık sorular

1. m6 `scoring.ts`'in iki argümanlı (kiracısız) aşırı yüklemesi **kaldırılsın mı**? Çağıranı yok; imzayı silmek hem bulguyu kökten kapatır hem de gelecekteki çağrıyı `typecheck` düzeyinde imkânsız kılar. (Öneri: **evet, kaldırılsın** — düzeltmenin en ucuz ve en kalıcı biçimi.)
2. `checkout/route.ts` anonim erişime **açık olmalı mı**? Eğer "misafir ödemesi" bilinçli bir üründe kararsa, uydurma `'default-tenant'` yerine gerçek bir misafir-kiracı modeli gerekir; değilse rotaya `requireTenantApi` konmalı.

## 11. Sonraki adım

İki ayrı düzeltme kartı: (a) m6 aşırı yükleme temizliği — küçük, testli, düşük risk; (b) checkout oturum kapısı — güvenlik, `docs/BILLING.md` ile birlikte okunmalı. Bu tur salt-okunur olduğu için ikisi de uygulanmadı.

---

**Karar:** Bu tur yayına uygunluk kararı **vermez** (kod değişmedi). Denetim sonucu: **hata sınıfı depo genelinde büyük ölçüde temizlenmiş** — canlı 4 satır kaldı, ikisi de bugün tetiklenemez durumda, ama ikisi de imza/kapı düzeyinde kapatılabilir ve kapatılmalı.
