---
name: fabrika-group-the-alert-pile-it-names-your-next-card
description: Alarm yığınını kaynağa göre grupla — tepedeki kaynak, backlog'da bekleyen kartın adını söylüyor; ve düşen bir delegasyonun kanıt dizini bunu zaten ölçmüş olabilir
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`TASK-MTTUUGKNDGBXK` (alarm konsolu) iki kez denendi, iki kez **rapor üretmeden düştü**.
Yeniden dağıtmadan önce kanıt dizinine baktım — düşen ilk koşu ölçümü ZATEN yapmış ve
diske bırakmıştı (`01-alert-pile-before.txt`, `probe-alert-pile.mts`). İçinde şu vardı:

```
total rows : 106     open : 106     resolved : 0
  82  (77.4%)  invoice_buyer_identity_missing
   8  ( 7.5%)  k2_monthly_cordis
   7  ( 6.6%)  k1_daily_calls
   ...
```

İki şey birden çıktı. Birincisi: kartın başlığındaki **"62 alarm" sayısı bayattı**, bugün 106.
İkincisi ve asıl olan: yığının **%77'si tek kaynak**, ve o kaynak
(`invoice_buyer_identity_missing`, `src/lib/billing/invoice-writer.ts:400`) tam olarak
**backlog'da el sürülmemiş bekleyen bir P0'ın** adı — `TASK-MTSY71BUMBLWM`
("TenantBillingIdentity'yi dolduran ekran yok"). Teyit ettim: `grep -rln TenantBillingIdentity src/`
yalnız üç `src/lib/billing/*` dosyası döndürüyor, `src/app/` altında o tabloyu YAZAN hiçbir
sayfa/form/rota yok. Kartı backlog'dan çıkarıp P0 olarak dağıttım.

**Neden önemli:** Alarm yığını "gürültü, temizlenecek" diye okunuyor — oysa kaynağa göre
gruplanmış hâli bir **önceliklendirme ölçümüdür**. Operatörün konsolunu boğan şey rastgele
106 olay değil, yapılmamış TEK bir işti. Backlog sıralamamın yanlış olduğunu bana panodaki
hiçbir kart söylemedi; alarm tablosunun `GROUP BY source` çıktısı söyledi.

**Nasıl uygulanır:** Bir alarm/hata yığını kartı dağıtırken ilk adım "temizle" değil,
`GROUP BY source` + "her grup hâlâ geçerli mi" olsun; tepedeki kaynağı üreten kod satırını
bul ve panoda ona karşılık gelen kart var mı diye BAK — çoğu zaman vardır ve yanlış yerde
durur. Ayrıca: **düşen bir delegasyon iş bırakmış olabilir.** Yeniden dağıtmadan önce
`docs/agent-results/<TASK-ID>-evidence/` ve `-screenshots/` dizinlerine bak; bulduğunu yeni
görev metnine ÖLÇÜLMÜŞ GERÇEK olarak yaz ki worker sıfırdan ölçmesin ve kartın kendi bayat
sayısına aldanmasın. Bu, [[fabrika-delegation-verdict-wrong-both-directions]]'ın pratik yüzü:
"failed" damgası işin yapılmadığı anlamına gelmiyor.
