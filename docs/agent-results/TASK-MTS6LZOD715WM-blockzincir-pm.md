# TASK-MTS6LZOD715WM — Part B'nin uydurma ortak yazarları, ölü LoginForm ve iki lint uyarısı

**Ajan:** blockzincir-pm (PM-EN) · **Dalga:** S12-3 · **Öncelik:** P0
**Dosyalarım:** `src/modules/m11/types.ts`, `src/modules/m11/ui/PartBCollaborativeEditor.tsx`,
`src/lib/document-exporter.ts`, `src/app/[locale]/login/LoginForm.tsx`

---

## 0. Kartın iddiası — önce ölçtüm

| İddia | Ölçüm | Sonuç |
|---|---|---|
| types.ts:107-237'de 8 uydurma ortak yazar/kuruluş | dizi 100–237 satırlarında; 8 bölümün **hepsi** `leadAuthor`+`leadAuthorOrg` taşıyor (5 ayrı kişi/kurum) | **DOĞRU** (aralık 100'de başlıyor) |
| Editörde 517, 583, 649, 696'da görünüyor | `grep -n "leadAuthor" ` → tam bu 4 satır | **DOĞRU** |
| `document-exporter.ts:165,296` üzerinden DOCX/PDF'e basılıyor | 165 = PDF/HTML, 296 = DOCX; ikisi de `${sec.leadAuthor} (${sec.leadAuthorOrg \|\| 'Konsorsiyum'})` | **DOĞRU** |
| LoginForm.tsx'in hiçbir import'u yok | repo geneli grep: yalnız kendi dosyası + bir test satırı | **DOĞRU** |
| PartBCollaborativeEditor 102 + 207 lint uyarısı | `pnpm lint` → 102:3 `tenantId` unused, 207:9 `handleSaveContent` useEffect bağımlılığı | **DOĞRU** |

Kartın ölçmediği, aynı dizide duran ek bulgu: uydurma isimler yalnız `leadAuthor` alanında
değil, **bölüm metinlerinin içinde** de vardı — `3.1_work_plan` içeriği
`WP1 (Lead: Demo SME Consultancy)`, `WP2 (Lead: METU TTO)`, `WP3 (Lead: Fraunhofer Institute)`,
`WP4 (Lead: Siemens AG)` diye yazıyordu; ayrıca hiçbir kayda dayanmayan rakamlar
(`€4.2B by 2030`, `420,000 metric tons of CO2`, `%18 maliyet düşüşü`, `>%99.2 doğruluk`)
her kiracının Part B'sinde kendi teklif metni gibi duruyordu. Aynı kusur sınıfı ve aynı
dosya olduğu için kapsam içinde ele aldım (gerekçe §2).

---

## 1. Ne yapıldı

### 1.1 `src/modules/m11/types.ts` — şablon artık yalnız iskelet
`DEFAULT_PART_B_SECTIONS` yeni bir başvurunun boş Horizon Europe çerçevesidir. Bir şablon
bölümü **kimin** yazacağını da **ne** yazacağını da bilemez, dolayısıyla artık ikisini de
iddia etmiyor:
- 8 bölümün `leadAuthor` / `leadAuthorOrg` / `lastModifiedBy` / `lastModifiedAt` alanları kaldırıldı.
- `content` alanları `''` yapıldı (yukarıdaki uydurma proje metni ve rakamları).
- **Korunan** (bir şablonun meşru olarak bildiği resmî çerçeve): `key`, `partGroup`, `title`,
  `targetPages`, `maxWords` — 8 bölüm, sayfa hedefleri ve kelime tavanları aynen duruyor.

Bölüm lideri artık ancak **gerçek** bir kullanıcı o bölümü üstlendiğinde oluşur:
`updateSectionContent` (m11/server/actions.ts) `lastModifiedBy`'ı oturumdan yazar. Sunucu
tarafında "lideri ata" yolu yok — bu `actions.ts`'te olurdu, o dosya bu dalgada bana
verilmedi (§5 açık soru).

### 1.2 `PartBCollaborativeEditor.tsx` — kayıt yoksa açık boş-durum
- Bölüm ağacındaki üç satır (517/583/649) ve aktif bölüm başlığı (696) artık
  `Lider: undefined (undefined)` değil, çeviriden gelen **"Lider: Atanmadı"** yazıyor.
- Yeni saf yardımcı `shortLeadLabel()`: yazar yoksa "atanmadı"; yazar var kurum yoksa
  **yerine bir kurum uydurmadan** yalnız yazarı basar.
