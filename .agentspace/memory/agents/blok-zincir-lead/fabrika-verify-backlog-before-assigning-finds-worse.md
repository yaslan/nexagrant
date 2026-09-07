---
name: fabrika-verify-backlog-before-assigning-finds-worse
description: Bekleyen kartları dağıtmadan önce iddialarını koda karşı ölç — kart metnini doğrularken panoda HİÇ olmayan daha ağır kusurlar çıkıyor
metadata:
  type: feedback
updatedAt: 2026-09-07
---

"Boştaki ajanlara bekleyen kartları dağıt" isteği geldiğinde kartları OLDUĞU GİBİ dağıtma;
önce her birinin iddiasını tek komutla ölç. 2026-09-07'de dört kart için yapılan bu kısa
tarama şunları verdi:

- **Doğrulandı:** `prisma.organization.findMany()` çağrılıyor ama `model Organization`
  şemada yok (`grep -n "^model Organization" prisma/schema.prisma` → boş). Birim test
  modeli `vi.mocked` ile mock'ladığı için yeşil; hata yalnız gerçek tıklamada çıkıyor.
- **Doğrulandı:** `submitDualApprovalAction(docId, actorName = 'Dr. Mehmet Yılmaz')` —
  uydurma bir kişi adı DENETİM KAYDINA varsayılan olarak yazılıyor.
- **Bayat çıktı:** "Paylaşılan dev DB sıfırlandı, geri yükle" kartı — `pnpm rls:verify`
  yeşil ("39 tablonun tamamında izolasyon uygulanıyor"), DB ayakta. Dağıtılsaydı boşa iş.
- **Panoda HİÇ YOKTU, P0 çıktı:** `src/lib/evidence-ai.ts` gerçek yükleme akışından
  çağrılıyor ve OCR yoksa sahte akreditasyon üretiyor — uydurma belge no
  (`ISO-27001-2025-9921`, `DOC-${Math.random()}`), uydurma veren kurum ("TÜRKAK / TSE"),
  uydurma tarihler ve `tags: ['doğrulanmış', …]`. Bu içerik AB fon başvurusuna giriyor.

**Why:** Kart metni yazıldığı GÜNÜN gerçeğidir; kod o gün değişir. Ayrıca en ağır kusurlar
genelde kimsenin kart açmadığı yerdedir — kart açan kişi zaten sorunu görmüş demektir.
Dağıtım öncesi 10 dakikalık ölçüm hem bayat kartı eler hem de gerçek P0'ı bulur.

**How to apply:** Her aday kart için TEK doğrulama komutu koştur (grep/test/verify), sonucu
kartın açıklamasına **komut çıktısıyla** yaz — worker tahminle değil ölçümle başlasın.
Ölçerken gördüğün kayıtsız kusuru kendi kartına AÇ, mevcut karta karıştırma.
İlgili: [[fabrika-board-cards-go-stale]] · [[fabrika-verify-each-claim-not-the-headline]] ·
[[fabrika-ask-workers-to-report-not-fix-adjacent-lies]]
