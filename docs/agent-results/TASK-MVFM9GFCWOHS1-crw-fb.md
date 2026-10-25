---
sözleşme: 3
görev: TASK-MVFM9GFCWOHS1
kod: TASK-MVFM9GFCWOHS1
ajan: crw-fb
motor: claude
tip: karar
okur: ekip
hüküm: Kısmen bitti: DÜZELTME GEREKLİ. PR #120'deki paket araçlarında bloke eden bir sorun yok (sır yok, uygulama koduna dokunulmamış, f310642d'yi paketliyor). Prod onay talebi ise üç noktada bloke: K-570153=A ile çelişiyor, migration sayısı ve listesi yanlış, FO-21 engel listesi se-fb raporuyla uyuşmuyor.
platform: mac (darwin 27): yalnız git/gh ile statik inceleme yapıldı (git show/diff/ls-tree, gh pr/run). build-package.sh, Docker linux/amd64 derlemesi ve cPanel/Linux koşulmadı; kart canlıya ve sunucuya dokunmayı yasaklıyor ve bu turda paket üretmek kapsam dışı. Platforma bağlı kod yolları: worker.sh `stat -c`, `flock` ve `pkill -u … -f` kullanıyor. Bunlar GNU/Linux'a özgü; hedef sunucu cPanel Linux olduğu için doğru. mac'te `stat -c` başarısız olur ve log döndürme sessizce atlanır (`|| echo 0`), `flock` ise mac'te yoktur. Windows hedef değil.
sürüm: 1
tarih: 2026-10-19T21:14:38.763Z
---

# FO-104 · PR #120 incelemesi (cPanel paket araçları + prod onay talebi)

## Ne yapıldı
PR #120'yi satır satır okudum (`origin/devop-fb/fo67-cpanel-dev-package` = `fc33172b`, merge-base `f310642d`). Yazarın raporundaki iddiaları git/gh ile tek tek doğruladım: `docs/agent-results/TASK-MVFM9GFCWOHS1-devop-fb.md`. Ayrıca K-570153 kararını, PR #92/#94'ün durumunu ve se-fb'nin FO-21 raporunu (`/Users/macbook/alan/docs/agent-results/TASK-MVBIYRGLU5EMX-se-fb.md`) karşılaştırdım. Kod değiştirmedim; merge ya da approve yapmadım; canlıya, sunucuya ve DB'ye dokunmadım.

## Karar
**Bloke eden var.** Talepteki B-1, B-2 ve B-3 düzeltilmeden prod onay talebi patrona "onaylanabilir" olarak sunulmamalı. PR #120'deki araç kodu için bloke eden bir bulgu yok. Aşağıdaki Ö-1…Ö-4 öneridir, hata değildir.

## Kontrol listesi (a–e)
| | Soru | Sonuç |
|---|---|---|
| a | Doğru commit'i paketliyor mu, yeniden üretilebilir mi? | ✅ Evet: `git archive <commit>` ile paketliyor ve `BUILD-INFO.txt` dosyasına `commit:` satırını yazıyor. Kısmen yeniden üretilebilir; bkz. Ö-1…Ö-3 |
| b | Sır ya da env değeri dosyaya veya loga yazılmış mı? | ✅ Hayır. Docker'a geçen tek değişken `R2_PUBLIC_HOST`, o da herkese açık bir değer. ENV-LISTESI'nde yalnız yer tutucu var |
| c | Uygulama koduna dokunulmuş mu? | ✅ Hayır: `deploy/cpanel/` dışında diff boş |
| d | Migration listesi ve geri alma adımları dev ile tutarlı mı? | ❌ Hayır, bkz. B-2 |
| e | FO-21 ve K-570153=A doğru yansıtılmış mı? | ❌ Hayır, bkz. B-1 ve B-3 |

## Bloke eden bulgular

