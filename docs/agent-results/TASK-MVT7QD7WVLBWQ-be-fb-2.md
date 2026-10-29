# TASK-MVT7QD7WVLBWQ (FO-204) — /api/cagrilar yavaş (Çağrılar paneli) — devam

- **Sözleşme:** FO-204 / st1 delegasyonu, önceki tur `TASK-MVT7QD7WVLBWQ-be-fb.md` (commit `369650f9`) devamı. Lider kararları 1, 2, 3 uygulandı.
- **Kod:** FO-204 (`src/app/api/cagrilar/route.ts`, `src/lib/translation.ts`, `src/lib/ttl-cache.ts`, `src/lib/cagrilar-cache.ts`)
- **Tip:** perf/bug (sunucu) + ölçüm + çeviri kotası düzeltmesi
- **Hüküm:** TAMAM — draft PR'lar açıldı, izole kapı yeşil, kart `review`'da. Merge kararı ve K-573663 (çeviri sağlayıcısı) lidere ait.
- **Platform:** sunucu kodu (route handler + önbellek + çeviri), mac (darwin) üzerinde doğrulandı. Tarayıcı/UI etkisi yok. Windows/Linux koşulmadı: kod yolunda platforma bağlı bir şey yok (süreç içi `Map` önbellek, `fetch`, zamanlayıcı).

## Sözleşme kararları (lider)

