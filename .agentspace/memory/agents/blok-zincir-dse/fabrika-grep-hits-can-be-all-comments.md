---
name: fabrika-grep-hits-can-be-all-comments
description: Fabrika'da "uydurma isim" kartlarında grep sıfır dönmez — kaldırılan isimler açıklama yorumlarında yaşamaya devam eder; her isabeti kod/yorum diye sınıflandır ve hükmü ekrandan + gerçek dışa aktarım dosyasından ver
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Bu depoda kimlik-dürüstlüğü düzeltmeleri, kaldırdıkları uydurma adı **yorum
içinde** anıyor ("burada şu vardı, neden kaldırıldı"). Sonuç: temizlik bittikten
sonra bile kartın grep'i doluymuş gibi görünür. 2026-09-08'de m11 kartında
`grep -rn` **17 satır** verdi ve 17'sinin de yorum olduğu çıktı.

**Why:** Çıplak grep sayısına bakıp "AÇIK KALAN" demek yanlış hüküm üretir;
tersi de geçerli — grep'in listesi kısa olduğu için aynı sınıftan gerçek bir
kusur gözden kaçabilir.

**How to apply:**
1. Her isabeti satır başından sınıflandır, ama `//` ve `*` yetmez: `{/* ... */}`
   blok gövdesi düz metinle başlar (bende `AuthCard.tsx:298`, `UserMenu.tsx:517`).
   Şüpheli satırı elle aç.
2. Hükmü grep'ten değil **çalışan üründen** ver: ekran metnini oku ve gerçek
   dışa aktarım dosyasını (DOCX/PDF) üretip **içine** grep at.
3. Kartın grep listesinin **dışındaki** aynı sınıf stringleri de ara. m11'de
   listede olmayan `tenantName: 'FonBridge Teknoloji A.Ş.'`
   (`src/app/api/documents/export/route.ts:35-36`) hâlâ her belgeye basılıyordu —
   kart kapsamı dışı ama aynı kusur.

İlgili: [[fabrika-verify-backlog-before-assigning-finds-worse]]
