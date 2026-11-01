# TASK-MVBKUG4UMM342 (FO-23#review): PR #78 incelemesi (crw2-fb)

**PR:** https://github.com/yaslan/fonbridge/pull/78, base `dev`, head `be-fb/fo23-prereg-fixes` @ `77a6f9e0` (OPEN; merge yok, approve verilmedi)
**Hüküm:** **MERGE'E HAZIR.** Bloke eden bulgu yok. Aşağıdaki 3 MINOR ve 3 NIT bu PR'da ya da FO-26'da kapatılabilir; hiçbiri veri kaybı ya da güvenlik açığı değil.

**Platform beyanı:** Doğrulama mac'te yapıldı (darwin 27, Node 26.5, yerel Postgres `fabrika-postgres`). Değişen kod platforma bağlı değil (HMAC, Prisma/Postgres, HTTP). Linux ve Windows'ta koşulmadı, çünkü bu oturumda yalnız mac ortamı var. CI Linux'ta aynı vitest'i koşar.

## Ne yapıldı
1. Kartı (`get_task`), crw-fb'nin kaynak bulgularını ve be-fb'nin iki raporunu okudum (`/Users/macbook/alan/docs/agent-results/TASK-MVBKUG4UMM342-be-fb{,-2}.md`).
2. `origin/dev...77a6f9e0` diff'ini (10 dosya, +439/−80) satır satır okudum.
3. Worktree'de unit, typecheck, lint ve canlı testleri koştum. `fo20-uzman-fe`'deki `pnpm gate` (PID 86383) bitene kadar bekledim, canlı testleri ondan sonra başlattım.
4. Kendi geçici canlı testimle (`tests/zz-crw2-scratch.live.test.ts`) üç senaryoyu ölçtüm: salt yokken AUTH_SECRET yedeği, mail hatasında alanların durumu, IP penceresinin kayması. Dosyayı koşudan sonra sildim, `git status` temiz. DB satırları `crw2scratch-` önekiyle açıldı ve `afterAll` ile silindi.

## Odak soruları: cevaplar

| # | Soru | Sonuç |
|---|---|---|
| 1a | Pending satır aynı transaction'da mı güncelleniyor? | **Evet.** `register.ts:142-192`: advisory lock → IP sayımı → `findUnique` → `update`, hepsi tek `$transaction` içinde. |
| 1b | Eski token gerçekten geçersiz mi? | **Evet.** `verifyTokenHash` üzerine yazılıyor. Canlı testte eski token `invalid`, yeni token `ok:true` döndü. |
| 1c | Mail hatasında geri alma doğru mu? | **Token için doğru, form alanları için eksik.** Bkz. MINOR-A (canlı kanıtlı). |
| 1d | 5 dk cooldown 429 veriyor mu? | **Evet** (`register.ts:148-152`). Unit ve canlı testte cooldown içindeki deneme `rate_limited` döndü ve mail gitmedi. Eski satırda `verifyTokenExpiresAt` null ise `issuedAt=0` olur ve cooldown uygulanmaz; bu güvenli. |
| 2a | Salt yoksa HMAC(AUTH_SECRET) yedeği devrede mi? | **Evet.** Route artık `salt` geçirmiyor (`route.ts:17`); `options.salt === undefined` olduğu için yedek çalışıyor. Canlı ölçüm: `EXPERT_PREREG_IP_SALT` tanımsız, AUTH_SECRET tanımlı, aynı IP'den sonuç `created×5, rate_limited`; `ipHash = HMAC(derivedKey, bucket)`. |
| 2b | İkisi de yoksa ne oluyor? | `expertPreRegIpSalt` null döner, `ipHash` null olur, IP sınırı kapanır ve bir kez `warn` yazılır. Belgelenmiş (`.env.example`, DATA_MODEL §22). Tutarlı. |
| 3 | Koltuk = 100 − max mı? | **Evet** (`seats.ts:12-13`), `verify.ts`'in sıradaki numarasıyla aynı kaynak. Null ve sınır aşımı durumları test edilmiş. |
| 4 | disabled→409 sapması mantıklı mı? | **Evet, onaylıyorum.** Self-service yeniden kayıt admin'in `disabled` kararını `pending`'e çevirip yeni link göndermemeli. `verify.ts:47` zaten disabled'ı `invalid` sayıyor; iki taraf tutarlı. |
| 5 | `createdAt` güncellemesinin admin CSV'ye etkisi | Bkz. NIT-1. Bilinçli ve belgelenmiş; FO-26 (`lastSubmittedAt`) ile kapanacak. |
| 6 | Testler gevşek mi? | Çoğu sıkı. İki boşluk var: MINOR-B (AUTH_SECRET yedeğinin bağlantısı test edilmiyor) ve MINOR-C (canlı test başlığı yaptığından fazlasını iddia ediyor). |

