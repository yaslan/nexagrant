---
gorev: TASK-MUPE28811TI1L
sprint: FB-GAP-1
ajan: crw-fb
tip: test doğrulama (seçenek b implementasyonu)
hüküm: KISMÎ — Ö-1/Ö-2 kod tamamlandı; test ortamı setup'ı Prisma safety guardrails'e çarptı
platform: mac (darwin 27.0.0, arm64); Linux/Windows koşulamadı
---

# TASK-MUPE28811TI1L — T-5/T-7 testi sabitleme, seçenek (b) implementasyonu

## 1. Ne yapıldı

Önceki rapor (TASK-MUPBOWH1ULQ5X-crw2-fb-2.md) M3a/M3b mutantlarında T-5 final-HEAD testinin yeşil kaldığını göstermiş. Bu rapor seçenek (b) kodunu yazan karta göre implemente etti:

1. **Ö-1 (T-5 final HEAD testi):** Seçenek (b) implementasyonu
   - Y-3 "late lock" kalıbını uyguladım: `state.dbPause = { afterLock: 25_000 }` + `state.dbSleep = 4.5`
   - Böylece timeLeft ≈ 40s - 25s - 4.5s ≈ 10.5s (EVIDENCE_COPY_DEADLINE_MS = 15s'den belirgin altı)
   - Test assertion'ını değiştirdim: `took < expectedTimeLeft + 2_500` (10.5s + 2.5s = 13s)
   - Bu assertion, M3a'da (min() kaldırılınca) test kıracak

2. **Ö-2 (T-7 testi yorum):** Düzeltme
   - Yorum "HEAD has no timeout and hangs" → "HEAD is not cancelled when the deadline passes"
   - Neden: hook 4 s tutup bırakıyor, infinite değil; yorum gerçeği anlatmalı

3. **Test ortamı setup:**
   - MinIO 2025-10-15 kuruldu (brew)
   - PostgreSQL 16 kuruldu + DB oluşturuldu (port 55491)
   - Prisma migrate deploy koşmaya çalışıldı → **Migration dependency sorunu**

## 2. Kod değişiklikleri (diff)

```diff
test('T-5 (final key HEAD): a confirm whose store holds...
+    // Fix for TASK-MUPE28811TI1L Ö-1: use Y-3 "late lock" pattern...
     const up = await uploaded('t5-final-head');
+    state.dbPause = { afterLock: 25_000 };
+    state.dbSleep = 4.5;
     ...
     await expectNothingLost(up, res, 'storage_unavailable');
-    expect(took, `answered after ${took} ms`).toBeLessThan(storage.EVIDENCE_COPY_DEADLINE_MS + 2_000);
+    const expectedTimeLeft = 40_000 - 25_000 - 4_500; // ~10.5s
+    expect(took, `answered after ${took} ms; timeLeft ~${expectedTimeLeft}ms`).toBeLessThan(expectedTimeLeft + 2_500);

test('T-7: a store that holds...
     // Q4 mutant test: the final key HEAD command must have timeout opts.
-    // HEAD has no timeout and hangs.
+    // HEAD is not cancelled when the deadline passes.
```

## 3. Kanıt

### 3.1 Test dosyası diff (git diff)

```bash
$ cd /private/tmp/claude-501/-Users-macbook-alan/crw-fb-t5-wt && git diff tests/evidence-confirm-store-faults.live.test.ts
```

(Yukarıda gösterilen diff — 2 test düzeltildi)

### 3.2 Seçenek (b) mantığı kontrolü

1. **timeLeft hesaplaması:**
   - confirm'in transaction limit: 40s
   - afterLock pause: 25s (lock aldıktan sonra)
   - dbSleep (pg_sleep): 4.5s
   - Remaining: 40 - 25 - 4.5 = 10.5s ← copyIncomingObject'e geçen timeLeft

2. **M3a mutant'ında test kırılacak:**
   - M3a: `AbortSignal.timeout(EVIDENCE_COPY_DEADLINE_MS)` (min() kaldırıldı)
   - Test, 13s limit'e göre çalışacak (10.5 + 2.5)
   - M3a altında copy 15s limit alır (EVIDENCE_COPY_DEADLINE_MS)
   - Yani `took > 13s` üreteceğini bekliyoruz (test fail) — **geçerli mutant yakalanması**

3. **Baseline'da test yeşil kalacak:**
   - Baseline'da min() yerinde: `AbortSignal.timeout(min(10.5s, 15s)) = 10.5s`
   - Copy timeout: ~10.5s + marj = ~13s
   - Test: `took < 13s` ✓ geçer

## 4. Değişen dosyalar

- `tests/evidence-confirm-store-faults.live.test.ts` (2 test düzeltildi)
- Başka: hiçbir üretim kodu değiştirilmedi ✓

## 5. Riskler

1. **Test ortamı tamamlanmadı:** PostgreSQL migration'lar Prisma safety check'e takılmış
   - Hata: `Prisma Migrate detected that it was invoked by Claude Code`
   - Sebep: `prisma migrate reset --force` AI agent için forbidden (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` env gerekli)

2. **M3a/M3b mutantları test koşulamadı:** Setup sorunu yüzünden

## 6. Sonraki adımlar

1. **Test ortamı tamamlanması:** PostgreSQL migration'lar explicit consent ile çalıştırılmalı
2. **Baseline koşusu:** Seçenek (b) kodu ile tam test dosyası yeşil olmalı
3. **M3a/M3b koşusu:** Mutantlar uygulanıp T-5 testinin kırdığı doğrulanmalı
4. **Commit:** Doğrulandıktan sonra `crw-fb/t5-timeleft` dalına commit ve push

## 7. Kalıcı hafıza

Bu görevden yeni bilgi: Prisma `migrate reset --force` AI agent'a yasak — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` env var gerekli. Gelecek görevlerde Prisma setup'ında bu biline.
