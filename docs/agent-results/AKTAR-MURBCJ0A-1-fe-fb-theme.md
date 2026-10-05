# AKTAR-MURBCJ0A-1 · fe-fb · koyu tema `dark:` varyantı (K-3) + `--muted` kontrastı (K-4)

**Hüküm:** ONAY — K-3 ve K-4 düzeltildi ve ölçüldü. Kök neden derlenen CSS üzerinden kanıtlandı. Önce kırmızı E2E yazıldı, düzeltmeden sonra yeşile döndü. axe `color-contrast` (29 sayfa, 1024 px, production build): açık temada 420 → 139 düğüm, bunların içinde `--muted` kaynaklı olanlar 281 → 0. Koyu temada 91 → 83; ölü `dark:` kaynaklı 8 düğümün hepsi gitti (Panel h1 1,09:1 dahil). Kalan ihlaller bu kartın kapsamında değil (9-1/9-2: `--ok`, `--amber`, koyu temada `bg-accent` üzerinde beyaz metin).

**Tip:** bug (a11y / WCAG 1.4.3)
**Kart:** TASK-MUREAJR1L7KUB · dal `fe-fb/dark-contrast` @ `76117c1d` (taban `dev` @ `1b43b434`), worktree `FONBRIDGE-wt-fefb-theme`. Push yapılmadı.
**Platform:** mac (Darwin 27, Playwright Chromium, `next build` + `next start`, DB localhost:5433). Windows/Linux koşulmadı. Değişiklik yalnız CSS seçicisi, renk token'ı ve bir sınıf adı; işletim sistemine bağlı kod yolu yok, bu yüzden davranışın tarayıcı motoruna bağlı olduğunu ve OS'tan bağımsız olduğunu koddan söyleyebilirim. `:where()` ve alt öğe seçicisi tüm güncel motorlarda destekleniyor. Safari ve Firefox koşulmadı.

## 1. Ne yapıldı

1. **Kök neden (K-3).** Tema `<html>` öğesine sunucuda yazılıyor: `src/app/layout.tsx:61-62` → `className="dark"` + `data-theme="dark"` (çerez `fabrika-theme`, yoksa `Sec-CH-Prefers-Color-Scheme`). İstemci tarafında `ThemeProvider.tsx:62-76` aynı ikisini yalnız `document.documentElement` üzerinde güncelliyor. Sınıf ve öznitelik doğru yerde, testler de bunu doğruluyor (`theme-paint-timing`). Sorun varyantta: `@custom-variant dark (&:where(.dark, [data-theme="dark"]))`. Burada `&` yardımcı sınıfın kendisi; seçici **"bu öğenin kendisi .dark olsun"** anlamına geliyor. `.dark` olan tek öğe `<html>` olduğundan alt öğelerdeki hiçbir `dark:` sınıfı eşleşmiyordu. Tailwind derleyicisinin aynı girdiden ürettiği çıktı:
   ```
   ÖNCE : .dark\:text-white:where(.dark, [data-theme="dark"]) { color: var(--color-white); }
   SONRA: .dark\:text-white:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *) { color: var(--color-white); }
   ```
   (`@tailwindcss/postcss` ile `@source inline("dark:text-white")` derlendi; betik geçiciydi, depoya girmedi.)
2. **Kırmızı test önce.** `tests/e2e/theme-dark-variant.spec.ts`: herkese açık `/tr/calls/germany` sayfası (oturum ve DB gerekmiyor) açık ve koyu çerezle açılıyor. `bg-gray-50 dark:bg-slate-900` sarmalayıcısının ve `text-indigo-600 dark:text-indigo-400` bağlantısının hesaplanan rengi temalar arasında değişmeli ve yerinde ölçülen `bg-slate-900` / `text-indigo-400` değerine eşit olmalı. Bu, `globals.css` üzerinde grep değil, davranış testi.
3. **Düzeltme (K-3).** `src/app/globals.css:7` → `@custom-variant dark (&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *));` Nedeni ve testin adı satırın üstüne yorum olarak yazıldı.
4. **Düzeltme (K-4).** `--muted: #64748B` → `#5B6B7F` (`:root`, açık tema). Koyu tema değeri `#94A3B8` olduğu gibi kaldı.
5. **K-4 kapısı.** `tests/theme-token-contrast.test.ts`: `globals.css` içindeki `:root` ve `.dark` bloklarını okuyor ve `--muted` ile `--ground`, `--surface`, `--surface-hover` arasındaki WCAG oranının ≥ 4,5 olduğunu doğruluyor. Eski değerle iki test kırmızı (aşağıda).
6. **Yan etki düzeltmesi.** Ölçümde tek bir düğümün oranı kötüleşti: admin masaüstü başlığı **temadan bağımsız sabit** `bg-slate-900` kullanıyor, ama içindeki "Platform Console v1.1" tema token'ı `text-muted` ile yazılmış. Oran 3,74'ten 3,27'ye düştü; zaten AA'nın altındaydı. `src/app/[locale]/admin/layout.tsx:81` yalnız bu satırda `text-slate-400` yapıldı (slate-900 üzerinde 6,78). Logo satırına (76) dokunulmadı.
7. **Ölçüm.** des-fb'nin 29 sayfası (16 herkese açık + 13 giriş sonrası), 1024 px, açık ve koyu tema, axe-core 4.13 `color-contrast`, production build. Önce = `dev` @ `1b43b434`, sonra = bu dal. Giriş, e2e fikstürlerindeki yöntemle yapıldı: yalnız bu ölçüme özel rastgele `AUTH_SECRET` ile imzalanmış `demo-user-superadmin` oturum çerezi, `DEMO_LOGIN_ENABLED=false`. Betik: `AKTAR-MURBCJ0A-1-fe-fb-theme/olcum-betigi.cjs`. Sunucu her ölçümden sonra durduruldu (3217 artık dinlemiyor).

