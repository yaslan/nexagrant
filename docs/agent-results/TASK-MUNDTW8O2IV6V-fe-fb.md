# TASK-MUNDTW8O2IV6V — fe-fb — DOCX dışa aktarım takibi (İNCELEME-53)

**Durum: TAMAM**
**Dal:** `fe-fb/mundtw-docx` (dev `675bd296` üstünden, ayrı worktree). Kod commit'i `f6ac9454`. Push yok.
**Platform beyanı:** macOS (Darwin 27, Node 26.5, pnpm 11.25) üzerinde doğrulandı. Gerçek Chrome ve gerçek Safari 27.0.1 kullanıldı. Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız macOS var. Koda bakınca değişen yol platformdan bağımsız: saf JS string/Buffer işlemleri. Dosya yolu, süreç ya da kabuk yok. `String.prototype.toWellFormed` Node 20+ ister; prod imajı ve CI Node 20+ kullanıyor. Dosya adındaki `\ / : * ? " < > |` karakterleri `_` olur. Bu, Windows'ta kaydedilemeyen adların da önüne geçer. Tarayıcının Windows'ta dosya adını nasıl kısalttığını ya da değiştirdiğini ölçmedim.

Kapsam (İNCELEME-53 raporu `TASK-MUN80RJ96EG0O-be-fb-inceleme53.md`; kart numaraları rapordakilerden farklı):

| Kart | Rapor | Konu | Sonuç |
|---|---|---|---|
| B-1 | B-3 | Türkçe ya da Unicode başlıkta `Content-Disposition` 500 | Kapandı |
| B-2 | B-2 | İmza kapısını geçen ama gömülü image-size'ın ölçemediği görsel 500 veriyordu | Kapandı |
| B-3 | B-1 K3/K4 | labelKey yükü testi ve belge-başı bütçe testi | Eklendi. labelKey'siz şablon 500'ü 80c0641a'da kapanmıştı, ona dokunulmadı |

## 1. Ne yapıldı
- **`src/lib/content-disposition.ts` (yeni):** `attachmentContentDisposition(ad, '.docx', 'ConceptNote')` şu başlığı üretir: `attachment; filename="<ASCII yedek>"; filename*=UTF-8''<RFC 5987>`.
  - ASCII yedekte Türkçe harfler çevrilir (ı→i, İ→I, ş→s, ğ→g, ç→c, ö→o, ü→u). Ardından NFKD uygulanır ve ASCII dışı her şey atılır. Geriye harf ya da rakam kalmazsa `ConceptNote` kullanılır.
  - `filename*` gerçek adı taşır. Emoji ve U+200D (ZWJ) korunur.
  - Temizlenenler: kontrol karakterleri, bidi override'lar (U+202A–E, U+2066–9, U+200E/F), yol ayraçları ve tırnaklar. CR/LF ile başlık enjeksiyonu yapılamaz.
  - Yalnız surrogate `toWellFormed` ile U+FFFD olur. Önceden bu `encodeURIComponent`'te URIError verirdi.
  - Ad 120 kod noktasında kesilir; emoji ortadan bölünmez.
  - RFC 5987'ye göre `'()` karakterleri yüzde-kodlanır.
- **`src/lib/docx-safe-html.ts`:** `safeInlineImageSrc` bir görseli artık yalnız html-to-docx'in içine gömülü image-size 1.x onu ölçebiliyorsa tutar (`sizeable`). Kontrol, o ayrıştırıcının okuduğu baytları sınır denetimiyle okur:
  - GIF: `GIF8[79]a` ve en az 10 bayt.
  - PNG: 12. baytta `IHDR` ve en az 24 bayt.
  - JPEG: image-size'ın işaretçi (marker) yürüyüşünün aynısı, SOF0/1/2 sınırı ve "Exif" bloğundaki orientation okuması dahil.

  Ölçülemeyen görsel diğer reddedilen görseller gibi atlanır. Metin kalır, bütçeden düşülmez.
- **`src/app/api/concept-notes/[id]/export/route.ts`:** başlık yeni yardımcıyla yazılıyor. İkinci bir güvenlik ağı eklendi: html-to-docx yine de fırlatırsa not bir kez daha **görselsiz** (bütçe 0) üretilir ve `console.warn` yazılır. İkinci deneme de fırlatırsa hata gizlenmez ve 500 olarak yüzeye çıkar.
- **Testler:**
  - `route.ssrf.test.ts`: labelKey'e `<img src=http://…>` yükü konur. Dinleyiciye 0 istek gitmeli ve etiket metin olarak kaçışlanmalı.
  - `route.edge.test.ts` (yeni, gerçek rota ve gerçek html-to-docx): Türkçe+emoji başlık → 200 ve tam başlık eşitliği; opportunity yoksa `ConceptNote`; bozuk GIF/PNG/JPEG atlanır, iyi GIF kalır, yeniden deneme olmaz; iki bölümde 3×~1,9 MiB görselden **tam 4'ü** belgeye girer (belge-başı bütçe); görselsiz yeniden deneme; iki kez hata → yüzeye çıkar.
  - `docx-safe-html.test.ts`: 9 bozuk varyant null döner ve bütçe değişmez. Gerçek PNG, GIF87a ve Exif'li JPEG tutulur.
  - `docx-safe-html.image-size.test.ts` (yeni, özellik testi): 3 gerçek görselin ilk 260 bayta kadar her öneki ve 150 tohumlu bayt değişimi. Tutulan her görsel **gerçek** HTMLtoDOCX'ten fırlatmadan geçmeli. Tutulan ve atılan sayıları da doğrulanıyor, yani test boş geçemez.
  - Fixture'lar `tests/fixtures/docx-images/` altında: `sips` ile üretilmiş 12×8 GIF ve JPEG. JPEG'de JFIF ve big-endian Exif var.

