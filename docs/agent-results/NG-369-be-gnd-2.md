---
görev: NG-369
kod: NG-369#fix449
ajan: be-gnd
tip: fix (qa-gnd düzeltme turu, PR #449)
hüküm: GEÇTİ — B1, Ö-a, Ö-b, MT/MB/M2 mutantları kırmızı→yeşil, EXPLAIN hedefin altında, gate PUSH_EXIT=0
platform: Linux/WSL, gerçek clamd (127.0.0.1:3313)
tarih: 2026-11-26
---

# NG-369 — qa-gnd düzeltme turu (PR #449)

## Ne yapıldı
- **B1:** `readInfectedPage` (src/lib/evidence-scan.ts) içindeki `NOT EXISTS` süpürme sorgusu, kiracı kapsamlı `NOT IN` sorgusuna çevrildi. `a."tenantId" = ${tenantId}`, `a."target" IS NOT NULL`, `a."data"->'objectDeleted' = 'true'::jsonb`. Şema ve indeks değişmedi.
- **Ö-a:** Aynı satırdaki başka kiracının ya da paylaşımlı (tenantId NULL) silme olayının sayfayı gizlemediği canlı test eklendi; hem RLS istemcisi hem sahip (BYPASSRLS) istemcisi ile.
- **Ö-b:** JSON string `"true"` değerinin SQL ve JS kararında aynı işlendiği canlı test eklendi (`{ sqlReads: true, jsDue: true }`).
- `attemptOf` test için dışa aktarıldı.
- Commit: `c60a6a649` (task/ng-369, PR #449 dalı; PR taslak kalır, birleştirilmedi).

## Kanıt
- Lint: `lint=0`; typecheck: `typecheck=0` (`ng369b-lint.log`, `ng369b-tc.log`).
- Yeşil koşu (gerçek clamd): `tests/evidence-scan.live.test.ts (31 tests | 1 skipped)`, `Tests 32 passed | 1 skipped (33)`, `EXIT=0` (`ng369b-green.log`).
- Mutantlar (her biri kırmızı, sonra kaynak `GOOD` kopyasından geri alındı, `cmp` ile aynı):
  - MT (NOT IN alt sorgusundan kiracı koşulu çıkarıldı): Ö-a kırmızı — `AssertionError: owner client (BYPASSRLS, only the SQL predicate scopes it)…`, `Tests 1 failed | 29 passed | 1 skipped`, `EXIT=1`.
  - MB (`->'objectDeleted' = 'true'::jsonb` yerine `->>'objectDeleted'`): Ö-b kırmızı — `expected { sqlReads: false, jsDue: true } to deeply equal { sqlReads: true, jsDue: true }`, `EXIT=1`.
  - M2 (uyarı koşulunda `===` → `>=`): NG-279 "the delete keeps failing…" kırmızı, `EXIT=1`.
- EXPLAIN ANALYZE (20 000 INFECTED, 19 000 silinmiş olay, sentetik veri):
  - Yeni (NOT IN) 1. sayfa: **Execution Time 27.749 ms** (hedef < 100 ms).
  - Eski (NOT EXISTS) 1. sayfa: 10 875 ms (Nested Loop Anti Join, 184 M filtre satırı).
  - Temizlik sonrası: `0 evidence, 0 audit left` (`ng369b-explain-run.log`, `ng369b-cleanup.log`).
- Push: `E2E_PORT=3169 git push origin HEAD:refs/heads/task/ng-369` → `PUSH_EXIT=0`. Pre-push gate `tam gate` (kod dokundu: evidence-scan.ts) çalıştı; e2e `737 passed`.
- `git ls-remote origin refs/heads/task/ng-369` → `c60a6a6498ac567dcb09ab8d84582524e3a8569a`, yerel HEAD ile aynı.

## Değişen dosyalar
- `src/lib/evidence-scan.ts` (12 satır: sorgu + `export function attemptOf`)
- `tests/evidence-scan.live.test.ts` (+39 satır: Ö-a, Ö-b)
- `docs/agent-results/NG-369-be-gnd-2.md` (bu dosya)

## Riskler
- `NOT IN` alt sorgusu, süpürülen tenant için AuditEvent satır sayısı çok büyürse yine büyür; ölçüm 20k/19k ile yapıldı, daha büyük hacim ölçülmedi.
- `a."target" IS NOT NULL` koşulu NULL-tuzağını önlüyor; bu koşul kaldırılırsa `NOT IN` boş sonuç dönebilir (tamamen sessiz hata).
- JSON `"true"` string'i artık silme sayılmıyor; eski yazılmış ve string olarak kaydedilmiş olaylar varsa onları yeniden süpürecek (güvenli yön: fazla deneme, silme değil).

## Açık sorular
- Yok.

## Sonraki adım
- qa-gnd yeniden incelemesi; PR #449 taslak kalır, birleştirme yok.
