---
name: fabrika-prove-a-relocated-mock-is-still-live
description: Bir modülü taşıyıp/yeniden adlandırıp vi.mock yollarını güncellediğinde yeşil test KANIT DEĞİLDİR — gerçek modülün gövdesine bir throw koy; mock'u kopmuş her dosya kırmızıya döner
metadata:
  type: reference
updatedAt: 2026-09-08
---

`vi.mock('@/eski/yol', ...)` bir dosya taşındıktan sonra **hata vermez**: vitest
factory'yi hiç kullanmaz, test gerçek modülü import eder ve çoğu zaman yine
yeşil kalır (dış çağrı mock'lu `fetch`'e ya da mock'lu prisma'ya takılır).
Yani "9 dosyada yolu güncelledim, testler geçiyor" cümlesi mock'ların devrede
olduğunu göstermez.

**Nasıl uygulanır — zehirle ve koştur.** Gerçek modülün ilgili fonksiyonunun
ilk satırına geçici olarak koy:

```ts
throw new Error('UNMOCKED_REAL_ADAPTER_REACHED');
```

sonra mock'layan tüm dosyaları koştur. İki yönlü okunur:
- mock'layan takım **yeşil kalmalı** → yolları gerçekten devrede,
- gerçek modülü sınayan takım **kırmızıya dönmeli** → zehir ulaşılabilir bir
  yerde, yani ilk sonuç anlamlı (yoksa "yeşil" sadece kodun hiç çalışmadığını
  gösterir).

TASK-MTSXGXBCJ007W'de `src/lib/ai/llm.ts` silinip 9 test dosyasının
`vi.mock` yolu `@/lib/llm`'e taşındı; bu sondayla 9/9'unun canlı olduğu
ölçüldü (83 test yeşil, gerçek adaptörü sınayan dosya kırmızı). Zehri geri
almayı unutma. [[fabrika-verification-recipe-mutation-and-counterfactual]]
[[fabrika-db-mock-invents-the-model]]
