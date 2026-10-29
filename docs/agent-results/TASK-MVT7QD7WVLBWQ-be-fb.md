# TASK-MVT7QD7WVLBWQ (FO-204) — /api/cagrilar yavaş (Çağrılar paneli)

- **Sözleşme:** FO-204 / st1 delegasyonu
- **Kod:** FO-204
- **Tip:** perf (feature-level küçük değişiklik) + ölçüm
- **Hüküm:** KISMEN — kod ve ölçüm tamam; itme ve draft PR YAPILMADI. Gate `pnpm typecheck` adımında kırılıyor (origin/dev'de de var, bu kartın dışında). Ayrıca çeviri sağlayıcısı kotası dolu (karar bekliyor).
- **Platform:** sunucu kodu (route handler + önbellek modülü), mac üzerinde doğrulandı (darwin, Node + vitest). Tarayıcı/UI etkisi yok.
- **Çalışma dalı:** `be-fb/fo204-cagrilar-cache` (worktree `/Users/macbook/alan/FONBRIDGE-worktrees/be-fb-fo204`), taban `origin/dev` @ `317f33ba`. Commit: `a310d270`.
- **Ana checkout:** dokunulmadı.

## Ne yapıldı

1. Ölçüm: `GET /api/cagrilar?status=OPEN,FORTHCOMING&type=1&lang=tr&page=1&limit=20` için origin/dev üzerinde süre bileşenlerine ayrıldı.
2. Kök neden: origin/dev'de route zaten SEDIA'dan tek sayfa okuyor (FO-42, `startPage: page`, `maxPages: 1`). Kartın varsayımı ("5 SEDIA sayfası") yalnızca ana checkout'taki eski `feat/partner-search-interreg` kodu için geçerli. Patronun 5.7 sn'si o eski koddan geliyor olabilir; dev'de aynı istek ~1.4 sn (soğuk).
3. Değişiklik: aynı arama için 10 dk süreli bellek içi TTL önbelleği (`src/lib/ttl-cache.ts`, `src/lib/cagrilar-cache.ts`). Anahtar: `[q, page, pageSize, lang, statuses, frameworkProgrammes, types]`. Önbellek yalnızca bütçe iptal edilmediyse yazılır. Hız sınırı (`CAGRILAR_PER_USER_PER_MINUTE`) ve kiracı doğrulaması önbellekten ÖNCE çalışır; bütçe (`CAGRILAR_BUDGET_MS = 20_000`) değişmedi.
4. Testler: önbellek birim testleri, route önbellek testi (ikinci arama SEDIA'yı çağırmaz; farklı `lang` yeniden çeker), mevcut budget/hardening testlerinde `cagrilarCache.clear()` ve hız sınırı testinde farklı sorgular.

## Kanıt (ham ölçüm)

Aynı URL, origin/dev (değişiklik öncesi):
- Soğuk: ~1.42 sn; sıcak (önbellek yok, SEDIA cache'li): ~0.90–0.98 sn.
- Bileşenler: SEDIA tek sayfa 522–703 ms (1 HTTP çağrısı, 20 konu); çeviri 451–584 ms (34 MyMemory çağrısı, **hepsi HTTP 429**).

Değişiklikten sonra (aynı URL, ardışık üç çağrı):
- CALL1 (soğuk): 1421 ms
- CALL2 (önbellek): 1 ms
- CALL3 (önbellek): 1 ms
- Hedef "tekrarlanan arama < 500 ms" karşılandı.

Çeviri kotası: MyMemory yanıtı "used all available free translations" (kota ~21 saat sonra sıfırlanır). Bu yüzden 20 başlığın 0'ı çevrildi; buna rağmen route `translated: true` dönüyor. Bu bir ayrı hata; aşağıda.

Test ve kapılar:
- `tsc --noEmit` (worktree): 2 hata, ikisi de origin/dev'de mevcut, bu değişiklikten bağımsız: `tests/m17-interreg-review-poll.test.tsx(29,5)` ve `(30,5)` — `InterregDocumentView` içinde `expiresAt` eksik (FO-195 `d0601718`, fixture FO-189 `ff5ff797`).
- `eslint`: 0 hata, 4 uyarı (değişmeyen dosyalarda).
- İzole gate (`R2_ENDPOINT=http://127.0.0.1:9000 bash scripts/gate-isolated.sh`): `GATE_EXIT=1`, typecheck adımında durdu. E2E ve sonraki adımlar koşmadı. Pre-push kancası aynı sebeple başarısız olur; bu yüzden **itilmedi, PR açılmadı**.
- Tam birim test (`pnpm test`, worktree): 29 dosya başarısız, 58 test başarısız; 388 dosya geçti, 5096 test geçti. Başarısız dosyaların çoğu `*.live.test.ts` (canlı DB gerektirir; paylaşılan `fabrika` DB'si ve CI yok) ve `src/lib/billing/*` ile `tests/plan-*`. Dev'de 7 başarısız dosyayı ayrıca koştum (`src/lib/billing/plan-admin.test.ts`, `plan-repository.test.ts`, `tests/settings-profile-update.test.ts`, `tests/relationship-tenant-scope.test.ts`, `tests/blog-markdown.test.tsx`, `tests/billing-checkout-auth.test.ts`, `tests/modules/settings-modules-plan.test.ts`): origin/dev'de de 7/7 dosya başarısız (45 test). Geri kalan başarısız dosyaları dev'de koşmadım; bu yüzden hepsinin "önceden var" olduğunu iddia etmiyorum. Önbellek ile ilgili hiçbir dosya başarısız listesinde değil (`cagrilar`, `ttl-cache` eşleşmesi 0).

## Değişen dosyalar

- `src/lib/ttl-cache.ts` (yeni) — genel `TtlCache<V>`
- `src/lib/cagrilar-cache.ts` (yeni) — TTL 10 dk, en fazla 200 kayıt, paylaşılan örnek
- `src/app/api/cagrilar/route.ts` — önbellek okuma (hız sınırından sonra) ve yazma (bütçe iptal değilse)
- `tests/ttl-cache.test.ts` (yeni), `tests/api/cagrilar-cache.test.ts` (yeni)
- `tests/api/cagrilar-budget.test.ts`, `tests/api/cagrilar-hardening.test.ts` — önbellek temizliği; hız sınırı testi farklı sorgular kullanıyor

Commit'te `scripts/gate-isolated.sh` YOK (kopya geçici, silindi).

## Riskler

1. **Çeviri kotası sessiz bozulma:** MyMemory 429 verince başlıklar İngilizce kalıyor ama yanıt `translated: true` diyor. Önbellek de bu yanlış yanıtı 10 dk saklıyor. Bu, değişiklikten önce de vardı; önbellek süreyi uzatıyor.
2. **Süreç içi önbellek:** Her Next süreci kendi kopyasını tutar; yeniden başlatınca boşalır. Veri kamuya açık (SEDIA) olduğu için kiracılar arası sızıntı riski yok, ama çok süreçli dağıtımda isabet oranı düşer.
3. **Soğuk arama hâlâ ~1.4 sn** (SEDIA ~0.6 sn + çeviri ~0.5 sn, çeviri başarısız olsa da). Patronun 5.7 sn'si eski feat kodundan; dev'e geçince gelen iyileşme ayrıca doğrulanmalı.
4. Typecheck kırık olduğu sürece hiçbir dal itilemez (kart dışı sorun).

## Açık sorular

1. **Karar K-573663 (çeviri sağlayıcısı):** A) ücretli sağlayıcı, B) `src/lib/llm.ts` üzerinden LLM çevirisi, C) İngilizce bırak ve bayrağı düzelt. Sistem bu kararı otomatik olarak B'ye çekti; **ben B'yi uygulamadım**. B bir maliyet kararıdır (her arama LLM çağrısı + kredi), lider/patron onayı gerekir. Kota dolu kaldıkça çeviri yok.
2. **m17 test fixture'ı:** `tests/m17-interreg-review-poll.test.tsx` düzeltilmeli mi (başka kartın fixture'ı)? Onay gelmeden dokunmadım.
3. Canlı test DB'si / CI yokluğu: `*.live.test.ts` dosyaları izole DB ile mi koşsun?

## Sonraki adım

- Lider onayı sonrası: (a) m17 typecheck düzeltmesi veya gate'in onayla atlanması; (b) izole gate yeşil → `be-fb/fo204-cagrilar-cache` itilir, `dev`'e draft PR açılır; (c) kart `review`'a alınır.
- Karar K-573663 cevabı; B seçilirse ayrı kart.
- Kart açıklaması için not: patronun 5.7 sn ölçümü ana checkout (`feat/partner-search-interreg`) koduna ait; dev'de aynı istek ~1.4 sn.

DONE:st1 değil — kart tamamlanmadı (itme/PR ve karar bekliyor). Son satır: FAIL:st1 izole gate typecheck (m17 fixture, origin/dev'de var) + çeviri kotası kararı bekliyor.