- Dokunduğum iki `placeholder` i18n'e taşındı; YZ istem örneğindeki `Fraunhofer` adı
  kuruluş adı içermeyen bir örnekle değiştirildi.
- **Lint 102:** `tenantId` prop'u artık destructure edilmiyor (arayüzde kalıyor; her server
  action kiracıyı `requireTenantAction` ile oturumdan çözüyor — tarayıcıdan gelen kiracı
  kimliği zaten yetki olmamalı, gerekçe koda yazıldı).
- **Lint 207:** `handleSaveContent` `useCallback` içine alındı; otomatik kaydetme efekti
  artık her render'da 2.5 sn'lik zamanlayıcıyı kurup yıkmıyor.

### 1.3 `src/lib/document-exporter.ts` — dışa aktarımda uydurma kurum yok
- Yeni `leadAuthorText()`: kayıtlı kurum varsa onu, yoksa **hiçbir şeyi** basar; yazar
  kaydı yoksa "Lider yazar atanmadı" satırını yazar. `|| 'Konsorsiyum'` (kurumu bilinmeyen
  her yazara kurum uyduran ifade) silindi.
- Etiketler artık dosyanın kendi `DocumentExport` katalog kalıbından geliyor (iki dil).
- Yazar/kurum artık HTML'e `escapeHtml`, DOCX'e `escapeXml` ile giriyor.

### 1.4 `src/app/[locale]/login/LoginForm.tsx` — silindi
Hiçbir yerden import edilmiyordu (`/login` ve `/register` `AuthCard` render ediyor).
Erişilemeyen ikinci bir giriş formu, iki kopyanın sessizce ayrışması demekti.

### 1.5 Regresyon kilitleri (yeni test)
- `tests/fabricated-identity-strings.test.ts`: yeni `describe` — şablonun 8 bölümü sahipsiz
  ve metinsiz mi, m11 kaynaklarında 5 uydurma kişi/kurum adı kaldı mı, exporter'da
  `|| 'Konsorsiyum'` kaldı mı, i18n anahtarları iki dilde var mı.
- `tests/e2e/partb-template-identity.spec.ts` (**yeni**): gerçek Postgres fixture'ı (ultra
  plan + M11 `ON`, ApplicationPart satırı **yok** — kusurun yaşadığı durum), gerçek giriş,
  gerçek tarayıcı, iki dil.

---

## 2. Kapsam kararı (gerekçe)
Kart "8 uydurma ortak yazar/kuruluş … gerçek kayda bağla, kayıt yoksa açık boş-durum" diyor.
`content` metinleri kartta ayrıca anılmıyor; yine de kaldırdım çünkü **kartın adıyla saydığı
4 kuruluş** (`Demo SME Consultancy`, `METU TTO`, `Fraunhofer Institute`, `Siemens AG`)
bu metinlerin içinde de geçiyordu ve `document-exporter.ts:165/296` yolundan DOCX/PDF'e
aynı şekilde basılıyordu. Yalnız `leadAuthor` alanlarını temizlemek, kartın kapatmak istediği
kusuru yarı açık bırakırdı. Yerine yeni metin **yazmadım** (bu uydurmayı sürdürürdü); bölüm
boş başlıyor, ilerleme sayacı da dürüstçe 0 gösteriyor.

---

## 3. Kanıt (bu koşuda üretildi)

### 3.1 Kartın iddiasının ölçümü (değişiklikten önce)
```
$ pnpm lint | tail -6
/Users/macbook/AgentSpace/fabrika/src/modules/m11/ui/PartBCollaborativeEditor.tsx
  102:3  warning  'tenantId' is defined but never used. Allowed unused args must match /^_/u   @typescript-eslint/no-unused-vars
  207:9  warning  The 'handleSaveContent' function makes the dependencies of useEffect Hook (at line 261) change on every render.
                  To fix this, wrap the definition of 'handleSaveContent' in its own useCallback() Hook   react-hooks/exhaustive-deps
✖ 16 problems (0 errors, 16 warnings)

$ grep -rn "LoginForm" --include="*.ts*" . | grep -v node_modules
tests/fabricated-identity-strings.test.ts:242:    'src/app/[locale]/login/LoginForm.tsx',
src/app/[locale]/login/LoginForm.tsx:13: * `AuthCard`; a repo-wide grep for "LoginForm" finds only this file. Its demo
src/app/[locale]/login/LoginForm.tsx:19:interface LoginFormProps {
src/app/[locale]/login/LoginForm.tsx:23:export default function LoginForm({ locale }: LoginFormProps) {
   → tek kullanım bir testin dosya listesinde; hiçbir import yok.
```

