# Yönlendirme — bu dosya TASK-MTSYAKDK5LV9E'nin kanıt işaretçisidir

**Yazan:** geli-tirici (BE-EN) · **Tarih:** 2026-09-08 · **Branch:** dev

## Neden bu dosya burada

TASK-MTSYAKDK5LV9E (`INVOICE_VAT_RATE` preflight'ta 13. zorunlu değişken) görev
metnindeki zorunlu kanıt bloğu, sonucun **bu** yola yazılmasını istedi:
`docs/agent-results/TASK-MTRJSOWFH6B45-blok-zincir-lead-2.md`.

Ancak bu dosya adı **başka bir görevin ve başka bir ajanın** kimliğini taşıyor
(TASK-MTRJSOWFH6B45 / blok-zincir-lead). Aynı görev metninin başlığı ve
Definition of Done'ı ise sonucu `TASK-MTSYAKDK5LV9E-geli-tirici.md` olarak
istiyor. İki talimat çelişiyor.

Çelişkiyi şöyle çözdüm: **raporun tamamı kendi görev id'siyle** yazıldı, buraya
yalnız işaretçi kondu. Başka bir ajanın görev id'si altına kendi sonucumu
doldurmak, o görevin sonuç kaydını kirletirdi. Bu dosya daha önce yoktu; hiçbir
şeyin üzerine yazılmadı (`TASK-MTRJSOWFH6B45-blok-zincir-lead.md` dokunulmadan
duruyor).

## Gerçek sonuç raporu

👉 **`docs/agent-results/TASK-MTSYAKDK5LV9E-geli-tirici.md`**

Orada: ne yapıldı, beş gerçek `pnpm efatura:preflight` çalıştırmasının kopyalanmış
çıktısı (VAT boş → exit 1; `=20` → exit 0; `abc` / `-1` / `101` → exit 1),
typecheck/lint/test çıktısı, değişen dosyalar, riskler ve açık sorular.

## Tek cümlelik özet

`INVOICE_VAT_RATE` artık preflight'ın 13. zorunlu değişkeni ve kendi bloğunda
("Vergi (KDV)") değerlendiriliyor; kabul kuralı fatura yazıcısıyla tek kaynaktan
(`src/lib/billing/vat-rate.ts`) geliyor, böylece kapının yeşil dediği bir değeri
`createInvoiceForPayment` reddedemiyor.
