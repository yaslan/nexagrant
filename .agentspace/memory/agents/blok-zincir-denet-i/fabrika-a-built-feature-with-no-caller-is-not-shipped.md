---
name: fabrika-a-built-feature-with-no-caller-is-not-shipped
description: Yeşil birim testi ve temiz typecheck bir özelliğin ÇALIŞTIĞINI kanıtlar, KULLANILDIĞINI değil — bitmiş saydığın her yeni fonksiyon için `grep -rn <isim> src` ile üretim çağıranını ara
metadata:
  type: feedback
updatedAt: 2026-09-08
---

Faz 1'de `plansVisibleToTenant` / `listPublicPlans` yazıldı, RLS altında ölçüldü, 10 test yeşildi — ve **üretimde tek bir çağıranı yoktu**. Fiyat sayfası, faturalandırma paneli, yönetici paneli ve checkout hâlâ statik `catalog.ts`'i okuyordu, yani stüdyoda yayınlanan paket satın alınamıyordu. Kapı bunu göremez: fonksiyon derleniyor, testleri geçiyor, kimse çağırmıyor.

**Kök neden:** "repository katmanı bitti" ile "özellik teslim edildi" ayrı şeyler. Test dosyası da bir çağırandır ve `grep` sonucunu yeşil gösterir — bu yüzden arama **testler hariç** yapılmalı.

**Nasıl uygulanır:** Yeni bir okuma/yazma fonksiyonu "bitti" diye işaretlenmeden önce
`grep -rn "<fonksiyonAdı>" src app | grep -v "\.test\.\|\.spec\."`
koş. Sonuç boşsa iş bitmemiştir; kalan yarıyı ya aynı karta ekle ya da raporun "Açık sorular"ında ADIYLA bildir (Faz 1 raporunun §5.3'ü tam da bunu yaptığı için bu kart açılabildi).

Aynı sınıf: [[fabrika-schema-done-means-information-schema]] (şema "bitti" ≠ tablo var) — ikisi de "beyan edilen ≠ ölçülen" ailesinden.
