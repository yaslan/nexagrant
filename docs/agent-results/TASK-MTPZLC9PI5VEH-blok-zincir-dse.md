# Takvim Senkronizasyonu — Rapor (TASK-MTPZLC9PI5VEH)

**Ajan:** blok-zincir-dse (DSE-EN) · **Tarih:** 2026-09-07 · **Sprint:** S10

## Ne Yapıldı

Fabrika M9 modülü için takvim senkronizasyonu altyapısı kuruldu:

1. **CalendarProvider sözleşmesi** (`src/lib/calendar/provider.ts`)
   - `connect()`, `disconnect()`, `createEvent()`, `updateEvent()`, `deleteEvent()` arayüzü
   - Sağlayıcı türleri: `google | outlook | ics`

2. **Üç sağlayıcı uygulaması:**
   - **IcsProvider** — mevcut `generateIcsContent()` fonksiyonunu wrap eder; Google/Outlook yedeği olarak çalışır
   - **GoogleCalendarProvider** — Google Calendar API için mock (OAuth anahtarları env'de olmadığı için)
   - **OutlookCalendarProvider** — Microsoft Graph API için mock (OAuth anahtarları env'de olmadığı için)

3. **Senkronizasyon servisi** (`src/lib/calendar/sync.ts`)
   - `syncMeetingBriefToCalendar(tx, tenantId, userId, brief)` 
   - Kiracı kullanıcısının tüm etkin `CalendarConnection`'larına brief event'ini kopyalar
   - Sağlayıcı hatası → `SystemAlert` üretir (iş kırılmaz)

4. **M9 Actions güncelleme**
   - `generateMeetingBrief()` sırasında `meetingScheduledAt` varsa senkron çağrısı yapılır
   - Non-blocking: senkron hatasında log var ama brief yine de kaydedilir

5. **Veritabanı entegrasyonu**
   - `CalendarConnection` tablosu (migration: `add-calendar-connections/migration.sql`)
   - Yapı: `tenantId`, `userId`, `provider` (unique), `externalId`, `accessToken`, `refreshToken`, `tokenExpiresAt`, `isConnected`, `lastSyncAt`
   - RLS politikası: `tenant_isolation` (tenantId kontrol)
   - Token şifreleme TODO: env'de `CALENDAR_ENCRYPTION_KEY` olmadığı için production ready değil

6. **Birim testler**
   - `src/lib/calendar/__tests__/provider.test.ts` — ICS, Google, Outlook sağlayıcıları
   - `src/lib/calendar/__tests__/sync.test.ts` — senkronizasyon mantığı, hata yolu, SystemAlert üretimi
   - Tüm testler PASS (454 passed, 8 skipped)

7. **Kod kalitesi**
   - TypeScript strict: typecheck temiz
   - ESLint: linting uyumlı (3 no-op parametre uyarısı intentional)
   - Tüm dosyalar `src/lib/calendar/` altında organize

8. **Dokümantasyon**
   - `docs/DATA_MODEL.md` § 8.2'ye CalendarConnection tanımı ve mimarisi eklendi

## Kanıt

### Test Sonuçları
```
Test Files  51 passed | 2 skipped (53)
Tests       454 passed | 8 skipped (462)
```

### TypeCheck Sonucu
```
$ pnpm typecheck
$ tsc --noEmit
# Çıktı: Temiz (hata yok)
```

### Lint Sonucu
```
$ pnpm lint -- src/lib/calendar
✖ 3 problems (0 errors, 3 warnings)
# Uyarılar: ICS sağlayıcısındaki intentional no-op parametreler (_externalId, _event)
```

### Commit Geçmişi
```
6866353 feat(m9): calendar provider framework and sync infrastructure
dadedac fix: typecheck & linting for calendar infrastructure
```

## Değişen Dosyalar

**Yeni dosyalar:**
- `src/lib/calendar/provider.ts` — sözleşme ve tip tanımları
- `src/lib/calendar/ics.ts` — ICS sağlayıcısı
- `src/lib/calendar/google.ts` — Google Calendar mock
- `src/lib/calendar/outlook.ts` — Outlook Calendar mock
- `src/lib/calendar/factory.ts` — sağlayıcı factory
- `src/lib/calendar/sync.ts` — senkronizasyon servisi
- `src/lib/calendar/__tests__/provider.test.ts` — sağlayıcı testleri (163 satır)
- `src/lib/calendar/__tests__/sync.test.ts` — senkronizasyon testleri (161 satır)
- `prisma/migrations/add-calendar-connections/migration.sql` — tablo ve RLS
- `prisma/migrations/add-m9-meeting-schedule/migration.sql` — MeetingBrief CREATE TABLE (tamamlanmış)

**Düzenlenen dosyalar:**
- `prisma/schema.prisma` — `CalendarConnection` modeli eklendi
- `prisma/rls.sql` — `CalendarConnection` için RLS politikası
- `src/modules/m9/server/actions.ts` — `syncMeetingBriefToCalendar` çağrısı eklendi
- `src/lib/db.ts` — `TenantTx` tip export eklendi
- `docs/DATA_MODEL.md` — § 8.2 takvim entegrasyonu belgelendi

## Riskler

### 1. **Ön Koşul Eksiklikleri (BLOCKER FOR PRODUCTION)**
- **OAuth anahtarları env'de YOK**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET`
  - **Etki**: Google ve Outlook sağlayıcıları mock (log çıktısı only)
  - **Çözüm**: Entegrasyon kurmadan önce AWS Secrets Manager'a anahtarlar eklenmeli, env şeması güncellenmeli
  - **Kimin**: Platform operasyonu veya güvenlik takımı

### 2. **Token Şifreleme TODO**
- Migration yalnız cleartext token saklar; production'da `CALENDAR_ENCRYPTION_KEY` env'i ve AES-256-GCM şifrelemesi gerekli
  - **Etki**: Token'lar veritabanında açık metin (OWASP-A02 eksiktir)
  - **Çözüm**: `src/lib/calendar/sync.ts` ve `CalendarConnection` write path'ine şifreleme ekle
  - **Kimin**: Security sprint'inde

### 3. **Events Sistemi Kurulu Değil**
- CLAUDE.md "src/core/events" veri yolundan bahsediyor ama klasör yok
- **Etki**: Senkronizasyon doğrudan `syncMeetingBriefToCalendar()` çağrısı yapıyor; modüller arası mesajlaşma yok
- **Çözüm**: `src/core/events` veri yolu oluştur ve M9, diğer modülleri bağla (ayrı sprint)
- **Kimin**: Core takımı

### 4. **DB Migration Reset Blocked**
- Prisma Migrate, AI agent olduğu için reset'i reddediyor (güvenlik protokolü)
- **Etki**: Şu anki dev ortamında migration'lar apply edilemedi; drift detected
- **Çözüm**: Kullanıcı manuel olarak şunu çalıştırmalı:
  ```bash
  PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="I understand this will destroy the dev database" pnpm prisma migrate reset --force
  ```
- **Kimin**: Geliştirici (local ortamda)

## Açık Sorular

1. **Token şifresi**: `CALENDAR_ENCRYPTION_KEY` ne olacak? Rotasyonu? Backup?
2. **OAuth flow**: Takvim bağlama UI'ı nerede? M9 ayarları? Ayrı rota?
3. **Calendar provider cascading**: Bir kullanıcı birden fazla calendara sahip olabilir mi (ör. kişisel + takım)?
4. **ICS fallback**: Google/Outlook başarısız olursa otomatik ICS'ye dönmelidim?

## Sonraki Adım

1. **Immediate**: Kullanıcı local `pnpm prisma migrate reset --force` çalıştırıp DB'yi reset etmeli
2. **Short-term** (1-2 gün):
   - OAuth anahtarlarını env'e ekle (AWS Secrets)
   - Token şifrelemesi implement et
   - UI: takvim bağlama flow (M9 settings)
   - E2E test: gerçek OAuth (veya test fixture)
3. **Medium-term** (1 hafta):
   - Events veri yolu kurulup M9 senkron event'i register et
   - Outlook & Google API hata handling (rate limiting, invalid tokens)
4. **Long-term**:
   - Calendar conflict detection
   - Recurring event support

## Definition of Done (Kontrol Listesi)

- [x] CalendarProvider sözleşmesi + google/outlook uygulamaları
- [x] Token tablosu: migration + RLS + DATA_MODEL.md
- [x] Senkronizasyon servisi (direct call — events sistemi TODO)
- [x] Hata yolunda SystemAlert, iş kırılmıyor
- [x] Biunit testler yeşil + typecheck/lint temiz
- [x] dev'e commit (2 commit: feat + fix)
- [x] Sonuç raporu yazıldı
- [ ] ❌ Ön koşullar eksik: OAuth anahtarları, token şifreleme, events sistemi
- [ ] ❌ DB migration reset — kullanıcı onayı gerekli

---

**Rapor yazarı:** DSE-EN (Ürün Tasarımcısı)  
**İnceleme:** Lider DSE-Lead onayladığında
