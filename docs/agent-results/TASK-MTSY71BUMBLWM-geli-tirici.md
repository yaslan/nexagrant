# TASK-MTSY71BUMBLWM — the screen that fills `TenantBillingIdentity` in

**Platform beyanı: mac (darwin 25.6.0).** Doğrulama tamamen macOS'ta yapıldı — dev sunucusu,
Chromium e2e, Postgres RLS ölçümü. Bu kartta platforma bağlı hiçbir kod yolu yok: süreç öldürme,
kabuk/ikili adı, dosya yolu, ekran/DPI ya da cihaz izni kullanılmıyor. Değişen her şey Next.js
server component / server action / saf TypeScript ve Postgres. Linux ve Windows'ta koşulmadı;
kodda platforma göre dallanan bir satır olmadığı için farklı davranması beklenmiyor.

Devralınan bir karttı. Selefinin pane'i limit yüzünden öldü, ama ağaçta ciddi iş bıraktı.
Aşağıda **ne devraldığım** ile **ne değiştirdiğim** ayrı yazılıdır.

---

## 1. Ne yapıldı

### 1.1 Devralınan iş (selefin yazdığı, benim yazmadığım)

Kart üç dosya devredildiğini söylüyordu. Ağaçta **beş** tane vardı — kartın saymadığı ikisi
sunucu action'ı ve iki birim test dosyasıydı:

| Dosya | Durum | Kartta anılmış mı |
|---|---|---|
| `src/lib/billing/billing-identity.ts` | yeni, saf doğrulama + `maskVknTckn` | evet |
| `.../settings/billing/BillingIdentityForm.tsx` | yeni, istemci formu | evet |
| `.../settings/billing/page.tsx` | +75 satır, okuma kapısı | evet |
| `.../settings/billing/identity-actions.ts` | **yeni, asıl yazıcı** | hayır |
| `tests/billing-identity.test.ts` | **yeni, 22 saf birim testi** | hayır |
| `tests/billing-identity-action.test.ts` | **yeni, 9 action testi** | hayır |
| `.../settings/billing/BillingClient.tsx` | +7 satır, forma çapa bağlantısı | hayır |
| `messages/{tr,en}.json` | +40 satır, 31 anahtar × 2 dil | hayır (çakışma uyarısı vardı) |

Kartın (a)–(e) maddeleri **zaten karşılanmıştı**. Yeniden yazmadım; ölçtüm:

- **(a) şema/beklenen alanlar:** `TenantBillingIdentity` `prisma/schema.prisma:418`, `tenantId` birincil
  anahtar. `invoice-writer.ts:377` altı alanı da okuyor. Kayda değer ayrıntı: `REQUIRED_BUYER_FIELDS`
  (`invoice-writer.ts:99`) **beş** alan — `buyerCountry` listede yok, çünkü ülke ayrı bir kapıdan
  (`resolveVatRate` → `invoice_vat_country_unknown`) geçiyor. Form ülkeyi yine de zorunlu tutuyor;
  bu daha sıkı ve doğru: ülkesiz kaydedilen kimlik yine fatura üretmez.
- **(b) VKN 10 / TCKN 11:** `validateVKN` / `validateTCKN` `src/lib/efatura.ts:250,275`'ten çağrılıyor,
  kopyalanmamış. Uzunluk hangisinin uygulanacağını seçiyor.
- **(c) `withTenant`:** `identity-actions.ts` `withTenant(tenantId, tx => …)` kullanıyor — `src/lib/db.ts:186`
  imzasıyla birebir. (CLAUDE.md'de `withTenant(prisma, tenantId)` yazıyor; kodda o imza `withTenantOn`
  olmuş. Koda uydum.)
- **(d) i18n:** 31 anahtar, `billingPanels.settings` altında, iki dilde de tam. Gömülü metin yok.
- **(e) TCKN gizliliği:** hata kodları alan+kural taşıyor, değer taşımıyor; `maskVknTckn` sunucuda
  uygulanıyor; form yeniden yüklendiğinde numara alanı boş geliyor.

**Devralınan iş bir hipotezdir** — ve iki yerde tutmadı (§1.2).

### 1.2 Benim değiştirdiğim

**(i) Kapıyı kırmızı tutan tip hatasını düzelttim.** `tests/billing-identity-action.test.ts` içindeki
`vi.fn(async () => ({}))` argümansız olduğu için `mock.calls[0][0]` boş demet indeksi oluyordu —
`pnpm typecheck` dört hata veriyordu ve **hepsi bu tek dosyadaydı**. Mock'u argümanıyla tipledim,
gereksiz `as` dönüşümlerini attım. Testin iddiası değişmedi; sadece derlenir oldu.

