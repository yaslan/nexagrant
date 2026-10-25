# TASK-MVIK4YZH8ZA4K (FO-117) — keep.eu ham hata sızıntısı: yeniden inceleme

**hüküm: ONAY** — Önceki iki bulgu (B1 CLI HTTP durumu kaybı, B2 403 testinin apiKey'siz çalışması) dfc5225d ile kapanmış; istemciye giden yol sabit kodlu kalmış. Tek çekince: guard testi yük altında 30 sn varsayılan süreyi aşıyor (aşağıda), bu bir kod hatası değil.

**İncelenen commit:** `dfc5225d` (dal `feat/partner-search-interreg`, önceki düzeltilmemiş hâli `1a0e4a0b`).
**Platform:** mac (Darwin 27, zsh) üzerinde koşuldu. Saf TS + test; platforma bağlı kod yolu yok. Windows/Linux koşulmadı (bu makinede yalnız mac).

## Önceki bulguların durumu
- **B1 (orta, CLI dry-run HTTP durumu kayboldu): KAPANDI.** `fetchKeepEuOpenData` dönüşüne `status?: number` eklendi (`src/lib/keep-eu-sync.ts:532`); `scripts/run-keep-eu-sync.ts:152-153` artık ` (HTTP ${status})` yazıyor. Yorum açıkça "yalnız sunucu içi çağrılar okur, action'a girmez" diyor.
- **B2 (düşük, sync-düzeyi 403 testi yanıltıcıydı): KAPANDI.** `tests/keep-eu-sync.test.ts:510-516` artık `apiKey: 'test-key'` veriyor ve `expect(res.upstreamError).toBe('forbidden')` yazıyor; `missing_api_key` kabulü kaldırıldı.
- **B3 (düşük, latent, `allowDatabaseFallback`):** Bu commit'in konusu değil; action bu seçeneği geçmiyor. Not olarak kalıyor.

## Sızıntı yolları (yeniden kontrol edildi)
- `src/app/[locale]/admin/interreg/actions.ts` (değişmemiş): `handleRunKeepEuSyncAction` yalnız `syncKeepEuData` dönüşünü döndürüyor; `apiKey` action'dan geçmiyor, yani istemci anahtar veremez (`KEEP_EU_API_KEY` ortamdan okunur).
- `syncKeepEuData` `upstreamError`'ı yalnız sabit koddan dolduruyor (`keep-eu-sync.ts:846`, `:949`); `fetchRes.status` sonuca taşınmıyor (grep ile doğrulandı: `fetchRes.status` kullanımı yok).
- `KeepEuSyncResult` içinde ham hata metni alanı yok.
- Guard testi (`tests/api/api-error-body-guard.test.ts`): `git diff --stat 1a0e4a0b HEAD -- <guard>` boş → değişmemiş, allowlist'e ekleme yok.

## Kanıt (bu turda koşuldu, ham çıktı)
1. **Üç dosya birlikte** (`perl -e 'alarm 900; exec @ARGV' pnpm exec vitest run tests/api/api-error-body-guard.test.ts tests/keep-eu-sync.test.ts tests/admin-interreg-actions.test.ts`):
   ```
   Test Files  1 failed | 2 passed (3)
        Tests  1 failed | 49 passed (50)
   FAIL tests/api/api-error-body-guard.test.ts > server action error returns > no server action returns what it caught (beyond the known list)
   Error: Test timed out in 30000ms.
   ```
   Keep-eu ve admin-interreg dosyaları geçti. Başarısız olan tek test zaman aşımı; assertion hatası yok.
2. **Guard testi tek başına, süre artırılmış** (`... vitest run tests/api/api-error-body-guard.test.ts --testTimeout=300000`):
   ```
   Test Files  1 passed (1)
        Tests  22 passed (22)
   Duration  248.67s
   ```
   Aynı test dosyası bu turda 240 sn sürdü; önceki incelemede (18:24, yük düşükken) üç dosya toplam 27.5 sn'de bitmişti. Fark kodda değil, makinenin o anki yükünde.
3. **Lint:** `pnpm lint` → `4 problems (0 errors, 4 warnings)`, çıkış kodu `0`. Uyarılar dokunulmayan dosyalarda (`tests/settings-profile-update.test.ts` vb.).
4. **Typecheck:** `pnpm typecheck` (`tsc --noEmit`) → çıkış kodu `0`.

## Bulgular
- **Düşük · test-zamanlama · guard testi 30 sn varsayılan süreyi aşabiliyor.** Dosya: `tests/api/api-error-body-guard.test.ts:156`. Senaryo: testin tümü statik import takibi yapıyor; yük altında süresi 30 sn'yi geçince birlikte koşulan üç dosyada kırmızı görünüyor, oysa 22/22 geçiyor. Bu commit testi değiştirmedi. Önerim: testin kendi `timeout` argümanını vermek (ör. `test(..., 300_000)`) ya da CI'de süre duvarı; testin mantığına dokunulmamalı. Bu, DoD'daki "guard dalda yeşil" maddesini yük altında etkiliyor; karar lidere ait.
- **Bilgi:** `scripts/run-keep-eu-sync.ts` değişikliği basit ve doğru; `status` yalnız CLI'de yazdırılıyor.

## Değişen dosyalar (bu incelemede)
- Yalnız bu rapor: `docs/agent-results/TASK-MVIK4YZH8ZA4K-crw-fb.md`. Kod değişmedi.

## Riskler
- Guard testinin süresi yük ve test sırasına bağlı; 30 sn duvarı CI'de de aşılabilir (CI şu an faturalama yüzünden hiç başlamıyor, bu yüzden canlı kanıt yok).
- Canlı keep.eu ile 401/403/200 davranışı koşulmadı; yalnız mock fetch testleri.
- Admin sayfasında tarayıcı ekran kontrolü bu turda yapılmadı; ekran görüntüleri `docs/agent-results/TASK-MVIK4YZH8ZA4K-evidence/` altında (be-fb tarafından).

## Açık sorular
- Guard testine süre argümanı eklenecek mi, yoksa yük ortamı mı düzeltilecek? (Lider kararı.)

## Sonraki adım
- Hüküm ONAY olduğu için kart `review`'a alınabilir; guard zaman aşımı kararı verilmeden merge edilmemesi önerilir.

## Platform
- Doğrulama: mac (Darwin 27). Platforma bağlı yol yok (saf TS, statik tarama, i18n). Windows/Linux koşulmadı: bu makinede yok.
