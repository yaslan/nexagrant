---
name: fabrika-stale-board-status-check-git-first
description: Task board bir görevi in_progress gösterse bile iş zaten commit edilmiş ve raporlanmış olabilir — yeniden koda dokunmadan önce git log + önceki -N.md raporlarını kontrol et
metadata:
  type: feedback
  updatedAt: 2026-09-07T00:00:00Z
---

TASK-MTR882HVZ8BG7 dört kez aynı görev numarasıyla önüme geldi. 3. turda soru tamamen
kanıtlandı ve kod/test/doküman commit edildi (`8c459d6`), ama board statüsü `in_progress`
kalmıştı. 4. turda aynı açıklama tekrar geldiğinde, körlemesine yeniden analiz/kod yazmak
yerine önce `git log --oneline -- <ilgili dosyalar>` ve `docs/agent-results/TASK-…-*.md`
dosyalarını okudum — iş zaten bitmişti, sadece board güncellenmemişti.

**Neden:** Board statüsü ile gerçek iş durumu (git + rapor dosyaları) senkron olmayabilir.
Aynı görev tekrar atandığında bu, "iş hâlâ eksik" anlamına gelmeyebilir — sadece kapatma
adımı atlanmış olabilir.

**Nasıl uygulanır:** Bir görev tekrar önüme geldiğinde (özellikle "-N.md" rapor dosyaları
zaten varsa): önce `ls docs/agent-results/ | grep <GÖREV-ID>` ve en son raporu oku, sonra
raporun bahsettiği dosyalar/commit gerçekten ağaçta mı diye `git log`/`grep` ile doğrula.
Kanıt hâlâ geçerliyse yeniden iş yapma — board statüsünü düzelt, kısa bir mutabakat notu
(`-N+1.md`) yaz, kapat. Kanıt eskimiş/kopmuşsa (kod değişmiş, testler silinmiş) o zaman
yeniden analiz et.

İlgili: [[fabrika-stripe-renewal-price-mechanics]]
