# TASK-MULQLF067H75P — K4 outreach: dış arama derin linkleri + tr/en e-posta şablonları (cs-fb)

**Durum:** kod bitti ve commit'lendi (`d53c115b`). Birim testleri, mutantlar, typecheck, lint, i18n ve temiz worktree build'i geçti. **Tarayıcıda gerçek tıklama kareleri ALINAMADI.** AgentSpace kill-guard (R8) Playwright koşumunu engelledi. Kullanıcı onay verdi, ama guard `MURAT_LIVE_OK=1` önekli komutu da reddetti (TASK-MULQL8QB679LQ fe-fb'de de aynısı oldu). Spec hazır ve commit'li. Kullanıcının çalıştıracağı tek satırlık komut "Sonraki adım" bölümünde.

## 1) Ne yapıldı

**Yer:** M1 ortak kartı `src/app/[locale]/(app)/[workspace]/partners/[pic]/page.tsx`. İstatistiklerin altına, "Geçmiş AB Projeleri"nin üstüne iki bölüm eklendi. Sayfa zaten `moduleGate('M1', locale)` ile korunuyor. `BUSINESS_MODEL.md §5.1`'e göre K4 outreach, M1 ile aynı plan olan **Ekip** planında geliyor. Bu yüzden ayrı bir K4 bayrağı açmadım, mevcut M1 kapısını kullandım. Modül kapalıysa ya da plan kapsamıyorsa sayfa bu bölümlere hiç gelmeden kilit ekranını döner.

**1. "Dış kaynaklarda ortak ara"** — saf üretici `src/modules/m1/outreach.ts` → `buildPartnerSearchLinks()`. URL'leri 30.09.2026'da resmî sitelerde doğruladım:

| Kaynak | URL | Sorgu | Doğrulama |
|---|---|---|---|
| F&T Portal Partner Search | `ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/partner-search?keywords=<kurum adı>` | var | Headless Chrome: SPA URL'yi `…?keywords=Fraunhofer&isExactMatch=true&type=ORGANISATION,PERSON…` biçimine genişletti ve arama kutusu `Fraunhofer` ile doldu |
| EEN partnering | `een.ec.europa.eu/partnering-opportunities` | **yok** → kopyalanabilir metin (konu + İngilizce ülke adı) | Süzgeç formu `method="post"` (oe-list-pages). `?keywords=hydrogen` ile açınca `node_partnering_opportunities_keywords` alanı boş kaldı |
| Ideal-ist | `www.ideal-ist.eu/partner-search?topic_id=<konu kodu>` | var (konu seçiliyse) | Süzülmemiş sayfa 50 satır, `topic_id=zzzz` 0, `title=energy` 48 satır. Parametre gerçekten süzüyor |
| GREENET | `greenet-partner-search-tool.b2match.io/` | **yok** → kopyalanabilir metin | Resmî NCP portalındaki "Join the community" bağlantısı (`horizoneuropencpportal.eu/ncp-networks/cluster-5/greenet-partner-search-tool`), 200 |
| LinkedIn | `www.linkedin.com/search/results/companies/?keywords=<kurum adı>` | var | Girişe yönlendiriyor ve sorguyu `session_redirect` içinde koruyor |

- Her bağlantı `target="_blank" rel="noopener noreferrer"` ile açılıyor ve `aria-label="… (yeni sekmede açılır)"` taşıyor.
- **Kişisel veri URL'ye girmiyor.** Yalnız kurum adı, ülke ve konu kullanılıyor. `sanitizeQueryText()` e-posta benzeri parçaları ve en az 9 rakamlı telefon benzeri dizileri siliyor. Kelimeye bitişik rakam dizilerine dokunmuyor, yani `HORIZON-CL5-2024-D3-01-05` ve `HORIZON-MSCA-2021-101072345` bozulmuyor. Metin 200 karakterle sınırlı. Kodlama `encodeURIComponent` ile yapılıyor.
- Konu listesi: kurumun CORDIS katılımlarındaki `CordisProjectTopic` kayıtlarından, en sık görülenden başlayarak en çok 15 konu. Kullanıcı seçer ya da "Konu seçilmedi" der.

**2. İlk temas e-posta şablonları** — konsorsiyum daveti, bilgi isteği ve takip; tr ve en. Yer tutucular: `{institution}` (kurum adıyla dolu gelir), `{callCode}` ve `{projectTitle}`. Boş bırakılan yer tutucu metinde görünür kalır, böylece kullanıcı neyin eksik olduğunu görür. Şablon dili UI dilinden bağımsız seçilebiliyor, çünkü Türkçe arayüzden yabancı bir ortağa yazılabilir. Sayfa iki kataloğu da `getTranslations(...).raw('templates')` ile okuyor. "Metni kopyala" düğmesi konu ve metni panoya koyuyor. "E-posta programında aç" `mailto:?subject=…&body=…` açıyor: **alıcı boş**, RFC 6068 kodlaması, satır sonları `%0D%0A`. Uygulama e-posta **göndermiyor**.

**3. i18n** — `PartnerOutreach` isim alanı tr ve en'de aynı anahtarlarla eklendi (her dilde 69 satır). Yeni bileşende sabit metin yok. `i18n-baseline.json` değişmedi, baseline artmadı.

**4. 390px** — bağlantı kartları `flex-wrap` kullanıyor, kopyalanan metin `break-all`, form `grid-cols-1 sm:grid-cols-2`. E2E spec'te kaydırma taşması testi var (`scrollWidth - clientWidth <= 0`). **Bu test koşulamadı** (bkz. 2c).

## 2) Kanıt

**a) Hedefli vitest** (`npx vitest run src/modules/m1/outreach.test.ts`):
```
 Test Files  1 passed (1)
      Tests  14 passed (14)
```
Kapsam: 5 kaynak sırası; F&T/LinkedIn encode (`&` → `%26`, Türkçe karakterler UTF-8); Ideal-ist `topic_id`; EEN/GREENET kopyalama metni `Hydrogen valleys Germany`; konu yoksa çıplak sayfa; hatalı ülke kodunun yok sayılması; **kişisel veri testi** (e-posta ve iki telefon biçimi hiçbir URL'de ve kopyalama metninde yok); konu kodlarının korunması; 200 karakter sınırı; `fillTemplate`; `buildMailto` (alıcı boş, CRLF).

TDD notu: ilk koşuda "konu kodu bozulmuyor" testi **kırmızıydı**. İlk telefon deseni `HORIZON-CL5-2024-D3-01-05` kodunun `3-01-05` kuyruğunu siliyordu. Deseni kelime sınırı ve en az 9 rakam şartıyla düzelttim.

**b) Mutantlar** — `outreach.ts`'e 10 elle mutasyon; her birinden sonra aynı test dosyası koşuldu ve dosya geri yüklendi (`diff -q` → restored):
```
[M1 e-posta silme kaldırıldı]      1 failed | 13 passed
[M2 telefon silme kaldırıldı]      1 failed | 13 passed
[M3 kelime sınırı kaldırıldı]      14 passed   ← ilk turda SAĞ kaldı → test eklendi (HORIZON-MSCA-2021-101072345)
[M3 tekrar]                        1 failed | 13 passed
[M4 URL encode kaldırıldı]         3 failed | 11 passed
[M5 CRLF kaldırıldı]               1 failed | 13 passed
[M6 mailto'ya alıcı eklendi]       1 failed | 13 passed
[M7 boş yer tutucu siliniyor]      1 failed | 13 passed
[M8 F&T parametre adı q]           3 failed | 11 passed
[M9 ülke adı dili tr]              1 failed | 13 passed
[M10 uzunluk sınırı kaldırıldı]    1 failed | 13 passed
```
Son durum: 10/10 mutant kırmızı.