## 2. Kanıt

### Canlı indirme — gerçek Chrome (Playwright `channel:'chrome'`), gerçek "Download DOCX" tıklaması
İzole DB (`pgvector/pgvector:pg16`, 127.0.0.1:55787) CI sırasıyla kuruldu: push → rls-role → migrations ×2 → rls → seed. Paylaşılan :5433'e yazılmadı. Oturum demo girişiyle `alice@fabrika.test` üzerinden açıldı. Notlar:
- `fefb-dtw-note`: başlık "Çağrı: Kırsal İklim Öncüleri — ğüşıöç 🚀". İçinde iyi GIF, bozuk GIF, Exif'li iyi JPEG ve bozuk JPEG var.
- `fefb-dtw-note2`: seed fırsatı `demo-opp-1` "District renovation pilot — İzmir".

**Önce** (`route.ts` ve `docx-safe-html.ts` dev hâline alındı; sonra yedekten geri yüklendi, md5 aynı):
```
chrome fefb-dtw-note  GET export -> 500   NO DOWNLOAD within 30s
chrome fefb-dtw-note2 GET export -> 500   NO DOWNLOAD within 30s
⨯ TypeError: unsupported file type: undefined (file: undefined)                                  ← B-2 (bozuk GIF)
⨯ TypeError: Cannot convert argument to a ByteString because the character at index 48 has a value of 8212 ← B-1 (— başlıkta)
```
**Sonra:**
```
chrome fefb-dtw-note GET export -> 200 content-disposition: attachment; filename="Cagri_ Kirsal Iklim Onculeri gusioc.docx"; filename*=UTF-8''%C3%87a%C4%9Fr%C4%B1_%20K%C4%B1rsal%20%C4%B0klim%20%C3%96nc%C3%BCleri%20%E2%80%94%20%C4%9F%C3%BC%C5%9F%C4%B1%C3%B6%C3%A7%20%F0%9F%9A%80.docx
chrome fefb-dtw-note download suggestedFilename="Çağrı_ Kırsal İklim Öncüleri — ğüşıöç 🚀.docx" failure=null
chrome fefb-dtw-note2 GET export -> 200 content-disposition: attachment; filename="District renovation pilot Izmir.docx"; filename*=UTF-8''District%20renovation%20pilot%20%E2%80%94%20%C4%B0zmir.docx
chrome fefb-dtw-note2 download suggestedFilename="District renovation pilot — İzmir.docx" failure=null
yeni ⨯ satırı: 0
```
İndirilen DOCX (`file` çıktısı: Microsoft Word 2007+). `textutil` metni: "Kısa Şablon / Opportunity: Çağrı: Kırsal İklim Öncüleri — ğüşıöç 🚀 / Özet / Kırsal şebeke pilotu — çığ öncesi ölçüm. / … / Son satır ✓ / Bütçe / Toplam 1,2M EUR". Belgede `<pic:pic>` sayısı **2**: iki iyi görsel girdi, iki bozuk görsel atlandı. Quick Look önizlemesinde yeşil GIF ve JPEG karesi görünüyor.