### B-1 — Talep K-570153=A ile çelişiyor ve f310642d'yi hâlâ sürüm adayı olarak sunuyor
- **Yer:** `TASK-MVFM9GFCWOHS1-devop-fb.md`, §2 "Paket: … Canlıya çıkacak sürüm bu paket olacaktır". Aynı talepte "Çıkış ön koşulu (üçünden biri)" maddesi de duruyor.
- **Durum:** K-570153 **A** olarak cevaplandı (kullanıcı, 19.10 22:36): "#92 ve #94 dev'e girdikten sonra o commit'ten paket çıkarılır". Rapor bu cevaptan önce yazılmış (19:14Z = 22:14 +03) ve sonradan güncellenmemiş. #92 ve #94 hâlâ **OPEN** (`gh pr view`, mergedAt=null).
- **Neden önemli:** f310642d paketi A kararıyla hiç canlıya çıkmayacak. Buna rağmen talep "bu paket çıkacak" diyor. Patron bu metni onaylarsa yanlış paketi onaylamış olur.
- **Ek risk:** f310642d'de `ExpertPreRegistration` tablosu hâlâ `SYSTEM_WIDE` (`scripts/rls-models.ts:39`) ve `prisma/rls.sql:115`'teki DISABLE listesinde. Yani se-fb F1 (YÜKSEK: kişisel veri `fabrika_app` rolüyle tenant bağlamı olmadan okunuyor) bu pakette düzeltilmemiş. Düzeltme yalnız dev'de var: `rls.sql:359` `ENABLE ROW LEVEL SECURITY` ve `expert-prereg-rls-mail-quota.sql`.
- **Düzeltme:** Talebin başına şunu yazın: "Hedef commit: #92 ve #94 dev'e girdikten sonraki dev commit'i (henüz yok). f310642d paketi çıkış adayı DEĞİLDİR." Üç seçenekli ön koşul maddesini kaldırın, yerine "K-570153=A" yazın. Yeni paket hazır olduğunda talep commit, sha256 ve BUILD-INFO ile yeniden verilsin.

### B-2 — Migration sayısı ve listesi yanlış; KURULUM eski
- **Ölçüm:** `apply-order.txt` içindeki yorum dışı satır sayısı: e0ccbfa9 = **43**, f310642d = **47**, origin/dev = **50**.
- **Talepte yazan:** "paket çıkarılırsa 50 dosya uygulanır". Bu f310642d paketi için **yanlış** (47). 50, dev'in sayısıdır.
- **Eksik liste:** Talep yalnız *pakette olmayan* 3 migration'ı sayıyor. Canlıya e0ccbfa9'dan sonra *gerçekten uygulanacak* 4 migration ise listede yok: `add-expert-pre-registration`, `add-notification`, `drop-evidence-reminder`, `add-expert-pre-registration-organization`. Dördünün de `.down.sql` dosyası var.
- **KURULUM.md:56** "`apply-migrations: 43 files applied`" diyor. Bu e0ccbfa9 paketine ait; f310642d ile ya da dev ile yeni bir paket kurulurken operatör yanlış sayıyı bekler.
- **drop-evidence-reminder:** Bu migration, `EvidenceReminder` tablosunda satır varsa tabloyu silmek yerine hata veriyor. Devam etmek için `PGOPTIONS='-c app.allow_evidence_reminder_drop=on'` gerekiyor (migration başlığı). Ne talepte ne KURULUM'da bu yazıyor. Canlıda satır varsa `apply-migrations` bu dosyada durur ve önceki dosyalar uygulanmış kalır. Canlıda satır olup olmadığını bilmiyorum (varsayım).
- **Düzeltme:** Talepte iki ayrı liste olsun: "e0ccbfa9 → hedef commit arasında uygulanacak migration'lar" ve beklenen `N files applied` değeri. Hedef dev olacağı için 50 ve 7 dosya: yukarıdaki 4 + `add-expert-pre-reg-attempt`, `expert-prereg-rls-mail-quota`, `blog-read-minutes`. KURULUM §5 sayısını sabit yazmak yerine "BUILD-INFO / apply-order'daki sayı" diye güncelleyin. drop-evidence-reminder için önce satır sayısını kontrol etme adımını ve opt-in notunu ekleyin. Geri alma kısmındaki "önceki zip + DB yedeği" doğru ve KURULUM §9 ile uyumlu. Yalnız yedek yönteminin hâlâ açık karar olduğu (KURULUM:52 🟥) talepte ön koşul olarak geçmeli.

