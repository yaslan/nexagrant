---
name: fabrika-shared-json-whole-file-add-swallows-others-edits
description: messages/tr.json veya messages/en.json'a `git add <o dosya>` çağırmak, tam o anda dosyayı düzenleyen başka bir ajanın commit'lenmemiş satırlarını da stage'ler — dosya yolu tekil olsa bile içerik paylaşılıyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

## Ne oldu
[[TASK-MTR5BW053WWA8]]'de yalnız kendi kapsamıma ait dosyaları verdim:
`git add "consortium/manager.tsx" messages/tr.json messages/en.json` — `git add .`
ya da `-A` kullanmadım, talimata harfiyen uydum. Ama commit'i attığımda
`messages/tr.json`'a eklenen satır sayısı benim yazdığım ~16 değil ~50 çıktı;
`git show HEAD -- messages/tr.json` başka bir ajanın o anda commit'lemeden
düzenlemekte olduğu `Pipeline.detail.archive.*`, `effortTab.*`, `UserIdentity.*`,
`callDetails.*`, `callsPage.*` gibi ~95 anahtarı da benim commit'imin içine
almıştı (615→631 bana ait, 631→726 onlara ait).

## Kök neden
[[fabrika-agents-share-one-working-tree]] ve [[fabrika-concurrent-commit-steals-your-stage]]
"tek çalışma ağacı / tek index" riskini `-a` ya da commit anındaki yarış için
anlatıyor. Bu üçüncü, ayrı bir varyant: `git add <tek dosya yolu>` dosyanın o
andaki **tüm** çalışma-ağacı içeriğini stage'ler — sadece SENİN yazdığın
satırları değil. `messages/*.json` gibi paylaşılan tek bir dosyaya iki ajan aynı
anda farklı ad alanlarına yazıyorsa, dosya YOLU tekil olsa bile İÇERİK paylaşılıyor;
hangi ajan önce `git add` çağırırsa diğerinin commit'lenmemiş satırlarını da
kendi commit'ine yutar. Bu bir hata/çakışma değil — git sessizce "başarılı" der.

## Sonuç zarar mı verdi?
Hayır — JSON geçerliydi, tr/en parite (726/726) sağlamdı, veri kaybı yok. Tek
sonuç: o ajanın işi kendi commit mesajı yerine benimkinin altında tarihe geçti
(yanlış attribution, veri kaybı değil).

## Nasıl önlenir
- Commit'ten HEMEN önce `git diff --cached -- messages/tr.json messages/en.json`
  ile stage edilen diff'i GÖZDEN GEÇİR — kendi eklediğin anahtar bloğu dışında
  bir şey varsa (başka ad alanları, çok daha fazla satır), o an fark edilir.
  Ben bunu atladım; `git show --stat` yalnız dosya adını/satır sayısını gösterdi,
  içeriği göstermedi, ben de göze almadım.
- Fark edilirse: `git reset` ile geri alma yerine (paylaşılan `dev`'de geçmişi
  bozar) — [[fabrika-concurrent-commit-steals-your-stage]]'deki gibi, sonuç
  raporuna "commit X'te ayrıca Y ajanının şu anahtarları da gitti" diye NOT DÜŞ,
  geçmişi yeniden yazma.
- Genel kural: paylaşılan bir dosyaya `git add` ile `git commit` arasındaki
  pencereyi daralt (ikisini art arda çağır, arada başka komut çalıştırma) — bu
  pencere ne kadar kısa olursa "içine başka bir şey daha girme" ihtimali o kadar
  azalır, ama SIFIRA inmez; asıl güvence commit sonrası diff kontrolüdür.

İlgili: [[fabrika-agents-share-one-working-tree]] · [[fabrika-concurrent-commit-steals-your-stage]]
