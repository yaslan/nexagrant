---
hüküm: Kısmen bitti: kapı ve kanca kodu düzeltildi ve kanıtlandı (testler, mutant, kırmızı kapı ≠0); ancak bu rapor commit'inin push'u tam kapıdan geçemedi: 3 e2e testi (posta akışı) paylaşımlı mailpit'e ulaşamadığı için kırmızı. Draft PR #414'ün önceki head'i (7874fcf3) CI'da yeşil; yeni head yayımlanmadı. Engel ve karar için "Açık sorular" bölümüne bakın.
tip: hata
platform: Windows 11 + WSL2 Ubuntu-24.04 (mac/Linux'ta koşulmadı)
---

# NG-331 — Test kapısı gerçek çıkış kodu, pre-push kapıyı zorunlu koşturuyor

## Ne yapıldı
1. **Sabit 0'ın kök nedenleri** (koddan değil kullanım/kurulumdan):
   - (a) Boru maskesi: `sh -c "exit 3" | tee log; echo $?` → `0`; `set -o pipefail` ile `3`. Kapı kodunda sabit `GATE_EXIT:0` yok (`git grep` ile doğrulandı).
   - (b) `core.hooksPath` ayarlı değildi: pre-push hiç çalışmıyordu. Düzeltme: `pnpm hooks:install` → `core.hooksPath=githooks`.
   - (c) `githooks/pre-push` git'te `100644` idi; git kancayı `hint: ... ignored because it's not set as executable` ile yok sayıyordu. Düzeltme commit'i `36438038`; bu checkout'ta şu an `755` (doğrulandı).
   - (d) Önbellek isabeti (FO-339) tam kapıyı koşmadan `0` döner: kasıtlı, GATE.md'de belgeli.
2. `scripts/gate-lock.mjs`: çocuk sürecin kodunu aynen yayar; sinyalle ölümde `128+n`.
3. `githooks/pre-push`: kırmızıda `KAPI KIRMIZI (çıkış n)` yazar ve aynı kodla çıkar; mod 100755.
4. Testler: `tests/gate-exit-code.test.ts` (yeni, 4 test), `tests/pre-push-hook.test.ts` (+2 test).
5. Docs: `docs/GATE.md` (çıkış kodu ve kanca bölümü), `CLAUDE.md` (Komutlar notu).

Commit'ler (dal `task/ng-331`, worktree `~/alan/wt/ng-331`, taban `origin/dev`):
- `00798d8d` NG-331: gate exit codes from the real child, pre-push refuses a red gate
- `36438038` NG-331: pre-push hook must be executable, or git ignores it
- `7874fcf3` NG-331: result report (önceki koşu)

## Kanıt (ham çıktı)

**Bu koşuda yeniden doğrulananlar**

Testler (düzeltme uygulanmış hâlde, `wt/ng-331`, `pnpm exec vitest run tests/gate-exit-code.test.ts tests/pre-push-hook.test.ts`):
```
 ✓ tests/pre-push-hook.test.ts (3 tests)
 ✓ tests/gate-exit-code.test.ts (4 tests)
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

Mutant (düzeltme geri alındı: `scripts/gate-lock.mjs` ve `githooks/pre-push` = `48760af0` sürümü; sonra `git checkout --` ile HEAD'e dönüldü, ağaç temiz):
```
✓ runs `pnpm gate` without the git variables ...
× kırmızı kapıda (pnpm gate → 4) push durur ve çıkış kodu 4 olur
✓ yeşil kapıda (pnpm gate → 0) hook 0 ile çıkar
✓ yeşil alt süreç → 0
✓ kırmızı alt süreç → gerçek kodu yayar (3 → 3, sabit 0 değil)
× sinyalle ölen alt süreç → 128+n (SIGKILL → 137), 1 değil
✓ kırmızı kapıdan sonra kilit bırakılır (sonraki koşu bekletilmez)
Failed Tests 2 | Passed 5 (7)
```
Log: `~/alan/wt/ng331-logs/mutant.log`.

Vitest çıkış kodu (kırmızı, kasıtlı `expect(1).toBe(2)` geçici dosya, sonra silindi): sıfır olmayan çıkış doğrulandı (`if pnpm exec vitest run …; then … else FAIL_CORRECT`).

CI (draft PR #414, `gh pr checks` WSL'den):
```
build-and-test  pass  6m47s
cordis-worker   pass  32s
e2e (1)         pass  14m41s
e2e (2)         pass  18m7s
e2e (3)         pass  22m49s
e2e-gate        pass  4s
```
Run `45077348086`, `headSha=7874fcf3…`, `conclusion=success`. Önceki taslaktaki "no checks reported" durumu artık yok.

Kanca diskte çalıştırılabilir: `stat` → `755 …/githooks/pre-push` (wt ve FONBRIDGE-dev'de).

**Önceki koşudan (ham log dosyaları yerinde, `~/alan/wt/ng331-logs/`)**

Kırmızı izole kapı (`tests/zz-ng331-red.ts` parse hatası, geçici, commit'te yok) — `red-isolated.log`:
```
1:30  error  Parsing error: Expression expected
✖ 1 problem (1 error, 0 warnings)
[ELIFECYCLE] Command failed with exit code 1.
```

Kırmızı push, kanca (düzeltilmiş kanca, yerel bare remote, origin'e dokunulmadı) — `hook-red-push-2.log`:
```
pre-push: KAPI KIRMIZI (çıkış 1); push durduruldu. Ayrıntı yukarıda; --no-verify kullanma.
error: failed to push some refs to '…/remote2.git'
```
Düzeltme öncesi (`hook-red-push.log`): `hint: The 'githooks/pre-push' hook was ignored because it's not set as executable` — kanca yok sayıldı, push kapısız geçti.

Yeşil tam izole kapı (`bash scripts/gate-isolated.sh`) — `green-isolated.log`:
```
722 passed (25.4m)
[gate-isolated] ok: gate green on an isolated database
```
13 e2e atlandı; `[WebServer] Error: aborted / ECONNRESET` satırları e2e istemci iptalleri (GATE.md'de bilinen gürültü). Önbellek kaydı: `fc70dc5335d5b554d4afd3da52554fcaf283901a`.

**Ölçüm tuzağı (düzeltildi):** Geliştirme aracının dış kabuğu (Git Bash) `$…` ve `$?` ifadelerini `wsl.exe … bash -c '…'` dizgesinin içinde bile WSL'e geçmeden genişletiyor: `echo $?` dış kabuğun son kodunu (çoğu zaman 0) okur, `$p` boş kalır. Doğrulama: `wsl.exe … bash -c 'X=7; echo "X=$X"'` → `X=`; `\$X` ile → `7`. Sonuç: önceki koşudaki `GATE_EXIT=…`/`PUSH_EXIT=…` satırlarına, ve bu koşuda ilk denenen "vitest başarısızlıkta 0 döndü" ölçümüne güvenilmemeli. Doğru ölçüm `if komut; then … else … fi` ile yapıldı: kasıtlı kırmızı testte vitest sıfır olmayan kodla çıktı (`FAIL_CORRECT`). Repoda vitest/gate hatası yok. Kapı kodu zaten `$?` okumuyor; `gate-lock.mjs` çocuk sürecin `status` değerini Node'da okur.

## Değişen dosyalar
- `scripts/gate-lock.mjs`
- `githooks/pre-push` (mod 100755)
- `tests/gate-exit-code.test.ts` (yeni)
- `tests/pre-push-hook.test.ts`
- `docs/GATE.md`, `CLAUDE.md`
- `docs/agent-results/NG-331-dev-gnd.md` (bu rapor)

## Riskler
- `pnpm hooks:install` ortak `.git/config`'i değiştirir: aynı repodaki tüm worktree'lerin push'u artık tam kapıdan geçer (yaklaşık 25 dk, önbellek isabetinde çok kısa). Bu kart talebinin gereği; geri alma: `git config --unset core.hooksPath`.
- Kanca kurulu makinede `.env` ya da `DATABASE_URL` yoksa push reddedilir (tasarım gereği).
- Önbellek isabeti tam kapıyı koşmadan `0` döner (kasıtlı); gerçek koşu için `FONBRIDGE_GATE_NO_CACHE=1`.
- Commit yazarı `DEV-NG (dev-gnd)`; kişisel kimlik kullanılmadı.
- Yalnızca Windows+WSL2 koşuldu; mac/Linux'ta koşulmadı. Betikler POSIX sh/bash; kod yolu aynı, ancak `pgrep`/`ps` farkları için `gate-isolated.sh` zaten ayrım yapıyor.

## Push denemeleri (bu koşu)
- 1. deneme: kanca reddetti — worktree'de `.env` yoktu. Çözüm: izole `pgvector` konteyneri + `.env` + `pnpm db:setup` (CLAUDE.md "Worktree'de gate").
- 2. deneme: DB adı `ng331` → canlı test "refusing to write on database" ile kırmızı. Düzeltme: DB adı `fabrika_test_ng331` (kalıp: `fabrika_test_ng<sayı>`).
- 3. deneme: birim/canlı testler (`8621 passed`, 611 dosya) yeşil; e2e 3 test kırmızı (aşağıda). Aynı DB'de önceki denemelerden kalan veri bir canlı testi de düşürmüştü (`province-lead-route`); taze DB'de bu geçti.
- Son koşu log: `~/alan/wt/ng331-logs/push-final5.log` (`712 passed`, 3 failed, `KAPI KIRMIZI`).

Kırmızı e2e (tek başına da tekrarlandı, `e2e3.log`):
```
tests/e2e/expert-prereg.spec.ts  — "register → verify mail → … same e-mail refused"  (toBeFocused)
tests/e2e/team-members-ui.spec.ts — "invite mail reaches the mailpit inbox"            (toBeVisible)
tests/e2e/team-members-ui.spec.ts — "re-invite within the cooldown …"                   (toBeVisible)
[WebServer] [Invitations] invitation email failed: smtp:ECONNECTION
15 passed, 3 failed
```
Kök neden: e2e sunucusu `localhost:1025` SMTP'ye bağlanamıyor. `fabrika-mailpit` konteyneri "healthy" ve port eşlemesi var, ama `http://127.0.0.1:8025/api/v1/messages` bağlantısı kapalı (HTTP kodu `000`). Konteyner paylaşımlı olduğu ve CLAUDE.md "zaten ayaktaysa dokunma" dediği için yeniden başlatılmadı. `playwright.config.ts` SMTP portunu sabit `1025` yazıyor; izole bir mailpit'e yönlendirmek için bu dosyada değişiklik gerekir (kapsam dışı).

## Açık sorular (lider kararı gerekli)
1. Paylaşımlı `fabrika-mailpit` yeniden başlatılsın mı (`docker restart fabrika-mailpit`)? Yalnız lider onayıyla.
2. Ya da `playwright.config.ts`'te SMTP portu ortam değişkeniyle geçersiz kılınabilsin mi (`E2E_SMTP_PORT`)? Bu değişiklik test altyapısına dokunur; onay bekliyor.
3. Yerel izole DB (`ng331-pg`, port 5572) şu an açık; push tekrarı için tutuluyor. İş kapanınca `docker rm -f ng331-pg`.

## Sonraki adım
1. Karar 1 ya da 2 gelince `E2E_PORT=5571 git push origin task/ng-331` (kanca tam kapıyı koşar; ~25 dk).
2. Push geçince `gh pr checks 414` ile yeni head'in CI'ını izle; yeşilse hüküm `Bitti`'ye çevrilir ve kart `review`'a alınır.
3. Birleştirme patronun onayına bırakıldı (draft; birleştirilmedi).
