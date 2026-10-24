# TASK-MVBIYE9O6JCQ7 (FO-20#review) — PR #76 inceleme (crw2-fb)

**PR:** https://github.com/yaslan/fonbridge/pull/76 · base `dev` · head `fe-fb/uzman-on-kayit` @ `36ddf084` (OPEN, merge edilmedi, approve verilmedi)
**İncelenen:** 24 dosya, +2448/−1 (`git diff --stat origin/dev...HEAD`), fe-fb raporları `TASK-MVBIYE9O6JCQ7-fe-fb.md` ve `-fe-fb-2.md`.

## Hüküm

**Değişiklik iste: 1 major, blocker yok.** Major bulgu M1. İl combobox'ında alana odaklanmak, kullanıcı ok tuşuna basmadan "Adana"yı aktif seçenek yapıyor. Bu durumda Enter, önceden seçilmiş ili sessizce Adana'yla değiştiriyor. Bunu bir probe testiyle yeniden ürettim. Düzeltme küçük ve tek dosyada. Gerisi minor ya da öneri. Kapsamdaki güvenlik maddelerinde açık bulamadım.

**Merge sırası notu:** Kurum alanı ile Diller/Unvan zorunluluğu FO-25'te değişecek. Form şu an `organization` göndermiyor. Bu bilinen ve kapsam dışı bir konu, bulgu olarak yazmadım. Önerim: PR #76 önce merge edilsin, FO-25 onun üstüne rebase edilsin. Ters sırada FO-25'in şema değişikliği bu formu kırar, çünkü ortak zod şeması istemcide de koşuyor.

## Bulgular (önem sırasıyla)

### M1 — MAJOR · İl combobox'ı: odakta ilk seçenek aktif oluyor, Enter seçili ili Adana'yla değiştiriyor
- **Yer:** `src/components/expert-prereg/ProvinceCombobox.tsx`
  - `:31`: `useState(0)`
  - `:121`: `onFocus={() => setOpen(true)}` aktif indeksi sıfırlamıyor
  - `:84-90`: Enter dalı `open && matches[active]` ise seçim yapıyor
  - `:97`: `activeOption = open ? matches[active]` → odak anında `aria-activedescendant` dolu
- **Senaryo:**
  1. Kullanıcı ili "İzmir" seçer.
  2. Sonra Shift+Tab ile ya da tıklayarak alana geri döner. Liste açılır; sorgu seçili adla aynı olduğu için `matches = PROVINCES` olur ve `active` değeri 0 kalır.
  3. Enter'a basar. Seçim **Adana (01)** olur ve `onChange('01')` çağrılır. Enter `preventDefault` ile yutulduğu için form da gönderilmez.
  4. Boş alana odaklanıp Enter'a basmak da aynı şekilde Adana'yı seçer.
- Ekran okuyucu, kullanıcı hiçbir ok tuşuna basmadan odak anında "Adana"yı aktif seçenek olarak okur. Bu ARIA APG combobox desenine aykırıdır: liste açılınca ok tuşuna basılana kadar aktif seçenek olmamalı.
- **Kanıt** (`tests/` altına geçici probe yazdım, koşup sildim; kopyası `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/c6d73a08-8a4f-49a9-866f-c2fd07b6e1c7/scratchpad/zz-crw2-probe.test.tsx`):
  ```
  PROBE A activedescendant on focus: _r_0_-01
  PROBE A value after Enter: Adana ["01"]
  PROBE B picked: İzmir
  PROBE B after refocus+Enter: Adana ["35","01"]
  ```
- **Neden testler yakalamıyor:** Mevcut test (`tests/expert-prereg-form.test.tsx`, "province combobox") her zaman önce yazıp sonra ArrowDown'a basıyor. "Odak + Enter" ve "seçili değerle yeniden odak" yollarını hiç denemiyor.
- **Öneri:**
  - `active` için "yok" durumu ekle (`-1`).
  - `onFocus`, `onClick` ve liste açılışında `active` değerini seçili değerin indeksi yap, seçim yoksa `-1` yap.
  - `onChange` (yazma) sırasında `-1` yap. Yazarken ilk eşleşmeyi otomatik aktif yapmak istenirse bu ancak `query !== ''` iken olmalı.
  - Enter yalnız `active >= 0` iken seçim yapsın.
  - `aria-activedescendant` yalnız `active >= 0` iken verilsin.
  - Regresyon testi: İzmir seç → blur → focus → Enter → değer hâlâ İzmir. Boş alana focus + Enter → değer boş kalır.