**(ii) Uydurma istatistiği düzelttim.** `identity-actions.ts` başlık yorumu *"217 of the 250 open
operator alerts"* diyordu. Ölçülen kanıt dosyası
(`TASK-MTTUUGKNDGBXK-evidence/01-alert-pile-before.txt`) **106 satır, 82'si (%77.4)** diyor. 217/250
diye bir ölçüm hiçbir yerde yok. Gerçek rakamla ve kaynak dosya yoluyla değiştirdim. CLAUDE.md §7:
ekrana çıkan rakam kanıda bağlı olacak — yorumdaki rakam da öyle olmalı.

**(iii) (f) kararını verdim ve gerekçesini koda yazdım.** Aşağıda §2.

**(iv) Gerçek tıklamalı e2e yazdım** — `tests/e2e/billing-identity-form.spec.ts`, 4 test. Devralınan
işin hiç koşulmamış olduğu yer burasıydı: birim testler veritabanını mock'luyor, dolayısıyla ne
ekranın reddi ne de yük sızıntısı onlarla görülebilir.

**(v) Sızıntı testinin gerçekten ısırdığını kanıtladım** (kontrollü deney, §3.4).

---

## 2. Karar: kimlik kaydedilince açık alarmlar kapanmalı mı? → **Hayır**

Kartın (f) maddesi. Hüküm ve gerekçe `identity-actions.ts` başlığına yazıldı; özeti:

1. **Alarm "bu kiracının kimliği yok" demiyor.** "Ödeme alındı ve karşılığında fatura kesilemedi"
   diyor. Formu bugün doldurmak dünkü faturayı kesmiyor. Alarmı kapatmak, para girip belge
   çıkmadığının **tek kaydını** silmek olurdu. O kayıt bir sıkıntı değil, bir yükümlülük.
2. **Zaten konsolu boşaltmazdı.** Ölçtüm: bu kaynaktan açık 226 (ikinci okumada 234) satırın
   **hepsi** `meta.tenantId` taşıyor ve **tam olarak biri** hâlâ var olan bir kiracıyı gösteriyor.
   Kalanı silinmiş e2e kiracılarının yetimleri; bu action onlara hiçbir zaman erişemez. Mutlak sayı
   her e2e koşusuyla artıyor, oran artmıyor. Yığın bir **saklama/temizlik** sorunu ve alarm konsolu
   kartına (TASK-MTTUUGKNDGBXK) ait.
3. **Sınır ihlali olurdu.** `SystemAlert`'in RLS politikası yok ve `tenantId` sütunu yok (id sadece
   `meta` içinde). Kiracı kapsamlı bir action'ın kapsamsız platform tablosuna yazması, göremediği
   satırlara uzanmak demek. Ayrıca `system-alert.ts` çözümlemeyi bilinçli olarak **operatör
   hareketi** sayıyor: çözümlemek tekrar-penceresini kapatır, böylece nüksedan arıza yeni satır
   olarak geri gelir.

Kiracıya bunun yerine **eylem anında doğru** söyleniyor: panel kimliğin eksik olduğunu, bir sonraki
ödemeden **önce** söylüyor — bu ekranın hâlâ kurtarabileceği tek ödeme o.

---

## 3. Kanıt

Hepsi mac'te, gerçek tarayıcı ve gerçek veritabanıyla. Ham çıktılar:
`docs/agent-results/TASK-MTSY71BUMBLWM-evidence/`.

### 3.1 Kapı (`02-gate-typecheck-lint-test.txt`)

```
$ pnpm typecheck
$ tsc --noEmit                       ← çıktı yok = temiz (devraldığımda 4 hata veriyordu)

$ pnpm lint
$ eslint                             ← çıktı yok = temiz

$ pnpm test
 Test Files  149 passed | 2 skipped (151)
      Tests  1795 passed | 8 skipped (1803)
```

Kapı, başka ajanların commit'leri HEAD'i `7fea439`'a taşıdıktan **sonra** bir kez daha koşuldu;
aynı sonuç.

### 3.2 Gerçek tıklamalı e2e (`03-e2e-identity-form.txt`)

Depoya işlenmiş `playwright.config.ts` ile, kendi dev sunucusunu :3000'de ayağa kaldırarak:

```
  ✓  1 an owner with no identity on file is told so, and given the form (2.6s)
  ✓  2 a VKN whose check digit does not hold is refused, and nothing is written (1.6s)
  ✓  3 a valid identity is stored, normalised, and read back masked (2.6s)
  ✓  4 a member who may not edit it never receives the number (1.5s)

  4 passed (11.9s)
```

Kartın istediği dört adımın karşılığı:

