# TASK-MUNYY62H1L86X — fe-fb — FB İNCELEME-76: /calls düzeltmesi (TASK-MUNWZGWA70P16, crw-fb) bağımsız inceleme

**Durum:** TAMAM
**Karar:** **DÜZELTME GEREKLİ.** B-1, B-4 ve B-5 kabul. B-2'nin girişsiz akışı patron kararına uyuyor, ama sabit `default` çalışma alanı iki senaryoda fırsatı **yanlış alana** yazıyor (Y-1). B-3'te bir kalıntı var: DOCX dışa aktarımı hâlâ 500 veriyor (Y-2).
**İncelenen:** fix `658e881b` ve dev merge `90916d9d`. İnceleme worktree'si dev `f6cb125a` (detached), `$SCRATCH/wt76`. Kod değiştirilmedi.
**Platform beyanı:** Yalnız **macOS**'ta doğrulandı (Darwin 27, Chrome 1280×900 Playwright ile, `next build` ve `next start -p 3476` prod build, izole `pgvector:pg16` konteyneri `fefb76-pg` :55476). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız mac var. İncelenen kod yollarının hiçbiri platforma bağlı değil: URL üretimi, `Object.hasOwn`, Auth.js yönlendirme doğrulaması, Prisma sorgusu, JSON süzgeci, `next.config` görsel deseni. Süreç, dosya yolu, kabuk ya da ikili adı yok. Bulguların diğer platformlarda da aynı çıkması beklenir. Y-2 kapsamı dışında kalan dışa aktarım hatası Node'un `Headers` ByteString kuralından geliyor, o da platformdan bağımsız.

## 1. Ne yapıldı
- Paylaşılan `:5433`'e yazmadan kendi DB'mi kurdum, CI sırasını izledim: push, rls-role, migrations ×2, rls, seed (`wt76-dbprep.txt`). Prod build aldım (`●=0`) ve `next start` ile ayağa kaldırdım.
- Seed'e ek olarak iki test kiracısı kurdum (SQL, `fefb76-*`):
  - **T2 (çok alanlı):** `ws-a` (önce oluşturuldu) ve `ws-b`. `owner76` kısıtsız TENANT_OWNER. `restr76` PIPELINE_MANAGER, `Membership.workspaceIds = {ws-b}`, yani **yalnız B alanına** yetkili.
  - **T3:** `default` slug'lı alan **soft-deleted**, etkin alan `yeni`. `del76` TENANT_OWNER.
  - Seed kullanıcısı `alice`'in alan slug'ı `main` (`default` değil).
- Giriş, prod'da Credentials kapalı olduğu için imzalı `authjs.session-token` çereziyle yapıldı (`next-auth/jwt encode`). Token yalnız `id` ve `email` taşıyor; kiracı, rol ve `workspaceIds` her istekte `jwt` callback'inde DB'den okunuyor, yani gerçek üyelik geçerli.
- Gerçek tarayıcıda tıkladım: /calls, kart, giriş, detay, "Fırsatlara Ekle", pano (tr/en). Ardından DB'de fırsatın hangi alana yazıldığını okudum.
- callbackUrl ile açık yönlendirme denemeleri yaptım: prod'da Google OAuth yolu; dev'de ayrı bir `next dev -p 3477` örneğinde demo Credentials yolu (AuthCard `window.location.href = rawCallbackUrl`).
- B-3'ü canlı denedim (şablon ve concept note SQL ile, editör ve `/api/concept-notes/<id>/export`). B-5'i canlı denedim. B-4 regex'ini okudum.
- 13 mutant yazdım, tam kapıları koştum.

## 2. Bulgular

### Y-1 — `default` alanı: fırsat üyeliğin dışındaki alana ve silinmiş alana yazılıyor (DÜZELTME GEREKLİ)
Kart linki `publicCallDetailHref` her kullanıcıyı `/{locale}/default/cagrilar/<id>` adresine gönderiyor. Detay sayfası ve `(app)` layout'u slug'ı doğrulamadığı için sayfa herkese **200** dönüyor, 404 çıkmıyor. Sorun "Fırsatlara Ekle"de. `AddToPipelineButton`, URL'deki `default`'u `createOpportunity({ workspaceSlug })`'a veriyor. `pipeline/actions.ts:231-239` slug `default` olunca alan filtresini tamamen kaldırıyor ve `tx.workspace.findFirst({ where: { tenantId } })` çalıştırıyor. Bu sorguda `deletedAt: null` yok, `workspaceIdFilter(scope.workspaceIds)` yok, `orderBy` yok.

