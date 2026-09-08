# TASK-MTS6MBA7NEIM0 — e2e kırmızıları A: kapanış ölçümü + zorunlu mutasyon

Ajan: `customer-support` (CS-EN) · Dal: `dev` · S12 dalga 8 (ek tur) · Tarih: 2026-09-08

> **Kısa sonuç: KART BAYAT — düzeltilecek bir şey yok, NET SIFIR kod değişikliği.**
> Dört test de bugün yeşil; kırmızılar `d3ec76f` ile (blok-zincir-dse) kapanmış. Benim
> eklediğim şey kapanış ölçümünün eksik yarısı: **dördü de gerçekten bir şey koruyor mu?**
> Dört ayrı mutasyonla kanıtladım — her spec, koruduğu kusur ürüne geri konduğunda **kırmızı
> veriyor**, hem de tam olarak o kusuru hedefleyen satırda.

---

## 1. Ne yapıldı

### 1a. Dört test tek tek koşuldu — dördü de YEŞİL

Hiçbir spec'e, hiçbir ürün dosyasına kalıcı dokunuş yok. Kartın "kırmızı kalan varsa ürün mü
test mi" sorusu **konusuz**: kırmızı kalan yok.

### 1b. Kart neden bayat — kırmızıları kim kapatmış

`git log -- tests/e2e/m9-brief-generate-failure.spec.ts tests/e2e/opportunity-archive.spec.ts`
→ `d3ec76f fix(e2e): put the M9 and archive specs in a tenant that owns the module`.
Dört kırmızının tek kök nedeni varmış: tarayıcı test edilen ekrana hiç ulaşmıyor, `moduleGate`
modül-kilidi sayfasını sunuyor, sonra her seçici "element not found" diyor. Spec'ler artık
plan + `ModuleState` + fırsat + krediyi kendi kuran `fixtures/m9-tenant` ve `seed-archive-e2e`
üzerinde koşuyor. **Hiçbir iddia gevşetilmemiş** — bunu mutasyonla ayrıca doğruladım (§1c).

### 1c. ZORUNLU MUTASYON — dördü de kırmızıya dönüyor

