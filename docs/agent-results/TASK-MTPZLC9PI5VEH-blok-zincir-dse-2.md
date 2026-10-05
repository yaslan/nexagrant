# Takvim Senkronizasyonu — Rework Raporu (TASK-MTPZLC9PI5VEH-2)

**Ajan:** blok-zincir-dse (DSE-EN) · **Tarih:** 2026-09-08 · **Sprint:** S10 · **Tip:** bug/rework  
**Önceki Raporlar:** `docs/agent-results/TASK-MTPZLC9PI5VEH-blok-zincir-dse.md`, `docs/agent-results/TASK-MTQTZNLS2CO2L-blockzincir-pm.md`

---

## 1. Ne Yapıldı

Önceki raporda açık bırakılan 2 madde ("❌ Ön koşullar eksik: OAuth anahtarları, token şifreleme", "❌ DB migration reset") ele alındı:
- PM doğrulaması migration durumunu yıkıcı olmayan yöntemle çözmüştü (`npx prisma migrate status` → "up to date").
- Bu turda kalan gerçek açıklar (OWASP-A02 şifresiz token saklama ve mock sağlayıcıların açıkça işaretlenmesi) tamamen giderildi.

### Yapılan İyileştirmeler:
1. **Token Şifreleme Altyapısı (`src/lib/calendar/encryption.ts`):**
   - AES-256-GCM algoritması ile şifreleme ve deşifreleme fonksiyonları yazıldı (`encryptCalendarToken`, `decryptCalendarToken`).
   - Her şifrelemede 12-byte kriptografik rastgele IV (`crypto.randomBytes(12)`) ve 16-byte authentication tag üretilir.
   - Çıktı `fkenc1:<iv_hex>:<tag_hex>:<ciphertext_hex>` zarf formatındadır.
   - `CALENDAR_ENCRYPTION_KEY` env değişkeni (`src/lib/env.ts`, `.env`, `.env.example`) üzerinden 256-bit anahtar okunur (64 hex karakter, 32 byte utf-8/base64 ya da SHA-256 hash türetimi).
   - Anahtar eksikliğinde 503 (`CalendarEncryptionNotConfiguredError`, `CALENDAR_ENCRYPTION_NOT_CONFIGURED`) hatası fırlatılır (iyzico deseniyle tutarlı).

2. **Senkronizasyon Servisi Entegrasyonu (`src/lib/calendar/sync.ts`):**
   - **Yazma Yolu:** `saveCalendarConnectionTokens` fonksiyonu ile `accessToken` ve `refreshToken` veritabanına yazılmadan önce AES-256-GCM ile şifrelenir.
   - **Okuma Yolu:** `syncMeetingBriefToCalendar` ve `getDecryptedCalendarTokens` fonksiyonlarında veritabanından okunan token'lar çözülerek sağlayıcıya aktarılır. Anahtar eksikse veya şifre bozulmuşsa hata yakalanır ve `SystemAlert` olarak kaydedilir (CLAUDE.md kural 6 uyarınca akış kırılmaz).

3. **Prisma Gate Uyumu (`src/lib/db.ts` & `src/lib/calendar/token-envelope.ts`):**
   - Şifrelenen token'lar `fkenc1:` öneki taşıdığı için Prisma `$extends` sorgu gate'i (`withCalendarTokenGate`) tarafından doğrulanır; düz metin token yazma girişimleri veritabanına ulaşmadan engellenir.

4. **Mock Sağlayıcıların UI ve Log'da Açıkça İşaretlenmesi (CLAUDE.md Kural 7):**
   - UI (`src/app/[locale]/(app)/[workspace]/settings/calendar/client.tsx`): Google Calendar ve Microsoft Outlook kartlarında başlığın hemen yanında `[Mock / Dev Modu]` rozeti (`mockBadge` anahtarı, tr+en) eklendi.
   - Loglar (`src/lib/calendar/google.ts`, `src/lib/calendar/outlook.ts`, `src/lib/calendar/provider.ts`): Tüm işlem ve hata mesajlarına `[MOCK/DEV]` öneki ve log uyarıları eklendi.

5. **Dokümantasyon Güncellemeleri:**
   - `docs/DATA_MODEL.md` §8.2: Token sütunlarının AES-256-GCM ile şifrelendiği belgelendi.
   - `docs/ROADMAP.md` Açık Karar #12: Şifrelemenin uygulandığı ve test edildiği bilgisiyle güncellendi.

---

## 2. Kanıt

### 2.1 Prisma Migration Durumu — Up to Date
```
$ npx prisma migrate status
◇ injected env (46) from .env
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma/schema.prisma.
Datasource "db": PostgreSQL database "fabrika", schema "public" at "localhost:5432"

5 migrations found in prisma/migrations

Database schema is up to date!
```