Canlı ölçüm (`walk76.txt`; kareler `03-*`, `04-*`):
```
kullanıcı  kiracı       alan(lar)                   fırsat nereye yazıldı      doğru mu
alice      demo-tenant  main                        main (silinmemiş)          ✔ (tek alan)
owner76    fefb76-t2    ws-a, ws-b (kısıtsız)       ws-a                       ~ (keyfi "ilk" alan; kullanıcı ws-b'de olabilir)
restr76    fefb76-t2    YALNIZ ws-b                 ws-a  ws_deleted=f         ✘ üyeliğin DIŞINDAKİ alan
del76      fefb76-t3    default(SİLİNMİŞ), yeni     default  ws_deleted=t      ✘ SİLİNMİŞ alan (fırsat panoda görünür ama silinmiş alana bağlı)
```
Dört kullanıcının hepsinde detay 200 döndü ve `/tr/default/firsatlar`'a yönlendirme oldu; `pageerrors: []`.

- **Kök neden iki katmanlı.** (1) Link çalışma alanını bilmeden sabit `default` yazıyor. (2) `createOpportunity` "default = ilk alan" geri düşüşünü üyelik ve silinme durumuna bakmadan uyguluyor. İkinci katman önceden de vardı; `AuthCard`'ın varsayılan dönüşü `/default/dashboard` da aynı yola çıkıyor. Ama bu değişiklik herkese açık /calls'taki **her** kartı bu yoldan geçiriyor. `/tr/ws-b/...` üzerinde çalışan bir kullanıcı bile karta tıklayınca `default`'a atılıyor.
- **Önerilen çözüm (ikisi birlikte):**
  1. **Alan-bağımsız yönlendirme rotası.** Örneğin `src/app/[locale]/cagri/[id]/route.ts` (en: `call/[id]`), `(app)` dışında, route handler olarak:
     - `auth()` yoksa `302 /{locale}/{giris|login}?callbackUrl=/{locale}/cagri/<id>` (kendini gösterir, slug içermez).
     - Varsa `listSessionWorkspaces(session)` çağrılır (zaten `deletedAt: null` ve `workspaceIdFilter` uyguluyor). Son kullanılan ya da ilk izinli slug seçilir, `302 /{locale}/{slug}/cagrilar/<id>`.
     - Liste boşsa `/{locale}/no-workspace`.
     - `publicCallDetailHref` girişli ve girişsiz durumda bu rotayı döndürür. `signedIn` parametresi ve herkese açık sayfadaki `auth()` çağrısı gereksiz kalır.
  2. **`createOpportunity`.** `'default'` özel durumunda da, açık slug'da da alanı `deletedAt: null` ve `workspaceIdFilter(scope.workspaceIds)` ile ara. Açık bir slug üyeliğin dışındaysa reddet, `orderBy: { createdAt: 'asc' }` ekle. Bu, AuthCard'ın `/default/dashboard` varsayılanından gelen aynı hatayı da kapatır.
- Aynı kök neden `opportunities/[id]/matching` ve `m2` sayfalarında da var: bu sayfalar `workspace: { slug }` ile sorguluyor, bu yüzden `main` kiracısında `/default/...` 404 verir. Ancak uygulama içinde bu iki rotaya link yok, yalnız URL ile ulaşılıyor. Bilgi olarak not ediyorum.

