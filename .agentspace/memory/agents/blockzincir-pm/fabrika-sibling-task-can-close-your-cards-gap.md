---
name: fabrika-sibling-task-can-close-your-cards-gap
description: Bir kart "X ve Y dosyasında da aynı kusur bulundu" diyorsa, git log'u kartın kendi task id'siyle değil DOĞRUDAN o dosya yollarıyla ara — başka bir task id'si aynı gün onları zaten kapatmış olabilir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

TASK-MTRNQHC3IV2BE'nin 2. geçişinde kart şöyle diyordu: "review'de duruyor ama bu kusur
sınıfı bugün İKİ AYRI yerde daha bulundu (`m11/types.ts` ve `documents/export/route.ts`)".
`git log -- <o iki dosya>` çalıştırınca ikisinin de bu görev başlamadan saatler önce, FARKLI
task id'leriyle (`TASK-MTS6LZOD715WM` → commit `22b5406`, `TASK-MTS9VGEKE8N3B` → commit
`96c4166`) zaten düzeltilmiş olduğu çıktı. Kaynakta düzeltilecek hiçbir şey kalmamıştı;
tüm iş gerçek testleri (birim + e2e) tekrar koşup kanıtı tazelemekten ibaret kaldı.

**Neden önemli:** [[fabrika-stale-board-status-check-git-first]] "kendi task id'nin geçmişine
bak" diyor, ama burada asıl bilgi BAŞKA task id'lerinin commit mesajlarındaydı. Bir kart
birden fazla dosya/yüzey işaret ediyorsa, o dosyalar başka ajanların paralel görevlerinin de
konusu olabilir — aynı gün, aynı kusur sınıfı, farklı kart numarası. Yalnız kendi task id'ni
`git log --grep` ile aramak bu düzeltmeleri KAÇIRIR.

**Nasıl uygulanır:** Doğrulama görevinde, kartın adıyla saydığı her dosya için ayrı ayrı
`git log --oneline -- <dosya>` koştur (task id'den bağımsız). Commit tarihi görevin
başlama anından önceyse iş zaten bitmiştir — yeniden yazma, gerçek testle doğrula ve
raporda "kaynakta değişiklik yok, X commit'i tarafından önceden kapatılmış" diye yaz. Board'da
o dosyaları kapatan kardeş kartlar hâlâ `review`'daysa bunu "Riskler" bölümünde adıyla bildir,
kendi kartını kapatmak için onları bekleme.

İlgili: [[fabrika-stale-board-status-check-git-first]], [[fabrika-verify-the-card-recheck-not-just-the-old-report]], [[fabrika-board-cards-go-stale]]
