# TASK-MTR5BGKNELCO2 — Uygulama kullanıcının kimliğini uyduruyordu

**Ajan:** customer-support (CS-EN) · **Sprint:** S11 · **Branch:** `dev`
**Durum:** kapatıldı, uçtan uca gerçek tarayıcıyla doğrulandı

---

## 1. Ne yapıldı

### Sorunun tam hâli
`src/app/[locale]/(app)/layout.tsx:27-30` üç ayrı uydurma yapıyordu:

```ts
const userName = user.name || (user.email?.includes('ayse') ? 'Prof. Dr. Ayşe Kaya' : 'Dr. Mehmet Yılmaz');
const userEmail = user.email || 'mehmet@fabrika.app';
const roleName  = session?.role || 'TENANT_OWNER';
```

Adı olmayan her oturum, e-postasında "ayse" geçip geçmemesine göre **başka bir kişinin adını ve
akademik unvanını** görüyordu. Ekran görüntüsü alan bir ortağa yanlış isim gidiyordu.

### Yapılan değişiklik
Uydurma yerine **dürüst gösterim**: gerçek ad → e-postanın yerel kısmı → çevrilmiş
"İsimsiz kullanıcı" etiketi. Uydurma isim, uydurma unvan, uydurma e-posta yok.

| Yer | Önce | Sonra |
|---|---|---|
| `(app)/layout.tsx:33` | `'Prof. Dr. Ayşe Kaya'` / `'Dr. Mehmet Yılmaz'` | `displayUserName(user.name, user.email, t('unnamedUser'))` |
| `(app)/layout.tsx:34` | `user.email \|\| 'mehmet@fabrika.app'` | `user.email \|\| undefined` |
| `(app)/layout.tsx:41` | `session?.role \|\| 'TENANT_OWNER'` | `session?.role \|\| undefined` |
| `UserMenu.tsx:60-64` | aynı iki uydurma isim + `'TENANT_OWNER'` | `displayUserName(...)` + rol yoksa `t('noRole')` rozeti |
| `admin/layout.tsx:95-98` | `'Süper Admin (Platform Console)'`, `'admin@yasinaslan.com.tr'`, `'SUPER_ADMIN'` | oturumun gerçekten taşıdığı değerler |

Yeni saf yardımcı: **`src/lib/user-display.ts`** (`displayUserName`, `emailLocalPart`) — tek kaynak,
birim testli, hem sunucu hem istemci bileşeninden çağrılıyor.

### Rol varsayımı ÖLÇÜLDÜ — güvenlik kusuru DEĞİL, P0 kart açılmadı
Görev "önce ölç" diyordu. Ölçüm sonucu: `roleName` **yalnızca görsel**.

