# TASK-MTRNO3LBZB2Q7 — `notFound()` OTURUMLU istekte HTTP 200

**Ajan:** QA-EN (`blok-zincir-denet-i`) · **Tip:** bug · **Tarih:** 2026-09-08
**Karar:** Kartın iddiası **DOĞRU**. Ölçüldü, kök nedene inildi, düzeltildi, aynı testle yeşile alındı.
**Kapatan ölçüm (TASK-MTQYY136Q3CGG) geçersizdi** — aşağıda oturumlu çıktıyla değiştirildi.

---

## 1. Ne yapıldı

1. **İddia önce doğrulandı.** Giriş yapmış bir çerezle (`authjs.session-token`, kimlik bilgisi
   sağlayıcısı üzerinden gerçek oturum açma) 11 rota `curl -i` ile ölçüldü. Hepsi **HTTP 200**
   döndü, gövde doğru 404 ekranıydı. Aynı URL'ler **oturumsuz** 307 veriyor: `(app)` düzeni
   giriş sayfasına yönlendiriyor ve `notFound()` hiç çalışmıyor — kartı kapatan ölçümün
   neden "404 gibi göründüğünü" açıklayan tam olarak bu.
2. **Kök neden kontrollü deneyle bulundu** (aşağıda §2.2): tek bir `loading.tsx`,
   `src/app/[locale]/(app)/[workspace]/loading.tsx`. Bu dosya her workspace rotasının
   ÜSTÜNE bir Suspense sınırı koyuyor; Next kabuğu — ve 200 durum satırını — sayfa kaydın
   var olup olmadığına karar vermeden önce akışa veriyor. Sonradan atılan `notFound()`
   yalnız gövdeyi değiştirebiliyor, durum kodunu değil.
3. **Düzeltme:** iskelet, bakışı (lookup) belirleyici çocuğu OLMAYAN bölümlere taşındı.
   Ortak bileşen `src/components/WorkspaceLoadingSkeleton.tsx`; 18 bölüm kendi
   `loading.tsx`'inden onu yeniden dışa aktarıyor. `[param]` segmenti içeren 8 bölüm
   (`opportunities`, `pipeline`, `partners`, `relationships`, `calls`, `cagrilar`,
   `concept-notes`, `firsatlar`) sınırsız bırakıldı.
4. **Regresyon testi eklendi:** `tests/e2e/notfound-status.spec.ts` — oturumlu istekte 11 rotanın
   404, 7 gerçek rotanın 200 döndüğünü iddia eder; ayrıca oturumsuz halin `/giris`'e gittiğini
   (yani hiçbir şey kanıtlamadığını) kayda geçirir. Eski `loading.tsx` geri konduğunda test
   KIRMIZI oluyor (§2.5) — test gevşetilmedi.
5. **M9 spec'indeki "known-defect" notu gerçek assert'e çevrildi**
   (`tests/e2e/m9-brief-persistence.spec.ts:118` → `expect(response?.status()).toBe(404)`).

---

## 2. Kanıt (bu görevde üretildi)

Sunucu: `next dev` :3000, temiz yeniden başlatma. Ölçüm kiracısı: `nf-probe-tenant`
(11 modülün tamamı `ON`, `ultra` plan) — çünkü **modül kapısı sayfanın kendi kontrolünden ÖNCE**
cevap veriyor: M9'u kapalı bir kiracıda `/opportunities/<yok>/briefs` kilit ekranını ve tamamen
doğru bir 200'ü döndürür, `notFound()`'a hiç ulaşmaz. Kiracı ölçümden sonra silindi.

### 2.1 ÖNCE — oturumlu (kartın iddiası)

```
$ curl -s -i -b cookies.txt http://localhost:3000<rota> | head -1
/tr/nf-probe/opportunities/nope-abc/briefs               HTTP/1.1 200 OK
/tr/nf-probe/opportunities/nope-abc/documents            HTTP/1.1 200 OK
/tr/nf-probe/opportunities/nope-abc/application          HTTP/1.1 200 OK
/tr/nf-probe/opportunities/nope-abc/evaluations          HTTP/1.1 200 OK
/tr/nf-probe/opportunities/nope-abc/evaluations/panel    HTTP/1.1 200 OK
/tr/nf-probe/opportunities/nope-abc/m2                   HTTP/1.1 200 OK
/tr/nf-probe/opportunities/nope-abc/matching             HTTP/1.1 200 OK
/tr/nf-probe/pipeline/nope-abc                           HTTP/1.1 200 OK
/tr/nf-probe/pipeline/nope-abc/consortium                HTTP/1.1 200 OK
/tr/nf-probe/partners/nope-pic                           HTTP/1.1 200 OK
/tr/nf-probe/relationships/nope-abc                      HTTP/1.1 200 OK
```

