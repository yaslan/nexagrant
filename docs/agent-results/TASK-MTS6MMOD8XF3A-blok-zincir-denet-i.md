# TASK-MTS6MMOD8XF3A — 404 sayfasını i18n'e bağla + lint uyarılarını temizle

Ajan: `blok-zincir-denet-i` (QA-EN) · Dal: `dev` · S12 dalga 3

## 0. Kartın iddiası — önce ölçüldü

| İddia | Ölçüm | Sonuç |
|---|---|---|
| `not-found.tsx:11,13,20` gömülü Türkçe sabit | 11 `Sayfa Bulunamadı`, 13 `Aradığınız sayfa…`, 20 `Ana Sayfaya Dön` | **DOĞRU** |
| `not-found.tsx:17` `href="/tr"` | satır 17 `href="/tr"` | **DOĞRU** |
| `pnpm lint` bugün 16 uyarı / 0 hata | `✖ 16 problems (0 errors, 16 warnings)` | **DOĞRU** |

Kartın "kalan 14'ü 0'a indir" hedefi ise **verilen dosya listesiyle ulaşılamaz** — bkz. §4.

## 1. Ne yapıldı

**(a) `src/app/not-found.tsx` i18n + locale-farkındalığı**
- Üç gömülü Türkçe sabit → `NotFound` ad alanında `t('title' | 'description' | 'backHome')`.
- Bileşen `async` server component'e çevrildi; `getTranslations`/`getLocale` (`next-intl/server`) kullanıyor.
  Bu sınır `[locale]` segmentinin ÜSTÜNDE — okunacak route param'ı yok; locale'i `getRequestConfig`
  çözüyor, çözemezse `routing.defaultLocale`'a düşüyor. `NextIntlClientProvider` root layout'ta
  render edilmediği için sunucu tarafı API'si seçildi (client hook değil).
- `href="/tr"` → `href={`/${locale}`}`. Öncesinde İngilizce bir kullanıcı 404'ten **Türkçe** ana sayfaya atılıyordu.
- `messages/tr.json` + `messages/en.json`: `NotFound` ad alanı, iki dilde de, anahtar pariteli.

**(b) Kendi dosyalarımdaki 5 lint uyarısı — susturma/`eslint-disable` EKLENMEDİ**

| Dosya:satır | Uyarı | Düzeltme |
|---|---|---|
| `briefs/client.tsx:119` | `opportunityId` kullanılmıyor | destructuring'den çıkarıldı (prop `generateMeetingBrief`'e gitmiyor; o `interactionId` alıyor, `MeetingBrief`'te `opportunityId` kolonu yok) |
| `documents/client.tsx:19` | `submitDualApprovalAction`, `departmentApproveAction` kullanılmıyor | ölü import kaldırıldı (bkz. BULGU-1 — fonksiyonlar duruyor, UI hiç çağırmıyor) |
| `UserMenu.tsx:29` | `Sparkles` kullanılmıyor | import kaldırıldı |
| `importer.ts:305` | `catch (err)` bağı kullanılmıyor | `catch { … }` (opsiyonel catch binding) |

## 2. Kanıt (hepsi BU koşuda üretildi — 2026-09-08 07:4x)

### 2.1 lint: 16 → 9

Önce:
```
$ pnpm lint
✖ 16 problems (0 errors, 16 warnings)
```
Sonra:
```
$ pnpm lint
/Users/macbook/AgentSpace/fabrika/scripts/test-partners-api.ts
  23:11  warning  'apiKey' is assigned a value but never used
/Users/macbook/AgentSpace/fabrika/src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx
   7:3   warning  'Calendar' is defined but never used
   8:3   warning  'Layers' is defined but never used
   9:3   warning  'ExternalLink' is defined but never used
  13:3   warning  'Clock' is defined but never used
  14:3   warning  'AlertCircle' is defined but never used
  15:3   warning  'Users' is defined but never used
  42:3   warning  'opportunityId' is defined but never used
  69:25  warning  'setWpDeliverable' is assigned a value but never used

✖ 9 problems (0 errors, 9 warnings)
```
**Gerçek bitiş sayısı: 9 uyarı / 0 hata.** Benim 5'im gitti. PartB'nin 2'si de listede yok —
onları eşzamanlı olarak `blockzincir-pm` kapatmış (bana yasaklı dosyaydı, dokunmadım).
Kalan 9'un tamamı bana verilmeyen iki dosyada; §4.

### 2.2 typecheck + unit test

```
$ pnpm typecheck
$ tsc --noEmit          ← çıktı yok = temiz

$ pnpm test
 Test Files  99 passed | 2 skipped (101)
      Tests  1127 passed | 8 skipped (1135)
```

