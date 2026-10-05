# TASK-MTU64Y932HF96 (2. geçiş) — e-Fatura kullanıcı metinleri: doğrulama + delta

**Ajan:** CS-EN (customer-support) · **Tip:** envanter / salt-okunur · **Tarih:** 2026-09-09
**Kod değiştirilmedi, commit atılmadı** (görev talimatı: "Kod DEĞİŞTİRME, commit ETME — yalnız rapor").

Bu görev bugün ikinci kez verildi. Tam envanter zaten
`docs/agent-results/TASK-MTU64Y932HF96-customer-support.md` dosyasında duruyor (7 hata metni + belge
içi metinler + liste ekranı + "metin olmayan yollar"). Bu ikinci rapor envanteri **tekrarlamıyor**;
o raporun her iddiasını bugünkü çalışma ağacına karşı **yeniden ölçüyor**, bir **düzeltme** ve iki
**yeni bulgu** ekliyor. Aradan `d27d8f4`, `2a83253`, `5db2baa` commit'leri geçti — hiçbiri faturalama
dosyalarına dokunmamış.

---

## 1) Doğrulama tablosu — önceki raporun iddiaları bugün de geçerli mi?

| # | İddia | Bugün | Kanıt |
|---|---|---|---|
| A1-A7 | İndirme yolunda 7 hata kodu → 7 Türkçe toast anahtarı | **Geçerli** | `BillingClient.tsx:126-139`; route'ta tam olarak aynı 7 kod: `route.ts:48,56,61,100,104,126,132` |
| A1 | "ekibimiz bilgilendirildi" deniyor ama `SystemAlert` yazılmıyor | **Geçerli** | `grep -n "SystemAlert" .../export/route.ts` → **0 sonuç**; yalnız `logger.error` |
| A2 | 404 "başka kiracının faturası"nı da kapsıyor, yani "bulunamadı" ≠ "yok" | **Geçerli — kod yorumunda açıkça yazıyor** | `route.ts:25-26`: *"id not in *this* tenant → 404, the same answer as an id that exists nowhere, so the route cannot be used to probe another tenant"* |
| A5 | Aynı koşula "kuruluş" / "çalışma alanı" iki ayrı terim + iki ayrı eylem | **Geçerli** | `tr.json:1497` "kuruluş bulunamadı / doğru hesapla giriş" ↔ `tr.json:136,164,181` "çalışma alanına bağlı değil / yeniden giriş yapın" |
| A6 | `invoice_lookup_failed` + `invoice_lines_invalid` tek metne katlanmış | **Geçerli** | `BillingClient.tsx:135-137` → tek `invoiceExportSystemError` |
| A7 | Sunucu 500'ünde kullanıcıya "internetinizi kontrol edin" deniyor | **Geçerli** | `BillingClient.tsx:178` `catch` → `invoiceExportGenericError` (`tr.json:1499`) |
| B | `UNFILED_NOTICE` her belgede (XML Note + HTML bandı + footer) | **Geçerli** | `efatura.ts:141-142`, basım noktaları `:502`, `:687`, `:797`, başlıkta `:652` |
| B | `foreignCurrencyFilingBlock` bozuk Türkçe + müşteriye depo yolu | **Geçerli** | `efatura.ts:159` — "faturasi / tasimadigi / gonderilemez", metinde `docs/adr/...` |
| B | Yabancı para faturasında TL satırı "(kayıtlı tutar yok): —" | **Geçerli** | `efatura.ts:775-784` |
| C | tr/en fatura anahtar paritesi tam | **Geçerli — 30/30, diff boş** | aşağıda §4 kanıt |
| **D1** | Ödeme alındı / fatura kesilmedi → kullanıcıya hiçbir şey söylenmiyor | **Geçerli** (ama gerekçesi kısmen değişti → §2) | `invoice-writer.ts:371,404,441,458,503,574` altı `skipped` dalı |
| D1 | `TenantBillingIdentity`'ye yazan hiçbir kod yok (yalnız 2 okuma) | **Geçerli** | `grep -rn tenantBillingIdentity src` → `invoice-writer.ts:108,377`, `checkout-tax.ts:59`. Yazma **yok** |
| D2 | PDF pop-up engellenirse sessiz başarısızlık | **Geçerli** | `BillingClient.tsx:165` — ikinci `window.open` dönüşü kontrol edilmiyor, hiçbir dala girmiyor |
| D3 | Fiyat sayfası KDV vaat ediyor, ödeme adımı hiç göstermiyor | **Geçerli** | vaat: `tr.json:1260`, `:1438`; `grep -rnE "grossTotalMinor\|tax\.resolved\|vatMinor" src --include=*.tsx` → **0 sonuç** |
| E | Filing akışı hâlâ bağlı değil, `FilingOutcome` metinleri kullanıcıya dönmüyor | **Geçerli** | `grep -rnE "fileInvoice\|fileThrough\(" src` → integrator + adapters dışında **0 çağrı** |
| E | Sandbox reddi gerekçe olarak `UNFILED_NOTICE` dönüyor | **Geçerli** | `efatura-integrator.ts:150-155` — `status:'rejected', code:'SANDBOX_SAMPLE', message: UNFILED_NOTICE` |

