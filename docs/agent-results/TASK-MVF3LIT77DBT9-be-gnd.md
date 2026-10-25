---
sözleşme: 3
görev: TASK-MVF3LIT77DBT9
kod: TASK-MVF3LIT77DBT9
ajan: be-gnd
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: PR #136 için ONAY. Detektör çok satırlı JSX metnini yakalıyor (yeni testler eski koda karşı 7 kırmızı, yeni koda karşı yeşil; mutantta i18n:check kırmızı, geri alınca yeşil). 3 bulgu düşük önemde ve merge'i engellemiyor.
platform: mac (Darwin 27) üzerinde doğrulandı: vitest, tsc, eslint, i18n:check, mutant, repo geneli eski/yeni karşılaştırması. Değişiklik saf TS: TypeScript AST ile metin okuyor ve boşlukları `\s+` ile normalize ediyor. walk() yolları `path.sep` → `/` ile normalize ediyor, bu yüzden Windows ve Linux'ta da aynı sayım beklenir. Windows ve Linux'ta koşulamadı, çünkü makine yalnız mac ve CI GitHub faturalama engeli yüzünden başlamıyor.
sürüm: 1
tarih: 2026-10-22T15:27:10.407Z
---

# FO-95 · PR #136 inceleme ve test doğrulaması: ONAY

**HÜKÜM: ONAY.** Merge'i engelleyen bir bulgu yok. Kod değiştirilmedi, merge edilmedi.

## Ne yapıldı
1. `get_task TASK-MVF3LIT77DBT9` ile kart, `gh pr diff 136` ile diff ve fe-fb raporu okundu.
2. PR head'i (`54f03748`) ayrı bir worktree'ye alındı ve doğrulama orada yapıldı. Ana ağaç (`feat/partner-search-interreg`, başkasının dalı) etkilenmedi. Worktree ve geçici dal sonra silindi.
3. Detektör uç durum girdileriyle denendi, kırmızı-önce testi yapıldı, mutant koşuldu, repo genelinde eski ve yeni detektör karşılaştırıldı, testler, typecheck ve lint koşuldu.

## Kanıt (ham çıktı)

**Uç durumlar** (yeni `scanSource`, `[metin, satır]`):
```
multiTR      "<button\n onClick={x}\n>\n  Vazgeç\n</button>"   → [["Vazgeç",4]]        ✔ çok satırlı
lowerMulti   "<p>\n  please try\n  again later\n</p>"         → [["please try again later",2]] ✔ tek düğüm, boşluklar birleştirilmiş
spaceSplitTR "<p>Bu dosya{' '}<b>{name}</b>{' '}kaydedildi</p>" → [["Bu dosya",1]]       ✔ (ama "kaydedildi" yok, bkz. B1)
spaceSplit2  "<p>Yeni{' '}kayit</p>"                           → [["Yeni",1]]
spaceSplitASCII "<p>hello{' '}world</p>"                       → []                    ✘ yanlış negatif (B1)
punctOnly    "<p>\n · \n {a} \n — \n {b} \n : \n</p>"           → []                    ✔ noktalama
wsOnly       "<div>\n    \n  <span/>\n</div>"                  → []                    ✔ boşluk
jsxComment   "{/* Kullanıcı yorum */}"                          → []                    ✔
comparison   "a < b && c > d" / "<T,>(x: T) => x"               → []                    ✔ (eski regex burada yanlış pozitif veriyordu)
urlText / "12 px" / "3.5 MB" / "PartBEditor"                    → []                    ✔ teknik metin
brand        "<span>Interreg</span><span>FONBRIDGE</span>"     → [["Interreg",1]]       (B2)
entity       "<p>&copy; Fonbridge Ltd</p>"                      → [["&copy; Fonbridge Ltd",1]] (B3)
```

**Kırmızı-önce:** yeni testler eski (`HEAD~1`) detektöre karşı koşuldu:
```
× reports a Turkish label that sits on its own line
× points at the label line even under deep indentation
× reports an ASCII-spelled label on its own line — "Vazgec" ...
× reports a sentence wrapped over several lines once ...
× reports text that shares its node with an expression
× reports a single capitalised word in JSX text
× does not read TypeScript comparisons as JSX text
Tests  7 failed | 25 passed (32)
```
**Yeşil (PR head):** `perl -e 'alarm 900;exec @ARGV' pnpm exec vitest run tests/i18n-hardcoded-detector.test.ts tests/i18n-check-script.test.ts tests/i18n.test.ts tests/invoice-i18n.test.ts` sonucu `Test Files 4 passed (4) · Tests 58 passed (58)`.

**Mutant:** `PartBCollaborativeEditor.tsx` dosyasına çok satırlı sabit metin eklendi:
```
<span className="sr-only">
  Vazgec
</span>
```
```
❌ Not in i18n-baseline.json — a file may not introduce hard-coded text (1):
   - src/modules/m11/ui/PartBCollaborativeEditor.tsx  (1 literal)
       1004  [jsx-text]  "Vazgec"
❌ i18n check FAILED   [ELIFECYCLE] exit code 1
```
`git checkout -- <dosya>` ile geri alındı. Ardından `pnpm i18n:check` → `Literals found: 323 in 29 file(s) / Baseline allows: 323` ✅ passed, exit 0. Hiçbir şey commit'lenmedi.

