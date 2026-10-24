# TASK-MVC67YYIUXGAH (FO-42) — PR #132 inceleme bulgularının düzeltilmesi (be-bulsam)

**HÜKÜM: DÜZELTİLDİ — 3 bulgunun üçü de kapatıldı, kanıtlı.** (Merge edilmedi; aynı dala push, `be-fb/fo42-calls-paging`.) Pre-push gate sonucu en altta.

**Platform beyanı:** Doğrulama macOS (darwin) üzerinde yapıldı. Kod yolu platforma bağlı değil (HTTP, zod, FormData; dosya yolu/süreç/kabuk yok) → Windows/Linux'ta davranışın aynı olduğu koddan çıkarıldı, orada koşulmadı. Playwright spec'i Chromium'da (macOS) koşuldu; diğer tarayıcı/OS'lerde koşulmadı.

## Ne yapıldı

1. **[Yüksek] Kararsız sıralama.** `SediaAdapter.searchSedia` her isteğe `sort` form parçası ekliyor: `SEDIA_STABLE_SORT = { field: 'identifier', order: 'ASC' }`. Alan tahmin değil, canlı çağrıyla seçildi (aşağıda). Çoklu sıralama (dizi) 200 dönüyor ama ikinci anahtarın uygulandığı ölçülemedi, bu yüzden kullanılmadı.
2. **[Orta] Test boşlukları** (`tests/api/cagrilar-hardening.test.ts`, `tests/sedia-start-page.test.ts`):
   - Karar: gevşek sayı biçimleri **RET** (`" 2 "`, `2.0`, `1e1`, `0x2`, `02`, `+2` → 400 `invalid_page`). Zod: `z.string().regex(/^[1-9]\d{0,3}$/).transform(Number).pipe(max 1000)`. Gerekçe: aynı sayfa için birden çok URL yazımı olmasın.
   - `page=1000` kabul (limit=10 ile) — testli.
   - SEDIA penceresi ölçüldü: 10 000 kayıt (100×100 ve 200×50 dolu; 101×100 ve 201×50 `totalResults: 0`). Yeni kural: `page × limit > 10 000` → 400 `page_out_of_window` (SEDIA'ya istek yok). `page=1000 × limit=50`, `201×50`, `1000×11` → 400; `200×50` → okunur.
   - Son sayfanın ötesi (52×20, toplam 1012) → 200 + `topics: []` + doğru `totalResults` — testli.
   - Adaptörün `sort` gönderdiği testli.
3. **[Orta] Gerçek tarayıcı kanıtı.** `tests/e2e/calls-page-2-live.spec.ts` (yalnız `E2E_LIVE_SEDIA=1` ile koşar; gate üçüncü taraf portala bağımlı olmasın). Stub yok: gerçek route + canlı SEDIA + izole DB.

## Kanıt

**Alan seçimi (canlı SEDIA, aynı sorgu, 3 koşu, sayfa 2 × 5):** sortsuz ve `reference` → farklı/karışık sıra; `identifier` ASC → 3/3 aynı (`CEF-T-2021-AFIFCOEN-WORKS-ZE | CEF-T-2021-AFIFGEN-UNITS | …`). `startDate`/`deadlineDate` kararsız çıktı (ilk kayıt koşular arasında değişti).
**Tam yürüyüş:** `identifier` ASC ile 11 sayfa × 100 iki kez → 1012 satır, `cmp` → **IDENTICAL**. Kimlik tekrarı: 1 (`ERASMUS-EDU-2022-ECHE-CERT-FP`, aynı konunun iki kaydı) → iki satırlık bağ sayfa sınırına denk gelirse teorik tekrar/atlama riski kalır (aşağıda).
**Üç koşu, gerçek adaptör (`searchSedia`, pageSize 5):**
```
run1 p1 CEF-DIG-2026-CABLE-REPAIR-CAPACITIES-WORKS | CEF-E-2023-PCI-STUDIES | CEF-E-2023-PCI-WORKS | CEF-T-2021-AFIFCOEN-UNITS | CEF-T-2021-AFIFCOEN-WORKS-LNG
run1 p2 CEF-T-2021-AFIFCOEN-WORKS-ZE | CEF-T-2021-AFIFGEN-UNITS | CEF-T-2021-AFIFGEN-WORKS-LNG | CEF-T-2021-AFIFGEN-WORKS-ZE | CEF-T-2023-MILMOB-WORKS
run2 p1/p2 → run1 ile birebir aynı
run3 p1/p2 → run1 ile birebir aynı           (total=1012 her seferinde; p1 ile p2 örtüşmüyor)
```
**Birim:** 33/33 geçti (`cagrilar-hardening` 29 + `sedia-start-page` 4). Kaynak değişikliği geri alınınca **10 test kırmızı** (6 gevşek biçim, 3 pencere, 1 sort), geri konunca yeşil → testler gerçekten bağlayıcı.
**Gerçek tarayıcı (izole ortam):** `fo42-pg-iso` Postgres konteyneri (:55942, CI reçetesiyle kuruldu: db push, rls-role, rls, apply-migrations ×2 → 49 dosya, rls, seed; 113 politika) + `next dev --port 3142` bu worktree'den. Ortak DB (:5433) ve :3000'e dokunulmadı. Spec çıktısı:
```
[FO-42] total=1012 page1=["CEF-DIG-2026-CABLE-REPAIR-CAPACITIES-WORKS","CEF-E-2023-PCI-STUDIES","CEF-E-2023-PCI-WORKS","CEF-T-2021-AFIFCOEN-UNITS","CEF-T-2021-AFIFCOEN-WORKS-LNG"] page2=["CERV-2026-DAPHNE-CONVENTION-DIR","CERV-2026-DAPHNE-PREVENTION","CERV-2026-DAPHNE-PROTECTION","CERV-2026-DAPHNE-REGRANTING","CREA-CROSS-2027-INNOVLAB"]
1 flaky (3. deneme yeşil)
```
Doğrulananlar: "Next" → "2 / 51", sayfa 2 kimlikleri ve görünen başlıklar sayfa 1'le kesişmiyor, "Previous" sayfa 1'i aynı sırayla geri getiriyor. Ekran görüntüleri: `docs/agent-results/TASK-MVC67YYIUXGAH-evidence/calls-page-1.png`, `calls-page-2.png`.

## Değişen dosyalar
`src/lib/adapters/sedia.ts`, `src/app/api/cagrilar/route.ts`, `tests/api/cagrilar-hardening.test.ts`, `tests/sedia-start-page.test.ts`, `tests/e2e/calls-page-2-live.spec.ts` (yeni), `docs/agent-results/TASK-MVC67YYIUXGAH-evidence/*.png`, bu rapor.

## Riskler
- `identifier` benzersiz değil (1/1012 çift). Çiftin iki satırı bir sayfa sınırının iki yanına düşerse o konu bir sayfada tekrar/eksik görünebilir. SEDIA tek sıralama alanı kabul ediyor gibi; ikinci anahtar doğrulanamadı.
- Sıralama artık `identifier` (alfabetik): UI'nin varsayılan görünümü SEDIA'nın alaka sırasından farklı. Kullanıcı sütun başlığıyla yalnız o sayfadaki satırları yeniden sıralar (client-side).
- Canlı spec ağır yükte flaky: makine load ~150-260 iken uygulamanın auth DB bağlantısı zaman aşımına düştü (`Connection terminated due to connection timeout`, 401). Kod hatası değil; spec bu yüzden `E2E_LIVE_SEDIA` ile opt-in ve zaman aşımları geniş.
- Yeni 400 kodu `page_out_of_window`: UI bunu şu an genel hata olarak gösterir; UI'de limit ≤50 ile page ≤200 doğal olarak yetiyor (200×50 = pencere), yani normal kullanımda tetiklenmez.
- Playwright config `reuseExistingServer: false` + 180 sn webServer süresi, aşırı yüklü makinede soğuk derlemeyle yetmiyor; geçici config ile (commit'lenmedi) aşıldı.

## Açık sorular
- UI `page_out_of_window` için ayrı bir cümle istiyor mu? (Şimdilik tetiklenmez.)
- İkinci tie-breaker için SEDIA dokümanı/yetkili kaynak var mı? (Bulunamadı; ölçülemeyeni uygulamadım.)

## Sonraki adım
Reviewer PR #132'yi yeniden incelesin (QA gnd). Merge yapılmadı.
