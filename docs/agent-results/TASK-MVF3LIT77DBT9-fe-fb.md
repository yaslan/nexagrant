---
sözleşme: 3
görev: TASK-MVF3LIT77DBT9
kod: TASK-MVF3LIT77DBT9
ajan: fe-fb
motor: claude
tip: hata
okur: kullanıcı
hüküm: Kısmen bitti: Dört kod maddesi yapıldı ve mutantlarla kanıtlandı, commit 54f03748 hazır. Pre-push kapısında vitest, i18n ve RLS adımları yeşil geçti. e2e adımı 212/387 testte 0 kırmızıdayken makinenin diski doldu (ENOSPC) ve sunucu çöktü. Bu yüzden dal push edilmedi, PR açılmadı.
platform: mac (Darwin 27) üzerinde doğrulandı: vitest, tsc, eslint, i18n:check, Playwright/Chromium ve mutantlar. Değişiklik saf TS (Node script + React metni); süreç, dosya yolu ve kabuk farkı yok. Satır sonları `\s+` ile normalize ediliyor ve TS AST'si CRLF'yi de satır sayıyor, bu yüzden Windows'ta da aynı sayım beklenir. Windows ve Linux'ta koşulamadı, çünkü makine yalnız mac.
sürüm: 1
tarih: 2026-10-19T22:14:18.891Z
---

# FO-95: i18n detektörü çok satırlı JSX metnini sayıyor, PartB e2e daraltıldı, yorum saati UI locale'iyle. Push disk dolduğu için yarıda kaldı.

## Kararlar

```karar
kimlik: karar-1
soru: Makinenin diski %100 dolu (1 GB boş). FO-95 push kapısı e2e'nin ortasında ENOSPC ile çöktü. Kendi .next ve test-results klasörlerimi silme iznim reddedildi. Nasıl ilerleyelim?
seçenek: A | Ofis sahibi diski temizler (eski worktree'ler, docker prune), sonra fe-fb aynı komutla push'u tekrarlar
seçenek: B | fe-fb'ye yalnız kendi worktree'sindeki .next ve test-results klasörlerini (~2.2 GB) silme izni verilir, push tekrarlanır
seçenek: C | Push bekletilir, kart bu haliyle in_progress kalır
öneri: A
karar_kimligi: K-570199
```

## Ne yapıldı
Dal `fe-fb/fo95-i18n-multiline-detector` (worktree `/Users/macbook/alan/FONBRIDGE-fo95`), origin/dev 80271979 üzerine tek commit **54f03748**.

1. **Detektör (`scripts/i18n-hardcoded.ts`):**
   - JSX metni satır regex'i yerine TypeScript AST'sinden (`ts.isJsxText`) okunuyor ve boşluklar React'in yaptığı gibi tek boşluğa indiriliyor. Kendi satırındaki etiket ("Prettier biçimi"), birden çok satıra bölünmüş cümle ve `{x} Kelime` gibi ifade bitişiğindeki metin artık sayılıyor.
   - Yeni `isJsxProse`: JSX metninde tek, büyük harfle başlayan kelime (`/^[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}$/`, köşeli parantez/noktalama soyulmuş) etiket sayılıyor. Kart ASCII "Vazgec"in yakalanmasını istediği için bunu seçtim; prop'larda (`title="Save"`) tek kelime hâlâ sayılmıyor. Küçük harfli tek kelime (`px`, `pnpm`) sayılmıyor.
   - Yan kazanç: eski regex TS karşılaştırmalarını JSX metni sanıyordu (`calls/turkey/page.tsx:109`, `cents > limit || cents < -limit`). AST ile bu yanlış pozitif kalktı.
   - Prop (title/label/placeholder/aria-label) taraması değişmedi.
2. **Baseline (`i18n-baseline.json`):** ölçüldü ve dürüstçe yükseltildi; metin taşınmadı.
3. **e2e (`tests/e2e/partb-template-identity.spec.ts`):** `body` içinde `(0 Words)` aramak yerine, aktif bölüm satırı katalogdaki `currentPages` metninden kurulan anchor'lı regex'le eşleniyor (`^Now: ~[\d.,]+ Pages \(0 Words\)$`). Sayfa sayısı ekranda `0.0` olarak çıktığı için sayı kısmı esnek bırakıldı.
4. **Yorum saati (`PartBCollaborativeEditor.tsx:1004`):** `toLocaleTimeString([], …)` → `toLocaleTimeString(locale, …)`.