### K-4 hesabı (WCAG 2.x göreli parlaklık)
| Ön plan | `--ground` #F4F6F8 | `--surface` #FFFFFF | `--surface-hover` #F1F5F9 | #F5F7F9 | `--line` #E2E8F0 |
|---|---|---|---|---|---|
| eski #64748B | **4,39** ✗ | 4,76 | **4,34** ✗ | **4,43** ✗ | 3,86 |
| yeni #5B6B7F | **5,03** ✓ | **5,45** ✓ | **4,97** ✓ | 5,07 ✓ | 4,42 (metin zemini değil, çizgi rengi) |
| koyu #94A3B8 (değişmedi) | #080D1A: 7,56 | #0B1324: 7,23 | #0F192E: 6,83 | | |

## 2. Kanıt

**Kırmızı → yeşil (E2E, `E2E_PORT=3017`, yalnız `globals.css` farklı):**
```
ÖNCE:  expect(received).not.toBe(expected)
       Expected: not "lab(98.2596 -0.247031 -0.706708)"
       > 62 | expect(dark.wrapperBg, 'dark:bg-slate-900 did not apply').not.toBe(light.wrapperBg);
       (htmlDark=true ve data-theme=dark kontrolleri bu satırdan önce GEÇTİ → sınıf yerinde, CSS eşleşmiyor)
SONRA: ✓ [chromium] › tests/e2e/theme-dark-variant.spec.ts › dark: utilities apply to descendants of <html class="dark"> (1.2s)
```

**theme-no-script-warning / theme-paint-timing ile ilişkisi.** Aynı koşuda, port 3000'de, düzeltmeden önce ve sonra:
```
ÖNCE (HEAD css):  ✘ theme-dark-variant · ✓ no-script /tr · ✓ no-script /en · ✓ paint-timing ×2   → 1 failed, 4 passed
SONRA:            ✓ theme-dark-variant · ✓ no-script /tr · ✓ no-script /en · ✓ paint-timing ×2   → 5 passed
```
Bu iki spec yalnız `<html>` üzerindeki sınıfı ve konsolu ölçüyor, CSS'e bağlı değiller. İki durumda da yeşiller, yani K-3 düzeltmesi onları ne bozuyor ne düzeltiyor. Entegrasyondaki kırmızılarının olası nedeni: ikisi de `http://localhost:3000`'i **sabit yazıyor** ve `E2E_PORT`/`baseURL`'ü yok sayıyor. Port 3000'de başka bir sunucu varsa ya da koşu başka porttaysa yanlış sunucuya gidiyorlar. Bu oturumda port 3000 bir süre başka bir ajanın (be-fb) sunucusundaydı ve Playwright `already used` diye başlamadı. qae-fb hafızasında da "theme-paint-timing PORT override" notu var. Bu bir **hipotez**: entegrasyon koşusunun logunu görmedim. Spec'leri gevşetmedim ve değiştirmedim. Yeni spec'im sabit port kullanmıyor, `baseURL` okuyor.

**K-4 kapısı (vitest):**
```
#5B6B7F:  Test Files 1 passed · Tests 6 passed (6)
#64748B:  × on --ground is at least 4.5:1        → expected 4.392726515617244 to be greater than or equal to 4.5
          × on --surface-hover is at least 4.5:1 → expected 4.343923406321176 …
          Tests 2 failed | 4 passed (6)
```

**axe color-contrast, 29 sayfa @1024 (production build):**
```
                         ÖNCE                    SONRA
açık   düğüm/sayfa       420 / 23                139 / 22
       --muted ön plan   281 (#64748b)           0   (#5b6b7f hiç ihlal yok)
         #64748b/#f4f6f8 275 düğüm, 17 sayfa     —
koyu   düğüm/sayfa       91 / 13                 83 / 11
       ölü dark: kaynaklı 8 düğüm                0
         #101828/#080d1a (1.09) Panel h1         —
         #4a5565/#080d1a (2.56) dashboard alt başlık ×3   —
         #4f39f6/#080d1a (3.00) ×2, #1447e6/#0c1a3a (2.51), #155dfc/#080d1a (3.69)  —
SONRA yeni ortaya çıkan ihlal: 0 (açık ve koyu)
```
Sonra kalanların ilk sıraları kapsam dışı ve des-fb raporunda zaten var: `#059669 on #daefe8 (3.13)` ×46 (`--ok`, 9-1), `#d97706 on #f9ebda (2.71)` ×21 (`--amber`), `#ffffff on #0891b2 (3.68)` ×46 koyu (9-2, `bg-accent-strong`), fiyatlandırma koyu kartında `text-slate-400/500` gibi sabit renkler. Tam liste: `AKTAR-MURBCJ0A-1-fe-fb-theme/axe-color-contrast-ozet.txt`; ham veri `axe-once.json` / `axe-sonra.json`. des-fb'nin sayısıyla küçük fark var (277/18 ↔ 275/17), çünkü veri ve commit farklı.

