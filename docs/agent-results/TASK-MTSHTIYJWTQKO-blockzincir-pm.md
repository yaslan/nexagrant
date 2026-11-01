# TASK-MTSHTIYJWTQKO — P0: sahte "EUROPEAN COMMISSION" rozeti + uydurma doküman ref/tarih + .docx gerçek OOXML değil

**Ajan:** blockzincir-pm · **Sprint:** SPRINT-S12 (Dalga 8, st1) · **Commit:** `7fede8e`
**Durum:** üç kusur da düzeltildi ve GERÇEK indirme ile doğrulandı.

---

## 1) Ne yapıldı

Kartın iddia ettiği üç kusurun üçü de **DOĞRULANDI** (aşağıda "önce" çıktıları) ve düzeltildi.
Yetki/kiracı mantığına (`96c4166`) dokunulmadı — o testler hâlâ yeşil.

### Kusur A — her belgeye sabit fon-kuruluşu rozeti

`document-exporter.ts:252` her dışa aktarımın tepesine `EUROPEAN COMMISSION - HORIZON EUROPE`
(ya da `kind === 'AWARD_PACK'` ise `TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ PAKETİ`) basıyordu. Bu rozet
**hiçbir kayda bağlı değildi** — tek girdisi `kind` parametresiydi, yani kiracının kendi yarım
taslağı da Komisyon'dan çıkmış gibi iniyordu.

Aynı yalan gövdede de vardı: `templateBody` "### {kind} RESMÎ BAŞVURU DOKÜMANI / İşbu doküman
resmî Ufuk Avrupa … standartlarına uygun olarak üretilmiştir" diyordu, `docxFallbackBody` da
öyle. Başlığı düzeltip gövdeyi bırakmak aldatmayı kaldırmazdı; ikisi **aynı kusur**, birlikte
düzeltildi (bkz. "Açık sorular"da kapsam notu).

**Düzeltme:** antet artık belgenin ait olduğu kuruluşun **kayıtlı adı** (`tenantName`, zaten
`Tenant` satırından geliyor). Kayıt yoksa mevcut "Kuruluş belirtilmedi" etiketi. Ayrıca her iki
formata da açık bir köken notu eklendi:

> Bu belge {org} tarafından Fabrika'da hazırlanmıştır. Avrupa Komisyonu, TÜBİTAK ya da başka
> bir fon kuruluşu tarafından düzenlenmiş veya onaylanmış resmî bir belge DEĞİLDİR.

`isTubitak` değişkeni (yalnız rozet + renk seçiyordu) tamamen kaldırıldı.

### Kusur B — uydurma doküman referansı ve tarih

`route.ts` her indirmede `id: doc-export-${Date.now()}` üretiyor, exporter bunu **"Doküman Ref"**
diye basıyordu: aynı belge iki kez indirilince iki farklı, kayıt numarası görünümlü,
hiçbir yerde aranamayan referans. Başlıktaki tarih de yalnızca `new Date()` iken düz
**"Tarih"** etiketiyle basılıyordu — belgenin tarihi gibi okunuyordu.

**Düzeltme:**
- `ExportDocumentData.id` → `documentRef?: string`. Adı ve tipi niyeti anlatıyor: **kaydın id'si**,
  opsiyonel. Route artık `partId ?? undefined` geçiyor (partId bu noktada kiracı içinde
  çözülmüş olmak zorunda, aksi halde route zaten 404 dönüyor).
- Kayıt yoksa uydurma referans yok: "Kayıtlı bir doküman referansı yok" / "No document
  reference recorded".
- Tarih etiketi `dateLabel` → `exportedAtLabel` = "Dışa aktarma tarihi" / "Exported on".
- `.docx` dosya adı da saatten kurtarıldı: `${type}_v1_${Date.now()}.docx` → `${type}_${partId}.docx`.

### Kusur C — `format=docx` gerçek OOXML değil

`generateDocxBuffer` düz WordprocessingML XML'i `Buffer.from(xml)` ile döndürüyor, route bunu
OOXML content-type'ı ve `.docx` adıyla servis ediyordu. `.docx` bir ZIP konteyneridir; inen
dosya `PK\x03\x04` yerine `<?xml` ile başlıyordu.