**c) Tarayıcı (e2e) — KOŞULAMADI.** `tests/e2e/m1-partner-outreach.spec.ts` yazıldı ve commit'lendi. Kendi fikstürünü kuruyor ve kendi id'leriyle siliyor (`K4E2E-PIC-1`, `K4E2E-PROJ-1`). tr ve en için şunları doğruluyor:
- 5 bağlantının host'u, `target` ve `rel` değerleri, href'lerde `@` olmaması;
- F&T bağlantısına **gerçek tıklama** → yeni sekme `ec.europa.eu` ve `window.opener === null`;
- EEN "Kopyala" → panoda `Hydrogen valleys Germany`;
- e-posta alanlarını doldurma, dil değiştirme, "Takip" seçimi, "Metni kopyala" → panoda proje başlığı ve kurum adı;
- `mailto:?subject=` biçimi;
- 390px'te yatay kaydırma olmaması.

Kareler `docs/agent-results/TASK-MULQLF067H75P-screenshots/` altına yazılacak: `01-outreach-{tr,en}`, `02-email-{tr,en}`, `03-outreach-tr-390`, `04-email-tr-390`. Guard çıktısı:
```
⛔ AgentSpace kill-guard [R8-canli-app-varken-acilis] — bu komut ÇALIŞTIRILMADI. … (bu komut: e2e/duman koşumu)
```
Bu, kullanıcı onayından sonra `MURAT_LIVE_OK=1 …` ile koşulan komutta da aynı çıktıyı verdi. Guard'ı başka bir komut biçimiyle dolanmaya çalışmadım.

