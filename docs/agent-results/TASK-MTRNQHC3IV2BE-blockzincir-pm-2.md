# TASK-MTRNQHC3IV2BE — 2. geçiş: tam yüzey doğrulaması (S12 Dalga 7)

## 0. Özet

Kartın iddiası: uydurma kimlik dizeleri ("Dr. Mehmet Yılmaz" / "Demo SME Consultancy" ve
akrabaları) ekranda ve dışa aktarımda hâlâ görünüyor; bugün iki ayrı yerde daha
(`m11/types.ts`, `documents/export/route.ts`) bulunmuş, kısmi kapanma geçmişi var.

**Sonuç: kart artık YANLIŞ — repo genelinde tarandı, iki ek nokta da dahil olmak üzere tüm
bilinen yüzeyler bugün (2026-09-08), bu görev başlamadan ÖNCE, üç ayrı commit'le kapatılmış:**

| Commit | Saat | Kapsam |
|---|---|---|
| `77579d0` fix(identity): bind every invented name, org and byline to a real record | 02:18 | auth.ts, UserMenu.tsx, blog.ts, login sayfaları |
| `22b5406` fix(m11): a Part B nobody has written names nobody | 08:08 | `m11/types.ts` (`DEFAULT_PART_B_SECTIONS`), `PartBCollaborativeEditor.tsx` |
| `96c4166` fix(documents): require a session and scope the export to the caller's tenant | 09:34 | `src/app/api/documents/export/route.ts`, `document-exporter.ts` |

Bu geçişte **kaynak kodunda düzeltilecek bir kalıntı bulunmadı**. Görev, doğrulamayı
gerçek testler + gerçek grep ile tekrarlamaktan ibaret kaldı (aşağıda). Board'daki
`TASK-MTS6LZOD715WM` ve `TASK-MTS9VGEKE8N3B` kartları da bu iki commit'le fiilen kapanmış
durumda ama board'da hâlâ `review`'da — o kartları taşımak bu görevin kapsamında değil,
sahiplerine bırakıldı.

## 1. Repo geneli tarama (gerçek komut çıktısı)

```
$ grep -rn "Dr. Mehmet Yılmaz\|Demo SME Consultancy\|Prof. Klaus Müller\|Selin Kaya\|Sofia Rossi\|Marcus Schmidt" \
    --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" --include="*.sql" . \
    | grep -v node_modules
```

İsabetler dört kategoriye ayrılıyor:

