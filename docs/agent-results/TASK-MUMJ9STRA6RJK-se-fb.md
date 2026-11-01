# TASK-MUMJ9STRA6RJK — Sentry'ye giden hata metninde kişisel veri (İNCELEME-18 K-3a) — se-fb

## 1. Ne yapıldı
- **Sorun (K-3a, crw-fb İNCELEME-18 §3):** `buildSentryEvent` mesajı yalnız `scrubText` ile temizliyordu. Bu fonksiyon yalnız e-postayı maskeliyor. `error` seviyesindeki çağrıların çoğu mesaja `errorMessage(e)` ekliyor (`sso.ts:90`, `alerts-daily.ts:306`, `cordis-delta.ts:329`, `stripe-event-cleanup.ts:48`, `k2-monthly-cordis.ts:65`). Meta'ya da ekleyenler var (`importer.ts:689` `error`, `rag.ts:351` `cleanupError`). Prisma hatası sorgu değerlerini çok satırlı olarak taşıyor: ad, TC no. Bağlantı hatası ise kaynak kod alıntısı ve mutlak dosya yolu taşıyor.
- **Düzeltme:** `src/lib/observability/sentry.ts` içine `scrubErrorText` eklendi. `message.formatted`, `fingerprint` ve `extra` içindeki bütün dize değerler bu fonksiyondan geçiyor:
  1. Yalnız **ilk boş olmayan satır** kalır. Prisma mesajı `\n` ile başladığı için bu satır çağıranın önekidir. Aşağıda `Invalid \`x.y()\` invocation` başlığı varsa yalnız çağrı adı `[db.user.findFirst()]` olarak eklenir. Bu satırın biçimi sabittir ve değer taşımaz. Satır atıldıysa sona `[…]` konur.
  2. O satırda tırnak içindeki her değer maskelenir: `"…"`, `'…'` ve `` `…` ``. Tek istisna yalın çağrı adıdır. Kelime içindeki kesme işareti (`Can't`) tırnak sayılmaz.
  3. Postgres anahtar ayrıntısı `=(…)` ve 6 ya da daha fazla haneli sayılar (TC, telefon, IBAN gövdesi) maskelenir. Ardından e-posta maskelenir ve uzunluk sınırı uygulanır.
  4. Tam metin `SystemAlert` satırında, dağıtımın içinde kalmaya devam ediyor. Bu satır değişmedi.
- **Belge (§19a şartı):** `docs/legal/processing-register.md` §19a güncellendi. Sentry "veri kategorileri" hücresi artık "yalnız ilk satır + maskeleme" diyor. "İlgili kişi" hücresindeki fazla vaat eden cümle ("kiracı içeriği taşımaz") da koda uyduruldu.
- Sentry varsayılan olarak hâlâ **kapalı** (`SENTRY_DSN` boş). DSN'i açmak patron onayına bağlı; bu değişmedi.

## 2. Kanıt
**Gerçek Prisma hatası, uçtan uca.** Hatalar elle yazılmış dize değil. Kapalı bir porta (`127.0.0.1:1`) bağlanan gerçek bir `createDbClient` fırlatıyor. Hata `recordAlert` üzerinden geçiyor, yerel HTTP yakalama sunucusu gelen zarfı alıyor ve gövde taranıyor.
- `PrismaClientValidationError`: ham metin `Ayşe Yılmaz`, `12345678901` ve `ayse@example.org` içeriyor (ön koşul olarak test ediliyor). Sentry gövdesi `Ayşe`, `Yılmaz`, `12345678901`, e-posta, `bogusField` ve `nopass` içermiyor. `message.formatted` = `SSO domain lookup failed: [db.user.findFirst()] […]`.
- `PrismaClientKnownRequestError P1001`: ham metin test dosyasının yolunu ve kaynak alıntısını içeriyor. Gövde `observability-sentry.test.ts`, `/Users/` ve `createDbClient` içermiyor. Sonuç: `Saved-search fetch failed: [db.user.findFirst()] […]`.
- Tablo testleri: P2002 `` (`email`) ``, `Key (email)=(…)`, `'Ayşe'` ve TC, `Can't` (maskelenmemeli), çok satırlı `Invalid … invocation:`.

```
$ npx vitest run tests/observability-sentry.test.ts tests/feedback-alerts.test.ts
 Test Files  2 passed (2)
      Tests  32 passed (32)
$ npx tsc --noEmit | wc -l
       0
$ npx eslint src/lib/observability tests/observability-sentry.test.ts ; echo eslint=$?
eslint=0
```

