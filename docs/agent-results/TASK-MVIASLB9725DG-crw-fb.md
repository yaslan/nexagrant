# FO-114 (TASK-MVIASLB9725DG) — PR #145 kod incelemesi

**Hüküm:** Kod onay. Belge düzeltmesi gerekli (bloke etmez, ama merge öncesi yapılmalı): `docs/RELEASE_CHECKLIST.md` §9.1 ve `scripts/git-core-bare.sh` yorumu doğrulanmamış kök nedeni kesin bilgi gibi yazıyor.
**Tip:** İnceleme (kod + belge). Merge yapılmadı.
**Platform:** mac (darwin, zsh; Git 2.54.0). Hook'lar `/bin/sh` ile dash ve bash'te koşuldu. Windows (Git for Windows, sh üzerinden) ve Linux koşulmadı: koşulamadı, sebep: bu oturumda yalnız mac erişilebilir.

## Ne yapıldı

- PR: https://github.com/yaslan/fonbridge/pull/145 — dal `crw2-fb/fo114-core-bare-guard`, commit `674d6f91`, base `dev`.
- İnceleme worktree'sinde yapıldı: `/Users/macbook/alan/FONBRIDGE/.claude/worktrees/fo114-core-bare-guard` (HEAD `674d6f91`, temiz). Ana checkout'a dokunulmadı; deneyler `scratchpad` altındaki geçici repolarda koşuldu.
- Ana checkout'ta `core.bare` **false** (kontrol ettim).
- Kök neden bu incelemede yeniden üretilmedi (aşağıda neden).

## Kanıt (ham çıktı)

