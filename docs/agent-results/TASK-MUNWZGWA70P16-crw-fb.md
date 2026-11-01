# TASK-MUNWZGWA70P16 — crw-fb — /calls prototip anahtarları ve kart linkleri (İNCELEME-71 B-1..B-5)

**Durum:** TAMAM
**Dal:** `crw-fb/munwzg-calls-links`. Fix commit `658e881b`, dev ile merge `04ddeb77`, dev'e merge `90916d9d`. Push yapılmadı.
**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, Chrome headless 1280×900, `next build` ve `next start`, izole `pgvector:pg16` konteyneri). Windows ve Linux'ta koşulmadı. Bu makinede yalnız mac var. Değişikliklerin hiçbiri platforma bağlı bir kod yoluna dokunmuyor: URL üretimi, `Object.hasOwn`, JSON süzgeci, statik test ve `next.config` görsel deseni. Süreç, dosya yolu, kabuk ya da ikili adı değişmedi. Bu yüzden davranışın diğer platformlarda aynı olması beklenir.

## 1. Ne yapıldı

| # | Bulgu | Düzeltme |
|---|---|---|
| B-1 | `/calls/constructor`, `__proto__`, `toString` ve `hasOwnProperty` 200 dönüyordu ve indexlenebilir soft-404 üretiyordu. | `src/app/[locale]/calls/[region]/regions.ts` içine `regionOf()` eklendi. Tablo ve `Object.hasOwn(REGIONS, region)` kontrolü oraya taşındı. Hem sayfa hem `generateMetadata` bu fonksiyonu kullanıyor. |
| B-2 | Herkese açık `/calls` sayfasındaki her kart `/calls/<identifier>` adresine gidiyor, o da `[region]` rotasına düşüp 404 veriyordu. | `src/lib/routes.ts` içine `publicCallDetailHref(locale, identifier, signedIn)` eklendi. **Giriş yapmış kullanıcı** doğrudan `/{tr}/default/cagrilar/<id>` ya da `/{en}/default/calls/<id>` adresine gider. **Giriş yapmamış kullanıcı** `/tr/giris?callbackUrl=<detay>` ya da `/en/login?callbackUrl=<detay>` adresine gider. `callbackUrl` gerekiyor, çünkü `(app)` layout'u girişsiz isteği `/giris`'e yönlendirirken istenen URL'i düşürüyor. Region sayfasındaki `login?redirect=/dashboard` butonu da artık bu fonksiyonu kullanıyor. Önceki buton kimsenin okumadığı bir parametre taşıyordu. |
| B-3 | `templateSections`'a `[null]` gelince 500 veriyordu. Geçersiz elemanlar boş bir editör açıyordu. | `templateSections` artık `key` alanı dolu bir string olmayan elemanları atıyor. `editorSections` buna ek olarak pozitif ve sonlu bir `maxWords` istiyor; uygun eleman kalmazsa `DEFAULT_SECTIONS`'a düşüyor. `types.ts` yorumu güncellendi. |
| B-4 | Bekçi test yalnız `generateStaticParams`'a bakıyordu. | `tests/no-ssg-under-dynamic-root.test.ts` artık `dynamic = 'force-static'` ve `'error'` değerlerini, ayrıca 0'dan büyük `revalidate` değerini de reddediyor. |
| B-5 | `remotePatterns` her porta izin veriyordu. | İki girdiye de `port: ''` eklendi. |

**B-2 ürün kararı patronda bekliyor.** Seçilen yol geçici. Herkese açık bir çağrı detay sayfası yok. Kodda aradım: `(marketing)` altında yalnız blog var, `calls/turkey` ise dış kaynak linki veriyor. Bu yüzden kartlar görev tanımındaki varsayılana, yani girişli detay rotasına ve giriş sonrası dönüş URL'ine bağlandı. İleride herkese açık bir detay sayfası kararı çıkarsa yalnız `publicCallDetailHref` değişir; iki sayfa da onu çağırıyor.

