---
name: p1-5-ics-rfc5545-fixed
description: P1-5 (.ics RFC 5545 uyumsuzluğu) generateIcsContent'te düzeltildi ve testlendi — bir sonraki board/dogfood turunda aynı bulguyu tekrar açma, ama iki caller-side takip maddesi hâlâ açık
metadata:
  type: project
---

`src/lib/calendar.ts`'teki `generateIcsContent`, dogfood raporunun (docs/agent-results/TASK-MTQU053U24RYH-customer-support.md §P1-5) gerçek modül üzerinde ölçtüğü 5 FAIL'in tamamı için düzeltildi: UID+DTSTAMP eklendi, TEXT alanlar (`\`,`;`,`,`,newline) kaçışlanıyor, satırlar oktet-bilinçli (multi-byte UTF-8'i bölmeden) 75 oktete katlanıyor. 7 birim testle kanıtlı: `src/lib/calendar.test.ts`. Kanıt + komut çıktıları: docs/agent-results/P1-5-blockzincir-pm.md.

**Why:** Kendi yazdığım/onayladığım M9.2 modülü ilk gerçek kullanıcı denemesinde bu haliyle çalışmıyordu — kanıt disiplinini kendi işime de uygulamak gerekti.

**How to apply:** Board/dogfood doğrulaması yaparken P1-5'i tekrar "açık bulgu" olarak sayma — kod ve test kanıtı var. Ama şu ikisi hâlâ AYRI ve AÇIK, `generateIcsContent`'in kapsamı dışında bırakıldı (caller-side, `src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/client.tsx:handleDownloadIcs`):
1. `DESCRIPTION`'a brief'in ham Markdown'ı (`###`, `**`) 200 karakterde kesilerek basılıyor — düz metne indirgenmiyor.
2. Toplantı süresi sabit 1 saat, kullanıcı giremiyor.
3. Her indirmede yeni `UID` (`randomUUID()`) üretiliyor — aynı brief tekrar indirilirse takvimde yinelenen etkinlik olur; deterministik UID istenirse fonksiyona parametre eklenmesi gerekir.

Ayrıca dosya adı tuzağı: `src/lib/calendar.ts` (fonksiyonun asıl yeri) ile `src/lib/calendar/` (provider'lar: google.ts/outlook.ts/ics.ts/sync.ts) AYNI isim altında iki farklı şey — `../calendar` importu index.ts olmadığı için `calendar.ts`'e çözülüyor. Grep yaparken ikisini karıştırma.