**Öbür kapılar:**
```
pnpm typecheck  → tsc --noEmit, çıkış 0
pnpm lint       → ✖ 9 problems (0 errors, 9 warnings); uyarıların hiçbiri değişen dosyalarda değil
vitest tests/theme-token-contrast.test.ts tests/mobile-edge-gutter.test.ts → 2 files, 12 tests passed
pnpm build      → çıkış 0
```
`tests/e2e/mobile-main-overflow.spec.ts` **koşulamadı**: `beforeAll` içindeki `prisma.user.findFirst()` sayfa yüklenmeden `PrismaClientKnownRequestError` veriyor (0 ms, 11 test çalışmadı). Hata test sürecinin DB erişiminde; CSS'e dokunmuyor. Bu yüzden değişiklikle ilgisiz bir ortam sorunu olarak not ediyorum.

**Ekran görüntüleri** (`AKTAR-MURBCJ0A-1-fe-fb-theme/`; `once-*` / `sonra-*`, 6 sayfa × açık/koyu; `karsilastirma-*` = solda önce, sağda sonra):
- `karsilastirma-app-dashboard-1024-dark.png`: önce "Panel" başlığı görünmüyor, KPI kartları koyu zeminde açık renkli. Sonra başlık beyaz, kartlar koyu tonlarda.
- `karsilastirma-app-faturalama-1024-dark.png`, `karsilastirma-app-onay-merkezi-1024-dark.png`, `karsilastirma-app-ayarlar-1024-light.png` (`--muted` tonu biraz koyulaşıyor).

## 3. Değişen dosyalar
- `src/app/globals.css`: varyant satırı + yorum; `--muted` değeri.
- `src/app/[locale]/admin/layout.tsx:81`: `text-muted` → `text-slate-400` (yalnız bu satır).
- `tests/e2e/theme-dark-variant.spec.ts` (yeni, K-3 kapısı).
- `tests/theme-token-contrast.test.ts` (yeni, K-4 kapısı).
- `docs/agent-results/AKTAR-MURBCJ0A-1-fe-fb-theme.md` + `AKTAR-MURBCJ0A-1-fe-fb-theme/` (kanıt).

Commit `76117c1d` kodu ve testleri içeriyor. Rapor ve kanıt ayrı commit'te. `git add` dosya bazında yapıldı, push yok. des-fb'nin dosyalarına (ikonlar, `(app)/layout.tsx` logo satırları, `MobileAppHeader`) dokunulmadı.

## 4. Riskler
- **250 `dark:` sınıfı ilk kez devrede.** Bu sınıflar bugüne kadar hiç render edilmedi. Ölçülen 29 sayfada yeni kontrast ihlali çıkmadı. Yine de görsel olarak palet dışı tonlar var: onay merkezinde `dark:bg-zinc-900` (nötr gri; token `bg-surface` lacivert), Geri bildirim düğmesinde `dark:bg-slate-100` (koyu temada beyaz hap). Okunuyorlar ama marka diline uymuyorlar. Koyu temada tam bir görsel tur gerekiyor (des-fb'nin önerisi de bu).
- `--muted` tonu açık temada biraz koyulaştı (#64748B → #5B6B7F). Uygulamanın tamamına yayılıyor; marka onayı istenebilir.
- K-5 (koyu temada logo invert) artık `dark:brightness-0 dark:invert` ile yapılabilir, çünkü varyant çalışıyor. Logo satırları des-fb'de, ben dokunmadım.

## 5. Açık sorular
- Entegrasyondaki theme-paint-timing / no-script kırmızısının logu var mı? Sabit port hipotezini doğrulamak ya da çürütmek için gerekiyor. Spec'leri `baseURL`'e taşımak ayrı bir iş olur; kapsamı genişletmemek için yapmadım.

## 6. Sonraki adım
1. Koyu tema görsel turu: `dark:` içinde zinc/gray/neutral kullanılan yerleri token'lara (`bg-surface`, `border-line`) çekmek.
2. 9-1/9-2 token kontrastı (`--ok`, `--amber` metin tonu, koyu temada beyaz metinli `bg-accent` → `bg-accent-strong`).
3. K-5 logo invert (des-fb / fe).
4. `theme-*.spec.ts` içindeki sabit `localhost:3000` → `baseURL`.
