# NG-320 — be-gnd — st6 seed takibi (PR #410 önerileri N-a, N-b, N-c)

Kart: TASK-MWS1AKNFWDE51 · Sprint: ORTAM-YESIL-1 · Dal: `task/ng-320` (origin/dev 25cc9be6'dan açıldı)

## Hüküm

N-a, N-b, N-c kapatıldı. `pnpm gate:isolated` GATE_EXIT=0. PR henüz AÇILMADI (aşağıdaki "Açık sorular": yerel dalda başka oturumun bir commit'i var, push etmeden karar gerekiyor).

## Ne yapıldı

- **N-a (EEXIST'te rollback başka koşunun yedeğini geri yükleyip silemez):**
  - `scripts/seed-st6-empty-e2e.ts`: `seedBackupRefused` bayrağı. Yedek bu koşuda yazılamadıysa (ön kontrolde dosya zaten var, ya da `wx` yazımı hata verdi) bayrak `true` olur; seed uyarı basıp hata fırlatır.
  - `rollback()`: bayrak `true` ise DB'ye ve yedek dosyasına hiçbir yazım yapmadan uyarıyla döner (fixture satırları dahil; onlar başka koşuya ait olabilir).
  - Kapsam sınırı (bilinçli karar): ayrı bir `--rollback` süreci hâlâ dosyayı okur ve geri yükler. Bu süreç, seed'in tabloları temizleyip temizlemediğini bilemez; dosya tek kopya olduğu için bu davranış korundu. Yani N-a'nın tam yarış senaryosu (B süreci EEXIST alıp ayrı bir rollback çalıştırırsa) hâlâ mümkün; yalnızca aynı süreçteki rollback güvenli hale geldi.
- **N-b (sahte `count` mock'u):** `tests/seed-st6-backup-restore.test.ts` mock'u artık model başına `h.counts` döndürüyor; `createMany` dilimlerinin satır sayısını kaydediyor. Eklenen testler: sayım tutarsa yedek silinir (pozitif yol, `unlinkSync` çağrısı doğrulanır); 2·rowsPerChunk(7)+3 satırlık yedek `[size, size, 3]` dilimlerinde yazılır, hiçbir satır kaybolmaz.
- **N-c (modül durumu sızıntısı):** `resetSt6SeedStateForTests()` dışa aktarıldı (bellek yedeği + bayrak sıfırlanır); tüm testler `beforeEach`'te çağırıyor. Başarılı bir `seed()` sonrası sıfırlamanın rollback'i no-op'a çevirdiğini gösteren test eklendi.

## Kanıt (ham çıktı)

### Kırmızı (düzeltme öncesi, yalnızca yeni N-a testi eklendikten sonra)

```
 × ... N-a — EEXIST on the backup write: seed refuses, and rollback of the same run touches nothing
 × ... N-a — backup already present before this run: seed refuses without writing, and rollback of this run is a warning-only exit
AssertionError: promise rejected "Error: [seed-st6-empty-e2e] restore count…" instead of resolving
Tests  2 failed | 6 passed (8)
```

Not: N-b'nin pozitif ve dilim testleri düzeltme öncesi de yeşildi. Mevcut kod doğruydu; eksik olan kanıttı (eski mock her zaman 0 döndürdüğü için pozitif yol hiç koşmuyordu). Yeni testler bu kanıtı ekler, ama "kırmızı" değil.

### Yeşil (düzeltme sonrası)

```
Test Files  2 passed (2)
Tests  30 passed (30)
```

Karışık sıra (N-c), seed 1–5:

```
--sequence.shuffle --sequence.seed=1 → Tests 30 passed (30)
--sequence.shuffle --sequence.seed=2 → Tests 30 passed (30)
--sequence.shuffle --sequence.seed=3 → Tests 30 passed (30)
--sequence.shuffle --sequence.seed=4 → Tests 30 passed (30)
--sequence.shuffle --sequence.seed=5 → Tests 30 passed (30)
```

Statik kontrol:
- `npx eslint` (4 değişen/ilgili dosya) → ESLINT_EXIT=0
- `pnpm typecheck` (`tsc --noEmit`) → hata çıktısı yok

Tam gate:

```
pnpm gate:isolated  (log: ~/ng320-gate-isolated.log, izole pgvector konteyneri)
 Test Files  613 passed | 2 skipped (615)
      Tests  8633 passed | 67 skipped (8700)
GATE_EXIT=0
```

## Değişen dosyalar

- `scripts/seed-st6-empty-e2e.ts`
- `tests/seed-st6-backup-restore.test.ts`
- `docs/agent-results/NG-320-be-gnd.md` (bu dosya)

Dokunulmadı: `tests/seed-st6-guards.test.ts`, `scripts/st6-seed-guard.ts`, paylaşılan `fabrika` DB, mevcut başka sonuç dosyaları.

## Riskler

- N-a'nın ayrı süreç varyantı (yukarıda) açık: yedek dosyası tek kopya, ama iki paralel koşu EEXIST alıp ayrı rollback çalıştırırsa dosya hâlâ geri yüklenip silinebilir. Çözüm ayrı bir sahiplik kaydı gerektirir (ör. seed'in yazdığı run-id'nin rollback'te doğrulanması); bu bir sonraki iş.
- Yerel `task/ng-320` dalında `46f305ea` (NG-358 crw-gnd docs commit'i, başka bir oturumun) var; uzakta yok. Bu dalı push edersem PR'a o commit de girer.

## Açık sorular

1. `46f305ea` (başka oturumun docs commit'i) `task/ng-320` üzerinde. Push ve PR'dan önce: (a) bu commit'i kendi dalına taşımak mı, (b) yoksa PR'a dahil etmek mi? Karar verilene kadar PR açmadım.
2. N-a'nın ayrı-süreç varyantı için sahiplik kaydını bu kartta mı yoksa ayrı bir kartta mı yapalım?

## Platform beyanı

- Koşulan platform: **Linux (WSL2 Ubuntu-24.04)**. Tüm testler ve `gate:isolated` burada koştu.
- Windows / mac: koşulmadı. Değişen kodda platforma bağlı yol yok: `path.join(__dirname, …)`, `fs` `wx` bayrağı ve saf string DB adları kullanılıyor.

## Sonraki adım

- Karar: push + draft PR (dev'e). Kart `review`'a alınmadan önce açık soru 1 yanıtlanmalı.
- Sonra `update_task` ile `merge_state=isolated`, DoD maddelerinin işaretlenmesi.