Aynı oturum, `demo-tenant` üzerinde de önce ölçüldü (alice@fabrika.test, workspace `main`):
`briefs / documents / application / evaluations / matching / pipeline/[id] / partners/[pic] /
relationships/[id] / nope-workspace/dashboard` → 9/9 **200**.

### 2.2 Kartı kapatan ölçümün yerine geçen OTURUMSUZ çıktı

```
$ curl -s -i http://localhost:3000<rota> | head -1     # çerez YOK
/tr/nf-probe/opportunities/nope-abc/briefs               HTTP/1.1 307 Temporary Redirect
/tr/nf-probe/pipeline/nope-abc                           HTTP/1.1 307 Temporary Redirect
/tr/nf-probe/partners/nope-pic                           HTTP/1.1 307 Temporary Redirect
/tr/nf-probe/relationships/nope-abc                      HTTP/1.1 307 Temporary Redirect
/tr/nf-probe/opportunities/nope-abc/documents            HTTP/1.1 307 Temporary Redirect
```

307 = istek `src/app/[locale]/(app)/layout.tsx:27` içindeki `redirect()`'te durdu.
`notFound()` çalışmadı; bu ölçüm durum kodu hakkında **hiçbir şey söylemez**.
TASK-MTQYY136Q3CGG'yi kapatan tablo (`/tr/invalid-opportunity-id`, `/tr/app/opportunities/fake-id`,
`/tr/something-random` …) ayrıca **hiç eşleşmeyen** rotalardan oluşuyor; onlar zaten 404'tü.

### 2.3 Kök neden — kontrollü deney (aynı sayfa kodu, tek fark `loading.tsx`)

Birbirinin kopyası iki geçici sonda rotası (`zprobe-a`, `zprobe-b`) oluşturuldu; tek fark
`zprobe-b/loading.tsx` dosyasının varlığı:

```
/tr/zprobe-a/ok                HTTP/1.1 200 OK
/tr/zprobe-a/missing           HTTP/1.1 404 Not Found     ← loading.tsx YOK
/tr/zprobe-b/ok                HTTP/1.1 200 OK
/tr/zprobe-b/missing           HTTP/1.1 200 OK            ← loading.tsx VAR
```

Elenen iki aday:
- `zprobe-b/not-found.tsx` eklendi → hâlâ 200 (segment-yerel sınır durumu düzeltmiyor).
- `notFound()` `generateMetadata` içine taşındı → hâlâ 200 (metadata da sınırın içinde).

Ağaçtaki tek `loading.tsx` zaten `[workspace]` altındaydı; `(app)` dışındaki `notFound()`
rotaları hep doğruydu ve öyle kaldı:

```
/tr/blog/no-such-post-xyz                                HTTP/1.1 404 Not Found
/tr/portal/partner/no-such-token                         HTTP/1.1 404 Not Found
/tr/completely-unknown-route-xyz                         HTTP/1.1 404 Not Found
```

### 2.4 SONRA — oturumlu, temiz sunucu yeniden başlatması

```
=== AFTER (clean server restart) — signed in, all modules ON ===
/tr/nf-probe/opportunities/nope-abc/briefs               HTTP/1.1 404 Not Found
/tr/nf-probe/opportunities/nope-abc/documents            HTTP/1.1 404 Not Found
/tr/nf-probe/opportunities/nope-abc/application          HTTP/1.1 404 Not Found
/tr/nf-probe/opportunities/nope-abc/evaluations          HTTP/1.1 404 Not Found
/tr/nf-probe/opportunities/nope-abc/evaluations/panel    HTTP/1.1 404 Not Found
/tr/nf-probe/opportunities/nope-abc/m2                   HTTP/1.1 404 Not Found
/tr/nf-probe/opportunities/nope-abc/matching             HTTP/1.1 404 Not Found
/tr/nf-probe/pipeline/nope-abc                           HTTP/1.1 404 Not Found
/tr/nf-probe/pipeline/nope-abc/consortium                HTTP/1.1 404 Not Found
/tr/nf-probe/partners/nope-pic                           HTTP/1.1 404 Not Found
/tr/nf-probe/relationships/nope-abc                      HTTP/1.1 404 Not Found

=== CONTROLS ===
/tr/nf-probe/dashboard          200 OK      /tr/nf-probe/evidence        200 OK
/tr/nf-probe/pipeline           200 OK      /tr/nf-probe/approvals       200 OK
/tr/nf-probe/partners           200 OK      /tr/nf-probe/marketplace     200 OK
/tr/nf-probe/relationships      200 OK      /tr/nf-probe/panel           200 OK
/tr/nf-probe/settings/profile   200 OK      /tr/nf-probe/notifications   200 OK
/tr/nf-probe/reports/person-days 200 OK
```

