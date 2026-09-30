# TASK-MUO12A7NHANOT — crw-fb — FB DÜZELTME (İNCELEME-76 Y-1/Y-2)

**Durum:** TAMAM
**Dal:** `crw-fb/muo12a-workspace-route` (dev `2b0bbae8`'den), dev'e merge edildi, push yok.
**Platform beyanı:** Yalnız **macOS**'ta doğrulandı (Darwin 27, Chrome 1280×900 Playwright ile; `next build` + `next start -p 3512` prod build; demo-giriş için ayrı `next dev -p 3513`; izole `pgvector:pg16` konteyneri `crwfb-o12a-pg` :55512). Windows ve Linux koşulmadı, çünkü bu makinede yalnız mac var. Dokunulan kod yollarının hiçbiri platforma bağlı değil: URL üretimi, Next route handler yönlendirmesi, Prisma sorgusu, `new URL` ile origin kontrolü, JSON normalizasyonu. Süreç, dosya yolu, kabuk, ikili adı ya da kısayol yok. Diğer platformlarda da aynı davranış beklenir.
**Patron kararı korundu:** kartlar hâlâ girişli detaya gidiyor; yalnız hangi alanın detayı olduğuna artık sunucu karar veriyor.

## 1. Ne yapıldı

### Y-1: alan-bağımsız yönlendirme ve sunucu tarafı alan kontrolü
- **Yeni rota `GET /[locale]/calls/topic/[id]`** (`src/app/[locale]/calls/topic/[id]/route.ts` ve saf karar fonksiyonu `target.ts`):
  - girişsiz kullanıcı → `/{locale}/{giris|login}?callbackUrl=/{locale}/calls/topic/<id>` (dönüş adresi alan içermiyor);
  - girişli ama kiracısı ya da canlı alanı yok → `/{locale}/no-workspace`;
  - girişli ve üye → `/{locale}/{slug}/{cagrilar|calls}/<id>`; slug'ı sunucu seçiyor;
  - geçersiz locale ya da 200 karakterden uzun id → 404; yanıtlarda `Cache-Control: private, no-store`.
- **`publicCallDetailHref(locale, id)`** artık herkes için `/{locale}/calls/topic/<id>` döndürüyor. `signedIn` parametresi ve iki herkese açık sayfadaki `auth()` çağrısı kaldırıldı. Bu, İNCELEME-76'daki N4/N5 boşluklarını da kapatıyor. Sayfalar hâlâ `ƒ`, build'de `●=0`.
- **`findScopedWorkspace(tx, scope, slug)` / `resolveScopedWorkspace`** (`src/lib/workspaces.ts`) tek bir kural uyguluyor:
  - slug yalnız kapsamdaki, `deletedAt: null` olan ve `workspaceIdFilter(scope.workspaceIds)` ile izin verilen alanlar arasında aranıyor;
  - `null`, ya da izinli alanlardan hiçbirinin adı gerçekten `default` değilse `default` takma adı → izinli en eski alan (`createdAt asc, id asc`);
  - başka her şey `null` döner, yani **hiçbir durumda geri düşüş yok**.
- **`createOpportunity`** bu kuralı yazmayla aynı `withTenant` kapsamında kullanıyor. Alan bulunamazsa `{ success:false, error:'WORKSPACE_NOT_FOUND' }` dönüyor ve satır bellek tamponuna da **yazılmıyor**. Eski "bilinmeyen slug → ilk alan" geri düşüşü kaldırıldı.
- **Detay sayfası** `(app)/[workspace]/calls/[id]/page.tsx` URL slug'ına güvenmiyor:
  - `requireTenantPage` ardından `resolveScopedWorkspace(scope, workspace)` çalışıyor;
  - `default` ya da başka bir takma ad gerçek slug'a 307 ile yönlendiriliyor;
  - izin dışı, silinmiş ya da bilinmeyen slug, alan-bağımsız rotaya gidiyor ve oradan izinli alana ya da /no-workspace'e düşüyor.
- **Ret artık görünüyor.** Detaydaki "Fırsatlara Ekle" butonu `success:false` gelirse hata gösteriyor ve panoya gitmiyor (önceden ret yok sayılıp panoya gidiliyordu). Pano modalı da reddi toast olarak gösteriyor: yeni `pipeline.createRefused` anahtarı, tr ve en.

### Y-2: `labelKey` olmayan şablonda DOCX 500
- `templateSections` artık `labelKey`'i string olmayan bölümün başlığını `key` ile dolduruyor (`withLabel`). Bölüm atılmıyor, çünkü atılsaydı içeriği hem editörde hem dışa aktarımda kaybolurdu. Tüm okuyucular (export, editör, m2, actions) bu fonksiyondan geçtiği için düzeltme tek yerde.

### D-1/D-2 (ucuz olduğu için): demo girişinde callbackUrl
- `src/lib/safe-callback-url.ts` yalnız aynı-origin yolları kabul ediyor. Ret koşulları:
  - `/` ile başlamayan değerler;
  - `//` ve `/\` ile başlayanlar;
  - boşluk, kontrol karakteri ya da `\` içerenler;
  - normalize edildikten sonra origin değişenler;
  - normalize edildikten sonra yeniden `//` ile başlayanlar. Bu durumu kendi testimde buldum: `/a/../..//evil.com` → `//evil.com`.
- `AuthCard` query değerini yalnız bu fonksiyondan geçirerek okuyor. Bu, D-2'deki başı boşluklu değeri de kapsıyor.

## 2. Kanıt

### Canlı ölçüm: kart → rota (`ekler/probe.txt`)
```
tr/calls topic-linkleri=20 default/callbackUrl-linkleri=0   en/calls 20/0   tr|en/calls/germany 18/0
girişsiz tr: 307 /tr/giris?callbackUrl=%2Ftr%2Fcalls%2Ftopic%2FHORIZON-CL5-2026-D4-01   (en: /en/login?…)
alice tr: 307 /tr/main/cagrilar/…     owner tr: 307 /tr/ws-a/cagrilar/…   (T2'nin en eski alanı)
restr tr: 307 /tr/ws-b/cagrilar/…     (yalnız ws-b üyesi → ws-b)          en: /en/ws-b/calls/…
del   tr: 307 /tr/yeni/cagrilar/…     (silinmiş 'default' atlandı)          en: /en/yeni/calls/…
none  tr: 307 /tr/no-workspace        (tek alanı silinmiş kiracı)          uzun id: 404
```
### Canlı ölçüm: detay sayfası URL slug'ına güvenmiyor
```
restr /tr/ws-a/…   -> 307 /tr/calls/topic/…  (sonra ws-b)   restr /tr/default/… -> 307 /tr/ws-b/…   restr /tr/ws-b/… -> 200
del   /tr/default/… -> 307 /tr/yeni/…                         owner /tr/nope/…    -> 307 /tr/calls/topic/…
alice /tr/ws-a/…   -> 307 /tr/calls/topic/…                  none  /tr/default/… -> 307 /tr/calls/topic/… (sonra /no-workspace)
```
### fe-fb'nin Y-1 senaryoları, gerçek tarayıcıda tıklayarak (`ekler/walk.txt`, kareler 01–04)
Girişsiz tıklama giriş sayfasına gidiyor (h1 "FonBridge Platformuna Giriş" / "Sign In to FonBridge"). Oturum açıldıktan sonra callbackUrl'e gidiliyor: restr için `/tr/ws-b/cagrilar/…` 200, del için `/en/yeni/calls/…` 200. "Fırsatlara Ekle"nin DB'ye yazdığı satırlar:
```
 owner              | tenant       | ws   | ws_deleted | in_membership
 alice@fabrika.test | fabrika-beta | main | f          | t
 owner12a@o12a.test | o12a-t2      | ws-a | f          | t
 restr12a@o12a.test | o12a-t2      | ws-b | f          | t     ← önce ws-a (üyelik DIŞI) idi
 del12a@o12a.test   | o12a-t3      | yeni | f          | t     ← önce 'default' (SİLİNMİŞ) idi
 restr12a@o12a.test | o12a-t2      | ws-b | f          | t     (en)
pageerrors: []
```
Pano sayfasında görünen kilit kutusu ("modül kapalı"), fikstür kiracılarında M5 modülünün açık olmamasından geliyor. fe-fb'nin ölçümünde de aynıydı ve bu işle ilgisi yok. Satırlar doğru alana yazıldı.

### Saldırı: sunucu aksiyonuna giden slug değiştirildi (`ekler/attack.txt`, kareler 05)
Playwright, `next-action` POST gövdesindeki slug'ı yeniden yazdı:
```
restr  sayfa ws-b → aksiyona "ws-a"    → 1:{"success":false,"error":"WORKSPACE_NOT_FOUND"}  uyarı "Fırsat eklenemedi…"  url değişmedi
owner  sayfa ws-b → aksiyona "nope"    → WORKSPACE_NOT_FOUND
del    sayfa yeni → aksiyona "default" → success, workspaceId o12a-ws-yeni (silinmiş default DEĞİL)
DB: HORIZON-CL2 satırları (o12a kiracıları) = 1  (yalnız del→yeni)
```
### Y-2 canlı (`ekler/docx-live.txt`), ASCII başlıklı fırsat
```
cn-nolabel  editor=200 export=200 docx(Zip) metin=[…|a|Govde nolabel]     ← önce 500
cn-numlabel editor=200 export=200 docx(Zip) metin=[…|a|Govde numlabel]    ← önce 500
cn-null     editor=200 export=200
cn-ok       editor=200 export=200 metin=[…|Baslik A|Govde ok]
server.log TypeError sayısı: 0
```
### D-1 canlı, demo girişi açık `next dev` (`ekler/redir-dev.txt`, kareler 06)
Gerçek form gönderimiyle ölçüldü (alice / demo1234):
```
https://evil.com/x | //evil.com/x | /\evil.com/x | " //evil.com/x" | /a/../..//evil.com | javascript:…  → /tr/default/dashboard, evil'e gidiş yok
/tr/calls/topic/HORIZON-CL5-2026-D4-01 → /tr/main/cagrilar/HORIZON-CL5-2026-D4-01   (giriş → rota → alan: uçtan uca zincir)
```
### Mutantlar (`ekler/mutants.txt`, `mutants-rerun.txt`)
5 test dosyası, 82 test. Her mutanttan sonra dosya geri yüklendi; değişen dosya sayısı mutasyon öncesiyle aynı (20). **22 mutanttan 21'i öldü:**
- deletedAt, üyelik filtresi, bilinmeyen slug geri düşüşü, orderBy (ilk koşuda sağ kaldı; ekleme sırasını tersine çeviren test eklenince öldü);
- ret yerine bellek tamponu, slug'ın yok sayılması;
- girişsiz dönüşün default detaya gitmesi, kiracısız kullanıcının girişe gitmesi, locale kontrolünün kaldırılması, alan yokken `default`'a gitmesi, kart linkinin yeniden `/default/` olması;
- detayda yönlendirmenin ve kontrolün kaldırılması, butonun reddi yok sayması;
- labelKey geri düşüşünün kaldırılması;
- safeCallbackUrl'de `//` son kontrolü, boşluk kontrolü ve baştaki `/` şartının kaldırılması, AuthCard'ın ham değeri okuması;
- pano toast'ının kaldırılması, liste sayfasına `auth()`'un geri eklenmesi.

**Sağ kalan tek mutant M18** (safeCallbackUrl origin kontrolü). Bu **eşdeğer mutant**: önceki süzgeçler `/` ile başlamayı şart koşuyor ve `//`, `/\`, boşluk ve `\` içeren değerleri reddediyor; bunları geçen bir yol çözümlendiğinde origin değişemez. Kontrol, derinlemesine savunma olarak kodda kaldı.

### Kapılar (dal, izole DB, CI sırası)
```
DB prep: prisma db push 0 · db:rls-role 0 · apply-migrations ×2 0 (40 dosya) · db:rls 0 (28 → 112) · db:seed 0
tsc EXIT 0 · lint (tam) EXIT 0 · i18n EXIT 0
build EXIT 0 · ●=0 · ƒ /[locale]/calls · ƒ /[locale]/calls/[region] · ƒ /[locale]/calls/topic/[id] · ƒ /[locale]/[workspace]/cagrilar/[id]
vitest run (tam) EXIT 0 → Test Files 281 passed | 6 skipped (287) · Tests 3407 passed | 81 skipped (3488)
güncel dev (23e63600) dala merge edildikten sonra: tsc 0 · lint 0 · i18n 0 · vitest EXIT 0 → Test Files 281 passed | 6 skipped (287) · Tests 3453 passed | 84 skipped (3537)
```

## 3. Değişen dosyalar
- Yeni: `src/app/[locale]/calls/topic/[id]/route.ts`, `…/target.ts`, `src/lib/safe-callback-url.ts`, `tests/call-topic-route.test.ts`, `tests/workspace-scoped-writes.test.ts`, `tests/safe-callback-url.test.ts`
- Değişen: `src/lib/workspaces.ts`, `src/lib/routes.ts`, `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts`, `…/pipeline/board.tsx`, `…/calls/[id]/page.tsx`, `…/calls/[id]/add-button.tsx`, `src/app/[locale]/calls/page.tsx`, `src/app/[locale]/calls/[region]/page.tsx`, `src/app/[locale]/login/AuthCard.tsx`, `src/modules/m2/server/templates.ts` (+ test), `tests/public-calls-links.test.ts`, `messages/{tr,en}.json` (`pipeline.createRefused`)
- Bu rapor ve `TASK-MUO12A7NHANOT-crw-fb-ekler/`: 10 kare, ölçüm çıktıları, betikler, fikstür SQL'i. Oturum çerezleri ve sırlar eklenmedi (`eyJ` taraması 0 eşleşme verdi).

## 4. Riskler
- **Alan seçimi "izinli en eski alan".** Çok alanlı bir kullanıcı karttan her zaman en eski alana düşer (owner76 → ws-a); o sırada ws-b'de çalışıyor olsa bile. Kullanıcı üye olduğu için bu doğru ama ideal değil. "Son kullanılan alan" ayrı bir iş (çerez ya da DB).
- **`(app)` altındaki diğer sayfalar hâlâ `[workspace]` segmentini doğrulamıyor.** Pano, konsept notlar gibi sayfalar alan kimliğini URL'den okuyor. Bu kart yalnız çağrı detayını ve `createOpportunity` yazısını kapattı. `opportunities/[id]/matching` ve `m2`'deki `workspace: { slug }` sorguları (fe-fb'nin bilgi notu) olduğu gibi duruyor.
- **Buton hata metni genel:** "Fırsat eklenemedi. Lütfen tekrar deneyin." `WORKSPACE_NOT_FOUND` UI'dan yalnız gövde değiştirilerek (kurcalamayla) ya da yarış durumunda (alan sayfa açıkken silinirse) oluşabiliyor; yeniden denemek yine reddedilir. Düşük risk.
- **AuthCard'ın varsayılan dönüşü hâlâ `/{locale}/default/dashboard`.** Artık bu tehlikeli değil, çünkü `default` takma adı sunucuda izinli ve canlı bir alana çözülüyor.

## 5. Açık sorular
- Çok alanlı kullanıcıda "son kullanılan alan" istenirse nerede saklansın? Kullanıcı başına çerez mi, `Membership` alanı mı?

## 6. Sonraki adım
1. İnceleme için bir kart (İNCELEME-76'nın kapanışı).
2. Ayrı kartlar, bu işin kapsamı dışında:
   - DOCX `Content-Disposition` için UTF-8 dosya adı: Türkçe başlıkta dışa aktarım hâlâ 500 dönüyor (fe-fb'nin kapsam dışı Y bulgusu);
   - `(app)` layout düzeyinde `[workspace]` doğrulaması;
   - "son kullanılan alan".
3. Temizlik: kendi `next start` (:3512) ve `next dev` (:3513) süreçlerim durduruldu; `crwfb-o12a-pg` konteyneri ve worktree silindi. Paylaşılan `:5433`'e hiç dokunulmadı.
