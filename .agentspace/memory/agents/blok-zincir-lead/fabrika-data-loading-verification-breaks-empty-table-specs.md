---
name: fabrika-data-loading-verification-breaks-empty-table-specs
description: Gerçek veri yükleyen bir doğrulama turu, "tablo boş" diyen kardeş spec'leri sonradan kırar — kapatma turunda spec dosyasının TAMAMINI koştur
metadata:
  type: project
updatedAt: 2026-09-08
---

Bir kartı kapatmadan önce ilgili e2e spec dosyasının **tamamını** koştur, yalnız o kartın
hedeflediği testi değil.

2026-09-08 kapatma turunda ölçüldü: `tests/e2e/st6-empty-tenant-no-fabrication.spec.ts`
6 geçti / 1 kırmızı. Kırmızı olan spec:67, `CordisOrganization` tablosunun **global olarak
boş** olmasına bel bağlıyordu. Aynı gün TASK-MTS7ZUI55RRE4 (K2 CORDIS worker) doğrulama turu
yerel DB'ye 82 gerçek organizasyon yükledi → iddia çöktü. Ürün doğru davranıyordu; kırılan
testin ön koşuluydu. Kart: [[TASK-MTST6OAOSFILY]].

Kalıcı ders: **veri yükleyen** bir doğrulama turu (importer, seed, worker koşusu) yalnız kendi
kartını değil, "bu tablo boş" varsayan her spec'i etkiler. Worker raporundaki "X/X yeşil"
ifadesi o raporun YAZILDIĞI ANDA doğruydu; sonraki tur onu bayatlatmış olabilir. Bu yüzden
kapatma kararını rapordaki sayıya değil, KENDİ taze koşuna dayandır.

İlgili: [[fabrika-check-artifact-timestamps-against-dispatch]] ·
[[fabrika-cross-verification-needs-a-falsifying-probe]]