1. **`src/**` içindeki tüm isabetler yorum satırı** (JSDoc / inline açıklama, "used to
   carry...", "old X constant signed..."). Canlı bir değişken/varsayılan değer olarak HİÇBİR
   isabet yok. Örnek dosyalar: `auth.ts:15`, `blog.ts:4-5`, `UserMenu.tsx:517`,
   `workspaces.ts:9`, `document-exporter.ts:56`, `m11/types.ts:107-109` (JSDoc, fonksiyonun
   üstündeki tarihsel açıklama), `PartBCollaborativeEditor.tsx:130,185,192`.
   → **Meşru**: bunlar "bu isim eskiden buradaydı, artık yok" diyen geliştirici notları;
   kaldırılırsa gelecekteki bir ajan aynı hatayı fark etmeden tekrar üretebilir. Değer olarak
   kalmadıkları teyit edildi (`grep -n "leadAuthor\b" m11/types.ts` → yalnız tip tanımı ve
   opsiyonel alan, `DEFAULT_PART_B_SECTIONS` içinde hiçbir `leadAuthor:` satırı yok).
2. **`tests/modules/m11.test.ts`**: `acquireSectionLock`, `updateSectionContent`,
   `addSectionComment`, `updatePresenceHeartbeat` gibi fonksiyonlara **parametre olarak**
   geçilen fixture adları ("Dr. Mehmet Yılmaz", "Prof. Klaus Müller", "Dr. Sofia Rossi").
   → **Meşru fixture**: bu fonksiyonlar herhangi bir çağıranın verdiği ismi kabul edip
   kaydediyor; test, kilit/yorum/presence mekaniğini kontrol ediyor, varsayılan değer
   iddia etmiyor. Adın kendisi rastgele bir insan adı olabilirdi, davranışı değiştirmiyor.
3. **`tests/fabricated-identity-strings.test.ts`, `tests/e2e/*.spec.ts`,
   `tests/fabricated-fallbacks.test.ts`**: bu isimler **negatif iddia** olarak geçiyor —
   "bu isim ekranda GÖRÜNMEMELİ" testleri. Regresyon bekçisi, doğru yerde.
4. **`docs/agent-results/*.md`**: geçmiş görev raporları — tarihsel kayıt, kod değil.

`prisma/`, `messages/`, `scripts/` içinde **sıfır isabet** (aşağıda kanıt).

```
$ grep -rn "Dr. Mehmet Yılmaz\|Demo SME Consultancy\|Prof. Klaus Müller\|Selin Kaya\|Sofia Rossi\|Marcus Schmidt" prisma/ messages/ scripts/
(boş çıktı)
```

`src/lib/dual-approval.ts` ve `src/modules/m10/server/actions.ts` (bugün erken TASK-MTR60M5ESB5PZ
kapsamında düzeltilmiş) için de ayrı doğrulama:

```
$ grep -n "Mehmet Yılmaz" src/lib/dual-approval.ts src/modules/m10/server/actions.ts
(boş çıktı, exit 1)
```

## 2. Kartın işaret ettiği iki ek nokta — tek tek doğrulama

### 2.1 `src/modules/m11/types.ts` (`DEFAULT_PART_B_SECTIONS`)

Şu an sekiz section da yalnız yapı taşıyor (`key`, `partGroup`, `title`, `targetPages`,
`maxWords`, `content: ''`) — hiçbirinde `leadAuthor`/`leadAuthorOrg`/`lastModifiedBy`
alanı YOK. Tip tanımında bu alanlar hâlâ var ama **opsiyonel** (`leadAuthor?: string`) ve
yalnız gerçek bir oturumun `updateSectionContent` çağrısıyla doldurulacak şekilde
tasarlanmış (commit `22b5406`).

Ekranda: `PartBCollaborativeEditor.tsx:721-724` — `leadAuthor` boşsa
`tEditor('leadUnassigned')` ("Atanmadı" / "Not assigned") basıyor, `undefined (undefined)`
değil. `messages/tr.json:1011` ve `messages/en.json:1011` bu anahtarı taşıyor.

**Gerçek e2e ile doğrulandı** (gerçek Postgres fixture, gerçek tarayıcı, iki dil):

```
$ npx playwright test tests/e2e/partb-template-identity.spec.ts --reporter=list
Running 2 tests using 1 worker
  ✓ tr: no invented author, organisation or prose reaches the screen (3.1s)
  ✓ en: no invented author, organisation or prose reaches the screen (1.6s)
2 passed (6.0s)
```

Bu test gerçek bir `m11-e2e@fabrika.test` kiracısı açıp Part B editörünü render ediyor ve
ekran metninde `INVENTED` listesindeki 10 dizeden (Mehmet Yılmaz, Klaus Müller, Selin Kaya,
Sofia Rossi, Marcus Schmidt, Demo SME Consultancy, Fraunhofer, METU TTO, Politecnico di
Milano, Siemens AG) hiçbirinin geçmediğini doğruluyor.

### 2.2 `src/app/api/documents/export/route.ts`

Commit `96c4166` route'a `requireTenantApi()` + `withTenant()` ekledi; `tenantName`,
`opportunityTitle` artık DB'den okunuyor, sabit `"FonBridge Teknoloji A.Ş."` ve uydurma
`signedAt` kaldırıldı. `document-exporter.ts`'teki `leadAuthorText()` fonksiyonu da aynı
"Atanmadı" mantığını DOCX/HTML çıktısına uyguluyor (`leadAuthorUnassigned` mesaj anahtarı).

**Gerçek e2e ile doğrulandı** (gerçek indirme, iki kiracı, gerçek buffer içeriği okundu):

```
$ npx playwright test tests/e2e/document-export-tenant-isolation.spec.ts --reporter=list
[seed-doc-export-e2e] ready — A=doc-export-e2e-tenant-a/... B=doc-export-e2e-tenant-b/...
  ✓ signed out: the export refuses with 401 and hands over no content
  ✓ tenant A clicks "Resmî DOCX İndir" and gets its OWN organisation, not FonBridge
  ✓ tenant A asking for tenant B's partId gets 404 and none of B's text
  ✓ tenant B asking for tenant A's partId gets 404 as well
  ✓ the printable document follows the session language and states nothing was signed
5 passed
```

İkinci test özellikle indirilen DOCX buffer'ının içeriğini okuyup gerçek kiracı adını
içerdiğini, `FonBridge` dizesinin geçmediğini doğruluyor — bu, kartın istediği "ekranda ve
indirilen dosyada gerçekten görünmediğini gerçek tıklamayla göster" şartını karşılıyor.

## 3. Birim testleri (gerçek çıktı)

```
$ npx vitest run tests/fabricated-identity-strings.test.ts tests/modules/m11.test.ts \
    tests/document-exporter.test.ts tests/fabricated-fallbacks.test.ts
 Test Files  4 passed (4)
      Tests  65 passed (65)
```

## 4. Tüm ilgili e2e'ler (gerçek tarayıcı + gerçek DB, tek koşu)

```
$ npx playwright test tests/e2e/document-export-tenant-isolation.spec.ts \
    tests/e2e/invoice-export-real-record.spec.ts tests/e2e/identity-strings.spec.ts \
    tests/e2e/identity-honesty.spec.ts --reporter=list
18 passed (15.2s)
```

## 5. Yapılan düzeltme

**Yok.** Bu geçişte kaynak kodunda değişiklik gerekmedi — kartın işaret ettiği tüm yüzeyler
(orijinal beş + sonradan bulunan iki) bu görev başlamadan önceki üç commit'le kapanmıştı.
Doğrulama gerçek testlerle tekrarlandı, yeni kalıntı çıkmadı.

## 6. Değişen dosyalar

- `docs/agent-results/TASK-MTRNQHC3IV2BE-blockzincir-pm-2.md` (bu rapor) — tek değişiklik.

## 7. Riskler

- Board'da `TASK-MTS6LZOD715WM` ve `TASK-MTS9VGEKE8N3B` hâlâ `review` durumunda duruyor;
  kod zaten düzeltilmiş olsa da kartlar kapatılmadıkça başka bir ajan aynı taramayı tekrar
  yapıp zaman kaybedebilir (bu görevde de neredeyse öyle oldu). Kart sahiplerinin veya
  lead'in bu iki kartı `done`'a taşıması öneriliyor.
- `LoginForm.tsx` (önceki raporda "ölü kod, import edilmiyor" olarak işaretlenmişti) hâlâ
  repoda duruyor; bu görevin kapsamı dışında, dokunulmadı.

## 8. Açık sorular

1. `TASK-MTS6LZOD715WM` ve `TASK-MTS9VGEKE8N3B` kartlarını kim `done`'a taşıyacak — bu
   görevin sahibi değilim, board güncellemesi öneri olarak bırakılıyor.
2. `LoginForm.tsx` silinsin mi (önceki rapordan kalma açık soru, bu görevde tekrar
   gündeme gelmedi, kapsam dışı).

## 9. Sonraki adım

Kod tarafında bir şey kalmadı. Board'da review'da bekleyen `TASK-MTS6LZOD715WM` /
`TASK-MTS9VGEKE8N3B` kartlarının kapatılması ve bu kartın (`TASK-MTRNQHC3IV2BE`) `done`'a
taşınması öneriliyor.