### 2.2 Canlı PostgreSQL Veritabanı Şifreleme Kanıtı (`scripts/verify-calendar-encryption.ts`)
```
$ npx tsx scripts/verify-calendar-encryption.ts
--- 1. Writing encrypted tokens to CalendarConnection ---
Connection created: cmtssxnkw00009qxky73lv2dn
--- 2. Inspecting RAW values from PostgreSQL (SELECT raw columns) ---
Raw DB accessToken:  fkenc1:f43a2426ce8078ad1db71653:0d043d36ea9f7cc3b9491d6c47c5a3f8:30ccac20750f9afff3cb801bf6c439f520f8b6defca506ef479f40bdc63694dab42e2fb65b8f003712aa5f9e222ffe
Raw DB refreshToken: fkenc1:a02ceba77d10c8ea0597a8fc:8af403ffbc5d9bfb28e7ed6e774e5c6a:83ba7d86366b60158ee388e4a456988c8b696dcec140623322d6c77e25701dd3ebfb0fdb81dd3bf346bb54c378d4
Is accessToken cleartext in DB?  ✅ NO (ENCRYPTED)
Is refreshToken cleartext in DB? ✅ NO (ENCRYPTED)
--- 3. Testing Decryption Read Path ---
Decrypted accessToken matches original?  ✅ YES
Decrypted refreshToken matches original? ✅ YES
--- 4. Cleanup ---
Cleaned up probe row.
```

### 2.3 Canlı DB Testi (`tests/calendar-token-db.live.test.ts`)
```
$ npx vitest run tests/calendar-token-db.live.test.ts
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

### 2.4 Birim Testler (`src/lib/calendar/__tests__/`)
```
$ npx vitest run src/lib/calendar/__tests__/
 Test Files  4 passed (4)
      Tests  41 passed (41)
```

### 2.5 Tüm Test Paketi
```
$ pnpm test
 Test Files  113 passed | 2 skipped (115)
      Tests  1292 passed | 8 skipped (1300)
```

### 2.6 Tip Denetimi & Lint
```
$ pnpm typecheck
$ tsc --noEmit
(0 errors)

$ pnpm lint -- src/lib/calendar
(0 errors, 0 warnings)
```

---

## 3. Değişen Dosyalar

**Yeni Dosyalar:**
- `src/lib/calendar/encryption.ts` — AES-256-GCM token şifreleme, çözme ve anahtar çözümleme
- `src/lib/calendar/__tests__/encryption.test.ts` — 14 birim test (şifreleme, 503 hata durumu, kurcalama tespiti)
- `tests/calendar-token-db.live.test.ts` — Canlı PostgreSQL üzerinde şifreleme ve gate doğrulama testi
- `scripts/verify-calendar-encryption.ts` — Doğrudan DB çıktısı veren bağımsız doğrulama betiği

**Düzenlenen Dosyalar:**
- `src/lib/env.ts` — `CALENDAR_ENCRYPTION_KEY` şema tanımı
- `.env` & `.env.example` — `CALENDAR_ENCRYPTION_KEY` değişkeni
- `src/lib/calendar/errors.ts` — `CalendarEncryptionNotConfiguredError` (503) ve `CALENDAR_ENCRYPTION_NOT_CONFIGURED` kodu
- `src/lib/calendar/token-envelope.ts` — Şifreleme fonksiyonlarının dışa aktarımı
- `src/lib/calendar/sync.ts` — Okuma ve yazma yollarında şifreleme entegrasyonu (`saveCalendarConnectionTokens`, `getDecryptedCalendarTokens`)
- `src/lib/calendar/factory.ts` — Opsiyonlarda token kabulü
- `src/lib/calendar/google.ts` & `src/lib/calendar/outlook.ts` — `[MOCK/DEV]` log uyarıları
- `src/lib/calendar/provider.ts` — `[MOCK/DEV]` hata mesajı
- `src/app/[locale]/(app)/[workspace]/settings/calendar/client.tsx` — `[Mock / Dev Modu]` rozeti
- `messages/tr.json` & `messages/en.json` — `mockBadge` ve `CALENDAR_ENCRYPTION_NOT_CONFIGURED` çevirileri
- `docs/DATA_MODEL.md` — §8.2 takvim token şifreleme güncellemesi
- `docs/ROADMAP.md` — Karar #12 şifreleme tamamlanma notu

---

## 4. Definition of Done (Kontrol Listesi)

- [x] Token şifreleme uygulandı, kanıtlandı (AES-256-GCM, DB'de cleartext olmadığı kanıtlandı)
- [x] Mock sağlayıcılar açıkça "mock" olarak işaretli (log/UI'da `[MOCK/DEV]` ve rozet)
- [x] Migration/RLS durumu "up to date" olarak yeniden doğrulandı
- [x] Test + typecheck temiz (1292 test PASS, typecheck 0 hata, lint 0 hata)
- [x] dev'e commit + sonuç raporu (`docs/agent-results/TASK-MTPZLC9PI5VEH-blok-zincir-dse-2.md`)

---

**Rapor yazarı:** blok-zincir-dse (DSE-EN)  
**Tarih:** 2026-09-08