**Mutasyon.** `scrubErrorText` eski davranışa, yani `scrubText(value).slice(...)` haline döndürüldü (temizleyici kapatıldı):
```
$ MUTANT=1 npx vitest run tests/observability-sentry.test.ts
 FAIL … validation error … AssertionError: expected '{"event_id":…' not to contain 'Ayşe'
 FAIL … request error …    AssertionError: expected '{"event_id":…' not to contain 'observability-sentry.test.ts'
 FAIL … scrubErrorText("Unique constraint failed on the fields: (`email`)")
 FAIL … scrubErrorText("Key (email)=(a.b@c.io) already exists")
 FAIL … scrubErrorText("lookup 'Ayşe' failed, TC 12345678901")
 FAIL … scrubErrorText("Invalid `prisma.user.create()` invocation:\n…")
 Failed Tests 6
```
Mutant kaldırıldı (`grep -c MUTANT sentry.ts` → 0) ve testler yeniden 32/32 yeşil. `Can't` satırı mutantta da yeşil kaldı; bu beklenen sonuç, çünkü o satır maskelenmemesi gerekeni doğruluyor.

Not: ilk tsc koşusunda tek hata vardı: `tests/modules-pilot-upgrade-cta.test.tsx(51,10)`. Bu dosya o sırada komşu ajanın takip edilmeyen dosyasıydı, benim değişikliğimle ilgisi yoktu. Son koşuda hata sayısı 0.

## 3. Değişen dosyalar
- `src/lib/observability/sentry.ts`: `scrubErrorText` eklendi; message, fingerprint ve extra bu fonksiyondan geçiyor.
- `tests/observability-sentry.test.ts`: yeni `Prisma error text → Sentry` bloğu (7 test).
- `docs/legal/processing-register.md`: §19a Sentry satırı.
- `docs/agent-results/TASK-MUMJ9STRA6RJK-se-fb.md`: bu rapor.

## 4. Riskler
- Sentry artık daha az ayrıntı görüyor. Prisma'nın asıl sebep satırı (ör. `Can't reach database server`) ilk satırda değilse gitmiyor. Bu bilinçli bir seçim: operatör ayrıntıyı `/admin/alerts` üzerinden `SystemAlert` satırında görür, Sentry etiketindeki `alert_id` de oraya bağlanır.
- Tırnaksız ve rakamsız serbest metin (ör. ilk satırda tırnaksız yazılmış bir ad) desenle tanınamaz. Kalan güvence şu kural: çağıranların ilk satırı sabit bir önek olmalı (`… failed: `), değer taşımamalı. Bugünkü bütün `error` çağrıları bu kurala uyuyor (yukarıda sayılan 6 yer).
- Maskeleme agresif olduğu için P2002 alan adları da (`` `email` ``) Sentry'de `[redacted]` görünüyor. Hata sınıfı yine ayırt edilebiliyor.

## 5. Açık sorular
- Sentry DSN'i açmak için patron onayı hâlâ açık (§19a "karar çelişkisi"). Bu kart yalnız DSN açılmadan önceki şartı kapatıyor.
- K-3b (`VERI-YERLESIMI.md` K6 satırındaki eski `analytics.ts:5,11` numaraları) bu kartın kapsamında değil ve dokunulmadı.

## 6. Sonraki adım
- crw-fb K-3a için yeniden incelemeli. Önerim, mutantı kendi başına tekrar koşması.
- DSN onayı gelirse `dpa-*.md` §7 ve `VERI-YERLESIMI.md` güncellenmeli (§19a'da yazılı).

## Platform beyanı
- **Doğrulandı: yalnız macOS** (Darwin 27.0.0, Node + vitest 4.1.11). Gerçek Prisma istemcisi kullanıldı, kapalı port `127.0.0.1:1`; yerel HTTP yakalama sunucusu kullanıldı.
- **Windows / Linux: koşulamadı**, bu makinede yoklar. Koddan değerlendirme: satırlara bölme `\r?\n` ile yapılıyor, yani Windows CRLF de ilk satırda kesiliyor. Windows'ta Prisma'nın alıntıladığı dosya yolu `C:\…` biçiminde olur ve ikinci satırdan sonra yer aldığı için yine atılır. Regex'ler ve `fetch` platformdan bağımsız.
