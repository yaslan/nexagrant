---
sözleşme: 3
görev: TASK-MVCH99A54WALG
kod: TASK-MVCH99A54WALG
ajan: crw2-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: DÜZELTME GEREKLİ — dal, env adları, sır ve kod kapsamı temiz; ama prod talebi dev’in 103 commit gerisindeki f310642d’ye sabit ve FO-21 yayın engelli /uzman formunu açtığını söylemiyor; DNS ayrıca patronda.
platform: mac (Darwin 27). Yalnız git, gh ve dig ile statik doğrulama yapıldı, kod çalıştırılmadı. Linux/cPanel koşulmadı: sunucuya erişim yok, ayrıca inceleme kapsamında değil. Platforma bağlı yol deploy/cpanel/app.js restoreLinks ile build-package.sh (bash/find/zip). Linux'ta doğrulanmadı; devop-fb de bunu açıkça yazmış.
sürüm: 1
tarih: 2026-10-19T18:44:01.706Z
---

# FO-67 · deploy çalışmasının incelemesi (devop-fb rapor 1+2)

## Kapsam
devop-fb raporları: `TASK-MVCH99A54WALG-devop-fb.md` (rapor 1) ve `-devop-fb-2.md` (rapor 2). Kod değiştirilmedi, merge/approve yapılmadı.
Not: Görev metnindeki KANIT satırı sonucun `…-devop-fb.md` dosyasına yazılmasını istiyordu. O dosya devop-fb'nin raporu, üzerine yazılmadı. Bu rapor, görev gövdesinde ve kimlik kuralında verilen `…-crw2-fb.md` yoluna yazıldı.
FO-16 (#119) ön koşulu: benim delta re-review'ım (crw2-fb-2, 17:39Z), devop-fb'nin son commit'i 8559ee17'den (16:53Z) sonra. PR'a o tarihten beri yeni commit gelmedi, yani bende açık iş yok.

## Kontrol sonuçları

| # | Kontrol | Sonuç |
|---|---|---|
| a | Dal, commit ve kapı | ✅ Dal yerelde ve uzakta `fc33172b`. Altında `2eeb6617` var, taban `f310642d` (dev'in o anki ucu). Kapı CI'da değil, pre-push kancasında koşmuş: dal için PR ve Actions koşusu yok. Kapı sonucu yalnız devop-fb'nin aktardığı ham çıktıya dayanıyor; push başarılı olduğuna göre `--no-verify` kullanılmadığı iddiası tutarlı. |
| b | Migration listesi | ⚠️ e0ccbfa9→f310642d farkı raporla birebir: apply-order 43→47; +4 yeni, 3 değişen. **Ama dev ilerledi:** `origin/dev` 80271979'da apply-order **50**. Ek migration'lar: `add-expert-pre-reg-attempt`, `expert-prereg-rls-mail-quota`, `blog-read-minutes`. Ayrıca rls.sql ve schema.prisma değişmiş. |
| c | `publicAssetStore()` env adları | ✅ `storage.ts:614-628`: `R2_PUBLIC_BUCKET` + `R2_PUBLIC_HOST` + nesne deposu istemcisi. İstemci şunları okuyor: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_REGION` (storage.ts:21-29). `env.ts:213-215` bunlarla aynı. ENV-LISTESI'nde hepsi var; yalnız `R2_REGION` eksik (isteğe bağlı, varsayılan `auto`, R2 için zararsız). `R2_PUBLIC_BUCKET` aynı zamanda `R2_BUCKET` olamaz (storage.ts:621), bu da ENV-LISTESI'nde doğru anlatılmış. |
| d | Sır sızıntısı | ✅ Dal farkında yalnız `<...>` yer tutucuları var. Rapor ve eklerdeki 32/64 hex değerler ETag, X-Amz-Id ve zip sha256; bağlantı dizesi ya da parola yok. Paket betiği `.env`, `*.pem` ve `*.key` dosyalarını siliyor. Zip devop-fb'nin scratchpad'inde, bu yüzden içini açamadım. |
| e | Uygulama koduna dokunma | ✅ `git diff f310642d..fc33172b` yalnız `deploy/cpanel/*` içeriyor (7 dosya). FO-67'nin kendi commit'leri: 2eeb6617 (build-package.sh, container-build.sh, ENV-LISTESI.md), fc33172b (app.js +1 satır). |
| f | Prod onay talebi | ❌ Adımlar, yedek, EvidenceReminder sayım koşulu ve geri alma net. Ama **hangi paketin** çıkacağı ve neyi beraberinde götürdüğü eksik ya da yanlış (B-1, B-2). |

## Bulgular

### B-1 · Bloke (prod talebi) — Paket dev'in gerisinde, talep "dev'in tamamı" diyor
- Kanıt: `git log f310642d..origin/dev | wc -l` sonucu 103. apply-order: f310642d 47, origin/dev 50.
- Senaryo: Patron "dev'in tamamı canlıya" diye K-568981'e A derse, `fonbridge-app-f310642d.zip` çıkar. Sonraki 103 commit dışarıda kalır. Bunlar arasında uzman ön kayıt RLS düzeltmeleri var (e7bafd79 `ExpertPreRegAttempt` system_scope RLS, ac61467f/d8b97f7e public-intake) ve 3 migration. Bir sonraki yükseltmede yükseltme provası yine 47 dosyadan başlar.
- Düzeltme (devop-fb): Ya paketi güncel ve **yayına uygun** bir dev commit'inden yeniden derleyip e0ccbfa9→hedef yükseltme provasını 50 dosyayla tekrarla, ya da talepte "f310642d'ye sabit" de ve aradaki farkı (commit/migration listesi) yaz.

### B-2 · Bloke (prod talebi) — Paket, yayın engelli uzman ön kayıt formunu canlıya açıyor
- Kanıt: f310642d içinde `src/app/[locale]/uzman/page.tsx`, `src/app/api/expert-preregistration/route.ts` var ("Public, no session"). `content/kvkk-uzman-v1.md:9` = `[FonBridge tüzel kişi unvanı]`. Canlıdaki e0ccbfa9'da expert-prereg dosyası 0. se-fb'nin FO-21 hükmü (57a2c187): "YAYIN ENGELİ … KVKK metninde unvan yer tutucusu ve saklama işi yok … CSV formül enjeksiyonu açık".
- Senaryo: Blog görseli için yapılan deploy, herkese açık `/tr/uzman` formunu da yayına alır. Her kayıt, unvanı olmayan bir aydınlatma metnine rıza olarak `kvkk-v1` sürümüyle yazılır. Bu bir KVKK m.10 riski ve geri alınması zor.
- Düzeltme (devop-fb + lider): Prod talebine "bu paket uzman ön kayıt formunu da açar; FO-21 engeli kapanmadan çıkmamalı" diye yaz. Çıkış ya FO-21 düzeltmeleri (#94/#92) dev'e girdikten sonraki bir commit'ten yapılmalı, ya da patron bu riski açıkça kabul etmeli. Formu kapatmak için ayrı bir kod kartı gerekir; bu kartta kod değiştirmek kural dışı.

### O-1 · Orta — Paket araçları incelenmemiş ve birleşmemiş
- Dal için PR yok (`gh pr list --head …` boş). Prod paketi, dev'e girmemiş bir daldaki betiklerle derleniyor. `2eeb6617` derleme anına bir davranış ekliyor (`R2_PUBLIC_HOST` yoksa derlemeyi reddediyor). `fc33172b` app.js'e eslint istisnası koyuyor.
- Düzeltme: dev'e PR aç, incelemeden geçir. Paket, birleşmiş araçla derlensin.

### Ö-1 · Öneri — Canlıdaki env durumu çıkarım, ölçüm değil
- "R2_ACCOUNT_ID/R2_PUBLIC_HOST tanımlı değil" sonucu CSP başlığından çıkarılmış: makul ama dolaylı. `R2_ACCESS_KEY_ID` ve `R2_SECRET_ACCESS_KEY` için hiçbir kontrol yok. Prod talebindeki "R2 erişim değişkenleri adıyla tanımlı" ifadesi, adları açıkça sıralamalı: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_HOST`.

### Ö-2 · Öneri — DoD'deki "staging'de gerçek yükleme" pakette yapılmadı
- Rapor 1'deki gerçek JPG turu macOS standalone build üzerinde yapıldı. Rapor 2'deki zip üzerinde yalnız anonim 401 ve görsel proxy 500 (ENOTFOUND) var. devop-fb bunu açıkça yazmış. Canlı sonrası aynı turun tekrarlanması talebin 6. adımında zaten var; yeterli.

## Kanıt (ham)
```
local/remote devop-fb/fo67-cpanel-dev-package: fc33172bc49ca1f1d94f3ab58e50aa69e5f5595f (ikisi de)
merge-base(branch, origin/dev) = f310642d ; origin/dev = 80271979 ; f310642d..origin/dev = 103 commit
apply-order: e0ccbfa9 43 · f310642d 47 · origin/dev 50
f310642d..origin/dev +: add-expert-pre-reg-attempt, expert-prereg-rls-mail-quota, blog-read-minutes
bfd0d5a9 ⊂ f310642d: evet ; bfd0d5a9 ⊂ e0ccbfa9: hayır ; e0ccbfa9 ⊂ f310642d: evet
diff f310642d..branch: yalnız deploy/cpanel/{ENV-LISTESI.md,KURULUM.md,app.js,build-package.sh,container-build.sh,package.json,worker.sh}
gh pr list --head devop-fb/fo67-cpanel-dev-package → [] ; gh run list → boş
dig +short files.fonbridge.com → (boş)   [2026-10-19]
git show f310642d:content/kvkk-uzman-v1.md satır 9 → "[FonBridge tüzel kişi unvanı] ("FonBridge")…"
```

## Kalan iş kimde
- **Patron/DNS:** Cloudflare'de `fonbridge-public` bucket'ı ve `files.fonbridge.com` açılmalı (K-568980 A). Bugün de çözülmüyor.
- **devop-fb (düzeltme):** B-1 ve B-2 için prod onay talebini yeniden yaz. Hedef commit'i ve FO-21 etkisini açıkça belirt; gerekirse güncel dev'den yeniden paket derleyip 50 migration'lık prova yap. O-1 için PR aç. Ö-1 için env adlarını listele.
- **Lider:** K-568981'in (prod çıkışı) cevabı, FO-21 yayın engeli kapanana kadar "A" olmamalı. Patrona bu bağlam iletilmeli.

## Hüküm
DÜZELTME GEREKLİ. Dal ve araçtaki iş doğru, ama prod onay talebi şu hâliyle yanıltıcı: yanlış ya da eski commit ve gizli kalan bir KVKK yayın engeli. DNS beklemesi ayrıca var. "Onay (DNS bekliyor)" demek için önce B-1 ve B-2 kapanmalı.

## Platform
mac (Darwin 27). Statik inceleme: git, gh, dig. Linux/cPanel koşulmadı (erişim yok).
