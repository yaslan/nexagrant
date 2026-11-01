---
name: fabrika-fake-showcase-bind-or-remove-needs-a-persistence-check
description: "\"Sahte vitrini gerçek duruma bağla ya da kaldır\" kararını vermeden ÖNCE o durumun kalıcı bir tablosu var mı diye bak — yoksa bağlamak yeni bir yalan üretir"
metadata:
  type: project
  updatedAt: 2026-09-08
---

Fabrika'da "şu bileşen hiçbir duruma bağlı değil: ya bağla ya kaldır" biçiminde
gelen kartlarda ilk komut grep değil, **şema sorgusu** olmalı: gösterilecek durumu
saklayan bir tablo/kolon gerçekten var mı?

M10 çift onay banner'ında (TASK-MTS808DKQTOQ9) `DualApprovalState`'i saklayan hiçbir
tablo yoktu — `FollowupDoc` yalnız `signedAt` taşıyor. Banner'ı olduğu gibi aksiyonlara
bağlamak, "Finans onayladı" diyip yeniden yüklemede kaybolan bir ekran üretecekti:
statik vitrinden farkı yok, sadece daha inandırıcı.

İşe yarayan üçlü karar:
1. Gerçek server action'a bağla (aktör oturumdan gelir, uydurulmaz).
2. Akışın **sonucunu** var olan kalıcı kayda yaz — burada son adım `signDocument`
   çağırıyor, yani 4. aşama "gerçekten imzalı" demek ve reload'dan sağ çıkıyor.
3. Kalıcı olmayan ara adımları ekranda **açıkça söyle** ("ara adımlar yalnız bu
   oturumda tutulur"). Sessiz bırakmak, olmayan bir dayanıklılığı ima etmektir.

Şema değişikliği görev dosya listesinin dışındaysa 3. madde tek dürüst çıkış; eksik
kalıcılığı ayrı bir kusur olarak raporla.

Benzer tuzak: kart "repoda hiç çağrılmıyor" derse bunu **üretim yolu** ve **test**
diye ikiye ayırıp ölç — M10'da iki aksiyonun üretimde çağıranı yoktu ama birim testi
vardı; "hiç çağrılmıyor" cümlesi olduğu gibi rapora yazılırsa yanlış olur.

Bağlantılı: [[fabrika-check-every-surface-not-the-fix]],
[[fabrika-agents-share-one-working-tree]]
