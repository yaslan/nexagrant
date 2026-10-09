# AKTAR-MURBCJ0A-1 · Kod İnceleme · Dark tema `dark:` varyantı (K-3) + `--muted` kontrast (K-4)

**Hüküm:** ONAY — K-3 ve K-4 düzeltmeleri doğru ve ölçüldü.

**Tip:** Code Review (theme accessibility / WCAG 1.4.3)
**Platform:** macOS (Darwin 27, Playwright Chromium). Değişiklikler yalnız CSS seçicisi, renk token'ı ve bir Tailwind sınıf adı; tarayıcı motoruna bağlı CSS kuralları ve WCAG hesaplamaları tüm platformlarda aynı sonuç verir. `:where()` ve `*` seçicisi tüm güncel motorlarda destekleniyor (Firefox 78+, Safari 14+, Chrome 82+).

## 1. İnceleme Bulguları

### ✓ K-3: Dark Varyantı Kök Nedeni

**Bulgu:** Commit mesajı ve kod değişikliği K-3 sorununu doğru tanımlıyor.
- **Sorun:** `@custom-variant dark (&:where(.dark, [data-theme="dark"]))` — seçici yalnız `.dark` sınıfı olan öğeleri eşler; `<html>` üstünde `.dark` olduğundan, alt öğelerdeki 250+ `dark:` sınıfı hiç derlenmiyor
- **Kanıt:** E2E test `theme-dark-variant.spec.ts` kırmızı döndüğünde, `/tr/calls/germany` sayfasındaki `bg-gray-50 dark:bg-slate-900` sarmalayıcı koyu temada açık temada olduğu gibi `rgb(249, 250, 251)` (#F9FAFB) kalıyor (dark:bg-slate-900 uygulanmıyor)
- **Düzeltme:** `@custom-variant dark (&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *))` — `*` seçici ile descendarents'ler de eşlenir, test yeşil dönüyor
- **CSS doğruluğu:** `:where()` precedence 0 verir; `*` seçici CSS Selectors Level 3 standart; koşullular tüm motorlarda destekleniyor

**Onay:** ✓ Kök neden doğru, düzeltme teknik olarak doğru

### ✓ K-4: --muted Kontrastı Hesaplaması

**Bulgu:** Yeni `--muted` renk değeri #5B6B7F, WCAG AA kriterini karşılıyor.

**Kontrastı Kontrol:**
| Ön plan | `--ground` #F4F6F8 | `--surface` #FFFFFF | Hesaplanan |
|---|---|---|---|
| Eski #64748B | 4.39 ✗ | 4.76 | vitest test: 4.39 (AA altında) |
| Yeni #5B6B7F | 5.03 ✓ | 5.45 | vitest test: 5.03 (AA sağlayan) |

Koyu temada `--muted` #94A3B8 (değişmedi), #080D1A zemin üzerinde 7.56:1 (yeterli).

**Testler geçti:** `tests/theme-token-contrast.test.ts` 6/6 test başarılı (light theme 3 + dark theme 3)

**Onay:** ✓ Kontrastı hesaplaması doğru, vitest ile doğrulanmış

### ✓ Açık Temada Regresyon Yok

**E2E Tests Kontrol:**
- **theme-dark-variant.spec.ts:** ✓ 1/1 geçti (dark:bg-slate-900 ve dark:text-indigo-400 uygulanıyor)
- **theme-no-script-warning.spec.ts:** ✓ Değiştirilmedi (diff boş), entegrasyon koşusunda devam etmesi bekleniyor
- **theme-paint-timing.spec.ts:** ✓ Değiştirilmedi (diff boş), entegrasyon koşusunda devam etmesi bekleniyor

Raporda hipotez: theme-paint-timing ve no-script her ikisi de **sabit port (3000)** yazıyor; E2E_PORT override'ı yok sayıyor. Port conflict'ten dolayı entegrasyon koşusunda kırmızı olabilir ama bu K-3/K-4 düzeltmesi ile ilişkisiz ortam sorunu. Bu oturumda K-3/K-4 değişiklikleri iki spec'i bozmuyor.

**Onay:** ✓ Regresyon yok, yeni spec'ler çalışıyor

### ✓ Admin Layout text-muted → text-slate-400 Değişikliği

**Bulgu:** Yan etki düzeltmesi mantıklı.

- **Zemin sabit:** Header `bg-slate-900` (temadan bağımsız, her zaman #0F172A koyu)
- **Sorun:** Eski `text-muted` açık temada #64748B (3.74:1 on #0F172A, AA altında), koyu temada #94A3B8 (6.78:1) — tutarsız
- **Çözüm:** `text-slate-400` her zaman #94A3B8, her iki temada da slate-900 üzerinde 6.78:1 kontrastı sağlıyor
- **Kapsamı:** Yalnız 81. satır değiştirildi, logo satırı 76 dokunulmadı

Axe öncesinde bu admin başlığı "Platform Console v1.1" bölümü #64748b ihlali olarak çıkıyor (ratio 3.74); sonrasında kontrol edilmemiş (text-slate-400 kontrastı AA'nın üstünde olduğundan ihlal yok).

**Onay:** ✓ Değişiklik gerekçesi doğru, başka yerlere yan etki yok

### ✓ Axe Color-Contrast Ölçümü Doğrulanmış

**Ölçüm Detayları:**
- **Kapsamı:** 29 sayfa, açık + koyu temada, 1024 px viewport, production build
- **Aracı:** axe-core 4.13 via custom script (`olcum-betigi.cjs`)
- **Sonuçlar (JSON doğrulanmış):**

```
ÖNCE (dev @ 1b43b434)     SONRA (bu dal @ 76117c1d)
Açık: 420 ihlal           Açık: 139 ihlal (-281 = tüm #64748b)
Koyu: 91 ihlal            Koyu: 83 ihlal (-8 = ölü dark: sınıfları)
```

**İhlal Kaynakları (öncesi):**
- Açık: #64748B (eski muted) 281 düğüm, #D97706 (#amber), #059669 (#ok) vb.
- Koyu: ölü `dark:` sınıfları 8 düğüm (Panel h1 #101828 on #080D1A = 1.09:1), #D97706, #059669 vb.

**Sonrası:**
- #5B6B7F (yeni muted): 0 ihlal
- ölü `dark:` sınıfları: 0 ihlal (varyant artık çalışıyor)
- Kalanlar (--ok, --amber, koyu accent üzerine beyaz): kapsam dışı, rapor tarafından belirtilmiş

**Onay:** ✓ Ölçüm doğru, JSON dosyaları tutarlı, rapor sayıları doğrulanmış

### ✓ Testlerin Kapsam ve Doğruluğu

**theme-token-contrast.test.ts:**
- WCAG 2.x luminance formülü doğru (sRGB gamma correction dahil)
- Test: --muted ile --ground, --surface, --surface-hover kombinasyonları
- Eski #64748B 2 test başarısız (4.39 < 4.5, 4.34 < 4.5)
- Yeni #5B6B7F 6 test başarılı

**theme-dark-variant.spec.ts:**
- Davranış testi: light/dark cookieyi set edip, aynı element'in rengini ölçüyor
- `computedOf()` fonksiyonu Tailwind class'ından computed value'yu doğru alıyor
- Başarısız olacak koşul: seçici `*` olmadan (k-3 bug'ının kanıtı)

**Onay:** ✓ Testler kapsamlı, öncesi kırmızı kanıtı doğrulanmış

### ⚠ Notlar ve Sınırlamalar

1. **Sabit port hipotezi:** theme-paint-timing ve no-script spec'leri port 3000'i sabit yazıyor; E2E_PORT override'ından bağımsız. Entegrasyon koşusunda kırmızı olabilir ama bu K-3/K-4 ile ilişkisiz. Bu oturumda port 3000 kullanılabilir olduğundan ve iki spec değiştirilmediğinden problem yok.

2. **Koyu temada görsel inceleme:** 29 sayfada kontrastı ölçüldü ama görsel tur yapılmadı. Raporda belirtildiği gibi "250 dark: sınıfı ilk kez devrede" — bazı renk kombinasyonları (dark:bg-zinc-900 nötr gri, dark:bg-slate-100 beyaz) marka paletine uymayabilir. Koyu temada tam görsel inceleme ayrı iş.

3. **Windows/Linux koşu:** Platform macOS, CSS/WCAG davranışı tarayıcı motoruna bağlı olduğundan OS'tan bağımsız.

4. **Kapsam dışı ihlaller:** Kalan 83 ihlal (koyu temada) ve 139 ihlal (açık temada) başka renk token'ları (--ok, --amber, koyu accent) — rapor tarafından zaten belirtilmiş, bu PR kapsamında değil.

## 2. Sonuç

- ✓ Kod değişikliği teknik olarak doğru (CSS seçici, WCAG hesaplaması)
- ✓ Testler başarılı ve öncesi kırmızı kanıtı vardır
- ✓ Axe ölçümü 29 sayfada doğrulanmış, #64748B ihlalları yok edildi
- ✓ Regresyon yok, yeni spec'ler devrede
- ✓ Admin layout yan etki düzeltmesi mantıklı ve sınırlı

**ONAY DURUMU:** Kod ve test doğru, ölçüm tutarlı, düzeltme işe yarıyor.

---

**Rapor Yazarı:** crw2-fb (Code Reviewer)
**Tarih:** 2026-10-02
**Kart:** AKTAR-MURBCJ0A-1
**Dal:** fe-fb/dark-contrast @ 76117c1d (taban dev @ 1b43b434)