Tarayıcı kanıtı (gerçek giriş + gerçek gezinme, `Page.goto` durum kodları):
```
http://localhost:3000/tr/nf-probe/pipeline/nope-abc -> HTTP 404
http://localhost:3000/tr/nf-probe/opportunities/nope-abc/briefs -> HTTP 404
http://localhost:3000/tr/nf-probe/relationships/nope-abc -> HTTP 404
```
Ekran görüntüleri: `docs/agent-results/TASK-MTRNO3LBZB2Q7-screenshots/`
(`01-signed-in-dashboard.png`, `02-pipeline-unknown-id.png`, `03-briefs-unknown-id.png`,
`04-relationships-unknown-id.png`).

### 2.5 KIRMIZI → DÜZELT → YEŞİL (test gevşetilmedi)

Eski `[workspace]/loading.tsx` geri kondu, **aynı** test koşuldu:

```
$ npx playwright test tests/e2e/notfound-status.spec.ts
  ✘  1 … an unknown id under (app) is 404, and the routes that exist stay 200 (906ms)
    Error: /tr/nf-e2e/opportunities/nf-e2e-does-not-exist/briefs must answer 404
    Expected: 404
    Received: 200
  1 failed
  1 passed
```

Düzeltme geri alınınca, aynı test:

```
$ npx playwright test tests/e2e/notfound-status.spec.ts tests/e2e/m9-brief-persistence.spec.ts
  ✓  1 … m9-brief-persistence … a generated brief reaches the database and survives a reload (3.8s)
  ✓  2 … m9-brief-persistence … an opportunity that does not exist gets the not-found screen (1.8s)
  ✓  3 … notfound-status … an unknown id under (app) is 404, and the routes that exist stay 200 (7.4s)
  ✓  4 … notfound-status … signed out, the same URLs redirect and never reach notFound() (699ms)
  4 passed (15.0s)
```

### 2.6 Kapı

```
$ pnpm lint       → ✖ 16 problems (0 errors, 16 warnings)      # 16 uyarı da benim değil (§4.3)
$ pnpm typecheck  → $ tsc --noEmit                              # çıktı yok = 0 hata
$ pnpm test       → Test Files 96 passed | 2 skipped (98)
                    Tests 1075 passed | 8 skipped (1083)
$ pnpm rls:check  → ✅ SUCCESS: All 41 tenant-scoped models have RLS policies registered.
$ pnpm rls:verify → ✅ Veritabanı 41 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

### 2.7 Regresyon taraması — tüm e2e paketi

```
$ npx playwright test
  8 failed … 1 skipped … 1 did not run … 79 passed (5.6m)
```
Bu 8 kırmızı **benim değil**: eski `[workspace]/loading.tsx` geri konup aynı 6 dosya tekrar
koşuldu, **aynı 8 test aynı şekilde düştü** (`8 failed … 6 passed (3.9m)`). Yani düzeltmeden
önce de sonra da kırmızılar; listesi §4.1'de.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/app/[locale]/(app)/[workspace]/loading.tsx` | **silindi** — ağaç geneli Suspense sınırı, hatanın kaynağı |
| `src/components/WorkspaceLoadingSkeleton.tsx` | **yeni** — iskeletin tek kopyası + kuralı anlatan yorum |
| `…/[workspace]/{approvals,ayarlar,bildirimler,dashboard,evidence,iliskiler,kanitlar,konsept-notlar,marketplace,notifications,onay-merkezi,ortaklar,panel,pazar-yeri,reports,settings,tto,tto-hizlandirici}/loading.tsx` | **yeni (18)** — iskeleti yalnız `[param]` çocuğu olmayan bölümlere bağlar |
| `tests/e2e/notfound-status.spec.ts` | **yeni** — regresyon testi (11 rota 404 + 7 rota 200 + oturumsuz not) |
| `tests/e2e/fixtures/notfound-tenant.ts` | **yeni** — 11 modülü `ON`, `ultra` planlı ölçüm kiracısı; testten sonra silinir |
| `tests/e2e/m9-brief-persistence.spec.ts` | "known-defect" anotasyonu → gerçek `expect(...).toBe(404)` |

i18n: kullanıcıya görünen yeni metin yok, bu yüzden yeni anahtar yok (CLAUDE.md §8).
Sabit rakam eklenmedi (§7). Yeni tablo yok, dolayısıyla migration/RLS gerekmiyor.

---

## 4. Yolda görülen, DÜZELTMEDİĞİM bulgular (adıyla bildiriliyor)