| Kartın istediği | Test | Kare |
|---|---|---|
| Ekranı aç | 1 — form görünür, "kimlik kayıtlı değil" uyarısı | `01-owner-empty-form.png` |
| Geçersiz VKN reddedilmeli | 2 — alan altında Türkçe hata **+ DB'de 0 satır** | `02-invalid-vkn-rejected.png` |
| Geçerli veriyle DB satırı | 3 — banner + `buyerVknTckn='1000000000'`, `'Maslak  Vergi Dairesi'`→`'Maslak Vergi Dairesi'`, `buyerCountry='TR'` | `03-valid-identity-saved.png`, `04-identity-on-file-masked.png` |
| TENANT_OWNER olmayan rolde payload'da VKN/TCKN olmamalı | 4 — `alice@fabrika.test` (PIPELINE_MANAGER): kilitli panel, kaydet düğmesi yok, **`page.content()` içinde numara yok** | `05-non-owner-locked.png` |

Test 2 ve 3 sadece ekrana bakmıyor: reddedilen gönderimden sonra `prisma...count()` ile **0 satır**,
kabul edilen gönderimden sonra satırın kendisi okunuyor. Test 4 `innerText` değil `page.content()`
okuyor — yani RSC yükü de dahil tüm belge; CSS ile gizlenmiş bir bölüm bu testi geçemez.

Kareler gerçek: `02` ekranında kırmızı çerçeveli alan ve *"Girilen numara geçerli bir VKN/TCKN
değil."*, `04` ekranında `••••••0000` ve boşalmış numara alanı görünüyor.

### 3.3 Kiracı izolasyonu (`04-rls-identity-isolation.txt`)

`pnpm rls:verify` — 45 kiracı tablosunda politika yerinde, ölçüm **`fabrika_app`** rolüyle
(`rolbypassrls=false`) yapıldı. Üstüne `TenantBillingIdentity`'ye özel hedefli ölçüm:

```
measuring role: { current_user: 'fabrika_app', bypass: false }
own context (demo-tenant) sees: 1 [ { tenantId: 'demo-tenant', buyerVknTckn: '1000000000' } ]
OTHER tenant context (cmtrhjys10001ncxk13gwtbcb) sees: 0 []
no tenant context sees: 0
✅ TenantBillingIdentity: own=1, cross-tenant=0, unscoped=0 — isolation holds
(probe row rolled back)
```

Yani başka kiracının kimlik satırı okunamıyor — iddia değil, ölçüm. Sonda geri alındı.

### 3.4 Kontrollü deney: sızıntı testi gerçekten ısırıyor mu? (`06-control-experiment.txt`)

Düşemeyen test bir şey kanıtlamaz. `page.tsx`'teki okuma kapısını geçici olarak kaldırdım
(`if (canEditIdentity)` → `if (true)`) ve aynı spec'i yeniden koştum:

```
  ✓  1 … ✓  2 … ✓  3 …
  ✘  4 a member who may not edit it never receives the number
    Error: the VKN reached a member in its masked form
```

Kapı hemen geri kondu (`git diff` doğruluyor; deney işaretçisi ağaçta yok). İki şey öğretti:

- Test **gerçekten** kapıyı ölçüyor, sahne dekoru değil.
- Düşen iddia vergi dairesi, numara değil: `maskVknTckn` sayesinde ham VKN kapı olmasa bile
  tarayıcıya inmiyor — ama kimliğin geri kalanı (unvan, vergi dairesi, adres) iniyor. **İki katman
  var ve ikisi de gerekli.** Selefin `page.tsx`'e yazdığı niyet ("hidden section still ships the
  data it hides") doğrulandı ve sınırı da ölçüldü.

### 3.5 (f) kararının dayanağı (`05-alert-orphan-measurement.txt`)

```
IDENTITY ROWS: 0 []
identity-missing open: 234; carrying a tenantId: 234; whose tenant STILL EXISTS: 1 (distinct 1)
live tenants named in alerts: [ 'demo-tenant' ]
```

---

## 4. Değişen dosyalar

Benim yazdığım / değiştirdiğim:

- `tests/e2e/billing-identity-form.spec.ts` — **yeni**, 4 gerçek tarayıcı testi.
- `tests/billing-identity-action.test.ts` — mock tiplemesi düzeltildi (kapıyı açan tek değişiklik).
- `src/app/[locale]/(app)/[workspace]/settings/billing/identity-actions.ts` — uydurma istatistik
  düzeltildi; (f) kararı ve gerekçesi eklendi. **Davranış değişmedi**, yalnız yorum.
- `docs/agent-results/TASK-MTSY71BUMBLWM-evidence/` — ham çıktılar + iki ölçüm betiği.
- `docs/agent-results/TASK-MTSY71BUMBLWM-screenshots/` — 5 kare.
- `docs/agent-results/TASK-MTSY71BUMBLWM-geli-tirici.md` — bu dosya.

