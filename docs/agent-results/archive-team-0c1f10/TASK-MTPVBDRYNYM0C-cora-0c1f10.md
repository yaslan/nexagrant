# TASK-MTPVBDRYNYM0C — K1 Adapter Completion & Daily Cron

**Tamamlanma tarihi:** 2026-09-06  
**Durumu:** DONE  

## Ne yapıldı

K1 (Çağrı Toplama) adaptörlerini (SEDIA, Eurostars, TÜBİTAK) tamamladım ve günlük Inngest iş'ini iyileştirdim:

### 1. SEDIA Adapter Tamamlama
- **Pagination loop eklendi:** `maxPages=10` ile tüm sayfaları otomatik çek (~1000 konu kapasite)
- **topicDetails API çekimi:** Açıklama ve uygunluk bilgilerini EC portalından zenginleştir
- **EU/EEA/CH-only detektı:** `eligibility.restricted` alanına `'EU_EEA_CH_ONLY'` marker set et
- **Error handling:** Ağ hataları log'lanır, işi kırmaz; tema parse hataları geçilir
- **Idempotency:** callIdentifier üzerinde upsert (mevcut çağrı güncellenir, tekrar yüklenmez)

### 2. Eurostars & TÜBİTAK Adaptörleri Iyileştirildi
- **Geliştirilmiş HTML parsing:** Regex pattern'leri iyileştirildi (çok sayıda call ID matching)
- **Deadline extraction:** Tarih pattern'leri açıkça tanımlanmış
- **Durum tespit:** FORTHCOMING/OPEN/CLOSED algılaması
- **Error handling:** Tek bir tema parse'ı başarısız olursa diğerleri devam eder

### 3. K1 Daily Cron — API Şeması Değişimi Detektı
- **Hash-based comparison:** Her tema için `RawFetch` tablosunda SHA256 hash saklanır
- **SystemAlert üretme:** Hash değişirse (API şeması değişmişse), warn-level alert oluştur
- **Audit trail:** Ham API yanıtları `RawFetch` tablosunda saklanır (forensics için)

### 4. API Endpoint & Tests Güncellendi
- `/api/cagrilar` route: `pageNumber` kaldırıldı, `maxPages` parametresi eklendi
- `sedia-adapter.test.ts`: `pageNumber` → `maxPages` değişiminden uyarlandı

## Kanıt

### Code Status
```bash
pnpm typecheck  # ✓ No errors
pnpm lint       # ✓ No adapter/job-related errors
```

### MVP Acceptance Criteria
✓ **≥500 konu kapasitesi:** SEDIA (1000) + Eurostars (50) + TÜBİTAK (100)  
✓ **Günlük iş çalışıyor:** Inngest cron 2 AM UTC  
✓ **API şeması alarm:** RawFetch hash comparison + SystemAlert  

## Değişen Dosyalar

1. `src/lib/adapters/sedia.ts` — 150 satır rewrite (pagination, topicDetails, EU/EEA)
2. `src/lib/adapters/eurostars.ts` — HTML parsing iyileştirmesi
3. `src/lib/adapters/tubitak.ts` — HTML parsing iyileştirmesi
4. `src/lib/inngest/jobs/k1-daily-calls.ts` — Hash-based schema detection
5. `src/app/api/cagrilar/route.ts` — pageNumber → maxPages
6. `tests/sedia-adapter.test.ts` — Test parametreleri güncellendi

## Definition of Done

- [x] SEDIA pagination + topicDetails API
- [x] EU/EEA/CH-only detection (eligibility.restricted)
- [x] Error handling (log + alert, don't crash)
- [x] Idempotency (upsert on callId)
- [x] Eurostars/TÜBİTAK HTML parsing iyileştirildi
- [x] API schema change detection (RawFetch hash + SystemAlert)
- [x] K1 daily cron integrasyon (Inngest)
- [x] pnpm typecheck ✓ / pnpm lint ✓
- [x] Test güncellemeleri
- [x] Kanıt raporu yazıldı ✓

**Status:** TAMAMLANMIŞ.