## Bulgular (önem sırasıyla)

### MINOR-A: Mail hatasında yalnız token geri alınıyor; yeni form alanları ve rızalar eski bağlantıyla doğrulanabilir hâle geliyor
- **Yer:** `src/lib/expert-prereg/server/register.ts:183-192` (yalnız `verifyTokenHash` ve `verifyTokenExpiresAt` saklanıyor) ve `:216-219` (restore).
- **Senaryo (canlı kanıtlı):** Uzman "Orijinal Ad" ile kayıt oluyor. 5 dk sonra aynı e-postayla `fullName:'Baska Biri', marketingConsent:true` gönderiliyor ve SMTP hata veriyor (503). Satır eski bağlantıya dönüyor ama alanlar yeni değerlerde kalıyor. Uzman ilk maildeki eski bağlantıya tıklıyor ve şu satır doğrulanıyor:
  ```
  B verify {"ok":true,"founderNumber":3,"locale":"en"}
  row {"fullName":"Baska Biri","marketing":"2026-10-17T08:10:27.118Z","status":"verified"}
  ```
  Uzmanın elindeki mail eski adı gösteriyor, ama doğruladığı satırda başkasının yazdığı ad ve **pazarlama rızası** var. Mail çalışırken bu sorun yok, çünkü sahibi yeni maili ve yeni adı görüyor. Bu durumda ise 503'ü yalnız formu gönderen görüyor; e-postanın sahibi hiçbir şey görmüyor. KVKK açısından rıza damgası (`marketingConsentAt`) e-postanın sahibine ait olmayan bir isteğe dayanıyor. Tetiklemek için SMTP hatası ve e-postayı bilen üçüncü bir kişi gerekiyor; olasılık düşük.
- **Öneri:** `ReissueState` içine bütün `fields` anahtarlarının eski değerlerini al: `findUnique` `select`'ini genişlet ve restore'da hepsini geri yaz. `createdAt` ve `ipHash` yeni denemede kalabilir, böylece IP sayımı korunur. Unit testteki "puts the previous link back" testine `fullName`/`marketingConsentAt` assert'i ekle.

### MINOR-B: MAJOR-2'nin bağlantısı (`salt` verilmeyince AUTH_SECRET yedeği) otomatik testle korunmuyor
- **Yer:** `register.ts:110-111`. Bütün unit testler ve iki canlı test `salt`'ı açıkça geçiriyor (`register.test.ts`, `expert-prereg-reissue.live.test.ts:62-68`). `expertPreRegIpSalt` yalnız saf fonksiyon olarak test ediliyor.
- **Senaryo:** be-fb'nin yakaladığı route hatası (`salt: env... ?? null` yedeği kapatıyordu) geri gelirse ya da biri `salt: null` geçirirse hiçbir test kırılmaz. Hatanın kendisini de birim testler değil, canlı curl yakalamıştı (be-fb raporu).
- **Öneri:** `salt` vermeden çağıran bir unit test ekle (`process.env.AUTH_SECRET`'ı `vi.stubEnv` ile ayarla, `ipHash !== null` ve `=== hashExpertIp(ip, expertPreRegIpSalt(undefined, secret))` olduğunu assert et). Benim geçici canlı testim (senaryo A) bu yolun bugün çalıştığını kanıtladı, ama kalıcı değil.

### MINOR-C: `process.env` doğrudan okunuyor ve `authSecret()` mantığı kopyalanmış
- **Yer:** `register.ts:111` → `process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET`. Aynı ifade `src/lib/leads/public-lead.ts:166-169`'da (`authSecret()`, export edilmemiş) da var.
- **Sorun:** CLAUDE.md "Yapma" listesinde "`process.env` ile doğrudan okuma (`src/lib/env.ts` kullan)" kuralı var. Emsal mevcut ve kart da `public-lead.ts:168`'i gösteriyor, bu yüzden bloke etmiyor. Ama ikinci bir kopya, NextAuth'un sır kaynağı değişirse iki yerden birinin unutulmasına yol açar.
- **Öneri:** `authSecret()`'ı tek yerden export et (ya da `env.ts`'e `AUTH_SECRET` ekle) ve iki çağrı noktası da onu kullansın.

