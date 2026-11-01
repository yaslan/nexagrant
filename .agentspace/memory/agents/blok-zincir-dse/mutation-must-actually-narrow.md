---
name: mutation-must-actually-narrow
description: Mutasyon testinde YEŞİL sonuç önce mutasyonu suçlar, testi değil — kusuru gerçekten sokup sokmadığını doğrula (fikstür satırının alanı zaten null'sa "lastRunAt: null" hiçbir şeyi daraltmaz)
metadata:
  type: feedback
updatedAt: 2026-09-08
---

Bir assertion'ın canlı olduğunu kanıtlamak için kusuru geri koyduğunda sonuç YEŞİL
çıkarsa, ilk hipotez "test ölü" DEĞİL — "mutasyonum bir şeyi değiştirmedi" olmalı.

Somut örnek (TASK-MTSHUZUMVLTBF): cron sorgusunun (`SAVED_SEARCH_ALERT_QUERY`) o satırı
gerçekten döndürdüğünü kanıtlamak için `where`'e `lastRunAt: null` ekledim → test yeşil
kaldı. Sebep: yeni yazılan `SavedSearch` satırının `lastRunAt`'i zaten `null`, yani
mutasyon hiçbir şeyi dışarıda bırakmıyordu. Kesin dışarıda bırakan bir mutasyonla
(`name: '__mutation_never_matches__'`) tekrarlayınca beklenen kırmızı geldi ve komşu
test yeşil kaldı — asıl kanıt bu ikisi birlikte.

Kural: mutasyonu seçerken "bu, fikstürün SAHİP OLDUĞU değeri gerçekten dışlıyor mu?"
diye sor. Ve yanlış mutasyonu rapordan gizleme — hangi denemenin neden yetmediğini yaz;
"test kırmızı verdi" iddiasının değeri, yeşil denemeleri de göstermekten geliyor.
İlgili: [[fabrika-verification-recipe-mutation-and-counterfactual]]
