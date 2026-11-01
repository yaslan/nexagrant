# TASK-MUN80RJ96EG0O — Y-1 SSRF (DOCX dışa aktarımı) + O-3 image-size — cs-fb

**Durum:** TAMAM — kod `3615cb30` (dal `dev`). Kaynak: `docs/agent-results/TASK-MUN66T2HM4A4E-be-fb.md` Y-1, O-3.
**Platform beyanı:** macOS (Darwin 27, Node + pnpm 11.25.0) üzerinde doğrulandı. Değişen kod platformdan bağımsız (saf JS HTML ayrıştırma + `Buffer`; dosya yolu, süreç, kabuk yok) → Linux (Vulut/Docker prod) ve Windows'ta aynı davranmalı. Linux/Windows'ta koşulamadı: bu makinede yalnız macOS var; CI (Linux) aynı vitest dosyalarını koşacak.

## Ne yapıldı
1. **Kök neden doğrulandı.** `html-to-docx` 1.8.0 dist'i `isValidUrl(src)` tutarsa `imageToBase64` ile URL'i **sunucudan** indiriyor, yönlendirmeyi izliyor ve her `<img>`'i iki kez işliyor. Ağ erişimini kapatan bir seçenek **yok** (dist'te koşulsuz). Rota `content[section.key]`'i ve ayrıca `template.name`, `opportunity.title`, `section.labelKey`'i ham HTML'e koyuyordu → başlık alanı da ikinci bir SSRF girişiydi (be-fb raporunda yoktu).
2. **Düzeltme — `src/lib/docx-safe-html.ts`:** gövde `parse5` ile ayrıştırılıp **izinli etiket listesinden yeniden kuruluyor** (URL kara listesi değil, yapısal kural):
   - Hiçbir URL (http/https/`//`/file/decimal IP/localhost…) görsel kaynağı olarak geçmez; `srcset`, `style`, `<svg>/<math>/<picture><source>`, `script/style/iframe…` düşer; bilinmeyen etiket açılır (metni kalır).
   - Tek izinli görsel: `data:image/(png|jpeg|gif);base64` — baytları **PNG/JPEG/GIF imzasıyla** başlamalı, tek görsel ≤2 MiB, belge başına toplam ≤8 MiB; MIME imzadan alınır, base64 **yeniden kodlanır** (çıktıda `://` olamaz).
   - `a[href]` yalnız http/https/mailto (köprü, indirilmez); `td/th` colspan/rowspan 2–50; 32 seviyeden derin iç içe yapı metne düzleşir (özyineleme patlaması yok).
   - Rota: şablon adı, fırsat başlığı ve bölüm etiketleri `escapeHtmlText` ile metin olarak kaçışlanıyor; gövde `sanitizeHtmlForDocx(body, imageBudget)`.
   - `m2/server/actions.ts#exportToDocx` incelendi: `docx` paketinin `TextRun`'ını kullanıyor, HTML ayrıştırmıyor → etkilenmiyor, dokunulmadı.