- **Ek (minor, aynı düzeltmeye bağlanabilir):** `:155`'teki `aria-selected={p.value === value}`, aktif seçeneği değil kaydedilmiş değeri işaretliyor. APG'nin tek seçimli listbox-in-combobox deseninde `aria-selected="true"` aktif (vurgulu) seçenekte olur. Şu an ok tuşuyla gezinirken ekran okuyucu her satırı "seçili değil" diye okuyor.

### m1 — MINOR · Doğrulandı sayfası `?n=` değerine koşulsuz güveniyor, yorum ile davranış uyuşmuyor
- **Yer:** `src/components/expert-prereg/ExpertVerifiedPage.tsx:21-23` (yorum: "it never claims a verification the redirect did not make") ve `:29-30`.
- **Senaryo:** Herkes `/tr/uzman/dogrulandi?n=1` adresini açıp "E-postanız doğrulandı · Kurucu Uzman numaranız: #1" ekranını görebilir. Bu ekranın görüntüsü sahte "Kurucu Uzman" kanıtı olarak dolaşabilir. `noindex` arama motorunu engeller, sosyal mühendisliği engellemez.
- **Öneri:** Sözleşme FO-19'un, bu yüzden kodda geçici çözüm yazılmamalı. BE'ye not: yönlendirmeye kısa ömürlü imzalı bir parametre konabilir, ya da sayfa numarayı sunucudan okuyabilir. FE'de en azından yorumu davranışa uygun hale getirmek gerekiyor: sayfa yalnız sorgu parametresini gösteriyor, kendisi doğrulama yapmıyor.

### m2 — MINOR · "100" ve "24 saat" iki yerde sabit yazılı, BE sabitiyle bağlı değil
- **Yer:**
  - `messages/{tr,en}.json` → `ExpertPrereg.hero.founder_open` ve `founder_unknown` ("İlk 100 kayıt…")
  - `success.verify` ("24 saat")
  - `src/components/expert-prereg/paths.ts:17-19`: `n <= 100`
- **Senaryo:** `FOUNDER_SEAT_LIMIT` değeri `src/lib/expert-prereg/server/constants.ts:15` içinde. Yorumu "form metni ve testler aynı sayıyı okusun diye tek yer" diyor. Limit 150'ye çıkarsa şerit hâlâ "İlk 100" der. Doğrulama yönlendirmesi `?n=101` ile gelirse sayfa "Kurucu numarası yok" metnini gösterir, yani yanlış bilgi verir. TTL için de aynı durum geçerli (`VERIFY_TOKEN_TTL_MS`).
- Kural 7 açısından kalan koltuk sayısı gerçek veriden geliyor; hata durumunda `null` olur ve sayı uydurulmaz (`ExpertPreregPage.tsx:49-54`). Sorun yalnız limit sabitinin kopyalanmasında.
- **Öneri:** `ExpertPreregPage` bir sunucu bileşeni. ICU'ya `{limit}` olarak `FOUNDER_SEAT_LIMIT` verilebilir. `parseFounderNumber(raw, limit)` biçimine geçilebilir; doğrulandı sayfası da sunucu bileşeni olduğu için sabiti import edebilir.

### m3 — MINOR · Ölü kod: `expertPreregVerifiedPath`
- **Yer:** `src/components/expert-prereg/paths.ts:11-13`.
- **Kanıt:** `grep -rn expertPreregVerifiedPath src tests` yalnız tanımı buluyor. BE'deki `verifiedRedirectPath` (`constants.ts`) aynı yolları ikinci kez tanımlıyor; ikisi zamanla ayrışabilir.
- **Öneri:** Sil.