### Y-2 — B-3 kalıntısı: `labelKey` doğrulanmıyor, DOCX dışa aktarımı 500 veriyor
`isSection` yalnız `key` alanına bakıyor. Dışa aktarım (`export/route.ts:81`) ise `escapeHtmlText(section.labelKey)` çağırıyor, bu da `.replace` kullanıyor. crw-fb'nin testi (`{ key:'a', labelKey:'A' }`) bu durumu kapsamıyor. Canlı ölçüm (`b3-live.txt`, ASCII başlıklı fırsat):
```
cn2-null      schema [null]                                  editor=200  export=200   ✔ B-3 düzeldi
cn2-nolabel   {"sections":[{"key":"a","maxWords":100}]}      export=500   ⨯ TypeError: Cannot read properties of undefined (reading 'replace')
cn2-numlabel  {"sections":[{"key":"a","labelKey":7,...}]}    export=500   ⨯ TypeError: e.replace is not a function
cn2-ok        {"key":"a","labelKey":"A","maxWords":100}      export=200   (Zip archive = gerçek DOCX)
```
Editör 4 durumda da 200 dönüyor. `labelKey` eksik olduğunda başlık yalnız boş kalıyor.
**Öneri:** `isSection`'a `typeof labelKey === 'string'` şartını ekle, ya da dışa aktarımda `escapeHtmlText(String(section.labelKey ?? section.key))` kullan. Mutant N12 (labelKey'i zorunlu yapan sürüm) mevcut 44 testin hepsinden geçti, yani bu sıkılaştırma mevcut sözleşmeyi bozmuyor. `[{key:'a'}]` ve `[{key:'a', labelKey:7}]` için bir dışa aktarım testi eklenmeli.