**Sonuç: 16 iddianın 16'sı bugün de doğru.** Önceki rapor bayat değil; ondan iş kartı çıkarılabilir.

---

## 2) ⚠ Düzeltme — D1'in iyzico ayağını önceki rapor yanlış anlatmış

Önceki rapor D1 için *"iki çağıranın **ikisi de** dönen sonucu kullanmıyor"* diyordu. Bugünkü ölçümde
bu **yalnız Stripe ayağı için doğru**:

- **Stripe** — `subscription-sync.ts:639`: `await createInvoiceForPayment(...)`, dönüş değeri
  hiçbir yere atanmıyor. `skipped` sinyali burada **tamamen kayboluyor**. ✔ önceki rapor doğru.
- **iyzico** — `iyzico.ts:739`: `const invoice = await createInvoiceForPayment(...)` ve `:757`'de
  kullanılıyor: `invoiceNumber: invoice.status === 'skipped' ? null : invoice.number`.
  Yani sinyal **var**. Ama gittiği yer: `handleIyzicoWebhook`'un dönüş nesnesi →
  `api/webhooks/iyzico/route.ts:70` → `NextResponse.json({ received: true, ...result })` →
  **cevabı okuyan taraf iyzico'nun sunucusu**, kullanıcı değil.

**Destek açısından net etki değişmiyor:** kullanıcı yine hiçbir şey görmüyor, Ayarlar → Faturalama
yine *"Henüz fatura düzenlenmedi"* diyor (`tr.json:1473-1474`) — ürünün en yanıltıcı metni, çünkü
**parası alınmış** kullanıcıya **sakin ve olumlu** bir boş-durum metni gösteriyor.

**Ama düzeltmenin maliyeti değişiyor** ve bu, kart yazacak kişiyi ilgilendirir:
iyzico yolunda `invoiceNumber === null` sinyali **zaten üretiliyor**, sadece kullanıcıya taşınmıyor —
ucuz iş. Stripe yolunda sinyal hiç yakalanmıyor — önce onu `skipped` olarak yakalamak gerekiyor.
Tek bir kartta "iki ayağı da düzelt" derken bunların **aynı büyüklükte olmadığı** yazılmalı.

---

## 3) Yeni bulgular (önceki raporda yok)

### Y1 · `html` gerçek bir biçim ama hiçbir metin bundan söz etmiyor — hata metni onu inkâr ediyor
`route.ts:35` — `const FORMATS = ['xml', 'pdf', 'html'] as const;` yani **üç** biçim destekleniyor.
Ama:
- arayüzde iki buton var (`invoiceXml`, `invoicePdf` — `tr.json:1490-1491`), `handleInvoiceDownload`
  imzası `format: 'xml' | 'pdf'` (`BillingClient.tsx:143`);
- hata metni (`tr.json:1495`) *"Bu fatura biçimi desteklenmiyor. Lütfen **XML veya PDF** seçeneğini
  kullanın."* diyor;
