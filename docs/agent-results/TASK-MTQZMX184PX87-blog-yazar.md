# TASK-MTQZMX184PX87 — `calls/**`: alert() yerine hata bandı + dosyanın i18n'i

**Ajan:** blog-yazar · **Commit:** `8ef383b` (branch `dev`)

## 1) Ne yapıldı

- `src/app/[locale]/(app)/[workspace]/calls/[id]/page.tsx`
  - Fırsat ekleme hatasını gösteren `alert(...)` kaldırıldı; yerine `role="alert"` hata bandı geldi (M6 Evaluator Lens'teki (`opportunities/[id]/evaluations/client.tsx`) rose-300/rose-50/rose-800 + `AlertTriangle` ikon sınıfları birebir yeniden kullanıldı — yeni görsel dil icat edilmedi).
  - Dosya baştan sona `isTr ? 'Türkçe' : 'English'` üçlü operatör deseniyle yazılmıştı; tamamı `next-intl`'in yeni `callDetails` ad alanına taşındı (mock çağrı verisi — başlık/programme/status/description/keywords dahil, çünkü bunlar da kullanıcıya görünen sabit metindi).
  - Hata sonrası buton normal duruma dönüyor (retry mümkün); kullanıcı girdisi kaybolmuyor çünkü akışta form/girdi yok, yalnızca tek bir "ekle" butonu var.
  - Ham hata gövdesi/HTTP kodu ekranda yok; `console.error(e)` ile detay konsola gidiyor, ekranda yalnız `t('addError')` ("Fırsat eklenemedi. Lütfen tekrar deneyin.").

- `src/app/[locale]/(app)/[workspace]/calls/page.tsx`
  - "Aramayı Kaydet & Bildirim Al" sonrası `alert(...)` kaldırıldı; yerine `role="status"` yeşil (emerald) inline banner geldi, 5 saniye sonra otomatik kayboluyor.
  - Tüm `isTr ? … : …` metin üçlüleri (başlık, açıklama, filtre sekmeleri, program etiketleri, tablo başlıkları, durum rozetleri, modal metinleri, sayfalama, `formatDate`/`formatCurrency` fallback'leri) yeni `callsPage` ad alanına taşındı.
  - `FRAMEWORK_PROGRAMMES` dizisi artık `labelTr`/`labelEn` yerine `labelKey` taşıyor; render `t(\`framework.${prog.labelKey}\`)` ile yapılıyor (Pipeline modülündeki `t(\`tab.${tab}\`)` deseniyle aynı, kod tabanında zaten var olan bir konvansiyon).
  - `isTr` değişkeni yalnızca meşru yerlerde kaldı: `toLocaleDateString(isTr ? 'tr-TR' : 'en-US')` ve `Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', ...)` — bunlar kullanıcıya görünen sabit metin değil, `Intl` API'sine geçilen yerel kodları, DoD'un yasakladığı "metin üçlüsü" kapsamına girmiyor.

- `messages/tr.json` + `messages/en.json`: `callDetails` ve `callsPage` ad alanları eklendi (yalnız ekleme; dosya yeniden biçimlendirilmedi). Not: bu iki dosya paylaşımlı olduğu için başka bir ajanın `af28b7b` commit'i benim çalışma ağacımdaki bu eklemeleri de içine alarak zaten commit'lemiş — `git diff` bu dosyalarda artık boş çıkıyor, ayrıca commit gerekmedi (bkz. Kanıt).

## 2) Kanıt

**`alert(` sayısı — 0:**
```
$ grep -n "alert(" "src/app/[locale]/(app)/[workspace]/calls/page.tsx" "src/app/[locale]/(app)/[workspace]/calls/[id]/page.tsx"
(çıktı yok)
```

**Metin üçlüsü (`isTr ?`) sayısı — 0 (yalnız 2 meşru `Intl` locale-kodu kaldı):**
```
$ grep -n "isTr ?" ...
[id]/page.tsx:116:  ... {new Date(d.at).toLocaleDateString(isTr ? 'tr-TR' : 'en-US')}
page.tsx:190:      return d.toLocaleDateString(isTr ? 'tr-TR' : 'en-US', {
page.tsx:203:    return new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', {
```

**i18n parite — 726/726 (tr=en):**
```
$ pnpm i18n:check
"totalKeysInTurkish": 726, "totalKeysInEnglish": 726
```
("missingInTurkish"/"missingInEnglish" listesindeki `callsPage.framework.${prog.labelKey}` statik tarayıcının dinamik template-literal anahtarları çözemediği için düşen bir false-positive; aynı desen `Pipeline.detail.tab.${tab}` için de zaten var. `i18n:check`, `pnpm gate`'in parçası değil.)

**`pnpm gate` — temiz:**
```
✖ 194 problems (0 errors, 194 warnings)   ← lint: 0 hata, tüm uyarılar bu görevden önce de vardı, calls/** dışında
$ tsc --noEmit                             ← 0 hata
Test Files  60 passed | 2 skipped (62)
     Tests  590 passed | 8 skipped (598)
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

**Gerçek tıklama + ekran görüntüsü** (dev server zaten `:3000`'de çalışıyordu; AgentSpace'in dahili tarayıcı aracı `click` işlemi bu oturumda sürekli `guest eval failed: Uncaught` / `renderer timeout` ile başarısız oldu — birden çok farklı butonda ve sayfa yenilemesinde denendi, altyapı sorunu olduğu doğrulandı, bu yüzden gerçek Chromium'a karşı Playwright ile birebir aynı akış otomatikleştirildi; script geçiciydi, iş bitince silindi):
- `docs/agent-results/TASK-MTQZMX184PX87-screenshots/01-save-search-banner.png` — "Aramayı Kaydet & Bildirim Al" tıklandı, native `alert()` DIYALOĞU YOK, yerine yeşil `role="status"` banner: "Arama kaydedildi (Tüm Arama). Yeni çağrılar için e-posta bildirimi alacaksınız."
- `docs/agent-results/TASK-MTQZMX184PX87-screenshots/02-calls-list-en.png` — `/en/main/calls`, Türkçe kelime kalmamış (başlık, açıklama, sekmeler, tablo başlıkları, durum rozetleri hepsi İngilizce).
- `docs/agent-results/TASK-MTQZMX184PX87-screenshots/03-opportunity-add-error.png` — `createOpportunity` server action'ı kasten 500 döndürecek şekilde ağ katmanında kesildi (route intercept, kaynak kod değiştirilmedi), "Fırsatlara / Pipet'e Ekle" tıklandı → `role="alert"` kırmızı bant: "Fırsat eklenemedi. Lütfen tekrar deneyin." Playwright `dialog` event listener'ı native `alert()` FIRE OLMADIĞINI doğruladı (`dialogFired: false`).
- `docs/agent-results/TASK-MTQZMX184PX87-screenshots/04-opportunity-add-happy-path.png` — kesinti kaldırıldı, aynı butona tekrar tıklandı (retry), `/tr/main/firsatlar`'a yönlendirme gerçekleşti.

Konsol çıktısı:
```
OK: save-search banner shown, no alert() dialog
OK: /en/main/calls loaded
OK: opportunity-add error banner shown, native alert() fired: false
OK: happy path redirected to http://localhost:3000/tr/main/firsatlar
ALL CHECKS PASSED
```

## 3) Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/calls/[id]/page.tsx`
- `src/app/[locale]/(app)/[workspace]/calls/page.tsx`
- `messages/tr.json`, `messages/en.json` (başka bir ajanın commit'ine karışmış olarak zaten `dev`'de — bkz. yukarıda)

Commit: `8ef383b fix(calls): replace alert() with inline error bands, i18n the calls pages` — yalnız yukarıdaki iki `.tsx` dosyasını içeriyor (`git show --stat` ile doğrulandı).

## 4) Riskler

- `messages/tr.json`/`en.json` paylaşımlı dosya olduğu için benim eklediğim `callDetails`/`callsPage` anahtarları, benim ayrı bir commit atmama fırsat kalmadan başka bir ajanın `af28b7b` commit'ine karışmış görünüyor (muhtemelen o ajan `git add`'i geniş bir yol/glob ile çalıştırdı ve benim henüz commitlemediğim working-tree değişikliğimi de yakaladı). İçerik doğru ve JSON geçerli, parite 726/726, ama bu benim kontrolümde olmayan bir commit — dikkat çekmek isterim.
- `calls/page.tsx:159` civarındaki `react-hooks/exhaustive-deps` uyarısı (`loadCalls` useCallback'inde eksik `locale` bağımlılığı) bu görevden önce de vardı; kapsam dışı olduğu için dokunulmadı.

## 5) Açık sorular

Yok.

## 6) Sonraki adım

Yok — görev tamamlandı, `pnpm gate` temiz, DoD'un tüm maddeleri karşılandı.