### Safari 27.0.1 — gerçek Safari.app
Playwright WebKit bu makinede kurulu değil. Kurulum (`playwright install webkit`) AgentSpace kill-guard tarafından engellendi; guard'ı atlatmadım. Bunun yerine uygulamanın ürettiği `Content-Disposition` baytlarını birebir dönen yerel bir sunucu (127.0.0.1:3787) kurdum ve `open -a Safari` ile açtım. Safari'nin `~/Downloads`'a kaydettiği ad: **`Çağrı_ Kırsal İklim Öncüleri — ğüşıöç 🚀.docx`**. Bu doğru.

Bu adımda benim hatam oldu: yeniden oynatma sunucusu gövde olarak yanlışlıkla Quick Look PNG'sini gönderdi. Yani bu adım yalnız **dosya adını** kanıtlıyor; gövde Chrome indirmesinde doğrulandı. Safari'deki dosya tarayıcı oturumu olmadan indirildi. Safari'yi ben açtım (öncesinde çalışmıyordu) ve kapattım. İndirilen dosyayı kullanıcının Downloads klasöründen kaldırdım.

Kareler ve loglar: `docs/agent-results/TASK-MUNDTW8O2IV6V-fe-fb-ekler/`
- `once-01/sonra-01-not-sayfasi.png`: not sayfası ve "Download DOCX" düğmesi.
- `once-02-bozuk-gif-notu-500.png`, `once-03-seed-izmir-500.png`: indirme sekmesinde Chrome'un "HTTP ERROR 500" sayfası.
- `sonra-02-indirilen-docx-quicklook.png`: indirilen belgenin render'ı.
- `once-/sonra-indirme-log.txt`, `safari-log.txt`, `dev-sunucu-log.txt`.

### Mutantlar (13/13 öldü)
Komut: `npx vitest run 'src/app/api/concept-notes/[id]/export/' src/lib/docx-safe-html src/lib/content-disposition`. Mutasyonsuz sonuç 72/72. Her mutanttan sonra dosya `.bak`'tan geri yüklendi.
```
M1 sizeable kapisi yok                 => 14 failed   (özellik testinde gerçek "TypeError: Invalid PNG" vb.)
M2 ham baslik header                   => 2 failed
M3 butce bolum-basi                    => 2 failed    (İNCELEME-53 K4)
M4 labelKey ham                        => 1 failed    (İNCELEME-53 K3)
M5 gorselsiz yeniden deneme yok        => 2 failed
M6 Exif kontrolu yok                   => 1 failed    (ilk turda SAĞ KALDI: fixture SOF'ta da kesikti; SOF'u tam, yalnız Exif'i kesik fixture ile düzeltildi. Gerçek html-to-docx bu girdide fırlatıyor, ayrı probe ile doğrulandı)
M7 SOF sinir kontrolu yok              => 2 failed
M8 GIF 6-bayt regex yerine 4-bayt      => 5 failed
M9 PNG IHDR kontrolu yok               => 3 failed
M10 RFC5987 ek kacis yok               => 1 failed
M11 Turkce harf haritasi yok           => 2 failed
M12 120 kod noktasi siniri yok         => 1 failed
M13 bidi temizligi yok                 => 1 failed
```

