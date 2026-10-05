# TASK-MTRNQHC3IV2BE — P0 uydurma kimlik dizeleri

**Ajan:** blockzincir-pm (PM-EN) · **Tarih:** 2026-09-08 · **Branch:** dev
**Ekran görüntüleri & komut çıktıları:** `docs/agent-results/TASK-MTRNQHC3IV2BE-screenshots/`

---

## 0. Kartın iddiası — ÖNCE doğrulandı

Kart iki şey söylüyordu. Biri doğru çıktı, biri YANLIŞ.

### 0.1 Altı konum: İDDİA DOĞRU ✅

Kartta adı geçen altı konumun hepsi ölçüldü ve uydurma dize oradaydı:

| Konum | Bulunan |
|---|---|
| `src/lib/auth.ts:21` | `name: "Dr. Mehmet Yılmaz"` (+ `"Prof. Dr. Ayşe Kaya"`, `"Dr. Can Demir"`) |
| `src/components/UserMenu.tsx:532` | `<span>Demo SME Consultancy</span>` (+ `Horizon Research Lab`) |
| `src/lib/blog.ts:27` | `name: 'Dr. Mehmet Yılmaz'` |
| `src/app/[locale]/admin/blog/client.tsx:48,75` | `authorName: 'Dr. Mehmet Yılmaz'` |
| `src/app/[locale]/login/LoginForm.tsx:215` | `>Dr. Mehmet Yılmaz</div>` |
| `src/app/[locale]/login/AuthCard.tsx:322` | `>Dr. Mehmet Yılmaz</div>` |

Ancak kartın `auth.ts:21` için kullandığı tanım — **"varsayılan oturum adı"** — yanlış.
Ölçüm: `DEMO_PROFILES` bir e-posta→profil haritası; `mehmet@fonbridge.app` ile giren
oturuma uygulanıyor, varsayılan değil. **Gerçek kusur daha kötü:** `auth.ts` jwt
callback'i `token.name = demo.name` satırıyla bu adı **her token yenilemesinde**
DB'deki `User.name` üzerine yazıyordu — yani o adrese kayıtlı gerçek bir kullanıcı
kendi adını ayarlasa bile UI'da "Dr. Mehmet Yılmaz" görünüyordu.

### 0.2 `src/modules/m11/types.ts`: KARTIN İDDİASI YANLIŞ ❌

Kart: *"TASK-MTRHZIWHU2SKA raporu `leadAuthor`/`lastModifiedBy` sabitleri olduğunu
söylüyordu ama bugünkü grep orada HİÇBİR eşleşme bulmadı."*

**Bu ölçüm yanlış. Dosya temiz DEĞİL.** Bugün (2026-09-08) çalıştırılan grep:

```
$ grep -rn "leadAuthor\|lastModifiedBy" src/modules/m11/types.ts
src/modules/m11/types.ts:107:    leadAuthor: 'Dr. Mehmet Yılmaz',
src/modules/m11/types.ts:108:    leadAuthorOrg: 'Demo SME Consultancy',
src/modules/m11/types.ts:120:    lastModifiedBy: 'Dr. Mehmet Yılmaz',
src/modules/m11/types.ts:129:    leadAuthor: 'Prof. Klaus Müller',
src/modules/m11/types.ts:150:    leadAuthor: 'Doç. Dr. Selin Kaya',
src/modules/m11/types.ts:163:    leadAuthor: 'Dr. Sofia Rossi',
src/modules/m11/types.ts:183:    leadAuthor: 'Marcus Schmidt',
src/modules/m11/types.ts:216:    leadAuthor: 'Dr. Mehmet Yılmaz',
src/modules/m11/types.ts:224:    lastModifiedBy: 'Dr. Mehmet Yılmaz',
src/modules/m11/types.ts:233:    leadAuthor: 'Prof. Klaus Müller',
```
(27 eşleşme; yukarıda kısaltıldı. Tam çıktı: `screenshots/05-grep-after.txt`)

