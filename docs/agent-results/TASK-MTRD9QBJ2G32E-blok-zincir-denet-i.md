# TASK-MTRD9QBJ2G32E: Demo Faturalar Ekranda Gerçek Gibi Gösteriliyor — QA Raporu

**Ajan:** QA-EN (Blok-Zincir-Denet-i)  
**Tip:** Bug Fix (UI/Legal Risk)  
**Tarih:** 2026-09-07

---

## Ne Yapıldı

Demo faturalar bölümü (`BillingClient.tsx`) ekranda gerçek fatura gibi gösteriliyor — "GİB ONAYLI" rozeti (doğrulanmamış), VKN/unvan/vergi dairesi hardcoded, indirme bağlantıları, ve "E-fatura kayıtlı mükellef" statüsü (yasal iddia).

**Çözüm:** Demo olduğu açıkça işaretlendi; doğrulanmamış rozetler ve indirme bağlantıları kaldırıldı; veri "amber" rengiyle ve "Demo:" etiketi ile işaretlendi.

---

## Değişiklikler

### 1. i18n Keyleri Eklendi

**Dosyalar:** `messages/tr.json`, `messages/en.json`

Yeni anahtar (her iki dile):
- **`invoiceDemo`**: "Aşağıdaki faturalar örnek kayıtlardır — gerçek fatura geçmişi henüz bağlanmamıştır."
- **`invoiceStatusDemo`**: "Demo örnek" / "Demo sample"

**Kanıt (TR):**
```
1145:      "invoiceDemo": "Aşağıdaki faturalar örnek kayıtlardır — gerçek fatura geçmişi henüz bağlanmamıştır.",
1150:      "invoiceStatusDemo": "Demo örnek",
```

**Kanıt (EN):**
```
1145:      "invoiceDemo": "The invoices below are demo samples — real invoice history has not yet been integrated.",
1150:      "invoiceStatusDemo": "Demo sample",
```

### 2. BillingClient.tsx — Demo Uyarı Banner & Etiketler

**Dosya:** `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx`

#### Uyarı Banner (satır ~549)
```jsx
{/* Demo invoice warning */}
<div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
  ⚠ {t('invoiceDemo')}
</div>
```

#### VKN, Şirket Unvanı, Vergi Dairesi "Demo:" Etiketi ile

Satır ~562-570:
```jsx
<span className="font-bold text-ink block mt-0.5 text-amber-700">
  <span className="font-mono text-[10px] mr-1">Demo:</span> Demo Ar-Ge ve Danışmanlık Ltd. Şti.
</span>
```

```jsx
<span className="font-bold text-ink block mt-0.5 font-mono text-amber-700">
  <span className="text-[10px] mr-1">Demo:</span> Doğanbey V.D. / 2840958172
</span>
```

### 3. "GİB ONAYLI" Rozeti Kaldırıldı → "Demo örnek"

**Satır ~596-600:**

**Öncesi:**
```jsx
<span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
  {t('invoiceApproved')} {/* "GİB ONAYLI" */}
</span>
```

**Sonrası:**
```jsx
<span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
  {t('invoiceStatusDemo')} {/* "Demo örnek" */}
</span>
```

### 4. İndirme Bağlantıları Kaldırıldı

**Kaldırılan satırlar:**
- `<a href="/api/billing/invoices/[no]/export?format=xml">` (XML indir)
- `<a href="/api/billing/invoices/[no]/export?format=pdf">` (PDF indir)

**Yerine:** Tablo satırı opacity:60 ve açıklayıcı metin:
```jsx
<span className="text-[11px] text-muted font-mono">{t('invoiceDemo')}</span>
```

---

## Kanıt (Build & Lint)

**Build:** ✓ Başarılı
```
Next.js build completed successfully
```

**Typecheck:** ✓ Temiz
```
tsc --noEmit
(no errors)
```

**i18n Keyleri:** ✓ İki dilde eklendi
```bash
grep "invoiceDemo\|invoiceStatusDemo" messages/{tr,en}.json
✓ Bulundu (her iki dosyada)
```

---

## Riskler & Notlar

1. **Veri Kaynağı:** Kiracı kaydında `legalName`, `taxId`, `taxOffice` alanları henüz yok. Hardcoded veri "Demo:" etiketi ile açıkça işaretlendi.

2. **Gerçek Fatura Geçmişi:** Demo örnek veri, gerçek Invoice tablosuna bağlanmadı (TASK bağımlılığı).

3. **Yasal İddia Kaldırıldı:** "E-fatura kayıtlı mükellef" statüsü hiçbir kaydın doğrulamadığı için, "Demo örnek" ile değiştirildi.

4. **İndirme API:** `/api/billing/invoices/[id]/export` endpoint var ama demo veri boş → indirme bağlantıları kaldırıldı (hata riskini azaltır).

---

## Doğrulama Sonucu

| Kontrol | Sonuç | Kanıt |
|---------|-------|-------|
| i18n keyleri eklendi (TR) | ✓ | `messages/tr.json:1145,1150` |
| i18n keyleri eklendi (EN) | ✓ | `messages/en.json:1145,1150` |
| Demo uyarı banner gösteriliyor | ✓ | `BillingClient.tsx:549` |
| VKN "Demo:" etiketi | ✓ | `BillingClient.tsx:562` |
| Vergi dairesi "Demo:" etiketi | ✓ | `BillingClient.tsx:567` |
| "GİB ONAYLI" rozeti kaldırıldı | ✓ | Grep: 0 sonuç |
| "Demo örnek" rozeti eklendi | ✓ | `BillingClient.tsx:596` |
| XML/PDF indirme bağlantıları kaldırıldı | ✓ | Grep: 0 sonuç (`invoiceXml/invoicePdf`) |
| Build başarılı | ✓ | Next.js build ✓ |
| Typecheck temiz | ✓ | `tsc --noEmit` ✓ |

---

## Sonuç

✅ Demo faturalar ekranda açıkça "Demo:" etiketiyle ve uyarı banneriyle işaretlendi.  
✅ Doğrulanmamış "GİB ONAYLI" rozeti kaldırıldı.  
✅ Yasal iddia ("E-fatura kayıtlı mükellef") kaldırıldı.  
✅ İndirme bağlantıları (geçersiz veri riski) kaldırıldı.  
✅ Tüm değişiklikler i18n standardına uydu (TR+EN).  
✅ Build temiz.

Görev tamamlandı. Demo fatura bölümü artık gerçek fatura gibi gösterilmiyor ve yasal risk taşımıyor.
