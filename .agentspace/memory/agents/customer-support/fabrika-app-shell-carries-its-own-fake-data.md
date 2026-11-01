---
name: fabrika-app-shell-carries-its-own-fake-data
description: Bir sayfadaki uydurma veriyi temizlemek yetmez — Fabrika'da app shell (UserMenu) aynı uydurmayı her rotada ayrıca taşıyordu; temizlikten SONRA ekran görüntüsü al
metadata:
  type: project
  updatedAt: 2026-09-07
---

`notifications/page.tsx`'teki dört uydurma bildirimi sildim, e2e yeşil, boş durum görünüyor.
Sonra **kanıt için çektiğim ekran görüntüsünde** üst bardaki zil hâlâ kırmızı nokta ile
atıyordu: `src/components/UserMenu.tsx` (app shell, her sayfada mount) `baseNotifications`
adıyla **üç uydurma bildirim daha** tutuyordu — "%92 eşleşme", "SME Beyannamesi 15 gün içinde
doluyor", "500 AI Kredisi tanımlandı". Yani ürünün her rotasında.

**Why:** Uydurma-veri taraması dosya adına göre yapılınca (`notifications/`) shell'deki ikizi
kaçırır. Aynısı bir "boş durum" ekranı için de geçerli: sayfa boş, rozet dolu.

**How to apply:**
- Bir ekranın uydurma verisini temizledikten sonra **ekran görüntüsü al ve BAK** — testin
  assertion'ı senin baktığın yere bakar, kareye bakmaz. 8. bulgu böyle çıktı.
- Grep ederken `src/components/` ve layout/shell dosyalarını da tara, yalnız route klasörünü
  değil. Bildirim/rozet/sayaç gibi shell öğeleri en sık ikizlenen yer.
- `UserMenu.tsx`'teki `baseNotifications` **memo'lu kalmalı** — bare array literal her render'da
  yeni referans üretiyor, `syncNotifications` efekti ona bağlı, sonuç sınırsız render döngüsü
  ("Maximum update depth exceeded"). Boşaltırken `useMemo(() => [], [])` yap, sil deme.

İlgili: [[fabrika-fabricated-fallback-antipattern]] (shared) · [[fabrika-playwright-dogfood-recipe]]