**Düzeltme:** gerçek OOXML paketi, **zaten bağımlılıkta olan** `docx` kütüphanesiyle (M2
concept-note dışa aktarımının kullandığı desen — yeni bağımlılık YOK, elle zip yazıcı YOK).
Fonksiyon `async` oldu; tek çağıranı zaten `await` eden bir route handler. Elle XML kaçışı
(`escapeXml`) gereksizleşti, silindi.

---

## 2) Kanıt (kopyalanmış gerçek çıktı)

### ÖNCE — üç kusur da üretildi

```
--- [1] badge line printed into a tenant draft ---
      <div class="logo-badge">EUROPEAN COMMISSION - HORIZON EUROPE</div>
      <div class="sub-header">Doküman Ref: doc-export-1788861611578 | Sürüm v1</div>
EC badge present: true

--- [2] doc ref is a timestamp: two exports of the SAME document ---
export A ref: doc-export-1788861611590
export B ref: doc-export-1788861611595
same document, same ref? false
header date line: Tarih: 08.09.2026

--- [3] format=docx bytes ---
first 4 bytes: [ 60, 63, 120, 109 ] (a real .docx starts with 80 75 3 4 = "PK\x03\x04")
```

```
$ unzip -t before.docx
Archive:  before.docx
  End-of-central-directory signature not found.  Either this file is not
  a zipfile, or it constitutes one disk of a multi-part archive.
unzip:  cannot find zipfile directory in one of before.docx or ...
unzip exit=9
$ file before.docx
before.docx: XML 1.0 document text, Unicode text, UTF-8 text
```

*(Fikstür bilerek "uydurma": hiçbir çağrıya/fon kuruluşuna bağlı olmayan bir kiracı taslağı —
kartın "doğrulamacının UYDURMA fikstürü bile Komisyon başlığıyla indi" tespitiyle aynı.)*

### SONRA — aynı üç prob

```
--- [1] letterhead of a tenant draft ---
<div class="logo-badge">Küçük Danışmanlık Ltd.</div>
<div class="provenance">Bu belge Küçük Danışmanlık Ltd. tarafından Fabrika'da hazırlanmıştır.
Avrupa Komisyonu, TÜBİTAK ya da başka bir fon kuruluşu tarafından düzenlenmiş veya
onaylanmış resmî bir belge DEĞİLDİR.</div>
EC badge present: false
TÜBİTAK badge present (AWARD_PACK): false

--- [2] doc ref / date ---
export A ref: Doküman Ref: part_abc123
export B ref: Doküman Ref: part_abc123
same document, same ref? true
no stored record -> Kayıtlı bir doküman referansı yok
header date line: Dışa aktarma tarihi: 08.09.2026

--- [3] format=docx bytes ---
first 4 bytes: [ 80, 75, 3, 4 ] (80 75 3 4 = "PK\x03\x04")
```

```
$ unzip -t after.docx
    testing: word/document.xml        OK
    testing: [Content_Types].xml      OK
    testing: _rels/.rels              OK
    ... (22 dosya)
No errors detected in compressed data of after.docx.
unzip exit=0
$ file after.docx
after.docx: Microsoft Word 2007+
```

### GERÇEK e2e — tarayıcıda tıklanan indirme (sentetik değil)

`tests/e2e/document-export-tenant-isolation.spec.ts` — gerçek oturum açma, gerçek
"Resmî DOCX İndir" tıklaması, gerçek Chromium indirmesi:

```
$ npx playwright test tests/e2e/document-export-tenant-isolation.spec.ts --reporter=list
  ✓  1 signed out: the export refuses with 401 and hands over no content (130ms)
  ✓  2 tenant A clicks "Resmî DOCX İndir" and gets its OWN organisation, not FonBridge (5.8s)
  ✓  3 tenant A asking for tenant B's partId gets 404 and none of B's text (816ms)
  ✓  4 tenant B asking for tenant A's partId gets 404 as well (798ms)
  ✓  5 the printable document follows the session language and states nothing was signed (910ms)

  5 passed (9.6s)
```

