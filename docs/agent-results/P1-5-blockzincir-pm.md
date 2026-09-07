# P1-5 — `.ics` içeriği RFC 5545'e uydurma

**Ajan:** blockzincir-pm · **Kaynak bulgu:** docs/agent-results/TASK-MTQU053U24RYH-customer-support.md §P1-5 (`screenshots/ics-rfc5545-check.txt`)

## 1) Ne yapıldı

`src/lib/calendar.ts` içindeki `generateIcsContent`, dogfood raporunun gerçek modül üzerinde
ölçtüğü 5 FAIL'in tamamını gideriyor:

1. **`UID` eklendi** (RFC 5545 §3.6.1, ZORUNLU) — `crypto.randomUUID()` ile her çağrıda benzersiz,
   `UID:<uuid>@fabrika.app` biçiminde.
2. **`DTSTAMP` eklendi** (ZORUNLU) — üretim anının UTC zaman damgası, `DTSTART`/`DTEND` ile aynı
   `formatIcsDate` yardımcısıyla biçimlenir.
3. **TEXT alan kaçışlaması** (§3.3.11) — `escapeIcsText` yeni yardımcı fonksiyonu `\`, `;`, `,` ve
   satır sonlarını (`\n`) RFC'nin istediği sırayla kaçışlıyor (`\\` önce, sonra `;`/`,`, en son
   newline → `\n`). `SUMMARY` ve `DESCRIPTION` artık bu fonksiyondan geçiyor.
4. **Satır katlama (folding)** (§3.1) — `foldIcsLine` her mantıksal satırı en fazla 75 OKTET olacak
   şekilde `\r\n` + tek boşluk ile katlıyor. Katlama **oktet-bilinçli**: UTF-8 çok baytlı bir
   karakterin (ör. `—`, `ö`, `ş`) ortasından kesilmesini önlemek için bölme noktası devam baytı
   (`10xxxxxx`) olduğu sürece geri kaydırılıyor.
5. **CRLF** zaten vardı (`\r\n` ile join), katlanmış satırlar da aynı ayırıcıyı kullanıyor —
   değişmedi, testle doğrulandı.

**Kapsam dışı bırakılan (P1-5'in görevi değil):** `DESCRIPTION`'a ham Markdown'ın (`###`, `**`)
200 karakterde kesilerek basılması ve sabit 1 saatlik toplantı süresi — bunlar
`briefs/client.tsx:handleDownloadIcs`'te **çağıran tarafın** içerik/UX kararı, `generateIcsContent`
fonksiyonunun RFC uygunluğu değil. Görev metni yalnız "generateIcsContent'i düzelt" diyor; bu iki
madde ayrı bir kart gerektirir (bkz. Açık sorular).

## 2) Kanıt

Dogfood raporundaki gerçek Fraunhofer senaryosuyla manuel doğrulama (`npx tsx -e "..."`,
`generateIcsContent` gerçek modülden import edilerek çağrıldı):

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Fabrika SaaS//EN
BEGIN:VEVENT
UID:5f0ca6d5-6fc4-4983-a850-bddf198eb8f0@fabrika.app
DTSTAMP:20260907T063056Z
DTSTART:20261024T110000Z
DTEND:20261024T120000Z
SUMMARY:Görüşme: Fraunhofer Institute\; Munich\, DE
DESCRIPTION:### 1. Partner Background & EU Track Record\n- **Partner:** Fra
 unhofer Institute (Germany) — PIC 999984059 — some more filler text to
  push this well past the seventy five octet RFC 5545 line limit for sure
END:VEVENT
END:VCALENDAR
---checks---
max octets: 75
has UID: true
has DTSTAMP: true
CRLF only: true
```

Birim testleri (`src/lib/calendar.test.ts`, 7 test — UID varlığı+format, UID benzersizliği,
`,`/`;`/`\` kaçışlama, `\n` kaçışlama, oktet-bilinçli katlama + çok baytlı karakter round-trip,
CRLF-only, DTSTART/DTEND doğruluğu):

```
$ npx vitest run src/lib/calendar.test.ts
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Kapı komutları:

```
$ npx tsc --noEmit -p .          # temiz, hata yok
$ npx eslint src/lib/calendar.ts src/lib/calendar.test.ts   # temiz, hata yok
$ npx vitest run                 # Test Files 54 passed | 2 skipped (56)  Tests 512 passed | 8 skipped (520)
```

## 3) Değişen dosyalar

- `src/lib/calendar.ts` — `generateIcsContent` RFC 5545 uyumlu hale getirildi; `escapeIcsText`,
  `foldIcsLine`, `formatIcsDate` yardımcıları eklendi. `createIcsDataUrl` imzası/davranışı değişmedi
  (üzerinden geçiyor).
- `src/lib/calendar.test.ts` — yeni birim test dosyası (7 test).

`src/lib/calendar/ics.ts` (provider) ve `briefs/client.tsx` (çağıran taraf) **değiştirilmedi** —
`generateIcsContent`'in imzası aynı kaldığı için her iki çağıran taraf da otomatik olarak düzeltilmiş
çıktıyı alıyor.

## 4) Riskler

- Üretilen `.ics` dosyaları artık öncekinden daha uzun (UID+DTSTAMP satırları + katlama boşlukları).
  Pratik risk yok — RFC'nin beklediği format bu.
- `randomUUID()` her çağrıda yeni bir UID üretir; `briefs/client.tsx` aynı brief için `.ics`'i tekrar
  indirirse her seferinde **farklı** bir UID üretilir (aynı olay değil, yeni bir olay gibi görünür,
  içe aktarıldığında yinelenir). RFC bunu yasaklamıyor (UID sadece benzersiz olmalı) ama kullanıcı
  aynı toplantıyı iki kez indirip takvime eklerse iki ayrı etkinlik oluşur. Deterministik bir UID
  (ör. brief id'sinden türetilmiş) istenirse fonksiyona opsiyonel bir parametre eklenmesi gerekir —
  bu görevin kapsamı dışında, gerekirse ayrı bir karar/kart.

## 5) Açık sorular

- `DESCRIPTION`'a ham Markdown'ın kesilerek basılması (dogfood raporunda aynı P1-5 altında not
  edilmiş) ve sabit 1 saatlik toplantı süresi, `briefs/client.tsx:handleDownloadIcs` içindeki çağıran
  tarafın sorumluluğu — `generateIcsContent` şimdi ne verilirse onu RFC'ye uygun şekilde kodluyor.
  Markdown'ı düz metne çevirme/süre girişi ayrı bir görev olarak açılmalı.

## 6) Sonraki adım

Ayrı bir kart: `briefs/client.tsx`'te (a) `DESCRIPTION`'a geçmeden önce brief içeriğini Markdown'dan
düz metne indirgeme, (b) toplantı süresini sabit 1 saat yerine kullanıcıdan/brief'ten alma,
(c) gerekirse deterministik UID (brief id bazlı) — aynı brief tekrar indirildiğinde aynı etkinliği
güncellesin.