### 3.2 Gerçek dışa aktarım — çalışan sunucudan indirildi
```
$ curl -s -o partb.docx "http://localhost:3000/api/documents/export?type=PART_B&format=docx&title=PartB"
invented identities:   0
unassigned lead lines: 8
official sections:     8

$ curl -s -o partb.html "http://localhost:3000/api/documents/export?type=PART_B&format=pdf&title=PartB"
invented identities:   1   ← tek eşleşme "Konsorsiyum Ortağı / Resmî Onay" i18n başlığı (DocumentExport.approverBoxTitle), uydurma kurum değil
unassigned lead lines: 8
fabricated figures:    0   ← 4.2B / 420,000 metric / 18% / 99.2% hiçbiri yok
```
(arama listesi: `Yılmaz|Müller|Rossi|Marcus Schmidt|Selin Kaya|Fraunhofer|Siemens AG|Politecnico|Demo SME Consultancy|METU TTO|Konsorsiyum`)

### 3.3 Gerçek tarayıcı — Part B editörü, iki dil
```
$ npx playwright test tests/e2e/partb-template-identity.spec.ts
Running 2 tests using 1 worker
  ✓  1 [chromium] › partb-template-identity.spec.ts › tr: no invented author, organisation or prose reaches the screen (1.8s)
  ✓  2 [chromium] › partb-template-identity.spec.ts › en: no invented author, organisation or prose reaches the screen (1.8s)
  2 passed (5.1s)
```
Ekran görüntüleri (bu koşuda üretildi):
- `docs/agent-results/TASK-MTS6LZOD715WM-screenshots/partb-section-tree-tr.png` — 8 bölümün
  hepsinde **"Lider: Atanmadı"**, üstte **"0 / 45 Sayfa (0 Kelime)"**, aktif bölümde
  **"Sorumlu: Atanmadı"**, editör boş, canlı yazar rozetinde oturumdaki gerçek kullanıcı.
- `.../partb-section-tree-en.png` — aynı ekran İngilizce: **"Lead: Not assigned"**,
  **"Lead author: Not assigned"**.
- `.../partb-editor-tr.png`, `.../partb-editor-en.png`

### 3.4 Testin gerçekten koruduğunun kanıtı (RED → GREEN)
`types.ts` HEAD sürümüne geri alındı, aynı testler koşuldu:
```
=== e2e against the ORIGINAL template (expect failure) ===
  ✘  1 › tr: no invented author, organisation or prose reaches the screen (11.4s)
  ✘  2 › en: no invented author, organisation or prose reaches the screen (11.2s)
  2 failed
=== restored; re-run (expect pass) ===
  ✓  1 (1.3s)   ✓  2 (1.3s)   2 passed
```
Birim kilidi için de aynısı — tek bir bölüme `leadAuthor` geri eklendiğinde:
```
× every default section ships unowned and unwritten
  AssertionError: 1.1_objectives carries a lead author: expected 'Dr. Mehmet Yılmaz' to be undefined
× the module source names none of the invented consortium members
  AssertionError: m11/types.ts still names "Dr. Mehmet Yılmaz"
Tests  2 failed | 25 passed (27)     → geri alınca: Tests  27 passed (27)
```

### 3.5 Kapı
```
$ pnpm lint       → ✖ 9 problems (0 errors, 9 warnings)   ← benim dosyalarımda 0 (önce 2 vardı)
$ pnpm typecheck  → $ tsc --noEmit   (çıktı yok = temiz)
$ pnpm test       → Test Files  99 passed | 2 skipped (101)
                    Tests  1127 passed | 8 skipped (1135)
```

