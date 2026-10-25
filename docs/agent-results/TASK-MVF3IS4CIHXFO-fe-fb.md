---
sözleşme: 3
görev: TASK-MVF3IS4CIHXFO
kod: TASK-MVF3IS4CIHXFO
ajan: fe-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: kök neden testti. pasteInto, Ctrl+A'dan sonra editöre tıklayıp seçimi çökertiyordu. Bunu PR #118 dev'de zaten düzeltmişti. PR #123 seçim doğrulaması ekliyor. Spec 12/12 yeşil, tam gate push'ta yeşil; merge yapılmadı.
platform: mac (Darwin, Playwright Chromium) üzerinde doğrulandı. Linux CI koşulamadı, çünkü GitHub Actions billing kapalı. Windows koşulamadı, makine yok. Dokunulan kod yalnız test helper'ı. `ControlOrMeta` Playwright'ta mac'te Meta'ya, Windows/Linux'ta Control'e çözülür. Seçim kontrolü DOM Selection API'sini kullanır, platformdan bağımsızdır. Platforma bağlı yol yok.
sürüm: 1
tarih: 2026-10-19T20:06:46.774Z
---

# FO-94 — "paste from Word" e2e kırmızısı: kök neden test, seçim doğrulaması eklendi

## Ne yapıldı
1. **Yeniden üretim.** Kartın komutu ortak `fabrika` DB'sinde farklı bir hatayla düştü. Admin blog listesi, başka bir dalın bıraktığı `localhost:9000` görselli 3 BlogPost satırı yüzünden `next/image` "unconfigured host" hatasıyla çöküyordu (ortam kirliliği, kapsam dışı). Bu satırlara dokunmadım. Aynı sunucuda ayrı bir database açtım (`fabrika_fo94`) ve CI sırasıyla kurdum.
2. **Kök neden.** `49e6a817`'de FO-77 düzeltmesi (`4f99a59b`, PR #118) yoktu. PR #118 sonradan merge edildi. Güncel dev'de (`80271979`) yalnız eski helper satırını (`await editor.click();`) geri koydum, editör kodu güncel kaldı. Sonuç: devop-fb'nin gördüğü hatanın aynısı, 1/3 kırmızı, `h1` bulunamadı. Editör metni: "…düz bir paragraftır.Word başlığı". Yani ürün değil test: tıklama Ctrl+A seçimini imlece çökertiyor, ürün de imleç konumuna yapıştırıyor. devop-fb'nin 2/2 görmesi yüke bağlı bir yarış; makinede load avg ~40.
3. **Sertleştirme (kart adım 3: "seçim doğrulaması ekle").** Beklentilerin hiçbiri gevşetilmedi.
   - `tests/e2e/fixtures/rich-editor.ts`: `selectAll(editor)` Ctrl+A'ya basar, sonra DOM seçimi tüm yazıyı kapsayana kadar bekler. `pasteInto` çağıranın seçtiği aralığın Ctrl+V'den hemen önce hâlâ seçili olduğunu doğrular.
   - `tests/e2e/admin-blog-rich-editor.spec.ts`: iki Ctrl+A noktası (Word paste ve boş editör) `selectAll` kullanıyor.

## Kanıt (ham çıktı)
- Ortak DB, origin/dev: `locator.click: Test timeout … waiting for getByRole('row')…` (admin listesi `Invalid src prop (http://localhost:9000/…)` ile çöktü)
- Temiz DB, origin/dev, tam spec `--repeat-each=3`: `12 passed (2.4m)`
- Eski helper geri konunca: `✘ 3 … Expected: "Word başlığı" Error: element(s) not found` → `1 failed, 2 passed`, error-context: `paragraph: Bu yazı … paragraftır.Word başlığı`
- Mutasyon (koşulsuz tıklama geri konuldu) + yeni koruma: `3 failed`, her biri `Error: the selection survives until Ctrl+V / Expected: "Buyazıeditörtestindenöncevardıvedüzbirparagraftır." / Received: null`
- Düzeltilmiş hal, `admin-blog-rich-editor` + `admin-blog-links-images` + `admin-blog-persistence` `--repeat-each=3`: `36 passed, 3 skipped`. Skip'lerin hepsi `links-images:100`: `no public object store in this environment (R2_PUBLIC_*)`. Hedef spec'te skip 0.
- `pnpm lint`: 0 hata, 4 uyarı (hepsi dokunulmayan dosyalarda, dev'den geliyor). `pnpm typecheck`: temiz.
- Push (pre-push `pnpm gate`, `--no-verify` YOK): `Test Files 368 passed | 2 skipped`, `Tests 4864 passed | 54 skipped`, i18n ✅, rls:check ✅, rls:bypass-check ✅, rls:verify `✅ 47 kiracıya özel tabloda … GERÇEKTEN ölçüldü`, e2e `378 passed (14.9m)`, `9 skipped` (object store / R2 / canlı RAG / ortam), alerts:check ✅, `* [new branch] fe-fb/fo94-word-paste-select-all`.
- PR: https://github.com/yaslan/fonbridge/pull/123 (base `dev`, commit `d417d8dd`)
- Görseller: `TASK-MVF3IS4CIHXFO-fe-fb-shots/01-old-helper-glued-heading.png` (önce: başlık paragrafa yapışık), `02-fixed-word-paste-h1.png` (sonra: `h1` "Word başlığı").

## Değişen dosyalar
- `tests/e2e/fixtures/rich-editor.ts` (+25)
- `tests/e2e/admin-blog-rich-editor.spec.ts` (3 satır)
- Ürün kodu (`RichTextEditor.tsx`) değişmedi.

## Riskler
- Gate ilk 4 denemede kırmızıydı; hepsi ortam kaynaklı, hiçbiri bu değişiklikten değil:
  - (a) yeni DB'de `fabrika_app` grant'ları eksikti: 285 test "permission denied";
  - (b) yük altında zamanlama testleri düştü: `expert-prereg-form` 30 sn timeout, `rag-pdf-worker-isolation` 3000 ms eşiğinde 3091–3346 ms ölçüldü; tek başına 66/66 yeşil;
  - (c) CI'ye özel `rls_auto_enable()` fonksiyonu, yerelde var olan anon/authenticated rollerine açıktı.

  Hiçbir testi değiştirmedim. Son koşuda yalnız `VITEST_MAX_WORKERS=4` verdim.
- Ortak `fabrika` DB'sindeki `localhost:9000` görselli 3 blog satırı, admin blog e2e'lerini ortak DB'de kırmaya devam ediyor. Dokunmadım: veri başkasının.

## Açık sorular
- Yok (karar gerektiren bir şey yok).

## Sonraki adım
- PR #123 incelemesi ve dev'e merge (kurala göre merge bende değil).
- devop-fb'ye haber verildi: FO-44 push'u güncel dev'e rebase edince bu spec yeşil olmalı.
- Ayrı DB ile gate için tuzaklar (ekip bilgisi):
  - `pnpm db:rls-role`, rol kümede zaten varsa yeni database'e grant vermeden çıkıyor. `prisma/rls-app-role.sql` elle uygulanmalı.
  - `.github/ci/supabase-ensure-rls.sql` yerelde uygulanmamalı. Uygulanırsa `rls:verify` kırmızı olur.