Kartın çıtası: yeşil bir spec kanıt değildir; koruduğu kusur ürüne geri konunca kırmızı vermeli.
Dört mutasyonun her biri, spec'in başlığında **yazılı olan özgün kusuru** ürün kaynağında geri
getiriyor. Her mutasyon tek bir Bash komutunda uygulandı → tek test koşuldu → **hemen** geri
alındı; paylaşılan ağaçta dosya yalnız saniyeler boyunca bozuk kaldı (§5'e bkz).

| # | Mutasyon (ürün kaynağı) | Geri getirilen kusur | Kırmızı veren spec + satır |
|---|---|---|---|
| 1 | `briefs/client.tsx` — `catch`'teki `setGenerateError(t('generate.failed'))` yorumlandı | Düşen istek `console.error`'a gidiyor, ekran susuyor | test 1 · `:98 expect(band).toBeVisible()` |
| 2 | `briefs/client.tsx` — `!res.brief` dalındaki `setGenerateError(t('generate.notSaved'))` yorumlandı | `if (res.brief)`'in else'i yok; boş sonuç sessizce yutuluyor | test 2 · `:157 expect(band).toBeVisible()` |
| 3 | `briefs/client.tsx` — başarıdan sonra `setPartnerName('')` yorumlandı | Başarılı üretim formu kirli bırakıyor | test 3 · `:194 toHaveValue('')` |
| 4 | `pipeline/actions.ts` — `opportunity.updateMany({deletedAt})` → `deleteMany` | "Arşivle" kaydı gerçekten yok ediyor | archive · `:140 expect(archived).not.toBeNull()` |

4. mutasyon özellikle önemli: spec'in kendi yorumu *"an archive that silently deleted would pass
a 'card is gone' check just as well"* diyor. Mutasyon tam bunu yapıyor — kart panodan kalkıyor,
adım 5 geçiyor — ve spec yine de adım 6'da yakalıyor. **İddia gerçekten satırı geri okuyor.**

---

## 2. Kanıt (hepsi bu koşuda, 2026-09-08)

### 2.1 Bugünkü durum — dört test tek tek

```
$ npx playwright test tests/e2e/m9-brief-generate-failure.spec.ts
Running 3 tests using 1 worker
  [1/3] … › a dropped request surfaces in the band, keeps the form, and retries
  [2/3] … › an action that comes back with no brief is reported, not ignored
  [3/3] … › the happy path still ends with a brief and no band
  3 passed (5.6s)

$ npx playwright test tests/e2e/opportunity-archive.spec.ts
Running 1 test using 1 worker
  [1/1] … › archiving hides the opportunity everywhere but keeps the record
[seed-archive-e2e] ready — tenant=archive-e2e-tenant opportunities=archive-e2e-opportunity,archive-e2e-opportunity-kept
[seed-archive-e2e] rolled back
  1 passed (3.9s)
```

### 2.2 MUTASYON-1 — `catch` sustuğunda

```
MUTATION-1 applied: catch no longer reports
    Error: expect(locator).toBeVisible() failed
    Error: element(s) not found
    >  98 |     await expect(band).toBeVisible();
      100 |     await expect(band).toContainText(M9.generate.failed);
  1 failed
--- restored, diff:            ← git diff --stat boş = dosya bozulmadan geri kondu
```

### 2.3 MUTASYON-2 — boş sonuç sessizce yutulduğunda

```
MUTATION-2 applied: empty result silently ignored
    Error: expect(locator).toBeVisible() failed
    Error: element(s) not found
    > 157 |     await expect(band).toBeVisible();
      158 |     await expect(band).toContainText(M9.generate.notSaved);
  1 failed
--- restored, diff:
```

### 2.4 MUTASYON-3 — başarıdan sonra form temizlenmediğinde

```
MUTATION-3 applied: form not cleared after a successful generate
    Error: expect(locator).toHaveValue(expected) failed
    Expected: ""
    > 194 |     await expect(app.getByPlaceholder(/Ortak \/ Kurum Adı/)).toHaveValue('');
  1 failed
--- restored, diff:
```

### 2.5 MUTASYON-4 — "arşivle" kaydı sildiğinde

```
MUTATION-4 applied: archive hard-deletes the row
    Error: expect(received).not.toBeNull()
    Received: null
    > 140 |     expect(archived).not.toBeNull();
  1 failed
--- restored, diff:
```

### 2.6 Mutasyonlardan sonra ağaç ve DB temiz

```
$ git status --porcelain <dört ürün dosyası>
(çıktı yok = dördü de bozulmadan geri kondu)

$ npx playwright test tests/e2e/m9-brief-generate-failure.spec.ts tests/e2e/opportunity-archive.spec.ts
  4 passed (9.1s)

$ archive-e2e opportunities: 0 · efforts: 0 · m9-e2e briefs: 0      ← fixture'lar geri alındı,
                                                                     4. mutasyonun sert silmesi
                                                                     hiçbir kalıntı bırakmadı
```

### 2.7 Commit'li kanıt klasörüne DOKUNULMADI

```
$ git status --porcelain docs/agent-results/TASK-MTS6MBA7NEIM0-screenshots/
(çıktı yok)
$ ls test-artifacts/TASK-MTS6MBA7NEIM0-screenshots/
01-board-before-archive.png  01-form-filled.png  02-effort-empty-state.png  …
```
Kareler `shotsDir()` sayesinde git-ignored `test-artifacts/`'e düştü; `d3ec76f`'in commit'lediği
kanıt frameleri olduğu gibi duruyor.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `docs/agent-results/TASK-MTS6MBA7NEIM0-customer-support.md` | bu rapor |

**Ürün ve test kaynağında NET SIFIR değişiklik.** Dokunulan dört dosya
(`briefs/client.tsx`, `pipeline/actions.ts` ve iki spec) mutasyon penceresi dışında
byte-byte aynı — §2.6'daki boş `git status` bunun ölçümü.

---

## 4. Riskler

- **Mutasyon pencereleri paylaşılan ağaçta.** Dört mutasyonun her biri tek komutta uygulanıp
  geri alındı, yani her pencere ~10–40 saniye. Yine de o saniyelerde `briefs/client.tsx` ve
  `pipeline/actions.ts` bilerek bozuktu. Aynı dakikalarda M9 brief **davranışını** ölçen bir
  pane varsa (TASK-MTQUX5IZ9I5VP, blog-yazar) ve "hata bandı çıkmıyor" ya da "form temizlenmiyor"
  gibi bir anomali gördüyse, o gözlem benim MUTASYON-1/2/3'ümün penceresine denk gelmiş olabilir.
  Ölçümlerini tekrarlasınlar; ağaç şu an temiz ve dördü de yeşil.
- Mutasyonlar ürün kaynağını değiştirdiği için `pnpm dev` her seferinde yeniden derledi; sonraki
  ilk istek yavaş olabilir. Kalıcı etki yok.
- `opportunity-archive` fixture'ı `archive-e2e-tenant`'ı kurup söküyor; koşu sırasında o kiracıyı
  okuyan başka bir ölçüm varsa geçici olarak veri görür/görmez.

---

## 5. Açık sorular (DÜZELTMEDİM — ADIYLA bildiriyorum)

1. **`pnpm lint` şu an 5 HATA veriyor ve kapı herkese kapalı.** Uyarı değil, hata:
   `src/components/cart/CartContext.tsx:170` — `react-hooks/set-state-in-effect`
   ("Calling setState synchronously within an effect can trigger cascading renders"),
   `setQuote({…})` doğrudan `useEffect` gövdesinde. Sahiplik ölçüldü:
   ```
   $ git status --porcelain src/components/cart/CartContext.tsx   →  M   (commit'lenmemiş)
   $ git show HEAD:src/components/cart/CartContext.tsx | grep -c "setQuote({"   →  0
   $ grep -c "setQuote({" src/components/cart/CartContext.tsx                   →  2
   ```
   Yani HEAD'de yok, yalnız çalışma ağacında var — **billing/cart üzerinde çalışan pane'in
   commit'lenmemiş işi.** Commit etmeden önce düzeltilmeli, yoksa `pnpm gate` kimsede geçmez.
2. **Aynı bölgede 4 lint uyarısı daha** (hepsi commit'lenmemiş billing işinden):
   `admin/billing/client.tsx:58 plansMeasured` · `pricing/PricingClient.tsx:11 NO_DISCOUNT_TIER` ·
   `api/billing/checkout/route.ts:7 getActiveTier`, `:8 withTenant`.
3. **ÇAKIŞMA BİLDİRİMİ (kartın istediği gibi):** benim iki spec'im
   (`m9-brief-generate-failure.spec.ts`, `opportunity-archive.spec.ts`) şu an
   **commit'lenmemiş halde kirli** — ama değişiklik benim değil, `blok-zincir-dse`'nin
   `shotsDir()` göçü (`const SHOTS = 'docs/agent-results/…'` → `shotsDir('…')`,
   TASK-MTSHUZUMVLTBF). Karta uyarak o satırlara **dokunmadım ve stage'lemedim**; testleri
   onların düzenlemesi yerindeyken koştum (dördü de yeşil, yani göçleri bu iki spec'i kırmıyor).
   Commit sırası onlarda.
4. `pnpm typecheck` şu an **temiz** — önceki turumda bildirdiğim `scripts/i18n-check.ts:237`
   TS18047 hatası giderilmiş.

---

## 6. Sonraki adım

- Kart `review` → **kapatılabilir**: iş `d3ec76f`'te bitmiş, kapanış ölçümü + dört mutasyon
  kanıtı bu raporda. Yapılacak kod işi yok.
- §5.1'deki lint **hatası** billing pane'ine iletilmeli; commit'lenirse `pnpm gate` herkeste
  kırmızıya döner.