### 3.6 Tam e2e paketi — 4 kırmızı BENİM DEĞİL (stash ile kanıtlandı)
Tam koşu: `84 passed, 6 failed`. Yalnız **kendi** dosyalarım `git stash push` ile ayrılıp
aynı specler tekrar koşuldu:
```
$ git stash push -- src/modules/m11/types.ts src/modules/m11/ui/PartBCollaborativeEditor.tsx \
                    src/lib/document-exporter.ts messages/*.json tests/fabricated-identity-strings.test.ts
$ npx playwright test dashboard-outcome-case f10-absence-not-zero gate-tenant-isolation m10-audit-identity m9-brief-generate-failure
  4 failed
    › dashboard-outcome-case.spec.ts:34
    › f10-absence-not-zero.spec.ts:140
    › gate-tenant-isolation.spec.ts:33
    › m10-audit-identity.spec.ts:54
  9 passed
```
Bu 4'ü değişikliklerim **olmadan da** kırmızı → benim değil (bu dalgadaki başka ajanların
eşzamanlı işleri / önceden kırık). Kalan 2 kırmızı (`m9-brief-generate-failure`) stash'siz
tekrar koşulduğunda **yeşil**:
```
$ git stash pop && npx playwright test tests/e2e/m9-brief-generate-failure.spec.ts
  3 passed (8.1s)
```
→ tam koşudaki m9 kırmızısı geçiciydi (paylaşılan dev sunucusu başka ajanlar tarafından
sürekli yeniden derleniyor), benim değişikliğim değil.

---

## 4. Değişen dosyalar
| Dosya | Değişiklik |
|---|---|
| `src/modules/m11/types.ts` | `DEFAULT_PART_B_SECTIONS` yalnız resmî iskelet: yazar/kurum/metin yok |
| `src/modules/m11/ui/PartBCollaborativeEditor.tsx` | `shortLeadLabel()`; 4 render noktasında açık boş-durum; 2 placeholder i18n; lint 102 + 207 kapatıldı |
| `src/lib/document-exporter.ts` | `leadAuthorText()`; `\|\| 'Konsorsiyum'` silindi; etiketler katalogdan; yazar/kurum kaçışlı |
| `src/app/[locale]/login/LoginForm.tsx` | **silindi** (ölü kopya) |
| `tests/fabricated-identity-strings.test.ts` | LoginForm satırı → "silinmiş kalsın" kilidi; yeni Part B şablon describe'ı |
| `tests/e2e/partb-template-identity.spec.ts` | **yeni** — gerçek fixture + gerçek tarayıcı, iki dil |
| `messages/tr.json`, `messages/en.json` | `PartBEditor.{leadShort,leadAuthorLabel,leadUnassigned,contentPlaceholder,aiPromptPlaceholder}` + `DocumentExport.{leadAuthorLabel,leadAuthorUnassigned}` |
| `docs/agent-results/TASK-MTS6LZOD715WM-screenshots/*` | 4 ekran görüntüsü |

**Verilen listenin dışına çıktığım 3 yer** (kural (f) gereği bildiriyorum, hepsi atanan işin
zorunlu sonucu):
1. `tests/fabricated-identity-strings.test.ts` — LoginForm'u silince bu test onu okumaya
   çalışıp kırılıyordu; satırı çıkardım ve yerine "geri gelmesin" kilidi koydum.
2. `messages/*.json` — kural (g): yeni metin iki dile de.
3. `tests/e2e/partb-template-identity.spec.ts` — yeni dosya; gerçek-tıklama doğrulaması
   başka türlü kanıtlanamıyordu.

---

## 5. Riskler
- **Mevcut Part B satırları değişmiyor.** Düzeltme yalnız *yeni* oluşturulan part'ları
  etkiler; veritabanında `content.sections` içinde uydurma yazarları taşıyan eski
  `ApplicationPart` satırları varsa onlar olduğu gibi kalır. Temizlik gerekiyorsa ayrı bir
  veri migrasyonu işidir (bu görevin kapsamı kod).
- **Bölüm lideri hiç atanamıyor.** Kayıt yoksa artık dürüstçe "Atanmadı" yazıyor, ama bir
  liderin *atanabileceği* bir yol yok — `updateSectionContent` yalnız `lastModifiedBy` yazıyor.
  Kullanıcı bir bölümü üstlendiğini ilan edemiyor (bkz. §6).
- Yeni e2e gerçek Postgres istiyor; DB kapalıysa `beforeAll` fixture'ı düşer (M6 speci ile
  aynı desen ve aynı bağımlılık).

---

## 6. Açık sorular
1. **Bölüm liderini kim atar?** Ürün kararı: (a) bir bölümü ilk kaydeden kişi otomatik lider
   olsun, (b) açık bir "bu bölümü üstleniyorum" düğmesi, (c) Part A ortak listesinden seçim.
   Hangisi olursa olsun yazma yolu `src/modules/m11/server/actions.ts`'te — o dosya bu
   dalgada bana verilmedi, dokunmadım.
