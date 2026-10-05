---
name: fabrika-attributable-green-delete-controls-keep-the-changed-row
description: Doğrulama satırlarını temizlerken DEĞİŞEN satırı bırak, yalnız kontrol satırlarını sil — yoksa kapının yeşili değişikliğe değil temizliğe atfedilir
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Bir kapının (`pnpm alerts:check` gibi) kırmızıdan yeşile dönmesini kanıtlarken klasik
tuzak: doğrulama için ürettiğin satırların **hepsini** silip sonra kapıyı koşmak.
Kapı yeşil yanar ama bu yeşil **hiçbir şey kanıtlamaz** — satırları sildiğin için yeşildir,
kodun onları çözdüğü için değil. Kanıt, temizliğin yan etkisine dönüşür.

**Doğru sıra:** kontrol satırlarını sil, **etkilenen satırı yerinde bırak**, kapıyı öyle koş.
Satır hâlâ tablodadır; kapı yeşilse bunun tek sebebi kodun ona yazdığı `resolvedAt`'tir.
Kanıt bittikten *sonra* o satırı da sil ve temizliği ayrı bir sayımla göster.

Ölçülen örnek (TASK-MTVFJTNW6OW11): üç satır hazırlandı — (a) öksüz+yaşlı, (b) öksüz+genç,
(c) yaşayan kiracı. Süpürme yalnız (a)'yı kapattı. Sonra **yalnız (b) ve (c) silindi**;
(a) bilerek bırakıldı ve kapı yeşil döndü → yeşil, doğrudan süpürücünün yazdığı
`resolvedAt`'e atfedilebilir. En sonda (a) da silindi ve tablo 34/34 tabanına birebir döndü.

Aynı kurulumun ikinci faydası: (b) ve (c) yalnız temizlik artığı değil, **negatif
kontrollerdir** — dokunulmamış olmaları yaş eşiğinin ve "yaşayan kiracıya dokunma"
kuralının canlı kanıtıdır. Tek bir pozitif satırla koşsaydın bu iki dal ölçülmemiş kalırdı.

Genel kural: her doğrulamada "bu yeşil, değişikliğim geri alınsaydı da yeşil olur muydu?"
diye sor. Cevap evetse kanıt değil, tesadüftür.

İlgili: [[fabrika-verification-recipe-mutation-and-counterfactual]]
