# TASK-MVC67YYIUXGAH (FO-42) — PR #132 QA incelemesi ve test doğrulaması

**HÜKÜM: DÜZELTME GEREKLİ** — PR #132 (`be-fb/fo42-calls-paging` → `dev`) `?page` parametresini doğru taşıyor, ama kabul kriterinin "sayfalar arası tekrar ya da atlama olmasın" kısmı canlı SEDIA'da ihlal ediliyor. Sıralama kararsız. Gerçek tarayıcı kanıtı da bu oturumda alınamadı.

**Platform beyanı:** Doğrulama macOS (darwin) üzerinde yapıldı. Değişen kod (route, zod, adapter döngüsü) platforma bağlı değil: dosya yolu, süreç, kabuk veya ekran kullanılmıyor, dolayısıyla Windows/Linux'ta davranışın aynı olması koddan çıkarıldı; orada koşulmadı. Gerçek tarayıcı E2E'si koşulamadı (aşağıda neden).

## Kapsam

- Kart: `get_task TASK-MVC67YYIUXGAH` — FO-42, proje fonbridge, bug. Lider metnindeki "giftanddate" satırı karta göre geçersiz; iş FONBRIDGE reposunda.
- PR: https://github.com/yaslan/fonbridge/pull/132 — "fix(calls): honour ?page on /api/cagrilar (FO-42)", OPEN, base `dev`.
- Değişen dosyalar: `src/app/api/cagrilar/route.ts`, `src/lib/adapters/sedia.ts`, `tests/api/cagrilar-hardening.test.ts`, `tests/sedia-start-page.test.ts` (yeni).
- Kod değiştirilmedi, merge yapılmadı, `fabrika` DB'sine yazılmadı. PR dalı geçici bir worktree'de (detached HEAD, `origin/be-fb/fo42-calls-paging` @ `362d75a7`) test edildi; worktree kaldırıldı.

## Sınır durumları — kod okuması

| Girdi | Davranış (PR head) | Durum |
|---|---|---|
| `page` yok | 1 kabul | OK, testli |
| `page=0`, `-3`, `1.5`, `abc`, boş, `1001` | 400 `invalid_page`, SEDIA'ya istek yok | OK, testli |
| `page=1000` | kabul | **test yok** (yalnızca 1001 reddi test ediliyor) |
| Son sayfanın ötesi (ör. 52×20; toplam 1012) | 200, `topics: []`, `totalResults` doğru | **test yok** |
| `page=1000`, `pageSize=50` (SEDIA ofset) | SEDIA `totalResults: 0`, sonuç yok; route 200 + `totalResults: 0` döner | **test yok**; UI "0 sonuç" gösterebilir |
| Gevşek sayı biçimleri (`" 2 "`, `"2.0"`, `"1e1"`, `"0x2"`) | `z.coerce.number()` kabul ediyor | Tutarlılık kararı gerekli, test yok |
| Zod | `z.coerce.number().int().min(1).max(1000)` ile `safeParse`; reddedince dış çağrı yok | OK |
| `totalResults` | Yalnızca `pageNumber === startPage` ve `envelope.success` iken set ediliyor; ilk sayfa şema sapmasıyla gelirse `0` kalır → UI "1 / 1" ve ileri devre dışı | Düşük risk, test yok |

## UI uyumu

`calls/page.tsx`: `page` ve `limit` query'ye yazılıyor (satır 190-191), `totalPages = ceil(totalResults / limit)` (satır 351), filtre/limit/arama değişince `page` 1'e dönüyor (satır 177, 252, 798). Route'un beklediği parametre adları (`page`, `limit`) ile uyumlu. Limit seçenek listesinin route'un 50 üst sınırıyla uyumu bu turda ayrıca kontrol edilmedi.

## Canlı SEDIA doğrulaması (route'un gönderdiği sorguyla, ağ üzerinden)

Sorgu: `type=1`, `status=31094501,31094502`, `text=***`, `languages=["en"]`.

```
run1 p1 HORIZON-CL5-2027-07-D3 | HORIZON-CL5-2027-07-D3 | HORIZON-CL5-2027-02-D3 | HORIZON-CL5-2027-01-D1 | PPPA-2026-REGIONAL-SUB
run1 p2 CERV-2026-DAPHNE-PREVE | CERV-2026-DAPHNE-PROTE | I3-2026-INV1 | HORIZON-WIDERA-2027-05 | HORIZON-CL5-2027-02-D3
run2 p1 CERV-2026-DAPHNE-CHILD | HORIZON-CL5-2027-06-D6 | HORIZON-CL5-2027-03-D5 | HORIZON-CL5-2027-07-D3 | CERV-2026-DAPHNE-CONVE
run2 p2 HORIZON-CL5-2027-01-D1 | HORIZON-CL5-2027-07-D3 | HORIZON-CL5-2027-02-D3 | HORIZON-CL5-2027-03-D5 | HORIZON-CL5-2027-05-D3
run3 p1 HORIZON-CL5-2027-07-D3 | HORIZON-CL5-2027-07-D3 | HORIZON-CL5-2027-02-D3 | HORIZON-CL5-2027-01-D1 | PPPA-2026-REGIONAL-SUB
run3 p2 HORIZON-CL5-2027-01-D1 | HORIZON-CL5-2027-07-D3 | HORIZON-CL5-2027-02-D3 | HORIZON-CL5-2027-03-D5 | HORIZON-CL5-2027-05-D3
```

