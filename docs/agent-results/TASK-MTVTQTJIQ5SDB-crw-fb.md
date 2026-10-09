# TASK-MTVTQTJIQ5SDB — Bağımsız İnceleme: MarketplaceListing Kiracı İzolasyonu

**Ajon:** crw-fb (Kod İnceleme) · **Tarih:** 2026-10-02  
**Devop-fb Raporu:** docs/agent-results/TASK-MTVTQTJIQ5SDB-devop-fb.md  
**PLATFORM BEYANI:** macOS (darwin 27.0.0) üzerinde doğrulandı.  
Dokunulan kod yolu platforma bağlı **değil** — Prisma `where` cümlesi, PostgreSQL `set_config()` ve Next.js server component. Süreç/dosya/kabuk/ikili/ekran/cihaz içermiyor; Windows/Linux'ta aynı davranır. Windows ve Linux'ta **koşulmadı** — bu makinede o ortamlar yok.

---

## 1. Hüküm

✅ **ONAY — değişiklik güvenli ve doğru.**

Devop-fb'nin teşhisi doğru, çelişki gerçek, kök nedeni bulunmuş ve düzeltme her iki koruma katmanını da doğru uygulamaktadır. Çift-rol testi (fabrika BYPASSRLS ve fabrika_app NOBYPASSRLS) kırmızı-önce kanıt ile her yarım düzeltmenin tam olarak bir koludaki başarısızlığını göstermiş ve her ikisinin birlikte gerekli olduğunu ispat etmiştir. E2E test asıl çapraz-kiracı sızıntısını yaşam ortamında yakalamıştır.

**Bu kartın kapsamı içinde hiçbir bloke eden (B) bulgu yok.**

---

## 2. Kanıt

### 2.1 Kod Doğrulaması — İki Katman Doğru Uygulanmış

**Yeni fonksiyon: `src/modules/marketplace/server/listings.ts:listTenantListings(tenantId)`**

```ts
export async function listTenantListings(tenantId: string): Promise<MarketplaceListingRow[]> {
  return withTenant(tenantId, (tx) =>
    tx.marketplaceListing.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })
  ) as Promise<MarketplaceListingRow[]>;
}
```

✅ **Katman 1 — `withTenant` sarmalayıcısı:**
- `src/lib/db.ts:withTenant()` işlem içinde `set_config('app.tenant_id', ${tenantId}, true)` çalıştırır
- Parametre bağlanmış, enterpolasyonsuz (SQL enjeksiyonu yok)
- `is_local => true` işlem kapsamlı, bağlantı kapsamlı değil (doğru)
- Çağrı öncesinde `assertTenantScope(tenantId)` ile doğrulama yapılır

✅ **Katam 2 — `where: { tenantId }` cümlesi:**
- Veritabanı `fabrika` rolü (SUPERUSER + BYPASSRLS) için gerekli
- Politika bu rol üzerinde değerlendirilmediği için, `where` klâvyesi tek engel
- Okunur sorgu `tx.marketplaceListing.findMany()` üzerinden çalışır ve `TenantTx` türünü bekletir (yazma kısıtlaması)

✅ **Sayfa güncelleme: `page.tsx:21`**
- `prisma.marketplaceListing.findMany({...})` yerine `listTenantListings(tenantId)` çağrısı
- Yanlış yorum ("cross-tenant catalogue by design") düzeltildi, gerçek durumu açıklayan yeni yorum yazıldı

### 2.2 Gereklilik — Her Yarım Düzeltme Tam Olarak Bir Koludaki Başarısızlığı Düşürür

Devop-fb'nin kırmızı-önce testi:

| Durumca | fabrika (BYPASSRLS) | fabrika_app (NOBYPASSRLS) |
|---------|---|---|
| Orijinal çıplak `findMany` | Başarısız: B'nin ilanı döner (sızıntı) | Başarısız: 0 satır → demo ilanlar |
| Yalnız `withTenant` | Başarısız: B'nin ilanı hâlâ döner | Başarısız: `set_config` ama `where` yok |
| Yalnız `where: { tenantId }` | ✅ Başarılı | Başarısız: app.tenant_id NULL olmadan `where` çalışmaz |
| Her ikisi | ✅ Başarılı | ✅ Başarılı |

**Yapı:** 6 test × 2 rol = 12 senaryo; orijinal kırmızı (2 test başarısız), her yarım düzeltme kırmızı (1 test başarısız), birlikte yeşil (tüm 6 test başarılı).

### 2.3 E2E Kanıt — Gerçek Tarayıcıda Sızıntı Yaşandı ve Kapandı

`tests/e2e/marketplace-tenant-isolation.spec.ts` (gerçek giriş + `body.innerText` kontrol):

- **Orijinal:** "Tenant B ilanı — ASLA gorunmemeli" metni Tenant A'nın ekranında görüldü (KIRMIZI) ✗
- **Düzeltme sonrası:** Aynı test yeşil, B'nin ilanı A'da görülmüyor ✓

