---
name: fabrika-cross-verification-needs-a-falsifying-probe
description: Doğrulama görevi "raporu oku + komutu tekrar koş" ile yazılırsa hiçbir şey kanıtlamaz — her doğrulama kartına iddiayı ÇÜRÜTMEYE çalışan bir sonda adımı konur
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Çapraz doğrulama turunda (kartı yazan ≠ doğrulayan) asıl kalite, kimin
doğruladığında değil, doğrulama adımının **iddiayı çürütmeye çalışıp
çalışmadığında**. "Raporu oku, komutları tekrar koş, yeşil mi bak" turu,
yazarın yeşilini ikinci kez görmekten ibaret.

**Why:** Bu ofisteki kusurların çoğu "sessiz başarı" sınıfından — kapı hüküm
vermiyor ama komut exit 0 dönüyor (i18n kapısı uyarıya çeviriyordu; K2 worker'ı
çökünce bile "başarılı" diyordu; override şemada olmayan tabloyu typecheck'ten
geçiriyordu). Bu sınıfta yeşil çıktı, kapının çalıştığının DEĞİL, sadece
koştuğunun kanıtı.

**How to apply:** Her doğrulama kartına iddiayı bozmayı deneyen somut bir adım
yaz: i18n kapısı için "bir çeviri anahtarını kasten eksik bırak, kapı DURDURUYOR
mu"; sessiz-başarı için "worker'ı kasten çökert, `FAILED` kalıyor mu"; şema
kapısı için "hayalet kolon yazan sonda dosyası kur, yakalıyor mu"; tekrar
koruması için "aynı uyarıyı 3 kez üret, sonra FARKLI bir uyarı üret — ikincisi de
bastırılıyorsa bu regresyon". Sondayı sildirmeyi ve kasten bozulanı geri
aldırmayı DoD'a koy, yoksa ağaç kirli kalır
([[fabrika-verification-round-waits-for-an-empty-tree]]).
