# TASK-MTRHZIWHU2SKA — İndirilen belgeye uydurma imza sahibi yazılıyor (P0)

Ajan: `blockzincir-pm` · Dal: `dev` · Tarih: 2026-09-07

## 1. Ne yapıldı

**Kök neden.** `src/lib/document-exporter.ts:128` her dışa aktarılan belgenin imza bloğuna
sabit `İsim: Dr. Mehmet Yılmaz` / `Unvan: Ar-Ge Direktörü` basıyordu. Kiracıdan, kullanıcıdan
ve herhangi bir kayıttan bağımsızdı: resmî görünen bir PDF, onunla hiçbir ilgisi olmayan bir
kişiyi "yetkili imza sahibi" olarak gösteriyordu. Dahası `signedAt` tek başına "✓ Dijital
İmzalandı" damgası basmaya yetiyordu — kimin imzaladığına dair hiçbir kanıt yokken.

**Yapılan (`src/lib/document-exporter.ts`)**

1. `DocumentSignatory` (ad, unvan, kurum, imza tarihi) tipi eklendi; `ExportDocumentData`
   artık `signatory` ve `approver` alanlarını taşıyor. İmza bloğu **yalnızca** bu kayıttan
   doldurulur.
2. Kayıt yoksa isim UYDURULMAZ: blok "İmzalayan atanmadı" durumunu ve açıklamasını gösterir,
   hiçbir ad basılmaz. (Patronun e-Fatura ilkesi + `src/lib/user-display.ts` emsali.)
3. `signatureState()` kuralı: bir belge ancak **gerçek imzacı kaydı VE imza tarihi** varsa
   "imzalandı" sayılır. `signedAt` tek başına artık hiçbir şey iddia edemez.
4. Uydurma varsayılanlar kaldırıldı: `tenantName = 'FonBridge Teknoloji A.Ş.'` ve
   `opportunityTitle = 'HORIZON-CL5-2026-D3-01: …'` yerine "Kuruluş belirtilmedi" /
   "Çağrı belirtilmedi" (hem PDF hem DOCX yolunda).
5. Kullanıcıya görünen tüm yeni metin `messages/tr.json` + `messages/en.json` içindeki
   `DocumentExport` ad alanından geliyor (CLAUDE.md kural 8). Dışa aktarıcı senkron ve
   React dışı bir fonksiyon olduğu için `t()`/`getTranslations()` çağıramaz; katalogları
   `src/i18n/request.ts` ile aynı dosyalardan doğrudan okuyor — bu sayede bir dilde eksik
   anahtar **derleme hatası** oluyor.
6. İmzacı alanları (saklanan kullanıcı girdisi) artık HTML/XML'e kaçışlanarak basılıyor.

**Aynı sınıfın M11 yüzeyi (`src/modules/m11/ui/PartBCollaborativeEditor.tsx`)**

7. `currentUserId = 'usr-me'` / `currentUserName = 'Dr. Mehmet Yılmaz'` sabitleri kaldırıldı.
   Kimlik oturumdan geliyor; ad için ortak `displayUserName()` (gerçek ad → e-posta yerel
   kısmı → çevrilmiş "İsimsiz kullanıcı") kullanılıyor. Ağaçta `<SessionProvider>` bulunmadığı
   için (`grep -rn "SessionProvider" src/app` → 0 sonuç) `useOptionalSession()` tek başına
   `null` dönüyordu; bu yüzden NextAuth'un kendi `/api/auth/session` uç noktası okunuyor.
8. Uydurma iş birlikçiler silindi: her kiracının her Part B'sinde "Prof. Klaus Müller" ve
   "Dr. Sofia Rossi" **canlı yazar** olarak görünüyordu. Presence listesi artık boş başlıyor ve
   `updatePresenceHeartbeat`'in zaten döndürdüğü **gerçek** listeyle doluyor (dönen değer
   çöpe atılıyordu).
9. `demoComments()` / `demoRevisions()` kaldırıldı — boş bir bölüm artık boş görünüyor;
   sürüm geçmişi için dürüst boş durum eklendi (`PartBEditor.noRevisions`, iki dilde).
10. Kurum bilgisi oturumda yok: uydurma yerine **hiç gösterilmiyor** (presence/yorum/sürüm
    satırlarında). Eski kod ayrıca `user.org.split(' ')[0]` ile kurumu ilk kelimeye kırpıyordu.

## 2. Kanıt

### 2.1 Birim testler — `pnpm vitest run tests/document-exporter.test.ts tests/i18n.test.ts`

```
 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 Test Files  2 passed (2)
      Tests  13 passed (13)
   Duration  144ms
```

Yeni testler (`tests/document-exporter.test.ts`, `describe('signature block attribution')`):
kayıttan gelen imzacı basılıyor · kayıt yokken **hiçbir ad basılmıyor** ve imza iddia
edilmiyor (`signedAt` verili olsa bile) · tarihi olmayan kayıt "İmza Bekliyor" · boş ad =
kayıt yok · `locale: 'en'` İngilizce etiket · imzacı adı kaçışlanıyor · kurum/çağrı yokken
uydurma varsayılan basılmıyor (PDF + DOCX).