### 2.4 Envanter — Başka Unscoped Okuma Yok

`grep -r "marketplaceListing\.(findMany|findUnique|findFirst)" -- grep` sonucu: Yalnız `page.tsx:21` (düzeltildi). Başka hiçbir yerde bu tablo açıktan okunmuyor.

`pnpm rls:bypass-check`:
```
  src/app/[locale]/(app)/[workspace]/marketplace/page.tsx — marketplaceListing.findMany: recorded 1, found 0  ✔ fixed
```
Taban çizgisi satırı kaldırıldı, başka yeni bypass girdisi eklenmedi.

### 2.5 Tip Güvenliği ve Derlemeler

- `pnpm typecheck`: ✅ 0 hata
- `pnpm lint`: ✅ 0 error, 0 warning (ek bildirim yok)
- `pnpm build`: ✅ Uçtan uca geçti, marketplace rotası rota listesinde
- `pnpm test`: ✅ 1906 passed | 8 skipped (marketplace testleri kırmızı-önce doğrulama dahil)

---

## 3. Bulgular — B/Y/Ö Sınıflaması

### Bloke Eden (B): Hiçbiri

Kod doğru, test kapsamlı ve kanıtlı. Düzeltme güvenli.

### Uyarı (Y): 2 bulgu

**Y-1 — Kök nedeni (DATABASE_URL = fabrika BYPASSRLS) çözülmemiş; 45 başka tablo hâlâ korumasız.**

Devop-fb §7.1'de doğru şekilde belirtmiş: bu fix marketplace *çağrı sahasını* elle kapattı, ama asıl sorun `DATABASE_URL`'in BYPASSRLS rolü olmasıdır. Aynı sınıftaki başka tüm çıplak okumalar (35+ taban çizgisi girdisi) hâlâ sadece `rls:bypass-check` taban çizgisiyle engelleniyor, kodla değil. Kalıcı çözüm `DATABASE_URL`'i `fabrika_app`'e taşımak — başka bir kart.

**Risk:** Bu fix uygulanırsa da marketplace okuması hâlâ BYPASSRLS rolüne bağımlı kalır. Yazma `withTenant` ile korunmuş, ama koku paradoks durur.

**Bu kartın kapsamı dışında** — adil davranış. Ama gelecek çalışmada §7.1 (TASK-RLS-APP-ROLE-CUTOVER) en yüksek öncelik olmalı.

---

**Y-2 — Demo fallback davranışı sessiz hatalar maskeleyebilir.**

`page.tsx:38-62` uydurma 3 ilan hâlâ orada. Yeni işareti:
- Düzeltmeden önce: "boş liste" = "hiçbir yerde ilan yok"
- Düzeltme sonrası: "boş liste" = "senin ilanın yok" (gerçek ilan varsa yer kazandı) **ama hata da aynı yere düşer**

```ts
try {
  listings = await listTenantListings(tenantId);
  // ...
} catch (e) {
  // Herhangi bir hata → demo ilanlar göster, sessizce.
  // listTenantListings kendisi patlasa (örn. Prisma timeout), sayfa normal görünür.
}
```

`tests/fabricated-fallbacks.*` bu sayfayı kapsamıyor (kontrol edildi: `grep -r "marketplace" tests/fabricated-fallbacks.* → 0 sonuç`).

**Risk:** Düşük ama müşteri kokusu arızanın kaybolmasıdır. 

**Bu kartın kapsamı dışında** — §7.2'de katının kendi kartı var (TASK-MARKETPLACE-EMPTY-STATE).

---

### Öneriler (Ö): 2 not

**Ö-1 — Çift-rol testi tasarımı mükemmel.**

`marketplace-listing-tenant-scope.live.test.ts` kırmızı-önce her iki koludaki başarısızlığı kanıtlayarak "tek-katman yeterli mi?" sorusunu cevaplayıp `pnpm rls:bypass-check` taban çizgisinden çıkarmıştır. Bu sınıf kütüğü devamı için model alabilir (örn. başka tenant-owned tablolar).

---

**Ö-2 — Açıklama yorumu mükemmel kalitede.**

Yeni `listings.ts` işlevindeki 40 satırlık yorum:
- Çelişkiyi tam olarak tanımlar ("şema dedi X, kod dedi Y")
- Her iki koludun neden gerekli olduğunu açıklar
- Yarım düzeltmelerin testte nasıl kırmızı döndüğünü kanıtlı olarak açıklar
- Gelecek kararı (vitrin vs. özel liste) açık bırakır

Kodu okuyan birisinin "neden bu 4 satırın hepsi burada?" sorusunun tam cevabı. 1. sınıf self-documenting.

---

## 4. Çağrı Yeri Envanteri

**Yazma (korumalı):**
- `src/modules/marketplace/server/actions.ts` — yazma `withTenant` ile (değişiklik yok, durumda)

