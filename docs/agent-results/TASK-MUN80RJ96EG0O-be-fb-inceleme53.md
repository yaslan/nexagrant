# İNCELEME-53 — TASK-MUN80RJ96EG0O (cs-fb): Y-1 SSRF + O-3 image-size — be-fb

**Karar: ONAY.** Y-1 SSRF kapandı, O-3 kapandı. Merge'i engelleyen bulgu yok. Aşağıdaki B-1…B-3 engelleyici değil; takip kartı öneriyorum.
**İncelenen:** `3615cb30` (dal `dev`), rapor `docs/agent-results/TASK-MUN80RJ96EG0O-cs-fb.md`. Kaynak bulgular: `TASK-MUN66T2HM4A4E-be-fb.md` Y-1, O-3.
**Kod değiştirilmedi.** Her şey temiz worktree'de koşuldu (`git worktree add --detach … 96ad7c2d` + `pnpm install --frozen-lockfile --offline` + `pnpm db:generate`). Paylaşılan DB'ye dokunulmadı: rota testlerinde yalnız Prisma ve `auth()` sahte.
**Platform beyanı:** macOS (Darwin 27, Node, pnpm 11.25.0) üzerinde doğrulandı. Değişen kod platformdan bağımsız: saf JS HTML ayrıştırma (parse5) ve `Buffer` kullanıyor; dosya yolu, süreç ya da kabuk yok. Bu yüzden Linux (prod Docker) ve Windows'ta aynı davranmalı. Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız macOS var.

## Bulgular