2. Boş bölüm için resmî Horizon Europe yönergesini (ne yazılmalı) bir `guidance` alanı olarak
   göstermek ister miyiz? Şu an yalnız placeholder var; yönerge metni iki dilde yazılacak
   yeni içerik demek.

---

## 7. Yol üstünde gördüğüm, DÜZELTMEDİĞİM şeyler (kural (b) — dosya:satır ile bildirim)
1. `src/app/api/documents/export/route.ts:35-36` — her dışa aktarım, kim olursa olsun,
   sabit `opportunityTitle: 'HORIZON-CL5-2026-D3-01: …'` ve `tenantName: 'FonBridge
   Teknoloji A.Ş.'` basıyor. Exporter bu ikisi için zaten "belirtilmedi" durumunu destekliyor
   (`callUnspecified` / `organizationUnassigned`); route onları asla boş bırakmıyor.
2. `src/app/api/documents/export/route.ts:29-40` — `locale` hiç geçirilmiyor, exporter `tr`
   varsayılanına düşüyor: İngilizce kullanıcı Türkçe etiketli resmî belge indiriyor.
3. `src/lib/document-exporter.ts:183,187` — PDF/HTML yolunda `sec.title` ve `sec.content`
   **kaçışsız** interpolate ediliyor (DOCX yolu kaçırıyor). İçerik kiracının yazdığı metin →
   dışa aktarılan belgede HTML enjeksiyonu. Kendi dosyam ama kartın kapsamı değil; tek
   satırlık `escapeHtml` düzeltmesi, ayrı bir görev olarak açılmalı.
4. `generateDocxBuffer` **geçerli bir .docx üretmiyor**: dönen tampon ham
   WordprocessingML XML, zip konteyner değil. `unzip -l partb.docx` →
   "End-of-central-directory signature not found"; `xxd` ilk baytları `<?xml version="1.0"`.
   Word bu dosyayı `.docx` olarak açmaz. (Bu yüzden §3.2'deki kanıt ham metin üzerinden
   alındı.) Ayrı ve büyük bir iş.
5. `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx:639-643` —
   "Gönderim Kontrol Listesi" 5 maddenin hepsini her kiracı için `status: true` ve
   `"Mevcut: ~38 Sayfa"` diye sabit yazıyor; bizim Part B sayacı aynı ekranda 0 sayfa
   gösterirken bu liste "45 sayfa sınırı aşılmadı (Mevcut: ~38)" diyor. Ölçülmemiş uyum
   iddiası (CLAUDE.md kural 7).
6. i18n borcu: `application/client.tsx` başlıkları ("Part A & Part B Başvuru Üretim Paneli",
   "Part B Toplam Sayfa Bütçesi") ve editörün "Hedef / Şu an / Kelime" satırları İngilizce
   sayfada da Türkçe render ediliyor (`partb-section-tree-en.png`'de görülüyor). Dokunduğum
   satırları i18n'e taşıdım; kalanı kapsam dışı.
7. **Kural (e) ihlali — başka bir ajan benim işimi kendi commit'ine aldı.** `messages/*.json`
   içine eklediğim anahtarlar ben commit etmeden `266f00b feat(m1): real write path for
   /calls "Save search"` commit'ine girmiş:
   `git log -S"leadAuthorUnassigned" -- messages/tr.json` → `266f00b`. İçerik doğru olduğu
   için düzeltme gerekmiyor, ama geniş `git add` alışkanlığı bu dalgada da sürüyor.
   Ben kendi commit'imi geçici index (`GIT_INDEX_FILE`) ile attım ki o sırada başka ajanın
   stage'lediği dosyalar (`src/app/not-found.tsx`, `UserMenu.tsx`, `briefs/client.tsx` …)
   benim commit'ime karışmasın.

---

## 8. Sonraki adım
1. §6.1'i ürün olarak karara bağla; kararı `actions.ts` sahibi ajana görev olarak ver
   (bölüm lideri atama yolu + kalıcılık + test).
2. §7.4 (bozuk .docx) ve §7.3 (kaçışsız HTML) için ayrı P1 kartlar — ikisi de dışa aktarılan
   resmî belgeyi etkiliyor.
3. §7.1/§7.2 export route düzeltmesi: kayıt yoksa "belirtilmedi", ve `locale` geçir.
4. §7.5 kontrol listesini gerçek ölçüme bağla (sayfa sayısı zaten hesaplanıyor).
