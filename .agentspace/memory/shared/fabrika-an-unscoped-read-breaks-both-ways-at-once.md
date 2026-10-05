---
name: fabrika-an-unscoped-read-breaks-both-ways-at-once
description: Sarmasız VE where'siz bir okuma iki rolde ZIT yönlerde patlar (fabrika'da sızıntı, fabrika_app'te sıfır satır) — her yarım düzeltme diğer rolün testinden yeşil geçer, o yüzden kapı iki rolde birden ölçmelidir
metadata:
  type: project
  updatedAt: 2026-09-10
---

Kiracı sarmalayıcısı **ve** `where: { tenantId }`'in ikisi birden eksik olan bir okuma tek bir kusur
değil, **aynı anda iki kusurdur** ve iki veritabanı rolünde **zıt yönlerde** patlar:

| Rol | Politika | Sonuç |
|---|---|---|
| `fabrika` (bugünkü `DATABASE_URL`, BYPASSRLS) | değerlendirilmez | **her kiracının satırı** döner → sızıntı |
| `fabrika_app` (`DATABASE_URL_RLS_TEST`, NOBYPASSRLS) | uygulanır | scope açılmadığı için `"tenantId" = NULL` → **0 satır** → ekran kendi kiracısının verisini göstermez |

Tehlikeli kısım şu: **her yarım düzeltme, diğer rolün testinden yeşil geçer.**
TASK-MTVTQTJIQ5SDB'de `MarketplaceListing` üzerinde ölçüldü (6 testlik iki-rollü dosya):

```
Orijinal (çıplak findMany)      → 2 failed | 4 passed   (iki kol da kırmızı, zıt yönlerde)
Yalnız withTenant, where yok    → 1 failed | 5 passed   (çapraz-kiracı kolu HÂLÂ kırmızı)
Yalnız where, withTenant yok    → 1 failed | 5 passed   (kendi-satırı kolu HÂLÂ kırmızı)
İkisi birden                    → 6 passed
```

Yani tek rolde koşan bir test, yarım düzeltmeyi "bitti" diye onaylar. Bu iki kayıt aynı madalyonun
ayrı yüzleridir ve tek başına okunursa yanıltır: [[fabrika-a-wrapper-migration-is-red-first-in-the-positive-direction]]
(yalnız `withTenant` eksikse) ve [[fabrika-tenant-isolation-real-defense-is-app-level-where]]
(yalnız `where` eksikse). **İkisi birden eksikse ikisini birden ölç.**

**Nasıl uygulanır:** `@/lib/db`'yi `vi.hoisted` bir kutuyla mock'la, `box.client`'ı iki `describe`
arasında `admin` (BYPASSRLS) ↔ `rls` (NOBYPASSRLS) diye çevir; her blokta ilk test rolün
`rolbypassrls` değerini doğrulasın, yoksa blok sessizce anlamsızlaşır. Örnek:
`tests/marketplace-listing-tenant-scope.live.test.ts`.

**Boş tablo tuzağı:** `MarketplaceListing` (0 satır) ve `ConceptTemplate` (7 satırın hepsi platform)
gibi tablolarda çapraz-kiracı testi **hiç kırmızı olamaz** — sızıntıyı engelleyen kod değil, verinin
yokluğudur. "Bugün sızmıyor" ile "kod doğru" ayrı şeylerdir; iki kiracıya da satır ekip (geri
alınabilir bir transaction'da) kusuru görünür kıl, sonra karar ver.

Düzeltirken kuralı **tek bir fonksiyona** koy (örn. `listTenantListings(tenantId)`), çağrı yerlerine
kopyalama — ikinci kopya bir sonraki yarım düzeltmenin saklanacağı yerdir.