- Aynı istek (`pageNumber=2`, `pageSize=5`) iki kez farklı ilk kayıt döndü: önce `HORIZON-CL5-2027-01-D1-13`, sonra `CERV-2026-DAPHNE-PREVENTION`. Yani SEDIA sonucu kararlı sıralamıyor.
- Aynı sayfa numarası (p1) run1 ile run2'de tamamen farklı kayıtlar döndürüyor; run2 p1 ile run1 p2 arasında da örtüşme var.
- `totalResults` her seferinde 1012 — toplam sabit, sıralama değil.
- Route'ta ve PR'da sıralama (sort / tie-breaker) yok; yani kullanıcı "İleri" tıkladığında sayfalar arasında aynı çağrının tekrar etmesi ya da başkasının atlanması olası.
- Uç: `pageNumber=52&pageSize=20` → `results: []`, `total: 1012`. `pageNumber=1000&pageSize=50` → `total: 0`, `results: []`.

Ham örnek (SEDIA'dan, bu oturumda):
```
== pageNumber=2 pageSize=5 http=200   total 1012 n 5 first CERV-2026-DAPHNE-PREVENTION
== pageNumber=2 pageSize=5 http=200   total 1012 n 5 first CERV-2026-DAPHNE-PREVENTION
== pageNumber=52 pageSize=20 http=200 total 1012 n 0
== pageNumber=1000 pageSize=50 http=200 total 0 n 0
```
(Not: önceki turda aynı `pageNumber=2` sorgusu `HORIZON-CL5-2027-01-D1-13` ile başlamıştı; yani sonuç zamana göre değişiyor.)

## Testler (PR head `362d75a7`, macOS)

- `tests/api/cagrilar-hardening.test.ts` + `tests/sedia-start-page.test.ts`: **20/20 geçti**.
- Bağlantılı paket — `sedia-adapter`, `sedia-timeout`, `adapters/sedia-circuit-breaker`, `api/cagrilar-budget`, `k1-daily-calls`, `k1-adapters`, `adapters`, `api/api-error-body-guard`, `translation-bounds`, `call-topic-route`, `k1-sync-topics`: 83 geçti, 8 atlandı.
  - `api/api-error-body-guard` ilk koşuda 30 sn zaman aşımına uğradı (yük altında); tek başına `--testTimeout=180000` ile **22/22 geçti**. Hata PR'la ilgili değil.
- `pnpm exec tsc --noEmit`: **exit 0**.
- Diğer `searchSedia` çağıranları (K1 günlük işi, `calls/[id]` detay, circuit breaker) varsayılan değerlerle çağırıyor; `startPage` varsayılanı 1 ve döngü koşulu `startPage=1` için eski davranışa denk. Kod olarak regresyon görülmedi.

## Bulgular (önem sırasıyla)

1. **[Yüksek] Sayfalar arası sıralama kararsız — kabul kriteri ihlali.** SEDIA aynı sorguya farklı sırayla dönüyor (yukarıdaki kanıt); PR sıralama eklemiyor, dolayısıyla sayfa tekrarı/atlaması PR ile çözülmüş sayılmaz. Düzeltme önerisi: SEDIA'nın desteklediği bir sıralama alanı ve kararlı tie-breaker'ı sorguya eklemek (desteklenen alan SEDIA dokümanından doğrulanmalı), ardından aynı üç-run kanıtını tekrarlamak. **Tekrar-üretim:** `POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=5&pageNumber=1` (sorgu gövdesi yukarıdaki filtre), birkaç kez çalıştır, ilk sonuç kimliklerini karşılaştır.
2. **[Orta] Gerçek tarayıcı kanıtı yok.** Kabul kriteri "Gerçek tarayıcıda 2. sayfa farklı çağrılar gösteriyor (kanıt)" istiyor. Bu oturumda uygulama + DB + oturum (tenant) ortamı ayağa kaldırılmadı; `calls` sayfası için tarayıcıda 2. sayfa ekran görüntüsü alınmadı. **Koşulamadı.** Bulgu 1 çözülmeden bu kanıtın anlamı da sınırlı.
3. **[Orta] Test boşlukları:** (a) `page=1000` kabul sınırı testi yok; (b) son sayfanın ötesi (`52×20`) için 200 + boş liste testi yok; (c) `pageSize=50 × page=1000` SEDIA'da `totalResults: 0` döner, UI "0 sonuç" gösterebilir — test ve karar yok; (d) gevşek sayı biçimleri (`" 2 "`, `"2.0"`, `"1e1"`) için kabul/ret kararı ve testi yok.
4. **[Düşük] `totalResults` yalnız `startPage` yanıtından alınıyor.** İlk sayfa şema sapmasıyla gelirse `totalResults` 0 kalır; UI "1 / 1" gösterip ileri tıklamayı kapatır, sonuç listesi dolu olsa bile. Test yok.

## Sonraki adım

Bulgu 1 (sıralama) ve bulgu 3 için PR'a düzeltme gerekiyor; ardından gerçek tarayıcıda 2. sayfa kanıtı (ekran görüntüsü + ağ kaydı) alınıp bu rapor yeniden koşulmalı. Merge yapılmadı.

## Açık sorular

- SEDIA'nın sıralama parametresi var mı, hangi alanla? (Dokümantasyon/istek denemesiyle doğrulanmalı.)
- Ofset üst sınırı (SEDIA ~10000 kayıt?) bilinen bir limit mi; route bunu 400 ile sınırlamalı mı?