**d) Kapılar** — temiz worktree: `git worktree add --detach … HEAD`, yalnız bu kartın 7 dosyası kopyalandı, `pnpm install --frozen-lockfile --offline`, `pnpm db:generate`:
```
tsc exit=0
lint exit=0          (eslint src/modules/m1, partners/, spec)
i18n exit=0
build exit=0         ├ ƒ /[locale]/[workspace]/partners/[pic]
```
Ana ağaçta `pnpm i18n:check`:
```
Literals found: 312 in 36 file(s) · Baseline allows: 314 in 36 file(s)
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
```
Buradaki 2'lik fark `admin/settings/page.tsx` 9 → 7. Bu başka bir ajanın işi; baseline'a dokunmadım.

## 3) Değişen dosyalar
- `src/modules/m1/outreach.ts` (yeni): saf URL, kişisel veri temizliği, şablon ve mailto üreticileri
- `src/modules/m1/outreach.test.ts` (yeni): 14 test
- `src/modules/m1/ui/PartnerOutreach.tsx` (yeni): istemci bileşeni
- `src/app/[locale]/(app)/[workspace]/partners/[pic]/page.tsx`: konu sorgusu, iki dilin şablonları, bileşenin yerleşimi
- `messages/tr.json`, `messages/en.json`: `PartnerOutreach` isim alanı
- `tests/e2e/m1-partner-outreach.spec.ts` (yeni)
- `docs/ROADMAP.md`: E9 K4 satırına "güncel 30.09" notu
- Paralel ajanların dosyalarına dokunulmadı: `src/modules/m8` (se-fb) ve ağaçtaki commit'lenmemiş `src/modules/m11/*` ile `docs/SMTP-SUNUCU.md`.

## 4) Riskler
- **Dış sitelerin URL biçimi değişebilir.** Bu durumda bağlantı yine siteye gider, yalnız ön doldurma kaybolur. Adresler `PARTNER_SEARCH_BASE_URLS` içinde tek yerde toplu.
- **EEN ve GREENET bot korumalı.** curl/WebFetch 403 aldı, gerçek Chrome 200 aldı. Kullanıcı tarayıcısı için sorun değil.
- LinkedIn ve GREENET üyelik ya da giriş istiyor. Bu, ipucu metninde yazıyor.
- Ideal-ist Küme 4 (dijital), GREENET Küme 5 odaklı. Başka kümelerdeki konu kodlarıyla Ideal-ist 0 sonuç dönebilir. İpucu metinleri bunu söylüyor.
- Ortak kartı hâlâ sayfa içi `isTr ? … : …` metinleri kullanıyor (eski desen, bu kartın kapsamı dışında). Yeni kod yalnız `t()` kullanıyor.

## 5) Açık sorular
- EEN ve GREENET için sorgu parametresi desteği ileride eklenirse ön doldurma açılabilir. Şimdilik kopyalanabilir metin kullanılıyor.
- Şablonlara imza ya da gönderen kurum adı otomatik gelsin mi (çalışma alanı profili)? Bugün `[Adınız Soyadınız]` / `[Kurumunuz]` yer tutucusu duruyor. Bu, kişisel veriyi şablona otomatik taşımamak için bilinçli bir seçim.

## 6) Sonraki adım
Tarayıcı koşumunu kullanıcının kendi oturumunda başlatması gerekiyor, çünkü guard yalnız kullanıcının kendi komutunu kabul ediyor. FONBRIDGE kökünde, :3000 boşken çalıştırın; Playwright kendi dev sunucusunu açar ve fikstürü kendi id'leriyle siler:
```
! cd /Users/macbook/alan/FONBRIDGE && E2E_SHOTS_ROOT=docs/agent-results npx playwright test tests/e2e/m1-partner-outreach.spec.ts
```
Sonra kareler bu rapora eklenir ve kart `review`'a alınabilir.

## Platform beyanı
- Doğrulama **macOS** (Darwin 27, zsh, Node 26.5) üzerinde yapıldı: birim test, mutantlar, tsc, lint, i18n, temiz build ve dış URL'ler (curl + headless system Chrome).
- Dokunulan kod yolu platforma bağlı değil. Süreç, dosya yolu, kabuk, kısayol ya da DPI kullanılmıyor. Pano erişimi tarayıcının `navigator.clipboard.writeText` API'siyle yapılıyor ve hata olursa "Kopyalanamadı" mesajı gösteriliyor. `mailto:` işletim sisteminin varsayılan e-posta istemcisine gider; istemci tanımlı değilse Windows ve Linux'ta da tarayıcı bir şey açmaz, ama "Metni kopyala" düğmesi her durumda çalışır.
- Windows ve Linux'ta **koşulamadı**, çünkü bu makinede o platformlar yok.