`default` workspace segmenti bilinçli seçildi. Kod tabanında bu segment "kiracının ilk çalışma alanı" anlamında kullanılıyor: `pipeline/actions.ts:234-238` slug `default` ise kiracının ilk workspace'ine düşüyor, `AuthCard` varsayılan dönüşü de `/default/dashboard`. Seed kiracısının slug'ı `main` olduğu halde detay sayfası ve "Fırsatlara Ekle" butonu çalışıyor (kare 04).

### Yol üstünde yakalanan regresyon
İlk sürümde B-3 filtresini fe-fb'nin önerisine uyarak `templateSections` içinde `key + maxWords` olarak yazmıştım. Tam vitest koşusu bunu yakaladı: `export/route.ssrf.test.ts` testinde "a legitimate export still produces a real DOCX" kırmızı döndü. Sebep şu: DOCX dışa aktarımı yalnız `key` ve `labelKey` okuyor, dolayısıyla `maxWords`'süz bölümler düşünce belge boş kalıyordu. Düzeltmede kontrolü okuyucuya göre böldüm. Ortak okuyucu yalnız `key` istiyor, `maxWords` kontrolü editöre (`editorSections`) taşındı. Mutant M10c bu regresyonu tekrar yakalıyor.

## 2. Kanıt

Kanıtlar `docs/agent-results/TASK-MUNWZGWA70P16-crw-fb-ekler/` altında.

**Kapılar** (dal `658e881b`'de ve dev ile merge edilmiş `04ddeb77`'de; ikincisinin çıktısı `merged-gates.txt`):
```
apply-migrations: 40 files applied · migrations x2 0 · Policies in public: 28 → 112 · seed 0
tsc EXIT 0
eslint EXIT 0
i18n EXIT 0   ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
build EXIT 0 ●=0   (├ ƒ /[locale]/calls · ├ ƒ /[locale]/calls/[region] · ├ ƒ /[locale]/calls/turkey)
vitest EXIT 0   Test Files 273 passed | 6 skipped (279) · Tests 3310 passed | 81 skipped (3391)
```
Dal tek başına: `Test Files 271 passed | 6 skipped (277) · Tests 3295 passed | 73 skipped (3368)`.

**B-1 canlı** (`next start`, izole DB; `probe-b1.txt`). Önceki durum İNCELEME-71'de ölçülmüştü: constructor 200, "Object — FonBridge".
```
tr/calls/constructor 404 <meta name="robots" content="noindex"/>
tr/calls/__proto__ 404 noindex · tr/calls/toString 404 · tr/calls/hasOwnProperty 404 · tr/calls/valueOf 404
en/calls/constructor 404 · en/calls/__proto__ 404 · tr/calls/eu 404
tr/calls/germany 200 <title>Almanya — FonBridge</title> canonical …/tr/calls/germany
en/calls/france 200 · tr/calls/turkey 200
```
Tarayıcıda: `{"proto":"constructor","status":404,"title":"Sayfa Bulunamadı — FonBridge"}`, `__proto__` ve `toString` için de aynı sonuç. Kare: 08.

