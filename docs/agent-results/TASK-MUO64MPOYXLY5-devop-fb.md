# TASK-MUO64MPOYXLY5 — devop-fb — FB İNCELEME-88: DOCX dışa aktarım düzeltmesi (TASK-MUNDTW8O2IV6V) incelemesi

**Durum: TAMAM**
**Karar: ONAY** (engelleyici bulgu yok; 2 düşük önemli takip önerisi: O-1 test boşluğu, O-2 log bağlamı)
**Platform beyanı:** macOS (Darwin 27, Node 26.5, pnpm 11.25, gerçek Chrome 154.0.8037.58) üzerinde doğrulandı. Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız macOS var. Koda göre değişen yol platformdan bağımsız: saf JS string/Buffer işlemi, dosya yolu, süreç ya da kabuk yok. `String.prototype.toWellFormed` Node 20+ ister; CI Node 22 kullanıyor. Başlık baytları her platformda aynı. Dosya adının diske yazılışı tarayıcıya ve dosya sistemine kalıyor: Windows'ta `CON.docx` gibi ayrılmış adlar sunucuda temizlenmiyor (bkz. O-5). Bunu Windows'ta tarayıcının ele aldığını ölçmedim.

İncelenen: dev `47c96594` (`955ef50b` merge'ünü içerir; fe-fb dalı `63c58ff4`). Ayrı worktree `scratchpad/wt88` (detached). İzole DB `devopfb88-pg` (pgvector/pgvector:pg16, 127.0.0.1:55888), CI sırasıyla kuruldu: db push → rls-role → migrations ×2 (40/40 iki kez) → rls → seed. Paylaşılan :5433'e yazılmadı. **Kod değiştirilmedi.** Mutantlar ve D19 canlı gösterimi geçici olarak uygulandı; her birinden sonra `git checkout` ile geri alındı ve `git status` boş kaldı.

## 1. Ne yapıldı
1. **Content-Disposition, birim düzeyi:** `attachmentContentDisposition`'a 23 düşmanca girdi verildi (`cd-probe.ts`): Türkçe, emoji/ZWJ/bayrak, tırnak, `; filename="evil.exe"`, CRLF, yalnız LF, NUL/DEL/U+0085, U+2028/2029, 5000×Ş, 100k ASCII, yalnız surrogate, bidi override, U+061C, sıfır genişlikli karakterler, `%0d%0a`, `../../`, `CON`, `...`, boş, yalnız boşluk/tab, yalnız emoji, ters bölü, `<script>`. Her çıktı için:
   - `new Headers()` fırlatmadı: 23/23.
   - Başlıkta CR, LF ya da NUL yok. Başlık tamamen yazdırılabilir ASCII.
   - jshttp `content-disposition@1.1.0` sıkı ayrıştırıcısı her birinde tek bir `filename` çıkardı ve ekstra parametre enjeksiyonu olmadı (`; filename="evil.exe"` quoted-string içinde kaldı).
2. **Content-Disposition, canlı:** `next dev`'i :3888'de izole DB ile açtım. `alice@fabrika.test` demo girişiyle 8 düşmanca başlıklı fırsat ve not yarattım. Sonra:
   - **curl:** 8/8 yanıt 200 döndü. Ayrı bir `Set-Cookie`/`X-Evil` başlığı oluşmadı; CRLF başlığı tek bir `content-disposition` satırında kaldı.
   - **Gerçek Chrome:** not sayfasında gerçek "Download DOCX" tıklaması yapıldı (çerez diyaloğu kapatıldıktan sonra). 8/8 indirmede `suggestedFilename` doğru, `failure=null`.
   - Ek olarak 200 emojili başlık denendi: 125 kod noktası, 485 UTF-8 bayt, indirme başarılı.
3. **Görsel yolu:**
   - **Özellik fuzz'ı** (`img-fuzz.ts`, gerçek `safeInlineImageSrc` ve gerçek HTMLtoDOCX, rota seçenekleriyle): 9 tohum kullanıldı. Bunlar fixture GIF, BE-Exif JPEG, PIL ile üretilmiş LE-Exif JPEG, progressive JPEG, PNG, interlaced PNG, GIF, 800×600 JPEG ve PNG. Her tohumun ilk 700 bayta kadar her öneki ve 400 rastgele mutasyonu (1–6 bayt, 0x00/0xFF/0xC0/0xE1 ağırlıklı) denendi. **8308 girdi: 6871 tutuldu, 1437 atıldı; tutulanlardan 0'ı fırlattı, 0'ı 3 sn'yi aştı.**
   - **Hedefli girdiler:** 0×0 ve 2³¹×2³¹ PNG, 0×0 ve 65535² GIF tutuldu ve fırlatmadı. html-to-docx genişliği 5486400 EMU'ya kıstı; `textutil` belgeyi açtı. Tam 2 MiB görsel tutuldu, 2 MiB+1 atıldı. SVG (`data:image/png` ya da `svg+xml` etiketli), WebP ve HEIF atıldı. PNG etiketli JPEG baytları tutuldu ve MIME imzadan `image/jpeg` olarak kuruldu. Sahte uzantı içeriği değiştirmiyor.
   - **Canlı:** her notta şunlar vardı: iyi GIF, bozuk GIF (`GIF8junk`), 40 bayta kesilmiş JPEG, iki SVG, PNG etiketli JPEG, 2³¹ PNG, 0×0 PNG, `http://127.0.0.1:9` görseli ve iki bölümde 6×1,9 MB PNG. Sonuç: **200, 500 yok.** Belgede `<pic:pic>` = **8**. Bunlar iyi GIF, JPEG, 2³¹ PNG, 0×0 PNG ve belge-başı bütçenin izin verdiği **tam 4** büyük görsel. Bozuk ve SVG görseller atlandı; metin ("Metin önce ✓", "Son satır") yerinde.
4. **Görselsiz yeniden deneme hatayı gizliyor mu (log):** sanitizer'ın düşürüp gerçek kütüphanenin fırlattığı bir JPEG ürettim (Exif orientation girdisi 8 baytta kesik). Onu canlı bir nota koydum ve üç durumda dışa aktardım:
   - Orijinal kod: sanitizer görseli attı, yeniden deneme olmadı, log temiz.
   - D19 mutantı (sanitizer'ı gevşetir): gerçek html-to-docx fırlattı ve rota 200 döndü. Görseller düştü, metin kaldı. Sunucu logunda tek satır var: `[concept-note export] retrying without images: The value of "offset" is out of range. It must be >= 0 and <= 6. Received 8`.
   - Dosya geri alındı: yine temiz.

   Sonuç: yeniden deneme hatayı **loglardan gizlemiyor**, nedeni yazıyor. Kullanıcıdan ise gizliyor (bkz. O-2). Görselle ilgisi olmayan bir hatada ikinci deneme de fırlatıyor ve 500 yüzeye çıkıyor. Bu, `route.edge.test.ts` "a failure that is not about images still surfaces" testiyle ve D8 mutantıyla doğrulandı.
5. **Mutantlar (bağımsız set, fe-fb'nin 13'ünden farklı; `mutant-betigi.sh`):** 22 mutant; 17 öldü, 5 sağ kaldı. Sağ kalanların 1'i eşdeğer; diğerleri O-1'de.
6. **Tam kapılar:** tam `vitest run` (CI env, izole DB), live-skip kapısı, tsc, lint, i18n ve build.

## 2. Kanıt
Ekler: `docs/agent-results/TASK-MUO64MPOYXLY5-devop-fb-ekler/`: `curl-matrix.txt`, `chrome-dl.log`, `img-fuzz.log`, `mutants.log`, `vitest-tam.txt`, `kapilar.txt`, `not-sayfasi-tr.png`, probe betikleri (`cd-probe.ts`, `img-fuzz.ts`, `d19.ts`, `mutant-betigi.sh`). Betikler scratchpad'deki `./wt88` yolunu varsayıyor.

**Gerçek Chrome indirmeleri** (`chrome-dl.log`):
```
login 200 chrome 154.0.8037.58
cookie dialog dismissed
chrome tr page=200 suggestedFilename="Çağrı_ Kırsal İklim Öncüleri — ğüşıöç 🚀.docx" cps=44 failure=null
chrome crlf page=200 suggestedFilename="x__Set-Cookie_ pwn=1__X-Evil_ 1.docx" cps=36 failure=null
chrome semi page=200 suggestedFilename="a; filename=_evil.exe_; b.docx" cps=30 failure=null
chrome quote page=200 suggestedFilename="He said _hi_ it's (ok) _x_.docx" cps=31 failure=null
chrome long page=200 suggestedFilename="ŞŞŞ…Ş.docx" cps=125 failure=null
chrome bidi page=200 suggestedFilename="fatura_cod.exe.docx" cps=19 failure=null
chrome emoji page=200 suggestedFilename="🚀🚀.docx" cps=7 failure=null
chrome pct page=200 suggestedFilename="100% %0d%0a.docx" cps=16 failure=null
chrome long-emoji suggestedFilename cps=125 utf8bytes=485 … failure=null saved=15245175B
```
**curl** (CRLF örneği; `curl-matrix.txt`, 8/8 `status=200`):
```
crlf status=200 bytes=15244406
  content-disposition: attachment; filename="x__Set-Cookie_ pwn=1__X-Evil_ 1.docx"; filename*=UTF-8''x__Set-Cookie_%20pwn%3D1__X-Evil_%201.docx
```
`grep -i "set-cookie|x-evil"` yalnız bu tek satırı buldu: ikisi de quoted/percent-encoded dosya adının içinde, ayrı başlık yok.

**jshttp sıkı ayrıştırıcı:**
```
"a; filename=\"evil.exe\"; b" -> attachment {"filename":"a; filename=_evil.exe_; b.docx"}
"x\r\nSet-Cookie: pwn=1"       -> attachment {"filename":"x__Set-Cookie_ pwn=1.docx"}
```
**Görsel fuzz** (`img-fuzz.log`):
```
{"kept":6871,"dropped":1437,"threw":0,"slow":0}
TARGET png 0x0 KEPT · png 2^31x2^31 KEPT · gif 0x0 KEPT · gif 65535^2 KEPT
TARGET png padded to 2MiB KEPT · png 2MiB+1 DROPPED · svg as png DROPPED
TARGET jpeg bytes labelled gif KEPT · webp bytes DROPPED · heif bytes DROPPED   → {"threw":0}
```
**D19 sınırı gerçek kütüphaneye karşı** (`d19.ts`):
```
entryLen=8  sanitizer=DROPPED real-lib=THROWS The value of "offset" is out of range. … Received 8
entryLen=9  sanitizer=DROPPED real-lib=THROWS … Received 8
entryLen=10 sanitizer=KEPT    real-lib=ok
entryLen=12 sanitizer=KEPT    real-lib=ok
```
Kod kütüphaneyle bayt bayt uyumlu, ama bu sınırı hiçbir test sabitlemiyor (O-1).

**Canlı yeniden deneme logu** (orijinal, D19 mutantı, geri alınmış hâl; `next dev` çıktısı):
```
 GET /api/concept-notes/dfb88-note-d19/export 200 in 83ms            ← orijinal: warn yok, pics=0 metin=True
[concept-note export] retrying without images: The value of "offset" is out of range. It must be >= 0 and <= 6. Received 8
 GET /api/concept-notes/dfb88-note-d19/export 200 in 75ms            ← mutant: yeniden deneme, pics=0 metin=True
 GET /api/concept-notes/dfb88-note-d19/export 200 in 27ms            ← geri alındı: warn yok
```
**Mutantlar** (`mutants.log`; hedef: `export/`, `docx-safe-html*`, `content-disposition*`; temel 72/72):
```
D1 labelKey ham                              => KILLED (1 failed)
D2 bütçe bölüm-başı (yeni obje)              => KILLED (2 failed)
D3 bütçe varsayılan param                    => KILLED (2 failed)
D4 bütçe sınırı > yerine >=                  => SURVIVED
D5 bütçe düşülmüyor                          => KILLED (2 failed)
D6 retry yok                                 => KILLED (2 failed)
D7 retry görselli (bütçe 0 değil)            => KILLED (1 failed)
D8 2. hata yutulur                           => KILLED (1 failed)
D9 warn'da hata mesajı yok                   => SURVIVED
D10 warn tamamen yok                         => KILLED (1 failed)
D11 Cc temizliği yok                         => KILLED (1 failed)
D12 tırnak temizliği yok                     => KILLED (1 failed)
D13 toWellFormed yok                         => KILLED (1 failed)
D14 ascii yedekte harf-rakam kapısı yok      => SURVIVED
D15 JPEG SOF sınırı i+9 -> i+5               => KILLED (2 failed)
D16 Exif blok <16 -> <14                     => KILLED (1 failed)
D17 GIF >=10 -> >=6                          => KILLED (2 failed)
D18 PNG >=24 -> >=16                         => KILLED (2 failed)
D19 Exif entry.length<10 -> <8               => SURVIVED   (eşdeğer DEĞİL: gerçek lib fırlatıyor, yukarıda)
D20 JPEG i>length kontrolü yok               => SURVIVED   (eşdeğer: buffer[i] undefined !== 0xff zaten false)
D21 120 sınırı 1200                          => KILLED (1 failed)
D22 başlık ham opportunity.title             => KILLED (3 failed)
```
Görevin sorduğu iki koruma sağlam: **labelKey** (D1) ve **belge-başı bütçe** (D2, D3, D5) mutantları testlerce öldürülüyor.

**Tam kapılar** (`vitest-tam.txt`, `kapilar.txt`):
```
CI=true AUTH_SECRET=<ci fixture> vitest run (izole DB):  Test Files 293 passed | 2 skipped (295)
                                                         Tests 3587 passed | 36 skipped (3623)   exit=0
live-skip gate: 44 live files, 385 live tests passed, 28 allowed skip(s)   gate=0
tsc --noEmit -p .  → exit 0
pnpm lint          → exit 0
pnpm i18n:check    → ✅ i18n check passed   exit 0
pnpm build         → exit 0   (├ ƒ /api/concept-notes/[id]/export)
```
Build notu: ilk `pnpm build` denemesi "Failed to type check" verdi. Neden, aynı worktree'de az önce çalıştırdığım `next dev`'in bıraktığı `.next` dizini. `rm -rf .next` sonrası temiz build exit 0 verdi ve `tsc` ayrıca exit 0. Bu benim ortamımdan kaynaklandı, kodla ilgisi yok.

## 3. Bulgular
Engelleyici (Y) bulgu **yok**.

- **O-1 (düşük, test boşluğu):** dört eşdeğer olmayan mutant sağ kaldı. Kod doğru, ama gelecekteki bir regresyonu testler yakalamaz:
  - D19: Exif orientation girdisinin 8–9 bayta kesildiği sınır. Gevşerse gerçek kütüphane fırlatır ve bunu yeniden deneme ağı sessizce "görselsiz 200"e çevirir. Yani regresyon 500 olarak değil, **görsel kaybı** olarak görünür. Öneri: `d19.ts`'teki `entryLen=8` girdisini `docx-safe-html.test.ts`'e fixture olarak eklemek.
  - D9: yeniden denemedeki `console.warn` artık hatanın nedenini yazmasa da testler geçiyor. Öneri: `route.edge.test.ts` B-2 testinde `expect(warn).toHaveBeenCalledWith(expect.stringContaining('retrying'), 'Invalid JPG…')`.
  - D4: tam sınıra oturan bütçe testi yok (`bytes.length === remaining`).
  - D14: yalnız noktalama içeren başlıkta ASCII yedeğin `ConceptNote`'a düşmesi test edilmiyor. Örneğin "—.!" başlığı ASCII yedekte ".!.docx" olurdu.
- **O-2 (düşük, gözlemlenebilirlik/UX):** yeniden deneme logunda not id'si, kiracı id'si ve istek bağlamı yok, yalnız hata mesajı var. Uyarı ya da metrik de tanımlı değil. Operasyonda "hangi notun görselleri düştü" sorusu cevapsız kalır. Kullanıcı görselleri eksik bir belge alıyor ve bunu kendisine söyleyen bir şey yok; fe-fb raporu Riskler'de bunu yazmış. Öneri: logu `console.warn('[concept-note export] retrying without images', { noteId: id, tenantId, reason })` şeklinde yazmak. İstenirse yanıta `X-Export-Images-Dropped: 1` gibi bir başlık eklenebilir ve UI bir bildirim gösterebilir.
- **O-3 (bilgi, önceden var, bu değişiklik getirmedi):** html-to-docx her görseli `word/media/` altında **iki kez** ve **sıkıştırmadan** (`Stored`) yazıyor. Bu yüzden 8 MiB girdi bütçesi yaklaşık **15,2 MB** yanıt üretiyor (`unzip -l`: 1.900.000 baytlık 8 dosya, 4 `<pic:pic>`). Dev'de bir dışa aktarım 1,8–4,3 sn sürdü. Bütçe girdiyi sınırlıyor, çıktıyı ~2 katı olarak sınırlıyor. Rota bazında bir hız sınırı yoksa ayrı bir kapasite kartı düşünülebilir.
- **O-4 (bilgi):** `UNSAFE_IN_NAME`, U+061C (Arapça harf işareti, bir bidi işareti), U+200B, U+FEFF ve U+2060'ı temizlemiyor. Bunlar `filename*` içinde kalıyor. Override olmadıkları için "exe.docx" türü bir sahtecilik üretemiyorlar, ama `\p{Cf}` ile temizlemek daha sade olur (ZWJ U+200D istisnası korunarak).
- **O-5 (bilgi, kozmetik):**
  - Yalnız boşluk ve tab içeren başlıkta `filename*` "_.docx" olurken ASCII yedek "ConceptNote.docx" oluyor, çünkü tab `\p{Cc}` → `_` dönüşümüne boşluk kırpmadan önce giriyor.
  - "..." başlığı "....docx" oluyor.
  - Windows'ta ayrılmış adlar (`CON`, `NUL`) temizlenmiyor; bu tarayıcıya kalıyor.
  - 0×0 görsel belgeye görünmez bir resim olarak giriyor.
  - 120 kod noktası sınırı bayt cinsinden değil: 120 emoji 485 UTF-8 bayt eder ve bu 255 baytlık ad sınırını aşar. Chrome indirmeyi başarıyla tamamladı; nihai `~/Downloads` adının kısaltılmasını ölçmedim, çünkü Playwright yolu kendisi atıyor.

  Hiçbiri 500 ya da enjeksiyon üretmiyor.
- SSRF (`http://127.0.0.1:9` görseli): canlı notta görsel sanitizer'da düştü (`<pic:pic>` sayımında yok). :9 portunda dinleyici açamadım (portun kök yetkisi istemesi nedeniyle `PermissionError`). Dinleyicili kanıtı `route.ssrf.test.ts` veriyor (labelKey yükü dahil); D1 mutantı o testi kırdı.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUO64MPOYXLY5-devop-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUO64MPOYXLY5-devop-fb-ekler/` (loglar, kare, probe betikleri)

Uygulama kodu değişmedi.

## 5. Riskler
- Yeniden deneme ağı, `sizeable` kopyasındaki gelecekteki bir hatayı 500 yerine sessiz görsel kaybına çevirir (O-1 + O-2). Bugün bu yola düşen gerçek bir girdi bulunamadı: 8308 fuzz girdisinde 0 fırlatma.
- Yanıt boyutu ve CPU maliyeti (O-3) bu değişiklikten bağımsız ama canlıda izlenmeli.
- Linux (prod Docker) ve Windows tarayıcı davranışı koşulmadı.

## 6. Açık sorular
- O-1 ve O-2 için tek bir küçük takip kartı açılsın mı (fe-fb; test fixture'ı + log bağlamı)?
- O-3 için export rotasına hız sınırı ya da kapasite kartı gerekli mi?

## 7. Sonraki adım
- Karar ONAY; merge zaten dev'de (`955ef50b`), geri alma gerekmiyor.
- İzleme notu: canlıda `[concept-note export] retrying without images` satırının sayısı izlenmeli. Sıfırdan farklıysa `sizeable` kopyası kütüphaneden sapmış demektir; o zaman O-1 fixture'ı ve kütüphane sürümü kontrol edilmeli.
- Prod Docker (Linux) üzerinde Türkçe başlıklı export duman testi bir sonraki deploy doğrulamasında koşulmalı.

Temizlik: `devopfb88-pg` kabı, :3888 dev sunucusu (kendi başlattığım pid 3550, kapatıldı) ve worktree'deki `.env.local` yalnız bu incelemeye ait. Kap ve worktree rapor commit'inden sonra kaldırılır.
