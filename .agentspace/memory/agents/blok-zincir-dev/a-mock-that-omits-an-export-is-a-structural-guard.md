---
name: a-mock-that-omits-an-export-is-a-structural-guard
description: Bir modül mock'undan yasak export'u ÇIKARMAK, "şu istemciyi kullanma" kuralını yorum yerine teste bağlar — regresyon üretimde değil süitte kırmızı olur
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08, TASK-MTSYH8LDGV5YU (F-1) düzeltmesinde kullanıldı ve işe yaradığı ölçüldü.

Kural şuydu: `src/lib/llm.ts` global `prisma` istemcisine **hiç** dokunmamalı, her erişim
`withTenant`'tan geçmeli. Bu tür kurallar normalde bir yorum satırıyla korunur ve bir sonraki
düzenlemede sessizce çiğnenir — üstelik ihlal **yerelde yeşil geçer**, çünkü mock her şeyi kabul eder.

Yapılan: `vi.mock('@/lib/db', …)` fabrikasından `prisma` export'u **kasten çıkarıldı**, yalnız
`withTenant` bırakıldı. Artık `prisma.<tablo>.create` yazan kod şunu alıyor:

    Error: [vitest] No "prisma" export is defined on the "@/lib/db" mock.

Eski kodu geri koyarak ölçüldü: **32 test kırmızı**. Yani kural artık yoruma değil süite bağlı.

İki not, yoksa bu teknik kendini kandırır:

1. **Yapısal kırmızı tek başına yetmez.** "prisma export yok" hatası, sarmalayıcının *doğru
   kiracıyla* açıldığını göstermez. Yanına **davranışsal** test koy: kapsamı sabit bir kiracıya
   çevirip mutasyon dene. F-1'de iki mutasyon (`withTenant("tenant_1", …)` ve yanlış platform
   kapsamı) tam olarak 2 testi düşürdü, diğer 38'i yeşil kaldı — testin hedefli olduğunun kanıtı bu.
2. **Mutasyon testi olmadan "test kuralı koruyor" deme.** Kırmızıyı görmediğin bir koruma,
   koruma değil temennidir. Bkz. [[fabrika-a-count-is-not-coverage]].

Genellenebilir hali: bir katmanın "şuna erişmemeli" kuralı varsa, o erişimi mock'ta **var etme**.
Kuralı tipler ya da lint yerine mock yüzeyiyle uygulamak en ucuz ve en erken kapıdır.