3. **O-3 image-size:** html-to-docx image-size'ı **dist'ine gömmüş** (`require('image-size')` yok; dist'te `icns`/`heif` işleyicileri var). Yani `pnpm.overrides` **çalışma zamanını değiştirmez**. Asıl kapama 2. maddedeki imza kapısı: HEIF/ICNS/JXL baytları html-to-docx'e hiç ulaşmıyor. Ek olarak `pnpm-workspace.yaml`'a kapsamlı override `'html-to-docx>image-size': '>=2.0.3'` (yorumuyla birlikte) → kurulu, kullanılmayan 1.2.1 kopyası ağaçtan ve denetimden çıktı.
4. Yeni prod bağımlılığı: `parse5@^8.0.1` (zaten jsdom üzerinden depodaydı; TS tipleri içinde, bağımlılığı yalnız `entities`).

## Kanıt
**Düzeltme öncesi — be-fb senaryosu yeniden üretildi** (`scratchpad/ssrf-lib.mjs`, 127.0.0.1:47611 dinleyici):
```
$ node ssrf-lib.mjs
docx bytes 22112 hits ["GET /internal/secret.png","GET /internal/secret.png"]
```
**Düzeltme sonrası — gerçek rota + gerçek html-to-docx + gerçek 127.0.0.1 dinleyici** (`route.ssrf.test.ts`; yalnız DB ve oturum sahte):
- Kontrol testleri dinleyicinin istek ALDIĞINI kanıtlıyor (html-to-docx'e doğrudan ham HTML: `GET /control.png`; yönlendirme zinciri: `GET /hop.png` → `GET /internal/secret.png`) → aşağıdaki "0 istek" sahte negatif değil.
- Rota üzerinden 0 istek: iç IP, yönlendirme zinciri, loopback'e çözülen ad (`localhost`, DNS-rebinding benzeri), decimal IPv4 (`2130706433`), büyük harf/tırnaksız, URL kuyruklu data URI, `srcset`+`<picture>`, başlık/şablon adına gömülü `<img>`.
- Birim (`docx-safe-html.test.ts`): 19 URL biçimi (entity kodlu `&#104;ttp`, `//host`, `file:`, `<image>`, `<svg><image>`, `style=url()`, yorum, `[::ffff:127.0.0.1]`…), ICNS/HEIF baytları `image/png` etiketiyle → reddedildi, SVG data → reddedildi, 2 MiB+1 → reddedildi, belge bütçesi, 5000 seviye iç içe.
```
$ npx vitest run src/lib/docx-safe-html.test.ts "src/app/api/concept-notes/[id]/export/" src/modules/m2
 Test Files  5 passed (5)
      Tests  65 passed (65)
```
**Mutantlar 8/8 yakalandı** (her biri geri alındı, `diff -q` teyitli, sonra 43/43 yeşil):
```
M1 route ham govde        => Tests  6 failed | 37 passed (43)
M2 http src izinli        => Tests 17 failed | 26 passed (43)
M3 imza kontrolu yok      => Tests  1 failed | 42 passed (43)
M4 baslik kacissiz        => Tests  1 failed | 42 passed (43)
M5 derinlik siniri yok    => Tests  1 failed | 42 passed (43)
M6 butce yok              => Tests  1 failed | 42 passed (43)
M7 script/style birakilir => Tests  1 failed | 42 passed (43)
M8 href semasi serbest    => Tests  1 failed | 42 passed (43)
```
(M1'de 7 yüktan "URL kuyruklu data URI" kütüphanenin kendisinde de istek üretmiyor; o biçim birim testlerle korunuyor.)

**Meşru dışa aktarım hâlâ çalışıyor — gerçek DOCX üretildi ve açıldı:** rota çıktısı `scratchpad/sample.docx` (`PK` imzası), macOS `textutil` ile açıldı:
```
Standard Template
Opportunity: Smart Grids
summary
Summary
Rural grid pilot & results
budget
**Total** 1.2M EUR
$ unzip -l sample.docx | grep media
       70  word/media/image--O4rFwd8UZBghZ-WdnA--.png
       70  word/media/image-5NGIF94xVHuir-v8F4ZJa.png
```
(Gömülü görsel baytları girdi PNG'sine birebir eşit — testte `equals(PNG)`; kütüphane aynı görseli iki medya parçasına yazıyor, önceden de böyleydi.)

**`pnpm audit --prod` önce/sonra:**
```
önce:  {'low': 9, 'moderate': 45, 'high': 14, 'critical': 0}  image-size: GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr (.>html-to-docx>image-size)
sonra: {'low': 9, 'moderate': 45, 'high': 12, 'critical': 0}  image-size: []
kalan high: @hono/node-server, deepmerge-ts, fast-uri, hono, mysql2, undici
```
**Kapılar:** paylaşılan ağaçta `pnpm typecheck` exit 0, hedefli eslint exit 0. **Temiz worktree** (`git worktree add --detach … 3615cb30`): `pnpm install --frozen-lockfile` exit 0 → `pnpm db:generate` exit 0 → `DEMO_LOGIN_ENABLED=false pnpm build` **exit 0** (`/api/concept-notes/[id]/export` listede) → `pnpm typecheck` 0, `pnpm lint` 0, hedefli vitest 65/65. Worktree sonra kaldırıldı. Tam süit koşulmadı (izole DB yok; kural gereği).

## Değişen dosyalar (commit `3615cb30`)
- `src/lib/docx-safe-html.ts` (yeni) · `src/lib/docx-safe-html.test.ts` (yeni)
- `src/app/api/concept-notes/[id]/export/route.ts` · `src/app/api/concept-notes/[id]/export/route.ssrf.test.ts` (yeni)
- `package.json` (+`parse5`) · `pnpm-lock.yaml` · `pnpm-workspace.yaml` (`overrides`)
- Bu rapor. Komşuların dosyalarına (m11, next.config/proxy) dokunulmadı.

## Riskler
- Uçtan uca HTTP (tarayıcıda giriş yapıp gerçek not dışa aktarma) koşulmadı: paylaşılan `fabrika` DB'sine not yazmak gerekirdi. Rota testi gerçek handler + gerçek kütüphane + gerçek soket kullanıyor; yalnız Prisma ve `auth()` sahte.
- Dışa aktarım artık **URL'li görselleri sessizce atıyor** (daha önce indiriliyordu). Kod tabanında `<img>` üreten bir editör yok (içerik markdown/düz metin), ama bir kullanıcı dış görsel yapıştırdıysa DOCX'te görünmeyecek. İsteniyorsa ileride kendi R2 depomuzdan önceden indirilip doğrulanmış görseller için ayrı bir yol eklenebilir (izinli origin + sunucu tarafı indirme + imza kontrolü).
- Görünür davranış farkı: başlıkta/şablon adında `<b>` gibi işaretleme artık metin olarak çıkar (doğru olan bu).
- `Content-Disposition` dosya adı hâlâ ham `opportunity.title` (tırnak/Türkçe karakter başlığı bozabilir ya da `TypeError` verebilir) — SSRF değil, kapsam dışı; ayrı küçük kart önerilir.
- html-to-docx'in gömülü image-size'ı PNG/JPEG/GIF işleyicilerinde bilinen bir açık yok; yeni bir GHSA bu formatlara gelirse override onu kapatmaz (gömülü kopya) — kütüphaneyi değiştirmek (örn. `docx` paketiyle yeniden yazmak) kalıcı çözüm.

## Açık sorular
1. Konsept notlarında görsel ürün gereksinimi var mı? Varsa "kendi depomuzdan doğrulanmış görsel" yolu kartlanmalı.
2. Kalan 12 high (shadcn/prisma CLI → devDependencies, `openai>undici`, `fast-uri`) bu kartın O-3 kapsamında değildi (kart yalnız image-size diyor) — be-fb raporundaki öneri 7'nin geri kalanı için ayrı kart açılsın mı?

## Sonraki adım
- crw-fb/be-fb incelemesi: `3615cb30`.
- Öneri kartları: (a) `Content-Disposition` RFC 5987 dosya adı; (b) O-3 kalanları (shadcn/prisma → devDependencies, undici/fast-uri override); (c) uzun vadede html-to-docx → `docx` paketi.
