---
hüküm: Kısmen bitti: kapı ve kanca düzeltildi ve gerçek koşuyla kanıtlandı (kırmızı kapı 1, kırmızı push reddedildi, yeşil tam izole kapı 0, origin push kancadan geçti); draft PR #414 açık, ancak `gh pr checks` "no checks reported" dönüyor, CI yeşil doğrulanamadı.
tip: hata
platform: Windows 11 + WSL2 Ubuntu-24.04
---

# NG-331 — Test kapısı gerçek çıkış kodu, pre-push kapıyı zorunlu koşturuyor

## Ne yapıldı
1. **Sabit 0'ın kök nedenleri** (koddan değil kullanım/kurulumdan):
   - (a) Boru maskesi: `sh -c "exit 3" | tee log; echo $?` → `0`; `set -o pipefail` ile `3`. Kapı kodunda sabit `GATE_EXIT:0` YOK (`git grep` ile doğrulandı).
   - (b) `core.hooksPath` ayarlı değildi: pre-push hiç çalışmıyordu (`git config --get core.hooksPath` → boş).
   - (c) `githooks/pre-push` git'te `100644` idi; git kancayı `hint: The 'githooks/pre-push' hook was ignored because it's not set as executable` ile yok sayıp push'u kapısız geçirdi (ilk kırmızı push denemesinde görüldü, `PUSH_EXIT=0`).
   - (d) Önbellek isabeti (FO-339) tam kapıyı koşmadan `0` döner: kasıtlı, belgelendi.
2. `scripts/gate-lock.mjs`: sinyalle ölüm 1 yerine `128+n` döner; alt sürecin kodu aynen yayılır.
3. `githooks/pre-push`: kırmızıda açık `KAPI KIRMIZI (çıkış n)` ve aynı kodla çıkış; mod 100755.
4. `pnpm hooks:install` (ortak `.git/config` → `core.hooksPath=githooks`).
5. Testler: `tests/gate-exit-code.test.ts` (yeni, 4 test), `tests/pre-push-hook.test.ts` (+2 test).
6. Docs: `docs/GATE.md` (çıkış kodu ve kanca bölümü), `CLAUDE.md` (Komutlar notu).

Commit'ler (dal `task/ng-331`, worktree `~/alan/wt/ng-331`, taban `origin/dev`):
- `00798d8d` NG-331: gate exit codes from the real child, pre-push refuses a red gate
- `36438038` NG-331: pre-push hook must be executable, or git ignores it

## Kanıt (ham çıktı)

**Boru maskesi (kök neden a):**
```
== A: pipe to tee (no pipefail)
GATE_EXIT=0
== A2: pipefail
GATE_EXIT=3
== B: gate-lock red child
rc=3
== C: gate-lock signal child
rc=1        <- düzeltme öncesi; düzeltme sonrası 137
== E: fake red pnpm gate:core via gate-lock
rc=4
```

**Kırmızı izole kapı (bilerek kırmızı: `tests/zz-ng331-red.ts` parse hatası, geçici, commit'te yok):**
```
/home/aslan/alan/wt/ng-331/tests/zz-ng331-red.ts
  1:30  error  Parsing error: Expression expected
✖ 1 problem (1 error, 0 warnings)
[ELIFECYCLE] Command failed with exit code 1.
GATE_EXIT=1
```
Log: `~/alan/wt/ng331-logs/red-isolated.log`.

**Kırmızı push, kanca (düzeltilmiş kanca, yerel bare remote):**
```
pre-push: KAPI KIRMIZI (çıkış 1); push durduruldu. Ayrıntı yukarıda; --no-verify kullanma.
error: failed to push some refs to '/tmp/tmp.TItJyCjKuB/remote2.git'
PUSH_EXIT=1
```
Log: `~/alan/wt/ng331-logs/hook-red-push-2.log`. (Düzeltme öncesi deneme: `hint: ... ignored because it's not set as executable`, `PUSH_EXIT=0` — kanca yok sayıldı; log `hook-red-push.log`.)

