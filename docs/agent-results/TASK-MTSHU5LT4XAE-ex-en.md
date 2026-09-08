# TASK-MTSHU5LT4XAE — i18n kapısı fiilen KAPALI

**Ajan:** ex-en (Araştırmacı/Explorer) · **Sprint:** SPRINT-S12 (Dalga 8) · **Tarih:** 2026-09-08
**Commit:** `d98da75` — *fix(i18n): make the translation gate able to fail*

---

## 1. Ne yapıldı

### Teşhis — kart DOĞRU, ama kusur ikiye ayrılıyor

Kart "kapı yeşil değil, KAPI YOK" diyor. Doğrulandı, ve kök neden **iki bağımsız
kusurdan** oluşuyor; ikisi de tek başına yeterli değil, birlikte kapıyı öldürüyorlar:

1. **`scripts/i18n-check.ts` her koşuda exit 1 dönüyordu.** Çıkarıcı `t(\`detail.tab.${tab}\`)`
   gibi şablon çağrılarını düz anahtar sanıyordu, 28 hayalet eksik üretiyordu — hiçbiri gerçek
   değildi. Yani betik "kirli" ile "temiz" arasında hiç ayrım yapamıyordu.
2. **`next.config.ts:33-36` bu exit kodunu yutuyordu.** `try/catch` → `console.warn('⚠️  Could
   not run i18n check')` + `// Don't block build on check failure`. Kapı bir hüküm verse bile
   build onu duymuyordu.

Kartın metnine **bir düzeltme**: kapının hiç koşmadığı yer build; `pnpm gate` ise i18n'i
**hiç çağırmıyordu** (`package.json:38` — lint/typecheck/test/rls, i18n yok). Yani üç
enforcement noktasından (build, gate, CI) yalnız CI workflow'u exit 1'e kadar gidiyordu, o da
her PR'da kırmızıydı ve PR yorumu hiç atılmıyordu (aşağıya bkz.).

Üçüncü, kart dışı kusur: **CI'nin PR yorumu adımı hiç çalışamazdı.**
`.github/workflows/i18n-check.yml:47` raporu `execSync('pnpm i18n:check')` ile yeniden
üretiyordu — betik exit 1 dönünce `execSync` fırlatır, `catch` yutar, yorum atılmaz. Yani
adım tam da var olma sebebi olan durumda ölüydü.

### Betikteki düzeltmeler (`scripts/i18n-check.ts`)

**Şablon çağrıları — seçim ve gerekçe.** Üç yol vardı:

| Yol | Ne olurdu |
|---|---|
| (a) Dinamik çağrıları tamamen atla | Sessiz geçer; bir dilden koca bir anahtar grubu silinse kimse görmez |
| (b) `${...}` içindeki değer kümesini çıkar | Tip bilgisi + gerçek çıkarım ister; değer DB'den geliyorsa zaten imkânsız |
| (c) Çağrıyı bir **şekle** çevir, şeklin dolu olmasını şart koş | Statik olarak kanıtlanabilir olanın en fazlası |

**(c) seçildi.** Her `${...}` tek segmentlik joker olur; `t(\`detail.tab.${tab}\`)` →
`Pipeline.detail.tab.*` deseni, ve bu desene uyan **en az bir anahtar iki katalogda da**
bulunmak zorunda. Her runtime değerinin çözüldüğünü kanıtlamaz — hiçbir statik analiz
kanıtlayamaz — ama gerçekte olan hatayı yakalar: bir dilde var, diğerinde yok olan grup.
Kanıtı §2'de: `Pipeline.detail.tab` iki kataloğdan da silindiğinde kapı kırmızıya dönüyor.

**Katalog eşitliği (yeni).** `messages/tr.json` ↔ `messages/en.json` anahtar kümeleri birebir
aynı olmak zorunda. Bu, CLAUDE.md kural 8'in ("yeni anahtar iki dile de eklenir") harfi
harfine karşılığı ve eski betikte **hiç yoktu**.

**Namespace çözümü.** Eski betik dosyadaki **ilk** `useTranslations('X')`'i alıp o dosyadaki
her `t()`'ye X öneki takıyordu. 11 dosya iki-üç namespace bildiriyor;
`src/app/[locale]/admin/feedback/page.tsx` ise `t`'yi üç ayrı fonksiyonda üç kez bağlıyor
(iki kez `adminFeedback`, bir kez `feedback`). Artık her değişken kendi namespace'ine
bağlanıyor ve bir çağrı **kendisinden önceki en yakın bağlamaya** göre çözülüyor.

