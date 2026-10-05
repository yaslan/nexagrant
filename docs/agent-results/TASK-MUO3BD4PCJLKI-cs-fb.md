# TASK-MUO3BD4PCJLKI — cs-fb — FB İNCELEME-83: /calls alan-bağımsız rota + izinli canlı alana yazma + DOCX labelKey + callbackUrl aynı-origin (TASK-MUO12A7NHANOT, crw-fb, 0ea5f79d + merge 80c0641a)

**Durum:** TAMAM
**Karar:** **DÜZELTME GEREKLİ (küçük, tek bulgu).** Rota, detay sayfasının slug kontrolü, DOCX `labelKey` geri düşüşü ve `safeCallbackUrl` kabul. Ama `createOpportunity`'nin reddi atlatılabiliyor (**Y-1**): `workspaceSlug` metin değil de nesne, dizi ya da sayı olursa, veya NUL baytı içerirse alan sorgusu hata veriyor. `catch` bunu "DB kesintisi" sayıyor, satır bellek tamponuna yazılıyor ve yanıt `success:true` dönüyor. Tampondaki kart kiracının **bütün** alan panolarında görünüyor. Hiç canlı alanı olmayan kullanıcı bile bu yoldan kart ekleyebiliyor.
**İncelenen:** fix `0ea5f79d`, dev merge `80c0641a`. İnceleme worktree'si dev `8ddcb5b6` + bu raporun iskeleti (`675bd296`), detached, `$SCRATCH/wt83`. **Kod değiştirilmedi.**
**Patron kararı korunuyor:** kartlar girişli detaya gidiyor. Girişsiz kullanıcı önce girişe, oradan detaya gidiyor (uçtan uca ölçüldü, §2.1 ve §2.5).
**Platform beyanı:** Yalnız **macOS**'ta doğrulandı: Darwin 27, Chrome 1280×900 (Playwright `channel:'chrome'`), `next build` + `next start -p 3583` prod build, demo girişi için ayrı `next dev -p 3584`, izole `pgvector:pg16` konteyneri `csfb83-pg` :55883. Windows ve Linux koşulmadı, çünkü bu makinede yalnız mac var. İncelenen kod yollarının hiçbiri platforma bağlı değil: route handler yönlendirmesi, `new URL` ayrıştırma, Prisma sorgusu, Next `redirect()` başlık doğrulaması, JSON normalizasyonu. Süreç, dosya yolu, kabuk, ikili adı ya da kısayol yok. Bulguların (Y-1, O-1) diğer platformlarda da aynı çıkması beklenir. O-1'deki `Invalid character in header content` hatası Node'un HTTP başlık kuralından geliyor, o da platformdan bağımsız.

## 1. Ne yapıldı
- **İzole DB.** Paylaşılan `:5433`'e hiç yazılmadı. CI sırası: `db:generate`, şema (`migrate diff --from-empty` + konteyner psql, çünkü Prisma AI koruması `db push`'u engelliyor), `db:rls-role`, `apply-migrations` ×2 (40 dosya), `db:rls` (112 politika), `db:seed` (`ekler/dbprep.txt`).
- **Saldırı fikstürleri** (`ekler/fixtures83.sql`). 7 kiracı ve 10 kullanıcı:
  - `owner`: T2'de kısıtsız sahip (ws-a en eski, ws-b, ws-c silinmiş).
  - `restr`: yalnız ws-b.
  - `restrc`: `{ws-c(silinmiş), ws-b, var-olmayan-id}`.
  - `del`: T3; `default` silinmiş, `yeni` canlı.
  - `none`: T4; tek alanı silinmiş.
  - `nomem`: hiç üyeliği yok.
  - `t5u`: yalnız silinmiş alana kısıtlı.
  - `t6u`: `workspaceIds` başka kiracının alanını gösteriyor.
  - `t7u`: gerçekten `default` adlı alan var, ama daha eski bir alan da var.
  - `t8u`: ASCII dışı slug (`çalışma alanı`).