1. **m17 fixture (ayrı dal):** `be-fb/fix-m17-poll-fixture` (dev'den), PR **#210** (draft, base dev). Commit `66b1d991`. `expiresAt` eklendi; ayrıca `textExpiresAt` kaldırıldı (artık tipte yok, aynı fixture'daki ikinci hata). `tsc --noEmit`: 0 hata (öncesinde 1 hata + symlink'li node_modules kaynaklı ek hatalar; worktree'de gerçek `pnpm install` + `prisma generate` ile temiz).
2. **Çeviri (K-573663, seçenek C):** uygulandı. Kota/hata → liste İngilizce kalır, `translated: false`, yanıt önbelleğe alınmaz. **B (llm.ts ile LLM çevirisi) UYGULANMADI** (kredi harcar, patron kararı bekliyor).
3. **58 başarısız test:** izole kapıda birim tarafı artık yeşil (448 dosya, 5874 test geçti; 0 başarısız). Önceki 58 kırmızının kaynağı kapının kendi ortam sorunlarıydı ve fixture hatası (tek kırmızı dev fixture'ı #210 ile kapandı). Ayrıntı aşağıda.

## Ne yapıldı

- Önbellek (`10f3df4e`, önceki turdan rebase edildi): aynı arama 10 dk, en çok 200 kayıt. Hız sınırı ve kiracı doğrulaması önbellekten önce çalışır; bütçe (`CAGRILAR_BUDGET_MS = 20_000`) değişmedi.
- Çeviri kotası (`162b6b92`):
  - `translateTopicsBatch` opsiyonel `options.onUntranslated` alıyor; her çevrilemeyen metin için çağrılır. Mevcut imza korundu (route testleri bu fonksiyonu mock'luyor).
  - MyMemory'nin kota uyarısı 200 yanıtla gelirse ("MYMEMORY WARNING") çeviri sayılmıyor.
  - Route: eksik çeviri varsa İngilizce liste, `translated: false`, önbelleğe yazılmaz.

## Kanıt

Önceki ölçüm (değişmedi, origin/dev, mac):
- Soğuk: ~1.42 sn (SEDIA tek sayfa 522–703 ms; çeviri 451–584 ms, 34 MyMemory çağrısı, hepsi HTTP 429).
- Önbellekli tekrar: 1 ms, 1 ms (3 ardışık çağrının ikincisi ve üçüncüsü).

Yeni davranış testleri (mac, `npx vitest run`):
```
tests/translation-quota.test.ts, tests/translation.test.ts, tests/translation-bounds.test.ts,
tests/api/cagrilar-cache.test.ts, tests/api/cagrilar-budget.test.ts,
tests/api/cagrilar-hardening.test.ts, tests/ttl-cache.test.ts
 Test Files  7 passed (7)
      Tests  54 passed (54)
```
- Yeni testler: 429 → her metin raporlanır, İngilizce kalır; "MYMEMORY WARNING" 200 yanıtı çeviri sayılmaz; başarısız metin sonraki çağrıda yeniden denenir; çeviri hatalı arama önbelleğe alınmaz ve SEDIA tekrar çağrılır.

Tip ve lint (FO-204 worktree): `tsc --noEmit` → exit 0, 0 hata. `eslint` değişen dosyalarda → exit 0.

İzole kapı (`gate-isolated`, 127.0.0.1 Postgres, `be-fb-fix-m17` ile aynı koşucu):
- Fixture dalı (#210): birim `448 passed | 2 skipped (450)`, `5874 passed | 54 skipped (5928)`; e2e `454 passed`; `GATE_EXIT=0`; push kancası da geçti.
- FO-204 dalı (#211 push'u): birim `451 passed | 2 skipped (453)`, `5883 passed | 54 skipped (5937)`; e2e `454 passed`; `PUSH_EXIT=0`.

## Kapı ortamı sorunu (kodla ilgisi yok, bilgi için)

İlk izole koşuda 3 test kırıldı: `tests/core-bare-guard.test.ts` (2) ve `tests/pre-push-hook.test.ts` (1). Sebep: koşucu DB adresini `localhost` yazıyor; bu Mac'te Postgres yalnız `127.0.0.1`'de dinliyor, `db-loopback-check` `[::1]` denemesinde durdu. Aynı iki dosya izole ortam dışında düz vitest ile 5/5 geçti. Geçici koşucu kopyasında `localhost` → `127.0.0.1` yapılınca kapı yeşil geçti. Bu düzeltme repoya girmedi: `scripts/gate-isolated.sh` repoda izlenmiyor (`gate:isolated` script'i dev'de yok). **Lider'e öneri:** script'i kalıcı yapıp DB adresini `127.0.0.1` yapmak (ayrı kart).

## Değişen dosyalar

- `tests/m17-interreg-review-poll.test.tsx` (#210): `expiresAt` eklendi, `textExpiresAt` kaldırıldı.
- `src/lib/translation.ts`: `translateTextOrNull` (iç), `translateTopicsBatch` `options.onUntranslated`, MYMEMORY WARNING kontrolü.
- `src/app/api/cagrilar/route.ts`: `translationFailed` bayrağı; `translated: false`; önbelleğe yazmama.
- `tests/translation-quota.test.ts` (yeni), `tests/api/cagrilar-cache.test.ts` (test eklendi).
- Önceki turdan: `src/lib/ttl-cache.ts`, `src/lib/cagrilar-cache.ts`, `tests/ttl-cache.test.ts`, `tests/api/cagrilar-budget.test.ts`, `tests/api/cagrilar-hardening.test.ts`.

## Riskler

1. **Süreç içi önbellek:** her Next süreci kendi kopyasını tutar; yeniden başlatınca boşalır. Veri kamuya açık (SEDIA), kiracılar arası sızıntı yok.
2. **Kota dolu kaldıkça soğuk aramada çeviri yok:** liste İngilizce. Patron kararı (K-573663) gelene kadar Türkçe görünüm yalnızca sözlük eşleşmelerinde.
3. **Ana checkout (`feat/partner-search-interreg`) eski kod:** orada `MAX_PAGES=5` hâlâ var; patronun 5.7 sn'si oradan. Bu dal dev'e girince gelen iyileşme ayrıca ölçülmeli.

## Açık sorular

1. **K-573663:** B (LLM çevirisi, kredi harcar) ayrı kart olarak açılsın mı? Lider/patron kararı.
2. `scripts/gate-isolated.sh` ve `127.0.0.1` düzeltmesi: kalıcı hale getirilsin mi?
3. Rapor yolu: lider `/Users/macbook/alan/FONBRIDGE/docs/agent-results/...-be-fb-2.md` istedi. Ana checkout (`feat/partner-search-interreg`, çok sayıda kirli dosya) kuralı gereği dokunulmadı; rapor bu worktree'de (`be-fb/fo204-cagrilar-cache`) commit'lendi.

## Sonraki adım

- Lider: #210 review/merge (dev). Sonra #211 base'i dev'e çevrilir.
- Kart `review`'da.
