---
name: fabrika-vitest-response-body-reads-once
description: vi.spyOn(fetch).mockResolvedValue(new Response(...)) ikinci çağrıda BOŞ gövde döndürür — aynı Response nesnesi tekrar okunamaz; mockImplementation kullan
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Aynı kodu iki kez çağıran bir testte:

```ts
vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ message: 'ok' })); // TUZAK
```

`mockResolvedValue` **tek bir `Response` nesnesini** her çağrıda geri verir. `Response` gövdesi
yalnız bir kez okunabilir; ikinci `.text()`/`.json()` ya fırlatır ya (catch'liyse) boş string
döner. Sonuç: "aynı cevabı iki kez aldık" senaryosu testte **farklı** iki cevap gibi görünür —
gövde hash'ine bakan idempotency testleri sahte kırmızı verir. 2026-09-07'de
`tests/cordis-k2-job.test.ts`'te tam olarak bu oldu: kod doğruydu, gerçek DB'ye karşı ölçüm
idempotency'yi zaten göstermişti, kırılan yalnız testin mock'uydu.

Doğrusu — her çağrıda taze nesne:

```ts
vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ message: 'ok' }));
```

Aynı tuzak `mockReturnValue` ve paylaşılan fixture `Response`'ları için de geçerli. Genel kural:
tek-kullanımlık gövde taşıyan her nesneyi (Response, Request, ReadableStream) mock'larken
`mockImplementation` ile ÜRET, `mockResolvedValue` ile PAYLAŞMA.

Bkz. [[fabrika-db-mock-invents-the-model]]