**B-2 canlı** (`probe-b2-final.txt`, merge'lü build için `merged-probe.txt`):
```
tr/calls distinct-links=20 old-style=/tr/calls/<ID>:0 signed-out-codes: 20 200
tr/calls/germany distinct-links=18 old-style:0 signed-out-codes: 18 200
en/calls distinct-links=20 old-style:0 signed-out-codes: 20 200
en/calls/germany distinct-links=18 old-style:0 signed-out-codes: 18 200
signed-in /tr/default/cagrilar/HORIZON-CL5-2026-D4-01 200 · …HORIZON-CL2-2026-D1-01 200 · /en/default/calls/HORIZON-GEO-2026-02-01 200 · …CL6-2026-D3-01 200
sitemap.xml 404 · robots.txt 404
```
**Sitemap:** repoda sitemap ya da robots rotası yok. `src` ve `public` altında `*sitemap*` dosyası bulunmadı ve `/sitemap.xml` 404 dönüyor. Bu yüzden sitemap'te kırık link olamaz. Kart linkleri ölçüldü: 76 linkin hepsi 200.

**Gerçek tarayıcı, tıklama ile** (`browser-walk.txt`, kareler 01–07):
```
{"list":"/tr/calls","cards":20,"clicked":"/tr/giris?callbackUrl=%2Ftr%2Fdefault%2Fcagrilar%2FHORIZON-CL5-2026-D4-01",…,"h1":"FonBridge Platformuna Giriş"}
{"list":"/en/calls",…,"clicked":"/en/login?callbackUrl=%2Fen%2Fdefault%2Fcalls%2FHORIZON-CL5-2026-D4-01",…,"h1":"Sign In to FonBridge"}
{"list":"/tr/calls/germany","cards":18,…"callbackUrl%2Ftr%2Fdefault%2Fcagrilar%2FHORIZON-CL6-2026-D3-01"…}
{"afterLogin":"/tr/default/cagrilar/HORIZON-CL6-2026-D3-01","status":200,"h1":"Digital & Industry 4.0"}
{"list":"/tr/calls",…,"landed":"/tr/default/cagrilar/HORIZON-CL2-2026-D1-01","h1":"Health & Wellbeing"}      (signed-in)
{"list":"/en/calls",…,"landed":"/en/default/calls/HORIZON-GEO-2026-02-01","h1":"Green Deal & Climate"}      (signed-in)
{"list":"/en/calls/france",…,"landed":"/en/default/calls/HORIZON-CL6-2026-D3-01","h1":"Digital & Industry 4.0"}
pageerrors: []
```
Girişin nasıl yapıldığı: prod build `DEMO_LOGIN_ENABLED`'e izin vermiyor ve kimlik bilgili form yalnız demo modunda görünüyor. Bu yüzden "giriş" adımında seed kullanıcısı alice için `next-auth/jwt encode` ile oturum çerezi bastım; önceki incelemelerde de aynı yöntem kullanıldı. Ardından `AuthCard`'ın yaptığı adımı (`window.location.href = callbackUrl`) aynen uyguladım. Google OAuth'un kendi yolunu (`signIn(provider, { redirectTo })`) koşamadım, çünkü test ortamında OAuth anahtarı yok.

**B-5 canlı** (`probe-b5.txt`). Önceki durum: `lh3…:8443` için 504, ölçüm İNCELEME-71'de.
```
/_next/image?url=https://lh3.googleusercontent.com:8443/a/x -> 400 0.002s "url" parameter is not allowed
/_next/image?url=https://images.unsplash.com:8080/photo-1 -> 400 0.001s "url" parameter is not allowed
```

**Mutantlar** (`mutants.py`, `mutants.txt`). Her mutantta ilgili 6 test dosyası koşuldu ve dosya sonra geri yüklendi. **18 mutantın 18'i öldü.** Eşdeğer mutant E1 (`revalidate = 0`) beklendiği gibi yaşadı.
```
M1 REGIONS[region] geri: ÖLDÜ · M2 region in REGIONS: ÖLDÜ · M3 girişsiz callbackUrl yok: ÖLDÜ
M4 kart linki /calls/<id> geri: ÖLDÜ · M5 bölge linki login?redirect geri: ÖLDÜ · M6 signedIn sabit true: ÖLDÜ
M7 identifier encode yok: ÖLDÜ · M8 girişli kullanıcı da login: ÖLDÜ · M9 templateSections filtresiz: ÖLDÜ
M10 editor maxWords>0 yok: ÖLDÜ · M10b editor maxWords filtresi yok: ÖLDÜ · M10c templateSections maxWords istiyor (export regresyonu): ÖLDÜ
M11 port kaldırıldı: ÖLDÜ · M12 force-static: ÖLDÜ · M13 revalidate 3600: ÖLDÜ · M14 revalidate: number = 60: ÖLDÜ · M15 dynamic="error": ÖLDÜ
E1 revalidate = 0 (izinli, eşdeğer): SAĞ · Tests 55 passed (55)
```

## 3. Değişen dosyalar
- `src/app/[locale]/calls/[region]/regions.ts` (yeni) ve `src/app/[locale]/calls/[region]/page.tsx`
- `src/app/[locale]/calls/page.tsx`
- `src/lib/routes.ts` (`publicCallDetailHref`)
- `src/modules/m2/server/templates.ts`, `src/modules/m2/types.ts`, `src/app/[locale]/(app)/[workspace]/concept-notes/[id]/data.ts`
- `next.config.ts`
- Testler: `tests/public-calls-links.test.ts` (yeni, 16 test), `tests/no-ssg-under-dynamic-root.test.ts`, `tests/next-image-remote-patterns.test.ts`, `tests/concept-note-editor-sections.test.ts`, `src/modules/m2/server/templates.test.ts`
- Bu rapor ve `TASK-MUNWZGWA70P16-crw-fb-ekler/` (8 kare, yoklama ve mutant çıktıları)

## 4. Riskler
- **`auth()` herkese açık iki sayfada çağrılıyor.** Kök layout zaten `cookies()` okuduğu için sayfalar dinamikti; build'de hâlâ ƒ görünüyorlar ve ● satırı yok. Ek maliyet istek başına bir JWT çözümü.
- **`default` segmenti.** `Membership.workspaceIds` belirli bir workspace'e daraltılmış bir üye için "ilk workspace" o üyenin erişemediği bir workspace olabilir. Bu risk bu değişiklikle gelmedi; `AuthCard`'ın varsayılan dönüşü ve `pipeline/actions.ts` de aynı konvansiyonu kullanıyor. Yine de not ediyorum.
- **B-4 bekçisi regex tabanlı.** `export const revalidate = SOME_CONST` gibi bir değeri de reddeder; bu bilerek seçilen, güvenli tarafta kalan bir davranış. `export { revalidate }` gibi yeniden dışa aktarım biçimlerini ise yakalamaz.
- **Bilgi, önceden var, kapsam dışı:** `AuthCard.tsx:252/256/276` satırları `window.location.href = rawCallbackUrl` ile doğrulanmamış bir `callbackUrl`'e gidiyor. `javascript:` gibi bir değer istemci tarafında çalışır. Bu yol yalnız demo girişte (`demoLoginEnabled`) açık, prod'da kapalı. OAuth yolu ise Auth.js'in varsayılan aynı-origin kontrolünden geçiyor (`auth.ts`'te özel `redirect` callback'i yok). Ayrı bir düşük öncelikli kart önerilir.

## 5. Açık sorular
- **B-2 (patron kararı bekleniyor):** Kartlar herkese açık bir çağrı detay sayfasına mı gitmeli, yoksa bugünkü gibi giriş ve dönüş URL'iyle girişli detaya mı? Karar gelene kadar ikincisi geçerli.
- B-6 (İNCELEME-71): region sayfası listeyi region'a göre süzmüyor ve `/en/calls/germany` başlığı Türkçe. Bu kartın kapsamı dışında kaldı, dokunulmadı.
- B-3 canlı tarayıcıda koşulmadı. İzole seed'de concept note yok; birini kurmak için opportunity ve şablon zinciri gerekiyor. Birim testleri ve mutantlar M9, M10, M10b, M10c bu yolu kapsıyor. `[null]` durumunun 500 vermesinin kök nedeni `section.key`'nin null üzerinde çağrılmasıydı ve süzgeç artık null'ı eliyor.

## 6. Sonraki adım
- Lider kartı `done` durumuna alabilir. Push liderde.
- B-2 kararı gelirse değişecek tek yer `publicCallDetailHref`.
- İsteğe bağlı iki kart: AuthCard `callbackUrl` doğrulaması (yalnız göreli yol, `javascript:` değil) ve B-6 region süzmesi ile i18n başlık.
- Temizlik yapıldı: izole `crwfb-munwzg-pg` konteyneri silindi, `next start` durduruldu. Paylaşılan `:5433` veritabanına ne okuma ne yazma yapıldı.
