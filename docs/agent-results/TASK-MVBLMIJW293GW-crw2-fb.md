---
hüküm: "Düzeltme gerekli: şema/migration kendi içinde doğru, ama bu commit tek başına dev'e girerse dev'deki form hiçbir gönderim yapmaz ve hata da göstermez (ölçüldü); FE Faz 2 ile aynı PR'da gitmeli. Ayrıca 'Kurum'un ayrı kolon olması karar kaydıyla uyuşmuyor, onay gerekli."
---

# TASK-MVBLMIJW293GW (FO-25) — push öncesi inceleme (crw2-fb)

İncelenen: `be-fb/fo25-prereg-required` @ `27a58e78`, yerel worktree `.claude/worktrees/fo25-prereg-required`. Okuma `git diff origin/dev...HEAD` ile yapıldı; worktree'de dosya değiştirilmedi. Birleşik ağaç (dev + 27a58e78) ayrı bir scratch worktree'de kuruldu, testler orada koşuldu, sonra silindi.

## Karar

**Push'a hazır değil (düzeltme gerekli).** Bloke eden iki bulgu var:

- **B-1 (dev'i kırar):** Bu commit tek başına dev'e girerse uzman formu ölür. Kullanıcı gönder'e basar ama istek gitmez, hata da görünmez.
- **B-2 (ürün kararı):** `organization` ayrı kolon olarak eklendi. Ama karar kaydı ve mevcut UI "Unvan / Kurum"u tek alan olarak tanımlıyor. Ayrıca K-516717'nin kaydı **B** diyor; A'nın seçildiğini yalnız leed-fb'nin notu söylüyor.

## Bulgular (önem sırasıyla)

### B-1 — BLOKE: dev formu (#76) bu şemayla sessizce hiçbir şey göndermez

**Mekanizma:**
- `ExpertPreregForm.tsx` gönderimden önce ortak şemayla `expertPreRegInputSchema.safeParse(body)` koşar.
- `payload()` içinde `organization` yok, bu yüzden zod `organization: required` verir.
- `toFieldErrors` yalnız `FIELD_ORDER` içindeki alanları tutar ve `organization` bu listede yok. Hata atılır, sonuç `{}` olur.
- `showErrors({})` ile hiçbir alanda hata görünmez, odak hiçbir yere gitmez ve fetch çağrılmaz.
- tsc bunu yakalamaz: `FIELD_ORDER` `readonly Field[]` olarak tiplenmiş, bütün alanları içermek zorunda değil. Birleşik ağaçta `tsc --noEmit` rc=0 verdi.

**Kanıt:** Birleşik ağaçta deneme testi koşuldu (dev formu + `fillRequired()` + Unvan dolduruldu, sonra submit).
```
FO-25 birleşik: PROBE fetchCalls=0 errorNodes=[] focusMoved=false alerts=["",""] successShown=false
kontrol (aynı ağaç, schema.ts = origin/dev): PROBE fetchCalls=1 errorNodes=[] focusMoved=true alerts=[] successShown=true
```

Birleşik ağaçta dev'in kendi form testi de kırılıyor: `tests/expert-prereg-form.test.tsx`'te 4 test başarısız.
```
× a valid form posts the schema body plus honeypot and locale
× 409 already_registered lands on the e-mail field
× 400 from the server maps each code; an unknown code falls back to "invalid"
× 429 shows the rate-limit message
Test Files  1 failed | 4 passed (5)   Tests  4 failed | 60 passed (64)
```
Bu testlerde `fillRequired()` Unvan'ı doldurmadığı için ilk takılma görünür `title: required` hatası oluyor. Unvan doldurulsa bile `organization` yüzünden yukarıdaki sessiz takılmaya düşülüyor. CI ödeme sorunu yüzünden koşmadığı için bunu dev'e girmeden yakalayacak bir kapı şu an yok.

**be-fb raporundaki Risk §1 yanlış:** Rapor "form 400 alır" diyor. Gerçekte istek hiç sunucuya gitmiyor; takılma istemcide oluyor ve sessiz.

**Önerilen düzeltme / merge sırası:**
1. Faz 1 ve Faz 2 aynı PR'da gitmeli. fe-fb, Faz 2'yi bu dalın üstüne commit'ler; ya da be-fb dalı fe-fb'nin FO-25 dalına alınır. Ortaya tek bir PR dev'e çıkar.
   - Önce FE girerse olmaz: FE yeni şemaya ihtiyaç duyar.
   - Önce BE girerse yukarıdaki kırılma olur.
2. Faz 2'de ek olarak (FE önerisi) iki yol var:
   - `FIELD_ORDER`'ı tüm alanları içermeye zorla: `satisfies` ile ya da `Record<Field, true>` sözlüğünden türeterek. Böylece şemaya alan eklenince tsc kırılır.
   - Ya da `safeParse` başarısız olup eşlenmiş alan hatası boş kaldığında `form.error_server` benzeri genel bir hata göster.
   - Bu yapılmazsa aynı sessiz takılma, şemaya eklenecek bir sonraki zorunlu alanda tekrar olur.

### B-2 — BLOKE (ürün onayı): "Kurum" ayrı kolon mu, mevcut "Unvan / Kurum" alanı mı?

Mevcut durum:
- Dev'deki UI'da `title` alanının etiketi `"Unvan / Kurum"` (`messages/tr.json:3035`).
- İngilizcesi `"Title / Organisation"`, placeholder'ı `"örn. Proje Koordinatörü, Ankara Üniversitesi"`. Yani tek alan hem unvanı hem kurumu topluyor.
- K-516717'nin sorusu ve seçenekleri de "Unvan/Kurum"u tek alan olarak yazıyor.

be-fb ayrı bir `organization` kolonu ekledi; raporunda bunu "benim seçimim" diye açıkça belirtti. Bunun bedeli:
- yeni bir migration,
- FE'de yeni bir input ve etiket ayrımı ("Unvan" ve "Kurum"),
- geri almanın veri kaybettirmesi (down migration kolonu siler).

Karar kaydı da çelişkili. `karar_oku K-516717` sonucu: **"Cevap: B — Şemayı koru … (varsayilan·otopilot·17.10 02:25)"**. leed-fb'nin anladım notu ise "A uygulanıyor (patron sohbette seçti)" diyor. A'nın seçildiği kayıtta değil, yalnız nottan anlaşılıyor.

İki yol:
- **(i) Tek alan:** `title` zorunlu olur, `organization` kolonu, migration'ı ve CSV sorusu düşer. FE yalnız yıldızı ve diller bloğunu değiştirir. En küçük değişiklik bu.
- **(ii) İki alan:** Bu commit olduğu gibi kalır. FE "Unvan / Kurum" etiketini "Unvan" diye değiştirir ve "Kurum" input'unu ekler.

Öneri: önce leed-fb ya da patron A'yı ve tek/iki alan ayrımını teyit etsin; push ondan sonra yapılsın. Ben (i)'yi öneriyorum, çünkü kararın metni ve mevcut UI tek alanı anlatıyor. Ayrı bir kurum alanı eşleştirme için gerçekten isteniyorsa (ii) de doğru, kod tarafında bir eksik yok.

### M-1 — Öneri: be-fb raporu bu commit'i anlatmıyor

`docs/agent-results/TASK-MVBLMIJW293GW-be-fb.md` (çalışma alanı kökünde) eski bilgilerle duruyor:
- commit `1600b475`, taban FO-23 `7104b949`, "PR açılmadı / FO-23 push kararına bağlı".
- Oysa dal artık `27a58e78` ve tabanı dev'e girmiş olan FO-23 (#78).
- Risk §1 de yukarıda anlatıldığı gibi yanlış.

PR açılmadan önce rapor güncellenmeli.

### M-2 — Öneri: admin CSV'de `organization` yok

Bu bir tutarlılık sorusu, kusur değil. `EXPERT_PREREG_CSV_HEADER`'da (`server/admin.ts`) `title`, `languages`, `orcid` de yok; CSV en baştan kısa tutulmuş. Kurum eşleştirme için toplanıyorsa admin onu görmeli. (ii) seçilirse `ROW_SELECT` + CSV'ye `unvan`/`kurum` eklemek ayrı küçük bir kart olabilir. NULL'a dayanıklılık: `csvCell(null)` boş hücre yazıyor (`csv.test.ts` "writes … null as an empty cell"), yani eski satırlar sorun çıkarmaz.

### M-3 — Bilgi: yeniden kayıt yolu (FO-23) ve crw2 MINOR-A

`register.ts`'te `fields` nesnesine `organization` eklendi. Hem yeni satır (`create`) hem bekleyen satırın yeniden kaydı (`update … data: fields`) kurumu yazıyor ve güncelliyor; bu doğru.

Posta gönderilemezse durum şöyle:
- Yeni satır siliniyor.
- Yeniden kayıtta yalnız `verifyTokenHash`/`verifyTokenExpiresAt` geri alınıyor. `organization`, diğer form alanları, rıza damgaları, `createdAt` ve `ipHash` yeni denemede kalıyor.

Bu, MINOR-A'daki mevcut davranış. `organization` yeni bir sorun getirmiyor, yalnız aynı davranışı devralıyor. Bu commit'te düzeltme gerekmiyor.

### Doğru bulunanlar (bulgu yok)

- **schema.ts:**
  - `optionalSlugList` → `.default([])`. Eksik ya da boş dizi `[]` oluyor, listede olmayan değer `unknown_slug`, null `invalid` veriyor.
  - `requiredText`: `.trim().min(1,'required').min(2,'too_short')`. zod iki issue birden üretse de `fieldErrors` ilkini aldığı için boşta `required` dönüyor, testte de doğrulanıyor.
  - Eksik alan ya da `null` için `z.string({error:'required'})` çalışıyor.
  - Yeni hata kodu yok; mevcut kodlar `EXPERT_PREREG_ERROR_CODES` ve i18n `errors.*` içinde var.
- **Migration:**
  - `ADD COLUMN IF NOT EXISTS "organization" TEXT` additive ve idempotent; `apply-migrations.sh`'in her koşuda hepsini uygulamasıyla uyumlu.
  - Backfill yok, eski satırlar NULL kalıyor.
  - `.down.sql`, `migration-down-guard` başlığını taşıyor (`add-expert-pre-registration.down.sql` ile aynı desen) ve `DROP COLUMN IF EXISTS` kullanıyor.
  - `apply-order.txt`'te `add-expert-pre-registration.sql` 58. satırda, bu migration 69. satırda; yani sonra geliyor.
  - DATA_MODEL §22 alan listesi güncel.
  - Prisma'da `organization String?`; `title` kolonu nullable kalıyor, bu doğru.
- **dev ile çakışma:** `git merge-tree --write-tree origin/dev 27a58e78` → `88af620c…`, rc=0, çakışma yok.

## Kanıt (ham çıktı)

```
$ git -C <wt> log --oneline -2
27a58e78 feat(expert-prereg): languages optional, title and organisation required (FO-25)
77a6f9e0 fix(expert-prereg): re-issue pending link, AUTH_SECRET IP key, seats from max (FO-23)
$ git merge-tree --write-tree origin/dev HEAD ; echo rc=$?
88af620cdec214c63ff52bc23e1a517d54d23817
rc=0

# birleşik ağaç (dev + 27a58e78), fo25 worktree'nin node_modules'u (prisma client organization içeriyor)
$ tsc --noEmit ; echo tsc_rc=$?
tsc_rc=0
$ vitest run src/lib/expert-prereg tests/expert-prereg-form.test.tsx
 ✓ schema.test.ts (17)  — FO-25'in 3 yeni testi dahil
 ✓ register.test.ts (17) · verify.test.ts (11) · csv.test.ts
 × expert-prereg-form.test.tsx — 4 failed (yukarıda)
 Test Files  1 failed | 4 passed (5)
      Tests  4 failed | 60 passed (64)
```

- Sessiz takılmanın deneme testi B-1'de; kaynağı `scratchpad/probe-fo25.test.tsx`, repoya girmedi.
- DB testleri (`*.live.test.ts`) koşulmadı. `.env` yok, görev metnine göre bulgu sayılmaz. be-fb'nin scratch DB kanıtları (2× koşma, down, curl 201/400) raporunda duruyor; ben tekrar etmedim.

## Değişen dosyalar

Yalnız bu rapor (ve kanıt yolu kopyası). İncelenen worktree'ye dokunulmadı: `git status` temiz, HEAD `27a58e78`.

## Riskler

- CI koşmadığı için B-1 gibi bir kırılmayı dev'e girmeden yakalayacak otomatik bir kapı yok. Merge'ü yapanın elle `vitest run tests/expert-prereg-form.test.tsx` koşması gerekir.
- (ii) seçilirse down migration veri kaybettirir; geri alma kodla aynı deploy'da yapılmalı (`.down.sql` başlığında yazıyor).

## Açık sorular

1. K-516717 hangisi: kayıttaki B mi, leed-fb notundaki A mı? Kaydın düzeltilmesi gerekiyor.
2. A ise "Unvan/Kurum" tek alan mı (i), ayrı iki alan mı (ii)?

## Sonraki adım

- leed-fb: K-516717'nin kaydını ve tek/iki alan sorusunu netleştirsin.
- Sonra be-fb ve fe-fb tek bir PR hazırlasın (Faz 1 + Faz 2, form testleri güncel). İçinde `FIELD_ORDER` tamlık korumasına dair öneri de olsun.
- Ben o PR'ı birleşik ağaçta form testi ve deneme testiyle yeniden incelerim.

## Platform beyanı

- **mac (darwin):** doğrulandı; tsc, vitest ve deneme testi bu makinede koşuldu.
- **Linux / Windows:** koşulamadı, CI bu yüzden de duruyor. Değişen kod platforma bağlı değil: zod şeması, SQL, Prisma alanı. Bulunan kırılma (B-1) tarayıcıda koşan saf JS mantığı, her platformda aynı davranır.