**Yeşil tam izole kapı (`bash scripts/gate-isolated.sh`):**
```
  722 passed (25.4m)
açık SystemAlert satırı : 7 ... Öksüz alarm yok
önbellek kaydı yazıldı: fc70dc5335d5b554d4afd3da52554fcaf283901a
[gate-isolated] ok: gate green on an isolated database
GATE_EXIT=0
```
(13 e2e atlandı; `[WebServer] Error: aborted / ECONNRESET` satırları e2e istemci iptalleri, GATE.md'de bilinen gürültü.) Log: `~/alan/wt/ng331-logs/green-isolated.log`.

**Yeşil origin push, kanca izole kapıdan geçti:**
```
önbellek: fc70dc5335d5b554d4afd3da52554fcaf283901a (aynı tree + pnpm-lock için yeşil kayıt; tam gate atlandı)
 * [new branch]        task/ng-331 -> task/ng-331
PUSH_EXIT=0
```

**Mutant (düzeltme geri alınınca testler kırmızı):**
```
✓ runs `pnpm gate` without the git variables ...
× kırmızı kapıda (pnpm gate → 4) push durur ve çıkış kodu 4 olur
✓ yeşil kapıda (pnpm gate → 0) hook 0 ile çıkar
✓ yeşil alt süreç → 0
✓ kırmızı alt süreç → gerçek kodu yayar (3 → 3, sabit 0 değil)
× sinyalle ölen alt süreç → 128+n (SIGKILL → 137), 1 değil
AssertionError: expected 1 to be 137
AssertionError: expected '' to contain 'KAPI KIRMIZI'
Tests  2 failed | 5 passed (7)
```
Düzeltme geri uygulandıktan sonra 7/7 yeşil (`gate-exit-code` 4, `pre-push-hook` 3). Ayrıca `gate-lock` (13), `gate-cache` (27), `gate-isolated-e2e-port` (2) yeşil.

**Draft PR:** https://github.com/yaslan/nexagrant/pull/414 (taban `dev`, draft, birleştirilmedi).

**`gh pr checks 414`:** `no checks reported on the 'task/ng-331' branch` — CI koşusu görünmüyor. Yeşil doğrulanamadı.

## Değişen dosyalar
- `scripts/gate-lock.mjs`
- `githooks/pre-push` (mod 100755)
- `tests/gate-exit-code.test.ts` (yeni)
- `tests/pre-push-hook.test.ts`
- `docs/GATE.md`, `CLAUDE.md`
- `docs/agent-results/NG-331-dev-gnd.md` (bu rapor)

## Riskler
- `pnpm hooks:install` ortak `.git/config`'i değiştirir: aynı repodaki TÜM worktree'lerin push'u artık tam kapıdan geçer (bekleme ve ~25 dk süre). Bu, kart talebinin gereğidir; geri alma: `git config --unset core.hooksPath`.
- Kanca kurulu makinede `.env` ya da `DATABASE_URL` yoksa push reddedilir (tasarım gereği).
- Önbellek isabeti `0` döner (kasıtlı); "gerçek koşu" için `FONBRIDGE_GATE_NO_CACHE=1`.
- Commit yazarı: `DEV-NG (dev-gnd)` (WSL'de git kimliği tanımlı değildi; kişisel kimlik kullanılmadı).
- CI: `gh pr checks` boş; GitHub Actions tetiklenmemiş ya da kullanım limitinde olabilir (önceki raporlarda CI limiti geçiyor). Doğrulanamadı.

## Açık sorular
- CI neden tetiklenmedi? Actions kullanım limiti ya da iş akışı `dev` tabanlı PR'a bağlı mı? Kontrol edilmeli.

## Sonraki adım
1. CI koşusunun nedenini doğrula; yeşil değilse PR'ı hazır hâle getirme.
2. Sonuç dosyasını commit'leyip push et (kanca tam kapıyı yeniden koşar).

Platform: Windows 11 + WSL2 Ubuntu-24.04. macOS'ta koşulmadı; betikler POSIX sh/bash ve mac'te de aynı kod yolu (ayrıca `pgrep`/`ps` farkı için `gate-isolated.sh` zaten dinliyor).
