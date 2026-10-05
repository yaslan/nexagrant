# TASK-MTVN8M702FU5A — alarm konsolu doğrulama çöpü + kalıcı 300-satır testi

## 1) Ne yapıldı

1. **Ölçüm (silmeden önce):** Yerel Postgres'teki (`localhost:5432/fabrika`) `SystemAlert`
   tablosunun tamamını saydım ve test imzası taşıyan satırları ayırdım — imza:
   `source ∈ {test-module, test-worker, test-api}` VEYA `message` içinde `'truncation testing'`
   geçiyor (source'u yukarıdakilerden farklı olanlar için ayrıca sayıldı, çift saymayı
   önlemek amacıyla).
   - Toplam: **320** satır
   - Test imzalı: **286** satır (96 `test-module`, 95 `test-api`, 95 `test-worker`)
   - Test imzasız (gerçek): **34** satır
   - Tüm 286 satır aynı `createdAt` (2026-09-10T11:47:38.910Z) damgasını taşıyor — tek
     seferlik toplu insert imzası; önceki bir doğrulamanın (TASK-MTVFKK8UZS5BF, bkz.
     `.agentspace/memory/.../fabrika-alert-console-row-limit.md`) elle bıraktığı çöple tutarlı.
   - Kanıt dosyası: `docs/agent-results/TASK-MTVN8M702FU5A-evidence/before-delete-count.txt`

2. **Silme (dar kapsamlı):** Yalnız bu 286 satırın `id` listesine karşı
   `prisma.systemAlert.deleteMany({ where: { id: { in: ids } } })` çalıştırdım — kiracıya bağlı
   hiçbir alarma, hiçbir gerçek satıra dokunulmadı; tablo boşaltılmadı, geniş bir
   `source`/`message` sorgusu kullanılmadı (yalnız önceden toplanmış 286 id).
   - Silme sonrası toplam: **34** satır (öncesiyle birebir "gerçek kalan" sayısı)
   - Bağımsız yeniden ölçüm (`--delete` bayrağı olmadan aynı script, silmeden hemen sonra):
     test imzalı **0**, toplam **34** — doğrulandı.
   - Kanıt dosyası: `docs/agent-results/TASK-MTVN8M702FU5A-evidence/after-delete-count.txt`
   - Ölçüm/silme scripti geçiciydi (`scripts/_tmp-count-test-alerts.ts`), kullanımdan hemen
     sonra silindi — repoda kalıcı bir script bırakmadım (kalıcı olan tek şey aşağıdaki testtir).

