# TASK-MTQWBAJ2T5XSV (F15) — Türkçe büyük harf (İ/ı) bozulması — Consortium başlığı + depo geneli tarama

> Not: Bu task ID bu depoda birden fazla ajan tarafından farklı işler için kullanılmış
> (`docs/agent-results/TASK-MTQWBAJ2T5XSV-blockzincir-pm.md`, `-customer-support.md`, ve
> `docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/` klasöründe bu göreve ait olmayan
> ekran görüntüleri de var — ör. `01-board-owner-filter.png`, k5 pipeline card-owner işiyle
> ilgili, commit `ed39194`). Bu rapor yalnızca **F15 — Türkçe büyük harf bozulması**
> kapsamını kapsar; kendi ekran görüntülerimi `01-before-...`, `02-after-...` vb. adlarla
> aynı klasöre, çakışmayan dosya adlarıyla ekledim.

## 1. Ne yapıldı

### 1.1 Kök neden
`text-transform: uppercase`, sayfanın `<html lang="tr">` etiketi altında Türkçe özel
büyütme kurallarını (CSS Text Module Level 3, Turkish/Azerbaijani casing exception)
tetikliyor: küçük "i" → büyük "İ" (noktalı) olur. Bu, **gerçek Türkçe** metin için
doğru davranıştır (`konsorsiyum` → `KONSORSİYUM` doğru), ama sayfada **çevrilmemiş,
donuk (hardcoded) İngilizce metin** varsa aynı kural o metne de uygulanır ve yanlış
görünür: `"Add Role to Consortium"` → `"ADD ROLE TO CONSORTİUM"` (noktalı İ, İngilizce
kelimede hatalı).

`src/app/layout.tsx`'te `<html lang={locale}>` doğru kurulu — yani sorun `lang`
eksikliği değil, **i18n eksikliği + CSS uppercase**'in birleşimi.

