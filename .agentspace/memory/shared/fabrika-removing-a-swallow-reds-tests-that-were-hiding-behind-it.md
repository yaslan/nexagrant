---
name: fabrika-removing-a-swallow-reds-tests-that-were-hiding-behind-it
description: Yutan bir catch'i kaldırdığında ALAKASIZ test dosyaları kırmızıya döner — bu regresyon değil, o catch'in gizlediği kusurun ortaya çıkmasıdır; her kırmızıyı "ben mi kırdım" diye değil "bu ne saklıyordu" diye triyaj et
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Yutan `catch`'i silmenin ölçülmüş yan etkisi: **başka test dosyaları kırmızıya döner ve
bu kırmızı kanıttır.** İlk refleks "değişikliğim regresyon yaptı" olur; yanlıştır. Doğru
triyaj: *"bu test, yuttuğum hata sayesinde mi yeşildi?"*

2026-09-08, TASK-MTSYCMWFL22CA. `src/lib/rag.ts:ingestDocument`'in yutan catch'i
kaldırıldı → `tests/cordis-delta.test.ts` 3 testle kırmızıya döndü (`deltaCount` 1 → 0).
Kök neden benim değişikliğim değildi:

```ts
vi.mock('../src/lib/db', () => ({ prisma: db.prisma }));   // withTenant YOK
```

`ingestDocument` yazmalarını `withTenant` içinde yapıyor. Mock onu vermediği için o
dosyadaki HER ingest `withTenant is not a function` ile patlıyordu; yutan catch bunu
yutup sahte bir doc id döndürüyordu; suite de hiç yazılmamış bir belge üzerinden
`deltaCount: 1` doğruluyordu. Yani test aylarca, çalıştığını sandığı yazma yolunu hiç
çalıştırmamıştı.

Bu, [[fabrika-prisma-mock-makes-green-tests-for-crashing-calls]]'in TERSİ hâli: orada
mock şemada olmayan bir delegate'i **icat ediyordu**; burada mock modülün gerçek bir
export'unu **atlıyor**. İkisinin de belirtisi aynı: yeşil test, sıfır satır.

**Kurallar**
1. Bir yutmayı kaldırdıktan sonra çıkan her kırmızıyı, düzeltmeye geçmeden önce
   "gizlenmiş kusur mu?" diye incele. Mock'u tamamlamak testi GEVŞETMEK değildir —
   tersine, testi ilk kez gerçekten çalıştırmaktır.
2. `@/lib/db` mock'layan her test, o modülden kullanılan HER export'u vermelidir
   (`prisma` + `withTenant`; gerekiyorsa `withTenantOn`). Hazır kalıp:
   `tests/cordis-rag.test.ts` — `withTenant: async (_t, fn) => fn(db.prisma)`.
   Tarama: RAG/CORDIS yolunu içe aktaran test dosyalarında
   `grep -l "vi.mock.*lib/db"` → `grep -L withTenant`.
3. Kendi kırmızını başkasınınkinden ayır: değişikliklerini geçici olarak HEAD'e
   döndürüp koş ([[fabrika-attribute-lint-typecheck-noise-with-git-show-head]]).
   ⚠ Dosyaları yedeklerken TAM YOLA göre adlandır — bu repoda iki `rag.ts` var
   ([[fabrika-two-rag-files-src-lib-rag-vs-ai-rag]]).

İlgili: [[fabrika-swallowed-catch-returns-fake-success]] · [[fabrika-db-mock-invents-the-model]] · [[fabrika-verification-recipe-mutation-and-counterfactual]]
