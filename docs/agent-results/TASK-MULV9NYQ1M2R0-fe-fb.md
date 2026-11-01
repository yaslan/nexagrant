# TASK-MULV9NYQ1M2R0 — FB RADAR A11Y (fe-fb)

Sprint FB-KAMU-2 · dal `dev` · kaynak: `docs/agent-results/TASK-MULU9J81KMT4N-crw-fb.md` §8 (Ö-1, Ö-7, Ö-8, metin K).
Kod commit'i: `3a174f32`.

## 1. Ne yapıldı

- **Ö-1 (kontrast):** `belediye-cagrilari/fit-check.tsx` içindeki seçili cevap artık `border-accent-strong bg-accent-strong text-white` kullanıyor. Aynı desen `belediye-cagrilari/page.tsx:290`'daki seçili kurum türü çipinde de vardı (`bg-accent text-white`, beyaz metin). Onu da `bg-accent-strong` yaptım.
  - Tarama: `fon-hazirlik/readiness-check.tsx:168` ve `:487` içinde `bg-accent` var ama bunlar metinsiz ilerleme çubukları, kontrast kuralı uygulanmıyor. Dokunulmadı.
  - `municipal-calls` ve `funding-readiness` yalnızca yeniden yönlendiren sayfalar, bu desen yok.
  - Kapsam dışında da aynı desen var: `src/components/UserMenu.tsx:233` ve `src/components/evidence/EvidenceDrawer.tsx:142`. Kart kuralı gereği dokunulmadı, §5'te not edildi.
- **Ö-7 (ARIA sözleşmesi):** `role="radiogroup"` + `role="radio"` butonları kaldırıldı. Yerine fon-hazirlik'teki gibi native `<input type="radio" class="sr-only">` + `<label>` geldi. Grup adı `fieldset/legend` üzerinden veriliyor, `name` her soru için benzersiz (`${idPrefix}-${q}`). Odak halkası `has-[:focus-visible]:outline` ile etikette görünüyor, fon-hazirlik deseniyle aynı. Artık her grup tek tab durağı, ok tuşları seçimi değiştiriyor. `data-answer` input'a taşındı.
- **Ö-8 (canlı bölge):** `role="status"` kapsayıcısı ilk render'dan itibaren DOM'da ve boş. Sonuç metni sonradan içine yazılıyor. "Fon Hazırlık Karnesi" linki ve "Yeniden cevapla" butonu canlı bölgenin dışına alındı; böylece duyuruya etkileşimli öğeler karışmıyor. Stil veren dış kutu yalnızca sonuç varken renkli.
- **Metin (`publicSectorCalls.not_eligible_note`):**
  - tr: "…başvuru sahibi ya da **fonlanan ortak** olamaz. AB'li ortakların projelerinde fonsuz/ilişkili ortak olarak yer almak mümkün olabilir; program rehberini kontrol edin."
  - en: "…applicants or **funded partners** in this programme. Taking part in EU partners' projects as an unfunded or associated partner may be possible; check the programme guide."

## 2. Kanıt

