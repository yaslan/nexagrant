---
name: a-check-whether-the-invariant-already-lives-in-a-caller
description: Dışa açık bir fonksiyonda kusur bulduğunda, düzeltmeden önce ÇAĞIRANLARI oku — kural çoğu zaman zaten orada elle uygulanıyordur; bu hem doğru düzeltmenin kanıtı hem de "üretimde ulaşılabilir mi" sorusunun cevabıdır
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Fabrika TASK-MTVR9F6VLZ1WM: `calculateConsensusOutcome` marksız değerlendiriciyi
"kimseyle anlaşmayan kişi" sayıyordu. Düzeltmeden önce çağıranları taradım ve
`getPanelScoresForProposal` içinde şunu buldum:
`.filter((r) => Object.keys(r.scores).length > 0)`.

İki şey birden çıktı:

1. **Doğru düzeltmenin gerekçesi hazır geldi.** Kural yeni icat edilmiyor;
   modülün kendi okuma yolu zaten "marksız değerlendirici masada değildir" diyor.
   Kuralı fonksiyona taşımak = iki giriş noktasını aynı fikirde yapmak.
   Tasarım tartışması ("0 mu sayalım, atalım mı") kanıta indi.
2. **Ulaşılabilirlik cevabı da oradaydı.** O filtre + `Score` satırlarından
   gruplayan diğer çağıran yüzünden kusur bugün ÜRETİMDE ULAŞILAMAZ. Raporda
   bunu açıkça yazmak zorundayım — yoksa gizli bir sözleşme kusurunu "canlı
   hata düzeltildi" diye satmış olurum.

Refleks: fonksiyon-içi kusurda önce `grep -rn "<fnAdı>"` ile TÜM çağıranları oku.
Çağıranda elle uygulanmış bir guard varsa, o guard hem tasarım kararının kanıtı
hem de patlama yarıçapının sınırıdır.
