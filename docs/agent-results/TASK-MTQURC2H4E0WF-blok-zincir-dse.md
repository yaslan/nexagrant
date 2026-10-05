# TASK-MTQURC2H4E0WF — M9 brief üretimi sessizce başarısız oluyordu

**Ajan:** blok-zincir-dse (Ürün Tasarımcısı) · **Sprint:** S10 · **Tip:** bug (P0) · **Branch:** dev

---

## 1. Ne yapıldı

`briefs/client.tsx` içindeki `handleGenerateBrief`, düğmeye basıldıktan sonra **hiçbir**
başarısızlığı kullanıcıya söylemiyordu:

| Yol | Eski davranış | Yeni davranış |
|---|---|---|
| Server action **fırlatıyor** (bağlantı kopması, yetki, beklenmeyen hata) | `catch { console.error(...) }` — ekranda hiçbir şey | `role="alert"` hata bandı + "Yeniden dene" |
| Action döndü ama **`res.brief` boş** (`{success:false, brief:null, error:'BRIEF_NOT_PERSISTED'}`) | `if (res.brief)` — `else` yok, sessiz | Ayrı, farklı bir mesajla aynı bant |
| "Yeniden dene"ye ortak adı boşaltılmış hâlde basılırsa | (yeni yüzey, sessiz dönebilirdi) | Sebebi söyleyen mesaj, istek gönderilmiyor |

### Tasarım kararları ve gerekçeleri

1. **Bant, basılan düğmenin hemen üstünde** — sayfa başında değil.
   *Kullanıcı ihtiyacı:* hata, onu doğuran kontrolün yanında olmalı; sayfayı aşağı
   kaydırmış bir kullanıcı en üstteki bandı hiç görmez. Aynı formdaki
   `scheduleError` de bu kuralı izliyor.
2. **Yeni görsel dil YOK — mevcut bant yeniden kullanıldı.** `icsError` bandının
   satır içi işaretlemesi `AlertBanner` bileşenine çıkarıldı; iki bant artık
   *aynı* token'ları, aynı `role="alert"` sözleşmesini ve aynı kapatma
   davranışını paylaşıyor. Kopyala-yapıştır ikinci bir bant üretilmedi.
   Token'lar aynen korundu: `rounded-xl border-rose-300 bg-rose-50 text-sm text-rose-800`.
3. **İki farklı mesaj, tek bant.** "Oluşturulamadı" ile "oluşturuldu ama
   kaydedilemedi" kullanıcı için farklı iki durum: ikincisinde YZ kredisi
   harcanmış olabilir. Tek jenerik mesaj bu ayrımı gizlerdi.
4. **Ham hata gövdesi ekranda yok.** Stack trace / HTTP kodu / `BRIEF_NOT_PERSISTED`
   yalnız `console.error`'a gidiyor; ekranda sade, eylem önerili cümle var.
   (e2e testi `Error`, `net::`, `500`, `403`, `TypeError`, `fetch` sızıntılarını
   bandın metninde arayıp reddediyor.)
5. **Form verisi korunuyor + tek giriş noktası.** `setPartnerName('')` vb. yalnız
   gerçekten brief döndükten sonra çalışıyor. `attemptGenerateBrief()` hem form
   submit'in hem bandaki "Yeniden dene"nin tek girişi — retry, ilk denemenin
   *tam olarak* aynı doğrulamasını ve isteğini yapıyor.
6. **Erişilebilirlik:**
   - `role="alert"` → bant belirdiği an okunuyor.
   - Submit düğmesine `aria-describedby="m9-generate-error"` → klavyeyle düğmeye
     geri gelen kullanıcı sebebi duyuyor.
   - Bant kapandığında (kapat / başarılı retry) içindeki düğmeler DOM'dan
     kalkıyor ve odak `<body>`'ye düşüyordu → `useEffect` ile odak, düğme
     **tekrar etkinleştikten sonra** kendisine geri veriliyor (WCAG 2.4.3).
     İlk denemede odağı çalmıyor.
   - Bant içindeki düğmelere `min-h-6` (24px hedef, WCAG 2.2 SC 2.5.8) —
     etiket metni tek başına 16px.
   - Kontrast: `rose-900`/`rose-800` üzeri `rose-100`/`rose-50` → AA üstü.
   - Retry düğmesi bandın kendi rose skalasında (`bg-rose-100`), çıplak `white`
     değil — bant temaya göre değişmeyen sabit bir yüzey olduğu için.
