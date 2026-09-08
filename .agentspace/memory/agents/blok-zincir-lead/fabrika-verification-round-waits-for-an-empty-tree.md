---
name: fabrika-verification-round-waits-for-an-empty-tree
description: review kartlarının doğrulama turu ancak ekip boştayken koşulur — 7 ajan ortak ağacı düzenlerken koşan gate/e2e, kartların iddiasını değil worker'ların yarım işini ölçer
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

`review` kolonundaki kartların ortak iddiası "`pnpm gate` temiz"dir. Bunu TEK bir
gate koşusuyla toplu olarak sınamak cazip — ama ajanlar ortak çalışma ağacını
paylaşıyor ([[fabrika-agents-share-one-working-tree]]). Delegasyon uçuştayken
koşan gate, review kartlarını DEĞİL, o an düzenlenmekte olan yarım işi ölçer;
çıkan kırmızı hangi karta ait bilinmez, çıkan yeşil hiçbir şey kanıtlamaz.

**Why:** 2026-09-08'de 13 review kartını kapatmak için gate koşmayı düşündüm;
aynı dakika 7 worker pane'i `in-flight`'tı. Ölçüm contamine olurdu ve
"doğrulandı" damgası yanlış basılırdı — kanıt disiplininin tam tersi.

**How to apply:** Doğrulama turunu ekip boşalana kadar BEKLET; bu, boşta duran
ekipten daha iyidir ([[fabrika-boss-prefers-clean-chain-over-busy-team]]).
Beklerken masabaşı triyajı yap ama sınırını bil: raporlar DoD kutucuklarını
TEKRARLAMIYOR (grep ile açık/kapalı sayamazsın) ve içlerindeki `FAIL` satırları
çoğunlukla RED→GREEN kanıtının "önce" hâlidir — tek başına kusur sinyali değil
([[fabrika-check-artifact-timestamps-against-dispatch]]). Masabaşında güvenle
ayrılabilen tek iki sınıf: (1) tek açık maddesi LİDER KARARI olan kart — kararı
ver, kalan işi yeni karta taşı, kartı kapat; (2) dış bir tarihe bloke kart —
`review`'da durmamalı, `backlog`'a çekilmeli, doğrulama turuna hiç girmemeli.
