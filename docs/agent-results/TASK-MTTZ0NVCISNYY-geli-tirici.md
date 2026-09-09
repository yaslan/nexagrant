# TASK-MTTZ0NVCISNYY: Fix theme paint-timing e2e gate

**Ajan:** BE-EN (Backend Engineer)  
**Tip:** test/gate-fix  
**Sprint:** S12  
**Status:** ✅ DONE

## Ne yapıldı

Düzeltilen e2e testi `tests/e2e/theme-paint-timing.spec.ts`, public/theme-init.js script'in gerçekten HTML parsing anında çalışıp çalışmadığını ölçüyor. Önceki test yalancı pozitif veriyordu: sayfayı 'networkidle' ye kadar bekledikten sonra dark class kontrol ediyordu, bu yüzden eğer script kaldırılsa bile ThemeProvider'ın useEffect'i class'ı ekleyerek test yeşil kalıyordu.

Yeni test:
1. Tüm JS chunk'larını 3+ saniye geciktiriyor (page.route ile kasıtlı delay)
2. Sayfayı 'domcontentloaded' event'inde açıyor (HTML parsed, JS chunks hâlâ pending)
3. Bu noktada dark class var mı kontrol ediyor

Sonuç: Script parse-time'da çalışıyorsa, dark class zaten var (✓). Yalnızca useEffect uyguluyorsa, dark class yok (✗).

## Kanıt

### Test YEŞİL (script var)
```
$ pnpm test:e2e theme-paint-timing

Running 2 tests using 1 worker

  ✓  1 [chromium] › tests/e2e/theme-paint-timing.spec.ts:3:5 › theme initialization runs during HTML parsing, before chunk JS loads (3.5s)
  ✓  2 [chromium] › tests/e2e/theme-paint-timing.spec.ts:36:5 › theme applies immediately on both locales before chunks load (6.9s)

  2 passed (11.0s)
```

### Test KIRMIZI (script kaldırıldığında)
public/theme-init.js çağrısı src/app/layout.tsx satır 34'ten geçici olarak kaldırıldı:

```
$ pnpm test:e2e theme-paint-timing

Running 2 tests using 1 worker

  ✘  1 [chromium] › tests/e2e/theme-paint-timing.spec.ts:3:5 › theme initialization runs during HTML parsing, before chunk JS loads (3.6s)
  ✘  2 [chromium] › tests/e2e/theme-paint-timing.spec.ts:36:5 › theme applies immediately on both locales before chunks load (3.5s)

Error: expect(received).toBe(expected) // Object.is equality
Expected: true
Received: false
```

Script geri kondu ve test YEŞİL hale geldi (yukarıda görüldüğü gibi).

**Sonuç:** Testi, script'in parse-time davranışını gerçekten ayırt ediyor; iki-yönlü kanıt başarılı.

## Değişen dosyalar

- `tests/e2e/theme-paint-timing.spec.ts` — Test setup düzeltildi:
  - Chunk'ları kasıtlı olarak 3+ saniye geciktir (page.route ile)
  - 'domcontentloaded' event'inde page load (chunks pending iken)
  - Parse-time theme initialization ölçülüyor
  - İkinci test de aynı şekilde güncellendi (dark ve light theme, iki locale)

## Riskler

- **Yok.** Değişim yalnızca test dosyasında; src/app/layout.tsx ve public/theme-init.js değişmedi.
- lint ve typecheck temiz ✓
- Test sayıları aynı (132 files, 1559 tests) ✓
- Tüm e2e testler YEŞİL ✓

## Açık sorular

- Yok.

## Sonraki adım

- Kart kapatılabilir.
- TASK-MTTXQKBWYSS4K (console uyarısı) bu görevle ilişkili değil, orada kapatıldı.
