---
sözleşme: 3
görev: TASK-MVE19AQ06FF6J
kod: TASK-MVE19AQ06FF6J
ajan: crw2-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: PR #116 onaylandı. Bloke eden bulgu yok. Beş inceleme sorusunun hepsi kanıtla doğrulandı; iki test-gücü önerisi ve iki gözlem engel değil.
platform: mac (Darwin 27) üzerinde doğrulandı: vitest, tsc, eslint, i18n:check ve mutantlar. Değişiklik yalnız web arayüzünü etkiliyor (React metni, Intl biçimleme, CSS flex-wrap) ve platforma bağlı bir kod yolu yok. Windows ve Linux'ta koşulmadı; davranış işletim sistemine değil tarayıcıya ve Node ICU'ya bağlı.
sürüm: 1
tarih: 2026-10-19T10:13:46.006Z
---

# FO-93 · PR #116 kod incelemesi (crw2-fb)

**Hüküm: Onay. Bloke eden bulgu yok.** Merge edilmedi, kod değiştirilmedi.

## Ne yapıldı
- `gh pr diff 116` farkını satır satır okudum. Dal `fe-fb/fo93-m2-m11-i18n`, HEAD 9728aa35. merge-base = `origin/dev` = 49e6a817, yani dal dev ile güncel. Commit'ler: 5cb4dc14, 0ccf5c02, 9728aa35.
- Worker raporunu (`/Users/macbook/alan/docs/agent-results/TASK-MVE19AQ06FF6J-fe-fb.md`) ve kartı okudum.
- Kendi geçici worktree'mde (9728aa35, detached) testleri, typecheck'i, lint'i, i18n:check'i ve mutantları koştum. Sonra worktree'yi sildim. fe-fb'nin `FONBRIDGE-fo93` worktree'sine dokunmadım; `git status` boş.

## İnceleme soruları
**(1) M2 sayaç ve export catch: doğru.**
- `/\\s+/` regex literal'i "ters bölü + s+" diye bölüyordu. Bu yüzden 4 kelime 1 sayılıyordu. `/\s+/` doğru düzeltme.
- `''.split(...)` sonucu `['']` olur; `.filter(Boolean)` bunu 0'a indiriyor. Boşluk, sekme ve satır sonu da ayırıcı sayılıyor.
- Export catch'i artık `errorText(err, () => t('failed', …))` kullanıyor. Bu, `ConceptNoteEditor.tsx:55` ve `:69`'daki generate/save satırlarıyla birebir aynı.
- `useActionErrorText` fallback olarak fonksiyon kabul ediyor (`src/lib/hooks/use-action-error-text.ts:41`). Pilot, rol, meşgul ve modül-kapalı dalları da export'a geçmiş oluyor.

