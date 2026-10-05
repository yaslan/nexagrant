---
name: fabrika-split-a-sequenced-card-at-its-file-boundary
description: Şema çakışması yüzünden sıraya alınan kart, dosyaya dokunmayan araştırma/ADR fazına bölünüp paralel koşturulabilir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08: TCMB/döviz faturası kartını (TASK-MTSWLWDONWA3W) `prisma/schema.prisma`
Invoice modelinde çakışma olacağı için P0'ın (TASK-MTSWL8ADKZKDM) arkasına sıraya
almıştım. Patron kartı yine de "şimdi yap" diye gönderdi.

Doğru çözüm sıralamayı savunmak ya da çakışmayı göze almak değildi: kartı **faz
sınırından** böldüm. Faz 1 (ölçüm + UBL-TR araştırması + 1-3-1 ADR + müşteri para
birimi dağılımı) hiçbir kod dosyasına dokunmuyor — yalnız rapor yazıyor. Onu hemen
paralel başlattım, alt-göreve yasak dosya listesini AÇIKÇA yazdım
(`prisma/schema.prisma`, `prisma/migrations/*`, `src/lib/efatura.ts`,
`src/lib/billing/*`, `src/lib/iyzico.ts`) ve DoD'a "hiçbir kod/şema dosyası
değişmedi, `git status` ile kanıtlı" maddesini koydum. Faz 2 (migration) P0 bitince
ayrı kart olarak açılır.

**Neden işe yarıyor:** bir kartın sıralanma gerekçesi genelde "düşünce bağımlılığı"
değil "aynı dosyaya yazma" oluyor. Bu ikisi ayrıldığında kartın yarısı çoğu zaman
bugün koşabilir. Sıraya alırken kendine sor: bu kartın hangi kısmı hiçbir dosyaya
YAZMIYOR? İlgili: [[fabrika-boss-prefers-clean-chain-over-busy-team]],
[[fabrika-file-ownership-delegation-works]]
