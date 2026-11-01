# TASK-MUPUHPTNIULIX — FB ENTEGRASYON 4 (qae-fb)

**Hüküm: ONAY — fe-fb/rebrand-leftovers dev'e alındı, kapılar temiz.**

## 1. Ne yapıldı
- `../FONBRIDGE-wt-qaefb-merge4` worktree'si dev'den açıldı (ana checkout se-fb/p6-dpa-signable'da, dokunulmadı).
- `git merge --no-ff fe-fb/rebrand-leftovers` — çakışmasız (11 dosya, +48/-10; fe-fb raporu dahil).
- crw2-fb ONAY raporu ana checkout'tan dev'e kopyalandı.
- Push EDİLMEDİ (devop-fb'nin işi).

## 2. Kanıt
- `npx tsc --noEmit` → çıktı boş, exit=0
- `npm test` (Postgres :5433 up): `Test Files 305 passed | 6 skipped (311)` · `Tests 4105 passed | 119 skipped (4224)`
- `git merge-base --is-ancestor 8b50bb0b dev` → 0
- Merge commit: 1ceb40585b4cb5615f8275cf3470d53c449a0650 (dev, öncesi 6397e4e7)

## 3. Değişen dosyalar
.env.example, scripts/beta-onboarding.ts, settings/privacy/client.tsx, admin/layout.tsx, [locale]/page.tsx, api/gdpr/export, api/user/export-data, api/user/export route.ts, UserMenu.tsx, lib/beta/constants.ts, docs/agent-results/TASK-MUPUHPTNIULIX-{fe-fb,crw2-fb,qae-fb}.md

## 4. Riskler
- 6 test dosyası / 119 test skip: önceden var olan skip'ler; bu merge'den kaynaklandığına dair işaret yok (merge öncesi dev ile karşılaştırılmadı).

## 5. Açık sorular
Yok.

## 6. Sonraki adım
devop-fb dev'i origin'e push eder.

**Platform:** mac (Darwin) üzerinde doğrulandı. Değişiklikler metin/URL sabitleri; platforma bağlı kod yolu yok.
