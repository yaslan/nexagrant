---
name: fabrika-ask-workers-to-report-not-fix-adjacent-lies
description: Worker'a "yolun üstünde gördüğün kayıtsız rakamları DÜZELTME, ADIYLA BİLDİR" demek kapsamı korurken üç gerçek kart kazandırdı
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

TASK-MTR962OV5YGVX briefine bir madde koydum: "bu iki panelin tamamını tara;
kayda bağlı olmayan başka rakam görürsen kapsam dışıysa DÜZELTME, raporda
ADIYLA listele."

Sonuç: worker kartın işini bitirdi (kapsam kaymadı, gate yeşil) ve ayrıca dört
başlık getirdi — bunlardan üçü gerçek kart oldu:
- plan kartı metinleri `PLAN_GRANTS` ile 8 yerde çelişiyor (satılan ≠ verilen)
- ayarlar panelinde `usedSeats: 3` / `aiCreditsRemaining: 500` sabit; ayrıca
  `currentPlanId = 'team'` fallback'i bizim emekliye ayırdığımız plan id'si
- `DEMO_INVOICES` ekranda "GİB ONAYLI" rozetiyle ve çalışan indirmelerle
  gerçek fatura gibi duruyor

**Nasıl uygula:** her brief'e bu maddeyi koy. "Düzelt" deseydim kapsam patlardı
ve kanıt bulanıklaşırdı; "hiç bakma" deseydim bunlar görünmez kalırdı. Üçüncü
yol — GÖR, DOKUNMA, ADINI VER — ikisini de veriyor. Gelen başlıkları kart yap;
ürün kararı içereni (metin mi veri mi düzelecek) kodlamaya verme, karar kartı
olarak patrona bırak. [[fabrika-boss-prefers-clean-chain-over-busy-team]]
[[fabrika-billing-ui-lives-in-two-namespaces]]

**2026-09-08 ek — o bölüm artık backlog'un EN İYİ kaynağı.** geli-tirici'nin
`TASK-MTS6MFER9LQZR` raporundaki "§4 Yol üstünde görülen, DÜZELTİLMEYEN şeyler" tek başına
üç kart doğurdu: demo-tenant'taki iki kalıntı fırsat (tam id'leriyle), rollback çağırmayan iki
e2e spec, ve 404 üzerinden yeşil yanan m10 probe'u. Aynı gün dse'nin doğrulama raporunun
"AÇIK KALAN" maddeleri iki P0 çıkardı (`resend` beyan edilmemiş bağımlılık; `documents/export`
rotasında auth+kiracı yok).

Pratik sonuç: yeni dalga planlarken **önce bir önceki dalganın raporlarındaki "düzeltmedim,
bildiriyorum" bölümlerini oku** — kart uydurmaya gerek kalmıyor, üstelik bu maddeler zaten
ölçülmüş (id'ler, satır numaraları, komut çıktısı hazır), yani görev metni bir okumada yazılıyor.
Worker'a "adıyla bildir" demenin getirisi kusuru bulmak değil, **bir sonraki sprintin
hazır ve kanıtlı gündemi** olması.