## Kanıt (ham çıktı)
**Detektör testi önce kırmızı** (6 yeni test, eski kod):
```
× reports a Turkish label that sits on its own line
× reports an ASCII-spelled label on its own line — "Vazgec" has no Turkish letter to give it away
× reports a sentence wrapped over several lines once, with its whitespace collapsed
× reports text that shares its node with an expression
× reports a single capitalised word in JSX text
× does not read TypeScript comparisons as JSX text
Tests  6 failed | 25 passed (31)
```
Sonra yeşil: `tests/i18n-hardcoded-detector.test.ts` + `tests/i18n-check-script.test.ts` → `Tests 40 passed (40)`.

Kendi hatam da yakalandı: ilk sürüm satır numarasını baştaki girinti kadar kaydırıyordu (mutant 1155'teyken 1156 raporlandı). Önce "points at the label line even under deep indentation" testi kırmızı verdi (`expected [ 4 ] to deeply equal [ 3 ]`), düzeltme sonrası yeşil.

**Detektör mutantı** (PartB `:1155` `{tEditor('cancel')}` → çok satırlı sabit metin):
```
mutant "Vazgeç" → pnpm i18n:check: PartBCollaborativeEditor.tsx (1 literal) 1155 [jsx-text] "Vazgeç"  ❌ FAILED exit=1
mutant "Vazgec" → pnpm i18n:check: PartBCollaborativeEditor.tsx (1 literal) 1155 [jsx-text] "Vazgec"  ❌ FAILED exit=1
dev detektörü (origin/dev scanSource), aynı iki mutant → []   (kör nokta kanıtı)
```
Dev'deki PartB (FO-93 öncesi) ölçümü: eski detektör 16, AST 33 çok kelimeli/Türkçe + 6 tek-etiket (`Hedef:`, `Sayfa`, `Kaydediliyor...`, `Senkronize`, `Kaydet`, `Kelime`).

**e2e daraltması + mutant** (izole DB `fabrika_fo95`, Playwright/Chromium):
```
temiz dal:                         2 passed (19.0s)
mutant (aktif satır sabit TR):     yeni spec → en: 1 failed
                                   Locator: getByRole('main').getByText(/^Now: ~[\d.,]+ Pages \(0 Words\)$/)  element(s) not found
                                   eski (dev) spec aynı mutantla → 2 passed   (sayfa-bütçe çubuğu maskeliyordu)
```

**Yorum saati, gerçek tarayıcı** (geçici spec, commit'lenmedi). Tarayıcı `tr-TR`, arayüz `en`, yorum UI'dan yazılıp gönderildi:
```
önce  ([]):     COMMENT_TIME=00:55      (tarayıcı locale'i sızıyor)
sonra (locale): COMMENT_TIME=12:54 AM   (UI locale'i)
```
Ekran görüntüleri karta iliştirildi (önce/sonra).

**Statik kontroller:** `npx tsc --noEmit` exit 0 · eslint (4 dosya) exit 0 · `pnpm i18n:check` ✅ passed (yeni baseline ile) · i18n:check süresi ~1.9 sn.

**Pre-push `pnpm gate`** (`--no-verify` YOK; DB env'i izole kopya `fabrika_fo95`'e yönlendirildi):
```
Test Files  368 passed | 2 skipped (370)
     Tests  4872 passed | 54 skipped (4926)
✅ i18n check passed
✅ SUCCESS: All 47 tenant-scoped models have RLS policies registered.
✅ SUCCESS: no new tenant bypass. … 44 on the sanctioned cross-tenant path, 0 still owed.
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
✅ fabrika_app already exists; … Password left unchanged.
Running 387 tests using 1 worker
  ✓ 212 … m9-calendar-connect.spec.ts …   (bu noktaya kadar 0 ✘)
[WebServer] ⨯ uncaughtException: [Error: ENOSPC: no space left on device, write]
PUSH_EXIT=1
```
`df -h /System/Volumes/Data` → `460Gi 425Gi 1.0Gi 100%`. Dal remote'ta yok (`git ls-remote` boş).

## Baseline artışı (dosya bazında)
| Dosya | Önce | Sonra | Fark |
|---|---|---|---|
| `src/app/[locale]/(app)/[workspace]/calls/page.tsx` | 0 | 2 | +2 |
| `src/app/[locale]/(app)/[workspace]/concept-notes/[id]/editor.tsx` | 4 | 13 | +9 |
| `src/app/[locale]/(app)/[workspace]/concept-notes/[id]/page.tsx` | 0 | 2 | +2 |
| `src/app/[locale]/(app)/[workspace]/concept-notes/page.tsx` | 3 | 7 | +4 |
| `src/app/[locale]/(app)/[workspace]/evidence/EvidenceForm.tsx` | 10 | 18 | +8 |
| `src/app/[locale]/(app)/[workspace]/partners/PartnerFilters.tsx` | 6 | 10 | +4 |
| `src/app/[locale]/(app)/[workspace]/partners/page.tsx` | 1 | 6 | +5 |
| `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager.tsx` | 5 | 6 | +1 |
| `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/page.tsx` | 1 | 3 | +2 |
| `src/app/[locale]/(app)/[workspace]/pipeline/board.tsx` | 29 | 46 | +17 |
| `src/app/[locale]/(app)/[workspace]/settings/api-keys/client.tsx` | 17 | 28 | +11 |
| `src/app/[locale]/(public)/calls/page.tsx` | 0 | 3 | +3 |
| `src/app/[locale]/(public)/calls/turkey/page.tsx` | 1 | 0 | −1 (eski regex'in yanlış pozitifi; baseline'dan çıktı) |
| `src/app/[locale]/(public)/page.tsx` | 4 | 15 | +11 |
| `src/app/[locale]/admin/audit/page.tsx` | 4 | 8 | +4 |
| `src/app/[locale]/admin/blog/client.tsx` | 21 | 29 | +8 (dev'de gerçek 19'du, baseline 2 gevşekti) |
| `src/app/[locale]/admin/cordis/client.tsx` | 37 | 59 | +22 |
| `src/app/[locale]/admin/layout.tsx` | 3 | 8 | +5 |
| `src/app/[locale]/admin/modules/client.tsx` | 3 | 13 | +10 |
| `src/app/[locale]/admin/settings/smtp-form.tsx` | 6 | 9 | +3 |
| `src/app/[locale]/admin/tenants/page.tsx` | 4 | 9 | +5 |
| `src/app/global-error.tsx` | 1 | 3 | +2 |
| **Toplam** | **186 (27 dosya)** | **323 (29 dosya)** | **+137** |

## Değişen dosyalar (54f03748)
- `scripts/i18n-hardcoded.ts`
- `i18n-baseline.json`
- `tests/i18n-hardcoded-detector.test.ts` (7 yeni test; "tek ASCII kelime sayılmaz" testi prop'a daraltıldı)
- `tests/e2e/partb-template-identity.spec.ts`
- `src/modules/m11/ui/PartBCollaborativeEditor.tsx` (tek satır)

## Riskler
- **Politika değişikliği:** JSX metnindeki tek, büyük harfle başlayan kelime artık ihlal sayılıyor. Yeni eklenen marka adı (`<span>Fabrika</span>`) de kapıyı kırar; çözümü `t()`. Repo genelinde 48 tek-kelime adayının hepsi gerçek UI metniydi (Cancel, Status, Slug…), yanlış pozitif görmedim.
- `next.config.ts` bu kontrolü build'de çağırıyor; script artık `typescript` paketini import ediyor. Next zaten TS projesinde `typescript`'e ihtiyaç duyduğu için build ortamında var olmalı. Docker imajında devDependencies'in kurulu olduğunu ayrıca doğrulamadım.
- İzole DB `fabrika_fo95` `fabrika-postgres` üzerinde duruyor (ortak `fabrika`'ya dokunulmadı; `db:rls` yalnız kopyaya: `Policies 117 → 117`). Push yeniden denenince kullanılacak; iş bitince `drop database fabrika_fo95 with (force)`.

## Açık sorular
Disk kararı aşağıda (karar kutusu).

## Sonraki adım
Diskte ≥10 GB boş yer açılınca aynı worktree'den aynı komutla push: `PATH=/opt/homebrew/opt/postgresql@16/bin:$PATH <scratchpad>/W git push -u origin fe-fb/fo95-i18n-multiline-detector`. Ardından PR dev'e (merge yok).
