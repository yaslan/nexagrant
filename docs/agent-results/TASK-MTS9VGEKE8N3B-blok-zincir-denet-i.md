# TASK-MTS9VGEKE8N3B — `/api/documents/export`: oturum yok, kiracı daraltması yok, uydurma kimlik

**Ajan:** blok-zincir-denet-i (QA-EN) · **Sprint:** S12 Dalga 5 · **Dal:** `dev`
**Ölçüm tarihi:** 2026-09-08 · **Ortam:** ayrı `git worktree` + `next dev --webpack --port 3150`,
gerçek Postgres `localhost:5432/fabrika` (mock yok)
**Kaynak kanıt:** `docs/agent-results/DOGRULAMA-S12-D4-blok-zincir-dse.md` §2.5–§2.7

---

## 1. Ne yapıldı

### 1.1 P0 — rota herkese açıktı ve başka kiracının Part B'sini veriyordu

`src/app/api/documents/export/route.ts` yeniden yazıldı:

- **Oturum zorunlu.** `requireTenantApi()` (mevcut `src/lib/tenant.ts` deseni; yeni yetki
  yardımcısı icat edilmedi) → oturumsuz istek `401 TENANT_SCOPE_REQUIRED`.
- **Kiracı daraltması.** Tüm okumalar tek bir `withTenant(tenantId, …)` işlemi içinde ve her
  `where` cümlesinde açık `tenantId` var:
  - `applicationPart.findFirst({ where: { id: partId, tenantId } })` — eskiden
    `findUnique({ where: { id: partId } })` idi (CLAUDE.md §1 ihlali)
  - `opportunity.findFirst({ where: { id: oppId, tenantId } })`
  - `tenant.findFirst({ where: { id: tenantId } })`
  Açık `tenantId` birinci savunma hattı, `ApplicationPart` üzerindeki RLS politikası ikincisi.
- **Çözülemeyen `partId` → 404** (`PART_NOT_FOUND`). Cevap, satırın başkasına ait olmasıyla hiç
  var olmamasını AYIRT ETMEZ; aksi hâlde cevap id yoklamak için kullanılabilirdi.

### 1.2 Uydurma kimlik ve sahte imza tarihi