### 2.2 Gerçek belge üretimi — çalışan uygulamanın kendi rotası

```
$ curl -s 'http://localhost:3000/api/documents/export?type=NDA&format=pdf&title=Karsilikli+Gizlilik+Sozlesmesi'
HTTP 200 | 4207 bytes

$ grep -A14 'div class="signature-section"' export-nda.html
  <div class="signature-section">
    <div class="sig-box">
      <strong>Koordinatör / Yetkili İmza:</strong><br><br>
      <span class="sig-unassigned">Bu belgeye yetkili bir imzacı atanmadı. İmza alanı, imzalayan kayıt olarak atandığında doldurulur.</span><br>
      <span class="sig-status unassigned">İmzalayan atanmadı</span>
    </div>

    <div class="sig-box">
      <strong>Konsorsiyum Ortağı / Resmî Onay:</strong><br><br>
      <span class="sig-unassigned">Bu belgeye yetkili bir imzacı atanmadı. İmza alanı, imzalayan kayıt olarak atandığında doldurulur.</span><br>
      <span class="sig-status unassigned">İmzalayan atanmadı</span>
    </div>
  </div>

$ grep -c "Mehmet Yılmaz\|Ar-Ge Direktörü" export-nda.html
0

$ grep -A2 'E-İmza Onay Durumu' export-nda.html
      <td class="label">E-İmza Onay Durumu:</td>
      <td>İmzalayan atanmadı</td>
```

Üretilen belgenin tamamı: `TASK-MTRHZIWHU2SKA-screenshots/export-nda.html`
Ekran görüntüsü: `TASK-MTRHZIWHU2SKA-screenshots/export-nda-unassigned-signatory.png`
(rota `signedAt: new Date()` gönderdiği hâlde belge artık "imzalandı" demiyor — düzeltmenin
ikinci yarısı da çalışıyor.)

### 2.3 M11 ortak yazım ekranı — gerçek tarayıcı, gerçek oturum, gerçek tıklama

Playwright ile `alice@fabrika.test` oturumu mint edilip (repo'nun kendi
`tests/e2e/identity-honesty.spec.ts` deseni) `/tr/main/opportunities/demo-opp-1/application`
açıldı; sürüm geçmişi ve yorum çekmeceleri **tıklanarak** kontrol edildi:

```
URL: http://localhost:3000/tr/main/opportunities/demo-opp-1/application
--- Part B editor, session = Alice (alice@fabrika.test) ---
fabricated "Klaus Müller" present : false
fabricated "Sofia Rossi" present  : false
presence chips                    : [ 'A', 'A', 'Part A & B Aktif', 'Alice\n1.1' ]
[Geçmiş] honest empty state  : true
[Yorum] fabricated reviewers : false
[Yorum] honest empty state   : true
local dev DB restored (plan + M11 module state)
```

Ekran görüntüleri: `e2e-partb-editor.png` (canlı yazar çubuğu artık **1 aktif: Alice** —
oturumdaki gerçek kullanıcı, uydurma kurum etiketi yok), `e2e-partb-history.png`,
`e2e-partb-comments.png`.

Not: M11 planla kapalı olduğu için doğrulama sırasında yerel dev veritabanında
`Subscription.planId` geçici olarak `ultra` yapıldı ve `ModuleState(M11)=ON` eklendi;
script `finally` bloğunda ikisini de **geri aldı** (çıktıdaki son satır). Şema/migration
değişikliği yok.

### 2.4 Kapı

```
$ npx tsc --noEmit
(çıktı yok — temiz)

$ npx eslint src/lib/document-exporter.ts src/modules/m11/ui/PartBCollaborativeEditor.tsx tests/document-exporter.test.ts
  src/lib/document-exporter.ts
    155:9  warning  'isHorizon' is assigned a value but never used
  src/modules/m11/ui/PartBCollaborativeEditor.tsx
    102:3  warning  'tenantId' is defined but never used
    207:9  warning  'handleSaveContent' ... react-hooks/exhaustive-deps
  ✖ 3 problems (0 errors, 3 warnings)
```