7. **Duyarlılık:** 390px'de bant sarıp okunuyor, yatay kaydırma yok (e2e ölçtü).
8. **i18n:** dokunduğum satırlarda sabit metin yok. Yeni `m9` ad alanı **hem
   tr hem en**'e eklendi (`m9.alerts.dismiss`, `m9.generate.{failed,notSaved,partnerRequired,retry}`).
   `icsError`'ın kendi Türkçe metnine dokunmadım — o TASK-MTQV24NDR0ANX'in işi;
   yalnız bandın "Kapat" etiketi artık `t()`'den geliyor.

---

## 2. Kanıt

### 2.1 Gerçek tarayıcı, gerçek tıklama (Playwright, `pnpm dev` :3000)

```
$ npx playwright test tests/e2e/m9-brief-generate-failure.spec.ts --reporter=list
Running 3 tests using 1 worker

  ✓  1 … › a dropped request surfaces in the band, keeps the form, and retries (3.3s)
  ✓  2 … › an action that comes back with no brief is reported, not ignored (2.4s)
  ✓  3 … › the happy path still ends with a brief and no band (2.2s)

  3 passed (9.0s)
```

Gerçek e-postayla giriş (`owner@demo.fabrika.test`), gerçek sayfa, gerçek yazma
ve tıklama. Bileşen stub'lanmadı; yalnız **taşıma katmanı** kırıldı — kopan
bağlantı ve başarısız DB yazımı tarayıcıdan tam olarak böyle görünür.

`src/modules/m9/server/actions.ts`'e **dokunmadım** (o dosya şu an
customer-support'un TASK-MTQUS5JH4DXJM işiyle dirty). Başarısızlıklar şöyle
üretildi:
- **Fırlatan action:** `page.route(...).abort('failed')` → gerçek ağ hatası, kod değişikliği yok.
- **Boş brief:** action POST'u, action'ın gerçekten döndürdüğü değerle
  (`{success:false, brief:null, error:'BRIEF_NOT_PERSISTED'}`) RSC flight
  gövdesi olarak `route.fulfill` edildi.

### 2.2 Ekran görüntüleri — `docs/agent-results/TASK-MTQURC2H4E0WF-screenshots/`

| Dosya | Ne gösteriyor |
|---|---|
| `01-form-filled.png` | Doldurulmuş form + Brüksel saati önizlemesi (basmadan önce) |
| `02-generate-failed-band.png` | **İstek koptu:** bant çıktı; "Fraunhofer Institute / 10-24-2026 / 02:00 PM" **hâlâ formda**; "Yeniden dene" + "Kapat" |
| `03-retry-succeeded.png` | Bandaki "Yeniden dene" → brief oluştu (24.10.2026 13:00 Brüksel korunmuş), bant yok, form temizlendi, odak submit düğmesinde |
| `04-empty-brief-band.png` | **Boş brief:** farklı mesaj ("hazırlandı ama kaydedilemedi"), ad korunmuş, `BRIEF_NOT_PERSISTED` ekranda yok |
| `05-band-mobile.png` | 390×844: bant sarıyor, okunur, yatay kaydırma yok |
| `06-happy-path.png` | Mutlu yol bozulmadı: brief oluşuyor, bant yok, form temizleniyor |

### 2.3 Birim testler (yeni 5 senaryo dahil)

```
$ npx vitest run tests/m9-briefs-form-errors.test.tsx
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

Eskiden 7 test vardı; 5'i bu kart için eklendi (fırlatan action, boş brief,
form korunması + banttan retry, ad boşaltılmış retry, kapatılabilirlik).
Testler mesajları **gerçek `messages/tr.json`'dan** okuyor — kaybolan bir
anahtar boş bir bant olarak sahaya çıkmak yerine burada kırmızıya düşer.

### 2.4 Kapılar

```
$ pnpm typecheck
$ tsc --noEmit
(çıkış 0, hata yok)

$ pnpm lint
✖ 201 problems (0 errors, 201 warnings)
```

Lint kapısı **0 hata** (girişte de 0 hataydı — kırmızıya çevirmedim).
Benim dosyalarımda yeni uyarı yok; `briefs/client.tsx`'teki tek uyarı
(`opportunityId` kullanılmıyor) bu karttan önce de vardı.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/client.tsx` | `AlertBanner` çıkarıldı (ics bandı ondan besleniyor); `generateError` durumu; `attemptGenerateBrief()` tek giriş noktası; boş-brief dalı raporlanıyor; odak geri verme efekti; `useTranslations('m9')` |
| `messages/tr.json`, `messages/en.json` | Yeni `m9` ad alanı (4 + 1 anahtar), iki dilde |
| `tests/m9-briefs-form-errors.test.tsx` | `NextIntlClientProvider` sarmalayıcı (bileşen artık `t()` kullanıyor) + bu kart için 5 yeni test |
| `tests/e2e/m9-brief-generate-failure.spec.ts` | **YENİ** — gerçek tarayıcı, 3 senaryo, 6 ekran görüntüsü |

