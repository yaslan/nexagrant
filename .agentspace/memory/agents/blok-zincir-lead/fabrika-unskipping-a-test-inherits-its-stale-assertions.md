---
name: fabrika-unskipping-a-test-inherits-its-stale-assertions
description: test.skip kaldiran kart, o testin ESKIMIS iddialarini da devralir — skip suresince urun degismis olabilir, suiti butun kostur
metadata:
  type: project
  updatedAt: 2026-09-09
---

TASK-MTU26XBVZ6H1O 1. turunda worker `tests/e2e/invoice-foreign-currency-export.spec.ts`'teki
`test.skip()`'i kaldırdı. O test `expect(usd).not.toContain('₺')` diyordu — ama skip'te
beklerken ürün değişmişti: `8118b54` commit'i yabancı para faturasına **TL karşılığı + TCMB
kuru** bloğunu kasıtlı ekledi ve `src/lib/efatura.ts:159` bu rakamlar yoksa faturayı GİB'e
göndermeyi reddediyor. Yani assertion özellikten eskiydi.

Sonuç: iki tur boyunca kart "tamamlandı" diye geldi, ikisinde de suit hiç bütün koşulmadı
(1. tur 5 test grep, 2. tur TEK test grep). Ben `pnpm test:e2e --grep "invoice"` koşunca
**2 failed / 15 passed** çıktı.

Kural: bir kart `test.skip` / `.only` kaldırıyorsa, o testin iddiaları o günden bugüne
doğrulanmamış demektir — kartın DoD'una "grep'li tek test değil, AİLENİN TAMAMI yeşil" yaz
ve kapatmadan önce süiti KENDİN koştur. `pnpm gate` bunu yakalamaz: gate'te e2e yok.

İlgili: [[fabrika-a-checked-box-that-confesses]] ·
[[fabrika-a-green-gate-may-predate-the-commit-it-closes]] ·
[[fabrika-partial-fix-check-all-surfaces-of-the-same-bug]]