Yani **önceki rapor (TASK-MTRHZIWHU2SKA) haklıydı**, kartın yeniden ölçümü hatalı.
Bunlar ekranda da görünüyor: `m11/ui/PartBCollaborativeEditor.tsx:517,583,649,696`
bu alanları render ediyor. Bu kartın düzeltme listesinde OLMADIĞI ve ayrı bir iş
(8 uydurma ortak yazar + revizyon geçmişi + doküman dışa aktarımı) olduğu için
**kural (b) uyarınca düzeltilmedi, bildirildi** — bkz. §4.

---

## 1. Ne yapıldı

Altı konumun hepsi gerçek kayda bağlandı; kayıt yoksa açık boş-durum bırakıldı.

**A. Oturum kimliği — `src/lib/auth.ts`**
- `DEMO_PROFILES` artık **kişi değil kuruluş** tohumluyor: `name` alanı tamamen
  kaldırıldı; `orgName`/`orgType`/`role`/`isPlatformAdmin` kaldı (ilk girişte
  Tenant + Workspace + Membership yaratmak için gereken iskele).
- Görünen ad artık kullanıcının **girdiği adresten** türüyor
  (`email.split("@")[0]` → başlık düzeni), sonrasında `User` kaydı ne diyorsa o.
- jwt callback'teki `token.name = demo.name` **silindi** (yalnız platform-admin
  bayrağı kaldı). DB adının üzerine yazan satır buydu.
- Süperadmin yükseltmesi artık yalnız bayrağı yazıyor: `data: { isPlatformAdmin: true }`.
  Eskiden `name: computedName` de yazıyor, kullanıcının seçtiği adı her girişte eziyordu.

**B. Çalışma alanı seçici — `src/components/UserMenu.tsx` + yeni `src/lib/workspaces.ts`**
- İki uydurma kuruluş (`Demo SME Consultancy`/`demo-sme`, `Horizon Research Lab`/`horizon-lab`)
  kaldırıldı. Bunlar app shell'de olduğu için **her kiracı, kendisine ait olmayan iki
  kuruluşu ve üyeliğinin kapsamadığı URL'lere giden linkleri** görüyordu.