### B-3 — FO-21 engel listesi se-fb raporuyla uyuşmuyor
- **Talepte yazan:** "KVKK unvan yer tutucusu, saklama süresi belirsiz, **CSV formül enjeksiyonu açık**".
- **se-fb raporuna göre:** Engeller **F1** (RLS kapalı, YÜKSEK) ve **F2** (unvan yer tutucusu). F3 saklama süresini ve yurt dışı aktarımı kapsıyor. CSV için kaçış *var*: `src/lib/expert-prereg/server/csv.ts:10` `FORMULA_START = /^[=+\-@\t\r]/`. F10 yalnız "başta boşluk" kenar durumu için DÜŞÜK seviyede bir varsayım.
- Unvan yer tutucusu f310642d'de gerçekten duruyor (`content/kvkk-uzman-v1.md:9`), §6'daki "makul bir süre" ifadesi de öyle. Bu iki madde doğru aktarılmış.
- **Etki:** En ağır engel olan kişisel verinin RLS'siz okunabilmesi patronun okuyacağı metinde hiç geçmiyor; DÜŞÜK seviyedeki bir not ise "açık" diye sunuluyor. Kart metni de CSV'yi saymıştı, yani hata karttan devralınmış. Yine de kaynak se-fb raporu.
- **Düzeltme:** Şöyle yazılsın: "F1 RLS (kişisel veri, YÜKSEK; dev'de düzeltildi, f310642d'de yok) · F2 unvan · F3 saklama süresi ve yurt dışı aktarım (#92/#94)". CSV "küçük not (F10)" olarak geçsin.

