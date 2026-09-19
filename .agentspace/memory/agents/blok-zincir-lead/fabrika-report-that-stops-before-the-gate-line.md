---
name: fabrika-report-that-stops-before-the-gate-line
description: Bir worker raporu teşhis ve düzeltmeyle bitip doğrulama koşusuna hiç gelmeden kesilebilir — kartı kapatmadan önce raporun SON başlığına bak
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

TASK-MTU4AYW5R9DGL'de blok-zincir-dev mükemmel bir teşhis raporu yazdı: devraldığı tema
hipotezini iki deneyle çürüttü, gerçek kök nedeni tarayıcıdan ölçtü (`loading.tsx` Suspense
sınırı → React sıra dışı akış tamponu `<div hidden id="S:0">` → belgede her id'den iki tane),
beklemenin çözmediğini zamanla kanıtladı, üretim derlemesinde de üretti, muhafız testinin
gerçekten kırmızı olduğunu gösterdi. Supervisor bunu **done · tespit=evidence** olarak işaretledi.

Ama rapor 145. satırda, "fixture tekrar koşulabilirliği" başlığının ortasında **bitiyordu**.
Düzeltmeden SONRA yedi testin yeşil olduğunu gösteren koşum ve `pnpm gate` çıktısı raporda
HİÇ YOKTU, ve değişiklikler commit bile edilmemişti. Yani kart "P0 kapı düzeltildi" diye
kapanabilirdi ve kapı kırmızı kalırdı.

Ders: **rapor kalitesi tamamlanma kanıtı değildir.** İyi yazılmış bir teşhis, doğrulamanın
yapıldığını hissettiriyor. Kartı kapatmadan önce bak:
- Raporun SON başlığı ne? Doğrulama/kapı durumu mu, yoksa ortada mı kesilmiş?
- Düzeltmeden SONRA alınmış bir koşum çıktısı var mı — sadece ÖNCEKİ kırmızı değil?
- `git log`'da o işin commit'i var mı? "done" işareti pane'in bittiğini söyler, işin
  bittiğini değil.

Bu yüzden doğrulama turunu ayrı bir delegasyon olarak açtım ve rapordan "kapı durumu"
başlığıyla bitirmesini ZORUNLU tuttum.

İlgili: [[fabrika-a-checked-box-that-confesses]] · [[fabrika-a-green-gate-may-predate-the-commit-it-closes]] · [[fabrika-supervisor-failed-verdict-may-be-a-derived-path-miss]]
