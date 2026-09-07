---
name: agentspace-browser-type-does-not-update-react-state
description: agentspace_browser'ın type eylemi DOM'a yazıyor ama React onChange'i tetiklemiyor — disabled={!state} olan submit düğmeleri tıklanamaz kalıyor, sessizce
metadata:
  type: reference
  updatedAt: 2026-09-07
---

2026-09-07'de Fabrika pano formunda (`pipeline/board.tsx`, "Yeni Fırsat Ekle") ölçüldü:

```
type  → form input[type="text"] ← "TASK-… tek kart testi"
screenshot → alanda metin GÖRÜNÜYOR ✅
click → form button[type="submit"]
readPage → modal hâlâ açık, yeni kart yok
psql   → Opportunity tablosunda YENİ SATIR YOK
```

Sebep: değer DOM'a yazılıyor ama React'in `onChange`'i çalışmıyor, dolayısıyla
`formData.title` boş kalıyor ve düğme `disabled={isPending || !formData.title.trim()}`
koşuluyla **pasif**. Pasif düğmeye tıklamak hata üretmez — araç "clicked" der, hiçbir şey olmaz.
Yani bu sessiz bir başarısızlık: sadece ekran görüntüsüne bakan "yazdım, tıkladım" sanır.

**Why:** Doğrulamanın kendisi yanlış sonuç verirse "gerçek tıklamayla doğruladım" iddiası çürür.
Ekran görüntüsü girdinin DOLDUĞUNU gösterir, React state'inin GÜNCELLENDİĞİNİ göstermez.

**How to apply:**
1. Yazı gerektiren bir formu doğrulayacaksan **etkiyi DB'den teyit et** (`psql`/prisma sorgusu),
   ekran görüntüsüyle yetinme.
2. Mümkünse **yazı gerektirmeyen** ikinci bir giriş noktası bul — aynı server action'ı çağıran
   başka bir düğme. (Fabrika: `calls/[id]` → "Fırsatlara Ekle" `createOpportunity`'yi başlıksız
   çağırır; pano modalının yerine geçer.) Aynı kodu doğrular, klavye gerekmez.
3. Giriş formu gibi `disabled` koşulu olmayan formlar `type` ile çalışır — sorun yalnız state'e
   bağlı `disabled` düğmelerde.

İlgili: [[agentspace-browser-login-without-typing]] · [[fabrika-runtime-verification-recipe]] ·
[[agentspace-browser-session-is-shared-between-agents]]
