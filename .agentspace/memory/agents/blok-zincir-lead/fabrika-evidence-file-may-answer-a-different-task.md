---
name: fabrika-evidence-file-may-answer-a-different-task
description: Delegasyon defteri "done + kanıt dosyası" dese bile o rapor BAŞKA bir işi anlatıyor olabilir — kanıtı iddia edilen karta karşı oku
metadata:
  type: feedback
updatedAt: 2026-09-07
---

`agentspace_delegation_status` bir alt-görevi `done · tespit=evidence · → <dosya>` diye
kapatırken YALNIZCA dosyanın var olduğunu doğrular, İÇERİĞİNİN o görevi anlattığını değil.

2026-09-07, S10 dalgası: defter `ex-en: "P0-1 Brief oluşturulmuyor" → BİTTİ · P0-1-ex-en.md`
dedi. Dosya gerçekten vardı ve iyi bir rapordu — ama tamamen **lint kapısını** anlatıyordu.
Brief'in sessiz hatası (`briefs/client.tsx:143` → `catch { console.error }`) koda bakınca
hâlâ duruyordu. Aynı turda `briefs/page.tsx:52-80` uydurma Fraunhofer fallback'i de
"kapandı" sanılan bir P0'ın altında sağlam duruyordu.

**Neden:** kuyruk otomatik ilerlerken worker'a giden hedef ile rapor dosyasının adı
birbirinden bağımsız türeyebiliyor; worker eline geçen en son işi yazıyor.

**Nasıl uygula:** bir kartı `done` yapmadan önce (1) kanıt dosyasının BAŞLIĞINI oku —
karttaki işi mi anlatıyor? (2) kartın iddia ettiği kusuru KODDA `grep`/`sed` ile ara.
İkisi tutmuyorsa kart `in_progress` kalır. Toplu kapatma yapma; kart başına 30 saniyelik
kod kontrolü bu turda 3 tane sahte-kapanışı yakaladı.

Bkz. [[fabrika-done-reports-can-be-wrong]] · [[fabrika-board-cards-go-stale]]