### 2.3 GERÇEK İNTERAKTİF TEST — 404, iki dilde, gerçek tıklamayla

Ad-hoc Playwright (chromium, çalışan dev server'a karşı). Sadece `href` okumadım — **butona tıkladım**
ve inilen URL'yi doğruladım:

```
$ node .nf-adhoc.mjs
[tr] status=404 html.lang=tr h1="Sayfa Bulunamadı" cta="Ana Sayfaya Dön"
[tr] clicked CTA -> landed on /tr
[tr] PASS
[en] status=404 html.lang=en h1="Page Not Found" cta="Back to Home"
[en] clicked CTA -> landed on /en
[en] PASS

ALL PASS
```

Doğrulanan iddialar: HTTP durumu 404 (200 değil) · `<html lang>` locale ile eşleşiyor ·
h1 ve CTA yerelleştirilmiş · **CTA tıklaması `/en` 404'ünden `/en`'e iniyor, `/tr`'ye değil.**

Ham HTTP ile çapraz kontrol:
```
$ curl -s -o tr404.html -w "HTTP %{http_code}\n" http://localhost:3000/tr/bogus-sayfa
HTTP 404
$ curl -s -o en404.html -w "HTTP %{http_code}\n" http://localhost:3000/en/bogus-page
HTTP 404

tr404: <html lang="tr"  → "Sayfa Bulunamadı" / "Ana Sayfaya Dön"
       <a … href="/tr">
en404: <html lang="en"  → "Page Not Found" / "Back to Home"
       <a … href="/en">
```

Ekran görüntüleri (bu koşu): `docs/agent-results/TASK-MTS6MMOD8XF3A-screenshots/`
`01-404-tr.png` · `01-404-en.png` · `02-after-click-tr.png` · `02-after-click-en.png`

> Test koşum notu — kendi harness'ımdaki hata: ilk koşuda `waitForURL(/\/(tr|en)(\/|$)/)`
> regex'i **mevcut** 404 URL'siyle (`/tr/bogus-sayfa`) eşleşiyordu, bu yüzden gezinmeyi hiç
> beklemeden geçti ve "landed on /tr/bogus-sayfa" diye KIRMIZI verdi. Assertion'ı gevşetmedim;
> bekleyiciyi tam yola sıkılaştırdım (`pathname === home`) ve aynı test yeşile döndü.

### 2.4 Regresyon — mevcut 404 e2e paketi

`tests/e2e/notfound-status.spec.ts` 11 workspace rotasında 404 gövdesinde `Sayfa Bulunamadı`
metnini arıyor; benim değişikliğim tam o metni üretiyor:
```
$ pnpm exec playwright test tests/e2e/notfound-status.spec.ts
  ✓  1 … an unknown id under (app) is 404, and the routes that exist stay 200 (8.0s)
  ✓  2 … signed out, the same URLs redirect and never reach notFound() (1.0s)
  2 passed (9.8s)
```

### 2.5 i18n paritesi
```
tr keys: backHome,description,title
en keys: backHome,description,title
PARITY: OK
```

## 3. Regresyon: 4 e2e KIRMIZI — benim değişikliğim DEĞİL (A/B ile kanıtlı)

Dokunduğum dosyaları kapsayan m9/m10 paketlerini koşunca 4 test kırmızıydı. Suçu üstlenmeden önce
**kontrollü A/B** yaptım: iki dosyamı `git show HEAD:` sürümüne geri aldım (paylaşılan ağaçta
`git stash` YOK — başka ajanların işini alırdı), aynı paketleri koştum, sonra kendi sürümümü geri koydum.

```
DEĞİŞİKLİĞİM VARKEN:                        DEĞİŞİKLİĞİM YOKKEN (HEAD baseline):
  4 failed / 6 passed (3.4m)                  4 failed / 2 passed (3.2m)
  m10-audit-identity:54                       m10-audit-identity:54
  m9-brief-generate-failure:54                m9-brief-generate-failure:54
  m9-brief-generate-failure:116               m9-brief-generate-failure:116
  m9-brief-generate-failure:167               m9-brief-generate-failure:167
```
**Aynı 4 test, aynı satırlar, benim değişikliğim olmadan da kırmızı → önceden var olan bir kırık.**

Kök neden (ölçüldü, tahmin değil). Gerçek bir oturumla sayfaları açtım:
```
/tr/main/opportunities/demo-opp-1/documents      → HTTP 200, ana içerik:
  "Bu modül şu anda kullanılamıyor
   Follow-up Documents modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: Ultra."

/tr/fabrika-beta/opportunities/demo-opp-1/briefs → ana içerik:
  "Meeting Briefs modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: Ultra."
```
Yani sayfalar modül kapısını render ediyor; testlerin aradığı workflow başlığı ve form alanı hiç
basılmıyor. `m9/manifest.ts:17` ve `m10/manifest.ts:17` `planTiers`'ı `plansGrantingModule(...)`'dan
alıyor; `c5bc95a` ("retire the EUR plan ladder") M9/M10'u **yalnız Ultra**'ya taşımış ama tohumlanan
demo kiracıları (`main`, `fabrika-beta`) Ultra'ya taşınmamış.

Ayırt edici delil: **kendi fixture kiracısını kuran** m9 paketleri (`m9-briefs-form.spec.ts`,
`m9-brief-persistence.spec.ts` — `M9_WORKSPACE = 'm9-e2e'`) YEŞİL; **tohum verisine binen**
paketler (`fabrika-beta` / `main`) KIRMIZI.

Kapsamım dışı olduğu için düzeltmedim — bildiriyorum.

## 4. Kartın "0'a indir" hedefi verilen dosya listesiyle ULAŞILAMAZ

Kart bana 4 dosya verdi (5 uyarı) ve "PartB'nin 2'si hariç kalanları 0'a indir" dedi. Ama 16
uyarının 9'u bana **verilmeyen** iki dosyada yaşıyor:

- `scripts/test-partners-api.ts:23` — `apiKey` (1 uyarı)
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx` — satır 7, 8, 9, 13, 14, 15, 42, 69 (8 uyarı)

Ortak kural (f) "listenin dışına dokunma, gerekiyorsa dur ve raporunda söyle" diyor; bu yüzden
**dokunmadım**. Bu 9'u kapatmak için ayrı bir kart ya da bu kartın dosya listesinin genişletilmesi gerek.
İkisi de tek satırlık/ölü-import temizliği — ama `application/client.tsx:42`'deki `opportunityId`
benim `briefs/client.tsx:119`'daki ile aynı desen, yani ayrı ajan olursa çakışma riski var.

## 5. Yol üstünde görülen, DÜZELTİLMEYEN başka bulgular (kural b — bildir, dokunma)

**BULGU-1 · Çift onay akışı sahte bir vitrin — `documents/client.tsx:178-213`** (önem: yüksek)
"Çift Onaylı Kurumsal Yetki Akışı (Dual Approval Workflow)" başlıklı banner dört aşamayı
(`1. Taslak Üretimi` → `2. Finans Onayı` → `3. Hukuk Onayı` → `4. İmzalı & Onaylı`) statik,
sabit-renkli kutular olarak çiziyor. **Hiçbir doküman durumuna bağlı değil, hiçbir buton yok,
hiçbir aşama işaretlenmiyor.** Gerçek eylemler `src/modules/m10/server/actions.ts:210`
(`submitDualApprovalAction`) ve `:216` (`departmentApproveAction`) mevcut ve export edilmiş, ama
tüm repoda **tek çağıranı yok** — tek referansları benim kaldırdığım ölü import'tu. Yani kullanıcı,
var olmayan bir yönetişim akışının görselini görüyor. Bu bir yönetişim/uyum yüzeyi olduğu için
kozmetik değil.
Tekrar-üretim: bir Ultra kiracıda `…/opportunities/<id>/documents` aç → banner'ın dört aşaması
her zaman aynı görünür, doküman imzalansa da değişmez.

**BULGU-2 · `documents/client.tsx` baştan sona sabit Türkçe** (önem: orta) — CLAUDE.md kural 8 ihlali.
Örnekler: `:184` "Çift Onaylı Kurumsal Yetki Akışı", `:188` "Finans & Hukuk Çift Onayı",
`:195/:200/:205/:210` "1. Taslak Üretimi"/"2. Finans Onayı"/"3. Hukuk Onayı"/"4. İmzalı & Onaylı",
`:173` "TÜBİTAK Ödül Paketi Üret", `:219` "Yeni İdari / Yasal Doküman Üret (AI Draft Generator)",
`:229` "+ NDA Gizlilik Anlaşması", `:238` "+ LOI Niyet Mektubu". `t('...')` yok, İngilizce karşılık yok.
Kapsamım i18n açısından yalnız `not-found.tsx` olduğu için dokunmadım.

**BULGU-3 · Ölü prop `opportunityId` — `briefs/client.tsx:37` + `briefs/page.tsx:60`** (önem: düşük)
Prop hâlâ arayüzde tanımlı ve `page.tsx:60`'ta geçiriliyor, ama artık kimse tüketmiyor
(`MeetingBrief`'te `opportunityId` kolonu yok — `page.tsx:39` yorumu da bunu söylüyor;
`generateMeetingBrief` `interactionId` alıyor). Arayüzden tamamen silmek `page.tsx`'i düzenlemeyi
gerektirirdi — o dosya listemde değil, bu yüzden yalnız destructuring'i temizledim.

## 6. Değişen dosyalar

```
 src/app/not-found.tsx                                            | 18 +++++++++++-----
 messages/tr.json                                                 |  5 +++++
 messages/en.json                                                 |  5 +++++
 .../[workspace]/opportunities/[id]/briefs/client.tsx             |  1 -
 .../[workspace]/opportunities/[id]/documents/client.tsx          |  2 +-
 src/components/UserMenu.tsx                                      |  1 -
 src/lib/k2-cordis/importer.ts                                    |  2 +-
```
Artefaktlar: `docs/agent-results/TASK-MTS6MMOD8XF3A-screenshots/` (4 png).
> **Commit notu — `messages/*.json` benim commit'ime giremedi.** Stage ederken bu iki dosya
> zaten temizdi: eşzamanlı çalışan bir ajanın geniş `git add`'i benim `NotFound` anahtarlarımı
> `266f00b` ("feat(m1): real write path for /calls Save search") içine almış. İçerik bozulmamış —
> `git show HEAD:messages/tr.json|en.json` tam olarak yazdığım üç anahtarı iki dilde de veriyor ve
> 404 e2e'si yeşil — yani yalnız atıf yanlış, iş kayıp değil. Yeniden eklemek boş diff üretirdi,
> eklemedim. Ortak kural (e)'nin uyardığı hasar bu dalgada da tekrarladı.

Verilen liste dışında **hiçbir** dosyaya dokunulmadı. `PartBCollaborativeEditor.tsx`'e dokunulmadı.

## 7. Riskler

- **Locale-siz 404'ler `tr`'ye düşer.** `/bilinmeyen` (prefix'siz) gibi bir yol için `requestLocale`
  boştur ve `routing.defaultLocale = 'tr'` devreye girer. Bu kasıtlı ve mevcut davranışla aynı;
  `/en/...` altındaki 404'ler doğru şekilde İngilizce (§2.3'te ölçüldü). Ölçümümde
  `/no-locale-at-all` zaten 307 veriyor, yani pratikte bu yola nadiren düşülüyor.
- Root `not-found.tsx` artık `async`. Next 16 + next-intl 4.14 ile ölçüldü ve çalışıyor; next-intl
  ana sürüm yükseltmesinde `requestLocale` çözümü yeniden doğrulanmalı.
- `catch (err)` → `catch` davranışı değiştirmez (bağ zaten kullanılmıyordu, yorum korundu).

## 8. Açık sorular

1. §4'teki 9 uyarı (2 dosya) kime ait? Ayrı kart mı açılsın, yoksa bu kartın dosya listesi mi genişlesin?
2. BULGU-1: çift onay banner'ı gerçek `DualApprovalState`'e mi bağlanacak, yoksa akış hazır olana
   kadar kaldırılacak mı? Şu hali kullanıcıya olmayan bir kontrolü vaat ediyor.
3. §3: demo kiracılar (`main`, `fabrika-beta`) Ultra'ya mı taşınacak, yoksa iki e2e paketi de
   m9-briefs-form gibi kendi fixture kiracısını mı kuracak?

## 9. Sonraki adım

- §4'teki 9 uyarı için kart aç (sahibi netleştikten sonra).
- BULGU-1 için M10 kartı aç: banner'ı `submitDualApprovalAction`/`departmentApproveAction`'a bağla
  ya da kaldır; ardından BULGU-2 (i18n) aynı dosyada birlikte çözülsün.
- §3 için kart aç: m9-brief-generate-failure + m10-audit-identity'yi fixture kiracıya taşı; aksi
  halde bu iki paket plan verisi her değiştiğinde kırmızıya döner.

## Karar

**Bu kartın kapsamı için yayına uygun.** İki iddia da ölçüldü ve doğru çıktı; 404 iki dilde gerçek
tıklamayla doğrulandı; 5 uyarı susturma eklenmeden kapatıldı; lint 16 → **9**; typecheck ve 1127
birim testi yeşil; 404 e2e paketi yeşil. **Uyarı sayısı 0'a inmedi** — kalan 9 uyarı bana verilmeyen
iki dosyada ve kural (f) gereği onlara dokunmadım (§4). Görülen 4 e2e kırmızısı A/B ile bu değişikliğin
dışında kanıtlandı (§3) ve bildirildi.
