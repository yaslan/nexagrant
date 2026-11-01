---
name: fabrika-20-percent-vat-hides-rounding-bugs
description: Türkiye'nin standart %20 KDV'sinde float-vs-tamsayı yuvarlama farkı MATEMATİKSEL OLARAK imkânsızdır — para yuvarlama hatasını %20 ile sınayan bir test/örnek daima yeşil yanar; %1, %10, %18 veya kesirli miktar kullan
metadata:
  type: project
  updatedAt: 2026-09-09
---

## Kural
`vatOnNetMinor(net, 20)` = `net × 20 / 100` = `net / 5`. Yarım kuruşluk bir berabere
(tie) için `net × 2`'nin tek olması gerekir — imkânsız, `net × 2` daima çifttir.
Yani **%20'de half-up ile `toFixed(2)` asla ayrışmaz.** Ölçtüm: 1 – 3.000.000 kuruş
aralığında, quantity ∈ {1..12, 24, 36} için **sıfır** sapma.

**Why:** TASK-MTTUSEJFOSPI'de `efatura.ts`'in XML satır bloğu gerçek bir çift-kural
hatası taşıyordu (float + `toFixed(2)`, belge toplamları ise `money.ts`). Kartın
önerdiği tekrar-üretim vakası `quantity=3, birim 19.99, %20` idi ve **sapmıyordu** —
o vakayla "sorun yok" sonucuna varmak mümkündü. Standart oran bu sınıf hatanın
kör noktasıdır.

## How to apply
Para yuvarlama hatası ararken/pinlerken %20 kullanma. Gerçekten sapan, elle
hesaplanmış vakalar (hepsi ölçüldü, `toFixed(2)` solu basıyor):

| Vaka | float | kesin (half-up) |
|---|---|---|
| ₺10.25 × 1 @ **%18** → 1025×18/100 = 184.5 | `1.84` | **`1.85`** |
| ₺10.05 × 1 @ **%10** → 1005×10/100 = 100.5 | `1.00` | **`1.01`** |
| ₺10.05 × 10 @ **%1** → 10050×1/100 = 100.5 | `1.00` | **`1.01`** |
| ₺1.13 × **0.5 adet** @ %0 → 0.5×113 = 56.5 (satır **matrahı**) | `0.56` | **`0.57`** |

Son satır ayrı bir sınıf: `invoiceLineSchema.quantity` `z.number().positive()`,
yani kesirli miktar meşru ve orada sapan şey verginin değil satırın kendi net tutarı.
Bir "para tamsayıya taşındı" işinde bu vakayı da koy.

Sapma aramanın en hızlı yolu, iki kuralı düz JS'te yeniden yazıp brute-force taramak
(oran × birim fiyat × miktar); hangi oranların hiç sapmadığını da böyle öğrenirsin —
ve raporda "bu oranda sapma yok" demek, sapmayı bulamamış olmaktan farklı bir iddiadır.

İlgili: [[fabrika-consolidation-test-needs-equality-and-an-oracle]] ·
[[fabrika-vat-inclusive-split-cannot-hit-every-amount]] ·
[[fabrika-a-refactor-docstring-claims-work-that-may-not-exist]]