## Öneriler (bloke etmiyor)
- **Ö-1 — Paketleme dosyaları çalışma ağacından alınıyor.** `build-package.sh` `app.js`, `package.json`, `worker.sh` ve `container-build.sh` dosyalarını `$HERE`'den kopyalıyor. BUILD-INFO yalnız `packaging: deploy/cpanel @ <HEAD short>` yazıyor. `deploy/cpanel` kirliyse (commit edilmemiş değişiklik varsa) bu kayıtta görünmez. Öneri: `git status --porcelain -- deploy/cpanel` boş değilse derlemeyi durdurun, ya da dosyaların sha256'sını BUILD-INFO'ya yazın.
- **Ö-2 — `FB_BUILD_DIR` ile yeniden paketlemede commit doğrulanmıyor.** `commit:` satırı argümandan geliyor; `build-out.tar`'ın gerçekten o commit'ten derlendiğini hiçbir şey kontrol etmiyor. Bu modda R2_PUBLIC_HOST denetimi de atlanıyor (BUILD-INFO'daki remotePatterns yine de gerçek değeri gösteriyor). Senaryo: eski bir tar + yeni bir commit argümanı → BUILD-INFO yanlış commit'i gösterir. Öneri: container derlemesi src.tar'ın commit'ini build-out'a yazsın, paketleme bunu argümanla karşılaştırsın.
- **Ö-3 — İmaj sabitlenmemiş.** `node:22-bookworm-slim` digest ile sabitlenmemiş, BUILD-INFO'daki `glibc 2.36` değeri de elle yazılmış (`ldd` çıktısından okunmuyor). İmaj değişirse BUILD-INFO yanlış bilgi verir. Zip zaman damgaları yüzünden sha256 her derlemede değişir. Bu normal; talepte "sha256 o derlemenin kimliğidir, yeniden derleme farklı sha verir" diye belirtilsin.
- **Ö-4 — Belgeler.** Kart komutu `build-package.sh <dev-sha>` şeklinde, betik ise `<commit> <out-dir>` istiyor (out-dir zorunlu). ENV-LISTESI:53 `R2_ENDPOINT`'i ✓ ile işaretliyor ama metni "yalnız S3 uyumlu başka depo için" diyor; işaret ile metin çelişiyor. `R2_REGION` satırı (78a1e748) yalnız yerelde var, PR'da yok.

## Kanıt (ham çıktı)
```
$ git rev-parse origin/devop-fb/fo67-cpanel-dev-package origin/dev; git merge-base …
fc33172bc49ca1f1d94f3ab58e50aa69e5f5595f
80271979718daf7fa204ab831de13554ecdfc37f
f310642de08fb746d6d7daf18727e2264da1bd94
$ git diff --stat f310642d fc33172b -- . ':!deploy/cpanel'
(boş)
$ git diff --stat origin/dev...fc33172b
 deploy/cpanel/{ENV-LISTESI.md,KURULUM.md,app.js,build-package.sh,container-build.sh,package.json,worker.sh} | 536 +++
$ apply-order yorum-dışı satır: e0ccbfa9=43  f310642d=47  origin/dev=50
e0ccbfa9→f310642d yeni: add-expert-pre-registration, add-notification, drop-evidence-reminder, add-expert-pre-registration-organization
f310642d→dev yeni:     add-expert-pre-reg-attempt, expert-prereg-rls-mail-quota, blog-read-minutes
$ git log --oneline f310642d..origin/dev | wc -l   → 103
$ git show f310642d:prisma/rls.sql | grep -n ExpertPreRegistration
115:    'CordisProjectSciVoc',…,'ExpertPreRegistration',…   (DISABLE/SYSTEM_WIDE listesi)
$ git show origin/dev:prisma/rls.sql → 359: ALTER TABLE public."ExpertPreRegistration" ENABLE ROW LEVEL SECURITY;
$ git show f310642d:content/kvkk-uzman-v1.md:9 → [FonBridge tüzel kişi unvanı] ("FonBridge")
$ git show f310642d:src/lib/expert-prereg/server/csv.ts:10 → const FORMULA_START = /^[=+\-@\t\r]/;
$ R2_* adları (git grep src scripts, f310642d): ACCESS_KEY_ID ACCOUNT_ID BUCKET ENDPOINT PUBLIC_BUCKET PUBLIC_HOST REGION SECRET_ACCESS_KEY — talepteki 8 adın hepsi kodda var
$ sır taraması (PR diff; password|secret|key|token=…, postgres://u:p@, AKIA, sk_live, eyJ) → eşleşme yok
$ K-570153 → Cevap: A (kullanici·rapor·19.10 22:36)
$ gh pr view 92/94 → state OPEN, mergedAt null
$ gh pr view 120 → mergeable MERGEABLE, mergeStateStatus UNSTABLE
$ gh pr checks 120 → build-and-test fail 2s (job'da steps: [] — iş hiç başlamamış; dev'deki son 3 koşu da failure → CI altyapı sorunu, PR'a bağlanamaz)
```
Pre-push kapısı (yazarın raporuna göre 5 test kırmızı; testlerin hepsi `src/` ve uzman ön kayıt alanında) bu PR'ın diff'iyle ilgili değil. Diff yalnız `deploy/cpanel`. Kapıyı kendim koşmadım.

## Değişen dosyalar
Yalnız bu rapor: `docs/agent-results/TASK-MVFM9GFCWOHS1-crw-fb.md`. Kod değişikliği yok.

## Riskler
- B-1 düzeltilmeden talep onaylanırsa F1 RLS açığı ve unvansız KVKK metniyle canlıya çıkılır.
- Kırmızı CI ve kapı nedeniyle PR #120 için gerçek bir yeşil sinyal yok. Merge öncesi dev'e göre tam `pnpm gate` gerekli.

## Açık sorular
Yok. K-570153 zaten cevaplandı. Canlıda `EvidenceReminder` satırı var mı, bilmiyorum; ölçümü yayın öncesi kontrol listesine konmalı.

## Sonraki adım
1. devop-fb: B-1, B-2 ve B-3'e göre talebi yeniden yazsın; KURULUM:56'daki sayıyı ve drop-evidence-reminder notunu düzeltsin; 78a1e748'i pushlasın.
2. #92 ve #94 dev'e girdikten sonra yeni paket derlensin, talebe sha256 ve BUILD-INFO eklensin.
3. Ö-1 ve Ö-2 isteğe bağlı olarak aynı PR'da yapılabilir.
