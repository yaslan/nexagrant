---
görev: NG-369 (TASK-MWXCU2GBF2PT2)
kod: NG-369
ajan: be-gnd
tip: bug
hüküm: TAMAM — Ö1, Ö3, Ö4 kapatıldı; Ö5 kod değişikliği gerektirmedi, birim testle sabitlendi; Ö2 kapsam dışı (dokunulmadı)
platform: Linux (WSL Ubuntu 24.04) koşuldu. mac/Windows koşulamadı: kod sunucu tarafı; Ö5 yolu yalnız dev depolama (`.dev-objects`), `rm force` ve `path` birleşimi işletim sistemine bağlı değil.
tarih: 2026-11-26
---

# NG-369 — zararlı nesne süpürmesi (NG-279 Ö1/Ö3/Ö4/Ö5)

Commit: `6392afef` (`task/ng-369`, `origin/dev` üzerine, yalnız 3 dosya). Draft PR: https://github.com/yaslan/nexagrant/pull/449

## Ne yapıldı

- **Ö1 (`src/lib/evidence-scan.ts`):** Süpürmenin INFECTED satır okuması `readInfectedPage` fonksiyonuna çıkarıldı. Okuma SQL'de `NOT EXISTS` ile `object_removed` olayında `objectDeleted = 'true'` olan satırları dışlıyor. Şema değişikliği yok. Gerekçe: silme her zaman son sonuçtur. `objectRemovalDecision` silinmiş son olaydan sonra yeni deneme yazmaz; yani "herhangi bir silindi olayı" ile "son olay silindi" aynı şey.
- **Ö3 (`tests/evidence-scan.live.test.ts`):** Stuck-rounds testine tur başına `repeats` (alarm `meta.repeatCount`) assert'i eklendi: beklenen `[[1],[1],[1],[1,1],[1,1],[1,1],[1,1]]`. M2 mutantı bu assert'i kırıyor.
- **Ö4 (`evidence-scan.ts` ~270):** Yorum davranışa göre düzeltildi: info alarmı açık hata alarmını kapatmaz; kapatma ayrı karar. Alarm kapatma mantığı eklenmedi.
- **Ö5 (`storage.ts` ~605):** Kod değişmedi. Kartın varsayımı doğrulanamadı: `rm(path, { force: true })` olmayan dosyada zaten başarılı (`true`) dönüyor. Yeni birim testi bunu sabitliyor (`tests/storage-dev-delete.test.ts`). `false` yalnız `devObjectPath`'in `null` döndüğü durumda (üretim veya güvenli olmayan anahtar) geliyor; bkz. açık sorular.
- **Ek test (Ö1 kanıtı):** Silinmiş bir satırın süpürme okumasına girmediğini ve silinmesi başarısız olan satırın girdiğini gösteren canlı test.

## Kanıt (ham çıktı özeti)

Temel çizgi (değişiklik öncesi, `evidence-scan.live` + `evidence-object-removal`):
```
Test Files  2 passed (2)
Tests  31 passed | 1 skipped (32)
```

Değişiklik sonrası (`evidence-scan.live` + `evidence-object-removal` + `storage-dev-delete`), `CLAMD_HOST=127.0.0.1 CLAMD_PORT=3311` (gerçek clamd, `CLAMD_CONF_AlertExceedsMax=yes`), DB `fabrika_test_ng369`:
```
Test Files  3 passed (3)
Tests  34 passed | 1 skipped (35)
```

M2 mutantı (`evidence-scan.ts` 348: `failuresNow === ...` → `failuresNow >= ...`):
```
- expected ... to deeply equal ...   (stuck-rounds repeats assert kırmızı, "Failed Tests 1")
M2 exit=1
RESTORED: identical to original
GREEN exit=0   (Tests 1 passed | 28 skipped, -t "keeps failing")
```

Ö1 bozma mutantı (`objectDeleted = 'true'` → `'never'`):
```
AssertionError: the deleted row is not read: expected [ ... ] to not include '<gone id>'
O1 mutant exit=1
RESTORED: identical to original
GREEN exit=0   (Tests 1 passed | 28 skipped, -t "NG-369")
```

Lint / typecheck:
```
lint exit=0        (eslint)
typecheck exit=0   (tsc --noEmit)
```

Pre-push gate (`git push`, hook `pnpm gate`, izole DB, `--no-verify` yok, `E2E_PORT=3101`):
```
$ pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && ... && pnpm test:e2e && pnpm alerts:check
  736 passed (27.8m)
  20 skipped
✅ Öksüz alarm yok ...
PUSH rc=0
remote task/ng-369 after: 6392afef3669504cbd12a04eb72fa1dce3d1ab18 refs/heads/task/ng-369
```
Not: gate içinde `CLAMD_HOST` tanımlı değil; `evidence-scan.live` orada `29 tests | 13 skipped` çalıştı. Gerçek-clamd kanıtı yukarıdaki manuel koşudan geliyor.

## Değişen dosyalar

- `src/lib/evidence-scan.ts` (Ö1 `readInfectedPage` + SQL; Ö4 yorum)
- `tests/evidence-scan.live.test.ts` (Ö3 `repeats` assert'i; Ö1 canlı testi; `alertsFor` `repeatCount` alanı)
- `tests/storage-dev-delete.test.ts` (yeni; Ö5 birim testi)
- `docs/agent-results/NG-369-be-gnd.md` (bu rapor)

Değişmeyen: `storage.ts` (Ö5 kod değişikliği yok), `system-alert.ts`, şema, Ö2 davranışı.

## Riskler

- Ö1 SQL'i `NOT EXISTS` ile `AuditEvent(tenantId, type, target)` üzerinde çalışıyor; `AuditEvent` için `target` indeksi yok (yalnız `[tenantId, createdAt]`). Çok sayıda INFECTED satır olan bir kiracıda bu sorgu yavaşlayabilir. Mevcut sayılar düşük (INFECTED nadir); yine de bir indeks ekleme kararı lidere/şemaya ait, bu kartta eklenmedi.
- Ö5 `false` yolu üretimde (R2 yok, `devObjectPath` null) silme sonsuza dek başarısız sayılır; bu, Ö2 ile aynı konu.

## Açık sorular

1. **Ö5 kapsamı:** Kart "olmayan dosya başarılı" diyordu; bu zaten böyle. Asıl sonsuz deneme riski `devObjectPath`'in `null` döndüğü durumda (üretim veya güvensiz anahtar). Bu yolda `true` mu yoksa `false` mu olmalı? Üretimde nesnenin var olup olmadığı bilinemez, bu yüzden `false` bırakıldı. Karar lidere ait.
2. **Ö4:** Açık hata alarmını (`info` başarılı silme sonrası) kapatma davranışı istenip istenmediği ayrı bir karar; eklenmedi.
3. **Ö2 (deneme üst sınırı):** Kapsam dışı; lider ayrıca soracak.

## Sonraki adım

- Lider: PR #449 (draft) incelemesi; Ö5 üretim yolu ve Ö4 kapatma kararı.
- Ö2 ürün kararı bekleniyor.