### 4.1 e2e paketinde 8 önceden var olan kırmızı (benim değişikliğimden ÖNCE de kırmızı)
| Dosya:satır | Test |
|---|---|
| `tests/e2e/dashboard-outcome-case.spec.ts:34` | the panel export reports the above-threshold rate the database actually holds |
| `tests/e2e/f10-absence-not-zero.spec.ts:140` | an unfilled evaluation reads "not evaluated", never "0.0 / 15.0 below threshold" |
| `tests/e2e/gate-tenant-isolation.spec.ts:33` | tenant A can still run its own gate, and the decision is filed |
| `tests/e2e/m10-audit-identity.spec.ts:54` | a real signed-in user sees the workflow and no invented signer |
| `tests/e2e/m9-brief-generate-failure.spec.ts:54` | a dropped request surfaces in the band, keeps the form, and retries |
| `tests/e2e/m9-brief-generate-failure.spec.ts:116` | an action that comes back with no brief is reported, not ignored |
| `tests/e2e/m9-brief-generate-failure.spec.ts:167` | the happy path still ends with a brief and no band |
| `tests/e2e/opportunity-archive.spec.ts:46` | archiving hides the opportunity everywhere but keeps the record (`:64` — `Archive E2E — opportunity to archive` ekranda yok) |

### 4.2 404 sayfası CLAUDE.md §8'i (i18n) ihlal ediyor
`src/app/not-found.tsx:11`, `:13`, `:20` — "Sayfa Bulunamadı", "Aradığınız sayfa veya geçerli
bağlantı mevcut değil ya da kaldırılmış olabilir.", "Ana Sayfaya Dön" kod içine gömülü Türkçe
sabitler; `:17` ise `href="/tr"` ile İngilizce oturumdaki kullanıcıyı da Türkçe ana sayfaya
atıyor. `t('...')` yok, iki dilde anahtar yok. Bu kartın kapsamı durum koduydu, metin değil —
dokunmadım.

### 4.3 `pnpm lint` 16 uyarı (0 hata) — hepsi başka dosyalarda
`src/modules/m11/ui/PartBCollaborativeEditor.tsx:102`, `:207`,
`src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/client.tsx:119`,
`…/documents/client.tsx:19`, `src/components/UserMenu.tsx:29`,
`src/lib/k2-cordis/importer.ts:305` vb. Benim eklediğim dosyalar uyarı üretmiyor.

---

## 5. Riskler

1. **İskelet artık `[param]` rotalarında yok.** `opportunities/[id]/*`, `pipeline/[id]*`,
   `partners/[pic]`, `relationships/[id]` ve dinamik çocuğu olan diğer bölümler
   (`calls`, `cagrilar`, `concept-notes`, `firsatlar`) yükleme sırasında eski sayfada bekler.
   Bu bir takas, kaza değil: o rotaların üstündeki her Suspense sınırı 404'ü yeniden 200 yapar.
   Alternatif isteniyorsa, iskeleti sayfanın İÇİNDE (kaydın var olduğu doğrulandıktan sonra)
   render eden bir `<Suspense>` gerekir — ayrı bir UX kararı.
2. **Tuzak kalıcı.** Biri `opportunities/loading.tsx` ekleyince hata sessizce geri gelir.
   Buna karşı iki koruma bırakıldı: `WorkspaceLoadingSkeleton.tsx` başındaki kural yorumu ve
   `tests/e2e/notfound-status.spec.ts` (o dosya eklendiği anda kırmızı olur).
3. **Ölçüm `next dev`'e karşı.** `next build` bu depoda hâlihazırda düşüyor (önceki kartın notu);
   production build'de tekrarlanmadı. Streaming davranışı prod'da da aynıdır ama ölçülmedi.
4. **Modül kapısı ölçümü maskeleyebilir.** Modülü kapalı bir kiracıda bu rotalar 200 (kilit
   ekranı) döner ve bu doğrudur. Kim yeniden ölçerse modülleri `ON` bir kiracı kullanmalı —
   fixture bunun için var.

---

## 6. Açık sorular

1. `src/app/not-found.tsx` i18n'e çevrilecek mi, ayrı kart mı açılsın? (§4.2)
2. Dinamik rotalar için iskelet geri istenirse, sayfa-içi `<Suspense>` yaklaşımı onaylanıyor mu? (§5.1)
3. §4.1'deki 8 kırmızının sahibi kim? Bunlar bu kartla ilgisiz ve düzeltilmedi.

---

## 7. Sonraki adım

- Kart `review`'a alındı; TASK-MTQYY136Q3CGG'nin "bayat kart" gerekçesi bu dosyadaki
  oturumlu ölçümle (§2.1–§2.2) geçersiz kılındı.
- §4.1 ve §4.2 için ayrı kart açılması öneriliyor (bu ajan açmadı — başka ajanların kapsamı).
