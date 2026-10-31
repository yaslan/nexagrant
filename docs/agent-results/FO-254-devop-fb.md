---
task: FO-254 (TASK-MVV72UUJXVN1) — Gate kararsızlığı: pre-push gate yük altında rastgele kırmızı
agent: devop-fb
durum: tamamlandı (kod değişikliği gerekmedi; açık kalan doğrulama: yük altında tekrar)
hüküm: Kapı kararlı: origin/dev üzerinde 2 ardışık temiz koşum (GATE_EXIT=0). Rastgele kırmızıların kök nedenleri FO-261 (PR #221, zamanlama bütçeleri) ve FO-256 (PR #222, DB connect timeout) ile kapanıyor; bunlar henüz dev'de değil. Kapı gevşetilmedi.
tip: bug
platform: mac (yerel; docker + gate-isolated). Linux/Windows koşulamadı — neden: gate-isolated bash + yerel pgvector konteyneri gerektirir; Windows yalnız WSL/Git Bash (docs/GATE.md: denenmedi).
---

# FO-254 · Gate kararsızlığı — sonuç

## Ne yapıldı (özet)

1. Temiz `origin/dev` üzerinde yeni worktree: `FONBRIDGE-worktrees/devop-fb-fo254` (dal `devop-fb/fo254-gate-stability`). Mevcut çalışma dalı (`feat/partner-search-interreg`) gate betiklerini içermiyordu; bu yüzden bu dal kullanılmadı.
2. `pnpm install --frozen-lockfile` → rc=0.
3. Kapı koşumu iki kez, sıralı, `bash scripts/gate-isolated.sh` (kart `git push` yerine kapının kendisini koşturdu; push kancası aynı kapıyı kullanır):
   - Koşum 1: 20:47:39Z → 21:03:36Z, **GATE_EXIT=0**
   - Koşum 2: 21:03:36Z+ → 21:25:12Z, **GATE_EXIT=0** (kilit 10 dk 15 sn beklendi; `be-fb-fo274` worktree'si `gate:core` çalıştırıyordu)
4. `docs/GATE.md`'ye kilit beklerken foreground zaman aşımı notu eklendi (adım 5).

## Kanıt (ham çıktı, koşum 2 — kopya: `scratchpad/gate/run2.log`)

```
✅ Kilit alındı (10 dk 15 sn beklendi).
 Test Files  464 passed | 2 skipped (466)
      Tests  6044 passed | 54 skipped (6098)
  463 passed (9.2m)
2026-10-31T21:25:12Z [gate-isolated] ok: gate green on an isolated database
2026-10-31T21:25:12Z [gate-isolated] removed container fabrika-gate-20261031210347-2508
GATE_EXIT=0
```

Koşum 1 (kopya: `scratchpad/gate/run1.log`) aynı özet: `Test Files 464 passed | 2 skipped`, `Tests 6044 passed | 54 skipped`, e2e `463 passed (10.0m)`, `GATE_EXIT=0`.

Gürültü, hata değil: e2e sırasında `[WebServer] ⨯ Error: aborted` / `destination stream errored` satırları ve `[alerts-sweep] failed during scan` satırları görüldü; ikisi de beklenen test senaryolarının çıktısı, kapı bunları kırmızı saymadı.

## Kök neden ayrımı (kart adım 1–2)

Kart, üç denemedeki kırmızıları listeliyor. Bu koşumda dev üzerinde HİÇBİR kırmızı çıkmadı; ayrım, önceki raporlara ve açık PR'lara dayanıyor:

| Kırmızı (kart) | Sınıf | Durum |
|---|---|---|
| `Test timed out 30000ms`, `m17-interreg-extract` `expected 5949 < 3000`, `rag-pdf-worker-isolation` (koşu 1–2) | **yük** (zamanlama eşiği) | FO-261 / PR #221 — `TEST_TIMING_SLACK` ölçeklemesi, `gate-isolated.sh` load1'e göre slack hesaplıyor. Henüz dev'de değil. Yeniden yazılmadı. |
| `expert-prereg.live` founder number race | **ortam** (paylaşılan pool'un 1 sn connect timeout'u yük altında) | FO-256 / PR #222 — `db.ts` connect timeout. Henüz dev'de değil. Ek olarak `70007c62` (15 sn ayrı client) yalnız `origin/devop-fb/fo260-nexagrant-deploy` üzerinde; dev'de değil, bu işte alınmadı (çakışma riski, FO-260 bloke). |
| `expert-prereg` yarış mantığı (sayı boşluğu/çift sayı) | **gerçek yarış değil** (bulgu yok) | Test `holdFounderCounter` + `acquireExpertPreRegLiveLock` ile seri koşuyor (FO-45). Bu koşumlarda sayı yarışı görülmedi. |

Sonuç: “gerçek yarış” sınıfında açık bir hata bulunmadı. Yük ve ortam sınıfları iki açık PR ile kapanıyor.

## Neden test/eşik değiştirilmedi

Dev üzerinde kırmızı üretilemediği için bir eşiği gevşetmenin gerekçesi yok; #221 ve #222 zaten bu işi kapsıyor (kart: "Onların kapsadığını tekrar düzeltme"). Yük altında tekrar, PR'lar birleşince ya da yük koşusu ayrıca yapılınca doğrulanabilir (açık madde).

## Değişen dosyalar

- `docs/GATE.md` — "Kilit beklerken foreground zaman aşımı (FO-254)" bölümü (kapı davranışı değişmedi).
- `docs/agent-results/FO-254-devop-fb.md` (bu rapor).
- `docs/agent-results/FO-279-devop-fb-3.md` — FO-279 ek raporu. `-2` adı zaten var olan (commit `5b7585ef`, CI faturalandırma) bir rapora ait olduğu için `-3` açıldı; pre-commit kancası var olan kanıt dosyasının üzerine yazmayı reddeder.
- Test dosyası ve `scripts/gate-*` değişmedi.

## Riskler

- Kapı bugün yeşil; ama kart "rastgele" diyor ve yük altında tekrar yapılmadı. Yük altında kararlılık #221/#222 birleşmeden kanıtlanmış değil.
- Kilit kuyruğu: koşum 2 10 dk bekledi. Kuyrukta olduğu sürece push da bekler.
- Ortamda `fabrika-gate-*` adlı 5 konteyner, başka koşumlardan kalmış görünüyor (`docker ps`). Silinmedi; sahipleri belli değil.

## Açık sorular

1. #221 ve #222 ne zaman dev'e alınacak? Kart açısından kapı kararlılığı onlara bağlı.
2. Yük altında tekrar (3/3) istiyor musunuz? Yük yaratmak diğer ajanların gate'ini etkileyebilir; onay isterim.

## Sonraki adım

1. #221 ve #222 birleşince aynı worktree'de (`origin/dev` yenilenmiş) gate'i bir kez daha koş ve kilit beklemesini kaydet.
2. `docs/GATE.md` notunu commit'le ve draft PR `--base dev` aç (istenirse).

## Platform beyanı

mac (yerel). Linux/Windows koşulamadı: gate-isolated bash + docker pgvector konteyneri gerektiriyor; Windows için docs/GATE.md "denenmedi" diyor.