| # | Önem | Bulgu |
|---|---|---|
| B-1 | DÜŞÜK (test boşluğu) | 2 mutant hayatta kaldı. **K3:** bölüm etiketi (`section.labelKey`) ham basılırsa commit'li 39 test yine yeşil kalıyor, oysa benim düzeneğimde SSRF geri açılıyor (`hits 1 connects 1`). Bugün etiketleri yalnız seed yazıyor (`prisma/seed*.ts`; `conceptTemplate.create/update` `src/` içinde yok), yani şu an sömürülemez. Kiracı şablon editörü gelirse SSRF sessizce geri açılır. **K4:** rotada bütçe belge başına değil bölüm başına verilirse (`sanitizeHtmlForDocx(body)`) testler yine yeşil. Öneri: `route.ssrf.test.ts` başlık testine `labelKey` yükü eklensin, ayrıca 2 bölümlük bir bütçe testi yazılsın. |
| B-2 | DÜŞÜK | İmza kapısı yalnız öneki kontrol ediyor. GIF için bu 4 bayt (`GIF8`), oysa gömülü image-size `GIF8[79]a` bekliyor. Kapıdan geçen ama geçerli görsel olmayan baytlar gömülü `sizeOf`'a ulaşıyor ve orada **fırlatıyor**; rota yakalamadığı için dışa aktarım 500 dönüyor. Etki yalnız kullanıcının kendi notuyla sınırlı: süreç kilitlenmiyor, yanıt 0–3 ms'de geliyor. Açık içeren ICNS işleyicisine yine ulaşılamıyor (aşağıda). Öneri: sanitizer'da görsel başına `try { sizeOf }`, başarısızsa görseli at; ya da tam GIF87a/89a ve PNG IHDR kontrolü. |
| B-3 | ORTA (**önceden vardı**, bu commit'in kapsamı dışında; cs-fb de raporladı) | `Content-Disposition` başlığı ham `opportunity.title` kullanıyor. Başlıkta `ı`, `ş` ya da `ğ` varsa (Latin-1 dışı karakterler) dışa aktarım **her seferinde** çöküyor: `TypeError: Cannot convert argument to a ByteString … value of 305`. Türkçe başlıklı meşru dışa aktarım bu yüzden bugün 500 veriyor. `3615cb30^`'da satır aynı (`route.ts:93`). Öneri: ayrı kart, `filename*=UTF-8''…` (RFC 5987) ve ASCII yedek ad. |
| B-4 | bilgi | cs-fb raporundaki "dist'te `icns`/`heif` işleyicileri var" cümlesi yarı doğru. Gömülü `typeHandlers` şunlar: bmp, cur, dds, gif, icns, ico, j2c, jp2, jpg, ktx, png, pnm, psd, svg, tga, tiff, webp. HEIF ve JXL **yok**. ICNS `validate` `"icns"===buffer.toString("ascii",0,4)` (sabit, 0. bayttan) → PNG/JPEG/GIF önekli bayt oraya ulaşamaz. PNG/JPEG/GIF önekli baytla ulaşılabilen tek yan işleyici SVG: yalnız regex çalıştırıyor, ağa çıkmıyor. |
| B-5 | bilgi | html-to-docx her görseli birden çok medya parçasına yazıyor. 8 MiB bütçe 16,8 MB DOCX üretiyor (2,2 sn). 40 MB bozuk data URI 4,7 sn sürüyor. Pratikte bu boyutlara UI'dan ulaşılamıyor: `next.config.ts`'de `serverActions.bodySizeLimit` yok, yani `saveSectionContent` için varsayılan 1 MB sınırı geçerli. |

## Kanıt

### 1. Yerel dinleyici senaryosu (0 istek) ve atlatma denemeleri
Düzenek `scratchpad/review53.test.ts` (commit'lenmedi): gerçek rota (`GET`), gerçek html-to-docx 1.8.0, gerçek dinleyiciler (127.0.0.1 ve **::1** aynı port). Ek olarak `net.Socket.prototype.connect` sarıldı ve **her** giden TCP denemesi sayıldı. Böylece 169.254.169.254 gibi dinleyici kuramadığım adresler de ölçülüyor.

Kontrol: aynı yükler doğrudan html-to-docx'e verildiğinde dinleyici istek alıyor. Yani aşağıdaki "0" sahte negatif değil:
```
CONTROL hits ["v4 /internal/secret.png","v4 /internal/secret.png","v6 /v6.png","v6 /v6.png","v4 /hop.png","v4 /internal/secret.png","v4 /hop.png","v4 /internal/secret.png"] connects 8
```
Rota üzerinden (kısaltılmış; her satır `status 200`):
```
PAYLOAD be-fb orijinal (127.0.0.1)                 | hits 0 | connects 0
PAYLOAD metadata 169.254.169.254                   | hits 0 | connects 0
PAYLOAD metadata ondalik 2852039166                | hits 0 | connects 0
PAYLOAD IPv6 loopback [::1]                        | hits 0 | connects 0
PAYLOAD IPv4-mapped IPv6 [::ffff:127.0.0.1]        | hits 0 | connects 0
PAYLOAD hex 0x7f000001                             | hits 0 | connects 0
PAYLOAD octal 0177.0.0.1                           | hits 0 | connects 0
PAYLOAD short 127.1                                | hits 0 | connects 0
PAYLOAD decimal 2130706433                         | hits 0 | connects 0
PAYLOAD 0.0.0.0                                    | hits 0 | connects 0
PAYLOAD redirect chain /hop                        | hits 0 | connects 0
PAYLOAD protocol-relative                          | hits 0 | connects 0
PAYLOAD entity-encoded scheme                      | hits 0 | connects 0
PAYLOAD tab in scheme                              | hits 0 | connects 0
PAYLOAD leading space + uppercase                  | hits 0 | connects 0
PAYLOAD userinfo trick                             | hits 0 | connects 0
PAYLOAD <image> alias                              | hits 0 | connects 0
PAYLOAD input type=image                           | hits 0 | connects 0
PAYLOAD svg image href                             | hits 0 | connects 0
PAYLOAD svg data uri w/ external ref               | hits 0 | connects 0
PAYLOAD GIF8 prefix + svg ext ref (passes 4-byte gate) | hits 0 | connects 0
PAYLOAD object/embed/iframe                        | hits 0 | connects 0
PAYLOAD style url()                                | hits 0 | connects 0
PAYLOAD link/base/background                       | hits 0 | connects 0
PAYLOAD a href (hyperlink, must not fetch)         | hits 0 | connects 0
PAYLOAD mutation-xss style noscript/textarea       | hits 0 | connects 0
PAYLOAD comment / CDATA                            | hits 0 | connects 0
PAYLOAD data URI with url tail                     | hits 0 | connects 0
PAYLOAD markdown image                             | hits 0 | connects 0
TITLE (başlık + şablon adı + bölüm etiketi yükü)   | hits 0 | connects 0
      Tests  35 passed (35)
```

### 2. data: URI boyutu ve imza kapısı
```
SIZE 2MiB exactly | status 200 | media 3 | 541 ms
SIZE 2MiB+1       | status 200 | media 0 | 296 ms
BUDGET 5x2MiB     | status 200 | media parts 9 | 2205 ms | docx 16808557
HUGE 40MB junk data URI | status 200 | 4701 ms
SIG GIF8 + junk        | err TypeError: unsupported file type: undefined   ← B-2
SIG GIF8 + svg no dims | err TypeError: Invalid SVG                        ← B-2
SIG GIF8 + svg dims    | status 200
SIG PNG sig + no IHDR  | err TypeError: Invalid PNG                        ← B-2
SIG JPEG sig + junk    | err TypeError: Corrupt JPG, exceeded buffer limits ← B-2
TR-TITLE THROW TypeError: Cannot convert argument to a ByteString because the character at index 24 has a value of 305 … ← B-3
```

### 3. Meşru DOCX: gerçek dosya açıldı
Rota çıktısı `scratchpad/legit53.docx` (Türkçe metin, liste, tablo colspan, köprü, gömülü PNG):
```
$ file legit53.docx        → Microsoft Word 2007+
$ textutil -convert txt -stdout legit53.docx
Standard Template / Opportunity: Smart Grids / ozet / Özet / Kırsal şebeke pilotu & sonuçlar / • madde 1 / Kalem 1,2M EUR / EC
$ unzip … rels → Target="https://ec.europa.eu/" TargetMode="External"
lx/word/media/image-f1Ifbj….png == PNG   (cmp ile girdi baytlarına birebir eşit)
lx/word/media/image-mwJTIn….png == PNG
```
Quick Look (`qlmanage -t`) önizlemesinde başlıklar, kalın "şebeke", madde işareti, çerçeveli tablo ve mavi altı çizili "EC" köprüsü doğru render edildi (`scratchpad/legit53.docx.png`).

### 4. `pnpm audit --prod` önce/sonra
```
== wt53pre 884c7233 (3615cb30^)
68 vulnerabilities found — Severity: 9 low | 45 moderate | 14 high
high: ['@hono/node-server','deepmerge-ts','fast-uri','hono','image-size','mysql2','undici']
image-size: GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr (.>html-to-docx>image-size)
== wt53 96ad7c2d
66 vulnerabilities found — Severity: 9 low | 45 moderate | 12 high
high: ['@hono/node-server','deepmerge-ts','fast-uri','hono','mysql2','undici']
image-size advisories: []
```
cs-fb'nin 14→12 iddiasıyla aynı. Yerel ağaçta `pnpm why image-size` → yalnız `image-size@2.0.4`. Override yalnız kurulu kopyayı etkiliyor; çalışma zamanındaki koruma imza kapısında (B-4).

### 5. Mutantlar (benim 5 mutantım, cs-fb'nin 8'inden farklı)
Komut: `npx vitest run src/lib/docx-safe-html.test.ts "src/app/api/concept-notes/[id]/export/route.ssrf.test.ts"`. Mutasyonsuz sonuç `Tests 39 passed (39)`. Her mutanttan sonra `git checkout` ile geri alındı; temiz worktree'de `git status` yalnız düzenek dosyasını gösterdi.
```
K1 2MiB sinir > → >=           => 39 passed        (hayatta — sınır testi yok; zararsız)
K2 metin '<' kacissiz          => 4 failed | 35 passed (ÖLDÜ)
K3 bolum etiketi ham           => 39 passed        (HAYATTA → B-1; düzenekte SSRF açılıyor: "TITLE status 200 hits 1 connects 1")
K4 butce bolum-basi            => 39 passed        (HAYATTA → B-1)
K5 namespace kontrolu yok      => 39 passed        (eşdeğer: svg/math zaten DROPPED_WITH_CONTENT'te; parse5'te başka yabancı ad alanı yok)
```

### 6. Kapılar
Temiz worktree'de `npx tsc --noEmit -p .` → çıktı yok (exit 0, 21 sn). Hedefli vitest 39/39.

## Değişen dosyalar
- Yalnız bu rapor. Kod değişikliği yok. Düzenek `scratchpad/review53.test.ts` depoya girmedi.

## Riskler
- Uçtan uca tarayıcı akışı koşulmadı; paylaşılan DB'ye not yazmak gerekirdi. Rota handler'ı gerçek, kütüphane gerçek, soketler gerçek.
- B-1 K3: kiracı şablon editörü eklenirse etiket kaçışı tek savunma olur ve teste bağlı değil.

## Açık sorular
- Yok. Karar kapsamı net.

## Sonraki adım
1. Takip kartı (küçük, cs-fb): B-1 testleri (etiket yükü + 2 bölüm bütçe) ve B-2 (sanitizer'da `sizeOf` probu ya da tam imza).
2. Ayrı kart: B-3 `Content-Disposition` RFC 5987. Türkçe başlıklı notlarda dışa aktarım bugün kırık.