**Test:** `perl -e 'alarm 900; exec @ARGV' pnpm exec vitest run tests/core-bare-guard.test.ts tests/tenant-bypass-scan.test.ts`
```
 Test Files  2 passed (2)
      Tests  50 passed (50)
   Duration  3.19s
```
(Kapsam: `core-bare-guard` 4 test — pre-commit reddi/geçişi, pre-push gate öncesi durdurma, gate sonrası core.bare=true yakalama, core.bare=false iken gate + geçiş. Testler `os.tmpdir()` altında geçici repo kuruyor; ana repoya yazmıyor. `pnpm` stub'lanıyor, gerçek gate koşmuyor.)

**Lint:** `pnpm lint` → `0 errors, 4 warnings`. Üç uyarı dosyası PR'da değil (`src/lib/invitations/accept.ts`, `tests/e2e/fixtures/concept-template-tenant.ts`, `tests/settings-profile-update.test.ts`). Önceden var.

**Typecheck:** `pnpm typecheck` (`tsc --noEmit`) → çıktısız, çıkış kodu 0.

**Guard, geçici repo (dash ve bash):**
```
== dash   → ✗ probe: paylaşılan git yapılandırmasında core.bare=true (...)  rc=1
== bash   → ✗ probe: ...                                                 rc=1
== bare unset → rc=0
```
Mesaj iki komutu da veriyor (`git config --file "<ortak config>" --get core.bare` / `... core.bare false`). Guard ayarı kendisi değiştirmiyor (test `bare(main)` ile doğruluyor).

## Bulgular (önem sırasıyla)

1. **[belge, orta] Doğrulanmamış kök neden kesin bilgi gibi yazılmış.**
   - `docs/RELEASE_CHECKLIST.md` §9.1, "Kural" maddesi: "Linked worktree'nin GIT_DIR ile çalışan bir `git init`, depo tipini 'bare' tahmin eder ve paylaşılan config'e `core.bare=true` yazar." Bu, kartın Hipotez 1'i. Kart "doğrulanmadı" diyor.
   - `scripts/git-core-bare.sh` yorumu: "Known writer: a `git init` that inherits a linked worktree's GIT_DIR (FO-111)." Aynı iddia, "known" olarak.
   - Senaryo: bir sonraki ajan bu notu okuyup yanlış yazıcıyı suçlar ya da kanıtsız bir kuralı uygular.
   - Öneri: iki yerde de "olası/hipotez — FO-114'te yeniden üretilemedi" ifadesi kullanılsın, ya da kanıt eklensin.

2. **[kapsam, orta] Kart DoD'sinde "kök neden yeniden üretildi ya da hangi kaynakların tarandığı yazıldı" maddesi karşılanmamış.** PR bunların hiçbirini yazmıyor. Bu incelemede `GIT_DIR=<linked gitdir> git init` deneyi izin reddi nedeniyle koşulmadı. Bu yüzden Hipotez 1 bu raporda doğrulanmadı. Kart DoD'si kapanmadan önce ya deney koşulmalı ya da tarama sonucu (hangi oturum kayıtlarına bakıldı, ne bulundu) belgeye yazılmalı.

3. **[düşük] `--path-format=absolute` Git ≥ 2.31 gerektirir.** `scripts/git-core-bare.sh` içinde `_cfg` eski git'te boş kalır ve mesajda `/config` gibi yanlış bir yol çıkar. Guard'ın kendisi yine de çalışır (yalnız mesaj bozulur). Mac'teki Git 2.54 ile sorun yok. Düzeltme isteği değil, not.

4. **[düşük, belge] §9.1 "Kanca, gate'ten önce bu değişkenleri temizler" cümlesi yalnız pre-push için doğru.** pre-commit `unset` yapmıyor. Guard yalnız `git config --get` okuduğu için bu bir hata değil; cümle yalnız pre-push'a ait olduğu netleşsin.

Kontrol edilip SORUN BULUNMAYANLAR:
- **Yanlış pozitif yok:** `core.bare` tanımsızken (`bare unset`) guard `rc=0` veriyor; `set -e` altında `$(...)` ve `[ ]` dönüşleri kırılmıyor.
- **Linked worktree:** pre-commit testi linked worktree'de commit'i reddediyor; `git config --get` ortak config'i okuyor, doğru dosyayı hedefliyor.
- **pre-push sırası:** `unset GIT_DIR…` guard'dan önce; FO-111 düzeltmesi tekrar yapılmamış, yalnız eklenmiş.
- **Gate süresi:** guard gate'ten önce ve sonra tek bir `git config` çağrısı; gate süresine anlamlı etkisi yok.
- **Ana repo:** testler ana repoya yazmıyor (`tmpdir` ve `gitEnvFor(process.env)`, `HOOK_GIT_VARS` GIT_DIR'i temizliyor).
- **eslint/vitest exclude `.claude-fo49/**`:** yalnız o dizini dışlıyor, gerekçesi yorumda.

## Değişen dosyalar (PR, incelenen)

`CLAUDE.md`, `docs/RELEASE_CHECKLIST.md`, `eslint.config.mjs`, `githooks/pre-commit`, `githooks/pre-push`, `scripts/git-core-bare.sh` (yeni), `tests/core-bare-guard.test.ts` (yeni), `tests/tenant-bypass-scan.test.ts`, `vitest.config.mts`.

Bu incelemede değiştirilen dosya: yalnız bu rapor (`docs/agent-results/TASK-MVIASLB9725DG-crw-fb.md`).

## Riskler

- Kök neden doğrulanmadan kalıyor. Guard bulguyu yakalıyor ama yazıcıyı kapatmıyor; `core.bare` yeniden dönerse ekip ilk yazıcıyı bulamayabilir.
- Windows ve Linux koşulmadı.

## Açık sorular

- Hipotez 1 (`GIT_DIR` + `git init`) gerçekten tekrar üretilebiliyor mu? Bu, izin verilirse yalnız geçici bir repoda yapılmalı (ana repo yok).

## Sonraki adım

1. PR yazarına (crw2-fb): §9.1 ve script yorumundaki kök neden ifadesini hipotez olarak düzelt; DoD'deki tarama/yeniden üretim maddesini kapat ya da açıkça "yapılamadı" yaz.
2. Düzeltme sonrası yalnız belge diff'ini yeniden kontrol et; kod değişmediği için testlerin tekrarı gerekmez.
3. Merge kararı patronda; bu inceleme merge yapmadı.