Selefinden devralıp **olduğu gibi** commit'lediklerim (üstünde iş yapmadım, ölçtüm):

- `src/lib/billing/billing-identity.ts`, `.../BillingIdentityForm.tsx`, `.../page.tsx`,
  `.../BillingClient.tsx`, `tests/billing-identity.test.ts`.

`messages/{tr,en}.json`: **ben commit'lemedim.** Kart bu dosyalarda başka bir worker'la çakışma
uyarısı veriyordu; ben dokunmaya geldiğimde `git diff` boştu — selefin 31 anahtarı zaten başka bir
ajanın geniş commit'iyle ağaca girmişti (bkz. `7fea439 "a bare git commit in a shared tree lands
someone else's files"`). Anahtarlar HEAD'de mevcut ve iki dilde de tam; doğruladım.

---

## 5. Riskler

1. **`demo-tenant` üzerinde e2e yazıp siliyor.** Spec `beforeAll`/`afterAll` ile yalnız
   `demo-tenant`'ın kimlik satırını siler. Bugün hiçbir kiracıda kimlik satırı yok (ölçüldü: 0),
   dolayısıyla silinecek gerçek veri yok. Ama demo kiracıya **gerçek** bir kimlik girilirse bu spec
   onu silecektir. Fatura geçmişi spec'i bu riski `test.skip` ile çözüyor; buraya aynı korumayı
   koymadım çünkü kimlik satırı faturanın aksine tekil ve yeniden girilebilir — yine de bilinsin.
2. **VAT rejimi belirsiz ülkeler.** Form 29 ülkeyi listeliyor ama 27 AB satırı `regime: 'unknown'`;
   bunlar kaydedilir, fatura yine kesilmez. Form bunu kayıttan **önce** söylüyor
   (`identityCountryPendingHint`) ve kaydedince sarı banner veriyor — ama kullanıcı yine de fatura
   alamaz. Gerçek çözüm mali müşavir hükmü, bu kartın kapsamı dışında.
3. **`invoice_buyer_identity_missing` yığını duruyor** ve büyümeye devam edecek (§2). Bu bilinçli.
   Konsolu boşaltmak TASK-MTTUUGKNDGBXK'nin işi.
4. **Prompt/gizlilik:** TCKN hiçbir yerde loglanmıyor, hata mesajında yankılanmıyor, sunucudan
   maskesiz çıkmıyor. Testlerde gerçek görünümlü TCKN **kullanmadım** — yalnız 10 haneli sahte VKN
   (`1000000000`, `playwright.config.ts`'in tedarikçi tarafında zaten kullandığı numara).

---

## 6. Açık sorular

1. **Kimlik girildikten sonra eski ödemelerin faturası kesilecek mi?** Bu ekran ileriye dönük
   çalışıyor: bir sonraki ödemenin faturası kesilebilir hale geliyor. Geriye dönük "ödendi ama
   faturalanmadı" kayıtları için bir toplu düzeltme işi **yok** ve bu kartta istenmedi. §2'deki
   karara göre alarmlar da açık kalıyor — yani o iş görünür duruyor, ama sahibi yok. Kart açılmalı.
2. **`TENANT_ADMIN` gerçekten kimliği görememeli mi?** `manage_billing` yalnız `TENANT_OWNER`'da ve
   bu action iznin ilk çağıranı. Selefin gerekçesi sağlam (fatura yönünü değiştirebilme + TCKN),
   ölçüp doğruladım; ama bu bir **ürün kararı** ve tek kişilik bir kuruluşta sahibi tatile çıkınca
   kimse faturayı düzeltemez. Onaylanmasını isterim.
3. **Ülke listesi 29 ülkeyle sınırlı.** Tablo dışı bir ülkeden müşteri gelirse kimlik hiç
   kaydedilemiyor (`country_unknown`). Doğru davranış bu mu, yoksa kaydedip "faturalanamıyor" mu
   demeli? Bugünkü hüküm: kaydetme — çünkü kaydedilen ama asla fatura üretmeyen kimlik, bu ekranın
   bitirmeye çalıştığı sessiz başarısızlığın ta kendisi.

---

## 7. Sonraki adım

- TASK-MTTUUGKNDGBXK (alarm konsolu): yetim alarm temizliği + operatör "çözümle" hareketi. §3.5'teki
  ölçüm doğrudan o kartın girdisi: yığının %99.6'sı silinmiş kiracılara ait.
- Geriye dönük faturalama kartı (§6.1) — sahipsiz.
- AB KDV rejimi hükmü (§5.2) — mali müşavir bekliyor, `src/lib/billing/vat-rates.ts`.