### NIT-1: `createdAt` artık "son deneme" anlamına geliyor
`admin.ts:72` listeyi `createdAt desc` ile sıralıyor ve `admin.ts:109` CSV'ye aynı alanı yazıyor. Bu yüzden yeniden kayıt satırı listenin başına çıkıyor ve ilk kayıt tarihi kayboluyor. Saklama kararı ileride `createdAt`'e bağlanırsa, yeniden kayıt saklama süresini uzatır. Bu davranış belgelenmiş (DATA_MODEL §22) ve FO-26'ya (`lastSubmittedAt`) devredilmiş; FO-26'da IP penceresi `lastSubmittedAt`'e taşınmalı ve `createdAt` sabit kalmalı.

### NIT-2: Yeniden kayıt satırın IP sahipliğini taşıyor
Canlı ölçüm: IP A'nın açtığı pending satırı IP B'den yeniden kaydedilince A'nın penceresindeki sayı `1 → 0` oldu (senaryo C). A'ya 1 kota geri dönüyor, ama bunun bedeli B'den 1 kota. Kötüye kullanım kazancı yok. Bilgi olarak yazıyorum; değişiklik önermiyorum.

### NIT-3: Okunabilirlik ve test başlığı
- `register.ts:111` 150 karakter (`:150` 123, `:211` 129). Lint geçiyor, ama `const salt =` dalı iki satıra bölünürse okunur.
- `tests/expert-prereg-reissue.live.test.ts:133` başlığı "the per-IP limit counts re-issued attempts too" diyor, ama test hiç yeniden kayıt yapmıyor (5 yeni kayıt + 6.). Yeniden kayıt sayımı yalnız unit testte (`register.test.ts` "counts a re-issued registration toward the IP window") var. Başlığı düzelt ya da teste bir yeniden kayıt adımı ekle.
- Cooldown 429'u ile IP 429'u aynı gövdeyi (`rate_limited`) döndürüyor, bu yüzden FE "5 dk sonra tekrar deneyin" diyemiyor. Bu FE ve kapsam dışı; FO-26'da ayrı bir kod (`resend_cooldown`) düşünülebilir.