- Yeni `listSessionWorkspaces()` gerçek `Workspace` satırlarını okuyor: `withTenant`
  içinden (CLAUDE.md §1, RLS DB'de uygulanıyor), `deletedAt: null`, ve
  `Membership.workspaceIds` boşsa tenant'ın tümü / doluysa yalnız o id'ler
  (şema yorumuna birebir uygun).
- Kayıt yoksa / sorgu patlarsa: `UserIdentity.noWorkspace` boş-durumu (tr+en).
- `activeWorkspace` fallback'i `'demo-sme'` iken **null** oldu; menü içi rota linkleri
  artık oturumun ilk gerçek workspace'ine gidiyor.
- Her iki shell (app + admin) ve mobil başlıklar listeyi sunucudan besliyor.

**C. Blog yazarı — `src/lib/blog.ts`, 3 render yüzeyi, admin editörü, server action**
- `BlogPost.author` **opsiyonel** yapıldı; dört tohum yazının uydurma imzası
  (`Dr. Mehmet Yılmaz`, `Av. Ayşe Kaya`, `Dr. Sofia Rossi`, `Can Aksoy` — her biri
  ilgisiz gerçek kişilerin stok fotoğrafıyla) kaldırıldı. Bu yazılar **herkese açık**
  (`/tr/blog`) ve başarı-oranı iddiaları taşıyor; yani uydurma bir uzman o rakamlara
  kefil oluyordu.
- Byline render eden üç yüzey (`(marketing)/blog/page.tsx`, `blog/[slug]/page.tsx`,
  `components/BlogSection.tsx`) artık **yalnız kayıt varsa** imza basıyor.
- Admin editörü: yeni yazının yazarı **oturum açmış adminin kendisi**
  (`displayUserName` ile, app frame'le aynı kural). Oturumda ad yoksa alan boş açılıyor.
- `admin/blog/actions.ts`: `'FonBridge Editörü'` / `'AB Uzmanı'` / stok portre
  varsayılanları kaldırıldı. Yazarsız gönderilen yazı **yazarsız** kaydediliyor.
- Admin listesindeki YAZAR sütunu kayıt yoksa `—` gösteriyor.

**D. Giriş ekranı — `AuthCard.tsx` (+ `LoginForm.tsx`)**
- Demo butonları artık **kişi değil koltuk** başlığı taşıyor; alt satırda o butonun
  gerçekten giriş yaptığı **adres** var (doğrulanabilir veri):
  `Platform Yöneticisi / admin@yasinaslan.com.tr`,
  `KOBİ Ar-Ge Koordinatörü / mehmet@fonbridge.app`,
  `Üniversite TTO Lideri / ayse@tto.edu.tr`.
- Rol etiketleri i18n anahtarı (`DemoSignIn.roleSme|roleTto|rolePlatformAdmin`),
  **iki dile de** eklendi (CLAUDE.md §8).

---

## 2. Kanıt

Tümü bu görev sırasında üretildi. Ham çıktı dosyaları
`docs/agent-results/TASK-MTRNQHC3IV2BE-screenshots/` altında.

### 2.1 Değişiklikten SONRA grep (`05-grep-after.txt`, 06)

```
$ date -u
2026-09-07T23:10:46Z

$ grep -rn "Mehmet Yılmaz\|Demo SME Consultancy" src/
src/app/[locale]/(app)/layout.tsx:45:  // to carry two names written into the component ("Demo SME Consultancy",
src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx:75:  // ready-made consortium: a "Demo SME Consultancy (TR)" at €165.000 and
src/app/[locale]/admin/blog/page.tsx:17:  // `authorName: 'Dr. Mehmet Yılmaz'`, `authorRole: 'AB Proje Başdanışmanı'` and
src/app/[locale]/login/AuthCard.tsx:298:        academic title — "Dr. Mehmet Yılmaz", "Prof. Dr. Ayşe Kaya" — which is
src/components/UserMenu.tsx:518:                Two entries were written in here, "Demo SME Consultancy" (demo-sme)
src/lib/workspaces.ts:9: * into the component — "Demo SME Consultancy" (`demo-sme`) and "Horizon Research
src/lib/user-display.ts:5: * `user.name || (email?.includes('ayse') ? 'Prof. Dr. Ayşe Kaya' : 'Dr. Mehmet Yılmaz')`.
src/lib/blog.ts:4: * The four posts below shipped with bylines nobody wrote: "Dr. Mehmet Yılmaz /
src/lib/document-exporter.ts:43: * `src/lib/document-exporter.ts:128` used to print a fixed `İsim: Dr. Mehmet Yılmaz` /
src/lib/auth.ts:15: * These entries used to carry a `name` too ("Dr. Mehmet Yılmaz", "Prof. Dr. Ayşe
src/modules/m11/ui/PartBCollaborativeEditor.tsx:109:  // `'usr-me' / 'Dr. Mehmet Yılmaz'` constants signed every tenant's saved revision history
src/modules/m11/ui/PartBCollaborativeEditor.tsx:163:  // "Prof. Klaus Müller" and a revision by "Dr. Mehmet Yılmaz" — invented collaborators the
src/modules/m11/types.ts:107:    leadAuthor: 'Dr. Mehmet Yılmaz',
src/modules/m11/types.ts:108:    leadAuthorOrg: 'Demo SME Consultancy',
src/modules/m11/types.ts:120:    lastModifiedBy: 'Dr. Mehmet Yılmaz',
src/modules/m11/types.ts:216:    leadAuthor: 'Dr. Mehmet Yılmaz',
src/modules/m11/types.ts:217:    leadAuthorOrg: 'Demo SME Consultancy',
src/modules/m11/types.ts:220:- **WP1: Management, Coordination & Legal Ethics** (Lead: Demo SME Consultancy, M1-M36)
src/modules/m11/types.ts:224:    lastModifiedBy: 'Dr. Mehmet Yılmaz',
```

**Okuma:** kalan eşleşmelerin **hepsi ya kod yorumu** (deponun yerleşik üslubu:
kaldırılan uydurmayı alıntılayarak geri gelmesini engelleyen açıklama) **ya da
`src/modules/m11/types.ts` / `PartBCollaborativeEditor.tsx`** — yani bu kartın
kapsamı dışındaki, §4'te bildirilen ayrı iş. **Bu kartın altı konumunda çalıştırılabilir
tek bir uydurma dize kalmadı.**

### 2.2 Kapı: lint + typecheck + test (`07-gate.txt`)

```
$ pnpm lint  (tail)
✖ 16 problems (0 errors, 16 warnings)

$ pnpm typecheck
$ tsc --noEmit
  (no output = clean)

$ pnpm test  (summary)
      Tests  1075 passed | 8 skipped (1083)
 Test Files  96 passed | 2 skipped (98)
```

16 uyarının **hiçbiri benim dosyalarımdan değil** (kullanılmayan import'lar; HEAD'de
de var — `Sparkles` UserMenu'de HEAD'de zaten kullanılmıyordu). 0 hata.

### 2.3 Gerçek etkileşimli e2e (`08-e2e.txt`)

```
$ npx playwright test tests/e2e/identity-strings.spec.ts tests/e2e/identity-honesty.spec.ts --reporter=list

Running 8 tests using 1 worker

  ✓  1 identity-honesty.spec.ts:50 › a session with no name is never given somebody else's name (460ms)
  ✓  2 identity-honesty.spec.ts:79 › a session that carries a name shows that name (446ms)
  ✓  3 identity-honesty.spec.ts:100 › a session with no role is labelled unassigned, not TENANT_OWNER (504ms)
  ✓  4 identity-strings.spec.ts:52 › the workspace switcher offers no organisation the session is not in (613ms)
  ✓  5 identity-strings.spec.ts:78 › the login page headlines the demo seat, not a person (496ms)
  ✓  6 identity-strings.spec.ts:97 › the login page in English shows the same seats, translated (497ms)
  ✓  7 identity-strings.spec.ts:115 › the admin editor opens a new post signed by the admin who is signed in (557ms)
  ✓  8 identity-strings.spec.ts:146 › the public blog carries no byline nobody wrote (533ms)

  8 passed (4.7s)
```

Gerçek tıklama: kullanıcı menüsü ve blog modalı yalnız açıldıklarında DOM'a giriyor,
ikisi de `.click()` ile açıldı — sentetik render değil.

### 2.4 Ekran görüntüleri (bu koşuda üretildi)

| Dosya | Ne gösteriyor |
|---|---|
| `01-user-menu-workspaces.png` | **Oturum açmış kullanıcı (Zeynep Aydın) + açık UserMenu.** "ÇALIŞMA ALANI" bölümünde tek satır: **"Ana Çalışma Alanı"** — `demo-tenant`'ın gerçek `Workspace` kaydı. İki uydurma kuruluş yok. |
| `02-login-demo-roles.png` | **Giriş ekranı (TR).** Butonlar: `👑 Platform Yöneticisi / admin@yasinaslan.com.tr`, `KOBİ Ar-Ge Koordinatörü / mehmet@fonbridge.app`, `Üniversite TTO Lideri / ayse@tto.edu.tr`. Kişi adı yok. |
| `03-login-demo-roles-en.png` | Aynı ekran EN: `SME R&D coordinator`, `University TTO lead`. |
| `05-admin-blog-default-author.png` | **Admin "Yeni Blog Yazısı Oluştur" modalı.** `Yazar Adı: Zeynep Aydın` (oturumdaki admin), `Yazar Unvanı:` boş. |
| `04-blog-no-bylines.png` | Herkese açık blog listesi: kartlarda imza/portre yok. |

### 2.5 Yeni testler

- `tests/fabricated-identity-strings.test.ts` — **23 test**, hepsi geçiyor.
  Kaynak-koruma testleri + gerçek davranış testleri:
  `listSessionWorkspaces`'in ürettiği **sorgunun tam şekli** doğrulanıyor
  (tenant + `deletedAt: null` + membership kapsamı), tenantsız oturumda DB'ye
  hiç dokunulmadığı, sorgu patladığında **uydurma değil boş liste** döndüğü,
  ve blog author birleştirme mantığı.
- `tests/e2e/identity-strings.spec.ts` — 5 gerçek tarayıcı testi (yukarıda).

---

## 3. Değişen dosyalar

**Yeni**
- `src/lib/workspaces.ts` — gerçek workspace sorgusu (`withTenant`, RLS)
- `tests/fabricated-identity-strings.test.ts` — 23 birim testi
- `tests/e2e/identity-strings.spec.ts` — 5 e2e testi

**Değişen**
- `src/lib/auth.ts` — `DEMO_PROFILES`'tan kişi adları, jwt ad-ezmesi, süperadmin ad-ezmesi
- `src/components/UserMenu.tsx` — workspace seçici, `workspaces` prop, `activeWorkspace` fallback
- `src/components/MobileAppHeader.tsx`, `src/components/MobileAdminHeader.tsx` — prop geçişi
- `src/app/[locale]/(app)/layout.tsx`, `src/app/[locale]/admin/layout.tsx` — gerçek listeyi çözüp geçiyor
- `src/lib/blog.ts` — `author` opsiyonel, dört uydurma imza kaldırıldı
- `src/app/[locale]/(marketing)/blog/page.tsx`, `.../blog/[slug]/page.tsx`, `src/components/BlogSection.tsx` — koşullu byline
- `src/app/[locale]/admin/blog/page.tsx`, `client.tsx`, `actions.ts` — yazar = oturumdaki admin, varsayılan yok
- `src/app/[locale]/login/AuthCard.tsx`, `LoginForm.tsx` — rol başlığı + adres
- `messages/tr.json`, `messages/en.json` — `UserIdentity.noWorkspace`, `DemoSignIn.*` (iki dile de)

---

## 4. Yol üstünde görülen, DÜZELTİLMEYEN uydurmalar (kural (b) — adıyla bildiriliyor)

| Dosya:satır | Bulgu | Neden düzeltilmedi |
|---|---|---|
| `src/modules/m11/types.ts:107,108,120,129,130,141,150,151,154,163,164,174,183,184,192,201,202,207,216,217,220,224,233,234,237` | 8 uydurma ortak yazar ve kuruluş: `Dr. Mehmet Yılmaz`/`Demo SME Consultancy`, `Prof. Klaus Müller`/`Fraunhofer Institute`, `Doç. Dr. Selin Kaya`/`METU TTO`, `Dr. Sofia Rossi`/`Politecnico di Milano`, `Marcus Schmidt`/`Siemens AG`. **Ekranda görünüyor** (`PartBCollaborativeEditor.tsx:517,583,649,696`) | Bu kartın altı konumunda yok; ayrı ve büyük bir iş (revizyon geçmişi + `document-exporter.ts:165,296` dışa aktarımı da bunları basıyor). §0.2'deki ölçüm düzeltmesiyle birlikte **yeni kart açılması öneriliyor.** |
| `src/lib/auth.ts:281` | DB kesintisi fallback'i **her e-postaya** sabit `id: "demo-user-mehmet"` veriyor (süperadmin hariç) → dev'de hesaplar arası id çakışması | Kartın listesinde yok; `env.NODE_ENV === "production"` ile zaten kapalı. Görünen ad değil, id. |
| `src/lib/blog.ts` (tohum yazı özetleri) | Kaynaksız istatistikler: `"%40 artırıyor"`, `"150.000+ CORDIS kurum"`, `"ortalama 4.8/5.0 puan"`, `"60 milyar Avro"` — herkese açık sayfada, `Evidence`/`TopicStat` kaydına bağlı değil (CLAUDE.md §7 ihlali) | Bu kart **kimlik dizeleri** kartı; rakam kapsamı dışında |
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx:75` | Yorumda geçen `"Demo SME Consultancy (TR)" / €165.000` — kod değil, önceki temizliğin açıklaması | Zaten düzeltilmiş, yalnız yorum |

---

## 5. Riskler

1. **`src/components/UserMenu.tsx` başka bir ajanın commit'ine gitti (kayıp YOK).**
   Bu görev sırasında `ex-en` ajanı aynı dosyada bildirim-hook refaktörü yapıyordu ve
   ben rapor yazarken **`cefd598` ("refactor(react-hooks): subscribe to the read overlay
   instead of copying it in an effect")** commit'iyle dosyayı geniş bir `git add` ile
   aldı — benim workspace-seçici değişikliklerim de o commit'in içinde. Doğrulandı:

   ```
   $ git show HEAD:src/components/UserMenu.tsx | grep -n "workspaces.map\|noWorkspace\|routeWorkspace"
   116:  const routeWorkspace = activeWorkspace ?? workspaces[0]?.slug ?? null;
   534:                    {tIdentity('noWorkspace')}
   537:                  workspaces.map((ws) => (
   ```

   Yani değişiklik `dev`'de, yalnız atıf karışık. Benim commit'im bu dosyayı içermiyor
   (zaten HEAD ile aynı). Diğer ajanın dosyalarına dokunulmadı.
2. **Süperadminin görünen adı değişti.** `admin@yasinaslan.com.tr` artık `User.name`
   yoksa "Admin" olarak görünüyor (eskiden zorla "Yasin Aslan (Süperadmin)" yazılıyordu).
   Bu bilinçli: ad artık kaydın kendisinden geliyor. Kayıtta ad varsa o görünür.
3. **Workspace linki fallback'i.** Oturum hiçbir workspace çözemediğinde menü içi
   ayar linkleri `getWorkspaceRoute`'un kendi varsayılanı olan `'default'` slug'ına
   gidiyor — bu `auth.ts`'in her yeni kiracıya verdiği **gerçek** slug, uydurma bir
   kuruluş değil; rota da kendi kapsamını `requireTenantPage` ile zorluyor.
4. **`LoginForm.tsx` ölü kod.** Depoda hiçbir import'u yok (`login/page.tsx` ve
   `register/page.tsx` `AuthCard` render ediyor). Düzeltmesi AuthCard ile aynı
   yapıldı ki ikisi ayrışmasın, ama **silinmesi gerekiyor** — rota dosyası silmek bu
   kartın kararı olmadığı için yapılmadı.

---

## 6. Açık sorular

1. `m11/types.ts`'teki 8 uydurma ortak yazar için ayrı kart açılsın mı? (Öneri: evet,
   P0 — herkese açık olmasa da her kiracının Part B editöründe ve dışa aktarılan
   dokümanda görünüyor.)
2. `LoginForm.tsx` silinsin mi?
3. Demo giriş butonlarındaki kuruluş adları (`FonBridge SME Ar-Ge Ltd.`,
   `İstanbul Teknik Üniversitesi TTO`) demo tenant tohumu olarak kalsın mı? Şu an
   ekranda görünmüyorlar (yalnız DB'de Tenant.name olarak yaratılıyorlar), o yüzden
   dokunulmadı.

---

## 7. Sonraki adım

- `m11` uydurma ortak yazarları için kart aç (§0.2 + §4).
- `LoginForm.tsx` silme kararı.
- `blog.ts` tohum yazılarındaki kaynaksız istatistikler için CLAUDE.md §7 kartı.