Üç uyarı da **değişiklikten önce de vardı** — `git stash` ile önceki sürüm lint'lendi ve aynı
üç uyarı (artı benim kaldırdığım dördüncüsü, kullanılmayan `setPresenceList`) çıktı. 0 hata.

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/document-exporter.ts` | İmzacı kayıttan; kayıt yoksa ad basılmaz; uydurma varsayılanlar kaldırıldı; kaçışlama; i18n |
| `tests/document-exporter.test.ts` | 7 yeni regresyon testi (uydurma ad + sahte "imzalandı" iddiası) |
| `src/modules/m11/ui/PartBCollaborativeEditor.tsx` | Kimlik oturumdan; uydurma iş birlikçi/yorum/sürüm seed'leri kaldırıldı; gerçek presence listesi |
| `messages/tr.json`, `messages/en.json` | `DocumentExport` (13 anahtar) + `PartBEditor.noRevisions`, iki dilde |

## 4. KAPSAM DIŞI — aynı uydurma kimliği taşıyan, DOKUNMADIĞIM yerler

Kartın istediği gibi adıyla bildiriyorum (hiçbirine dokunulmadı):

| Dosya:satır | Bulgu |
|---|---|
| `src/lib/blog.ts:27` | Blog yazarı sabit `Dr. Mehmet Yılmaz` — gerçek bir yazar kaydına bağlı değil |
| `src/app/[locale]/admin/blog/client.tsx:49,76` | Yeni blog yazısının `authorName` varsayılanı sabit `Dr. Mehmet Yılmaz` |
| `src/app/[locale]/login/LoginForm.tsx:216` | Demo giriş kartında sabit `Dr. Mehmet Yılmaz` |
| `src/app/[locale]/login/AuthCard.tsx:323` | Aynı demo giriş kartı, ikinci yüzey |
| **`src/modules/m11/types.ts:107,120,216,224`** | `DEFAULT_PART_B_SECTIONS` içinde `leadAuthor`/`lastModifiedBy` sabit `Dr. Mehmet Yılmaz` + `leadAuthorOrg: 'Demo SME Consultancy'`. **Ekranda hâlâ görünüyor** (`PartBCollaborativeEditor.tsx:696` → "Sorumlu: **Dr. Mehmet Yılmaz** (Demo SME Consultancy)") ve DOCX/PDF dışa aktarımına `sections[].leadAuthor` olarak giriyor. Aynı P0 sınıfı; ayrı kart ister. |
| `src/app/api/documents/export/route.ts:35-37` | Dışa aktarma rotası `tenantName`/`opportunityTitle` değerlerini sabit yazıyor ve `signedAt: new Date()` gönderiyor; oturumdan/kiracıdan hiçbir şey okumuyor. Dışa aktarıcı artık dürüst ama **çağıran hâlâ uydurma kuruluş adı besliyor** (ekran görüntüsündeki "Başvuran Kuruluş: FonBridge Teknoloji A.Ş."). |
| `src/modules/m11/server/actions.ts:131-136, 202, 258, 347` | Sunucu eylemleri `userId`/`authorName`/`authorOrg`'u **istemciden** parametre olarak alıyor ve doğrulamadan yazıyor. Artık gerçek oturumdan besleniyor ama kimlik yine de istemci-beyanı; kilit/sürüm/yorum sahipliği sahtelenebilir. Sunucu tarafında `auth()`'tan türetilmeli. |

`src/lib/auth.ts:21` (DEMO_PROFILES) bilinçli bir demo hesap eşlemesidir (gerçek bir giriş
e-postasına bağlı), uydurma atıf saymadım — bilgi olsun diye not ediyorum.

## 5. Riskler

- **Dışa aktarıcı artık dürüst ama çağıran değil.** `signatory` alanını hiçbir çağıran
  doldurmuyor; bu yüzden bugün ÜRETİLEN her belge "İmzalayan atanmadı" gösterir. Bu doğru
  davranış (uydurmaktan iyidir) ama ürün açısından eksik: `route.ts` kapsamım dışında olduğu
  için imzacıyı besleyen kayıt bağlanmadı. Bkz. §4 ve §6.
- **Presence/yorum/sürüm listeleri artık boş açılıyor.** Demo/satış ekranı "cansız"
  görünebilir. Bilinçli tercih: sahte konsorsiyum ortağı göstermektense boş göstermek.
- `/api/auth/session` istemciden bir ek istek; `<SessionProvider>` eklenirse bu fallback
  kendiliğinden devre dışı kalır (context öncelikli).

## 6. Açık sorular

1. İmzacı hangi kayıttan gelmeli — belgeyi onaylayan kullanıcı (`Approval`/4-Eyes akışı) mı,
   yoksa kiracının kayıtlı yetkili temsilcisi (`Tenant`/`Organization` üzerinde bir alan) mı?
   Şema'da bugün "yetkili imzacı" alanı YOK; tip hazır, kaynak kararı ürün kararı.
2. `DEFAULT_PART_B_SECTIONS` (types.ts) uydurma lider yazarları: temizlenecek mi, yoksa
   "örnek şablon" olarak açıkça etiketlenecek mi?

## 7. Sonraki adım

- (P0, ayrı kart) `src/modules/m11/types.ts` uydurma `leadAuthor`/`lastModifiedBy` temizliği.
- (P1) `src/app/api/documents/export/route.ts`: kiracı adını ve imzacıyı gerçek kayıttan
  okuyup `signatory`/`tenantName` olarak geçirmek; `signedAt`'i uydurmayı bırakmak.
- (P1) M11 sunucu eylemlerinde kimliği istemci parametresi yerine `auth()`'tan türetmek.
- Kalıcı e2e koruması için `tests/e2e/part-b-signatory-honesty.spec.ts` — bu kartın dosya
  sahipliği dışında olduğu için açılmadı; istenirse eklerim.