## Kanıt (ham çıktı)
```
$ pnpm exec vitest run src/lib/expert-prereg
 Test Files  4 passed (4)
      Tests  46 passed (46)
$ pnpm typecheck
$ tsc --noEmit            (exit 0, çıktı yok)
$ pnpm exec eslint src/lib/expert-prereg src/app/api/expert-preregistration tests/expert-prereg-reissue.live.test.ts tests/expert-prereg.live.test.ts
lint-exit=0

$ pnpm exec vitest run --reporter=verbose tests/expert-prereg-reissue.live.test.ts tests/expert-prereg.live.test.ts tests/zz-crw2-scratch.live.test.ts
EXPERT_PREREG_IP_SALT set? false AUTH_SECRET set? true
 ✓ expert-prereg.live > gives 20 concurrent verifications distinct, gap-free numbers up to the limit, and none past it
 ✓ expert-prereg.live > answers a second click on each link the same and moves no number
 ✓ expert-prereg.live > exports the test rows as CSV with the header first and one line per row
A results created,created,created,created,created,rate_limited
B verify {"ok":true,"founderNumber":3,"locale":"en"} row {"fullName":"Baska Biri","marketing":"2026-10-17T08:10:27.118Z","createdAt":"2026-10-17T08:10:27.118Z","status":"verified"}
C countA before/after 1 0
 ✓ zz-crw2-scratch > A: salt option omitted -> AUTH_SECRET-derived key is used, 6th from one IP is 429
 ✓ zz-crw2-scratch > B: re-issue whose mail fails keeps the NEW form fields with the OLD link
 ✓ zz-crw2-scratch > C: re-issue from IP B moves the row out of IP A window
 ✓ expert-prereg-reissue.live > registers again after the link ran out: 201, one row, old link invalid, new link verifies
 ✓ expert-prereg-reissue.live > answers 429 to a pending re-registration inside the cooldown and sends no mail
 ✓ expert-prereg-reissue.live > stores only the keyed IP hash, and the per-IP limit counts re-issued attempts too
      Tests  9 passed (9)

$ gh pr view 78 → OPEN 77a6f9e06b0c5af5883e35c96227b0102d65f4f3 dev
$ git status --short (worktree, geçici test silindikten sonra) → boş
```
Canlı testler atlanmadı: 9 testin 9'u ✓, hiç `↓` yok. Tam `pnpm test` ve `pnpm gate`'i koşmadım. be-fb'nin pre-push gate'i aynı commit (`77a6f9e0`) için `343 passed | 7 skipped`, e2e `323 passed` raporluyor; paylaşılan DB'yi ikinci bir tam gate'le meşgul etmedim.

## Kapsam kontrolü
- Dokunulan dosyalar kartın izin verdiği alanda: `src/lib/expert-prereg/**`, testler, `.env.example`, DATA_MODEL §22. Tek istisna `src/app/api/expert-preregistration/route.ts` (−3 satır). Bu değişiklik MAJOR-2'nin çalışması için **zorunlu**: route `salt: null` geçirdiği için yedek hiç devreye girmiyordu. Gerekçe PR'da yazılı. FE'ye ve davet akışına dokunulmamış.
- MINOR-2'nin (verified-409 sayımı) ertelenmesi gerekçeli: 409 yolunda hiçbir satır yazılmıyor, saymak için yeni tablo gerekiyor. Kart da bunu "yapılamıyorsa öner" diye izin veriyor. FO-26'ya devredilmiş.
- Kartta olmayan ek: `RESEND_COOLDOWN_MS`. Bu olmadan IP sınırı tek satırı saydığı için bir adrese sınırsız mail gidebilirdi. Gerekli ve doğru bir ek.

## Değişen dosyalar
Yalnız bu rapor: `docs/agent-results/TASK-MVBKUG4UMM342-crw2-fb.md`. PR koduna dokunmadım. Geçici test dosyası silindi.

## Riskler
- MINOR-A düzeltilmeden merge edilirse, SMTP hatası sırasında e-postanın sahibinin bilmediği alan ve rıza değişiklikleri doğrulanabilir. Olasılık düşük, KVKK etkisi var.
- Benim B testim paylaşılan dev DB'de geçici olarak `founderNumber 3`'ü kullandı. Satır silindi; `max(founderNumber)` etkilenmedi.

## Açık sorular
- Görev metnindeki KANIT yolu (`/Users/macbook/alan/docs/agent-results/TASK-MVBKUG4UMM342-be-fb-3.md`) incelenenin adını ve repo dışı bir kökü taşıyor. Gövdede verilen SONUÇ DOSYASI yoluna (bu dosya) yazdım. be-fb adına bir rapor açmadım.

## Sonraki adım
be-fb isterse MINOR-A, B ve C'yi bu PR'a bir commit olarak ekler (yaklaşık 20 satır kod ve 2 test). Eklemezse MINOR-A'yı FO-26'ya ekleyin. Lider merge kararını verir; ben approve ya da merge yapmadım.
