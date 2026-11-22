import { test, expect } from '@playwright/test';

// NG-289 Ö1 deneme: bilerek kırmızı. YALNIZ ng289-denemek-kirmizi dalında; dev'e girmez.
test('NG-289 deneme: kasıtlı kırmızı (artefakt kanıtı)', async () => {
  expect(1).toBe(2);
});
