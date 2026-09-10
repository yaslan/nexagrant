# TASK-MTU64MMEQC0WV — i18n denetimi (QA-EN)

**Karar: `pnpm i18n:check` YEŞİL — ama kapı yalanmıyor, KÖR. Katalog pariteyi ölçüyor, sayfayı ölçmüyor. 33 dosya hiç `t()` çağırmıyor; bu rotalar `/en` altında da tamamen Türkçe render ediliyor. Yayına i18n açısından UYGUN DEĞİL.**

## 1. Ne yapıldı

Görev kapsamı aynen uygulandı: **yalnız `pnpm i18n:check`** koşuldu (gate / e2e / dev server çalıştırılmadı). Üç çıktı istendi:

- (a) komutun ham çıktısı → alındı, aşağıda + `evidence/01-i18n-check-before.txt`
- (b) tr/en arasında eksik/fazla anahtar → **sıfır**; iki katalog da 1363 anahtar, küme olarak birebir aynı
- (c) koda gömülü, `t()` kullanmayan kullanıcıya görünen metinler → **480 literal, 50 dosya**; tam liste dosya:satır ile `evidence/03-hardcoded-strings.txt`

Düzeltme yetkim (yalnız `messages/*.json` içine eksik anahtar eklemek) **kullanılmadı, çünkü eklenecek eksik anahtar yok** — parite zaten tam. `git status messages/` temiz. Hiçbir dosyaya dokunulmadı, commit atılmadı.

## 2. Kanıt

### (a) `pnpm i18n:check` ham çıktısı — çıkış kodu 0

```
=== i18n Translation Audit Report ===

Report generated: 2026-09-09T14:05:26.785Z

Summary:
  Static keys used in code: 1010
  Dynamic key patterns:     31
  Keys in messages/tr.json: 1363
  Keys in messages/en.json: 1363

💤 In the catalogs but not reached from src/ (informational) (208):
   - Approvals.auditHash
   - Approvals.selfApprovalForbidden
   - Approvals.subtitle
   - Auth.register
   - Auth.signIn
   - Auth.signOut
   - Common.actions
   - Common.back
   - Common.cancel
   - Common.confirm
   ... and 198 more

✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
```

### (b) Katalog pariteси — makine okunur doğrulama (`--json`)

```
onlyInTurkish:        0     # tr.json'da olup en.json'da olmayan
onlyInEnglish:        0     # en.json'da olup tr.json'da olmayan
missingInTurkish:     0     # kodda kullanılıp tr.json'da olmayan
missingInEnglish:     0     # kodda kullanılıp en.json'da olmayan
missingInBoth:        0
unmatchedPatternsTR:  0     # dinamik anahtar şekli hiçbir anahtarla eşleşmeyen
unmatchedPatternsEN:  0
unusedTR: 208  unusedEN: 208   # bilgi amaçlı, bloklamaz
```

**Eksik/fazla anahtar listesi: BOŞ.** CLAUDE.md kural 8'in katalog yarısı bugün karşılanıyor.

208 "ulaşılmayan" anahtar iki katalogda da AYNI 208 anahtar (parite bozulmuyor); script'in kendi notuna göre bunlar `src/` dışından (seed, e-posta şablonu) çağrılıyor olabilir, bloklayıcı değil — ama aşağıdaki B-01 ile birlikte okunmalı: bir kısmı, çevirisi yazılmış ama sayfada elle sabit metin kullanıldığı için ölü kalmış anahtar olabilir.

### (c) Koda gömülü, `t()` kullanmayan kullanıcıya görünen metinler