- `tenantName: 'FonBridge Teknoloji A.Ş.'` **kaldırıldı** → kiracının `Tenant.name` satırı.
- `opportunityTitle: 'HORIZON-CL5-2026-D3-01: …'` **kaldırıldı** → `Opportunity.title`
  (part'tan çözülür; part yoksa çağıranın verdiği `opportunityId` yine kiracıya karşı denetlenir).
- Kayıt yoksa uydurma yedek YOK: dışa aktarıcının "Kuruluş belirtilmedi / Çağrı belirtilmedi"
  etiketi basılır.
- `signedAt: new Date()` **kaldırıldı**. Bir dosyayı indirmek onu imzalamak değildir; imza
  kaydı olmadığı için belge "İmzalayan atanmadı" der.

### 1.3 i18n (CLAUDE.md kural 8)

- Rotadaki gömülü Türkçe `contentText` → `DocumentExport.templateBody` (tr + en),
  `templateBodyText(kind, locale)` üzerinden; `locale` sorgu parametresi.
- Kanıt karesi "EN oturumda ekran İngilizce" olduğu için **yarım çeviri yetmedi**:
  `src/lib/document-exporter.ts` içindeki KALAN sabit Türkçe etiketler de kataloğa taşındı
  (meta tablo başlıkları, yazdır düğmesi, doküman ref/sürüm/tarih, altbilgi, DOCX alan
  etiketleri, `<html lang>`, `toLocaleDateString` yereli). EN belge artık baştan sona İngilizce.
- Çağıranlara `locale` (+ `opportunityId`) eklendi: `documents/client.tsx`,
  `application/client.tsx`, `PartBCollaborativeEditor.tsx`.

---

## 2. Kanıt

Aşağıdaki çıktıların hepsi bu koşudan **kopyalanmıştır**, iddia değildir.

### 2.1 KIRMIZI — kusur canlı olarak yeniden üretildi (HEAD kodu, aynı sunucu)

Worktree'deki rota geçici olarak `git show HEAD:…route.ts` ile eski hâline alındı:

```
$ curl -s -o baseline-b.docx -w "HTTP %{http_code}  bytes=%{size_download}\n" \
    "http://localhost:3150/api/documents/export?type=PART_B&format=docx&partId=doc-export-e2e-part-b&title=Part_B"
HTTP 200  bytes=1346

$ grep -c 'KIRACI-B-GIZLI-PARTB' baseline-b.docx     # kiracı B'nin gizli Part B metni
1
$ grep -c 'FonBridge' baseline-b.docx
1
```

İndirilen dosyanın okunabilir metni — **oturum açılmadan**, **kiracı B'nin** satırından:

```
PART_B - Part_B
Proje Başlığı:
HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems &amp; Battery Tech
Kuruluş:
FonBridge Teknoloji A.Ş.
Sürüm:
v1
1.1 Objectives and Ambition
Lider yazar atanmadı
KIRACI-B-GIZLI-PARTB
```

### 2.2 YEŞİL — aynı istek, düzeltilmiş kod

```
$ curl -s -i "http://localhost:3150/api/documents/export?type=PART_B&format=docx&partId=doc-export-e2e-part-a&title=Part_B_Technical_Proposal" | head -9
HTTP/1.1 401 Unauthorized
vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
content-type: application/json
Date: Tue, 08 Sep 2026 06:22:34 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"error":"Unauthorized","message":"Oturumunuz bir çalışma alanına bağlı değil. Lütfen tekrar giriş yapın.","code":"TENANT_SCOPE_REQUIRED"}

$ curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://localhost:3150/api/documents/export?type=NDA&format=pdf"
HTTP 401

$ curl -s -o fixed-anon.out -w "HTTP %{http_code}  bytes=%{size_download}\n" \
    "…&partId=doc-export-e2e-part-b&title=Part_B"       # kiracı B'nin id'si, oturumsuz
HTTP 401  bytes=148
$ grep -c 'KIRACI-B-GIZLI-PARTB' fixed-anon.out
0
```

### 2.3 Gerçek tarayıcı, gerçek giriş, gerçek tıklama (Playwright, 5/5)

```
$ E2E_PORT=3150 npx playwright test tests/e2e/document-export-tenant-isolation.spec.ts
Running 5 tests using 1 worker
[seed-doc-export-e2e] ready — A=doc-export-e2e-tenant-a/doc-export-e2e-part-a B=doc-export-e2e-tenant-b/doc-export-e2e-part-b
  ✓  1 … › signed out: the export refuses with 401 and hands over no content (479ms)
  ✓  2 … › tenant A clicks "Resmî DOCX İndir" and gets its OWN organisation, not FonBridge (8.0s)
  ✓  3 … › tenant A asking for tenant B’s partId gets 404 and none of B’s text (2.2s)
  ✓  4 … › tenant B asking for tenant A’s partId gets 404 as well (1.9s)
[seed-doc-export-e2e] rolled back
  ✓  5 … › the printable document follows the session language and states nothing was signed (2.3s)

  5 passed (16.1s)
```

2. numaralı test gerçek bir tıklamadır: kiracı A giriş yapar, Part B editörü ekranındaki
**"Resmî DOCX İndir"** bağlantısına tıklar, dosya `download` olayıyla yakalanır ve diske yazılır.

**Çapraz kiracı 404 — iki ölçüm** (kartın istediği gibi):
A → B'nin `partId`'si = 404 (test 3) · B → A'nın `partId`'si = 404 (test 4).
İkisi de "boş satır üzerinde 404" değil: test 3, B'nin satırının GERÇEKTEN var olduğunu ve
`tenantId`'sinin B olduğunu önce DB'den doğrular (`expect(b!.tenantId).toBe(otherTenantId)`).

### 2.4 İndirilen dosyada uydurma kimlik kaldı mı — `grep -c` (kartın DoD ölçümü)

```
$ F=docs/agent-results/TASK-MTS9VGEKE8N3B-screenshots/03-tenant-a-export.docx
$ grep -c 'FonBridge' $F
0
$ grep -c 'HORIZON-CL5-2026-D3-01' $F
0
$ grep -c 'KIRACI-B-GIZLI-PARTB' $F
0

$ # aynı dosyanın okunabilir metni — kiracının KENDİ adı ve KENDİ çağrısı
PART_B - Part_B_Technical_Proposal
Proje Başlığı:
DOC-EXPORT-E2E-CAGRI-A
Kuruluş:
Doc Export E2E Kiracı A
Sürüm:
v1
1.1 Objectives and Ambition
Lider yazar atanmadı
KIRACI-A-PARTB-METNI
```

### 2.5 Kanıt artefaktları

`docs/agent-results/TASK-MTS9VGEKE8N3B-screenshots/`

| Dosya | Ne gösteriyor |
|---|---|
| `01-anonymous-401.png` | Oturumsuz istek: `{"error":"Unauthorized",…,"code":"TENANT_SCOPE_REQUIRED"}` |
| `02-tenant-a-partb-editor.png` | Kiracı A giriş yapmış, Part B editörü ekranı (tıklanan bağlantı burada) |
| `03-tenant-a-export.docx` | Gerçek tıklamayla inen dosya (§2.4'ün ölçüldüğü dosya) |
| `04-tenant-a-asks-b-404.png` | A → B'nin partId'si: `{"error":"Not Found","code":"PART_NOT_FOUND"}` |
| `05-tenant-b-asks-a-404.png` | B → A'nın partId'si: aynı cevap |
| `06-nda-print-en.html`, `08-nda-print-en.png` | EN oturumda belge baştan sona İngilizce, kuruluş = gerçek kiracı adı |
| `07-nda-print-tr.html`, `09-nda-print-tr.png` | TR oturumda aynı belge Türkçe |

### 2.6 Kapı ve regresyon

```
$ pnpm gate
 Test Files  100 passed | 2 skipped (102)
      Tests  1148 passed | 8 skipped (1156)
✅ SUCCESS: All 41 tenant-scoped models have RLS policies registered.
✅ Veritabanı 41 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```
(lint + typecheck + vitest + rls:check + rls:verify — tamamı temiz.)

Dışa aktarma/kimlik komşuluğundaki mevcut e2e'ler de koşuldu:

```
$ E2E_PORT=3150 npx playwright test tests/e2e/partb-template-identity.spec.ts \
    tests/e2e/identity-honesty.spec.ts tests/e2e/identity-strings.spec.ts
  10 passed (21.9s)
```

`scripts/i18n-check.ts`: `totalKeysInTurkish: 1309` / `totalKeysInEnglish: 1309` — eklenen 15
anahtarın tamamı iki katalogda da var.

Fikstür temizliği doğrulandı (spec'in `afterAll`'ı):
```
tenant 0 applicationPart 0 opportunity 0
```

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/app/api/documents/export/route.ts` | Yeniden yazıldı: `requireTenantApi` + `withTenant`, çapraz kiracı 404, gerçek kuruluş/çağrı adı, `signedAt` kaldırıldı, `contentText` katalogdan |
| `src/lib/document-exporter.ts` | `templateBodyText()` eklendi; PDF/DOCX şablonlarındaki kalan sabit Türkçe etiketler kataloğa taşındı; tarih yereli `locale`'e bağlandı |
| `messages/tr.json`, `messages/en.json` | `DocumentExport` altına 15 anahtar (iki dilde) |
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/client.tsx` | Dışa aktarma bağlantılarına `opportunityId` + `locale` |
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx` | Aynı; `useLocale()` eklendi |
| `src/modules/m11/ui/PartBCollaborativeEditor.tsx` | Bağlantıya `locale`; `useLocale()` |
| `scripts/seed-doc-export-e2e.ts` | YENİ — iki kiracılı fikstür + rollback (seed eden temizler) |
| `tests/e2e/document-export-tenant-isolation.spec.ts` | YENİ — 5 test |

---

## 4. Riskler

1. **Uydurma yedek id artık 404 alıyor (ölçüldü).** `application/client.tsx:288`
   `partId={partB?.id || 'part-b-1'}` gönderiyor. Ölçüm:
   ```
   PROBE fallback partId  -> 404 {"error":"Not Found","code":"PART_NOT_FOUND"}
   PROBE no partId (şablon) -> 200 bytes 4136
   ```
   Yani PART_B satırı OLMAYAN bir kiracı editördeki "Resmî DOCX İndir" düğmesinden artık JSON
   404 görür (eskiden sessizce boş şablon inerdi). Kusur uydurma yedek id'de; §5'te bildirildi.
   Şablon indirme yolu (`partId` yok) çalışmaya devam ediyor.
2. **Paylaşılan ağaç:** `messages/tr.json` / `messages/en.json` dosyalarındaki 15 anahtarım,
   ben commit'lemeden önce başka bir ajanın `c4eee72` commit'ine karıştı (aynı çalışma ağacında
   `git add messages/`). İçerik doğru ve HEAD'de mevcut (15/15 anahtar iki dilde de doğrulandı),
   ama bu commit'in mesajı bu değişikliği anlatmıyor.
3. `locale` sorgu parametresi güvenilmeyen girdidir; yalnız `'en'` ya da `'tr'`'ye daraltılıyor
   (`searchParams.get('locale') === 'en' ? 'en' : 'tr'`), katalog anahtarı olarak kullanılmıyor.

---

## 5. Açık sorular (yol üstünde görülen, KAPSAM DIŞI — düzeltilmedi)

1. `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx:288` —
   `partId={partB?.id || 'part-b-1'}`: veritabanında karşılığı olmayan uydurma bir id. Doğru
   düzeltme, Part B satırı yokken düğmeyi şablon indirmeye yönlendirmek ya da düğmeyi hiç
   göstermemek. Ayrı kart ister.
2. `src/lib/document-exporter.ts` — `TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ PAKETİ` /
   `EUROPEAN COMMISSION - HORIZON EUROPE` başlık rozetleri kurum adı olarak sabit bırakıldı.
   Kurum adı çevrilmez, ama `AWARD_PACK` dışındaki HER belgeye "EUROPEAN COMMISSION" rozeti
   basılması ayrı bir dürüstlük sorusu — bu rozet neye dayanıyor?
3. `generateDocxBuffer` düz WordprocessingML XML üretiyor, gerçek OOXML (zip) paketi değil;
   `.docx` uzantısıyla sunuluyor (`file` → `XML 1.0 document text`). DSE §2.7 ile aynı gözlem.
4. Rotada `version` hâlâ örtük `1`; `FollowupDoc.version` okunmuyor, yani 3. sürüm bir doküman
   "Sürüm v1" diye iniyor.
5. `type` parametresi doğrulanmıyor: `?type=HERHANGİBİRŞEY` belge başlığına aynen basılıyor
   (XML/HTML kaçışı var, enjeksiyon değil; ama üretilen belge uydurma bir tür adı taşıyabilir).

---

## 6. Sonraki adım

- Kart `review`'e alındı; inceleyen §2.1 → §2.2 kırmızı→yeşil karşılaştırmasını ve iki yönlü
  404 ölçümünü kontrol etsin.
- §5.1 için ayrı kart açılması öneriliyor (uydurma yedek `partId`), çünkü bu değişiklikten sonra
  kullanıcıya görünen tek davranış farkı orada.
