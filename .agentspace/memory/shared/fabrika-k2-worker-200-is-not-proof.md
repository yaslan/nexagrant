---
name: fabrika-k2-worker-200-is-not-proof
description: Fire-and-forget bir uçtan gelen 2xx, işin yapıldığının değil isteğin alındığının kanıtıdır — K2/CORDIS'te ölçüldü; worker 2026-09-08'de eşzamanlı hale getirildi, ama kural her worker için geçerli
metadata:
  type: project
  updatedAt: 2026-09-08
---

## Genel kural (kalıcı olan kısım)

Bir uç isteği arka plana atıp hemen 200 dönüyorsa, o 200 **işin yapıldığını değil, isteğin
alındığını** söyler. Çağıran taraf bunu `success: true` diye kaydederse, boru hattı tamamen
çökmüşken bile yeşil bir koşu raporu üretirsin. Tek geçerli kanıt **hedef tabloların koşu
öncesi/sonrası satır sayısıdır**.

## Bu depodaki örnek — ARTIK DÜZELTİLDİ (766944e, 2026-09-08)

`workers/cordis/main.py` şunları birlikte yapıyordu: işi `BackgroundTasks`'a atıp hemen 200
dönmek, hatayı `except Exception: print(...)` ile yutmak ve şemada **olmayan** üç tabloya
(`"Organization"`, `"Project"`, `"Participation"`) yazmak. Sonuç: her koşu sıfır satır
yazıyordu, K2 ise `success: true` kaydediyordu.

Şimdi: `/jobs/cordis` boru hattını **cevaptan önce** koşturuyor; başarı 200 + gerçek
`rowCounts`, başarısızlık 500, ve `CordisImportRun` satırı `FAILED` olarak kalıyor.
`k2-monthly-cordis.ts` 2xx gövdesindeki `success: false`'u da başarısızlık sayıyor.

**Nasıl uygula:** Yeni bir worker ucu yazarken varsayılanın *eşzamanlı sonuç* olsun; gerçekten
uzun bir iş için arka plana at ama koşuyu `CordisImportRun` gibi kalıcı bir kayda yaz ve
çağırana durum sorgusu ver. "Koştum, success döndü" ASLA rapor kanıtı değildir.

İlgili: [[fabrika-fire-and-forget-worker-fakes-success]] ·
[[fabrika-phantom-model-bug-also-lives-in-the-python-worker]] ·
[[fabrika-prisma-client-side-defaults-are-not-db-defaults]] ·
[[fabrika-live-postgres-for-evidence]]