Tarayıcının gerçekten indirdiği dosya:

```
$ file 03-tenant-a-export.docx
03-tenant-a-export.docx: Microsoft Word 2007+
$ unzip -t 03-tenant-a-export.docx | tail -1
No errors detected in compressed data of 03-tenant-a-export.docx.
unzip exit=0

$ ls -la *.docx
-rw-r--r--  8961  03-tenant-a-export.docx        # 1. indirme
-rw-r--r--  8961  10-tenant-a-export-again.docx  # 2. indirme — aynı belge, aynı boyut
```

Servis edilen `word/document.xml` içinden (e2e hata çıktısından, ham):

```xml
<w:t xml:space="preserve">Bu belge Doc Export E2E Kiracı A tarafından Fabrika&apos;da
hazırlanmıştır. Avrupa Komisyonu, TÜBİTAK ya da başka bir fon kuruluşu tarafından
düzenlenmiş veya onaylanmış resmî bir belge DEĞİLDİR.</w:t>
...
<w:t xml:space="preserve">Kuruluş: </w:t><w:t xml:space="preserve">Doc Export E2E Kiracı A</w:t>
<w:t xml:space="preserve">Doküman Ref: doc-export-e2e-part-a</w:t>
```

Görsel kanıt (gerçek oturumun gördüğü sayfa):
`docs/agent-results/TASK-MTSHTIYJWTQKO-screenshots/01-print-letterhead-tr.png` ve `-en.png` —
antet "Doc Export E2E Kiracı A", ref = kayıtlı part id, "Dışa aktarma tarihi", amber köken notu.
İndirilen gerçek dosya: `.../02-export.docx`.

### Kapı

```
$ npx vitest run
 Test Files  102 passed | 2 skipped (104)
      Tests  1201 passed | 8 skipped (1209)

$ npx eslint src tests scripts
exit=0

$ npx tsc --noEmit
scripts/i18n-check.ts(237,34): error TS18047: 's' is possibly 'null'.   ← BENİM DEĞİL, aşağıya bak
```

Bu tek tsc hatası **benim değil**: `scripts/i18n-check.ts` şu anda @ex-en tarafından
TASK-MTSHU5LT4XAE kapsamında baştan yazılıyor (working tree'de commit'lenmemiş). Hatalı satır
o diff'in eklediği satır:

```
$ git diff -U0 scripts/i18n-check.ts | grep -n "segments.map"
274:+    segments: segments.map(s => (s.includes('${') ? null : s)),
```

Benim dosyalarım hariç tutulduğunda typecheck temiz; pre-commit kapısı da (staged kapsam)
`✓ Kapı temiz (staged kapsamı)` verdi.

i18n paritesi (CLAUDE.md kural 8):

```
TR keys: 32  EN keys: 32
only in TR: []   only in EN: []
provenanceNotice=true  documentRefUnassigned=true  exportedAtLabel=true
```

---

## 3) Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/document-exporter.ts` | Rozet → kiracı adı; `isTubitak` silindi; köken notu; `documentRef` + `exportedAtLabel`; `generateDocxBuffer` gerçek OOXML (async, `docx` lib); `escapeXml` silindi |
| `src/app/api/documents/export/route.ts` | `id: doc-export-${Date.now()}` → `documentRef: partId`; `await generateDocxBuffer`; dosya adı saatten kayda |
| `messages/tr.json` / `messages/en.json` | +`provenanceNotice`, +`documentRefUnassigned`, `dateLabel`→`exportedAtLabel`; `templateBody` / `docxFallbackBody` / `printButton`'daki "resmî" iddiaları kaldırıldı (32/32 parite) |
| `tests/document-exporter.test.ts` | Rozet iddiasını pinleyen eski test **ters çevrildi** (artık rozetin YOKLUĞUNU pinliyor); ref kararlılığı, tarih etiketi ve ZIP magic + `word/document.xml` testleri eklendi (15 test) |
| `tests/e2e/document-export-tenant-isolation.spec.ts` | `.docx` artık `unzipper` ile açılıyor (düz metin okuma gerçek zip'te kırılırdı); rozet-yok, ref-kararlı, iki-indirme testleri eklendi |
| `docs/agent-results/TASK-MTSHTIYJWTQKO-screenshots/` | Gerçek oturumun ekran görüntüleri + inen `.docx` |

**Dikkat:** e2e spec'indeki **2 satır benim değil** (`shotsDir` import'u ve `const SHOTS`).
Bunlar TASK-MTSHUZUMVLTBF'nin (@blok-zincir-dse) uçuştaki işi. Geri almadım: geri alsaydım bu
koşunun kareleri **başka bir kartın commit'li kanıt klasörünü ezerdi** — düzeltmeye çalıştıkları
kusurun ta kendisi. Commit mesajına da not düştüm.