- 400 yanıtının gövdesi ise `supported: ['xml','pdf','html']` taşıyor (`route.ts:48`).

**Destek ne sorar:** Bu, `?format=html` deneyen bir kullanıcıda (entegrasyon yazan bir müşteri
geliştiricisi, muhasebe yazılımı) **çelişkili iki cevap** üretir: istek 200 döner ama ürünün resmî
metni "desteklenmiyor" der; ya da tersi, kullanıcı gövdedeki `supported` listesini görüp "html de
varmış" der, destek "yok" der. **Bu bir bilgi tutarsızlığı, hata değil.**
**Öneri:** karar verilsin — `html` desteklenen bir biçimse metinde adı geçsin; değilse `FORMATS`'tan
çıksın. Öncelik: düşük, ama ucuz.

### Y2 · `invoiceAmountUnreadable` ile `invoiceUnreadable` aynı ailedeyken zıt kalitede
Bu ikisi yan yana duruyor (`tr.json:1475-1476`) ve aralarındaki fark, tüm rapordaki en iyi örnek:
- `invoiceUnreadable`: *"Fatura geçmişi şu anda okunamadı. **Bu, fatura olmadığı anlamına gelmez** —
  sayfayı yenileyin."* → yanlış çıkarımı önden kesiyor + tek net eylem veriyor. **Ürünün en iyi metni.**
- `invoiceAmountUnreadable`: tek kelime — *"okunamadı"* — ve para sütununda tutarın **yerine**
  basılıyor (`BillingClient.tsx:746,754,758`). Yanlış çıkarım kesilmiyor, eylem yok, kanal yok.

**Destek ne sorar:** *"Faturamda tutar 'okunamadı' yazıyor, ben ne kadar ödedim?"* — ve bu soruya
destek ekrandan cevap **veremez**, çünkü tutar okunamıyor. **Öneri:** aynı ailede aynı kalıp:
hücrede kısa kalsın, satırda bir ipucu: *"Tutar okunamadı — bu, ödemenizin alınmadığı anlamına
gelmez; fatura numarasıyla destek ile iletişime geçin."*

---

## 4) Kanıt (bugün alınmış çıktılar)

