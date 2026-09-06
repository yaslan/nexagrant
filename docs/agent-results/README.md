# docs/agent-results/ — okuma kılavuzu

Bu klasör, projede çalışan ajanların görev sonuç raporlarını tutar. Proje bir
ajan takımından diğerine devredildiği için (bkz.
`.agentspace/memory/shared/fabrika-team-handover-cekirdek.md`) kök klasörde iki
farklı dönemin raporları bir arada bulunuyordu; bu dosya o karışıklığı çözer.

## Takım ayrımı — dosya adına değil, rapor içeriğine göre

İlk taramada yalnız `-0c1f10` soneki mekanik ölçüt olarak kullanılmıştı, ama
kökte kalan `cora`/`derin`/`defne`/`sora`/`product`-adlı dosyaların **içeriği**
okununca (her raporun kendi "Ajan:" satırı, ya da agent-memory dizinindeki
karşılığı) bunların da eski takıma ait olduğu doğrulandı — sonek dosya adında
görünmese de. Kanıt: `.agentspace/memory/agents/blok-zincir-lead/agentspace-cross-team-delegation-grant.md`
şunu ölçüyor: *"Fabrika uzmanları (cora/defne/sora/derin) cekirdek takımında
değil"*. Ayrıca `TASK-MTQ3DZS6W6DFC-product.md` dosya adında "product" yazsa
da içeriği `Ajan: Sora (sora-0c1f10)` diyor; `TASK-MTPZC55KNA4FU-cora.md`
içeriği `Yürüten ajan: derin-0c1f10` diyor. Yani **dosya adı takımı garanti
etmiyor** — bu tür bir karışıklıkla tekrar karşılaşırsan içeriği oku.

- **`archive-team-0c1f10/`** → eski takıma (cora/defne/sora/derin, hangi
  isimle/sonekle imzalanmış olursa olsun) ait TÜM raporlar + onlara özel
  ekran görüntüsü klasörleri + `PLAN-E10-FINAL-20-E11-M6.md` (eski takıma iş
  dağıtan planlama dokümanı).
- **Kök klasör** → yalnız içeriği Çekirdek takımının bilinen ajan adlarıyla
  imzalı raporlar kaldı: `geli-tirici`, `blok-zincir-dse`, `blok-zincir-lead`
  (+ henüz rapor üretmemiş `blockzincir-pm`, `customer-support`,
  `blog-yazar`, `ex-en`).

## Tekilleştirme

`DALGA-1-geli-tirici.md` ve `TASK-MTQ61HQDX035M-geli-tirici.md` birebir aynı
içerikti (md5 `bfced4bf43b673dddf4726a3f002f34c`, 16480 bayt). Görev-kodlu
dosya adı (`TASK-MTQ61HQDX035M-geli-tirici.md`) tutuldu, diğeri silindi.

## Adlandırma kuralı (yeni raporlar için)

`<GÖREV-KODU>-<kalıcı-ajan-kimliği>.md` — görev kodu board'daki `TASK-…`/
`ADP-…`/epik kodu, ajan kimliği o ajanın **kalıcı** kimliği (görünen ad
değişse bile sabit kalan). Aynı göreve ikinci bir deneme gerekirse
`-2`, `-3` … soneki eklenir (ör. `TASK-MTPZEESJPKGCY-defne-0c1f10-2.md`).
Ekran görüntüsü/kanıt dosyaları varsa `<GÖREV-KODU>-screenshots/` alt
klasöründe, raporla aynı kökte tutulur.
