---
name: fabrika-a-gate-must-apply-the-consumers-own-rule
description: Bir preflight/go-live kapısı "değişken dolu mu" diye bakarsa yalan yeşil verir; tüketicinin KABUL kuralını aynı fonksiyondan çağırmalı, ve kural CLI'a taşınabilmesi için Prisma çeken dosyadan ayrı bir modülde durmalı.
metadata:
  type: project
  updatedAt: 2026-09-08
---

Bir yapılandırma kapısının (`scripts/efatura-preflight.ts`, `pnpm efatura:preflight`)
"dolu mu" kontrolü YETMEZ. Dolu ama tüketicinin reddedeceği bir değer (`INVOICE_VAT_RATE=abc`,
`-1`, `101`) kapıyı yeşil yapar, üretimde iş sessizce durur. Kapı, tüketicinin
**kabul kuralını** aynı fonksiyondan çağırmalı — ve testte `parseVatRate(raw)` ile
`report.vatConfigured` eşitliğini doğrulamalı ki iki taraf ayrışırsa test yakalasın.

**Gotcha (bunu kaybetme):** kuralı doğrudan tüketici dosyasından import EDEMEZSİN.
`src/lib/billing/invoice-writer.ts` → `@/lib/observability/system-alert` → Prisma
zincirini çekiyor; bir CLI kapısı bir yüzdeyi doğrulamak için Prisma client + DATABASE_URL
yüklemeye mecbur olmamalı. Çözüm: kuralı kendi yalın modülüne al
(`src/lib/billing/vat-rate.ts`), tüketici onu `export { x } from './y'` ile yeniden
dışa aktarsın — mevcut importerlar hiç değişmez, kaynak yine tek. Aynı desen
`src/lib/env.ts`'i çağıran diğer script'ler için de geçerli.

**İkinci ders — tek boolean iki farklı durağı gizler.** Aynı kapıda iki eksik ayar
farklı noktalarda duruyorsa AYRI blok/verdict olmalı: `INVOICE_VAT_RATE` eksikse
`createInvoiceForPayment` satırı HİÇ yazmaz (SystemAlert, ödeme etkilenmez);
`INVOICE_SUPPLIER_*` eksikse satır yazılır ama belge üretilemez. Tek "üretilmez"
cümlesi operatöre yanlış yeri gösterir. Hangi durakta durulduğunu doğrulamak için
tüketiciyi grep'le (ör. `grep -n supplier invoice-writer.ts` → 0 sonuç = yazıcı
satıcı kimliğine bakmıyor), varsayma.

**Üçüncü ders:** doküman koddan İLERİDE olabilir. `docs/EFATURA_SETUP.md` tablosu
zaten 13 değişkeni "zorunlu" sayıyordu; eksik olan koddu. Bir kapıyı denetlerken
dokümanı kodun aynası varsayma — ikisini karşılaştır, fark bulgunun kendisidir.

İlgili: [[fabrika-fabrication-audit-must-cover-defaults]]