**Dokunulmayanlar:** `briefs/page.tsx` (customer-support), `src/modules/m9/server/actions.ts`
(customer-support, şu an dirty), diğer ajanların dosyaları.

---

## 4. Riskler

1. **`messages/*.json` paylaşılan dosya — m9 anahtarlarım başka bir ajanın
   commit'ine karıştı.** Bu iki dosya benim m9 bloğumla *aynı diff hunk'ında*
   başka bir ajanın in-flight `m6` anahtarlarını da taşıyordu. Ben kendi
   commit'imi hazırlarken dosyalar zaten commit edilmişti:
   `6945904 feat(modules): enforce the ModuleState gate on M9 and M6`.
   Anahtarlar **eksiksiz ve iki dilde** orada (doğruladım:
   `git show HEAD:messages/tr.json` → `m9.alerts.dismiss`, `m9.generate.*`;
   `en.json` aynı). **Hiçbir şey silinmedi** — çakışma boyunca
   `git diff messages/ | grep -c '^-[^-]'` → `0`. Tek maliyet: attribution;
   m9 anahtarları modül-kapısı commit'inin içinde görünüyor, benim commit'imde
   değil. Paylaşılan JSON kataloglarına paralel yazan her ajanı ilgilendirir.
   O commit M9 modül kapısını da devreye aldığı için e2e'yi **sonrasında
   yeniden koştum** — 3/3 geçti, briefs sayfası demo owner için hâlâ erişilebilir.
2. **Kapsam dışı dosya:** `tests/m9-briefs-form-errors.test.tsx`. Bileşene
   `useTranslations` eklemek onu provider'sız render eden mevcut testi kırıyordu
   (7/7 → 0/7). Kırık test bırakmak yerine sarmalayıcıyı ekledim. O dosyanın
   i18n kartı (TASK-MTQV24NDR0ANX) şu an `todo`, `in_progress` değil — çakışma
   görmedim, ama ex-en o karta başlarken bunu bilmeli.
3. **`m9` ad alanı yalnız benim 5 anahtarımı içeriyor.** TASK-MTQV24NDR0ANX
   dosyanın kalan ~78 Türkçe string'ini aynı ad alanına eklemeli; yeni bir
   ad alanı açmamalı.
4. **RSC flight gövdesi elle kurgulandı** (`0:{"a":"$@1",…}`) — Next.js sürüm
   yükseltmesinde bu format değişirse 2. e2e testi kırılır. Kırılırsa testin
   yanlış olduğu anlaşılır, ürün değil; gövde o sürümün formatına göre yenilenir.

---

## 5. Açık sorular

1. **Boş-brief durumunda YZ kredisi geri veriliyor mu?** Action, `creditLedger`
   yazımını brief `create`'i ile aynı transaction içinde yapıyor; transaction
   geri alınırsa kredi de geri gelir. Ama LLM çağrısı transaction'ın *dışında*
   ve `AiUsageLog` orada yazılıyor — yani "hazırlandı ama kaydedilemedi"
   durumunda kullanıcı bir çağrının bedelini ödemiş, brief'i almamış olabilir.
   Mesajım kredi hakkında bir şey **iddia etmiyor**; doğrulanması gereken bir
   faturalama sorusu, tasarım sorusu değil. Ayrı kart konusu.
2. **Tarayıcı konsolunda "Maximum update depth exceeded"** görüldü — giriş /
   gezinme sırasında, briefs sayfası yüklenmeden önce, benim değişikliğimden
   bağımsız (eklediğim tek efektin bağımlılıkları `[isGenerating, generateError]`
   ve setState'i bir ref bayrağıyla korunuyor). Bu dalgada başka ajanların
   in-flight kodu olabilir; kime ait olduğunu iddia etmiyorum, kayda geçiyorum.

---

## 6. Sonraki adım

1. **TASK-MTQV24NDR0ANX (ex-en):** dosyanın kalan Türkçe string'lerini `m9` ad
   alanına taşı; `AlertBanner` ve `icsError` metni de o kapsamda.
2. **Faturalama:** yukarıdaki 1. açık soru için kart aç — boş-brief yolunda
   kredi/`AiUsageLog` mutabakatı.
3. `tests/e2e/m9-brief-generate-failure.spec.ts` e2e kapısına dahil edilsin
   (`pnpm test:e2e` `testDir: ./tests/e2e` olduğu için otomatik alıyor).