### m4 — MINOR (süreç) · DoD'nin uçtan uca akışı varsayılan kapıda koşmuyor
- **Yer:** `tests/e2e/expert-prereg.spec.ts:132`: `test.skip(!MAILPIT, …)`.
- **Senaryo:** Kayıt → doğrulama → Kurucu numarası → admin satırı → CSV akışı yalnız `E2E_MAILPIT_URL` tanımlıyken koşuyor. `pnpm gate` bu testi atlıyor (fe-fb-2 raporu: "mailpit adımı atlandı"). fe-fb bu akışı bir kez elle koşmuş ve yeşil almış (5 passed). Yine de akış kapı tarafından korunmuyor; regresyon sessizce geçebilir.
- Ayrıca ilk push `--no-verify` ile yapılmış. Kalan kırmızılar FO-20 dışı (sabit `localhost:3000` kullanan `theme-*` testleri ve SMTP'siz `team-members-ui`). Bu kırmızıları ben yeniden koşmadım.
- **Öneri:** CI'da mailpit servisi açılsın, ya da test mailer çıktısı dosyaya yazılsın; böylece bu spec opt-in olmaktan çıkar. Ayrı kart açılabilir.

### Öneriler (kusur değil)
- **LinkedIn paylaşım ucu:** `ExpertPreregForm.tsx:202` `https://www.linkedin.com/feed/?shareActive=true&text=` kullanıyor. Kaçış doğru: `encodeURIComponent` var ve `pageUrl` sunucudaki `appUrl()`'den geliyor, kullanıcı girdisi değil. Ancak bu uç LinkedIn'in belgelenmiş bir ucu değil; belgelenmiş olan `sharing/share-offsite/?url=` (metni almaz). LinkedIn davranışı değiştirirse buton boş akışa düşer. Bilerek seçildiyse sorun yok.
- **Combobox'ta yarım metin:** "ist" yazıp alandan çıkınca metin alanda kalıyor ama il seçilmemiş oluyor (probe C: `value shown: ist chosen: []`). Gönderimde "Listeden bir seçenek seçin." hatası doğru şekilde çıkıyor, yani veri kaybı yok. İstenirse blur'da tek eşleşme varsa o seçilebilir, ya da metin seçili değere geri döndürülebilir.

## Doğrulanan ve sorunsuz bulunanlar (odak maddeleri)

| Odak | Sonuç | Kanıt |
|---|---|---|
| Hata `aria-describedby` | ✅ Metin alanı, combobox, onay kutuları ve fieldset'te hata ve ipucu id'leri bağlı; `aria-invalid` var | `ExpertPreregForm.tsx` `describedBy()`, `ChoiceGroup.tsx` fieldset; unit test "empty submit" |
| Odak yönetimi | ✅ İlk hatalı alana odak gidiyor (sunucunun 409/400 cevabında da); başarıda başlığa `tabIndex=-1` ile odak | testler "409 already_registered", "empty submit" |
| `<dialog>` | ✅ Native `showModal` (odak tuzağı, Esc, inert), `aria-labelledby`; kapat formu ana formun DIŞINDA, iç içe form yok; buton label içinde ama kutuyu işaretlemiyor | `KvkkDialog.tsx`; test "KVKK link … does not tick" + e2e #2 |
| Honeypot | ✅ `aria-hidden` kapsayıcı + `tabIndex=-1` + ekran dışı; sunucu dolu `website` için aynı 201'i dönüp yazmıyor | `register.ts:80`; `register.test.ts:82` |
| Admin yetkisi | ✅ Layout `isPlatformAdminSession` değilse 404; sayfa ayrıca `requirePlatformAdmin()` → `notFound()`; e2e #4 404 | `admin/uzman-kayitlari/page.tsx:49-54`, `tenant.ts:297` |
| Admin filtre/CSV | ✅ Filtreler `expertPreRegFilterSchema` ile doğrulanıyor, bilinmeyen değer düşürülüyor; CSV linki yalnız doğrulanmış filtreleri taşıyor; BE CSV formül enjeksiyonunu kaçışlıyor (`csv.ts:10`) | — |
| UTM/locale gövdeye | ✅ UTM'ler istemcide 100 karaktere kırpılıyor; hem istemci hem sunucu zod'u `optionalText(100)` uyguluyor; `locale` prop'u `'tr' \| 'en'` literal, şemada `z.enum` | `ExpertPreregForm.tsx:117-123`, `schema.ts` |
| `kvkk-text.ts` HTML enjeksiyonu | ✅ Ayrıştırıcı yalnız düz metin blokları üretiyor, React metin düğümü olarak basılıyor; diff'te `dangerouslySetInnerHTML`/`innerHTML` yok; kaynak repo içi dosya | `git diff … \| grep` boş |
| i18n (kural 8) | ✅ `pnpm i18n:check` yeşil (sabit metin tabanı 299/299, büyüme yok); 11 hata kodunun hepsi iki dilde de var | aşağıda |
| `process.env` | ✅ `src/` diff'inde yok. Yalnız e2e spec'te `process.env.E2E_MAILPIT_URL` (88 spec'ten 36'sı aynı deseni kullanıyor; kural `src/` için) | — |
| Kural 7 (koltuk) | ✅ `getRemainingFounderSeats()` her istekte okunuyor; hata → `founder_unknown`, sayı uydurulmuyor (sabit limit için bkz. m2) | `ExpertPreregPage.tsx:49-54` |
| Testler davranışı doğruluyor mu | Kısmen: onaylar, alan bazlı hatalar, sunucu kodu eşleme, odak, honeypot ve dialog gerçekten doğrulanıyor. Combobox'ta "odak/yeniden odak + Enter" yolu yok (M1); uçtan uca akış opt-in (m4) | — |

## Kanıt (ham çıktı)

Worktree: `.claude/worktrees/fo20-uzman-fe`, `fe-fb/uzman-on-kayit` @ `36ddf084`, temiz ağaç.

```
$ pnpm vitest run tests/expert-prereg-form.test.tsx
 Test Files  1 passed (1)
      Tests  12 passed (12)
   Duration  9.68s

$ pnpm typecheck
$ tsc --noEmit
TC_EXIT=0

$ pnpm i18n:check
  Literals found:   299 in 34 file(s)
  Baseline allows:  299 in 34 file(s)
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.

$ pnpm exec eslint src/components/expert-prereg "src/app/[locale]/admin/uzman-kayitlari" src/components/AdminSidebarNav.tsx src/components/PublicFooter.tsx tests/expert-prereg-form.test.tsx tests/e2e/expert-prereg.spec.ts
(çıktı yok — temiz)

$ pnpm vitest run tests/zz-crw2-probe.test.tsx   # geçici probe, koşudan sonra silindi
PROBE A activedescendant on focus: _r_0_-01
PROBE A value after Enter: Adana ["01"]
PROBE B picked: İzmir
PROBE B after refocus+Enter: Adana ["35","01"]
PROBE C value shown: ist chosen: []

$ gh pr view 76 --json state,headRefOid
{"headRefOid":"36ddf0847b860781994e6cec350806968a936b49","state":"OPEN"}
```

e2e ve Lighthouse'u ben koşmadım; görev yalnız vitest ve typecheck istiyordu. Sonuçları fe-fb raporlarından okudum.

## Değişen dosyalar
- Yalnız bu rapor: `docs/agent-results/TASK-MVBIYE9O6JCQ7-crw2-fb.md`. PR dalına ve worktree'ye dokunulmadı; probe testi oluşturulup silindi, worktree `git status` temiz.

## Riskler
- M1 düzeltilmeden merge edilirse klavyeyle formu dolduran kullanıcı ilini fark etmeden Adana olarak kaydedebilir. Admin il filtresi ve rehberdeki il verisi bu yüzden kirlenir.
- FO-25 bu PR'dan önce merge edilirse ortak şema değişikliği formu kırar (bkz. merge sırası notu).

## Açık sorular
- **Rapor yolu çelişkisi:** Wrapper `/Users/macbook/alan/docs/agent-results/TASK-MVBIYE9O6JCQ7-fe-fb-3.md` yolunu verdi. Bu yol repo dışında ve incelenen ajanın (fe-fb) rapor adını taşıyor. Kart gövdesindeki `docs/agent-results/TASK-MVBIYE9O6JCQ7-crw2-fb.md` yoluna yazdım (FONBRIDGE reposu, önceki crw2-fb incelemeleriyle aynı yer).
- m1 için BE (FO-19) imzalı parametreyi ister mi, yoksa bu risk kabul mü? Karar ürüne ait.

## Sonraki adım
- fe-fb: M1'i düzeltsin ve regresyon testini eklesin; m2 ve m3 isteğe bağlı. Sonra kısa bir yeniden inceleme yeterli (yalnız `ProvinceCombobox.tsx` ve test).
- m1 için BE'ye, m4 için CI'ya not.

**Platform beyanı:** mac (Darwin 27) üzerinde vitest/jsdom ve `tsc` koşuldu. Gerçek tarayıcı koşusu yapmadım. M1 klavye olay mantığından kaynaklanıyor (React state), tarayıcıya ve işletim sistemine bağlı değil; Windows, Linux, Safari ve Firefox'ta da aynı davranışı bekliyorum. Bu platformlar koşulmadı, çünkü bu inceleme kapsamında yalnız unit ve typecheck istendi. `<dialog>` odak geri dönüşü ve `showModal` güncel Chromium, Firefox ve Safari'de destekleniyor (fe-fb mac Chrome'da doğrulamış).
