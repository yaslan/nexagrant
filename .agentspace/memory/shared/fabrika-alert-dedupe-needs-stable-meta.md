---
name: fabrika-alert-dedupe-needs-stable-meta
description: SystemAlert dedupe kimliği varsayılan olarak (level,source,message,meta) — oynak meta katlamayı öldürür; ARTIK çözüm meta'yı kısırlaştırmak değil dedupeKey vermek (2026-09-10 itibarıyla 21 üretim çağıranında bağlı)
metadata:
  type: project
  updatedAt: 2026-09-10
---

> **GÜNCELLEME 2026-09-10 (TASK-MTVFL8IJALB2H + TASK-MTVRBLKRUUEUM).** Aşağıdaki
> "değişken ayrıntıyı meta'dan çıkar ya da yeni satırı kabul et" ikilemi ARTIK
> geçerli değil: `RecordAlertInput.dedupeKey` üçüncü yolu açtı. Verildiğinde kimlik
> `(level, source, dedupeKey)` olur, `message` ve meta'nın geri kalanı yalnız
> görüntü detayı sayılır. Aşağıda "katlanmaz, yeni satır DOĞRU davranış" denen
> `k1_daily_calls` örneği de dahil 21 üretim çağıranı artık anahtar veriyor — yani
> o cümledeki hüküm ters çevrildi: K1'in duplicateIdentifiers listesi
> `k1:duplicate-identifiers` anahtarıyla **katlanıyor**, çünkü listenin değişmesi
> problemi ("bir besleme aynı id için iki kez cevap verdi") değiştirmiyor.
> Yeni bir çağıran yazarken önce şunu sor: bu alanın değişmesi **problemi mi**
> değiştiriyor, yoksa yalnız **oluşumu mu**? İkincisiyse anahtar ver.
> Ayrıntı: [[fabrika-dedupe-candidate-limit-caps-the-fold]]

`recordAlert()` (TASK-MTS80DUAF39Z8) aynı uyarıyı yeni satır açmak yerine AÇIK satırın
üstünde sayaçlar (`alertRepeatCount` / `alertLastSeenAt`). Kimlik:
`(level, source, message, çağıranın meta'sı)`. Bunun pratik sonucu, dedupe'un ne zaman
işe yaramayacağını belirler ve gelecekte "dedupe çalışmıyor" diye yanlış hata açtırır:

- **Katlanır** (ölçüldü): `k2_monthly_cordis` "CORDIS worker unreachable" —
  meta `{host, month}`, koşudan koşuya aynı. Aynı işi 3 kez koştum,
  tablo 16 → 16 satır, grup 4 satırda kaldı, oluşum 6 → 9.
- **Katlanmaz** (ölçüldü): `k1_daily_calls` "K1 sources returned N identifier(s)…" —
  meta `{duplicateIdentifiers: [...]}` HER koşuda farklı kimlikler taşıyor
  (`MAT-PROD-42,16,08,49,62` → `MAT-PROD-22,06,32-two-stage,47,03`). Mesajdaki N de
  değişiyor. Bunlar gerçekten farklı olgular, yeni satır DOĞRU davranış — ama
  `k1_daily_calls` satır sayısı yine de büyümeye devam eder.

Yani "uyarı tablosu hâlâ büyüyor" bir dedupe hatası değil, **uyarı yükünün tasarımı**
sorunudur. Bir uyarının katlanmasını istiyorsan değişken ayrıntıyı meta'dan çıkar
(örn. sayıyı mesaja gömme, listeyi meta'ya koyma; sayıyı ayrı bir alanda topla) ya da
o ayrıntının gerçekten yeni bir olgu olduğunu kabul et.

İki ayrıntı daha:
- Dizi SIRASI kimliğe dahil (`["a","b"]` ≠ `["b","a"]`) — koşusu sırasız bir küme
  üreten iş, sıralamadan meta'ya koyarsa her koşuda yeni satır açar.
- `resolvedAt` dolu satır aday değil: operatör "çözüldü" dedikten sonraki oluşum YENİ
  satır açar. Bu bilinçli — kapatılan sorun geri geldiğinde sayaç arkada artmasın.

İlgili: [[fabrika-no-sentry-systemalert-decision]] · [[fabrika-live-postgres-for-evidence]]