### 1.2 Kod tarafında bulunan durum
`consortium/manager.tsx` üzerinde (görev metninde belirtildiği gibi) başlık düzeltmesi
zaten başlamıştı: `useTranslations` import edilmiş, `t()` çağrısı eklenmiş, `uppercase`
class'ı kaldırılmıştı — ama:
- `messages/tr.json` / `messages/en.json`'da `addRoleToConsortium` anahtarı zaten
  vardı (KONSORSİYUMA ROL EKLE / ADD ROLE TO CONSORTIUM, düz metin olarak, CSS
  uppercase'e değil çeviri metnine gömülü büyük harf).
- Denetim (audit) kısmı hiç yapılmamıştı.

### 1.3 Yapılan değişiklikler (commit `4be94d5`)
1. **`consortium/manager.tsx`** — aynı dosyadaki ikinci bir kurbanı da düzelttim:
   `"Top Candidates"` başlığı (adaylar paneli) hardcoded İngilizce + `uppercase`
   class'ı kullanıyordu (satır 171) — aynı bozulma sınıfı. `t('topCandidates')`'e
   çevirdim, `uppercase` class'ını kaldırdım (seat-role başlığıyla aynı desen:
   çeviri metni zaten büyük harf olarak yazılıyor, CSS'e güvenilmiyor).
2. **`messages/en.json`** → `Consortium.topCandidates: "TOP CANDIDATES"`
3. **`messages/tr.json`** → `Consortium.topCandidates: "EN İYİ ADAYLAR"`

Neden CSS `uppercase` yerine önceden-büyütülmüş çeviri metni tercih edildi (var olan
desenle tutarlı): (a) çeviri artık her locale için ayrı olduğundan Türkçe kelimeler
zaten doğru biçimde İ ile yazılabiliyor, İngilizce kelimeler asla Türkçe kurala
girmiyor; (b) tarayıcı motorlarının Türkçe `text-transform` özel kuralını destekleme
seviyesi hâlâ tutarsız (eski WebKit/Safari sürümleri veya gömülü webview'lar için
garanti değil) — çeviriye gömülü sabit metin bu bağımlılığı tamamen ortadan kaldırıyor.

## 2. Kanıt

### 2.1 Gerçek tarayıcı testi (Playwright, demo tenant, gerçek giriş + gerçek tıklama)
Demo hesabıyla giriş (`Yasin Aslan / Süperadmin`) → `Fırsatlar` → `demo-opp-1` →
`/pipeline/demo-opp-1/consortium`:

- `docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/01-before-tr-corrupted-CONSORTIUM.png`
  — **düzeltme geçici olarak geri alınıp** (yalnızca ekran kanıtı için, hemen sonra
  geri kondu) orijinal hatanın gerçekten oluştuğu doğrulandı: başlık
  `"ADD ROLE TO CONSORTİUM"` — noktalı İ ile bozuk render.
- `docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/02-after-tr-fixed.png` — düzeltme
  sonrası TR: `"KONSORSİYUMA ROL EKLE"` — doğru.
- `docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/03-after-en.png` — düzeltme
  sonrası EN: `"ADD ROLE TO CONSORTIUM"` — düz I, bozulma yok.

### 2.2 "Top Candidates" paneli — GERÇEK TIKLAMA ile doğrulanamadı (ayrı, önceden var olan bug)
"+ Coordinator" ile koltuk ekleyip "Find Candidates" tıklandığında **500/Runtime
TypeError** alındı — bu benim değişikliğimle ilgisiz, önceden var olan bir hata:
`src/lib/scoring/consortium.ts:80` içinde `prisma.organization.findMany(...)`
çağrılıyor ama şemada `Organization` diye bir model **yok** (`prisma/schema.prisma`
içinde yalnızca `CordisOrganization` ve `PartnerOrg` var). Kanıt:
`docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/04-blocked-find-candidates-500.png`.
→ **Board'a görev açıldı: `TASK-MTR4CH9IDK4D7`** (backend/geliştirici için).
"Top Candidates" başlığının İ-bozulmadan render ettiğini bu yüzden yalnızca **kod
incelemesiyle** doğruladım (aynı desen, aynı dosya, aynı düzeltme deseni — 2.1'deki
kanıtla birebir aynı mekanizma); canlı tıklama kanıtı bu backend hatası düzeltilince
tamamlanabilir.

Test sırasında DB'ye eklenen 5 adet boş "Coordinator/OPEN" koltuğu, testten hemen
sonra temizlendi (geçici `scripts/zz-tmp-cleanup-seats.ts` ile silindi ve script
kaldırıldı) — demo veri kirlenmedi.

### 2.3 `pnpm gate` (tam kapı)
```
✖ 194 problems (0 errors, 194 warnings)   ← hepsi başka dosyalarda, önceden var
tsc --noEmit                               ← temiz
Test Files  57 passed | 2 skipped (59)
     Tests  560 passed | 8 skipped (568)
tsx scripts/check-rls.ts   → ✅ 38/38
tsx scripts/check-rls-live.ts → ✅ 38/38 (Veritabanı izolasyonu uyguluyor)
```
Exit code: 0. Pre-commit hook (staged dosyalar için eslint + tsc) da temiz geçti.

### 2.4 i18n parity
`npx tsx scripts/i18n-check.ts` → `totalKeysInTurkish: 615, totalKeysInEnglish: 615`
(eşit — eklediğim 1 yeni anahtar (`topCandidates`) her iki dilde de var, parite
bozulmadı; script'in raporladığı "missing" satırları template-literal (`${...}`)
anahtarlarından kaynaklanan önceden var olan yanlış-pozitifler, benimle ilgisiz).

## 3. Depo geneli `uppercase` taraması

`grep -rn "uppercase" src/ --include="*.tsx" --include="*.ts"` → **122 eşleşme, 46
dosya**. Bunları otomatik olarak sınıflandırdım: `{t(...)}` üzerinden geçen (güvenli
— artık locale'e özel, karışık dil riski yok) vs. **hardcoded (donuk) metin** üzerine
`uppercase` uygulanan (riskli desen — F15 ile aynı sınıf).

**Hardcoded metin + `uppercase` birlikte kullanılan 34 nokta bulundu**, bunlardan
12'si İçinde küçük "i" harfi taşıyor (yani bozulma/uygunsuz-büyütme potansiyeli var —
ama hangisinin *gerçekten* bozuk olduğu, metnin Türkçe mi İngilizce mi olduğuna bağlı:
gerçek Türkçe kelime doğru noktalanır, gömülü İngilizce kelime/marka adı yanlış
noktalanır).

### 3.1 Gerçek risk — İngilizce/karışık metin, `uppercase` altında, tr locale'de yanlış noktalanabilir
| Dosya | Satır | Metin |
|---|---|---|
| `[locale]/i18n-check/page.tsx` | 45 | `"Total Unique Keys"` |
| `.../settings/api-keys/client.tsx` | 94 | `"Partner Intelligence REST API"` |
| `.../concept-notes/[id]/editor.tsx` | 85 | `"Sections"` (tamamen çevrilmemiş, tr sayfasında da İngilizce) |
| `admin/blog/client.tsx` | 148 | `"Platform Admin Workbench"` |

Bunlar **ucuz değil** (benim dosyalarım değil — dokunmadım, kural gereği). i18n
eksikliği + uppercase kombinasyonu olduğundan risk taşıyor; ilgili modülün sahibi
agent'a devredilmeli.

### 3.2 Hardcoded Türkçe metin + `uppercase` — bugün doğru render oluyor ama kırılgan
`pipeline/board.tsx:695` ("Stage-Gate Yönetimi"), `opportunities/[id]/documents/client.tsx:186`
("Çift Onaylı Kurumsal Yetki Akışı..."), `tto/client.tsx:468`, `approvals/page.tsx:41`,
`admin/layout.tsx:158` + `components/MobileAdminHeader.tsx:80` (ikisi de "Yönetim
Menüsü" — aynı metin iki yerde donuk), `admin/billing/client.tsx:116`,
`login/AuthCard.tsx:294` — bunlar gerçek Türkçe kelimeler olduğu için `lang="tr"`
altında CSS `uppercase` bugün *doğru* İ'yi üretiyor (Chrome/Firefox modern sürümler
destekliyor). Ama iki nedenle risk taşımaya devam ediyor: (1) hâlâ `t()` kullanmıyor —
CLAUDE.md kural 8 ihlali, EN kullanıcıya da Türkçe metin gösteriyor olabilir; (2) CSS
`text-transform` için Türkçe özel-büyütme desteği motor/sürüme bağlı — garanti değil
(ör. bazı eski WebKit tabanlı gömülü webview'lar desteklemez, o zaman "İ" yerine
düz "I" basar). **Kart adayı** — kalıcı çözüm F15'te uygulanan desen: çeviriye
gömülü, önceden büyütülmüş metin + CSS uppercase'i tamamen kaldırmak.

### 3.3 Hardcoded metin, küçük "i" içermiyor — bozulma görünmüyor ama yine de i18n ihlali
`i18n-check/page.tsx:49,53` ("TR/EN Coverage"), `settings/api-keys/client.tsx:221`
("Anahtar Tanımı"), `pipeline/[id]/effort.tsx:74-77` (Date/User/Hours/Note — tablo
başlıkları, tr sayfada bile İngilizce), `opportunities/[id]/documents/client.tsx:316`,
`opportunities/[id]/application/client.tsx:418`, `marketplace/client.tsx:515`,
`concept-notes/[id]/editor.tsx:113` ("Status"), `admin/blog/client.tsx:239`,
`admin/cordis/client.tsx:476`, `admin/billing/client.tsx:125,218`,
`modules/m11/ui/PartBCollaborativeEditor.tsx:464`. Düşük öncelik — bugün görsel
bozulma yok, ama çevrilmemiş metin.

**Hiçbirine dokunmadım** (kural: başka ajanın dosyasında bulursan düzeltme, raporda
listele). Bu üç grup toplam **~30 dosya** kapsıyor — tek bir görev olarak devretmek
yerine, modül sahiplerine (M5 dashboard, M7 TTO, admin paneli, M11 vb.) dağıtılması
daha isabetli; istenirse ayrı bir board görevi açabilirim.

## 4. JS tarafı: `toUpperCase()` / `toLowerCase()` taraması

`grep -rn "\.toUpperCase()\|\.toLowerCase()" src/` → ~90 eşleşme. Büyük çoğunluğu
**risksiz**: ülke kodları (`"TR"`, `"DE"`), para birimi kodları, enum/durum sabitleri
(`"coordinator"`, `"OPEN"`), e-posta adresleri, arama filtreleri — bunların hepsi
ASCII-only İngilizce/kod içerik, Türkçe "i" sorunu oluşmaz. Bu doğru kullanım.

**Gerçek risk (Türkçe insan adı/metin üzerinde locale-farkında olmayan
`.toUpperCase()`)** — JS'in varsayılan `.toUpperCase()` metodu Türkçe kurallarını
BİLMEZ (İngilizce/root locale kuralını uygular): küçük "i" → büyük "I" (noktasız)
üretir, oysa Türkçe'de "İlker" gibi bir ismin baş harfi "İ" (noktalı) olmalı.
Bu, F15'in **tam tersi yönü**: CSS uppercase İngilizce'yi Türkçeleştiriyordu (yanlış),
burada JS `.toUpperCase()` Türkçe'yi İngilizceleştiriyor (yanlış). Doğru çözüm:
`.toLocaleUpperCase('tr')` (yalnızca gerçekten Türkçe/kullanıcı-girdisi metin için).

| Dosya:Satır | Kullanım | Neden riskli |
|---|---|---|
| `src/components/UserMenu.tsx:99,101` | Kullanıcı adı → avatar baş harfleri | Adı "İ"/"ı" ile başlayan bir kullanıcı yanlış harfle görünür (görünür, küçük ama gerçek kullanıcı-yüzü bug) |
| `src/lib/auth.ts:172` | E-posta local-part → görünen ad (`ali.veli` → `Ali Veli`) | Aynı sınıf — e-posta kullanıcı adı Türkçe "i" ile başlıyorsa yanlış büyütülür |
| `src/lib/k5-pipeline/pipelineStore.ts:90` | `name.charAt(0).toUpperCase()` → pipeline kart avatarı | Aynı sınıf (bu dosya şu an başka bir ajan tarafından değiştiriliyor gibi görünüyor — dokunmadım) |
| `src/modules/m6/ui/EvaluatorForm.tsx:100` | `criterion.name.toLowerCase()` → HTML `id` üretimi | Düşük önem: kullanıcıya görünmez (yalnızca `id` attribute), ama Türkçe "İ" → `i̇` (nokta + i, birleşik karakter) gibi tuhaf id üretebilir |

Bunlar **pahalı** kart adayları: kullanıcı adı/e-posta gibi rastgele metin için
"bu Türkçe mi" ayrımı çalışma zamanında yok — ya her zaman `toLocaleUpperCase('tr')`
kullanmak (İngilizce isimler için de zararsız, çünkü 'tr' locale sadece i/İ, ı/I
çiftini farklı işler, başka harfte fark yaratmaz) ya da kullanıcının/tenant'ın
locale'ini bu fonksiyonlara taşımak gerekir — küçük ama modül sınırları dışı bir
değişiklik, tek bir ayrı görev olarak açılmalı. **Dokunmadım** (dosyalarım değil).

## 5. Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager.tsx` — "Top
  Candidates" başlığı da `t()`'ye çevrildi, `uppercase` class'ı kaldırıldı.
- `messages/en.json`, `messages/tr.json` — `Consortium.topCandidates` anahtarı eklendi
  (her iki dilde de; `addRoleToConsortium` zaten mevcuttu).
- Commit: `4be94d5` — yalnızca bu 3 dosya, `git show --stat` ile doğrulandı.
- Geçici: `scripts/zz-tmp-cleanup-seats.ts` (oluşturuldu, çalıştırıldı, silindi — test
  sırasında demo tenant'a eklenen 5 boş koltuk temizlendi). `tests/e2e/zz-tmp-consortium-shot.spec.ts`
  (oluşturuldu, çalıştırıldı, silindi). İkisi de commit edilmedi.

## 6. Riskler
- `TASK-MTR4CH9IDK4D7` çözülene kadar M8 "Find Candidates" akışı tamamen kırık —
  bu, benim değişikliğimden ÖNCE de kırıktı (regresyon değil), ama F15'in ikinci
  yarısını (Top Candidates canlı tıklama kanıtı) tamamlamamı engelledi.
- §3.2'deki Türkçe-metin-altında-uppercase kullanımları bugün doğru görünüyor ama
  tarayıcı desteğine bağımlı — regresyon riski yok, kırılganlık riski var.

## 7. Açık sorular
- §3.1/3.2/3.3'teki ~30 dosyalık iş: tek görev mi, modül sahiplerine mi dağıtılsın?
  Yönlendirme istenirse board'a açarım.
- `TASK-MTR4CH9IDK4D7`'e kimin atanacağı (backend/geliştirici rolü) — atanmamış
  bıraktım, ekip liderinin uygun ajana ataması gerekiyor.

## 8. Sonraki adım
- `TASK-MTR4CH9IDK4D7` (prisma.organization) çözülünce "Top Candidates" panelini
  gerçek tıklamayla doğrulayıp bu rapora ekran görüntüsü eklerim.
- §4 tablosundaki JS `.toUpperCase()` bulguları için ayrı bir görev açılması önerilir.
