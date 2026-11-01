---
name: fabrika-a-wrapper-migration-is-red-first-in-the-positive-direction
description: Kova-H tipi sarma dilimlerinde çapraz-kiracı testi hem önce hem sonra geçer — kırmızı-önce sondayı POZİTİF yönde kur (sarmasız kod fabrika_app altında KENDİ kiracısının sıfır satırını döndürür) ve enjeksiyon noktası yoksa @/lib/db mock'uyla iki export'u birden RLS istemcisine bağla
metadata:
  type: project
  updatedAt: 2026-09-10
---

`tenantId` zaten `where`/`data` içindeyken yalnız `withTenant` ekleyen bir dilimde (envanterin
"Kova H"si), alışılmış çapraz-kiracı testi **hem değişiklikten önce hem sonra geçer** — `where`
cümlesi B'nin satırlarını zaten dışlıyordu. Hiçbir şey ölçmeyen bir yeşildir; bu çağrıların bir
denetimden sarmalanmadan geçmesinin sebebi tam olarak budur.

Kırmızı-önceyi **pozitif** yönde kur: `DATABASE_URL_RLS_TEST` (rol `fabrika_app`, NOBYPASSRLS)
altında sarmasız kod hiçbir scope açmaz → `app.tenant_id` boş → politika hiçbir satırla eşleşmez →
yükleyici **kendi kiracısının sıfır satırını** döndürür, yazma 42501 ile reddedilir.

TASK-MTVR9T834EPUC'de ölçüldü (7 dosya, 14 çağrı), aynı test dosyası:

```
ÖNCE:  × returns the calling tenant its own rows      expected +0 to be 1
       × persists a report under the reporting tenant  42501 @ src/lib/feedback/submit.ts:117
       Tests 4 failed | 1 passed
SONRA: Tests 5 passed
```

Yani kanıt "sızıntı yok" değil (o zaten yoktu); kanıt **"bu dosyalar uygulamanın koşması gereken
rol altında daha önce hiç çalışmıyordu, şimdi çalışıyor"**.

**Enjeksiyon noktası yoksa** ([[fabrika-app-role-is-necessary-but-not-sufficient-for-an-rls-test]]
`TenantRunner` öneriyor, ama çoğu dosya `prisma`/`withTenant`'ı doğrudan import eder): `@/lib/db`
mock'unda **iki export'u birden** RLS istemcisine bağla — eşleştirme ölçümün kendisidir; `prisma.`
kalan kod scope'suz bağlantıya düşer (kırmızı), `withTenant` çağıran kod gerçek scope açar (yeşil).

```ts
const box = vi.hoisted(() => ({ client: undefined as PrismaClient | undefined }));
const rls = createDbClient(envValue('DATABASE_URL_RLS_TEST')!); box.client = rls;
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return { ...actual,
    get prisma() { return box.client ?? actual.prisma; },
    withTenant: <T>(t: string, cb: (tx: never) => Promise<T>) => withTenantOn(box.client!, t, cb) };
});
```

İki tuzak, ikisi de canlı yaşandı:
1. **`vi.mock` her `const`'un üstüne hoist edilir** → factory `rls`'i doğrudan okursa
   `ReferenceError: Cannot access 'rls' before initialization`. `vi.hoisted` kutusu şart.
2. **Mock senin fixture yazmalarını da yakalar.** Test dosyası `@/lib/db`'den `prisma` import
   ederse o da RLS istemcisidir → tohumlama kendi test ettiğin politikayla reddedilir
   (`42501 … "Workspace"`). Fixture'ları AYRI ayrıcalıklı bağlantıyla kur:
   `createDbClient(envValue('DATABASE_URL')!)`, ve satırları geri okurken de onu kullan.

**Why:** Dilim 1'den beri kurulan desen, sarmalayıcının değerini `where` cümlesinde arıyor; değeri
orada değil, `set_config('app.tenant_id', …)`'de. Yerelde singleton SUPERUSER olduğu için
([[fabrika-local-green-is-worthless-under-a-bypassrls-role]]) bu fark yalnız RLS rolü altında
görünür.

**How to apply:** Sarma dilimini bitirmeden: (1) sondayı RLS rolü üzerinden yaz, (2) kırmızıyı
DEĞİŞİKLİKTEN ÖNCE kaydet, (3) tek bir dosyanın sarmalayıcısını geri alıp **yalnız o dosyanın**
testlerinin kızardığını göster (dosya-bazlı bağlanma kanıtı), (4) karşı-olgusal kolu ekle (hiçbir
şey döndürmeyen bozuk bir yükleyici de "B'nin satırı yok"u sağlar).

**Playwright'ı bu iş için kanıt sayma.** Aynı kartta ölçüldü: sarmalayıcıya YANLIŞ kiracının
scope'unu verdim (`withTenant('some-other-tenant', …)`) → e2e **2 passed**, kızarmadı; çünkü
yereldeki bağlantı BYPASSRLS ve `where: { tenantId }` işi tek başına görüyor. Aynı e2e, sarılan
okuma hiç satır döndürmeyecek şekilde bozulduğunda kızarıyor. Yani e2e **regresyonu** ölçer
(ürün hâlâ çalışıyor mu), **garantiyi** değil. Raporda ikisini ayrı ayrı ve adıyla yaz.