### D-1 — AuthCard açık yönlendirmesi: prod'da kapalı, demo girişi açık ortamda açık
- **Prod'da kapalı olduğu canlı gösterildi.** `/tr/giris?callbackUrl=https://evil.com` HTML'inde e-posta ya da şifre alanı yok (0). Tek yol Google butonu. `loginWithCredentialsAction` `isDemoLoginEnabled()` değeri false olduğu için hata dönüyor (`BUILT_FOR_PRODUCTION` build'e gömülü). Google yolunda Auth.js varsayılan `redirect` callback'i hepsini aynı origin'e indiriyor (`redir76-prod.txt`, `authjs.callback-url` çerezi):
```
https://evil.com/x                  -> http://localhost:3476
//evil.com/x                        -> http://localhost:3476//evil.com/x   (aynı origin, yol)
/\evil.com/x                        -> http://localhost:3476/\evil.com/x   (tarayıcı '/'e çevirir, aynı origin)
javascript:alert(document.domain)   -> http://localhost:3476
http://localhost:3476@evil.com/     -> http://localhost:3476
HTTPS://EVIL.COM · data:text/html,… -> http://localhost:3476
meşru /tr/default/cagrilar/…        -> http://localhost:3476/tr/default/cagrilar/…   redirect_uri=…/api/auth/callback/google
```
- **Demo girişi açık bir ortamda (dev, staging, pilot demo) açık yönlendirme var.** Canlı ölçüm, `next dev` ve `DEMO_LOGIN_ENABLED=true` ile (`redir76-dev.txt`, kare `09-dev-demo-evil.png`):
```
https://evil.com/x  -> finalUrl https://evil.com/x   ✘
//evil.com/x        -> finalUrl http://evil.com/x    ✘
javascript:alert(…) -> dialog yok. CSP `script-src 'self' 'nonce-…' 'strict-dynamic'` javascript: URL'ini engelliyor
```
  Bu değişiklik herkese açık sayfalara `callbackUrl` parametresi taşıyan linkler koydu. Demo ortamında `?callbackUrl=https://evil…` taşıyan bir linkle oltalama yapılabilir. **Öneri (ayrı kart, düşük/orta):** AuthCard'da `safeCallbackUrl(raw)` kullanılsın: `/` ile başlasın, `//` ya da `/\` ile başlamasın, `new URL(raw, location.origin).origin === location.origin` olsun, aksi halde `/${locale}/default/dashboard`. Aynı süzgeç D-2'yi de çözer.

### D-2 — Başında boşluk olan callbackUrl, Auth.js "Configuration" hata sayfasına düşüyor
`callbackUrl=" //evil.com"` ile Google'a tıklanınca istek `/api/auth/hata?error=Configuration`'a gidiyor. Sunucu logunda `[auth][error] TypeError: Invalid URL` var. Yönlendirme yok, güvenlik açığı değil, ama kullanıcı giriş yapamıyor. D-1'deki süzgeç bunu da çözer.

### D-3 — Test boşlukları (mutantlar)
`mutants76.txt`, 5 test dosyası, 44 test, her mutanttan sonra dosya geri yüklendi, `git temiz: ''`:
```
N2 callbackUrl encode yok: ÖLDÜ · N3 tr giriş /tr/login: ÖLDÜ · N6 boş key kabul: ÖLDÜ · N7 maxWords>=0: ÖLDÜ
N9 kart topic.id: ÖLDÜ · N10 regionOf toLowerCase: ÖLDÜ · N11 'default'→'main': ÖLDÜ
N4 region sayfası `signedIn = Boolean(...) || true`: SAĞ   ← statik regex alt-dizgi eşliyor
N5 liste sayfası  `signedIn = Boolean(...) || true`: SAĞ   ← girişsiz kullanıcı callbackUrl'siz detaya gider → layout /giris'e atar, dönüş kaybolur (B-2 regresyonu yakalanmaz)
N1 generateMetadata regionOf'u atlıyor: SAĞ              ← metadata'nın regionOf kullandığını sabitleyen test yok (canlı: 404 + noindex doğru)
N8 editor Number.isFinite yok: SAĞ                        ← eşdeğer sayılabilir: JSON Infinity/NaN taşıyamaz
N12 isSection labelKey zorunlu: SAĞ                        ← Y-2 önerisi mevcut testlerle uyumlu
N13 no-ssg regex'i değiştirildi: SAĞ                       ← guard regex'inin kendisi örnek girdilerle test edilmiyor
```
- B-4 regex'inin bir kaçağı var: `export const revalidate = 0.5` guard'dan geçer. Sebep: `(?!0\b…)` kısmında `0` ile `.` arasında kelime sınırı var, lookahead eşleşiyor ve dosya muaf sayılıyor. Pratikte düşük risk. Öneri: regex'i `[1-9]|0\.\d*[1-9]` ile yaz ve regex'e bir örnek tablo testi ekle.
- N4 ve N5 için öneri: Y-1 çözümüyle `signedIn` kalkacağı için gereksiz olur. Kalırsa statik regex satır sonuna sabitlenmeli (`…?\.user\);$`, m bayrağıyla).

### Kapsam dışı — Y (ayrı kart önerisi): Türkçe başlıklı fırsatta DOCX dışa aktarımı her zaman 500
`export/route.ts`, `Content-Disposition: attachment; filename="${opportunity?.title}.docx"` başlığına ham başlığı koyuyor. Latin-1 dışındaki bir karakter (ş=351, ğ, ı, İ, —=8212) Node `Headers`'ta hataya yol açıyor ve yanıt 500 dönüyor. Canlı ölçüm:
```
cn3-ok   başlık "Güneş Enerjisi Projesi"               export=500  ⨯ TypeError: Cannot convert argument to a ByteString because the character at index 26 has a value of 351
cn-ok    başlık "District renovation pilot — İzmir"    export=500  (seed fırsatı demo-opp-1, index 48 = '—')
cn2-ok   başlık "ASCII Opp"                            export=200
```
Türk kullanıcıların çoğu için dışa aktarım çalışmıyor. Başlıkta `"` olursa header da kırılır. **Öneri:** `filename="<ASCII yedek>"; filename*=UTF-8''<encodeURIComponent(title)>` (RFC 6266/5987). Bu değişiklikten gelmiyor, önceden vardı.

### Kabul edilenler
- **B-1 ✔** — 9 anahtar × tr/en = 18/18 **404** (constructor, `__proto__`, toString, hasOwnProperty, valueOf, isPrototypeOf, propertyIsEnumerable, toLocaleString, `__defineGetter__`). Tarayıcıda da doğrulandı: `{"path":"/tr/calls/constructor","status":404,"title":"Sayfa Bulunamadı — FonBridge","robots":"noindex"}`, en/`__proto__` için de aynı (kareler `05-*`). Meşru bölgeler (germany, france, turkey) 200; TURKEY ve eu 404. Bilgi: `/tr/calls/germany%20` 200 döndü ("Almanya"). Bu prototip anahtarı değil, Next'in segment normalizasyonu olabilir. Araştırılmadı.
- **B-2 (patron kararı) ✔ girişsiz akış** — /tr/calls, /en/calls, /tr/calls/germany ve /en/calls/germany üzerinde 20+20+18+18 = **76 link, hepsi 200**. Eski `/calls/<ID>` biçiminde link 0. Tıklama `/tr/giris?callbackUrl=%2Ftr%2Fdefault%2Fcagrilar%2F…` ve `/en/login?callbackUrl=…` adreslerine gidiyor. Giriş sonrası detay 200 (tr "Innovation Ecosystems", en aynı; kareler `01-*`, `02-*`). Girişli dört kullanıcıda da kart → detay 200. **Tek sorun alan seçimi (Y-1).**
- **B-3 ✔ (Y-2 dışında)** — `[null]` şema artık editörde 200, dışa aktarımda 200 (ASCII başlıkla).
- **B-4 ✔** — guard page ve layout için `force-static`, `error` ve pozitif `revalidate` değerlerini reddediyor. `0.5` kaçağı D-3'te.
- **B-5 ✔** — canlı (`b5-live.txt`): `lh3…:8443` → 400 "not allowed" 0.003 s, `unsplash:8080` → 400, `evil.com` → 400, `lh3…:443` (varsayılan port) → izinli.

## 3. Kanıt — kapılar (dev `f6cb125a`, izole DB)
```
DB prep: prisma db push 0 · db:rls-role 0 · apply-migrations ×2 0 · db:rls 0 (Policies 28 → 112) · db:seed 0
tsc EXIT 0 · eslint EXIT 0 · i18n EXIT 0 (✅ i18n check passed …)
build EXIT 0 · ●=0 · ƒ /[locale]/calls · ƒ /[locale]/calls/[region] · ƒ /[locale]/[workspace]/cagrilar/[id]
vitest EXIT 1 → Test Files 1 failed | 276 passed | 6 skipped (283) · Tests 1 failed | 3332 passed | 81 skipped (3414)
  × src/lib/agency/report.test.ts "property: 300 random tables" — Error: Test timed out in 120000ms
  aynı dosya tek başına: Tests 16 passed (16), Duration 92.64s (tests 87.25s)
```
Tek kırmızı, yük altındaki bir zaman aşımı flake'i. Makinede çok sayıda ajan ve konteyner çalışıyordu. /calls değişikliğiyle ilgisi yok. Ancak test tek başına 87 s sürüyor ve 120 s sınırına yakın; takipte `testTimeout` ya da örneklem boyutu gözden geçirilmeli.

Ekler: `docs/agent-results/TASK-MUNYY62H1L86X-fe-fb-ekler/` altında 15 kare (tr/en), `probe76-1.txt`, `walk76.txt` (DB tablosu dahil), `redir76-prod.txt`, `redir76-dev.txt`, `b3-live.txt`, `b5-live.txt`, `mutants76.txt`, `vitest-summary.txt`, `build-routes.txt`, `wt76-dbprep.txt` ve betikler (`probe76.sh`, `walk76.mjs`, `redir76*.mjs`, `mut76.py`). Oturum çerezleri eklere konmadı.

## 4. Değişen dosyalar
Yalnız bu rapor ve `TASK-MUNYY62H1L86X-fe-fb-ekler/`. Kod değiştirilmedi.

## 5. Riskler
- Y-1 bir veri bütünlüğü ve yetki kapsamı sorunu. Kısıtlı üye kendi alanı dışındaki bir alana fırsat yazabiliyor, ve silinmiş alana satır bağlanabiliyor. Kiracılar arası sızıntı **yok**: tüm sorgular `tenantId` ve `withTenant` ile sınırlı.
- D-1 yalnız demo girişi açık ortamlarda geçerli. Staging ya da pilot demo URL'si dışarıya açıksa gerçek bir oltalama yüzeyi olur.

## 6. Açık sorular
- Y-1 için alan seçimi: çok alanlı kullanıcıda "son kullanılan alan" mı (çerez ya da DB), yoksa "ilk izinli alan" mı? Öneri: şimdilik ilk izinli alan (alfabetik, `listSessionWorkspaces` sırası), ileride son kullanılan.

## 7. Sonraki adım
1. crw-fb için Y-1 ve Y-2 düzeltme kartı: yönlendirme rotası, `createOpportunity` alan süzgeci, `isSection` labelKey şartı ve testler (N4/N5/N13 boşlukları dahil).
2. Ayrı kartlar: D-1/D-2 `safeCallbackUrl` (düşük/orta); DOCX `Content-Disposition` UTF-8 (Y, kapsam dışı); `report.test.ts` zaman aşımı payı.
3. Temizlik yapıldı: kendi `next start` sürecim durduruldu, `fefb76-pg` konteyneri ve `wt76` worktree'si silindi. Paylaşılan `:5433`'e ne okuma ne yazma yapıldı.