---

## 4) Riskler

- **Eski `.docx` çıktısını metin olarak okuyan başka bir tüketici varsa kırılır.** Repoda
  taradım: tek çağıran `route.ts`, tek okuyucu bu e2e spec'iydi; ikisi de güncellendi. Ama
  dışarıda (script/entegrasyon) düz metin bekleyen bir tüketici varsa artık deflate'lenmiş
  zip alır. Bu davranış zaten *doğru* olan; risk uyumluluk değil, fark edilmeme.
- `docx` kütüphanesi çıktısı eski elle-yazılmış XML'den daha zengin (styles/numbering/fontTable);
  dosya 1.3 KB → 9 KB. Sorun değil, sadece beklenen fark.
- Köken notu her belgede görünür — hukuk/pazarlama bu metni yumuşatmak isteyebilir. Metin
  katalogda, kodda değil; değiştirmek tek satır.

## 5) Açık sorular (sprintin bir sonraki gündemi)

1. **`src/modules/m11/ui/PartBCollaborativeEditor.tsx:492` — `<span>Resmî DOCX İndir</span>`.**
   Kiracının kendi taslağını indiren butonun adı "Resmî". Bu, düzelttiğim rozetle **aynı sınıf
   iddia**, üstelik gömülü Türkçe literal (CLAUDE.md kural 8 ihlali — i18n kapısı kartı
   TASK-MTSHU5LT4XAE ile de kesişiyor). Ayrı dosya/ayrı modül olduğu için DÜZELTMEDİM.
2. **`DocumentExport.footer`** hâlâ "FonBridge — Ufuk Avrupa & TÜBİTAK doküman üretim motoru".
   Bu aracı tarif ediyor, belgeyi değil — sınırda. Ürün adının "FonBridge" mi "Fabrika" mı
   olduğu da tutarsız (`PROJECT.md` Fabrika diyor). Ürün kararı; dokunmadım.
3. **`type` parametresi doğrulanmıyor.** `?type=<herhangi bir şey>` doğrudan başlığa ve
   "Doküman Türü" satırına basılıyor (`kind: string`). Escape edilmiyor mu diye baktım —
   `${kind}` ve `${title}` PDF şablonunda **escape edilmeden** interpole ediliyor
   (`document-exporter.ts`, `.title` ve `<title>` alanları). İmza alanları escape'li, bunlar
   değil. Kiracı-içi, oturum gerektiren bir yüzey olduğu için P0 değil ama **gerçek bir
   HTML enjeksiyon yüzeyi**; kapsam dışı bırakıp adıyla bildiriyorum.
4. **`version` her zaman 1.** Route `version` geçmiyor, exporter `= 1` varsayıyor; belge
   gerçekten v3 olsa bile "Sürüm v1" basılıyor. `ApplicationPart`'ta bir sürüm alanı var mı,
   varsa bağlanmalı.

## 6) Sonraki adım

- Kartı **review**'a aldım (`7fede8e`).
- Yukarıdaki 4 açık soru, özellikle (1) "Resmî DOCX İndir" ve (3) escape edilmeyen
  `kind`/`title`, ayrı kart olarak açılmalı — (3) bir sonraki dalgada P1 aday.
