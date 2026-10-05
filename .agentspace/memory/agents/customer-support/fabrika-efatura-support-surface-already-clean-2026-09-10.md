---
name: fabrika-efatura-support-surface-already-clean-2026-09-10
description: "2026-09-10 itibarıyla e-Fatura'nın destek yüzeyi (env şeması, hata metinleri, runbook) zaten tamam — bu kart yeniden gelirse sıfırdan başlama, önce koda karşı hızlı yeniden-doğrula"
metadata:
  type: project
  updatedAt: 2026-09-10
---

TASK-MTRJSOWFH6B45 (e-Fatura go-live, entegratör kimlik bilgisi 12-13 Eylül'de
geliyor) beşinci-altıncı kez göründü ve bu turda (customer-support açısı)
ölçtüğüm her şey ZATEN doğruydu:

- `src/lib/env.ts` 12 e-Fatura değişkeninin (7 satıcı + 5 entegratör) hepsini
  `optional` olarak tanımlıyor; `process.env.INVOICE_SUPPLIER_*` /
  `EFATURA_INTEGRATOR_*` okuyan tek bir şemayı-atlayan satır yok.
- `/api/billing/invoices/[id]/export/route.ts` eksik değişken adlarını yalnız
  sunucu loguna yazıyor, yanıt gövdesine değil (TASK-MTUH6YKP6OQAX'te düzeltilmiş).
- `BillingClient.tsx` indirme butonları `fetch` + hata-koduna-göre-`t()` eşlemesi
  kullanıyor (düz `<a href>` değil) — ham JSON kullanıcıya asla ulaşmıyor.
- `messages/tr.json` ve `en.json`'daki 7 `invoiceExport*` anahtarı zaten kısa,
  jargonsuz, empatik ve "destek ararken fatura numaranızı götürün" diyor.
- `docs/EFATURA_SETUP.md` zaten env tablosunu VE adım-adım go-live runbook'unu
  taşıyordu; eksik olan tek şey Adım 2/3'ü tek bir kopyala-yapıştır komutuna
  zincirlemekti (bunu bu turda ekledim) ve bayat bir test sayısıydı (29/29 →
  gerçek 43/43).

**Bir sonraki tur için:** bu kart yine gelirse sıfırdan env/metin/runbook
denetimine başlama — önce `grep -rn "process\.env\.\(INVOICE_SUPPLIER\|EFATURA_INTEGRATOR\)"
src scripts | grep -v env.ts` ve `pnpm efatura:preflight` ile hızlı bir
yeniden-doğrulama yap ([[fabrika-blocked-card-premise-may-hide-the-real-blocker]]
düsturu hâlâ geçerli — ama bu turda gerçek boşluk yoktu, sadece bir belge
detayı bayatlamıştı). Kalan tek gerçek engel hâlâ ticari: hangi entegratör +
kimlik bilgisi. `ADAPTERS` (`src/lib/efatura-integrator.ts`) hâlâ yalnız
`sandbox` içeriyor, `fileInvoice`/`fileThrough` üretim kodunda HİÇBİR yerden
çağrılmıyor (bilerek — `invoice-writer.ts:44` "Not in scope: filing").

İlgili: [[fabrika-payment-taken-no-invoice-is-silent]] (aynı ailede ayrı bir
gerçek boşluk: `TenantBillingIdentity`'yi dolduran bir ürün ekranı hâlâ yok).
