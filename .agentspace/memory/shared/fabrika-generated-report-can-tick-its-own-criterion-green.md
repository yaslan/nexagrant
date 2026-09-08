---
name: fabrika-generated-report-can-tick-its-own-criterion-green
description: Üretilmiş kabul tablosu kriteri kendi kendine yeşile boyayabilir ve "bugünden +N gün" varsayılanı taahhüt tarihini kaydırır — üretilmiş rapora kanıt diye güvenmeden önce iki şeyi kontrol et
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

`docs/CORDIS-SAMPLE-CALIBRATION.md` (üretilmiş dosya, `scripts/esr-calibration.ts` yazıyor) iki
farklı şekilde yanlış bilgi veriyordu — ikisi de commit'li kanıt gibi duruyordu:

1. **Yalan yeşil:** Kabul satırı "Ortak anketi **gönderilmiş**" idi ama koşul
   `partnerCount > 0 ? '✅ hazırlandı' : '❌'` yazıyordu. Yani ölçtüğü şey "render edildi",
   iddia ettiği şey "gönderildi". Anket hiç gönderilmemişken tablo ✅ gösteriyordu ve asıl blokeyi
   (placeholder roster) gizliyordu.
2. **Kayan taahhüt tarihi:** `--deadline` varsayılanı "bugünden +14 gün" idi ve rapor her koşuda
   yeniden üretiliyor. Aynı programın commit'li anket sayfaları **2026-09-21**, bir gün sonra
   yeniden üretilen rapor **2026-09-22** diyordu. Üretilmiş çıktı idempotent değildi.

Düzeltme (`bfa2015`): kabul satırı gerçek teslim durumunu (`surveySent`, `undeliverable`) yansıtıyor;
tarih `src/lib/beta/constants.ts → ESR_SURVEY_DEADLINE` sabitinde, `--deadline=` ile geçersiz
kılınabiliyor. Kanıt: iki ardışık koşu, tek fark üretim damgası.

**Neden önemli:** Fabrika'da CLAUDE.md kanıt disiplini şart koşuyor, ama üretilmiş bir rapor da
kanıt SAYILIR. Kendi kendini yeşile boyayan bir tablo, kanıtsız "bitti" demekten daha tehlikelidir —
çünkü kanıt gibi görünür.

**Nasıl uygula:** Üretilmiş bir kabul/durum tablosuna dayanmadan önce (a) her satırın ölçtüğü ifadenin
satırdaki FİİLLE aynı olduğunu koda bakarak doğrula ("gönderildi" mi "hazırlandı" mı), (b) çıktıyı iki
kez üretip diff'le — üretim damgası dışında fark çıkıyorsa çıktı idempotent değildir ve bir yerde
`Date.now()` bir taahhüdü kaydırıyordur. Kullanıcıya/ortağa söylenen tarih sabit dosyada durmalı,
hesaplanmamalı.

**İlgili:** [[fabrika-e11-3-survey-was-never-sent]], [[fabrika-board-cards-go-stale]],
[[fabrika-prove-the-fix-against-the-real-database]]
