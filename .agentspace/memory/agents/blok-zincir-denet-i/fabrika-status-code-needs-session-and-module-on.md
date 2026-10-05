---
name: fabrika-status-code-needs-session-and-module-on
description: Bir rotanın HTTP durum kodunu ölçerken iki kapı ölçümü sessizce sahteleştirir — oturumsuz istek 307'de durur, modülü OFF kiracı DOĞRU bir 200 (kilit ekranı) döndürür; ikisini de kapatmadan "geçti/kaldı" deme
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Fabrika'da `(app)` altındaki bir rotanın durum kodunu ölçüyorsan, sayfanın kendi mantığına
ulaşmadan önce **iki kapı** var ve ikisi de ölçümü sahte-yeşil ya da sahte-kırmızı yapar:

1. **Auth kapısı** — `src/app/[locale]/(app)/layout.tsx` oturumsuz isteği `/giris`'e **307** ile
   atar. Sayfanın `notFound()`'u, gate'i, hiçbir kararı çalışmaz. Oturumsuz ölçüm "404 dönüyor"
   sanısı üretir; TASK-MTQYY136Q3CGG tam olarak böyle yanlış kapatıldı.
2. **Modül kapısı** — `moduleGate()` sayfanın kendi kontrolünden ÖNCE cevap verir. Modülü `OFF`
   bir kiracıda `/opportunities/<yok>/briefs` kilit ekranını ve **doğru** bir 200'ü döndürür.
   Bunu "hata devam ediyor" diye okursan olmayan bir kusuru kovalarsın; 2026-09-08'de altı rota
   tam bu yüzden düzeltmeden sonra da 200 göründü.

**Why:** Her iki kapı da gövdeyi "makul" bırakır (giriş sayfası / kilit ekranı), bu yüzden
ekran görüntüsü seni uyarmaz. Yanlış sonuç iki yöne de gider: var olmayan hatayı kovalamak
ya da gerçek hatayı "çözülmüş" sayıp kapatmak.

**How to apply:** durum kodu ölçümünde önce ölçüm zeminini kur, sonra ölç:
- Oturum: `/api/auth/csrf` → `POST /api/auth/callback/credentials` (JWT strategy, parola
  doğrulanmıyor) → çerez kavanozu; `/api/auth/session` ile kimliği ve `tenantId`'yi DOĞRULA.
- Kiracı: ilgili modüller `ON` + planı satın alan abonelik. Hazır fixture
  `tests/e2e/fixtures/notfound-tenant.ts` (11 modül `ON`, `ultra`); ölçümden sonra teardown.
- Kontrol grubu şart: var olan bir rota (200 kalmalı) + eşleşmeyen rota (404) + `(app)` dışı
  bir `notFound()` rotası. Üçü de beklendiği gibi değilse ölçüm zeminin bozuktur, bulgu değil.

İlgili: [[fabrika-notfound-returns-http-200]] · [[fabrika-e2e-fixture-needs-modulestate]] · [[fabrika-check-every-surface-not-the-fix]] · [[fabrika-assert-both-config-branches]]
