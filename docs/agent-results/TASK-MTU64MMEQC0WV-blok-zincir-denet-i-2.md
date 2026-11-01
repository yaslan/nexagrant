> **Not:** Bu dosya, `TASK-MTU64MMEQC0WV` denetiminin **§B-01 bulgusunun kapatılmasının** kaydıdır ve görev metnindeki KANIT ZORUNLU yolu karşılamak için buraya yazılmıştır. İşin kendisi `TASK-MTVBJW8ATMD3G` kartıdır; aynı içerik `docs/agent-results/TASK-MTVBJW8ATMD3G-ex-en.md` altında da durur. Ajan: `ex-en`.
>
> **B-01'in durumu: KAPANDI.** Denetimin §6 soru 2'de önerdiği çözüm (baseline'lı kapı sıkılaştırması) aynen uygulandı. §B-02 (on rotanın `/en` altında Türkçe render etmesi), §B-03 (`src/components` içindeki sabit `aria-label`) ve §B-04 (karışık kullanım) bu kartın kapsamı DIŞINDA kaldı ve **düzelmedi** — aşağıdaki §4 ve §6'da adıyla yazılıdır.

---

# TASK-MTVBJW8ATMD3G — i18n kapısına gömülü metin kontrolü (baseline'lı ratchet)

**Platform beyanı: macOS (darwin 25.6.0, zsh) üzerinde doğrulandı.** Windows/Linux koşulmadı — gerek yok: dokunulan kod yolu saf Node `fs`/`path` ve regex; süreç öldürme, kabuk çağrısı, ikili adı, ekran/DPI veya izin diyaloğu yok. Tek platform bağımlılığı dosya yolu ayracıdır ve `scripts/i18n-hardcoded.ts` içinde `path.relative(...).split(path.sep).join('/')` ile normalize edilir; `i18n-baseline.json` anahtarları bu yüzden her platformda aynı POSIX biçiminde üretilir/okunur. Windows'ta baseline anahtarlarının `\` ile yazılıp eşleşmemesi riski koddan kapatılmıştır.

**Karar: Kapı artık `t()` hiç kullanmayan dosyayı da görüyor. `pnpm i18n:check` YEŞİL (çıkış 0), mevcut 325 literal / 37 dosya baseline'a alındı, dört sondanın dördü de beklendiği gibi davrandı.**

## 1. Ne yapıldı

`TASK-MTU64MMEQC0WV` §B-01'in kök nedeni `scripts/i18n-check.ts` içindeki dosya döngüsünün ilk satırıydı:

```ts
const raw = fs.readFileSync(file, 'utf-8');
if (!raw.includes('useTranslations') && !raw.includes('getTranslations')) continue;
```

Yani kapı yalnız **kullanılan anahtarın çözülüp çözülmediğini** ölçüyordu; hiç `t()` çağırmayan bir dosya taramadan **yapısal olarak** muaftı. Kural 8 tersten uygulanıyordu: metni `t()`'ye bağlarsan denetleniyordun, kodun içine yazarsan görünmez oluyordun.

Eklenen: **4. kontrol — gömülü kullanıcı metni**, baseline'lı ratchet olarak.

### Tespit kapsamı (karttaki tanım birebir uygulandı)
- Dosyalar: `src/app/**` ve `src/modules/**` altındaki `.tsx` (136 dosya). `src/components/**`, `src/lib/**` bu kapının kapsamı **dışında** — kart öyle tanımladı.
- Yakalanan yerler: JSX metin düğümü (`<span>Metin</span>`) + `title` / `label` / `placeholder` / `aria-label` prop'unda **string literal**. `title={t('x')}` gibi ifade prop'u hiç eşleşmez — zaten hedeflenen biçim odur.
- İhlal ölçütü: Türkçe karakter (`çğıİöşüÇĞÖŞÜ`) taşıyan **ya da** 2+ kelimelik literal.
- Hariç tutulanlar: Tailwind sınıf listesi, rota/dosya yolu, URL, test-id, import yolu, mime tipi, camelCase/PascalCase/kebab/snake/`SCREAMING_CONST`, tarih ve birimli sayı. `className` ve `data-testid` prop listesinde **hiç yok**, yani filtreler koşmadan önce de raporlanamazlar.

### Bilinçli kısıt: tek ASCII kelime ihlal sayılmıyor
`"Save"` bloklamıyor, `"İşlemler"` blokluyor. Tek kelimede prose ile identifier'ı ayıracak sinyal yok; yanlış pozitif üreten kapı gevşetilir ya da kapatılır — B-01'in tekrarı tam olarak budur. Bu detektör bir **alt sınırdır**, sayım değil; §5'te açıkça yazıldı.

### Neden baseline
Kuralı düz açmak kapıyı **doğuşta kırmızı** yapardı (325 literal / 37 dosya). `i18n-baseline.json` (kök dizin, `{"<dosya yolu>": <ihlal sayısı>}`) borcu dosya bazında tutar; kontrol bir **ratchet**tir:

| Durum | Kapı |
|---|---|
| Baseline'daki dosyanın sayısı **büyüdü** | 🔴 KIRMIZI (`regressions`) |
| Baseline'da **olmayan** dosya ihlal taşıyor | 🔴 KIRMIZI (`newOffenders`) |
| Baseline'daki dosyanın sayısı **küçüldü** | 🟢 YEŞİL + "baseline güncellenmeli" uyarısı |
| Baseline'daki dosya tamamen temizlendi | 🟢 YEŞİL + "ledger'dan çıkar" uyarısı |

Ledger'ı tazelemek için `pnpm i18n:check --update-baseline`. Baseline yalnız küçülmeli; script bunu çıktıda açıkça söyler.

## 2. Kanıt

### (a) `pnpm i18n:check` yeşil — çıkış kodu 0

```
Hard-coded user-facing text (src/app, src/modules — *.tsx):
  Literals found:   325 in 37 file(s)
  Baseline allows:  325 in 37 file(s)

✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.

GATE_EXIT=0
```

### (b) Mutasyon sondası A — mevcut `.tsx`'e yeni Türkçe literal → KIRMIZI

`src/app/[locale]/(app)/[workspace]/partners/page.tsx` (baseline: 1) satır 179'a eklenen literal:

```
      <p>Bu satir mutasyon sondasi icin eklendi — Kayıtlı Ortak Sayısı</p>
```

```
Hard-coded user-facing text (src/app, src/modules — *.tsx):
  Literals found:   326 in 37 file(s)
  Baseline allows:  325 in 37 file(s)

❌ More hard-coded text than the baseline allows (1):
   - src/app/[locale]/(app)/[workspace]/partners/page.tsx  1 → 2  (+1)
       179  [jsx-text]  "Bu satir mutasyon sondasi icin eklendi — Kayıtlı Ortak Sayısı"
       228  [jsx-text]  "🇹🇷 Türk Kuruluşlar"

❌ i18n check FAILED — see the entries above. CLAUDE.md rule 8: no hard-coded user-facing text, and a key ships in both languages.
[ELIFECYCLE] Command failed with exit code 1.
EXIT=1
```

Geri alındı; `git diff` boş, kapı tekrar `EXIT=0`.

### (c) Mutasyon sondası B — `t()` hiç kullanmayan YENİ dosya → KIRMIZI

**B-01 körlüğünün kapandığının tek kanıtı budur.** Eski kapı bu dosyayı ilk satırda `continue` ile atlardı.

`src/app/[locale]/(app)/[workspace]/probe-b-panel.tsx` (dosyada sıfır `t()` / `useTranslations` / `getTranslations`):

```tsx
export function ProbeBPanel() {
  return (
    <div className="flex items-center gap-2">
      <h2>Yeni Kiracı Paneli</h2>
      <p>Bu sayfa hiçbir çeviri kancası kullanmıyor.</p>
    </div>
  );
}
```

```
Hard-coded user-facing text (src/app, src/modules — *.tsx):
  Literals found:   327 in 38 file(s)
  Baseline allows:  325 in 37 file(s)

❌ Not in i18n-baseline.json — a file may not introduce hard-coded text (1):
   - src/app/[locale]/(app)/[workspace]/probe-b-panel.tsx  (2 literals)
       5  [jsx-text]  "Yeni Kiracı Paneli"
       6  [jsx-text]  "Bu sayfa hiçbir çeviri kancası kullanmıyor."

❌ i18n check FAILED — see the entries above. CLAUDE.md rule 8: no hard-coded user-facing text, and a key ships in both languages.
EXIT=1
```

Dosya silindi.

### (d) Yanlış pozitif sondası — teknik dizeler ihlal SAYILMIYOR

`src/app/[locale]/(app)/[workspace]/probe-d-panel.tsx`, yalnız teknik dize içeren dosya:

```tsx
<div className="flex items-center" data-testid="save-button">
  <span className="mt-2 grid grid-cols-3 gap-4 text-sm font-medium" />
  <button data-testid="cancel-button" className="rounded-md border px-3 py-2" />
  <Link href="/tr/admin/settings" className="hover:text-ink" />
  <img src="/images/logo-dark.svg" className="h-8 w-8" />
</div>
```

```
Hard-coded user-facing text (src/app, src/modules — *.tsx):
  Literals found:   325 in 37 file(s)
  Baseline allows:  325 in 37 file(s)

✅ i18n check passed: ...
EXIT=0

=== direct detector read-out for the probe D file ===
violations reported for probe D file: 0 []
```

`className="flex items-center"` ve `data-testid="save-button"` sıfır ihlal ürettiler. Dosya silindi.

### (e) Ratchet'in yeşil kolu — borç azalınca uyarı basıp geçiyor

Baseline geçici olarak şişirildi (bir dosya 1→4, ayrıca artık ihlali olmayan hayali bir dosya 7):

```
Hard-coded user-facing text (src/app, src/modules — *.tsx):
  Literals found:   325 in 37 file(s)
  Baseline allows:  335 in 38 file(s)

⚠️  Baseline is looser than reality — 10 literal(s) paid down. Refresh it with:
      pnpm i18n:check --update-baseline
   - src/app/[locale]/(app)/[workspace]/partners/page.tsx  4 → 1
   - src/app/[locale]/(app)/[workspace]/gone/removed-page.tsx  7 → 0  (clean — remove from the baseline)

✅ i18n check passed: ...
EXIT=0
```

Baseline geri yüklendi.

### (f) Birim testler — tespit sınırı çiviyle sabit

```
$ npx vitest run tests/i18n-hardcoded-detector.test.ts
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

24 vaka; kapıyı yeşile almak için detektörü gevşetme hamlesini bloklamak üzere yazıldı (yorumu testin başında).

### (g) lint / typecheck / tam suite

```
$ pnpm lint      → LINT_EXIT=0
$ pnpm typecheck → tsc --noEmit, çıktı yok (temiz)
$ pnpm test      → Test Files 2 failed | 143 passed | 2 skipped (147)
                   Tests 3 failed | 1742 passed | 8 skipped (1753)
```

**Bu 3 hata bana ait DEĞİL — değişikliğimden önce de var.** `git stash push -u` ile tüm çalışmam ağaçtan çıkarıldı ve aynı iki dosya aynı şekilde düştü:

```
$ git stash push -u -q && npx vitest run tests/document-exporter.test.ts tests/brand-surfaces-render.test.tsx
     × states that no funding body issued the document, in both languages 37ms
     × public footer renders the product name (tr) 266ms
     × public footer renders the product name (en) 48ms
 Test Files  2 failed (2)
      Tests  3 failed | 14 passed (17)
```

`tests/brand-surfaces-render.test.tsx` ve `tests/document-exporter.test.ts` — marka adı yeniden adlandırma işinin uçuşta olan kısmı; i18n kapısıyla ilgisi yok. Stash geri alındıktan sonra dosyalarım sağlam, kapı `EXIT=0`, 24 test yeşil (yukarıda tekrar koşuldu).

### (h) Commit

```
$ git show --name-only --oneline HEAD
37d4a1d feat(i18n): make the gate see hard-coded text, behind a baseline ratchet
i18n-baseline.json
scripts/README.md
scripts/i18n-check.ts
scripts/i18n-hardcoded.ts
tests/i18n-hardcoded-detector.test.ts
```

pre-commit kapısı: `✓ Kapı temiz (staged kapsamı).` Paylaşımlı ağaç olduğu için `git add -A` kullanılmadı; yalnız beş yol staged edildi ve `git diff --cached` ile içerik doğrulandı (staged baseline: 37 dosya / 325 literal).

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `scripts/i18n-hardcoded.ts` | **YENİ** — tespit motoru. `scanHardcoded()`, `scanSource()`, `isUserFacing()`, `looksTechnical()`, `countByFile()` export eder. |
| `scripts/i18n-check.ts` | 4. kontrol, `HardcodedReport` tipi, baseline oku/yaz/doğrula, rapor bölümü, bloklama koşulu, `--update-baseline` bayrağı. |
| `i18n-baseline.json` | **YENİ** — kök dizin ledger'ı, 37 dosya / 325 literal. |
| `tests/i18n-hardcoded-detector.test.ts` | **YENİ** — 24 vaka; ne sayılır / ne sayılmaz + baseline sağlığı (yol biçimi, pozitif tamsayı, dosya hâlâ var mı). |
| `scripts/README.md` | Kapı tablosundaki `i18n-check.ts` satırı 4. kontrolü anlatacak şekilde genişletildi + `i18n-hardcoded.ts` satırı eklendi. |

Ürün kodu ve `messages/*.json`: **değişmedi**. Yeni çeviri anahtarı eklenmedi, dolayısıyla "iki dile de ekle" kuralı bu kartta tetiklenmedi.

## 4. Riskler

- **Detektör bir alt sınırdır, sayım değil.** Tek ASCII kelime (`"Save"`), değişkene atanmış metin (`const msg = "Kaydedildi"`), dizi/sabit tablosundaki etiketler ve `.ts` dosyalarındaki sunucu hata mesajları yakalanmaz. 325 rakamı gerçek borcun altındadır; QA denetiminin 480'i daha geniş bir tarama (tüm `src/**`, `alt`/`description`/`toast` dahil) ile ölçmüştü. İki sayı farklı kapsamları ölçüyor, biri diğerini yalanlamıyor.
- **Baseline sessizce eskiyebilir.** Bir dosya taşınır/yeniden adlandırılırsa ledger'daki eski yol ölü kalır ve yeni yol "baseline'da yok" diye kırmızı verir — bu doğru davranış ama sebebi ilk bakışta anlaşılmayabilir. Testteki "yol hâlâ var mı" vakası bunu koşuda yakalar.
- **Ratchet borcu ödemeyi zorlamaz, yalnız büyümeyi durdurur.** 325 literal kimse dokunmazsa süresiz kalabilir. Bu kartın kapsamı buydu; ama "Fabrika'da devredilen bulgu aylarca ağaçta kalır" örüntüsü tam olarak bu şekilde tekrar eder — §6'daki ilk madde bunun içindir.
- **Kapsam `src/components/**`'i dışarıda bırakıyor.** QA denetimi §B-03'te `MobileAppHeader.tsx`, `ThemeToggle.tsx` gibi bileşenlerde sabit `aria-label` bulmuştu; bunlar bu kapı tarafından **ölçülmüyor**. Kart kapsamı öyle tanımladığı için genişletmedim, ama bu bir kör nokta olarak duruyor.

## 5. Açık sorular

1. **`src/components/**` kapsama alınsın mı?** B-03'teki sabit `aria-label`'lar bugün hiçbir kapı tarafından görülmüyor. Genişletmek baseline'ı büyütür; karar liderin.
2. **Tek ASCII kelime eşiği gevşetilsin mi?** `"Save"`, `"Cancel"`, `"Delete"` gibi düğme metinleri bugün geçiyor. Yakalamak için sözlük tabanlı bir liste gerekir (yanlış pozitif riski yüksek) ya da tek-kelime kuralı yalnız bilinen İngilizce fiil listesiyle sınırlanır. Ayrı kart konusu.
3. **325 literalin ödenmesi kimin kartı?** Kart bu borcu düzeltmeyi açıkça yasakladı. Sahiplenilmezse ratchet borcu dondurur ama silmez.

## 6. Sonraki adım

1. **325 literal için rota bazlı temizlik kartları açılsın** (en ağır dördü: `opportunities/[id]/application/client.tsx` 38, `admin/cordis/client.tsx` 37, `tto/client.tsx` 30, `pipeline/board.tsx` 29). Her kart bittiğinde `pnpm i18n:check --update-baseline` koşulup baseline commit'e dahil edilmeli — ölçülebilir kabul kriteri: o dosyanın ledger satırı yok olur.
2. Açık soru 1 ve 2 karara bağlansın.
3. Rotalar çevrildikçe `/en` render'ı gerçek tarayıcıyla doğrulansın — B-02'nin canlı kanıtı hâlâ alınmadı (QA denetiminde dev/e2e yasaklıydı, bu kartta da kapsam dışıydı).