3. **Kalıcı test eklendi:** `tests/e2e/alert-console-truncation.spec.ts` (yeni dosya, Playwright
   e2e). `admin/alerts` altındaki hiçbir dosyaya dokunmadım — yalnız okudum
   (`page.tsx`, `client.tsx`, `actions.ts`) ki testin sayfanın gerçek DOM/label yapısına
   (`dl div` sırası, `labels.total`, `labels.truncatedNote` metni, `MAX_ROWS = 300`) uysun.
   - Fixture: `MAX_ROWS + 1 = 301` satırlık bir `createMany` — her satırın `source`'u
     o çalıştırmaya özel benzersiz bir değer (`truncation-probe-<run-id>`), taban satır
     sayısı ne olursa olsun 301 yeni satır tek başına 300 eşiğini aşar.
   - Doğrulama: admin olarak `/tr/admin/alerts`'e giriş yapıp (a) başlık "Toplam uyarı"
     kutucuğunun DB'deki gerçek `count()`'a eşit olduğunu (300'e KIRPILMADIĞINI), (b) kesme
     uyarısı metninin (`truncatedNote`) göründüğünü, (c) tabloda hiçbir zaman 300'den fazla
     satır render edilmediğini assert ediyor.
   - Temizlik: `afterAll`'da yalnız o çalıştırmanın benzersiz `source`'una göre `deleteMany`,
     ve `removed.count === PILE_SIZE (301)` assert ediliyor — testin kendisi kendi çöpünü
     bırakmadığını kanıtlıyor (bu kartın var olma sebebi tam olarak bunu yapmayan bir
     doğrulamaydı).
   - `src/lib/observability/` altındaki hiçbir dosyaya dokunmadım (blok-zincir-dev'in elinde,
     dedup anahtarı üzerinde çalışıyor).

## 2) Kanıt

### Gerçek e2e koşumu (Playwright, gerçek tarayıcı, gerçek dev server — offscreen/unit değil)
```
$ npx playwright test tests/e2e/alert-console-truncation.spec.ts --reporter=list
...
  ✓  1 [chromium] › tests/e2e/alert-console-truncation.spec.ts:59:7 › alert console reports real
     totals past the row cap › header totals and the truncation note survive a >300-row pile (2.9s)

  1 passed (9.3s)
```
Koşum sonrası DB'de bağımsız doğrulama:
```
total after e2e run: 34
leftover truncation-probe rows: 0
```
(34 = koşumdan önceki gerçek satır sayısıyla birebir aynı — test hem 301 satırı yazdı hem de
hepsini geri sildi.)

### `pnpm alerts:check`
```
$ tsx scripts/check-orphan-alerts.ts
açık SystemAlert satırı            : 34
  meta.tenantId taşıyan             : 3
  tenant'ı YAŞAYAN                  : 3
  tenant'ı SİLİNMİŞ (öksüz)         : 0
  hiç tenant adı geçmeyen (normal)  : 31

✅ Öksüz alarm yok: her açık alarm ya bir tenant adı taşımıyor ya da yaşayan bir tenant’ı gösteriyor.
```

### `pnpm test`
```
 Test Files  150 passed | 2 skipped (152)
      Tests  1809 passed | 8 skipped (1817)
   Duration  7.25s (transform 6.29s, setup 0ms, import 21.23s, tests 31.07s, environment 5.67s)
```
(`tests/e2e/**` vitest'in `exclude`'unda — yeni e2e testi `pnpm test`'e dahil değil, ayrı
`playwright test` koşumuyla yukarıda doğrulandı; bu repodaki mevcut e2e alert konsolu
spec'leriyle aynı desen: `tests/e2e/qa-alert-console-probe.spec.ts`,
`tests/e2e/purge-failure-alert-console.spec.ts`.)

## 3) Değişen dosyalar
- `tests/e2e/alert-console-truncation.spec.ts` — yeni, kalıcı e2e testi.
- `docs/agent-results/TASK-MTVN8M702FU5A-evidence/before-delete-count.txt` — yeni, silme öncesi sayım.
- `docs/agent-results/TASK-MTVN8M702FU5A-evidence/after-delete-count.txt` — yeni, silme sonrası sayım.
- `docs/agent-results/TASK-MTVN8M702FU5A-geli-tirici.md` — bu rapor.
- `.agentspace/memory/agents/geli-tirici/fabrika-verification-garbage-needs-a-signature.md` — yeni hafıza kaydı.
- `.agentspace/memory/agents/geli-tirici/MEMORY.md` — indekse tek satır eklendi.
- (Geçici, repoda kalmadı: `scripts/_tmp-count-test-alerts.ts` — oluşturuldu, kullanıldı, silindi.)
- Dokunulmadı (görev kuralı gereği): `src/lib/observability/**`, `src/app/[locale]/admin/alerts/**` (yalnız okundu).

## 4) Riskler
- Silinen 286 satır geri getirilemez (beklenen — hepsi test imzalı, gerçek bir alarma karşılık
  gelmiyordu; kanıt dosyaları öncesi/sonrası sayımı kalıcı olarak tutuyor).
- Yeni e2e testi `test.describe.configure({ mode: 'serial' })` ve gerçek admin girişine
  bağımlı; `admin@yasinaslan.com.tr` kullanıcısı olmayan bir veritabanında (repodaki diğer
  admin/alerts spec'leriyle aynı desen) `skipReason` ile atlanır, gate'i kırmızıya düşürmez.
- Test 301 satırlık toplu bir `createMany` kullanıyor; bu, `SystemAlert`'a yazan diğer paralel
  e2e/test koşumlarıyla aynı DB'yi paylaşıyorsa (ki repodaki tüm e2e testleri paylaşıyor) geçici
  olarak başlık sayılarını etkiler — ama testin kendisi 300'den BÜYÜK olmasını zaten bekliyor,
  tam sayıya değil `toBeGreaterThan(MAX_ROWS)` ve gerçek `count()`'a eşitliğe bakıyor, bu yüzden
  paralel gerçek alarm üretimi testi kırmadan.

## 5) Açık sorular
- Yok.

## 6) Sonraki adım
- Yok — kart kapatılabilir. Kalıcı test artık `pnpm exec playwright test tests/e2e/` (veya
  `pnpm test:e2e`) her koştuğunda 300-satır kırpma davranışını gerçek admin ekranında ölçüyor
  ve kendi verisini temizliyor.

## Platform beyanı
**mac** üzerinde doğrulandı (Darwin 25.6.0, arm64). Dokunulan kod platforma bağlı değil
(Prisma sorguları + Next.js sayfası + Playwright testi — süreç öldürme, dosya yolu, kabuk/ikili
adı, DPI veya mikrofon/kamera izni yok), bu yüzden Windows/Linux'ta farklı davranması beklenmez;
başka platformda ayrıca koşulmadı.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