- **Giriş.** Prod'da imzalı `authjs.session-token` kullanıldı. Token yalnız `id` ve `email` taşıyor; kiracı, rol ve `workspaceIds` her istekte `jwt` callback'inde DB'den okunuyor. Demo yolunda gerçek form gönderildi (alice / demo1234).
- **Denemeler:**
  - rota ve detay sayfası tam yönlendirme zinciriyle (8 hop'a kadar, döngü tespiti);
  - server action gövdesi Playwright ile kurcalandı, ayrıca curl ile yeniden oynatıldı; sonra DB ve pano okundu;
  - 22 bozuk şablon ya da içerik ile DOCX dışa aktarımı ve editör;
  - `safeCallbackUrl` için 54 varyantlık fuzz, korunan çıktıların canlı zinciri, prod Google yolu (11 varyant), demo girişi (tr 11 + en 4 varyant);
  - 19 kendi mutantım + bir bileşik mutant;
  - tam kapılar.

## 2. Bulgular ve kanıt

### Y-1 — `createOpportunity` reddi tip karışıklığıyla atlatılıyor: `success:true`, satır bellek tamponunda, kart tüm alan panolarında (DÜZELTME GEREKLİ)
`pipeline/actions.ts:236-293`: `findScopedWorkspace` `withTenant` içinde hata fırlatırsa `workspaceRefused` hiç `true` olmuyor. `catch` yalnız uyarı yazıyor, ardından `persisted ?? addInMemoryOpportunity(tenantId, newOpp)` satırı tampona koyuyor ve `{ success:true }` dönüyor. `workspaceSlug` server action argümanı, çalışma zamanında tipi denetlenmiyor. İki yol Prisma/Postgres'i fırlatmaya zorluyor:
- `'ws-a\u0000'`: Postgres metin parametresinde NUL kabul etmiyor;
- `{foo:1}`, `["ws-a"]`, `7`: Prisma sorgu doğrulaması reddediyor.

Canlı ölçüm, restr (yalnız ws-b) ws-b detayında "Fırsatlara Ekle"ye bastı, istek Playwright'ta değiştirildi (`ekler/attack83.txt`, kareler `shots/05-*`):
```
 1 ws-a (üyelik dışı)          -> {"success":false,"error":"WORKSPACE_NOT_FOUND"}   ✔
 2 ws-c (silinmiş)             -> WORKSPACE_NOT_FOUND                                ✔
 3 WS-B (büyük harf)           -> WORKSPACE_NOT_FOUND                                ✔
 4 "" (boş)                    -> success, DB satırı ws-b                            ✔ (izinli en eski)
 6 {contains:"ws"}             -> success, DB satırı ws-b                            ✔ (filtre izinli kümeyle sınırlı)
10 ek alan workspaceId/tenantId -> success, DB satırı ws-b                           ✔ (ek alanlar yok sayılıyor)
 5 "ws-a\u0000"                -> success:true  id "opp-1790772550100" workspaceId "ws-a\u0000"        ✘ TAMPON
 7 {foo:1}                     -> success:true  id "opp-…"  workspaceId "$T0:0:workspaceSlug"         ✘ TAMPON
 8 ["ws-a"]                    -> success:true  id "opp-…"                                             ✘ TAMPON
 9 7                           -> success:true  id "opp-…"  workspaceId 7                              ✘ TAMPON
```
Hiç canlı alanı olmayan kullanıcılar, doğrudan curl ile (`ekler/board83.txt`, `replay83.txt`):
```
none / t5u / t6u  slug='kendi'|'ws-a'|'default'|''  -> WORKSPACE_NOT_FOUND   ✔ (16/16)
nomem              (hepsi)                           -> TENANT_SCOPE_REQUIRED ✔
none  "x\u0000" -> success:true opp-…   none  {foo:1} -> success:true opp-…     ✘
t5u   "x\u0000" -> success:true opp-…   t5u   {foo:1} -> success:true opp-…     ✘
t6u   "x\u0000" -> success:true opp-…   t6u   {foo:1} -> success:true opp-…     ✘
```
**Panoda görünürlük** (`shots83.txt`, kareler `shots/06-{tr,en}-owner-ws-a-board-buffer-cards.png`). owner kendi **ws-a** panosunu açtı:
```
cardsWithMarker: CSFB83-10, -9, -8, -7, -6, -5, -4   (tr ve en)
```
Bunlardan 5, 7, 8 ve 9 restr'in "reddedilmiş" isteklerinden gelen tampon kartları. restr ws-a'ya üye değil, kartlar yine de ws-a panosunda görünüyor. DB'ye bakınca yalnız 4, 6, 10, 11 ve 12 var; hepsi izinli ve canlı alanda. **DB tarafındaki düzeltme tutuyor**; açık yalnız tampon yolunda.

- **Etki ve sınır.** Satır süreç belleğinde duruyor, sunucu yeniden başlayınca kayboluyor. Aynı kiracıyla sınırlı (`getInMemoryOpportunities(tenantId)`) ve `manage_workspaces` rolü gerekiyor. Ama kartın DoD'u ("alan bulunamazsa ... satır bellek tamponuna da **yazılmıyor**") bu girdilerde tutmuyor. Aynı yol sınırsız bellek büyümesine de açık: her istek bir satır ekliyor, üst sınır yok.
- **Kök neden.** `catch` her hatayı "DB kesintisi" sayıyor, ve girdi tipi sorgudan önce doğrulanmıyor.
- **Önerilen düzeltme (ikisi birlikte, küçük):**
  1. `createOpportunity` başında şu kontrol: `typeof workspaceSlug !== 'string' || workspaceSlug.length > 200 || /[\u0000-\u001f]/.test(workspaceSlug)` → `WORKSPACE_REFUSED` (tx'ten önce). İstenirse `findScopedWorkspace` de string olmayan slug için `null` dönsün.
  2. Tampona yalnız bağlantı sınıfı hatalarda düşülsün. Doğrulama ya da kodlama hatası (Prisma `PrismaClientValidationError`, PG `22021`/`22P05`) reddedilsin.
  - Test: `{ workspaceSlug: {foo:1} }`, `"ws-a\u0000"` ve `7` için "reddedildi, tampona yazılmadı" (`getInMemoryOpportunities` boş).

### O-1 — ASCII dışı ya da boşluklu alan slug'ında sonsuz yönlendirme döngüsü, `default` takma adında 500 (bugün uygulama içinden tetiklenemiyor)
t8u'nun tek alanının slug'ı `çalışma alanı` (`ekler/probe83.txt`, kareler `shots/04-{tr,en}-t8u-redirect-loop.png`):
```
t8u tr: 307 -> /tr/%C3%A7al%C4%B1%C5%9Fma%20alan%C4%B1/cagrilar/… 307 -> /tr/calls/topic/… 307 -> /tr/%C3%A7al…  ⚠DÖNGÜ(8+ hop)
Chrome: net::ERR_TOO_MANY_REDIRECTS (tr ve en)
t8u /tr/default/cagrilar/…: 500   server.log: ⨯ TypeError: Invalid character in header content ["location"]
```
- **Neden.** Rota `new URL()` ile slug'ı yüzde-kodluyor. Detay sayfası `params.workspace`'i kodlu hâliyle alıyor (`%C3%A7…`), bu DB'deki slug'a eşit çıkmıyor ve sayfa rotaya geri yönlendiriyor. Döngü buradan doğuyor. `default` takma adında ise `redirect(getWorkspaceRoute(…, scoped.slug, …))` ham UTF-8 ve boşluk içeren bir `Location` başlığı yazmaya çalışıyor ve 500 veriyor.
- **Neden O, Y değil.** Uygulamada alan yaratan her kod yolu slug olarak `'default'` yazıyor: `auth.ts:504`, `oauth-registration.ts:286`, `scripts/beta-onboarding.ts:208`, `create-superadmin.ts`. Seed `main` kullanıyor. Alan yeniden adlandırma ya da oluşturma arayüzü yok ve DB'de slug karakter kısıtı yok. Bu yüzden bugün yalnız elle DB yazımıyla oluşuyor. Alan adlandırma UI'ı geldiği gün tetiklenir.
- **Öneri:** `resolveScopedWorkspace(scope, decodeURIComponent(workspace))` (try/catch ile). Ya da `getWorkspaceRoute` slug'ı `encodeURIComponent` etsin ve karşılaştırma iki tarafta aynı biçimde yapılsın. Ek olarak alan slug'ına `^[a-z0-9]+(-[a-z0-9]+)*$` kısıtı konabilir (`beta/roster.ts:63`'teki desen). Test: `callTopicTarget` + sayfa için ASCII dışı slug.

### Kabul edilenler (kanıtlı)

**2.1 Alan-bağımsız rota** (`probe83.txt` §A-C; kareler `01-*`, `02-*`, `03-*`):
```
kart linkleri: tr/en /calls topic=20 default=0; girişsiz HTML = restr HTML (aynı link)
anon  tr: 307 /tr/giris?callbackUrl=%2Ftr%2Fcalls%2Ftopic%2F…   en: /en/login?…
alice → /main   owner → /ws-a (en eski)   restr → /ws-b   restrc → /ws-b (silinmiş ws-c + var-olmayan id atlandı)
del → /yeni (silinmiş default atlandı)   t7u → /eski (en eski; gerçek 'default' alanı alias'ta öncelikli DEĞİL, rota null ile çağırıyor — tutarlı)
none / nomem / t5u / t6u → /no-workspace   (t6u: başka kiracının alan id'si kapsamı genişletmedi)
Cache-Control: private, no-store
/de/… → next-intl 404 · %00 → 404 · 201 karakter → 404 · 200 karakter → detay 404
..%2f..%2fevil, %2F%2Fevil.com, a%3Fx%3D1%23y, __proto__ → tek segment içinde kaldı, /tr/ws-b/cagrilar/<kodlu> 404 (origin dışı yok)
/TR/… → /tr/… → /tr/ws-b/… 200
```
**2.2 Detay sayfası URL slug'ına güvenmiyor** (`probe83.txt` §D, 44 satır, tr ve en). t8u dışında her durumda en fazla 2 hop, döngü yok:
```
restr ws-a|ws-c|default|WS-B → /ws-b 200 · restrc ws-c|default → /ws-b · del default → /yeni · owner ws-c|nope → /ws-a
t5u silik|canli → /no-workspace · t6u ws-a|kendi → /no-workspace · none|nomem default → /no-workspace
t7u default → 200 (gerçek default alanı, takma ad değil) · t7u eski → 200
```
**2.3 Yazma yalnız izinli canlı alana (DB).** Y-1 dışındaki 12 kurcalama ve 16 curl denemesinin hepsi ya reddedildi, ya da izinli canlı alana yazıldı. DB'de `CSFB83-%` satırlarının hepsi `deletedAt IS NULL` olan izinli bir alanda (`attack83.txt` sonu). Üyelik dışı, silinmiş, büyük harf, yabancı kiracı id'si ve ek `workspaceId`/`tenantId` alanları etkisiz.

**2.4 DOCX bozuk şablonlar** (`docx83.txt`, 22 durum; export ve editör `/tr/ws-b/konsept-notlar/<id>`):
```
labelKey yok / 7 / {x:1} / ["x","y"] / null / true → export 200 (Zip), başlık = key 'a'       ✔ Y-2 düzeldi
labelKey ""  → 200, boş başlık · labelKey "<img src=http://127.0.0.1:9/x>&\"'" → 200, metin olarak kaçışlı (SSRF yok)
key __proto__/constructor/toString → 200 "No content provided." · aynı key iki kez → 200 · key 1 → atlandı
schema "abc" / 42 / {sections:"x"} / {sections:{0:…}} → 200 (bölümsüz) · maxWords "yüz" → 200
content [] / "string" / {a:7} / {a:{html}} → 200 · m2 sayfası (ConceptNoteEditor .toLowerCase) → 200
content JSON null → export 500  (TypeError: Cannot read properties of null (reading 'a'))  → Ö-3
```

**2.5 callbackUrl açık yönlendirme, prod ve demo:**
- **Fuzz** (`cbfuzz.txt`, 54 varyant): `https://`, `HTTPS://`, `http:evil`, `//` `///` `////`, `/\`, `\/`, `\\`, tab/LF/CR, baştaki boşluk, NBSP, U+3000, U+2028, BOM, ZWSP, U+180E, dot segment (`/a/../..//`, `/.//`, `%2e%2e//`, `.%2e//`), `%2F`, `%5C`, `%09`, `%0d%0a`, `javascript:` (büyük/küçük), `data:`, `vbscript:`, tam genişlik `／` ve `＼`, `∕`, `⁄`, `/@evil`, `?next=//`, `#//`, NUL, DEL, U+0085. Sonuç **kaçan=0**; her çıktı `new URL(out, origin).origin === origin`.
- **Korunan çıktıların canlı zinciri** (`cbchain.txt`): 21 yolun hepsi 404 ya da aynı origin'de 200/307/308. Proxy ya da next-intl üzerinden ikinci derece bir yönlendirme de yok.
- **Prod Google yolu** (`redirprod83.txt`): şifre alanı 0. 11 varyantta `authjs.callback-url` hep `http://localhost:3583/…`. Kötü değerler `/tr/default/dashboard`'a iniyor; `redirect_uri` aynı origin.
- **Demo girişi, gerçek form** (`redirdev83.txt`, `redirdev83en.txt`, kareler `07-*`, `08-en-*`): tr 10 kötü varyant ve en 3 kötü varyant → `/{tr,en}/default/dashboard`. `blockedEvilNav=[]`, dialog yok. `/%2F%2Fevil.com` → aynı origin 404. Zincir de doğru: `/tr/calls/topic/…` → giriş → `/tr/main/cagrilar/…`; en'de `/en/main/calls/…`.

### Mutantlar (`mutants83.txt`, `mutants83-combo.txt`)
11 test dosyasında (değişen kodu içe aktaran her test) 19 mutant koşuldu, her birinden sonra dosya geri yüklendi (`src/tests` değişen dosya = 0).
- **Ölen 14:** tenantId filtresinin kaldırılması; açık slug aramasında üyelik ve deletedAt, ya da yalnız üyelik atlanması; alias'ın çözülmemesi; Cache-Control'ün kaldırılması; id sınırının gevşemesi; hedefte, callbackUrl'de ya da kart linkinde id'nin kodlanmaması; `labelKey != null`; boş geri düşüş; createOpportunity'nin üyeliği yok sayması; detayın 404'e gitmesi; retde tampona yazılması.
- **Yaşayan C5:** `orderBy`'dan `id` kırıcısının çıkarılması. Eşit `createdAt` için test yok (Ö-4).
- **Yaşayan C11–C14:** `safeCallbackUrl`'in katmanları; boşluk regex'i, ters bölü regex'i, `/\` ön-eki ve origin kontrolü tek tek kaldırıldı. Bunlar **eşdeğer**: dördü birlikte kaldırılınca fuzz yine 0 kaçış verdi ve testler 3 kırmızıyla yakaladı. Asıl güvence, fonksiyonun ham değer yerine ayrıştırılmış `pathname+search+hash` döndürmesi ve sondaki `//` kontrolü. Bunu bozan C20 (ham değer döndür) 4 kaçış verdi ve testlerce yakalandı (4 kırmızı).

### Kapılar (`gates.txt`, `build-routes.txt`)
```
tsc EXIT 0 · lint EXIT 0 · i18n EXIT 0
build EXIT 0 · ●=0 · ƒ /[locale]/calls/topic/[id] · ƒ /[locale]/[workspace]/cagrilar/[id] · ƒ /[locale]/[workspace]/calls/[id]
vitest run (tam, izole DB) → Test Files 1 failed | 284 passed | 6 skipped (291) · Tests 1 failed | 3498 passed | 90 skipped (3589)
  kırmızı: tests/rag-pdf-worker-isolation.test.ts "128 MB-inflating … fast" — 4839 ms > 3000 ms, yük ortalaması 51 (bu değişiklikle ilgisiz PDF süre testi)
  aynı dosya tek başına: Test Files 1 passed · Tests 25 passed (25)
```

## 3. Değişen dosyalar
- Yalnız bu rapor ve `docs/agent-results/TASK-MUO3BD4PCJLKI-cs-fb-ekler/`:
  - betikler: `probe83.sh`, `attack83.mjs`, `board83.sh`, `shots83.mjs`, `docx83.sh`, `redir*.mjs`, `cbfuzz.mts`, `mut83.py`, `dpsql`;
  - fikstür SQL'i: `fixtures83.sql`, `docx83.sql`;
  - ölçüm çıktıları (`*.txt`);
  - 37 kare (`shots/`).
- Oturum çerezleri ve action başlıkları eklenmedi (`eyJ` taraması 0). Kaynak kod değiştirilmedi.

## 4. Riskler
- **Pano alan kapsamlı değil (kapsam dışı, önceden var).** `pipeline/page.tsx:82-88` yalnız `{ tenantId, deletedAt: null }` ile okuyor. owner ws-a panosunda ws-b fırsatlarını (CSFB83-4, 6, 10) gördü, kısıtlı üye de tüm kiracının fırsatlarını görür. Yazma tarafı artık izinli alana kilitli ama okuma kiracı geneli. crw-fb'nin "(app) sayfaları `[workspace]`'i doğrulamıyor" riskinin somut hâli bu. Ayrı kart önerilir.
- **createOpportunity modül kapısına bakmıyor (kapsam dışı, önceden var).** T3 ve T7'de M5 `ModuleState` yok, yani OFF. T2'de de ilk denemelerde OFF'tu. Buna rağmen satırlar yazıldı (CSFB83-4, 6, 10, 11, 12), pano ise "Bu modül şu anda kullanılamıyor" gösteriyordu. Action'da yalnız `assertTenantActionWritable` + rol kontrolü var.
- Y-1'deki tampon sınırsız büyüyebilir (bellek DoS'u). Ayrıca tampona `workspaceSlug` olarak nesne ya da sayı yazılıyor; bunu okuyan kod string bekliyor.

## 5. Açık sorular
- Y-1'de tampon yolu tamamen kaldırılsın mı? Belge "DB kesintisi yedeği" diyor. Kesintide üyelik kontrolü de yapılamıyor, yani her tampon satırı zaten doğrulanmamış bir alana gidiyor.
- O-1 için alan slug'ına karakter kısıtı istiyor muyuz, yoksa yalnız kod/çöz yeterli mi?

## 6. Sonraki adım
1. **Düzeltme kartı (crw-fb):** Y-1 (tip ve kontrol karakteri doğrulaması + tampona yalnız bağlantı hatasında düşme + 3 test); tercihen O-1 ve Ö-4 de aynı kartta.
2. **Ayrı kartlar:** pano ve (app) okumalarını `[workspace]` ile kapsamak; `createOpportunity` için M5 modül kapısı.
3. **Bilgi notları:**
   - **Ö-3:** `ConceptNote.content` JSON `null` olunca export 500 veriyor (`export/route.ts:82` `content[section.key]`). Bu değer yalnız doğrudan DB yazımıyla oluşuyor, çünkü Prisma zorunlu Json alanında `null`'ı reddediyor. `content ?? {}` yeterli. `m2/server/actions.ts:210`'da da aynı kalıp var.
   - **Ö-4:** eşit `createdAt` için id kırıcısını tutan bir test.
4. **Temizlik:** kendi `next start` (:3583) ve `next dev` (:3584) süreçlerim durduruldu. `csfb83-pg` konteyneri ve `wt83` worktree'si silindi (`docker rm -f`, `git worktree remove`). Paylaşılan `:5433`'e hiç dokunulmadı.

**Sonuç dosyası yolu notu:** Görev ekindeki "KANIT ZORUNLU" satırı `/Users/macbook/alan/docs/agent-results/TASK-MUNYY62H1L86X-fe-fb.md` yolunu veriyordu. Bu, incelenen zincirdeki fe-fb raporunun adı ve FONBRIDGE reposunun dışında. Başka ajanın raporunun üzerine yazmamak için görev gövdesindeki SONUÇ DOSYASI yolu kullanıldı: `FONBRIDGE/docs/agent-results/TASK-MUO3BD4PCJLKI-cs-fb.md`.