Tarayıcı: `evidence/scan-hardcoded.mjs` (yorumları offset koruyarak siliyor, JSX metin düğümü + `placeholder`/`title`/`alt`/`aria-label`/`label` + `toast/alert/confirm` literal'lerini topluyor, slug/camelCase/Tailwind sınıfı gibi kod jetonlarını eliyor). Tam liste: `evidence/03-hardcoded-strings.txt`.

**480 literal / 50 dosya.** Tür dağılımı: 403 JSX metin, 37 `placeholder`, 20 `title`, 12 `toast/alert`, 5 `aria-label`, 5 `label`.

En ağır 12 dosya (`[NO t()]` = dosyada hiç çeviri çağrısı yok):

```
  41  [NO t()]   src/app/[locale]/(app)/[workspace]/marketplace/client.tsx
  39  [NO t()]   src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx
  37  [NO t()]   src/app/[locale]/admin/cordis/client.tsx
  34  [NO t()]   src/app/[locale]/(app)/[workspace]/pipeline/board.tsx
  33  [NO t()]   src/app/[locale]/(app)/[workspace]/tto/client.tsx
  30  [NO t()]   src/app/[locale]/admin/blog/client.tsx
  26  [NO t()]   src/app/[locale]/(app)/[workspace]/settings/modules/client.tsx
  23  [has t()]  src/modules/m11/ui/PartBCollaborativeEditor.tsx
  20  [NO t()]   src/app/[locale]/(app)/[workspace]/settings/api-keys/client.tsx
  17  [NO t()]   src/app/[locale]/(app)/[workspace]/evidence/EvidenceForm.tsx
  17  [NO t()]   src/app/[locale]/admin/settings/smtp-form.tsx
  16  [NO t()]   src/app/[locale]/admin/settings/page.tsx
```

Gerçek kod, `marketplace/client.tsx:190-227` (kırpılmadan):

```tsx
<span>Modül 8 — Expert & Consultant Marketplace</span>
<h1 className="...">Ar-Ge Uzman Pazaryeri & Partner API</h1>
<p className="...">Ufuk Avrupa bağımsız yazarları, onaylı M6 değerlendiricileri ve TTO patent lisansları.</p>
...
<span className="text-muted block text-[11px]">Aktif Pazaryeri İlanı</span>
<span className="text-muted block text-[11px]">Onaylı M6 Değerlendirici</span>
<span className="text-muted block text-[11px]">Platform Komisyon Oranı</span>
```

Rota düzeyinde ölçüm (`grep -rl "useTranslations\|getTranslations"`):

```
marketplace                     -> 3 tsx dosyası, t() kullanan: 0
tto                             -> 3 tsx, t(): 0
opportunities/[id]/application  -> 2 tsx, t(): 0
settings/modules                -> 2 tsx, t(): 0
settings/api-keys               -> 2 tsx, t(): 0
admin/cordis                    -> 2 tsx, t(): 0
admin/settings                  -> 2 tsx, t(): 0
admin/tenants                   -> 1 tsx, t(): 0
admin/audit                     -> 1 tsx, t(): 0
admin/modules                   -> 2 tsx, t(): 0
pipeline                        -> 7 tsx, t(): 3   (kısmi)
evidence                        -> 4 tsx, t(): 1   (kısmi)
```

Yani bu on rota `/en/...` altında da **kelimesi kelimesine Türkçe** çıkıyor. Bu bir "eksik anahtar" değil, çeviri katmanının hiç takılmamış olması.

## 3. Bulgular

### B-01 — `i18n:check` çeviri kancası olmayan dosyayı hiç TARAMIYOR (kapı kusuru) — **Önem: YÜKSEK**

`scripts/i18n-check.ts` içinde, dosya döngüsünün ilk satırı:

```ts
const raw = fs.readFileSync(file, 'utf-8');
if (!raw.includes('useTranslations') && !raw.includes('getTranslations')) continue;
```

**Tekrar üretim:** `pnpm i18n:check` koş → yeşil. Ardından `marketplace/client.tsx`'i aç: 41 sabit kullanıcı metni var, hiçbiri `t()` değil.
**Beklenen:** CLAUDE.md kural 8 "kullanıcıya görünen sabit metin yok" der; kapı bunu bloklamalı ya da en azından raporlamalı.
**Gözlenen:** Kapı yeşil. Kontrol yalnız *kullanılan* anahtarların çözülüp çözülmediğine bakıyor; `t()` hiç kullanmayan bir sayfa denetimden tamamen muaf.
**Etki:** Kural 8'in ihlali kapıyı geçtikçe ödüllendiriliyor — bir metni `t()`'ye bağlarsan denetleniyorsun, sabit yazarsan görünmez oluyorsun. 480 literal bu yolla birikmiş. Kapı "i18n check passed" derken ürünün üçte biri tek dilde.

### B-02 — On rota `/en` altında tamamen Türkçe render ediyor — **Önem: YÜKSEK**

**Tekrar üretim:** `/en/<workspace>/marketplace` (ya da `/en/admin/cordis`, `/en/admin/audit`, `/en/admin/tenants`, `/en/<workspace>/tto`) rotasını aç.
**Beklenen:** İngilizce arayüz.
**Gözlenen:** "Ar-Ge Uzman Pazaryeri & Partner API", "Aktif Pazaryeri İlanı", "Yeni Hizmet İlanı Ver" — Türkçe. Statik kanıt: rota klasöründe hiçbir dosya `useTranslations`/`getTranslations` içermiyor (yukarıdaki tablo), dolayısıyla locale parametresi bu sayfaların metnine hiç ulaşmıyor.
**Etki:** İngilizce kullanıcı için bu rotalar kullanılamaz. Ürün "TR + EN" diye pazarlanıyorsa bu bir doğruluk sorunu.
**Not (dürüstlük):** Bu bulgu **statik** olarak kanıtlandı (dosyada hiç çeviri çağrısı yok + literal Türkçe). Görev "dev/e2e YOK" dediği için tarayıcıda `/en` render'ı ile ayrıca doğrulanmadı; canlı ekran görüntüsü isteniyorsa ayrı bir görev gerekir.

### B-03 — Erişilebilirlik metinleri de sabit (`aria-label`) — **Önem: ORTA**

`src/components/MobileAppHeader.tsx:44` `aria-label="Open Mobile Menu"`, `:98` `"Close Mobile Menu"`; `src/components/MobileAdminHeader.tsx` aynı desen; `src/components/ThemeToggle.tsx:117` `aria-label="Theme selector"`.
**Etki:** Ekran okuyucu kullanıcısı için arayüz her iki locale'de de İngilizce; TR kullanıcısında görsel metin Türkçe, sesli metin İngilizce — tutarsız. Görünür metin olmadığı için gözle fark edilmez, bu yüzden ayrıca işaretliyorum.

### B-04 — Çeviri kancası OLAN dosyalarda karışık kullanım — **Önem: ORTA**

17 dosya `t()` kullanıyor ama içinde hâlâ sabit metin taşıyor; en yoğunu `src/modules/m11/ui/PartBCollaborativeEditor.tsx` (23 literal: `:492 "Resmî DOCX İndir"`, `:740 "Kaydediliyor..."`, `:761 "Kilidi Bırak"`, `:774 "Bölümü Kilitle"`).
**Etki:** Aynı ekranda yarı çevrilmiş arayüz — en kötü kullanıcı deneyimi biçimi, çünkü dil değişmiş görünüyor ama bazı düğmeler değişmiyor.

### B-05 — 208 anahtar `src/`'ten hiç çağrılmıyor — **Önem: DÜŞÜK (bilgi)**

İki katalogda da aynı 208 anahtar ulaşılmıyor (parite bozulmuyor). Script'in kendi uyarısına göre `src/` dışı çağrılar (seed, e-posta) bunu açıklayabilir; ancak `Common.cancel`, `Common.back`, `Auth.signIn` gibi adlar B-01/B-04 ile birlikte "çevirisi yazılmış ama sayfada elle sabit yazılmış" ihtimalini düşündürüyor. Doğrulanmadı — iddia değil, izlenecek iz olarak bırakıyorum.

## 4. Değişen dosyalar

Ürün kodu ve `messages/*.json`: **DEĞİŞMEDİ** (`git status --short messages/` boş çıktı verdi). Eklenen yalnız kanıt:

- `docs/agent-results/TASK-MTU64MMEQC0WV-blok-zincir-denet-i.md` (bu rapor)
- `docs/agent-results/TASK-MTU64MMEQC0WV-evidence/01-i18n-check-before.txt`
- `docs/agent-results/TASK-MTU64MMEQC0WV-evidence/02-i18n-check.json`
- `docs/agent-results/TASK-MTU64MMEQC0WV-evidence/03-hardcoded-strings.txt` (480 bulgu, dosya:satır)
- `docs/agent-results/TASK-MTU64MMEQC0WV-evidence/scan-hardcoded.mjs` (tarayıcı, tekrar koşulabilir)

## 5. Riskler

- **Tarayıcı sezgiseldir.** JSX metin düğümü + adlandırılmış metin nitelikleri üzerinden çalışır; slug/camelCase/Tailwind elenir. Bu yüzden (i) birkaç yanlış pozitif olabilir — ör. `AuthCard.tsx:325 "admin@yasinaslan.com.tr"` demo hesabı, çevrilecek metin değil; (ii) daha önemlisi **eksik yakalar**: değişkene atanmış metin (`const msg = "Kaydedildi"`), dizi/sabit tablosu içindeki etiketler, `.ts` dosyalarındaki sunucu hata mesajları taranmadı. 480 sayısı bir **alt sınırdır**.
- Bu bulguların düzeltilmesi 480 metnin iki dile taşınması demek — küçük bir PR değil. Rota rota bölünmeli, yoksa tek dev PR'ı gözden geçirilemez.
- B-01'i düzeltmek (kapıyı sabit metne karşı sıkılaştırmak) **bugün kapıyı anında kırmızıya çevirir**. Önce metinler taşınmalı ya da kural mevcut ihlaller için bir "baseline" ile devreye alınmalı — aksi halde ekip kapıyı gevşetmeye zorlanır.

## 6. Açık sorular

1. **Kapsam kararı liderin:** `messages/*.json`'da eklenecek eksik anahtar çıkmadı, yani bana verilen düzeltme yetkisi bu görevde boşta kaldı. Asıl iş (480 metnin `t()`'ye taşınması) bu görevin kapsamı dışında ve dev yetkisi ister. Ayrı görev(ler) açılsın mı, rota bazında mı bölünsün?
2. **B-01 kapı sıkılaştırması** ayrı bir görev mi? Önerim: `i18n:check`'e "sabit metin" kontrolü + mevcut 50 dosyalık bir baseline listesi; baseline büyürse kapı kırmızı, küçülürse baseline güncellenir. Böylece yeni ihlal bloklanır, mevcut borç kapıyı kilitlemez.
3. **admin/* rotaları EN gerektiriyor mu?** Eğer admin paneli bilinçli olarak yalnız Türkçe ise `admin/cordis`, `admin/tenants`, `admin/audit`, `admin/settings` bulgularının önemi düşer ve bu karar `docs/` içine yazılmalı. Bugün böyle bir karar kayıtlı değil, o yüzden ihlal olarak raporladım.

## 7. Sonraki adım

1. Lider soru 1-3'ü karara bağlasın.
2. Karara göre: (a) B-02'deki on rotayı `t()`'ye taşıyacak dev görevleri (rota başına bir görev, kabul kriteri: o rotada sıfır sabit metin + yeni anahtarlar iki dilde), (b) B-01 kapı sıkılaştırma görevi (baseline'lı).
3. Taşıma bittikçe `evidence/scan-hardcoded.mjs` yeniden koşulup 480 sayısının düştüğü ölçülsün — "düzelttim" iddiası bu sayıyla kanıtlanabilir.
4. Rotalar çevrildikten sonra `/en` render'ı gerçek tarayıcıyla doğrulansın (B-02'nin canlı kanıtı; bu görevde dev/e2e yasaklıydı).
