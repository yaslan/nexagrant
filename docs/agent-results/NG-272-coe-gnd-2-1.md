# NG-272 — fix456 — coe-gnd — ek 1 (son durum)

**Hüküm: TAMAM.** B-1..B-3 uygulandı, push edildi, izole tam kapı ve PR 456 CI yeşil. PR 456 draft olarak kaldı; merge/ready yapılmadı. Önceki rapor (`NG-272-coe-gnd-2.md`, hüküm KISMEN) bu turun ara durumunu kaydeder; bu ek son durumu verir.

**Platform beyanı:** Windows 11 Pro + WSL Ubuntu-24.04. macOS'ta koşulmadı. Değişen kod saf TypeScript.

**Kart/brif çelişkisi:** Kart açıklaması API anahtarı kapısını anlatıyor (özellik `d21778ee`'de zaten var). Brif inceleme düzeltmelerini (B-1..B-3) istiyor; brif görev olarak uygulandı. B-4 kapsam dışı, dokunulmadı.

## Commit'ler (`origin/task/ng-272`)

- `83cde3ee` fix(rbac): SYSTEM_ROLE is a symbol; key gate has direct guards (B-1..B-3)
- `71cbc4ed` docs(agent-results): NG-272 coe-gnd-2 report (ara durum)
- `a782b7a5` test(storage): dev-store delete test clears R2 env before loading storage (NG-369)

## Kanıt (ham çıktı)

Push (izole tam kapı, `pnpm gate:isolated git push origin HEAD:task/ng-272`):
```
 Test Files  633 passed | 2 skipped (635)
To https://github.com/yaslan/nexagrant.git
   d21778ee..a782b7a5  HEAD -> task/ng-272
```

Storage testi (düzeltme sonrası), iki ortamda:
```
R2_ACCOUNT_ID=gate-test R2_ENDPOINT=http://127.0.0.1:9 vitest run tests/storage-dev-delete.test.ts
 Tests  2 passed (2)
vitest run tests/storage-dev-delete.test.ts   (R2 yok)
 Tests  2 passed (2)
```

`gh pr view 456`: `draft=true state=OPEN head=a782b7a51b6c6fcdfb2365aa71637fd36f8c03bc`

`gh pr checks 456` (son durum, run 45983945387 / 45983945410 / 45983945385):
```
build-and-test     pass  7m40s
cordis-worker      pass  37s
e2e (1)            pass  11m21s
e2e (2)            pass  17m48s
e2e (3)            pass  19m33s
e2e (4)            pass  12m52s
e2e (heavy)        pass  6m56s
e2e-gate           pass  3s
i18n-audit         pass  34s
lighthouse-a11y    pass  2m50s
```

## Değişen dosyalar (bu tur)

- `src/lib/rbac.ts`, `src/lib/api-auth.ts` (B-1, B-2)
- `tests/rbac-system-role.test.ts`, `tests/api/api-key-ng-gate-call.test.ts` (yeni)
- `tests/storage-dev-delete.test.ts` (NG-369 testi: R2 env izolasyonu; NG-369 sahibinin onayıyla, kullanıcı "Evet" dedi)
- `docs/agent-results/NG-272-coe-gnd-2.md`, `docs/agent-results/NG-272-coe-gnd-2-1.md`

## Riskler

- Storage testi değişikliği NG-369 kapsamında; NG-369 sahibi testin yeni halini incelemeli.
- Worktree'de önceki turda 5611 dosyanın EOL'ü yanlışlıkla değişti; geri alındı, ana checkout etkilenmedi.
- B-4 kapsam dışı, açık.

## Sonraki adım

- Lider/inceleyici PR 456'yı değerlendirip draft'tan çıkarabilir; bu iş merge/ready yapmadı.
