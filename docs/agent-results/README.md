# docs/agent-results/ — okuma kılavuzu

Bu klasör, projede çalışan ajanların görev sonuç raporlarını tutar. Proje bir
ajan takımından diğerine devredildiği için (bkz.
`.agentspace/memory/shared/fabrika-team-handover-cekirdek.md`) kök klasörde iki
farklı dönemin raporları bir arada bulunuyordu; bu dosya o karışıklığı çözer.

## Soneke göre takım ayrımı

- **`-0c1f10` sonekli dosyalar** (ör. `TASK-MTPZC55KNA4FU-defne-0c1f10.md`) →
  **eski ajan takımına** ait. Hepsi `archive-team-0c1f10/` altına taşındı.
  Bir raporun ekran görüntüsü klasörü **yalnızca** `-0c1f10` sonekli bir
  rapordan referans alınıyorsa o klasör de arşive taşındı
  (`TASK-MTQ3DLVLT42VF-screenshots`, `E10.1-E11.1-retry-screenshots`).
- **Sonek taşımayan dosyalar** kök klasörde kaldı. Bunların bir kısmı
  Çekirdek takımının bilinen ajan adlarını taşıyor: `geli-tirici`,
  `blok-zincir-dse`, `blok-zincir-lead`, `blockzincir-pm`,
  `customer-support`, `blog-yazar`, `ex-en`.

**Açık nokta:** Kökte ayrıca sonek taşımayan `cora`, `derin`, `defne-retry`
adlı dosyalar da var (ör. `TASK-MTPVAYDFKQ187-cora.md`,
`TASK-MTPZEESJPKGCY-derin.md`, `TASK-MTQ3DLVLT42VF-defne-retry.md`). Bu adlar
eski takımın da kullandığı adlarla aynı, ama sonek taşımadıkları için devir
talimatının harfine göre kökte bırakıldı. Bunların Çekirdek takımının aynı
kişiler tarafından (soneksiz) devam ettirilen işler mi, yoksa eski takımın
sonek eklenmeden önceki ilk raporları mı olduğu doğrulanmadı — taşımadan önce
sahibiyle teyit edin.

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
