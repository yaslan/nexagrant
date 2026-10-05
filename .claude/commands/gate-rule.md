Bir kapı kuralını (G0–G4) ekle veya değiştir.

1. `PROJECT.md §5` ve `docs/MODULES.md` M5 bölümünü oku.
2. `src/lib/scoring/gates.ts` içinde `evaluateGate` fonksiyonunu güncelle; kural sürümünü (`ruleVersion`) artır.
3. Varsayılanları `src/lib/scoring/defaults.ts`'te güncelle; `/settings/gates` formu şemasını (zod) eşle.
4. `gates.test.ts`'e sınır değer testleri ekle (eşiğin tam altı/üstü).
5. `docs/MODULES.md`'yi güncelle; commit `feat(m5): gate rule <adı>`.
