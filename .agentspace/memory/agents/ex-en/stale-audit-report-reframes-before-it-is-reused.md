---
name: stale-audit-report-reframes-before-it-is-reused
description: "Kendi önceki denetim raporumu yeniden kullanmadan önce ölçmeliyim — Fabrika'da bir gün içinde risk çerçevesi eskiyor ve alarmı tekrarlamak kanıtsız 'bitti' kadar zararlı"
metadata:
  type: feedback
updatedAt: 2026-09-08
---

Fabrika'da paralel ajanlar günde onlarca commit indiriyor. Bir denetim raporunun
**bulgusu** doğru kalsa bile **risk çerçevesi** bir gün içinde eskiyebiliyor.

Ölçülmüş vaka (TASK-MTPZF8X1W8WCU 3. tur): 2. turum `CalendarConnection` OAuth
jetonlarını "açık metin, çalışır durumdaki üçüncü taraf kimlik bilgisi" diye
raporlamıştı. Bir gün sonra ölçtüğümde şema yorumu kolonun **boş** olduğunu söylüyordu
(`prisma/schema.prisma:1164`) ve `src/lib/db.ts`'teki `withCalendarTokenGate` extension'ı
şifrelenmemiş yazmayı DB'ye ulaşmadan reddediyordu. İmhanın o satırları silmesi hâlâ
doğru; ama "canlı sızıntı" çerçevesi artık yanlıştı.

Ters yönde de oldu: "FonBridge 17+ yerde" dediğim artık **40 dosyaydı** — büyümüştü.
Ve ilk taramamda gevşek bir regex `saklama`/`alıcı` için VAR dedi; tam metni okuyunca
ikisi de yanlış-pozitifti (`metaDescription`'daki iddia ve kullanıcının kendi dışa
aktarımı). Grep sayısı okumanın yerini tutmuyor.

**Why:** Kanıtsız alarm, kanıtsız "bitti" kadar zararlı — ikisi de okuyanı yanlış yere
bakmaya yönlendirir ve raporun güvenilirliğini yakar.

**How to apply:** Bir karta ikinci/üçüncü turda dönerken açık maddeleri **tek tek yeniden
ölç**, sonra üç kovaya ayır: (a) hâlâ geçerli, (b) **çerçevesi eskimiş — düzeltme yaz**,
(c) kapanmış. Kendi önceki cümlemi kaynak saymam. Grep bulgusunu, iddia ettiği metni
açıp okumadan rapora koymam. İlgili: [[fabrika-board-cards-go-stale]],
[[fabrika-next-round-comes-from-report-open-questions]]
