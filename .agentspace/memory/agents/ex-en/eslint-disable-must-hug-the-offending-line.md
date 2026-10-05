---
name: eslint-disable-must-hug-the-offending-line
description: eslint-disable-next-line direktifi ile hatalı satır arasına yorum/boş satır girerse bastırma çalışmaz — Fabrika'da 7 lint hatasının 4'ünün gerçek kök nedeni buydu
metadata:
  type: reference
  updatedAt: 2026-09-07
---

`// eslint-disable-next-line <kural>` **tam olarak bir sonraki satırı** kapsar. Araya gerekçe yorumu ya
da boş satır konursa direktif o yorumu kapsar, hata açıkta kalır ve ESLint bunu yalnızca bir
`Unused eslint-disable directive` **uyarısı** olarak söyler — 200+ uyarının içinde görünmez.

Doğru sıra: önce gerekçe yorumu, sonra direktif, hemen ardından hatalı satır. Direktif `useEffect`'in
üstüne değil, efektin İÇİNDE ihlal eden çağrının üstüne yazılır.

Bu, Fabrika lint kapısında 2026-09-07'de kalan 7 hatanın 4'ünün tek sebebiydi: bastırmalar zaten
yazılmıştı ama bir satır kaymıştı. Teşhis yolu: `pnpm lint -f json | head -1` çıktısında
`severity===2` filtrelemek + `Unused eslint-disable directive` uyarılarını aramak.

İlgili: [[fabrika-lint-gate-green-narrow-exceptions]]
