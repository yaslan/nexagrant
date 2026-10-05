---
name: fabrika-export-files-need-an-off-repo-parser
description: Bir dosya biçimi (.ics, .csv, .ndjson, PDF) üreten kodu kendi testiyle "uyumlu" ilan etme — tarayıcıdan İNEN dosyayı yakala ve repo DIŞI bir ayrıştırıcıya okut; ayrıca biçim uyumu ≠ kimlik doğruluğu (UID/id kalıcılığı ayrı sınanır)
metadata:
  type: reference
  updatedAt: 2026-09-08
---

TASK-MTQUTBH8Q9VMK'de ölçüldü (M9 `.ics`). İki ayrı ders:

**1. Kendi doğrulayıcın kanıt değildir.** `src/lib/calendar.test.ts` içindeki
`rfc5545Violations()` üreticiyle aynı varsayımları paylaşır; "test geçti" bir
uyum kanıtı değil, tutarlılık kanıtıdır. Ucuz ve kesin yol:

```bash
# repo dışı ayrıştırıcı #1 (scratchpad'e, projeye bulaşmadan)
pip3 install --target ./pylib icalendar     # 6.3.2 çalıştı
python3 -c "import sys;sys.path.insert(0,'./pylib');from icalendar import Calendar;Calendar.from_ical(open('f.ics','rb').read())"
# ayrıştırıcı #2 (Thunderbird'ünki)
npm install ical.js@2 && node -e "import('ical.js').then(m=>m.default.parse(require('fs').readFileSync('f.ics','utf8')))"
```

Ayrıştır + **geri aç**: kaçırılmış değerin kaynak dizgiyle birebir eşitliğini
kontrol et (kaçış hatası ancak böyle görünür).

**2. Ölçülecek dosya, kullanıcıya İNEN dosyadır.** Playwright ile yakala:
`const w = page.waitForEvent('download'); await button.click(); const f = await w;
readFile(await f.path())`. Blob + `<a download>` akışı da bu olayı tetikliyor
(`tests/e2e/m9-ics-download.spec.ts` bu deseni kullanıyor). Fonksiyonu birim
testte çağırmak, çağıranın ne geçirdiğini ölçmez.

**3. Biçim uyumu ≠ kimlik doğruluğu.** `.ics` her denetimden geçiyordu ama `UID`
her çağrıda taze `randomUUID()` idi: aynı kayıt iki kez indirilince takvimde iki
etkinlik. Dışa aktarılan her kayıt için soru "benzersiz mi" DEĞİL, **"aynı kaydı
yeniden dışa aktarınca aynı kimlik geliyor mu"**. Fabrika'da kalıcı kimlik = satırın
DB id'si (brif satırı `update` edildiği için yeniden üretmede sağ kalıyor).

İlgili: [[fabrika-check-every-surface-not-the-fix]] · [[fabrika-fabrication-audit-must-cover-defaults]]