Doğrulama `http://localhost:3000` üzerinde yapıldı (leed-fb'nin sunucusu, yeni kodu servis ediyor). Playwright + sistem Chrome ile gerçek tuş basışı ve tıklama kullanıldı.

**Koyu tema** (`fabrika-theme=dark` çerezi, `<html class="dark" data-theme="dark">`), `/tr/belediye-cagrilari`, ilk FitCheck:

```
status mounted before open: 1 text: ""
Tab -> INPUT pic-yes checked=false
Space -> INPUT pic-yes checked=true
ArrowRight -> INPUT pic-no checked=true
ArrowLeft -> INPUT pic-yes checked=true
Tab -> INPUT partner-yes checked=false
ArrowRight -> INPUT partner-no checked=true
Tab -> INPUT cofinancing-yes checked=false
Space -> INPUT cofinancing-yes checked=true
Shift+Tab -> INPUT partner-no checked=true
announcements: ["Hazırlık gerekliBaşvurmadan önce şunları tamamlamanız gerekiyor:Ortak bulma"]
selected { bg: 'rgb(14, 116, 144)', fg: 'rgb(255, 255, 255)', text: 'Evet' } contrast 5.36
orgType chip { bg: 'rgb(14, 116, 144)', fg: 'rgb(255, 255, 255)' } contrast 5.36
```

Bu çıktıdan çıkanlar:

- Tab her gruba bir kez uğruyor. Ok tuşları grup içinde seçimi değiştiriyor. Shift+Tab, grubun seçili radyosuna dönüyor.
- `MutationObserver`, önceden mount edilmiş `role="status"` içine yazılan tek duyuruyu kaydetti.
- Seçili butonun koyu temadaki kontrastı **5.36:1**; öncesinde 3.68:1 idi. Bu değer AA'nın 4.5:1 eşiğini geçiyor.
- İlk ölçümde 17.31 çıkmıştı. `transition` sürerken ölçüldüğü için geçersizdi; 800 ms bekleyip yeniden ölçtüm.

**Açık tema**, `/en/municipal-calls`, fareyle tıklama:

```
status: "A fitYou meet the basic prerequisites of this call. Next step: read the call document." verdict fit
light selected [ 'rgb(3, 105, 161)', 'rgb(255, 255, 255)' ]      # #0369A1 / beyaz = 5.93:1
after reset status: "" checked: 0 status count 1                  # sıfırlamada bölge DOM'da kalıyor, boşalıyor
note en: According to the official country list, Turkish organisations cannot be applicants or funded partners in this programme. Taking part in EU partners' projects as an unfunded or associated partner may be possible; check the programme guide.
```

Ekran görüntüleri (`docs/agent-results/TASK-MULV9NYQ1M2R0-fe-fb/`):

- `01-dark-selected-keyboard.png`: koyu tema, seçili butonlar `accent-strong` ile. İlk "Evet" üzerinde klavye odak halkası, altta sonuç kutusu.
- `02-dark-orgtype-chip.png`: kurum türü çipi, koyu tema.
- `03-not-eligible-note.png`: kapalı program notunun yeni metni (tr).
- `04-mobile-375.png`: 375 px genişlik. Butonlar taşmıyor, sorular kırılıyor (alttaki çerez bandı sayfanın kendi diyaloğu).

Kapılar:

```
npm run typecheck   → tsc --noEmit, çıkış 0
npm run lint        → eslint, çıktı yok (0 hata)
npm run i18n:check  → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
npm test            → 166 dosya geçti / 8 dosya kaldı (39 test)
```

`npm test` içindeki 8 kalan dosyanın hepsi canlı DB testleri: `plan-admin`, `plan-repository`, `*.live.test.ts`, `double-charge-prevention`, `plan-entitlement-version`, `relationship-tenant-scope`. Hepsi aynı nedenle kalıyor: "Authentication failed against the database server, the provided database credentials for `fabrika` are not valid". Hiçbiri bu değişikliğin dosyalarını import etmiyor; bu yerel DB kimlik bilgisi sorunu.

## 3. Değişen dosyalar

- `src/app/[locale]/belediye-cagrilari/fit-check.tsx`
- `src/app/[locale]/belediye-cagrilari/page.tsx` (tek satır, :290)
- `messages/tr.json`, `messages/en.json` (`publicSectorCalls.not_eligible_note`)
- `docs/agent-results/TASK-MULV9NYQ1M2R0-fe-fb.md` ve ekran görüntüsü klasörü

`src/lib/agency`, auth ve `next.config` dosyalarına dokunulmadı. Push yapılmadı.

## 4. Riskler

- Cevap butonları artık `<label>` + görsel olarak gizli radyo. Görünüm aynı; e2e testlerinde `button[data-answer]` seçicisi varsa bozulur. Repoda böyle bir seçici yok (`grep data-answer tests e2e` boş döndü).
- Canlı bölge boşken bile kutu DOM'da, ama görünür bir boşluk bırakmıyor (sınıfsız boş `div`). Bu durum `space-y-4` altında 0 yükseklikli bir öğe demek.

## 5. Açık sorular

- `src/components/UserMenu.tsx:233` ("Upgrade" benzeri buton) ve `src/components/evidence/EvidenceDrawer.tsx:142` de `bg-accent text-white` kullanıyor. Bu ikisi de koyu temada 3.68:1. Kart kapsamı dışında kaldıkları için dokunmadım. Ayrı bir kart önerilir.
- Ekran okuyucuyla (VoiceOver) dinleme yapılmadı. Duyuru, DOM mutasyonu ile kanıtlandı.

## 6. Sonraki adım

- crw-fb yeniden incelemesi.
- UserMenu ve EvidenceDrawer kontrastı için ayrı kart açılması.

## Platform beyanı

Doğrulama **macOS**'ta yapıldı (Darwin 27, sistem Google Chrome, Playwright). Değişiklik yalnız CSS sınıfları, native HTML radyo ve JSON metni içeriyor. Platforma bağlı kod yolu yok (süreç, dosya yolu, kısayol ya da DPI kullanılmıyor). Native radyonun ok tuşu davranışı Windows ve Linux'taki Chrome, Firefox ve Edge'de de standarttır. Windows ve Linux'ta ayrıca koşulamadı, çünkü bu makinede yalnız macOS var.
