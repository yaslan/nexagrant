# TASK-MTSY71BUMBLWM — Bağımsız Doğrulama

**HÜKÜM: KAPANABİLİR.**

Kartın kendi kapsamı (fatura alıcı kimliğini dolduran ekran) için tüm iddialar koddan ve canlı
koşulardan doğrulandı; kod DEĞİŞTİRİLMEDİ, yalnız okundu ve mevcut testler/kapı komutları koşuldu.
Ayrı bir bulgu var (aşağıda §5) — TASK-MTSY71BUMBLWM'i KAPATMIYOR ama iki komşu kartı ilgilendiriyor
ve raporlanması gerekiyor.

**Platform beyanı: mac (Darwin 25.6.0).** Doğrulama tamamen bu makinede yapıldı: `pnpm typecheck`,
`pnpm test`, `pnpm rls:check`, `pnpm rls:verify` (gerçek Postgres bağlantısı), `tsc --traceResolution`
ve statik kod okuması. e2e'yi (Playwright/Chromium) BEN yeniden koşmadım — bkz. §4. Bu kartta
platforma bağlı hiçbir kod yolu yok (süreç öldürme, kabuk/ikili adı, dosya yolu, ekran/DPI, mikrofon/
kamera izni geçmiyor); Next.js server action/server component + Postgres. Linux/Windows'ta farklı
davranması beklenmez.

---

## 1. Yöntem

1. `docs/agent-results/TASK-MTSY71BUMBLWM-geli-tirici.md` raporunu uçtan uca okudum.
2. Board'da kartı `list_tasks` ile buldum (`[review]`, sprint SPRINT-S12, proje agentdesk). **Not:**
   elimdeki araç seti kart açıklamasının tam gövdesini (DoD kutuları dahil) döndürmüyor — yalnız
   başlık dönüyor. Bu yüzden "işaretli kutunun içine bak" talimatını, geliştiricinin raporunda
   alıntıladığı (a)–(f) maddelerini kaynak koda karşı tek tek ölçerek yerine getirdim; kartın ham
   markdown'ını göremedim. Bu bir sınırlama olarak burada açıkça yazılıyor — sessizce atlanmadı.
3. Her iddiayı ilgili dosyayı okuyarak, gerekirse `grep`/programatik karşılaştırmayla doğruladım.
4. `pnpm typecheck`, `pnpm test` (tam paket), ilgili birim testleri tek başına, `pnpm rls:check`,
   `pnpm rls:verify` koştum. Hiçbiri kod değiştirmedi.

## 2. Ekran gerçekten var mı ve gerçekten yazıyor mu?

**Evet.** Beş dosya okundu, hepsi gerçek (iskelet/mock değil):

- `src/lib/billing/billing-identity.ts` — saf doğrulama. `BillingIdentityShape` (Zod) şekil
  kontrolü yapıyor; VKN 10 / TCKN 11 hane ayrımı ve checksum `src/lib/efatura.ts`'teki
  `validateVKN`/`validateTCKN`'i çağırıyor (kopyalanmamış — `grep` ile doğrulandı). `buyerCountry`
  `findCountryVatRate` ile VAT tablosuna karşı doğrulanıyor; tabloda olmayan ülke reddediliyor.
  `maskVknTckn` son 4 haneyi bırakıp geri kalanını `•` yapıyor.
- `.../settings/billing/identity-actions.ts` — **asıl yazıcı**, `'use server'`. Sırasıyla:
  `requireTenantAction()` → session'dan `tenantId`/`role` (client'tan GELMİYOR, spoof edilemez) →
  `can(role, 'manage_billing')` kapısı → `parseBillingIdentity(input)` (sunucu tarafı Zod +
  alan kuralları) → `withTenant(tenantId, tx => tx.tenantBillingIdentity.upsert(...))`. Validasyon
  başarısız olursa hiçbir DB çağrısı yapılmıyor; hata gövdesi yalnız `{field, code}` taşıyor, girilen
  değeri asla taşımıyor.
