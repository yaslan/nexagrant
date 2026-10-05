# TASK-MUMH6NZ128QZ1 — Uyarı işi sahte başarı (MVP ölçümü B-1) — be-fb

**Platform:** macOS (Darwin 27.0, Node 26.5, yerel Postgres `fabrika-postgres` :5433, Inngest dev sunucusu `inngest-cli@latest`).
Değişen kodda platforma bağlı bir yol yok: süreç, dosya yolu ya da kabuk kullanılmıyor. Yalnız Resend HTTP istemcisi ve Prisma var. Linux ve Windows koşulmadı. Koddan bakıldığında davranış aynı olur.

## 1) Ne yapıldı

**Kök neden:** Aynı sahte başarının iki yolu vardı.
1. `RESEND_API_KEY` yoksa `alerts-daily` gönderimi sessizce atlıyordu. Buna rağmen `emailsSent++` ve `touchLastRun` çalışıyordu. O pencerede bulunan eşleşmeler bir daha asla gönderilmiyordu. İşin `success` alanı da hep sabit `true` dönüyordu.
2. **Kartta olmayan, taramada bulunan ikinci yol:** `resend` v6, API hatasında (401/422/5xx) **fırlatmıyor**. `{ data: null, error }` ile resolve ediyor (`node_modules/resend/dist/index.mjs` `fetchRequest`). Yani anahtar olsa bile reddedilen bir e-posta "gönderildi" sayılıyor ve `lastRunAt` ilerliyordu.

**Düzeltme:**
- **Yeni modül `src/lib/email/resend-mailer.ts`:**
  - `Mailer` tipi.
  - `resendMailer()` anahtar yoksa `null` döner. Resend `{error}` döndürürse `MailSendError` fırlatır.
  - Hata mesajı yalnız `resend:<name>:<status>` biçiminde. Sağlayıcının kendi mesajı alıcı adresini içerebildiği için taşınmıyor; `SystemAlert` kiracı izolasyonsuz bir tablo.
- **`alerts-daily.ts`:**
  - `sendSavedSearchAlerts(rows, runTenant, mailer = resendMailer())`: gönderici enjekte ediliyor.
  - Gönderici yoksa `emailsFailed++` ve `reason: 'no_mail_provider'` yazılıyor, **`lastRunAt` ilerlemiyor**. Sonraki çalışan koşu aynı eşleşmeleri yeniden bulur.
  - Reddedilen gönderim catch bloğuna düşüyor. Bu durumda da `lastRunAt` ilerlemiyor.
  - Eşleşme 0 ise davranış eskisi gibi: skipped ve `lastRunAt` ilerliyor. Kaybolan bir eşleşme yok.
- **Yeni saf fonksiyon `alertsRunReport()`:**
  - Hata varsa `success: false` ve `reason` döner (`no_mail_provider` | `send_failed`).
  - Hata varsa bir `SystemAlert` açılır. Sağlayıcı yoksa seviye **`error`** (her sabah tekrarlanan bir kesinti), diğer hatalarda `warn`.
  - `AlertsDailyOutputSchema`'ya isteğe bağlı `reason` alanı eklendi.
- **Dev koşusunda bulunan yan hata:** Alarm meta'sındaki `emailsSent`/`emailsFailed` anahtarları, `recordAlert`'in PII redaksiyonu tarafından ("email" içerdikleri için) siliniyordu, yani sayılar alarma hiç ulaşmıyordu. Anahtarlar `sent`/`failed` olarak değiştirildi ve test eklendi.

**Diğer e-posta yollarının taranması:** `grep resend|emails.send` → 3 çağrı yeri.