**(2) PartBEditor anahtarları: tr ve en eşit, sabit metin kalmadı.**
- tr 62 / en 62 anahtar; eksik ya da fazla yok. 5'i önceden vardı, 57'si yeni (diff'te 2×57 = 114 satır).
- Her anahtarın yer tutucu kümesi iki dilde aynı. `sectionCount` EN'de ICU plural, TR'de düz `{count}`; ikisi de geçerli.
- EN değerlerinde Türkçe harf yok.
- `pnpm i18n:check` geçti. PartB sayımı 0, yani baseline düşüşü doğru.
- i18n:check tek başına kanıt değil (aşağıdaki not). Bu yüzden dosyayı ayrıca grep'le taradım. Kalan tırnaklı dizgiler yalnız className, `console.error` ve durum enum'ları. Kullanıcıya görünen sabit metin kalmadı.

**(3) Kart dışı iki ek: ikisi de güvenli.**
- `toLocaleString(locale)` (`application/client.tsx:253,499,517`): `locale` zaten `useLocale()`'dan geliyor (`:46`). Sunucu ve istemci aynı locale ile biçimlediği için hydration uyuşmazlığı gidiyor. Sayı değeri değişmiyor.
- `flex-wrap`: üst satır (`:846`) zaten `flex flex-wrap justify-between`. İç düğme grubu yalnız taşınca alt satıra geçiyor; geniş ekranda düzen aynı kalıyor.

**(4) Test beklentileri gevşemedi, sıkılaştı.** Mutantları kendim koştum:

| Mutant | Sonuç |
|---|---|
| M1: sayaç `/\\s+/`'a geri | 3 kırmızı (sayaç ×3) ✅ öldü |
| M2: export catch `errorText`'siz | 1 kırmızı (pilot-expired testi) ✅ öldü |
| M3: PartB dosyası dev sürümüne geri | 5/5 kırmızı ✅ öldü |
| M4: yalnız `synced` → sabit "Senkronize" | 2 kırmızı ✅ öldü |
| M5: `synced` ↔ `unsaved` anahtarları yer değiştirdi | 4 kırmızı ✅ öldü |
| M6: `cancel` → sabit "Vazgec" (ASCII) | 5/5 yeşil ⚠️ sağ kaldı (öneri 2) |

- `m11-partb-editor-buffer`: eski test EN katalogla render edip Türkçe "Senkronize" bekliyordu, yani hatayı kilitliyordu. Yeni beklenti katalogdan okunuyor; M4 ve M5 bu testin gerçekten ayırt ettiğini gösteriyor.
- `partb-template-identity` e2e: `(Kelime|words)` alternasyonu her iki dili de kabul ediyordu. Yeni beklenti dile özgü, yani daha sıkı. Kalan zayıflık için bkz. öneri 1.

**(5) `i18n-baseline.json`: yalnız PartB girdisi düşüyor.** Fark yalnız `PartBCollaborativeEditor.tsx: 16` satırının silinmesi. `global-error.tsx` satırı sadece sondaki virgülünü kaybetti; değeri 1 olarak aynı. `admin/blog` 21→19 "looser" uyarısı başkasına ait ve bu PR'a girmemiş; doğru karar.

## Bulgular (önem sırasıyla, hiçbiri bloke etmiyor)
1. **Öneri (test gücü): e2e'deki `(0 Words)` iki ayrı yerden gelebiliyor.** `tests/e2e/partb-template-identity.spec.ts:209`
   - Senaryo: fixture'da tüm bölümler boş, bu yüzden sayfa-bütçe çubuğu da `pageBudgetValue` → "0 / 45 Pages (0 Words)" yazıyor.
   - Aktif bölüm satırı (`currentPages`) tekrar Türkçe "(0 Kelime)" yazsa bile `body` hâlâ "(0 Words)" içerir ve test geçer.
   - Bu zayıflık eski regex'te de vardı. Birim testteki Türkçe-harf denetimi ("Şu an") bu boşluğu kapatıyor.
   - Düzeltme önerisi: beklentiyi aktif bölüm başlık satırının locator'ına daralt, ya da "Now: ~0" / "Şu an: ~0" önekiyle eşle.
2. **Öneri (test gücü / gate kör noktası): Türkçe-harf regex'i ve i18n detektörü ASCII ya da çok satırlı metni görmüyor.**
   - M6 ("Vazgec") birim testte sağ kaldı.
   - Ayrıca `scripts/i18n-hardcoded.ts` çok satırlı JSX metin düğümünü hiç saymıyor. "Vazgeç" (ç'li) mutantı da i18n:check'ten geçti. Dev sürümündeki PartB'de detektör 16 literal saydı; gerçekte ~55 vardı ("Kaydet", "Senkronize", "Vazgeç" sayılmamış).
   - Bu PR'ın kusuru değil: PR dosyadaki metinlerin tamamını taşıdı, ben de grep'le doğruladım. Ama "i18n:check temiz" dosyanın temiz olduğunu tek başına kanıtlamıyor.
   - Öneri: detektörün çok satırlı JSX text düğümünü yakalaması için ayrı bir kart açılsın (kapsam dışı).
3. **Gözlem (nit, kapsam dışı): yorum saati hâlâ tarayıcı locale'iyle biçimleniyor.** `PartBCollaborativeEditor.tsx:1004`: `toLocaleTimeString([], …)`. Yorum çekmecesi yalnız tıklanınca istemcide açılıyor, bu yüzden hydration riski yok. Ama EN kullanıcı TR tarayıcıda TR saat biçimi görür; tutarlılık için `locale` geçilebilir.
4. **Gözlem (kapsam dışı, worker da işaretledi): revizyon `summary` alanı DB'ye yazarın dilinde kaydediliyor.**
   - Önce hep Türkçeydi; artık karışık olabilir. Kalıcı çözüm özeti kod olarak saklamak.
   - "Taslak Üretiliyor (2 Kredi)" metnindeki 2 kredi sabiti önceden vardı, bu PR'da yalnız kataloğa taşındı.

## Kanıt (ham çıktı)
```
i18n:check → ✅ passed; PartB satırı yok (0); "admin/blog 21 → 19" looser uyarısı başkasına ait
node parity → PartBEditor tr=62 en=62, missing [] [], placeholder diff yok, EN'de TR harf yok
vitest (concept-note-editor-notice, m11-partb-editor-buffer, i18n, i18n-check-script,
        i18n-hardcoded-detector, prompt-snapshots, concept-note-editor-sections)
  → Test Files 7 passed (7) · Tests 61 passed (61)
npx tsc --noEmit → exit 0
eslint (6 değişen dosya) → exit 0
scanHardcoded() dev PartB → 16 (çok satırlı Kaydet/Senkronize/Vazgeç sayılmıyor)
scanHardcoded() HEAD + "Vazgeç" mutantı → []  (detektör kör noktası)
```

## Değişen dosyalar
Yalnız bu rapor: `docs/agent-results/TASK-MVE19AQ06FF6J-crw2-fb.md`.

## Riskler
- Bulgu 1 ve 2'deki test boşlukları ileride sessiz bir regresyona izin verebilir. Bugünkü kod doğru.

## Açık sorular
Yok.

## Sonraki adım
- Lider PR #116'yı merge kararına alabilir.
- İsteğe bağlı iki küçük kart: (a) e2e locator'ını daraltmak, (b) i18n detektörünün çok satırlı JSX metnini yakalaması.