- `.../settings/billing/page.tsx` — okuma kapısı yazma kapısıyla **birebir aynı** kontrolü
  (`can(role, 'manage_billing')`) kullanıyor; kapıyı geçemeyen rolün payload'ına
  `identityOnFile` hiç girmiyor (koşullu olarak `if (canEditIdentity)` bloğunun içinde okunuyor).
  Sunucuda maskelenmiş değer (`maskVknTckn`) sayfaya geçiyor; ham VKN/TCKN hiçbir yerde
  serialize edilmiyor.
- `.../settings/billing/BillingIdentityForm.tsx` — istemci formu; `ERROR_KEY` haritası
  `BillingIdentityIssue['code']` üzerinde `Record<...,...>` tipiyle tanımlı, yani derleyici altı
  hata kodunun hepsinin bir i18n karşılığı olmasını zorluyor (eksik anahtar tip hatası verir).
- `.../settings/billing/BillingClient.tsx` — forma çapa bağlantısı (+7 satır), kozmetik.

**Sonuç:** kart hiçbir yerde iddia edip kodda karşılığı olmayan bir şey söylemiyor. Yazıcı gerçek,
tek bir kod yolundan geçiyor, mock/placeholder değil.

## 3. Zod, `withTenant`, RBAC — tek tek ölçüldü

| İddia | Ölçüm | Sonuç |
|---|---|---|
| Sunucu tarafı Zod doğrulaması var mı | `identity-actions.ts:79` → `parseBillingIdentity(input)` → içeride `BillingIdentityShape.safeParse(input)` (Zod). Şekil geçmezse alan-bazlı hata dönüyor, DB'ye hiç gidilmiyor. | ✅ var |
| `tenantId` `withTenant` üzerinden mi geçiyor | `identity-actions.ts:87` → `withTenant(tenantId, tx => tx.tenantBillingIdentity.upsert(...))`; `tenantId` `requireTenantAction()`'dan (`src/lib/tenant.ts:90-92`) geliyor, o da `auth()` session'ından — **request body'den değil**. `withTenant` imzası `src/lib/db.ts:186-191`, `withTenantOn(prisma, tenantId, cb)`'yi sarmalıyor. | ✅ evet, spoof edilemez |
| RBAC okuma=yazma simetrisi | `page.tsx` ve `identity-actions.ts` **aynı** `can(role, 'manage_billing')` çağrısını kullanıyor; `src/lib/rbac.ts:16-29` `manage_billing`'i yalnız `TENANT_OWNER`'a veriyor, `TENANT_ADMIN`'e vermiyor (satır 30-40 ile karşılaştırıldı). | ✅ doğrulandı |
| RLS ikinci kilit | `prisma/schema.prisma:418-429` `TenantBillingIdentity` — `tenantId @id`. `pnpm rls:check`: 45 kiracı tablosu arasında `TenantBillingIdentity` **var**, migration'ı `ENABLE+FORCE+tenant_isolation` taşıyor (CHECK 4b geçti). `pnpm rls:verify` (canlı DB, `fabrika_app` rolüyle, `rolbypassrls=false`): 45 tabloda okuma/yazma sınırında GERÇEK ret ölçüldü (negatif okuma, pozitif okuma, negatif yazma, pozitif yazma, çapraz yazma — hepsi beklenen sonucu verdi). | ✅ hem deklare hem canlı ölçülü |

## 4. i18n

Python ile `messages/tr.json` ve `messages/en.json`'daki `billingPanels.settings` alt anahtarları
karşılaştırıldı: `identity*` önekli **31 anahtar TR'de, 31 anahtar EN'de**, kümeler birebir eşit
(fark kümesi boş her iki yönde de). Form gömülü metin kullanmıyor — hepsi `t('identity...')`
üzerinden (`BillingIdentityForm.tsx` içinde `useTranslations('billingPanels.settings')`).
Rapordaki "31 anahtar × 2 dil, tam" iddiası doğru.