| Yer | Durum | Yapılan |
|---|---|---|
| `alerts-daily.ts` | Sahte başarı (iki yol) | Düzeltildi |
| `feedback/digest-run.ts` `defaultSender` | `{error}` yok sayılıyor, reddedilen özet `'sent'` görünüyordu | `resendMailer()`'a bağlandı. `feedback-weekly-digest` artık `emailStatus==='failed'` olduğunda `success:false` döner. Anahtar yokken `'skipped'` + `no_resend_api_key` dönmesi belgelenmiş "en iyi çaba" kararı; açıkça raporlandığı için dokunulmadı |
| `actions/user/request-deletion.ts` `notifySubject` | En iyi çaba (belgelenmiş). Sayaç yalanı yok, ama `{error}` hiç loglanmıyordu | `console.warn(error.name)` eklendi. Adres loglanmıyor |
| `m4-weekly-summary.ts`, `agency-monthly-report.ts` ve diğer işler | E-posta göndermiyor (m4'te `TODO`) | Yok |

## 2) Kanıt

**Birim ve RLS'li canlı testler** (`fabrika_app` NOBYPASSRLS rolü):
```
npx vitest run src/lib/email src/lib/inngest/jobs tests/feedback-digest-run.test.ts tests/inngest-jobs.test.ts tests/inngest.test.ts
 Test Files  7 passed (7)
      Tests  47 passed (47)
```
Yeni senaryolar:
- `cron-tenant-scope.test.ts`: "with no mail provider, nothing is counted sent and lastRunAt stays put" ve "a send the provider refuses fails that search and keeps its matches".
- `resend-mailer.test.ts`: 3 test.
- `alerts-daily.test.ts`: run report, 3 test.

Mevcut iki canlı test, hatanın kendisini varsayıyordu ("No RESEND_API_KEY under vitest, so the send is a no-op"). Artık kayıt tutan sahte bir gönderici veriliyor ve her sahibe tam bir kez e-posta gittiği doğrulanıyor.

**Mutasyon koşuları.** Düzeltme tek tek geri alındı, her seferinde ilgili test kırmızıya döndü, sonra dosya geri yüklendi:
```
M1 sağlayıcı yok bloğu silindi (eski davranış) → FAIL "with no mail provider, nothing is counted sent and lastRunAt stays put"
M2 resendMailer {error} yok sayar            → FAIL "throws when Resend resolves with an error instead of throwing"
M3 success sabit true                         → FAIL 2 run-report testi
M4 hata sonrası da touchLastRun               → FAIL "a send the provider refuses fails that search and keeps its matches"
M5 meta anahtarı tekrar emailsSent            → FAIL "no mail provider fails the run with its reason and an error-level alert"
```

**Inngest dev, gerçek fonksiyon ve gerçek yerel DB:**
- Kurulum: `inngest-cli dev -u http://localhost:3288/api/inngest` ile `inngest/node` `serve` gerçek `alertsDaily` nesnesini sundu. `.env`'de `RESEND_API_KEY` boş.
- Fonksiyon kaydı: `fabrika-app-alerts-daily`.
- Geçici bir kanıt araması eklendi: `befb-mumh6-proof`, `lastRunAt=2000-01-01`. Yerelde bundan sonra çekilmiş 1301 Topic olduğu için eşleşme > 0.
- Tetikleme: `invokeFunction`. Koşu `01M3P9DG7ZTZXBSQHFGV5FQ146`, `COMPLETED`. Adımlar: `fetch-saved-searches` → `send-alerts` → `record-failure-alert`.

Koşu çıktısı:
```
{"success":false,"totalSearches":3,"emailsSent":0,"emailsFailed":1,"emailsSkipped":2,
 "reason":"no_mail_provider","errors":[{"searchId":"befb-mumh6-proof","reason":"no_mail_provider"}]}
```
DB, koşudan sonra:
```
befb-mumh6-proof|2000-01-01 00:00:00        ← lastRunAt İLERLEMEDİ (eşleşmeler korunuyor)
cmumaqln2002bndxk7eginpmm|2026-09-29 09:54:58.222   ← 0 eşleşme → skipped, ilerledi (doğru)
SystemAlert: error | No mail provider (RESEND_API_KEY unset): 1 of 3 saved-search alerts not sent
             | {"sent": 0, "failed": 1, "failures": [{"reason": "no_mail_provider", "searchId": "befb-mumh6-proof"}]}
```
- Koşu 3 kez yapıldı. İlk ikisi `sent`/`failed` düzeltmesinden önceydi ve orada `redactedKeys:["emailsFailed","emailsSent"]` görüldü; M5 bulgusu buradan çıktı. Kanıt aramasının `lastRunAt` değeri üç koşunun hepsinde 2000'de kaldı, yani iş tekrar koşunca da güvenli.
- Temizlik: `befb-mumh6-proof` silindi (`DELETE 1`). Kendi `serve` ve `inngest-cli` süreçlerim durduruldu. 3000'deki komşu `next dev`'e dokunulmadı.

**Tam kapı:**
```
npx vitest run → Test Files 209 passed | 2 skipped (211) · Tests 2402 passed | 8 skipped
npx tsc --noEmit → temiz · eslint (değişen dosyalar) → temiz
```

## 3) Değişen dosyalar
- `src/lib/email/resend-mailer.ts` (yeni)
- `src/lib/email/__tests__/resend-mailer.test.ts` (yeni)
- `src/lib/inngest/jobs/alerts-daily.ts`
- `src/lib/inngest/events.ts` (`AlertsDailyOutputSchema.reason`)
- `src/lib/inngest/jobs/__tests__/alerts-daily.test.ts`
- `src/lib/inngest/jobs/__tests__/cron-tenant-scope.test.ts`
- `src/lib/feedback/digest-run.ts`
- `src/lib/inngest/jobs/feedback-weekly-digest.ts`
- `src/actions/user/request-deletion.ts`

Migration yok, şema değişmedi.

## 4) Riskler
- **En az bir kez teslim:** E-posta gider ama hemen ardından `touchLastRun` yazımı başarısız olursa arama `failed` sayılır ve ertesi gün aynı eşleşmeler yeniden gönderilir. Kaybetmek yerine çift göndermek bilinçli bir seçim.
- **Birikme:** Anahtar uzun süre boş kalırsa eşleşmeler birikir. Anahtar gelince ilk e-posta "N yeni" olarak toplu gider; doğru davranış bu. `error` alarmı her sabah bir kez yazılır: `recordAlert` aynı mesajı katlar, ama sayı değiştikçe yeni satır açılır. 488313b1 ile gelen Sentry iletimi de (`SENTRY_DSN` varsa) `error` seviyesindeki satırları Sentry'ye gönderecek.
- **Yerel DB'de kalanlar:** Dev koşularından `source='alerts-daily'` 3 `SystemAlert` satırı kaldı. Hepsi doğru (anahtar gerçekten yok), silinmedi.
- **Kapsam dışı, not:** E-posta HTML'inde `${name}` (kullanıcının arama adı) kaçışsız basılıyor. Kullanıcı kendi kiracı sahibine HTML enjekte edebilir. Düşük risk, ayrı kart önerilir.

## 5) Açık sorular
- Panonun kart açıklamasını okuyamadım: `list_tasks` açıklama döndürmüyor. Spec olarak görev metni ve `TASK-MULQMFVLJYZ5V-se-fb.md` B-1 önerisi esas alındı. Kartta ek bir madde varsa bildirin.
- `feedback-weekly-digest` anahtar yokken `success:true` + `emailStatus:'skipped'` dönmeye devam ediyor (belgelenmiş karar). Pilotta bu da `false` olsun mu?

## 6) Sonraki adım
- Patron: `RESEND_API_KEY` (TASK-MULQM3LFB4KRA). Anahtar gelince MVP madde 1c (24 saatte e-posta) yeniden ölçülmeli.
- Push yok (1 Ekim kuralı). Commit yalnız `dev` dalında, yerelde.