```
$ git log --oneline -3
d27d8f4 refactor(k6): finish the RAG merge — one module, one search, no src/lib/ai
2a83253 fix(core): remove the loading.tsx boundaries that duplicated every page
5db2baa docs(memory): record the keyless-vitest gotcha and close the RAG fallback note

# A1 — "ekibimiz bilgilendirildi" deniyor, SystemAlert yazılmıyor:
$ grep -n "SystemAlert\|systemAlert" "src/app/api/billing/invoices/[id]/export/route.ts"
(çıktı yok)

# D1 — TenantBillingIdentity: üç referans, üçü de OKUMA (yazma yok):
$ grep -rn "tenantBillingIdentity" src --include="*.ts" --include="*.tsx" | grep -v test
src/lib/billing/invoice-writer.ts:108:export type InvoiceWriterDb = Pick<Prisma.TransactionClient, 'invoice' | 'tenantBillingIdentity'>;
src/lib/billing/invoice-writer.ts:377:  const identity = await db.tenantBillingIdentity.findUnique({
src/lib/billing/checkout-tax.ts:59:      tx.tenantBillingIdentity.findUnique({

# D1 — altı skipped dalı bugün de yerinde:
$ grep -n "status: 'skipped'" src/lib/billing/invoice-writer.ts
83:      status: 'skipped';
371:    return { status: 'skipped', reason: 'amount_not_invoiceable' };
404:    return { status: 'skipped', reason: 'buyer_identity_missing', missing: [...missing] };
441:    return { status: 'skipped', reason: 'vat_country_unknown' };
458:    return { status: 'skipped', reason: 'amount_not_invoiceable' };
503:    return { status: 'skipped', reason: fxResult.reason };
574:  return { status: 'skipped', reason: 'number_allocation_failed' };

# §2 düzeltmesi — iyzico sinyali üretiyor, ama alıcısı iyzico'nun sunucusu:
$ sed -n '757p' src/lib/iyzico.ts
      invoiceNumber: invoice.status === 'skipped' ? null : invoice.number,
$ grep -n "handleIyzicoWebhook\|NextResponse.json({ received" src/app/api/webhooks/iyzico/route.ts
61:    const result = await handleIyzicoWebhook(notification);
70:    return NextResponse.json({ received: true, ...result });
# Stripe ayağında sinyal hiç yakalanmıyor:
$ sed -n '639p' src/lib/billing/subscription-sync.ts
    await createInvoiceForPayment(

# D3 — checkout KDV alanlarını hâlâ hiçbir arayüz basmıyor:
$ grep -rnE "grossTotalMinor|tax\.resolved|vatMinor" src --include="*.tsx"
(çıktı yok)

# E — filing hâlâ bağlı değil:
$ grep -rnE "fileInvoice|fileThrough\(" src --include="*.ts" --include="*.tsx" \
    | grep -vE "efatura-integrator\.ts|adapters/efatura\.ts"
(çıktı yok)

# C — tr/en fatura anahtar paritesi tam:
$ grep -oE '"invoice[A-Za-z]*"' messages/tr.json | sort > /tmp/tr.k
$ grep -oE '"invoice[A-Za-z]*"' messages/en.json | sort > /tmp/en.k
$ wc -l < /tmp/tr.k; wc -l < /tmp/en.k; diff /tmp/tr.k /tmp/en.k
30
30
(diff boş)

# Y1 — üç biçim destekleniyor, metin ikisinden söz ediyor:
$ sed -n '35p' "src/app/api/billing/invoices/[id]/export/route.ts"
const FORMATS = ['xml', 'pdf', 'html'] as const;
$ grep -n "invoiceExportUnsupportedFormat" messages/tr.json
1495:      "invoiceExportUnsupportedFormat": "Bu fatura biçimi desteklenmiyor. Lütfen XML veya PDF seçeneğini kullanın.",
```

---

## 5) Değişen dosyalar
Yok — salt-okunur. Bu rapor dosyası dışında hiçbir dosyaya yazılmadı; kod değiştirilmedi, commit atılmadı.

## 6) Riskler
- Satır numaraları 2026-09-09 çalışma ağacına ait; `BillingClient.tsx` ve `messages/*.json`
  `git status`'ta `M` — paralel bir ajan aynı dosyalara dokunursa numaralar kayar. Kod alıntıları
  numaralardan daha güvenilir.
- D1 ve D3'ün kullanıcıya ne söyleyeceği **ticari taahhüt**; destek tek başına yazmamalı (§7).

## 7) Açık sorular (patron/finans — önceki raporla aynı, hâlâ cevapsız)
1. Ödeme alınıp fatura kesilemediğinde kullanıcıya ne söyleyeceğiz, ne kadar süre taahhüt edeceğiz?
2. Ödeme adımında KDV çözülemediğinde kullanıcı net tutarı ödüyor — ekranda ne yazacak?
3. Entegratör bağlanana kadar `UNFILED_NOTICE`'in yanında resmî fatura için ne söz veriyoruz?
4. `TenantBillingIdentity` doldurma formu kimin kapsamında? (Bugün doldurma yolu **hiç yok**.)
5. **Yeni:** `html` biçimi destekleniyor mu, desteklenmiyor mu? (Kod "evet", metin "hayır" diyor.)

## 8) Sonraki adım
Önceki raporun §6 öncelik sırası ve 4 kart bölünmesi **aynen geçerli**. İki ekleme:
- **Kart 1 (D1)** yazılırken iyzico ve Stripe ayaklarının **aynı büyüklükte olmadığı** not düşülsün (§2).
- **Kart 2 (metin düzeltmeleri)** kapsamına Y1 (`html` tutarsızlığı) ve Y2 (`invoiceAmountUnreadable`)
  eklensin — ikisi de `messages/{tr,en}.json` + tek dosya, aynı PR'a sığar.