Ekranı bizzat AÇMADIM (dev sunucusu :3000'de başka bir pane'e ait bir süreç tarafından işgal
edilmişti — bkz. §4 alt not); bunun yerine geliştiricinin bıraktığı gerçek ekran görüntülerini
inceledim: `02-invalid-vkn-rejected.png` kırmızı çerçeveli VKN alanı ve *"Girilen numara geçerli bir
VKN/TCKN değil."* metnini, `05-non-owner-locked.png` kilit ikonlu salt-okunur paneli gösteriyor —
iki kare de Türkçe metnin gerçekten ekrana çıktığını doğruluyor, uydurma değil.

**e2e'yi neden yeniden koşmadım:** `lsof -i :3000` başka bir PID'in (muhtemelen komşu bir pane'in
dev sunucusu) portu dinlediğini gösterdi; `playwright.config.ts` `reuseExistingServer: false` ile
kendi sunucusunu aynı porta açmaya çalışır, bu da o pane'in sunucusuyla çakışır. Görev talimatı
zaten yalnız `pnpm typecheck` ve **ilgili birim testleri** istiyordu, e2e'yi değil; e2e kanıtını
diskteki ham log + 5 ekran görüntüsünü inceleyerek doğruladım (aşağıda).

## 5. Kapı komutları — kendim koştum

```
$ pnpm typecheck            → çıktı yok (0 hata)
$ pnpm vitest run tests/billing-identity.test.ts tests/billing-identity-action.test.ts src/lib/iyzico.test.ts
  Test Files  3 passed (3) · Tests  54 passed (54)
$ pnpm test                 → Test Files 149 passed | 2 skipped (151) · Tests 1796 passed | 8 skipped (1804)
$ pnpm rls:check             → 45/45 model, CHECK 4b geçti
$ pnpm rls:verify (canlı DB) → fabrika_app rolüyle izolasyon GERÇEKTEN ölçüldü, 45/45 politika yerinde
```

(Rapordaki "1795 passed" ile benim ölçtüğüm "1796 passed" arasındaki 1 testlik fark, aynı gün
içinde başka bir kartın eklediği bir testten kaynaklanıyor olabilir — kaygı verici değil, ilgili
üç dosyanın kendi testleri birebir 54/54 geçti.)

**Stale-Prisma-client kontrolü** ([[fabrika-prisma-client-has-three-copies]] hafıza notuna göre
"typecheck 0 hata" tek başına kanıt değil): `tsc --traceResolution` ile TypeScript'in fiilen hangi
`.prisma/client/index.d.ts` dosyasını çözdüğünü izledim — `db:generate`'in yazdığı **aynı** taze
kopya (`grep -c tenantBillingIdentity` → 29 eşleşme). Yani typecheck'in temiz çıkması burada gerçek
bir kanıt; eski/görünmez bir istemciye karşı doğrulanmış sahte bir yeşil değil.

## 6. (f) kararı — alarm konsolu

