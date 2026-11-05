# FO-384 — PR #279 yeniden inceleme bulguları (be-fb, 3. tur)

**hüküm:** BLOKE — kod ve testler tamam (E1, Y1, Y2, O1, O2, O3, O4 kapatıldı, 10 mutant kırmızıya döndü). Ama `bash scripts/gate-isolated.sh git push` KIRMIZI: `server-action-rbac-guard` (bu commit'in satır numarası pinini kaydırması) ve bir `where-guard` açıklaması (düzeltildi, yerelde doğrulandı). Push YAPILMADI. Uzak head `9756b2c0`, yerel head `db45fd74`.

**tip:** fix (scoring) + test

**platform:** mac (darwin). Windows/Linux koşulmadı.

## Ne yapıldı

| Bulgu | Düzeltme | Kanıt |
|---|---|---|
| E1 (engel) | Temizleme yolu `clearStoredG0(..., { keepUpdatedAt: true })` ile çağrılıyor; konusuz fırsatta `updatedAt` korunuyor | test "keeps its updatedAt"; mutant (keepUpdatedAt kaldırıldı) → kırmızı |
| Y1 | Liste `orderBy: id asc` + `id > afterId`; görev şeması `afterId` taşıyor | "resumes after the cursor in id order" (gerçek DB); "resumes after the afterId" (kuyruk). M6, M7, M14 → kırmızı |
| Y2 | PIC yolunda `set_config('lock_timeout', 2000, true)` (yalnız `rescoreOpportunityG0` çağrısına `lockTimeoutMs`); kilit hatası `failed` sayılır, alarma girer | "lock held by another" → kırmızı (ölçüm aşağıda) |
| O1 | Worker'da (`rethrowQueueFailure: true`) kuyruk yazımı hatası yeniden fırlatılır → kuyruk aynı cursor'dan yeniden dener | "worker rethrows a failed queue write" → kırmızı |
| O2 | Arşivlenen fırsat `archived` sayacında; `skipped`/alarm değil | "archived after the listing" → kırmızı |
| O3 | Koşullu yazım `where: { ...where, updatedAt: current.updatedAt }`; yarışta `G0ConcurrentEditError` | "edit made between" → kırmızı |
| O4 | Alarm `dedupeKey` (`g0-rescore-after-pic:<auditEventId>`); hata kodu loglanır, mesaj değil | "retried run adds to one alert" (M10) ve "logs the error code" (M12) → kırmızı |

Kapsam dışı (değiştirilmedi): Ö4 / rescore kapsamı (K-577267, patronda); Y3 yayın listesi, yetki değişikliği yok; formül, eşik 70, sert kurallar değişmedi.

## Kanıt (ham çıktı)

Hedefli testler (30 test: `g0-rescore-on-pic` + `g0-rescore-queue`):
```
Tests  30 passed (30)
```

Mutant koşusu (her biri uygulandı, `cmp` ile doğrulandı, koşuldu, dosya birebir geri yüklendi):
```
[E1]    Tests 1 failed | 27 skipped   AssertionError: expected 2026-11-05T17:34:42.608Z to deeply equal 2026-03-03T10:00:00.000Z
[Y1-M6] Tests 1 failed | 1 passed    AssertionError: expected [ …(3) ] to deeply equal [ …(2) ]
[Y1-M7] Tests 1 failed | 1 passed    AssertionError: expected [ …(2) ] to deeply equal [ …(2) ]
[M14]   Tests 1 failed | 1 skipped   AssertionError: expected [ 36.25, 36.25, … ] to deeply equal [ 1, 1, … ]
[M10]   Tests 1 failed | 27 skipped  AssertionError: expected [ …(2) ] to have a length of 1 but got 2
[M12]   Tests 1 failed | 27 skipped  AssertionError: expected 'G0 rescore failed for one opportunity…' to contain 'P2028'
[O3]    Tests 1 failed | 27 skipped  AssertionError: promise resolved "true" instead of rejecting
[O2]    Tests 1 failed | 27 skipped  AssertionError: expected { total: 2, rescored: 1, …(5) } to match object { total: 2, failed: +0, …(3) }
[O1]    Tests 1 failed | 27 skipped  AssertionError: promise resolved "undefined" instead of rejecting
[Y2]    Tests 1 failed | 27 skipped  AssertionError: expected 8013 to be less than 6000
```

Y2 ölçümü (kilit 12 sn tutulurken, bütçe 1000 ms): önce `elapsedMs 12014`, sonra `elapsedMs 2064`, özet `{total:2, rescored:0, cleared:0, failed:1, skipped:1, archived:0, queued:false}`.

Lint / tip: `pnpm lint` 0 hata (4 uyarı, hepsi dokunulmayan dosyalarda); `tsc --noEmit` çıkış 0.

Kapı (`bash scripts/gate-isolated.sh git push`, log: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/e603412d-2083-42e2-a6fa-df2d04cca7df/scratchpad/gate-push.log`):
```
Test Files  2 failed | 488 passed | 2 skipped (492)
Tests  2 failed | 6512 passed | 54 skipped (6568)
GATE_PUSH_EXIT=1
```
Kırmızılar:
1. `tests/server-action-rbac-guard.test.ts` — "G6: the role check moved after the write". Pinlenmiş beklenen liste, `updateTenantProfile` için `lib/scoring/g0-compute.ts:427/433/511/454/465` gibi SATIR NUMARALARI içerir (kaynak: `9756b2c0`). Bu commit satırları kaydırdı ve PIC yoluna yeni bir `client.$executeRaw` (`limitLockWait`, `SET lock_timeout`) ekledi. Güvenlik kapısının beklenen listesini ben değiştirmedim: rol kontrolü öncesi yazım listesi bir güvenlik kararıdır ve kullanıcının "#282 ile çözülecek" dediği çakışmayla aynı dosyaya dokunur.
2. `tests/where-guard-src.test.ts` — "every unguarded where under src/ is a known, explained one": `g0-compute.ts:455 ...where` ve `updatedAt: current.updatedAt`. Düzeltildi: iki gerekçeli `KNOWN` kaydı (id'ler `isPresentId` ile korunuyor, `updatedAt` aynı where ile okunmuş satırdan). Bu düzeltme `db45fd74` commit'inde; `where-guard-src` tek başına 3/3 yeşil. Kapı bu düzeltmeden ÖNCE koştu; tam kapı yeniden koşulmadı.

Kapı `pnpm test` adımında durdu. `i18n:check`, `rls:check`, `rls:bypass-check`, `rls:verify`, `db:rls-role`, `test:e2e` ve `alerts:check` ÇALIŞMADI. **E2E passed/skipped sayısı yok.**

## Değişen dosyalar

- `src/lib/scoring/g0-compute.ts` (`limitLockWait`, `G0ConcurrentEditError`, koşullu yazım, `lockTimeoutMs`)
- `src/lib/scoring/g0-rescore-tenant.ts` (archived, lock limit, keepUpdatedAt, rethrow, dedupe/errorCode)
- `src/lib/jobs/tasks/g0-rescore-tenant.ts` (`rethrowQueueFailure: true`)
- `tests/g0-rescore-on-pic.test.ts`, `tests/g0-rescore-queue.test.ts` (yeni testler, mock iletimi)
- `tests/where-guard-src.test.ts` (2 gerekçeli KNOWN kaydı)

Commit'ler (yerel, push YOK): `2495da68` (kod + testler), `db45fd74` (where-guard).

## Olay (kendi hatam, düzeltildi)

Mutant koşusunda iki `g0-rescore-tenant.ts` (scoring ve jobs/tasks) aynı taban adla yedeğe alındı; geri yükleme scoring dosyasını 24 satırlık job dosyasıyla ezdi. Aynı turda okunan içerikten 208 satır geri yazıldı, `wc -l`, `grep keepUpdatedAt` ve 30/30 test ile doğrulandı. Commit'lenmiş içerik etkilenmedi (`git show 2495da68`). Ders: `be-fb/mutasyon-yedek-ayni-taban-adi-ezer`.

## Riskler

- Y2: 10'dan fazla kilitli/başarısız fırsatta alarm yalnız ilk 10 id'yi taşır; sayılar tam.
- Gözlem (düşük): alarm `dedupeKey` ile birleşince meta ilk koşudan kalır (`failed` 1 kalırken `alertRepeatCount` 2). Test buna göre yazıldı, davranış düzeltilmedi.
- `where-guard` açıklamaları: scanner'ı susturmak için değil, kodun gerçekte korunduğu gerekçesiyle eklendi; reviewer kontrol edebilir.

## Açık sorular

1. `server-action-rbac-guard` pinini ne yapalım? Seçenekler: (a) satır numaralarını ve yeni `limitLockWait` yazımını pine ekle (benim önerim, yalnız satır kaymasıdır; ama bir güvenlik kapısı beklentisi olduğu için sizin/güvenlik sahibinin onayı gerekir); (b) #282 birleşince onun pinine göre hizala. Hangisi? Onay gelmeden push yapmıyorum.

## Sonraki adım

Onay gelince: pin güncellemesi → `bash scripts/gate-isolated.sh git push` tam koşu (e2e sayısıyla) → uzak head = yerel head doğrulaması → rapor güncellemesi. Board kartı `review`'a alınmadı (DoD tamamlanmadı).