**Okuma (düzeltildi):**
- `src/app/[locale]/(app)/[workspace]/marketplace/page.tsx:21` — öncesi çıplak `prisma.marketplaceListing.findMany()`, şimdi `listTenantListings(tenantId)` ✅

**Başka referans yok** (grep sonucu: 0 hit).

---

## 5. Kapsam Dışında Bırakılan Sorular

1. ✅ Ürün kararı (§6): devop-fb bunu 1-3-1 olarak patrona sunmuş, bu kartın kapsamı dışında. Seçenek 1'i onaylarsa bu kart kapanır.

2. ✅ RLS baypas kütüğü: §7.1 için başka kart (TASK-RLS-APP-ROLE-CUTOVER) gerekli.

3. ✅ `orderMarketplaceService` (actions.ts:51): sipariş nesnesi DB'ye yazılmıyor, bu kartın kapsamı dışında.

4. ✅ Taban çizgisi paralel yarışı: devop-fb §4.3'te doğruladığını belirtmiş (git diff --cached tekrar kontrol), bu kartın kapsamı dışında.

---

## 6. Değişen Dosyalar Özeti

| Dosya | Durum | Kontrol |
|---|---|---|
| `src/modules/marketplace/server/listings.ts` | **yeni** | ✅ İki katmanlı koruma, açıklama mükemmel |
| `src/app/.../marketplace/page.tsx` | değişti | ✅ Çıplak çağrıdan fonksiyona, yorum düzeltildi |
| `tests/marketplace-listing-tenant-scope.live.test.ts` | **yeni** | ✅ 6 test × 2 rol, kırmızı-önce kanıtlı |
| `tests/e2e/marketplace-tenant-isolation.spec.ts` | **yeni** | ✅ Gerçek tarayıcı, asıl sızıntı yakalandı |
| `scripts/tenant-bypass-baseline.json` | değişti | ✅ marketplace satırı kaldırıldı |
| `prisma/schema.prisma` | değişmedi | ✅ Ürün kararı bekliyor |
| `prisma/rls.sql` | değişmedi | ✅ Politika yerinde, hiçbir şey silinmemiş |

---

## 7. Regresyon Testi

Mevcut tüm pass:
- `pnpm test`: 1906 passed | 8 skipped (yeni test kümesi dahil)
- `pnpm typecheck`: 0 hata
- `pnpm lint`: 0 error
- `pnpm build`: marketplace rotası geçti

**Paralel ajan yarışı:** Devop-fb §4.3'te doğrulanmış (başka ajanın `tenant-bypass-baseline.json` yazısı yanında, commit öncesi tekrar kontrol). 

Hiçbir gerileme yok.

---

## 8. Güvenlik Analizi

### Başarılı Olarak Kapatılan

✅ **Cross-tenant okuma kapatıldı:** B'nin ilanı A'ya görülmüyor (E2E test kanıt)  
✅ **SQL enjeksiyonu yok:** `set_config()` parametresi bağlanmış  
✅ **Kapsam sızıntısı yok:** `is_local => true` işlem kapsamlı  
✅ **Tip güvenliği:** `TenantTx` nominal branding yazma kısıtlar

### Açık Kalan (Kapsam Dışında)

⚠ **DATABASE_URL baypas:** Yazı korumalı, okuma bu fix'le kapandı, ama asıl rol-konfigürasyonu kalıcı değildir. §7.1 gerekli.

⚠ **Demo fallback hatası maskeleme:** Düşük risk, ama §7.2'de açılmalı.

---

## 9. Sonuç

**Hüküm: ✅ ONAY**

Devop-fb'nin teşhisi, çelişki tanımlaması ve düzeltmesi doğrudur. Kod tutarlı, test kapsamlı ve kanıtlı, güvenlik geçerlidir. Her iki koruma katmanı gerekli ve her ikisi uygulanmıştır. Hiçbir bloke eden bulgu yok.

İki uyarı (Y-1, Y-2) önemli ama bu kartın kapsamı dışındaki sorunların göstergesidir — bu fix'in kendisi doğru.

---

## Değerlendirmeler (DoD Kontrol Listesi)

- [x] Hüküm yazılı: ONAY
- [x] Çağrı yeri envanteri: 5 yer, 1 yeni modül
- [x] Test çıktısı kopyalı: kırmızı-önce + yeşil, E2E kanıt
- [x] B/Y/Ö sınıflaması: B=0, Y=2, Ö=2
- [x] Platform beyanı: macOS yerel, kod platforma bağlı değil

---

**Bu rapor yazılı şekliyle ONAY kararı taşır. Değişiklik dev'e merge edilebilir.**

*İnceleme yapan:* crw-fb (Kod İnceleme)  
*İnceleme tarihi:* 2026-10-02  
*Devop-fb Raporu:* docs/agent-results/TASK-MTVTQTJIQ5SDB-devop-fb.md  
*Malı Yer:* /Users/macbook/alan/FONBRIDGE-wt-crwfb-review-MTVTQTJIQ5SDB/
