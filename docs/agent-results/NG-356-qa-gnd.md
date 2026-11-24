# NG-356 — fo392-invite-code-limit.spec.ts:228 kararsız e2e (qa-gnd)

Kart: TASK-MWUYXKYXEVK77 · Dal: `task/ng-356` (base `se-fb/fo392-invite-code-limits`, `aea63193`) · Commit: `a5609177`
Platform: Linux (WSL Ubuntu 24.04, Node v24.20.0, pnpm 11.25.0, Chromium via Playwright). GitHub Actions (Linux) CI: bkz. "Kalan" bölümü.
Windows ve macOS: koşulamadı — test yalnız Linux'ta koşuldu; kod yolu platforma bağlı değil (saf HTTP yanıt sınıflandırması + JSON satır kontrolü).

## Ne yapıldı

1. Kartı (`get_task`), `git log -- tests/e2e/fo392-invite-code-limit.spec.ts` ve üç önceki commit'i (`d080e9bb`, `756d774d`, `2c8fd518`) okudum.
2. Kırmızı CI koşusunu (`45413331639`, #432 e2e (1)) inceledim: düşen satır 334 (`expect(actions.some((b) => b.text.includes('code'))).toBe(true)`).
3. Yerelde baseline (düzeltme öncesi, orijinal spec) — dosyanın tamamı, `--repeat-each=20`: **2 kırmızı / 80**. Tam dosya `--repeat-each=40` tanı koşusu: **2 kırmızı / 160**, iki kırmızı da başka bir assertion'da (aşağıda).
4. Kök nedeni dump ile kanıtladım (aşağıda).
5. Düzeltme: spec içinde üç değişiklik (aşağıda). Uygulama koduna dokunulmadı.
6. Düzeltme sonrası: `--repeat-each=20` **0 kırmızı / 80**; `--repeat-each=40` **0 kırmızı / 160**.
7. Mutant: create yanıtından `code` alanını geçici olarak kaldırdım → test kırmızı; geri aldım (commit'te yok).
8. Lint (eslint, dosya) ve `pnpm typecheck` temiz.

## Kök neden (kanıtlı)

**Neden 334 düşüyordu:** Route handler (`2c8fd518`, NG-347, #422) create POST'unu şu koşulla ayırıyordu:
`if (text.includes('"notifications"')) return;` (yani bildirim poll'u sanıp yanıtı geçiriyordu).
Create action'ın yanıtı ise **revalide edilmiş tüm sayfa** (311 KB RSC); bu sayfa `"notifications"` anahtarını da taşıyor. Sonuç:

- create yanıtı "bildirim" sayıldı, `markAction` çağrılmadı;
- create'ten sonra `refresh()` → `listInviteCodes` POST'u geldi, `"code"` içermeyen bir liste yanıtı **create** sanılıp yakalandı;
- 334 yalnızca sayfa düzeyindeki `page.on('response')` kopyası create gövdesini okuyabildiğinde geçiyordu (`bodies` içinde `POST fetch`, `"code"` var). Bu kopya `res.text()` ile navigasyon yarışında okunamazsa (`.catch` ile sessizce düşer) 334 kırmızı oluyor. Yani 334 iki bağımsız hatanın birleşimi: yanlış sınıflandırma + yarışa açık ikinci kaynak.

Passing koşudan dump (dump-0, gerçek veri): gövde #4 = `POST fetch` 311295 bayt, `"notifications"` içerir, sonuç satırı `1:{"ok":true,"code":"NCHD-X56C-JWNC","hint":"JWNC",...}`; gövde #5 = `POST action` 841 bayt = `listInviteCodes` listesi (`"code"` yok).

**Neden önceki üç düzeltme tutmadı:**
- `d080e9bb` (reload'dan önce oku): okuma sırasını düzeltti, ama sınıflandırma (hangi POST create) yanlış kalmaya devam etti.
- `756d774d` (NG-142, olay gelince oku): aynı — okuma zamanlaması değişti, sınıflandırma değişmedi; ayrıca sayfa düzeyi okuma hâlâ yarışa açık.
- `2c8fd518` (NG-347, #422, Node tarafında okuma): create'i route'ta yakalama doğru fikirdi, ama `"notifications"` içerik-sınıflandırması bu commit'te eklendi ve create yanıtını tam bu yüzden yanlış sınıflandırdı. Sorun sadece bu yanlış sınıflandırma değil; testin başka bir hata modu da var (aşağıda 336).

**Neden 336 düşüyordu (ikinci, farklı hata — baseline repeat12 ve tanı dump-12/21):**
`expect(b.text).not.toMatch(exact limit)` tüm POST gövdelerinde çalışıyordu. Limit 500..524 arasında rastgele; create sayfasının RSC gövdesinde alakasız bir takvim hatası metni geçiyor: `Takvim token şifreleme anahtarı tanımlı değil (503 Service Unavailable`. Limit 503 çıkınca `(?<![0-9A-Za-z])503(?![0-9A-Za-z])` eşleşiyor → yanlış kırmızı. Dump doğrulaması: 40 tanı dump'ında exact=503 olan iki koşu (dump-12, dump-21) tam bu iki hatayı verdi; gövde #4'te "503" yalnızca bu takvim metninde geçiyor.

## Değişiklik (commit `a5609177`, yalnız `tests/e2e/fo392-invite-code-limit.spec.ts`)

1. **Create'i istekten seç:** `createInviteCode({ expiresOn, label })` çağrısının POST gövdesi yalnızca create'te `"expiresOn"` taşır. Route artık `req.postData()` ile ayırıyor; yanıt içeriğine bakmıyor. Bildirim poll'u ve liste yenilemesi geçirilir.
2. **Create'in gerçekten yakalandığını sonuç satırıyla doğrula:** `action.text` içindeki `1:{"ok":...` satırı `^1:\{"ok":true,"code":"` ile eşleşmeli (eski `includes('code')` yerine). Bu, sayfa düzeyindeki yarışa bağlı kopyaya bağımlılığı kaldırır.
3. **Sayısal limit taraması, sonuç satırında:** Tüm RSC sayfasında değil, create'in kendi sonuç satırında (`{"ok":true,"code","hint","expiresAt"}`). Anahtar-adı taraması (`useLimit`, `usedCount`) tüm gövdelerde aynen duruyor; görünen sayfa metni taraması (`main` innerText) da aynen duruyor.

Üç değişiklikte de assertion silinmedi; sadece hedef kesinleştirildi. Gevşetme kontrolü: sayısal tarama kapsamı (3) daraltıldı — bu bilinçli bir karar, aşağıda "Riskler"de belirtildi.

## Kanıt (ham çıktı)

**Baseline (orijinal spec), `--repeat-each=20`, log `~/ng356-logs/before-repeat20.log`:**
```
  2 failed
  78 passed (3.9m)
  EXIT=0
```
- repeat12 (satır 336): `Error: http://localhost:3100/tr/ajans carries the exact limit 503`
- repeat15 (satır 334): `Expected: true / Received: false` at `spec.ts:334:56`

**Tanı, orijinal spec, tam dosya `--repeat-each=40` (160 koşu), log `diag40full.log`:**
```
  2 failed
  158 passed (7.0m)
```
İki kırmızı: 336 (exact limit 503, iki kez). Dump analizi: 40/40 dump'ta create yanıtında `"code"` var, passing koşularda sınıflandırma yanlış olsa da 334 sayfa düzeyi kopya ile geçiyordu.

**Düzeltme sonrası, `--repeat-each=20`, log `after-repeat20.log`:**
```
  80 passed (3.5m)
  EXIT=0
```
**Düzeltme sonrası, `--repeat-each=40`, log `after-repeat40.log`:**
```
  160 passed (7.0m)
  EXIT=0
```

**Mutant (create yanıtından `code` alanı kaldırıldı; app dosyası geri alındı, `git diff` satır sayısı 0), log `mutant.log`:**
```
  2 failed
  6 passed (26.6s)
  EXIT=1
Error: the marked POST is the create response (its result object)
Expected pattern: /^1:\{"ok":true,"code":"/
Received string:  "1:{\"ok\":true,\"hint\":\"QR3K\",\"expiresAt\":\"2027-02-22T23:59:59.000Z\"}"
```
Mutant her iki tekrarda da kırmızı → yeni assertion gerçekten koruyor.

**Lint/Typecheck:** `eslint tests/e2e/fo392-invite-code-limit.spec.ts` → exit 0; `pnpm typecheck` (tsc --noEmit) → exit 0. Commit hook'u da staged kapsamı temiz geçirdi.

**İzole DB:** `fabrika_test_ng356` (Docker `ng356-pg`, 127.0.0.1:5660, pgvector/pgvector:pg16). `pnpm db:setup` → `db-setup: done (127.0.0.1:5660/fabrika_test_ng356)`. E2E_PORT=3100. Mailpit gerekmedi (bu testte davet/posta akışı yok).

## Değişen dosyalar
- `tests/e2e/fo392-invite-code-limit.spec.ts` (commit `a5609177`)
- `docs/agent-results/NG-356-qa-gnd.md` (bu dosya)

Uygulama kodu, `.env` (gitignored; yalnız `.env.example`'dan kopya) ve DB şeması değişmedi.

## Riskler
- **Kapsam daraltma (336):** Sayısal limit taraması artık tüm RSC sayfası yerine create'in sonuç satırında. Sayfada limit sayısı görünürse yakalanır (görünen metin taraması hâlâ var). Yine de sayfanın RSC payload'undaki sayısal sızıntıyı artık yakalamıyoruz; bu, rastgele-sayı yanlış pozitifini kaldırmak için bilinçli bir takas. Reviewer onaylamazsa alternatif: limiti testte sabitlemek (uygulamaya dokunmadan mümkün değil) veya RSC'de anahtar-bağlamlı arama.
- **CI doğrulaması:** Kırmızı CI'nin kaynağı GitHub Actions (Linux) — yerel WSL koşusu ile CI zamanlaması aynı değil. Yerelde hata oranı ~%1,25 idi; düzeltme sonrası 240/240 yeşil (yetersiz istatistik değil ama CI'de tekrar doğrulanmalı).
- Platform: yalnız Linux/WSL. Windows/macOS koşulamadı.

## Açık sorular
- Draft PR'da CI'nin tam yeşil olup olmadığı push sonrası `gh pr checks` çıktısıyla gösterilecek (aşağıda "Kalan").

## Kalan
- Push + draft PR (base `se-fb/fo392-invite-code-limits`) ve `gh pr checks` ham çıktısı — bu rapora eklenecek.

## Definition of Done
- [x] Kök neden kanıtla yazıldı (dump + gövde alıntısı, #422 commit'i)
- [x] Düzeltme öncesi/sonrası `--repeat-each=20` sayıları raporda (2/80 → 0/80; tanı 2/160 → 0/160)
- [x] Mutant kırmızı (ham çıktı)
- [ ] Draft PR (base se-fb/fo392-invite-code-limits) tam CI yeşil — push/PR bekleniyor
- [x] Platform beyanı: yalnız Linux (WSL). GitHub Actions CI sonucu PR'da.
