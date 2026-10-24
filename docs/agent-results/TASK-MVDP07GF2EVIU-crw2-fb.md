---
sözleşme: 3
görev: TASK-MVDP07GF2EVIU
kod: TASK-MVDP07GF2EVIU
ajan: crw2-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: PR #118 onaylandı. Bloke eden bulgu yok. Paste kök nedeni kendi ölçümümle doğrulandı (eski yardımcı 4/10 kırmızı, yeni yardımcı 5/5 yeşil). Bileşen testi dev kodunda 2 kırmızı veriyor. Kendi probumda FO-75 geri sarması görülmedi.
platform: mac (Darwin), headless Chromium (Playwright) + jsdom (vitest). Değişen yol platformdan bağımsız: React effect zamanlaması, ProseMirror seçimi, `ControlOrMeta` Windows/Linux'ta Ctrl'e çözülür. Windows/Linux koşulamadı (makinede yok; CI Linux'ta koşacak). Firefox/WebKit Playwright projesi tanımlı değil.
sürüm: 1
tarih: 2026-10-19T11:15:46.419Z
---

# FO-77 · PR #118 kod incelemesi (crw2-fb)

## Ne yapıldı
PR #118 (`fe-fb/fo77-rte-markdown-reset`, head `4f99a59b`, base dev `49e6a817`, yani dev'in güncel ucu) satır satır okundu. Ölçümler `.claude/worktrees/crw2fb-review-fo77` adlı ayrı bir worktree'de yapıldı; worktree iş bitince kaldırıldı. Koşular, izole DB'yi gösteren `.env` için fe-fb'nin worktree'sinden başlatıldı (`fefb-fo77-pg` :55477, yerel MinIO R2 env'i, E2E_PORT=3178). Kod, config ve node_modules benim worktree'mden geldi. fe-fb'nin dosyalarına dokunulmadı.

## Bulgular (önem sırasıyla)
**Bloke eden: yok.**

### (1) Paste-from-Word kök nedeni: DOĞRULANDI
- Ölçüm aynı head'de yapıldı, yalnız `tests/e2e/fixtures/rich-editor.ts` dev sürümüne döndürüldü (sıkılaştırılmış spec yerinde kaldı):
  - Eski yardımcı, `--repeat-each=10`: **4 failed / 6 passed**. Dört hatanın hepsi `h1` "Word başlığı" bulunamadı, yani başlık eski paragrafa yapışmış.
  - Yeni yardımcı (PR), `--repeat-each=5`: **5 passed**.
- Mekanizma: spec `editor.click()` + Ctrl+A yapıyor, ardından yardımcı tekrar tıklıyordu. Bu tıklama seçimi imlece çökertiyor ve ProseMirror bunu sonraki `selectionchange`'te alıyor; böylece Ctrl+V ile yarışıyor. Gerçek kullanıcı da Ctrl+A sonrası tıklamadan yapıştırır, dolayısıyla yeni akış daha gerçekçi.
- Beklenti **gevşemedi**: `h1` doğrulaması yerinde duruyor, ayrıca `not.toContainText(ORIGINAL)` eklendi (tümünü değiştirme). Bu ekleme eski yarışı açıkça yakalıyor.
- Diğer çağıranlara etkisi:
  - `admin-blog-persistence.spec.ts:66`: editör odaksız (önceki adımda başlık ve özet doldurulmuş), yardımcı eskisi gibi tıklıyor. Davranış değişmedi.
  - `admin-blog-links-images.spec.ts:228`: `caretAtEnd` + Enter sonrası artık tıklama yok, yapıştırma sona gidiyor. Eski tıklama imleci tıklanan noktaya (editörün ortasına) taşıyabiliyordu. Doğrulamalar yalnız varlık/yokluk kontrolü yaptığı için eskisi de geçiyordu; yeni davranış niyete daha uygun.
  - Dört editör spec'i (rich-editor, concept-note, persistence, links-images), `--repeat-each=2`: **28 passed**, atlanan 0.

### (2) `emitted` tek değer + `useLayoutEffect`: FO-75 regresyonu yok
- **Kod analizi:** Admin formu her yayını `setFormData((prev) => ({...prev, content: md}))` ile sırayla uyguluyor. Bu yüzden bir render'ın taşıdığı `content` her zaman en son yayılan değer. FO-75'teki geri sarma, render ile effect arasına tuş vuruşu girmesinden doğuyordu: passive effect, eski render'ın değerini yeni dokümana karşı "dış değer" sanıyordu. Layout effect commit'in içinde, eşzamanlı koşuyor ve bu pencereyi kapatıyor. React 19.2.8'de SSR'da `useLayoutEffect` uyarısı yok.
- **Gerçek prob** (geçici spec yazıldı, sonra silindi): admin modalı açılıyor, 6x CPU kısıtı altında 12 kelime yazılıyor. İki yol denendi: `keyboard.type` (keydown/input) ve harf harf `keyboard.insertText` (DOMObserver yolu, ayrık olmayan öncelik). Sonra editör metni ve kaydedilen DB satırı birebir karşılaştırıldı.
  - PR kodu: **6/6 PROBE OK** (her yoldan 3).
  - Mutant (tek değer + passive `useEffect`): **6/6 yeşil**. Probum bu ortamda passive/layout farkını ayırt etmiyor; fe-fb'nin 8x stres bulgusuyla aynı sonuç. Layout effect'i destekleyen şey bu ölçüm değil, kod analizi. Zararsız ve doğru yönde.
- **HTML modu** (concept-note): mantık değişmedi, yalnız zamanlama layout effect'e taşındı. `setContent` → `onChange` → ebeveyn state'i artık layout effect içinde eşzamanlı güncelleniyor. Bu sonsuz döngü üretmiyor (`editor.isEmpty` kapısı ikinci turu kesiyor). concept-note e2e ×2 yeşil.
- **"Aynı değere sıfırlama tetiklenmez" boşluğu: kabul edilebilir.** Prop ile senkronlamanın doğal sınırı bu: prop değişmezse effect koşmaz, eski kodda da koşmazdı. Admin modalı `{isModalOpen && …}` ile her açılışta yeniden mount oluyor (`client.tsx:495`), yani bugün ürün yolunda ulaşılamaz. Kod içi notta da belirtilmiş.

### (3) Yeni bileşen testi: mutant kırmızı
- Yalnız `RichTextEditor.tsx` dev sürümüne döndürüldü: `tests/rich-text-editor-markdown-sync.test.tsx` → **2 failed / 2 passed**. "a reset to a value the author passed through…" `''` yerine `yeni taslak` alıyor; "the same reset in one batch…" `Expected "xa" / Received "xab"`.
- PR head'inde `rich-text-editor-markdown-sync` + `blog-markdown` → **55 passed (55)**. Not: benim worktree'mde DB'ye bağlı tek test (`every post in the database`) ana `.env`'in DB kimliği geçersiz olduğu için kırmızıydı (`Authentication failed … fabrika`). Bu ortam sorunu, PR'dan kaynaklanmıyor. Aynı commit'teki temiz fe-fb worktree'sinde 55/55.
- Kartın birebir izi (`a` → `''`) dev'de zaten yeşil; fe-fb bunu raporunda açıkça belirtmiş ve gerçekten kırmızı olan iki senaryoyu eklemiş. Undo testi, yankının fazladan transaction eklemediğini doğruluyor. Bu iyi bir koruma.

### Öneriler (bloke etmez)
- `RichTextEditor.tsx`'teki effect başlığındaki "Sync external content changes if editor is empty or on initial load" yorumu yalnız HTML modunu anlatıyor (öncesi de böyleydi). İsteğe bağlı olarak düzeltilebilir.

## Kanıt (ham çıktı)
`docs/agent-results/TASK-MVDP07GF2EVIU-crw2-fb-evidence/` ([WebServer] gürültüsü ayıklandı):
- `e2e-oldhelper-x10.txt`: `4 failed`, `6 passed (1.7m)`, `exit=1`
- `e2e-new-x5.txt`: `5 passed (30.7s)`, `exit=0`
- `e2e-editor-specs-x2.txt`: `28 passed (1.2m)`, `exit=0`
- `e2e-probe-pr.txt`: `6 passed (3.4m)`, 3× `PROBE OK keys`, 3× `PROBE OK insertText`
- `e2e-probe-mutant-passive.txt`: `6 passed (3.5m)`, mutant diff `-  useLayoutEffect(() => {` / `+  useEffect(() => {`
- vitest mutant (dev RichTextEditor): `Tests 2 failed | 2 passed (4)`; PR: `Tests 55 passed (55)`
- `eslint` (4 değişen dosya) exit 0; `pnpm typecheck` (`tsc --noEmit`) temiz.

## Değişen dosyalar
- Kodda değişiklik yok (inceleme). Yalnız bu rapor ve kanıt klasörü.

## Riskler
- Layout effect'in passive'e karşı üstünlüğü Chromium'da ampirik olarak gösterilemedi (iki varyant da yeşil). Yapısal gerekçe sağlam, ama gelecekte biri bunu `useEffect`'e geri çevirirse hiçbir test kırmızıya dönmez.
- Delegasyonun KANIT satırı yazarın dosyasını (`/Users/macbook/alan/docs/agent-results/TASK-MVDP07GF2EVIU-fe-fb.md`) gösteriyordu. Görev gövdesine uyularak rapor `-crw2-fb.md`'ye yazıldı; yazarın raporuna dokunulmadı.

## Açık sorular
- Yok.

## Sonraki adım
- PR #118 merge edilebilir (merge yetkisi bende değil). Ardından devop-fb PR #28'i yeniden push edebilir.
