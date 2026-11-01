---
name: fabrika-systemalert-resolvedat-has-one-writer
description: Fabrika SystemAlert.resolvedAt'i yalnız konsoldaki insan yazıyor — üretici/süpürücü yok, o yüzden 0 alarm çözülmüş
metadata:
  type: project
  updatedAt: 2026-09-10
---

## Gerçek

`SystemAlert.resolvedAt` sütununu yazan **tek yer** `src/app/[locale]/admin/alerts/actions.ts`
— yani konsolda "Çözüldü işaretle"ye basan insan. Ne alarmı üreten kod, ne bir Inngest işi
onu yazıyor; `SystemAlert` için **saklama/temizlik işi de yok**.

2026-09-10: 256 satır, **0'ı çözülmüş**. Bu bir ihmal değil, tasarımın eksik yarısı.

Sonuçlar ölçüldü:
- Koşulu kendiliğinden düzelen alarm sonsuza dek açık kalıyor. `invoice_vat_country_unknown`
  satırları, `findCountryVatRate("Türkiye")` bugün `TR @ %20` döndürdüğü hâlde açık.
- `INVOICE_VAT_RATE` alarmı hâlâ açık, oysa o env değişkeni koddan tamamen silinmiş.
- Konsolun tek triyaj kontrolü ("Yalnız çözülmemişler") **0 satır eliyor** — 252→252 —
  çünkü hiçbir satır çözülmemiş. Kontrol var, işlevi yok.

## Why

"Alarm çok" şikâyeti gelince refleks çözüm bastırma/gruplama penceresi eklemek oluyor.
Ölçüm bunu çürüttü: **dedup zaten çalışıyor** (`invoice_profile_assumed` 231 oluşumu tek
satıra katlamış). Eksik olan bastırma değil, **kapanma**. Bir alarm sistemi ancak
alarmı KAPATAN bir yazıcı varsa çalışır.

## How to apply

- Alarm yığını denetlerken `resolvedAt`'i kimin yazdığını **grep'le**; tek yazıcı insansa
  yığının büyümesi kaçınılmazdır, sayıyı tartışmaya gerek yok.
- Üç ayrı yazıcı gerekir, biri diğerinin yerini tutmaz:
  (1) **üretici** — koşul yeniden yanlışsa kendi alarmını kapatır,
  (2) **süpürücü** — konusu ortadan kalkmış alarmı kapatır (silmez; kayıt denetim izidir),
  (3) **insan** — yalnız yargı gerektirenler için.
- Dedup anahtarı `meta`'nın tamamıysa (`alertIdentity`), koşu-başına-değişen alan
  (`tenantId`, `month`, `host`) taşıyan alarm **asla katlanmaz**. Çözüm zaman penceresi
  değil, opsiyonel `dedupeKey`.

## Related

[[fabrika-tests-leave-permanent-alerts-in-the-operator-console]] — yığını büyüten öbür yarı
[[a-record-is-not-a-document]] — satır yazılması, insanın gördüğü ekranda görünmesi demek değil
