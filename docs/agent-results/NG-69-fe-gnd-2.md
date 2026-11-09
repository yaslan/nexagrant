# NG-69 — G0 rozeti, red gerekçesi, gerçek payda ve G1+ kutusu (fe-gnd)

**Hüküm:** Bitti: G0 rozeti reddedilen fırsatta yeşil değil; detay kutusu red gerekçesini ve gerçek paydayı (75) iki dilde gösteriyor; G1 ve sonrasında kutu kayıtlı son G0 kararını tarihiyle gösteriyor. İzole gate ve push yeşil.

**Platform:** macOS (darwin) üzerinde doğrulandı. Windows ve Linux koşulmadı: değişiklik platforma bağlı bir yola dokunmuyor (React ekranı, dosya yolu, süreç veya kısayol yok), ama fiilen koşturulmadı.

Dal: `fe-gnd/ng69-g0-rozet`, worktree `/Users/macbook/alan/FONBRIDGE-worktrees/fe-gnd-ng69`.
Commit'ler: `7feb7bb9` (önceki oturum: rozet, red gerekçesi, gerçek payda) ve `32449593` (bu oturum: G1+ kutusu, İngilizce e2e). Push sonrası yerel baş = `origin/fe-gnd/ng69-g0-rozet` = `32449593`.

## Ne yapıldı

1. **Pano rozeti** (`board.tsx`): rozet rengi son G0 kararından (`g0BoxMode` / `latestG0PassedByOpportunity`), sayıdan değil. Reddedilen fırsat yeşil değil; kararı olmayan da nötr.
2. **Detay kutusu, G0 aşamasında** (`client.tsx`): "/100" yalnız geçmişe dayalı ölçütler hariç tutulmadığında yazılır; geçmişsiz ortakta gerçek payda (75) ve açıklama gösterilir. Red gerekçesi (`pipeline-g0-refusal`) görünür.
3. **Detay kutusu, G1 ve sonrası** (bu oturum): canlı hesap ve "GEÇME" yerine kayıtlı son G0 kararı ve tarihi (`pipeline-g0-saved`, `pipeline-g0-saved-date`). Kayıt yoksa açık boş durum (`pipeline-g0-saved-none`).
4. **Çeviriler**: `messages/tr.json` ve `messages/en.json` iki dilde; tarih yerel biçimde (`toLocaleDateString(locale)`).
5. **Puan formülü, kapı kararı, `g0-compute.ts`, `g0-features.ts`, `evaluate.ts`: değişmedi.**

## Kanıt (ham çıktı)

### Birim testi, mutant
`tests/pipeline-g0-saved-box.test.ts` (yeni, `g0BoxMode`):
- Önce: 4 test kırmızı (`g0BoxMode is not a function`).
- Sonra: 4/4 yeşil.
- Mutant (kutuyu her zaman "live" döndürme): `Tests 3 failed | 1 passed (4)`; geri alınınca `4 passed`.

### Tip, lint, çeviri
- `tsc --noEmit`: exit 0 (`tests/module-entry-points.test.tsx` için `savedG0={null}` eklendi).
- `eslint` değişen dosyalarda: exit 0.
- `pnpm i18n:check`: "✅ i18n check passed: both catalogs agree".

### Tam birim test süiti (yerel, DB yok)
`31 failed | 440 passed | 38 skipped`. Hatalar `MissingDatabaseUrlError: DATABASE_URL is not set` (veya veritabanı yok) yüzünden; bu dalın dışındaki DB'li testler. İzole gate bunları gerçek DB'de koşturdu (aşağıda).

### İzole gate + push
`bash scripts/gate-isolated.sh git push -u origin fe-gnd/ng69-g0-rozet` → exit 0. E2E özet: `597 passed (15.4m)`. Log: `/private/tmp/claude-501/-Users-macbook-alan-NexaGrant/77805401-a991-442a-8947-d99c01549d3e/scratchpad/ng69-gate-push.log`.

### İngilizce gerçek tıklama (`tests/e2e/g0-box-en.spec.ts`, `/en/` üzerinde)
- **A. Geçmişsiz ortak, açık koltuk, G0 reddi** (gerçek "evaluate" tıklaması):
  - `pipeline-g0-value` = `84` (`/100` yok).
  - `pipeline-g0-basis` = "Partner with no institutional history: history-based criteria were left out. The score is the weighted average of the criteria that were measured (weight total 75, not 100)."
  - `pipeline-g0-refusal` = "Not passed: A partner with no history needs at least one filled seat (candidate, invited or confirmed)."
  - Pano rozeti: `data-g0-tone="amber"`, başlık "Latest G0 decision: NOT PASSED. The score is a pre-assessment only.", metin `⭐ 84`.
- **B. G1, kayıtlı G0 reddi (5 Kasım 2026)**: `pipeline-g0-saved` = "Latest G0 decision: NOT PASSED", `pipeline-g0-saved-date` = "Decided on Nov 05, 2026 · saved decision, not a live calculation"; `pipeline-g0-value` yok (canlı "GEÇME" yok).
- **C. G1, kayıt yok**: `pipeline-g0-saved-none` = "No saved G0 decision for this opportunity".

Ekran görüntüleri ve DOM çıktıları: `docs/agent-results/NG-69-screenshots/` (`01-detail-refused-partner.png` + `-box.html`, `02-board-refused-badge.png` + `.html`, `03-detail-g1-saved-refused.png` + `-box.html`, `04-detail-g1-no-decision.png` + `-box.html`).

## Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/client.tsx`, `page.tsx`
- `src/lib/gates/latest-g0-decision.ts` (`g0BoxMode`, `SavedG0Decision`)
- `messages/tr.json`, `messages/en.json`
- `tests/pipeline-g0-saved-box.test.ts` (yeni), `tests/e2e/g0-box-en.spec.ts` (yeni), `tests/module-entry-points.test.tsx`
- `docs/agent-results/NG-69-fe-gnd-2.md`, `docs/agent-results/NG-69-screenshots/` (bu rapor ve kanıt)

## Riskler
- Pano rozeti ve detay kutusu, kararı olmayan eski fırsatlarda nötr/boş gösteriliyor. Eski kayıtlar için bir G0 kararı yoksa kullanıcı "kayıt yok" görür; bu bir veri boşluğu, yanlış bir "geçti" değil.
- Tam birim süiti DB olmadan 31 dosya kırmızı; bunlar bu dalın değişikliğinden değil (DB gerektiriyor). İzole gate'te yeşil.

## Açık sorular
- Yok. Ürün kararı K-579051 (G1+ kutusu kayıtlı son G0 kararını gösterir) uygulandı; kurala dokunulmadı.

## Sonraki adım
- Dal push'landı; PR draft kalır, birleştirme yapılmadı. Kart DoD 2 kanıtla işaretlenebilir.