**Regresyon taraması:** repo genelindeki 201 `.tsx` dosyasında eski detektörün bulduğu her jsx-text bulgusu yeni detektörde arandı:
```
LOST src/app/[locale]/(public)/calls/turkey/page.tsx 109 "limit || cents"
files 201 lost 1 newJsx 309
```
Kaybolan tek bulgu, eski regex'in TS karşılaştırmasını JSX sanmasından doğan yanlış pozitif. Bu yüzden baseline'daki `calls/turkey/page.tsx: 1 → 0` düşüşü doğru. Başka hiçbir dosyada sayım düşmedi. Toplam 186 → 323, dosya sayısı 27 → 29.

**Tek kelimelik yeni bulgular (70):** "Cancel", "İptal", "Kaydet"-benzeri, "Yükleniyor...", "Status", "Budget", "Deadline", "Users"… Hemen hepsi gerçek etiket. Şüpheli olanlar yalnız "Python", "Slug" ve (testte) marka adları.

**e2e regex'i (statik doğrulama):** katalogdan üretilen desenler `/^Now: ~[\d.,]+ Pages \(0 Words\)$/` ve `/^~… Sayfa \(0 Kelime\)$/` biçiminde ve ekrandaki metinle eşleşiyor. `{}` bilerek kaçışlanmıyor, böylece yer tutucular değiştirilebiliyor. Bölüm satırında TR sızıntısı olursa (`(0 Kelime)` EN ekranda) satır deseni eşleşmez ve test kırmızı olur. Sayfa-bütçe çubuğu artık sızıntıyı maskelemiyor. Playwright'ı burada yeniden koşmadım. fe-fb raporunda izole DB üzerinde mutant kanıtı var: yeni spec 1 failed, eski spec 2 passed.

**Saat:** `toLocaleTimeString([], …)` yerine `toLocaleTimeString(locale, …)` kullanılıyor. `locale`, `useLocale()` ile `:138` satırında zaten tanımlı ve dosyadaki diğer kullanımlarla (`:420`, `:520`) tutarlı.

**Statik:** `tsc --noEmit` exit 0 · `eslint` (değişen 4 dosya) exit 0.

**CI:** `build-and-test`, `i18n-audit` ve `lighthouse-a11y` 1-2 sn içinde fail oluyor. Annotation: *"The job was not started because recent account payments have failed or your spending limit needs to be increased."* Neden kod değil, GitHub faturalama. Aynı durum PR #117'de de görülüyor.

## Bulgular (hiçbiri engelleyici değil)
- **B1 · düşük · yanlış negatif:** `{' '}` ile bölünmüş metinde küçük harfli, ASCII ve tek kelimelik parçalar sayılmıyor (`hello{' '}world` → 0, `…{' '}kaydedildi` → "kaydedildi" yok). Cümlenin büyük harfli ya da çok kelimeli parçası yakalandığı için dosya yine de işaretleniyor. Tamamen kör kalan tek durum, bütün parçaları küçük harfli tek kelimelerden oluşan ASCII metin. Detektör "taban, nüfus sayımı değil" ilkesiyle tutarlı. İstenirse ileride kardeş JsxText düğümleri birleştirilebilir.
- **B2 · düşük · yanlış pozitif:** büyük harfle başlayan tek kelimelik marka veya teknik adlar ("Interreg", "Python", "Slug") etiket sayılıyor. Baseline bunları emiyor, gate'i kırmıyor. İleride metin taşırken bunlar için allowlist gerekebilir.
- **B3 · kozmetik:** HTML entity'leri raporda ham kalıyor (`&copy; Fonbridge Ltd`). Sayımı etkilemiyor.
- **Not:** jsx-text `raw` kaynaktan, prop'lar `stripComments` çıktısından okunuyor. AST yorumları zaten metin saymadığı ve `stripComments` satır sonlarını koruduğu için satır numaraları tutarlı. Sorun yok.

## Değişen dosyalar
Yalnız bu rapor: `docs/agent-results/TASK-MVF3LIT77DBT9-be-gnd.md`. PR koduna dokunulmadı.

## Riskler
- PR'ın tam pre-push kapısı (e2e 387 test) fe-fb tarafında ENOSPC yüzünden yarıda kalmıştı. Bu incelemede de tam e2e koşulmadı. CI faturalama engeli kalkmadan dev'e girişte otomatik kapı yok.
- **Yan etki (düzeltildi):** worktree'ye ana ağacın `node_modules`'ünü symlink'le bağlamıştım. `pnpm exec`, PR dalının lockfile'ına göre ana `node_modules`'te `eslint-config-next` ve `next` paketlerini 16.3.4'ten 16.3.8'e çevirdi. Fark edince ana ağaçta `pnpm install --frozen-lockfile --offline` çalıştırdım ve ana dalın lockfile'ındaki 16.3.4'e geri döndürdüm (doğrulandı: `eslint-config-next` version 16.3.4). Takım hafızasına ders olarak yazıldı.

## Açık sorular
Yok.

## Sonraki adım
Lider ya da fe-fb: merge, GitHub faturalama engeli kalkınca CI yeşil olduktan sonra veya lider kararıyla yapılmalı. B1 ve B2 için istenirse ayrı bir iyileştirme kartı açılabilir.