1. `layout.tsx`'teki `roleName` sadece `UserMenu` ve `MobileAppHeader`'a prop olarak gidiyor ve
   orada bir rozet olarak basılıyor (`grep -n roleName` çıktısı: yalnız `<span>` render'ı).
2. Yetki kararları prop'u değil, sunucu tarafında `session.role`'ü okuyor:
   `src/lib/tenant.ts:73` → `asString(session.role) ?? 'MEMBER'` (EN DÜŞÜK rol, en yüksek değil),
   `src/lib/tenant.ts:155-156` platform admin kontrolü, `src/lib/rbac.ts`.
3. Canlı kanıt: rolü olmayan gerçek bir oturumla `/tr/fabrika-beta/panel` açıldığında sayfa
   **"Erişim Reddedildi — Bu sayfayı görmek için Pipeline Yöneticisi veya daha yüksek izne
   ihtiyacınız var"** diyor (ekran görüntüsü 03). Yani sahte `TENANT_OWNER` rozeti kapı açmıyordu.

**Sonuç:** yetki yükselmesi yok → ayrı P0 kart gerekmiyor. Kusur "kullanıcıya yanlış bilgi verme"
sınıfında kaldı ve kapatıldı: rol yoksa artık `Rol atanmamış` yazıyor.

### Depo taraması (aynı sınıf)
`grep -rn "|| 'Dr\.\|includes('ayse')\|@fabrika.app'\|Ayşe Kaya\|Mehmet Yılmaz\|TENANT_OWNER'" src/`

**Düzeltilenler (uygulama çerçevesi — kullanıcıya "sen busun" diyen yüzey):**
- `src/app/[locale]/(app)/layout.tsx:27,28,30`
- `src/components/UserMenu.tsx:62,64`
- `src/app/[locale]/admin/layout.tsx:95,96,98`

**Kapsam dışı bırakılan, ayrı kart açılan (KAYDEDİLEN veri — daha ağır):**
- `src/lib/dual-approval.ts:44` → `submittedBy: string = 'Dr. Mehmet Yılmaz'`, aynı değer
  `auditTrail[].actorName`'e YAZILIYOR
- `src/modules/m10/server/actions.ts:153` → `submitDualApprovalAction(docId, actorName = 'Dr. Mehmet Yılmaz')`
→ **TASK-MTR60M5ESB5PZ** açıldı (backlog, öncelik 2). 4-eyes denetim kaydına, o işlemi yapmamış
bir kişinin adı yazılıyor; bu görüntüleme değil kalıcı kayıt, bu yüzden ayrı kart.

**Kapsam dışı, demo/örnek içerik (dokunulmadı, kart konusu değil):**
- `src/lib/auth.ts:12-36` DEMO_PROFILES — giriş ekranının meşru demo hesap listesi (görev metni açıkça muaf tuttu)
- `src/lib/blog.ts:27,58`, `src/app/[locale]/admin/blog/client.tsx:48,75` — blog yazar örnek verisi
- `src/modules/m11/types.ts`, `src/modules/m11/ui/PartBCollaborativeEditor.tsx:89,109`,
  `src/lib/document-exporter.ts:128` — M11 örnek verisi; KAYDEDİLEN veri olup olmadığının ayrımı
  TASK-MTR60M5ESB5PZ'nin 4. maddesine yazıldı
- `TENANT_OWNER'` eşleşmelerinin geri kalanı (`api/billing/portal`, `api/invitations`,
  `actions/user/request-deletion`, `lib/modules/state-machine`) gerçek yetki listeleri, fallback değil

### i18n
Yeni ad alanı `UserIdentity` (kendi ad alanım, ortak `Common`'a dokunulmadı), iki dile de eklendi:
`unnamedUser` = "İsimsiz kullanıcı" / "Unnamed user", `noRole` = "Rol atanmamış" / "No role assigned".
Anahtar paritesi korundu: **tr 631 / en 631, eksik anahtar 0**.

---

## 2. Kanıt

### 2.1 Gerçek tarayıcı — ekran görüntüleri
Kimlik doğrulama çerezi, uygulamanın kendi `AUTH_SECRET`'ı ile üretildi (OAuth yolunun ürettiği
JWT'nin aynısı). **Giriş/oturum mantığına dokunulmadı** — credentials sağlayıcısı e-postadan her
zaman bir ad türettiği için adsız oturum yalnız OAuth'ta oluşuyor ve ancak böyle üretilebiliyordu.

| # | Senaryo | Dosya | Görülen |
|---|---|---|---|
| 01 | Adı OLMAYAN oturum (`ayse.nameless@e2e.fabrika.test`) | `TASK-MTR5BGKNELCO2-screenshots/01-nameless-session-honest.png` | Başlıkta **`ayse.nameless`** — eskiden bu tam oturum "Prof. Dr. Ayşe Kaya" gösteriyordu |
| 02 | Adı OLAN oturum (`Zeynep Aydın`) | `.../02-named-session.png` | Gerçek ad görünüyor, regresyon yok |
| 03 | Rolü OLMAYAN oturum | `.../03-roleless-session.png` | Rozet **`Rol atanmamış`**; sayfa **"Erişim Reddedildi"** — rol prop'unun kapı açmadığının canlı kanıtı |

### 2.2 e2e — önce KIRMIZI, sonra YEŞİL
Test dosyası: `tests/e2e/identity-honesty.spec.ts` (3 test, gerçek tarayıcı, gerçek tıklama).

Eski kodla (fallback'ler geçici olarak geri konularak ölçüldü):
```
  ✘  1 › a session with no name is never given somebody else’s name (10.7s)
  ✓  2 › a session that carries a name shows that name (512ms)
  ✘  3 › a session with no role is labelled unassigned, not TENANT_OWNER (10.6s)
  2 failed
  1 passed (23.0s)
```
Düzeltmeyle:
```
Running 3 tests using 1 worker
  ✓  1 › a session with no name is never given somebody else’s name (511ms)
  ✓  2 › a session that carries a name shows that name (407ms)
  ✓  3 › a session with no role is labelled unassigned, not TENANT_OWNER (481ms)
  3 passed (2.1s)
```
Test yalnız "uydurma isim yok" demiyor; `body` metninde `Ayşe Kaya`, `Mehmet Yılmaz`,
`mehmet@fabrika.app` dizgelerinin **hiç geçmediğini** de doğruluyor.

### 2.3 Birim test
`tests/user-display.test.ts` — 6 test, "ayse" içeren e-postanın tanınan bir kişi sayılmadığını da pinliyor.
```
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### 2.4 `pnpm gate`
```
$ pnpm lint
✖ 194 problems (0 errors, 194 warnings)        ← 0 HATA (uyarılar mevcut, devralınan)

$ pnpm typecheck
$ tsc --noEmit                                  ← temiz, çıktı yok

$ pnpm test
 Test Files  1 failed | 59 passed | 2 skipped (62)
   FAIL tests/proposal-outcome.test.ts          ← BENİM DEĞİL, aşağıya bak

$ pnpm rls:check
Found 38 tenant-scoped models requiring RLS policies:
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.

$ pnpm rls:verify
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

**Kırmızı adımın sahipliği (kanıtla, tahminle değil):**
`tests/proposal-outcome.test.ts` git'te **`??` (untracked)** — bu dalgada paralel çalışan başka bir
ajanın az önce yazdığı, henüz YEŞİLE dönmemiş TDD testi. Test ettiği kaynaklar
`src/lib/dashboard/fetch-metrics.ts` ve `src/lib/beta/esr-samples.ts`; ikisi de o ajanın
değiştirdiği, benim dokunmadığım dosyalar. Bu dosya hariç tutulunca tüm süit yeşil:
```
$ npx vitest run --exclude "tests/proposal-outcome.test.ts"
 Test Files  59 passed | 2 skipped (61)
      Tests  575 passed | 8 skipped (583)
```
Ortak ağaçta stash edemediğim için sahiplik, dosyanın git durumu + test ettiği kaynakların
`git diff --name-only` listesiyle kanıtlandı. DB'yi sıfırlayan/migrate eden bir komut çalıştırmadım,
bu yüzden `db:rls` / `db:rls-role` gerekmedi.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/app/[locale]/(app)/layout.tsx` | uydurma ad/e-posta/rol fallback'leri kaldırıldı, `displayUserName` + `getTranslations` |
| `src/components/UserMenu.tsx` | aynı uydurma isim mantığı istemci tarafında da vardı; kaldırıldı, rol yoksa "Rol atanmamış" rozeti |
| `src/app/[locale]/admin/layout.tsx` | uydurma admin adı / e-postası / `SUPER_ADMIN` rolü kaldırıldı |
| `src/lib/user-display.ts` | **YENİ** — dürüst gösterim yardımcısı (tek kaynak) |
| `tests/user-display.test.ts` | **YENİ** — 6 birim test |
| `tests/e2e/identity-honesty.spec.ts` | **YENİ** — 3 gerçek tarayıcı testi |
| `messages/tr.json`, `messages/en.json` | `UserIdentity` ad alanı (2 anahtar × 2 dil) |
| `docs/agent-results/TASK-MTR5BGKNELCO2-screenshots/*` | 3 ekran görüntüsü |

---

## 4. Riskler

1. **`messages/*.json` benim commit'imde değil.** Anahtarları ekledikten sonra, paralel çalışan M8
   ajanı bu iki dosyayı kendi commit'ine (`af28b7b`) topluca aldı ve benim anahtarlarım o commit'le
   birlikte `dev`'e girdi. Doğrulandı: `git show HEAD:messages/tr.json` → `UserIdentity` mevcut,
   parite 631/631. Kayıp yok, ama anahtarlarım başka bir görevin commit mesajının altında duruyor.
2. **Adsız oturum bu üründe yalnız OAuth'ta oluşuyor.** Credentials sağlayıcısı
   (`src/lib/auth.ts:170`) e-postadan her zaman bir ad türetiyor. Düzeltme doğru, ama günlük demo
   girişinde tetiklenmiyor — bu yüzden e2e çerezi uygulamanın kendi secret'ıyla üretildi.
3. **`(app)/layout.tsx:43`'te duran bir gözlem, bu görevin kapsamı dışı:**
   `userEmail === 'admin@yasinaslan.com.tr'` ifadesi `isPlatformAdmin`'i sabit bir e-posta
   dizgesinden türetiyor. Bu yalnızca menü görünürlüğü — asıl admin rotaları
   `isPlatformAdminSession` ile `notFound()` yapıyor (`admin/layout.tsx:37-41`) — ve
   `src/lib/auth.ts`'teki aynı listenin kopyası. Yetki kusuru değil ama iki yerde duran bir
   sabit; tek kaynağa indirilmesi ayrı bir temizlik işi.

## 5. Açık sorular

- İsimsiz bir kullanıcıya e-postanın yerel kısmını göstermek (`ayse.nameless`) mi, doğrudan
  "İsimsiz kullanıcı" mı tercih edilir? Şu an yerel kısım önceliklendirildi: uydurma değil, gerçek
  veriden türüyor ve kullanıcıyı ayırt etmeye yarıyor. Ürün tarafı aksini isterse tek satırlık değişiklik.
- `docs/` altında kullanıcı adının nasıl gösterileceğine dair bir kural yok; bu davranış bir yerde
  yazılı olmalı mı?

## 6. Sonraki adım

1. **TASK-MTR60M5ESB5PZ** — M10 çift onay denetim kaydındaki uydurma aktör adı (kalıcı kayıt, bu
   görevden daha ağır sonuç). Sahibi atanmalı.
2. M11 örnek verilerinin (`m11/types.ts`, `PartBCollaborativeEditor.tsx`) gerçekten yalnız demo mu,
   yoksa kaydedilen veri mi olduğunun ayrımı — aynı kartın 4. maddesi.