### Kapılar (worktree, kod commit'i `f6ac9454` ile aynı ağaç)
```
npx tsc --noEmit -p .   → exit 0
pnpm lint               → exit 0
pnpm i18n:check         → ✅ i18n check passed
pnpm build              → exit 0 (├ ƒ /api/concept-notes/[id]/export)
vitest (CI env + izole CI DB, CI=true): Test Files 1 failed | 291 passed | 2 skipped (294); Tests 1 failed | 3581 passed | 36 skipped (3618)
  tek kırmızı: tests/rag-pdf-worker-isolation.test.ts "128 MB-inflating stream … fast" → expected 4426 ms < 3000 (yük altında süre)
  aynı dosya tek başına: 25 passed (25) ×2. cs-fb İNCELEME-83 raporu da dev'de aynı flake'i yazıyor ("ilgisiz PDF süre flake'i, tek başına 25/25"). Bu dala dokunmuyor.
live-skip gate (scripts/check-live-skips.ts): exit 0 — "43 live files, 380 live tests passed, 28 allowed skip(s)"
```
Not: `CI=true` olmadan 5 canlı dosya (public-lead, topic-match-nightly, k1-embeddings, stale-relationship-reminder, invitation-retention) DB adı `fabrika` olduğu için kendini atlıyor. Bu, paylaşılan DB'yi koruyan bir bekçi. İzole kapta `CI=true` ile koşunca 56 test geçti.

## 3. Değişen dosyalar
- `src/lib/content-disposition.ts` (yeni), `src/lib/content-disposition.test.ts` (yeni)
- `src/lib/docx-safe-html.ts`, `src/lib/docx-safe-html.test.ts`, `src/lib/docx-safe-html.image-size.test.ts` (yeni)
- `src/app/api/concept-notes/[id]/export/route.ts`, `route.ssrf.test.ts`, `route.edge.test.ts` (yeni)
- `tests/fixtures/docx-images/12x8.gif`, `tests/fixtures/docx-images/exif-12x8.jpg` (yeni)
- Bu rapor ve `…-ekler/`

## 4. Riskler
- `sizeable` gömülü image-size 1.x'in davranışını kopyalıyor. html-to-docx sürümü değişir de gömülü ayrıştırıcı değişirse kopya eskiyebilir. Buna karşı iki koruma var: özellik testi gerçek kütüphaneye karşı koşuyor ve kırmızıya döner; rotadaki görselsiz yeniden deneme de 500'ü önler.
- Görselsiz yeniden denemede **bütün** görseller düşer ve kullanıcıya bir uyarı gösterilmez; yalnız sunucu logunda `console.warn` kalır. Bugün bu yola ulaşan bir girdi bulamadım (özellik testinde 0).
- ASCII yedek adda emoji ve `—` atılıyor. `filename*`'ı okumayan eski istemci "Cagri_ Kirsal … gusioc.docx" görür. Bu beklenen davranış.
- Diğer indirme rotalarını taradım. `user/export`, `user/export-data`, `gdpr/export` ve `agency/reports` sabit ASCII ad kullanıyor. Kanıt indirmesi (`evidence/[id]/download` ve `storage.ts` presign) kullanıcının dosya adını taşıyor, ama `[^A-Za-z0-9._-]` karakterlerini `_` yapıyor. Bu yüzden 500 vermiyor, fakat "Özet.pdf" dosyası "_zet.pdf" olarak iniyor. Bu yardımcı orada da kullanılabilir; ayrı karar. Yeni bir rota eklenirse bu yardımcıyı kullanmalı.

## 5. Açık sorular
- Not sayfasındaki "Download DOCX", "← Back" ve export içindeki "Opportunity:"/"No content provided." metinleri İngilizce ve sabit kodlu. Bu görevin kapsamı dışında, dokunmadım. Takip kartı açılsın mı?

## 6. Sonraki adım
- crw-fb incelemesi. Özellikle bakılacaklar: `route.edge.test.ts`, özellik testi ve mutant listesi.
- Linux (prod Docker) üzerinde export duman testi (Türkçe başlık) bir sonraki deploy doğrulamasında koşulmalı.
