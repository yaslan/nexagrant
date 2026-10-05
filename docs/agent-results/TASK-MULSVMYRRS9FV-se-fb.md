# TASK-MULSVMYRRS9FV — Takvim şifreleme testleri ortamdan bağımsız (se-fb)

## 1. Ne yapıldı

**Kök neden.** `src/lib/calendar/encryption.ts:18` anahtarı şu sırayla arıyor: `rawKey ?? env.CALENDAR_ENCRYPTION_KEY ?? process.env.CALENDAR_ENCRYPTION_KEY`. `env` (`src/lib/env.ts:189-200`), `process.env` import anında bir kez zod ile ayrıştırılarak oluşturuluyor. `.env` yüklüyken gerçek anahtar bu dondurulmuş nesneye giriyor ve testlerin `process.env` üzerinde yaptığı `delete` ya da atama hiçbir etki yapmıyor:

- `encryption.test.ts` › "reports whether calendar encryption key is configured": `delete process.env...` sonrasında `false` beklenirken `env` içindeki gerçek anahtar yüzünden `true` dönüyordu.
- `sync.test.ts` › `getDecryptedCalendarTokens…` ve `syncMeetingBriefToCalendar decrypts…`: token test anahtarıyla şifreleniyor, çözme işlemi ise `.env` içindeki gerçek anahtarla yapılıyordu. Kimlik doğrulama etiketi tutmadığı için hata oluşuyordu.

**Düzeltme (yalnız testler, üretim koduna dokunulmadı):**

- İki dosyada `vi.mock('@/lib/env', …)` eklendi. Gerçek modül korunuyor, yalnız `env.CALENDAR_ENCRYPTION_KEY` `undefined` yapılıyor. Böylece anahtarın tek kaynağı `process.env` oluyor ve bu değeri testler yönetiyor.
- `encryption.test.ts`: her testin `beforeEach` adımında `vi.stubEnv('CALENDAR_ENCRYPTION_KEY', undefined)`, `afterEach` adımında `vi.unstubAllEnvs()` çalışıyor. Elle yazılmış `orig`/`try-finally`/`delete` blokları yerine `vi.stubEnv` kullanılıyor.
- `sync.test.ts` › "token encryption read & write paths": `beforeEach` içinde `vi.stubEnv('CALENDAR_ENCRYPTION_KEY', testKey)`, `afterEach` içinde `vi.unstubAllEnvs()` çalışıyor. Geri alınmayan 3 adet `process.env.… = testKey` ataması kaldırıldı (bunlar daha önce aynı işçideki sonraki testlere sızıyordu).

## 2. Kanıt

Sır değeri basılmadı. Yalnız anahtarın "tanımlı mı" bilgisi yazdırıldı.

`set -a; source .env` 58. satırdaki `EMAIL_FROM=Fabrika <no-repl…>` yüzünden bozuluyor (`.env:58: parse error near '\n'`). Bu yüzden B koşusunda yalnız o satır dışarıda bırakılarak yüklendi. C koşusu ise `.env` dosyasının tamamını `node --env-file` ile yükledi.

**Düzeltmeden önce (HEAD, .env yüklü):**

```
       × reports whether calendar encryption key is configured
       × getDecryptedCalendarTokens decrypts encrypted tokens correctly
       × syncMeetingBriefToCalendar decrypts encrypted connection tokens on read
      Tests  3 failed | 23 passed (26)
```

**Düzeltmeden sonra:**

```
=== A: .env YOK
CALENDAR_ENCRYPTION_KEY tanımlı mı: hayır
 Test Files  2 passed (2)
      Tests  26 passed (26)
=== B: .env YÜKLÜ (set -a; source; EMAIL_FROM satırı hariç)
CALENDAR_ENCRYPTION_KEY tanımlı mı: evet
 Test Files  2 passed (2)
      Tests  26 passed (26)
=== C: node --env-file=.env (EMAIL_FROM dahil tam .env)
 Test Files  2 passed (2)
      Tests  26 passed (26)
```

**Negatif kontrol** (yalnız `vi.mock('@/lib/env')` blokları çıkarıldı, .env yüklü). Düzeltmeyi taşıyan kısmın bu mock olduğunu gösteriyor. Ardından dosyalar geri yüklendi:

```
       × reports whether calendar encryption key is configured
       × getDecryptedCalendarTokens decrypts encrypted tokens correctly
       × syncMeetingBriefToCalendar decrypts encrypted connection tokens on read
      Tests  3 failed | 23 passed (26)
```

**Takvim klasörünün tamamı** (`src/lib/calendar`), .env yüklü ve yüklü değilken:

```
 Test Files  5 passed (5)
      Tests  55 passed (55)
```

`npx tsc --noEmit -p .` hata vermedi. `npx eslint <iki test dosyası>` rc=0.

## 3. Değişen dosyalar

- `src/lib/calendar/__tests__/encryption.test.ts`
- `src/lib/calendar/__tests__/sync.test.ts`
- `docs/agent-results/TASK-MULSVMYRRS9FV-se-fb.md`

## 4. Riskler

- `vi.mock('@/lib/env')` dosya kapsamında çalışır ve yalnız bu iki test dosyasını etkiler. `env` nesnesinin geri kalanı gerçek modülden geliyor.
- Prettier: iki test dosyası HEAD'de de prettier-uyumsuz. Repoda `.prettierrc` yok, bu yüzden varsayılan çift tırnak stili tüm dosyayı yeniden yazıyor. Diff'i gürültüye boğmamak için `prettier --write` yalnız bu rapora uygulandı.

## 5. Açık sorular

- `resolveEncryptionKey` içindeki `env.X ?? process.env.X` sırası, çalışma anında `process.env` değişikliğinin görülmemesine yol açıyor. Üretimde bu bir sorun değil, çünkü anahtar süreç başında sabit. Kapsam dışı olduğu için dokunulmadı.

## 6. Sonraki adım

- `.env:58` `EMAIL_FROM` değeri tırnağa alınırsa `source .env` çalışır. Bu, devop-fb'nin `.env` / `.env.example` işine ait bir not.

**Platform beyanı:** mac (Darwin 27, arm64, node v26.5.0, vitest 4.1.11) üzerinde doğrulandı. Değişiklik yalnız vitest'in ortam değişkeni stub/mock API'sini kullanıyor. Dosya yolu, kabuk ya da süreç kullanımı yok, dolayısıyla Windows ve Linux'ta aynı davranması beklenir. Bu platformlarda koşulmadı, çünkü bu makinede yalnız macOS var. `source` kullanan doğrulama komutu yalnız POSIX kabuğa özgüdür, testlere ait değildir.
