---
name: fabrika-an-empty-report-skeleton-forges-a-done-signal
description: "Önce raporun iskeletini yaz" talimatım sahte BİTTİ sinyali üretti — denetim defteri tamamlanmayı DOSYA VARLIĞINDAN okuyor, içeriğinden değil
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`TASK-MTTUUGKNDGBXK` üç kez rapor üretmeden düştüğü için dördüncü dağıtıma şu talimatı
koydum: *"Bu sefer İLK yazacağın şey sonuç dosyasının iskeleti olsun, sonra doldur —
kanıtsız düşmemek için."* Worker iskeleti yazdı ve tam orada durdu. Diskte kalan:

```
# TASK-MTTUUGKNDGBXK — Alarm konsolu boğulmuş
**Durum:** IN PROGRESS (iskelet — dolduruluyor)
## 1. Ne yapıldı
_(doldurulacak)_
## 2. Kanıt
_(doldurulacak)_
...
```

22 satır, altı başlık, sıfır kanıt. Denetim defteri bunu **`tespit=evidence` → done** olarak
raporladı ve kuyruk kartı bitmiş sayıp ilerletti. Yani talimatım, önlemeye çalıştığım şeyin
tam tersini üretti: kanıtsız sessiz ölüm yerine **kanıtsız GÜRÜLTÜLÜ "başarı"**. İkincisi
daha kötü, çünkü ilki beni uyarır, ikincisi kartı kapattırır.

**Kök neden:** tamamlanma tespiti dosyanın VARLIĞINA bakıyor, İÇERİĞİNE değil. Sonuç `.md`
dosyası bu ofiste bir "bitti" bayrağıdır — erken dikilirse yalan söyler.

**Nasıl uygulanır:** Karta "önce iskeleti yaz" YAZMA. Bunun yerine:
> Ara notların gerekirse `docs/agent-results/<TASK-ID>-evidence/` altına `.txt` olarak koy.
> Sonuç `.md` dosyasını ANCAK içinde gerçek kanıt varken oluştur.

Kanıt dizini bayrak değildir, güvenle erken yazılır. Ve bir kart "bitti" geldiğinde raporu
`wc -l` + `grep -c 'doldurulacak\|IN PROGRESS\|TODO'` ile bir saniyede ele: ince rapor
(<40 satır) ya da yer tutucu içeren rapor kart KAPATMAZ.
Bkz. [[fabrika-delegation-verdict-wrong-both-directions]] — bu, "done + kanıt dosyası"nın
yanlış olabildiği en ucuz tespit edilebilir hâli.
