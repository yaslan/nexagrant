---
name: fabrika-turkce-grep-yanlis-pozitif-alici
description: Türkçe metinde alt-dize grep'i yanlış pozitif üretir (kalıcı→alıcı, kept→KEP) — "VAR" hükmü vermeden önce her eşleşmenin BAĞLAMINI bas
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Türkçe (ve TR/EN karışık) kataloglarda ham `grep -o "<kelime>"` sayımı uyum denetimi için
tek başına KANIT DEĞİLDİR. 2026-09-10'da iki kez yakalandı:

- `alıcı` → 4 eşleşme; dördü de **"k-alıcı"** (`kalıcı olarak silinir`). Gerçek "alıcı
  (recipient)" geçişi **0**. Sayıya güvenilseydi "alıcılar metinde anılıyor" denecekti —
  KVKK md.10/1-c için tam ters hüküm.
- `kep` → 1 eşleşme; İngilizce **"kept"** kelimesinden. Gerçek KEP adresi **0**.

**Kural:** bir kelime taraması "VAR" hükmüne dönüşecekse eşleşmenin **bağlamını** (çevresindeki
60-100 karakteri) bas ve gözle doğrula. Yanlış pozitif riski yüksek TR alt-dizeler: `alıcı`
(kalıcı, çalıcı), `onay` (konaklama), `rıza` (arıza), `iz` (izin, temiz), `ad` (adım, kadar).
Sıfır sonucu güvenlidir, pozitif sonuç şüphelidir.

Aynı disiplin sayımlarda da geçerli: tabloyu yazdıktan sonra ✅/⚠️/❌ satırlarını **yeniden say**;
ilk toplamım 6/2/10 çıktı, gerçek 5/2/11'di.

İlgili: [[fabrika-brand-interpolation-blanks-legal-copy]]