Kararın kendisini (kimlik girilince açık `invoice_buyer_identity_missing` alarmları kapanmasın)
tekrar ölçmedim ama gerekçesindeki üç iddiayı okudum ve tutarlı buldum: `SystemAlert`'in gerçekten
`tenantId` sütunu yok (`prisma/schema.prisma`'da doğrulandı, id yalnız `meta` JSON içinde) ve
gerçekten RLS'siz — bu iki teknik gerekçe koda karşı doğru. Orantı ölçümünü (234 açık satırdan
1'i yaşayan kiracıya ait) yeniden koşmadım çünkü bu TASK-MTTUUGKNDGBXK'nin kapsamı; kararın
kendisi bu kartın DoD'unda "sahiplenildi ve gerekçelendi" olarak görünüyorsa yeterli.

## 7. Ayrı bulgu — bu kartı KAPATMIYOR ama bildirilmesi gerekiyor

Görev talimatı doğrulama kanıtı olarak commit `14c04f3`'e bakmamı istiyordu ("iyzico çağrısı artık
uydurma varsayılan kimlik kullanmıyor mu"). Baktım ve **commit mesajı ile commit içeriği
uyuşmuyor**:

- `14c04f3`'ün mesajı: *"fix(billing): require buyer identity from TenantBillingIdentity for
  iyzico"* — ve gövdesi `createIyzicoCheckout`'un artık `buyer.identityNumber` zorunlu kıldığını,
  varsayılan `'11111111111'`'i kaldırdığını anlatıyor.
- `git show 14c04f3`'ün **gerçek diff'i**: `messages/{tr,en}.json` + `admin/alerts/client.tsx` +
  `admin/alerts/page.tsx` — yani alarm konsolunun 300 satır kesme/gerçek sayı gösterme düzeltmesi
  (`totalCount`/`unresolvedCount`/`isTruncated` prop'ları). `src/lib/iyzico.ts`'e hiç dokunmuyor
  (`git show 14c04f3 -- src/lib/iyzico.ts` boş döndü; `git log -- src/lib/iyzico.ts` bu commit'i
  hiç listelemiyor).
- Bu görevin başında alınan `git status` çıktısında `src/lib/iyzico.ts` ve `src/lib/iyzico.test.ts`
  **hâlâ `M` (commit'lenmemiş, çalışma ağacında)** olarak duruyor — ve `git diff` bu dosyalarda
  tam olarak commit mesajının anlattığı değişikliği gösteriyor (`identityNumber: buyer.identityNumber
  ?? '11111111111'` → zorunlu hale getirildi, `if (!buyer.identityNumber) throw`).

Yani: **gerçek düzeltme çalışma ağacında var ve doğru** (bu haliyle iyzico artık uydurma VKN
göndermez) ama **hiçbir commit'te değil** — bir yerlerde staging/commit adımı karışmış, doğru
mesajla yanlış dosyalar commit'lenmiş. Bu iki kartı ilgilendiriyor:

- **TASK-MTSY7HZRYWWEL** (board'da `[done]`) — "done" durumunun dayandığı commit aslında bu işi
  yapmıyor; iş çalışma ağacında commit'lenmeden duruyor. Biri `git stash`/`git checkout --` ya da
  bir `git clean` çalıştırırsa **sessizce geri döner** ve hiçbir test bunu yakalamaz (test dosyası
  da aynı commit'lenmemiş diff'in içinde — ikisi birlikte kaybolur).
- **TASK-MTVFKK8UZS5BF** (board'da `[review]`, "Alarm konsolu 300 satırı geçince sessizce yalan
  söyleyecek") — bu kartın gerçek düzeltmesi zaten commit'lenmiş ama **yanlış commit mesajının
  altında** duruyor; kimse "bu kartın commit'i nerede" diye `git log -- admin/alerts` aramadıkça
  bulamaz.

Bunu düzeltmedim (talimat: kod DEĞİŞTİRME). Öneri: `src/lib/iyzico.ts` + `src/lib/iyzico.test.ts`
doğru mesajla ayrı bir commit olarak işlensin; TASK-MTSY7HZRYWWEL'in "done" durumu bu commit
girene kadar sorgulanmalı.

## 8. Riskler / açık kalanlar (devraldığım, değiştirmediğim)

Geliştiricinin raporundaki §5 ve §6 (demo-tenant e2e temizliği, 27 AB ülkesinin VAT rejimi
belirsizliği, geriye dönük faturalama, TENANT_ADMIN'in kimliği görememesi) aynen geçerli — bunlar
ürün kararı bekleyen açık sorular, bu kartın DoD'unu bloklamıyor.

## 9. Hüküm

TASK-MTSY71BUMBLWM'in kendi kapsamı — ekran, sunucu doğrulaması, yetki, RLS, i18n, testler —
**uçtan uca doğrulandı ve koddan/canlı koşulardan destekleniyor. KAPANABİLİR.**
§7'deki bulgu ayrı, komşu iki karta yönlendirilmeli.
