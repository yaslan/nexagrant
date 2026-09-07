---
name: fabrika-dev-server-500s-after-deleting-a-route-file
description: next dev bir route dosyası (loading.tsx/page.tsx) SİLİNDİĞİNDE bayat manifest yüzünden her rotaya 500 verir — bunu regresyon sanma, sunucuyu yeniden başlat; dosya EKLEMEK aynı sorunu yaratmaz
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Çalışan `next dev` (v16) altında bir route dosyasını **silmek** — `loading.tsx`, `page.tsx` —
HMR'yi bayat bir manifest ile bırakıyor: silmeden sonra o ağaçtaki **her** rota, sağlıklı
kontrol sayfaları dahil, `HTTP 500` veriyor. Bekleyip tekrar denemek düzeltmiyor.

```
loading.tsx kenara alındı, 8 sn beklendi   -> /tr/main/dashboard            500
15 sn daha beklendi                        -> hâlâ 500 (tüm rotalar)
sunucu kill + yeniden başlat               -> beklenen kodlar (200/404)
```

Dosya **eklemek** bu sorunu yaratmıyor; yalnız silme. Bu yüzden bir A/B ölçümünde
"eski dosyayı geri koy → ölç" adımı yeniden başlatma istemez, ama "yeni durumu ölç" adımı ister.

Ayrıca: `next dev` aynı proje için ikinci bir örneğe izin vermiyor ("You can access the existing
server at http://localhost:3000, or run kill <pid>"). Yani izole bir port açıp ölçemezsin —
paylaşılan sunucuyu yeniden başlatman gerekir; bu diğer ajanların panelini de etkiler, ölçümü
kısa tut ve raporda söyle.

**Why:** Silme sonrası 500'ü kendi değişikliğinin regresyonu sanmak kolay; yarım saat kaybı ya
da doğru düzeltmeyi geri alma riski.

**How to apply:** Route dosyası silen her ölçümde sırayı sabitle — sil → `kill $(lsof -ti:3000)`
→ `next dev` yeniden başlat → hazır olana kadar `/api/auth/csrf` yokla → **oturumu yeniden aç**
(yeniden başlatma çerezi geçersiz kılmaz ama temiz ölçüm için yeniden al) → ölç.

İlgili: [[fabrika-status-code-needs-session-and-module-on]] · [[fabrika-env-flip-restarts-shared-dev-server]] · [[fabrika-agents-share-one-working-tree]]
