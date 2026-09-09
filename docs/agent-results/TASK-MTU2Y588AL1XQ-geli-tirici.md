# TASK-MTU2Y588AL1XQ — Dynamic Withholding Rate Label on Invoice HTML

**Status:** ✅ COMPLETED

## Ne yapıldı

Fatura yazdırılabilir HTML sayfasında tevkifat oranı etiketi sabit "(9/10)" yazılıydı. Gerçek tevkifat oranları satır başına hesaplanmasına rağmen, etiket hiçbir zaman değişmiyordu. 

**Çözüm:** Kodu sabit etiketi kaldırıp, VAT oranı deseni izleyerek, fiili tevkifat oranlarından dinamik etiket türetmek üzere yeniden yazdı.

### Değişiklikler:

1. **`src/lib/efatura.ts` — Yeni helper fonksiyon (satır 273-281)**
   ```typescript
   export function withholdingRateLabel(rate: number): string {
     if (rate <= 0 || rate > 1) return '';
     const numerator = Math.round(rate * 10);
     return `${numerator}/10`;
   }
   ```
   - Tek bir yerdedir: decimal rate → kesir string'i (0.9 → "9/10")
   - Tekrar eden kod yok, reuse ediliyor

2. **`src/lib/efatura.ts` — HTML generator (satır 573-587)**
   - VAT Rate Label'ün desenini izleyen kod eklendi
   - Faturadaki satırlardan fiili tevkifat oranları toplanıyor
   - Çoklu oranlar: "9/10 + 5/10" gibi gösteriliyor (inen sırada)

3. **HTML etiketi (satır 710)**
   - Sabit: `Tevkifat Tutarı (9/10):`
   - Dinamik: `Tevkifat Tutarı (${withholdingRates}):`

4. **`tests/efatura-unit.test.ts` — 5 yeni test (satır 178-245)**
   - `withholdingRateLabel()` unit testleri
   - HTML çıktı testleri (0.9, 0.5, karışık, hiçbiri)

## Kanıt

### Birim testleri: GEÇTI

```
Test Files  133 passed | 2 skipped (135)
     Tests  1587 passed | 8 skipped (1595)
```

Yeni testler dahil tümü geçti.

### Dinamik etiket çıktısı

Dört senaryo test edildi:

```
=== TEST 1: withholding rate 0.9 ===
Withholding label extracted: Tevkifat Tutarı (9/10):

=== TEST 2: withholding rate 0.5 ===
Withholding label extracted: Tevkifat Tutarı (5/10):

=== TEST 3: No withholding ===
Contains Tevkifat Tutarı row? false

=== TEST 4: Mixed withholding rates ===
Withholding label extracted: Tevkifat Tutarı (9/10 + 5/10):
```

✅ Her oranda doğru etiket türetiliyor  
✅ Karışık oranlar (9/10 + 5/10) birleştiriliyor  
✅ Tevkifatsız faturada satır basılmıyor  

### Lint & Typecheck

```
$ pnpm lint → ✅ (önceki repo.daki uyarılar kalmıştır)
$ pnpm typecheck → ✅ (temiz)
```

### grep "9/10" sonucu

```
43:  withholdingCode?: string; // e.g. '604' (Danışmanlık 9/10)
44:  withholdingRate?: number; // 0.9 for 9/10
275: * (0.9 → "9/10", 0.5 → "5/10", 0.7 → "7/10")
588:  // so the label reflects what the document computed (not a hard-coded "9/10").
```

**Sonuç:** Sabit "9/10" çıktı YALNIZ yorumlarda kaldı. HTML etiket dinamik.

## Karışık oranlı fatura senaryosu

Faturada farklı satırlar farklı tevkifat oranlarına (örn. 9/10 ve 5/10) sahip olabilir. Sorun: belge tek bir "Tevkifat Tutarı" toplam satırı basıyor (satır başına değil).

**Kararlaştırılan davranış:** Oranlar birleştiriliyor (9/10 + 5/10). VAT başlığı zaten bu deseni yapıyor; uyumlu.

**Test kanıtı:** 4. senaryo — [çıktı yukarıda]

İkisinin de toplam gösteriliyor; TAHLİL KONUSU DEĞIL (her satır ayrı toplamlarla güncellenmiyor — bu başka bir kart, TASK-MTU27WLNS25BZ).

## Dosyalar değişti

- `src/lib/efatura.ts` — helper + HTML generator
- `tests/efatura-unit.test.ts` — 5 yeni test case

## Kurallar doğrulandı

✅ **CLAUDE.md kural 7** (belgede hesaplanmamış rakam yok) — label şimdi hesaplanıyor  
✅ **Tek kaynak** — `withholdingRateLabel()` bir yerde; kopya yok  
✅ **Deseni tekrar kullan** — VAT'tan aldık; icat etmedik  
✅ **i18n** — kullanıcıya görünen yeni text yok; kesir format standart  
✅ **Güvenlik** — veri doğrulaması yok (0-1 aralığı kontrol eder, UI'ın denetimi yeterli)  

## Definition of Done

- [x] Etiket `withholdingRate`'ten türetiliyor; sabit "9/10" kalmadı
- [x] 0.9 ve 0.5 için üretilmiş HTML etiket satırları kanıt olarak raporda
- [x] Tevkifatsız faturada etiket basılmıyor (kanıt)
- [x] Karışık oranlı senaryo ölçüldü; sonuç: oranlar "9/10 + 5/10" gibi birleştiriliyor
- [x] Birim test eklendi; kapı gerçek çıktısıyla temiz
- [x] Rapor yazıldı

**Görev tamamlandı.**
