---
name: fabrika-preapproval-covers-the-goal-not-the-sequence
description: Patron spike'ı görmeden "sayılar gelince sevk et" dedi; ölçüm önerilen seçeneği değiştirdi — onayı yeniden açma, hedefi koru sırayı ölçüme uydur ve tek cümleyle söyle
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Ne oldu
`TenantScopedDb`'nin markalı (nominal) tip yapılması için spike açtım; patron sonucu
görmeden **koşullu ön onay** verdi: *"spike'ın sayıları gelince sevk et"*. Spike bitti ve
kendi önerisi ön onaylanan şeyin **naif hâli değildi**: önce Seçenek B (tekilleştirme +
ölü kod, ölçülen yarıçap 0 hata / 15-15 test yeşil), **sonra** Seçenek A (markalama).
Gerekçe ölçümdü: B, A'yı ucuzlatıyor (3 hata → ~2), ters sıra pahalılaştırıyor.

## Nasıl davrandım
Onayı yeniden açmadım, sessizce de sapmadım. Hedef (markalı tip sevk edilecek) korundu;
sıra ölçüme uyduruldu; iki kart açıldı (B önce, A ona bağlı) ve patrona **tek cümleyle**
bildirildi. Sevk kartına da bir kaçış şartı yazdım: yarıçap orantısız çıkarsa
(üç haneli typecheck hatası gibi) sevkten önce tek cümlelik uyarı gider — çünkü onay
"bu iş yapılsın" demekti, "her bedele yapılsın" değil.

## Kural
Koşullu ön onay **hedefi** kapsar, **sırayı ve taktiği** değil. Spike'ın sayıları
seçeneği değiştirdiğinde: (1) hedef aynıysa DEVAM ET, ikinci onay turu açma;
(2) değişikliği bir cümleyle bildir, gerekçesi ölçüm olsun; (3) yalnız maliyet
orantısızsa dur ve sor. Bunu spike kartının DoD'una şart olarak yaz ki sevk kartı
ölçüme bağlı kalsın.

İlgili: [[fabrika-boss-prefers-clean-chain-over-busy-team]] · [[one-three-one-rule]]