**`getTranslations` körlüğü.** Eski regex yalnız `useTranslations`'ı tanıyordu;
`await getTranslations({ locale, namespace: 'X' })` kullanan **23 sunucu bileşeni** görünmezdi
(bu, takım hafızasındaki `fabrika-i18n-check-parametrized-key-false-positive` notunun
"ikinci ve daha büyük kör nokta" dediği şey). Artık taranıyor.

**Yorum ayıklama.** Yorum içindeki `t('...')` metni anahtar sanılıyordu — ilk düzeltme
turumda `adminFeedback....` diye sahte bir eksik ürettim, kaynağı
`admin/feedback/page.tsx:143`'teki JSDoc cümlesiydi. Artık yorumlar taramadan önce boşlukla
doldurularak (offset'ler korunarak) çıkarılıyor.

**Kullanılmayan anahtarlar artık bloklamıyor.** Çıkarıcı `src/` dışından ulaşılan anahtarları
göremez; "unused" bir ipucudur, kusur değil. Doğru namespace çözümü + `getTranslations`
desteğiyle sahte "unused" sayısı **600 → 206**'ya düştü.

**`--json`.** Makine raporu artık bayrakla; varsayılan çıktı insan raporu (eskiden 1317×3
anahtarlık JSON her build log'una basılıyordu).

### Enforcement — kapı artık gerçekten düşürüyor

- `next.config.ts`: `try/catch` **kaldırıldı**, `execFileSync(..., stdio:'inherit')` exit
  koduyla fırlatıyor ve build'i öldürüyor.
- `PHASE_PRODUCTION_BUILD` koruması eklendi: `next build` bloklar, **`next dev` bloklamaz**.
  Gerekçe: eksik bir çeviri kimsenin dev sunucusunu başlatmasını engellememeli, ve kontrol
  her restart'a birkaç saniye bindirir. Bloklayan üç yer: `next build`, `pnpm gate`, CI.
- `package.json`: `gate` artık `pnpm i18n:check` içeriyor.
- CI yorum adımı raporu dosyadan okuyor (`--json > i18n-report.json`), yeniden koşmuyor.

### Uygulama kodu

Kart "uygulama kodundaki `t()` çağrılarını YENİDEN YAZMA" diyor — **yazılmadı**.
`src/` altında tek satır değişmedi; `messages/*.json` da bu görev kapsamında değişmedi
(`git diff --cached --stat messages/` boş).

---

## 2. Kanıt

### 2.1 Kusurun başlangıç hâli — betik her koşuda kırmızı

```
$ pnpm i18n:check
⚠️  Missing in English (28):
   - Consortium.status.${seat.status}
   - Pipeline.detail.tab.${tab}
   - billingPanels.pricing.tiers.${tier.code}
   ... (28'inin tamamı ${...} içeriyor — hiçbiri gerçek eksik değil)
[ELIFECYCLE] Command failed with exit code 1.
EXIT=1
```

`next.config.ts:33-36` bunu yutan kod:
```ts
} catch (error) {
  console.warn('⚠️  Could not run i18n check:', ...);
  // Don't block build on check failure
}
```

### 2.2 Düzeltmeden sonra — temiz ve GERÇEKTEN hüküm veriyor

```
$ pnpm i18n:check
Summary:
  Static keys used in code: 969
  Dynamic key patterns:     31
  Keys in messages/tr.json: 1319
  Keys in messages/en.json: 1319
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
```

### 2.3 ZORUNLU MUTASYON — tek dile anahtar ekle, build DÜŞSÜN

`messages/tr.json`'a `__gateProbe` eklendi, `en.json`'a eklenmedi:

```
########## MUTATION: messages/tr.json gained __gateProbe, en.json did not ##########
❌ In tr.json but NOT in en.json (rule 8) (1):
   - __gateProbe

❌ i18n check FAILED — see the entries above. CLAUDE.md rule 8: a key ships in both languages.

⨯ Failed to load next.config.ts, see more info here https://nextjs.org/docs/messages/next-config-error

> Build error occurred
Error: Command failed: tsx scripts/i18n-check.ts
    at checkI18n (next.config.compiled.js:36:37)
    at _default (next.config.compiled.js:250:54) {
  status: 1,
  ...
}
[ELIFECYCLE] Command failed with exit code 1.
########## BUILD EXIT = 1 ##########
```

Mutasyon geri alındı; `grep -c '__gateProbe' messages/*.json` → `0 0`.

### 2.4 Yeni kontrolün mevcut testin yakalayamadığını yakaladığı — ikinci mutasyon

`tests/i18n.test.ts` zaten tr↔en simetrisini zorluyor (ve `pnpm gate` içinde koşuyor), yani
2.3'teki mutasyonu gate seviyesinde **o test** yakalıyor. Yeni kontrolün ne eklediğini
kanıtlamak için parite BOZULMADAN bir mutasyon yapıldı — `Navigation.dashboard` ve
`Pipeline.detail.tab.*` **iki katalogdan da** silindi:

```
########## MUTATION: Navigation.dashboard + Pipeline.detail.tab.* removed from BOTH catalogs ##########
 Test Files  102 passed | 2 skipped (104)          <-- mevcut parite testi HİÇBİR ŞEY görmüyor
❌ Used in code, missing in BOTH languages (1):
   - Navigation.dashboard
❌ Dynamic key shape matches nothing in Turkish (1):
   - Pipeline.detail.tab.${tab}
❌ Dynamic key shape matches nothing in English (1):
   - Pipeline.detail.tab.${tab}
❌ i18n check FAILED — see the entries above. CLAUDE.md rule 8: a key ships in both languages.
[ELIFECYCLE] Command failed with exit code 1.
########## GATE EXIT = 1 ##########
```

Bu aynı zamanda şablon-şekli kontrolünün (yol (c)) çalıştığının kanıtı. Geri alındı.

### 2.5 `next dev` muafiyeti — kırık katalogla bile açılıyor

`Navigation.devProbe` yalnız `en.json`'a eklenip `pnpm dev` çalıştırıldı:

```
- Local:         http://localhost:3001
✓ Ready in 242ms
```

Log'da ne `Checking i18n` ne de bir hata var — dev yolu kontrolü hiç çağırmıyor.
(Not: 3000 portu başka bir ajanın sunucusunda olduğu için Next 3001'e düştü; bu yüzden
`curl` probunu kanıt saymıyorum, kanıt "Ready" satırı ve kontrolün log'da hiç görünmemesi.)
Mutasyon geri alındı.

### 2.6 Kapı temiz — `pnpm gate` uçtan uca

```
$ pnpm gate
$ pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check && pnpm rls:check && pnpm rls:verify
 Test Files  102 passed | 2 skipped (104)
      Tests  1201 passed | 8 skipped (1209)
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
✅ SUCCESS: All 42 tenant-scoped models have RLS policies registered.
✅ Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
GATE EXIT = 0
```

### 2.7 Yeni regresyon testleri

```
$ npx vitest run tests/i18n-check-script.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

Testler betiği **gerçekten** (fixture katalog + fixture `src/` ile, alt süreç olarak)
koşuyor: temiz durumda yeşil; tek-dil anahtarında kırmızı; kodda kullanılıp katalogda
olmayan anahtarda kırmızı; şablon anahtarını sahte eksik saymıyor; şablon grubu bir dilden
silinince kırmızı; iki namespace'i ayrı çözüyor; aynı değişkenin yeniden bağlanmasını
görüyor; yorum içindeki `t()`'yi yok sayıyor.

### 2.8 `pnpm build`'in ayrı, BENİM OLMAYAN kırmızısı

Temiz katalogla `pnpm build` i18n kapısını **geçiyor** ama sonra turbopack aşamasında
düşüyor (`src/lib/k2-cordis/importer.ts` — dinamik `fs` yolu). Bunun benim değişikliğim
olmadığını kanıtlamak için `next.config.ts` HEAD sürümüne döndürülüp build tekrar koşuldu:

```
########## BUILD WITH THE ORIGINAL next.config.ts (HEAD) ##########
./src/lib/k2-cordis/importer.ts:206:26
./src/lib/k2-cordis/importer.ts:309:26
./src/lib/k2-cordis/importer.ts:524:24
./src/lib/k2-cordis/importer.ts:548:24
########## EXIT = 1 ##########
```

Yani `pnpm build` bu görevden **önce de** kırmızıydı, sebebi commit'li kod. Dosya geri
alındı. Bu, i18n kapısının asıl güvenilir enforcement noktasının şu an `pnpm gate` olduğu
anlamına geliyor — ki oraya eklendi.

---

## 3. Değişen dosyalar

| Dosya | Ne değişti |
|---|---|
| `scripts/i18n-check.ts` | Yeniden yazıldı: şablon-şekli eşleştirme, tr↔en parite kontrolü, değişken-başına + en-yakın-bağlama namespace çözümü, `getTranslations` desteği, yorum ayıklama, `--json` bayrağı, "unused" artık bloklamıyor |
| `next.config.ts` | Yutan `try/catch` kaldırıldı; `PHASE_PRODUCTION_BUILD` korumalı fonksiyon-biçimi export |
| `package.json` | `gate` zincirine `pnpm i18n:check` eklendi |
| `.github/workflows/i18n-check.yml` | PR yorumu raporu dosyadan okuyor (eski `execSync` tam da hata anında fırlatıp yorumu engelliyordu); yeni kova adları |
| `tests/i18n-check-script.test.ts` | **YENİ** — 8 regresyon testi, betiği fixture'lara karşı gerçekten koşuyor |
| `scripts/README.md` | Betik satırı yeni davranışı anlatıyor |
| `.claude/commands/i18n-check.md` | Var olmayan `scripts/i18n-diff.ts`'e yapılan atıf düzeltildi; kapının neyi bloklayıp neyi bloklamadığı yazıldı |

`src/` ve `messages/` **değişmedi**.

---

## 4. Riskler

- **En-yakın-bağlama namespace çözümü tam bir kapsam (scope) analizi değil.** Gerçek çözüm
  parser ister. Bu depodaki deyim (`const t = ...` çağıran fonksiyonun tepesinde) için birebir
  doğru; bir gün `t` bir callback'e parametre olarak geçirilirse yanlış çözebilir. Testle
  korundu, ama sınırı bilinsin.
- **Şablon kontrolü "en az bir eşleşme" arıyor.** `t(\`status.${s}\`)` için katalogda 5
  varyanttan 4'ü iki dilde de silinse kapı yeşil kalır. Statik olarak daha fazlası
  kanıtlanamaz; parite kontrolü bunun bir dilde olmasını zaten yakalar.
- **`--json` çıktı sözleşmesi değişti** (`details` kaldırıldı, yeni kovalar geldi).
  Tüketicileri güncellendi (next.config artık parse etmiyor, CI workflow yeni adları
  kullanıyor); başka bir tüketici varsa bilmiyorum.
- **206 "unused" anahtar hâlâ raporlanıyor.** Bloklamıyor, ama içinde gerçek ölü katalog
  girdileri olabilir; temizliği ayrı bir iş.

---

## 5. Açık sorular (sprintin bir sonraki gündemi — bu görevde DÜZELTİLMEDİ)

1. **`pnpm build` commit'li kodda kırık.** `src/lib/k2-cordis/importer.ts` içinde dört ayrı
   dinamik `fs` yolu (206, 309, 524, 548) turbopack'in modül izini kırıyor ve build exit 1
   dönüyor (kanıt §2.8). Bu, i18n kapısıyla ilgisiz ve bu görevden önce de vardı — ama
   **"build kapısı" diye bir şey şu an yok** demek: build zaten kırmızı, kimse fark etmiyor.
   Ayrı bir kart hak ediyor.
2. **`src/app/[locale]/pricing/page.tsx:78` typecheck hatası** — commit sırasında pre-commit
   hook'un "ağaçta senin OLMAYAN typecheck hataları var" uyarısı. `PricingClientProps`'a
   uymayan prop kümesi. Paralel çalışan bir ajanın (paket stüdyosu vitrin kartı) yarım
   bıraktığı iş olabilir; benim commit'imden ÖNCE `pnpm typecheck` temizdi.
3. **Paralel ajanlar aynı çalışma ağacında `messages/*.json` yazıyor.** Bu görev sırasında
   katalog 1317 → 1319 anahtara çıktı (TASK-MTSHTIYJWTQKO'nun sahte "EUROPEAN COMMISSION"
   rozeti işi). Mutasyon testlerini `git checkout` ile değil bayt yedeğiyle geri almak
   zorunda kaldım. Dalga başına tek yazar ya da worktree izolasyonu düşünülmeli.
4. **CI workflow'unun PR yorumu hiç doğrulanmadı.** Kodu düzeltildi ama gerçek bir PR'da
   koşmadı — bu depoda GitHub Actions koşusunu tetikleyemedim.
5. **`t()` anahtarı olmayan i18n ihlalleri hâlâ görünmez.** Kapı yalnız `t()` çağrılarını
   ölçer; bir bileşen `useTranslations` hiç import etmeyip 78 sabit Türkçe string taşısa kapı
   yeşil kalır (takım hafızası: `fabrika-i18n-dead-catalog-trap`). Sabit-metin taraması ayrı
   bir kapı işi.

---

## 6. Sonraki adım

- Kart **review**'a alınabilir: kapı hem yeşile hem kırmızıya gidiyor, ikisi de kanıtlı.
- §5.1 (`pnpm build` turbopack kırmızısı) için ayrı kart açılmalı — i18n kapısının build
  ayağı ancak o düzelince fiilen değerli olur; şu an `pnpm gate` taşıyor.
- §5.2 typecheck hatası kimin işiyse ona bildirilmeli.
