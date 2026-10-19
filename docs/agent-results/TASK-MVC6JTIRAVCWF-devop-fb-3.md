---
sözleşme: 3
görev: TASK-MVC6JTIRAVCWF
kod: TASK-MVC6JTIRAVCWF
ajan: devop-fb
motor: claude
tip: rapor
okur: ekip
hüküm: Bitti. Kod düzeltmesi (`build` = `NODE_ENV=production next build`, commit cd25be1d) PR #113 ile dev'e merge edildi (merge commit ee9631dd, 2026-10-18 16:44 UTC). Bu rapor `-2.md`'nin push bölümünü düzeltir: `-2.md` "push bloke, PR açılmadı" diyor, o bilgi artık geçersiz.
platform: mac doğrulandı (Darwin 27.0). Linux koşulamadı (makinede yok). Windows koşulamadı (makinede yok). Kodda platforma bağlı yol yok: `NODE_ENV=production` POSIX `VAR=val cmd` biçimidir; Docker (`node:22-alpine`, `ENV NODE_ENV=production`), CI (ubuntu) ve `backup:*` betikleri zaten bash üzerinde koşuyor. Windows cmd/PowerShell bu betiği çalıştırmaz; depoda o yol olmadığı için cross-env gerekmiyor.
sürüm: 1
---

# FO-46 · TASK-MVC6JTIRAVCWF — düzeltilmiş kapanış raporu (`-3`)

## Ne yapıldı

1. **Push ve PR.** Kod değişikliği `devop-fb/fo46-build-global-error` dalından normal `git push` ile (`--no-verify` yok) gönderildi. Pre-push `pnpm gate` yeşildi (crw2-fb'nin ham çıktısı, aşağıda). PR #113 açıldı, head `0a261309`, base `dev`.
2. **Merge.** PR #113 patron onayıyla dev'e merge edildi. Merge commit `ee9631dd`, merge zamanı `2026-10-18T16:44:00Z`. Kod tarafında `cd25be1d fix(build): pin NODE_ENV=production for next build` dev'de.
3. **Rapor düzeltmesi.** `-2.md` (commit `0a261309`) push öncesi bir durumu anlatıyor ve artık yanlış. Bu dosya onun yerini alır, eski dosyaya dokunulmadı.
4. **Bu dosyanın dal ve PR'ı.** Bu rapor `origin/dev` (`ee9631dd`) üzerinden `devop-fb/fo46-report` dalında yazıldı. Merge edilmedi.

## Doğrulama

**Merge ve head kontrolü** (`gh pr view 113`, bu makinede koşuldu):

```
{"baseRefName":"dev","headRefName":"devop-fb/fo46-build-global-error",
 "headRefOid":"0a2613097315a68e307f25f140fce043c99ae78a",
 "mergeCommit":{"oid":"ee9631ddf403e4adf56adfe7cdc386bd6e14285d"},
 "mergedAt":"2026-10-18T16:44:00Z","number":113,"state":"MERGED",
 "url":"https://github.com/yaslan/fonbridge/pull/113"}
```

**Kök neden ve düzeltme kontrolü.** Ham çıktılar crw2-fb'nin incelemesinde (`docs/agent-results/TASK-MVC6JTIRAVCWF-crw2-fb.md`, "Kanıt" bölümü) yer alıyor ve bu rapor onları yeniden üretmiyor:

```
CONTROL(next build, NODE_ENV=development) exit=1   -> /_global-error useContext null
B1(NODE_ENV=development pnpm build)        exit=0
B2(env-file sourced, pnpm build)           exit=0
next start: / -> 307 /tr, /tr -> 200, /en -> 200, /tr/nope-xyz -> 404
```

**Gate.** Push anındaki pre-push `pnpm gate` sonucu (crw2-fb'nin raporundaki kayıt): vitest 360 dosya geçti / 7 atlandı, 4769 test geçti / 120 atlandı; e2e 377 passed (8.8 dk); `alerts:check` temiz.

**Ön not.** Bu dosyadaki (`-3`) değişiklik yalnızca bir markdown dosyası. Pre-push gate onu da koşacak; sonucu push çıktısından takip edilecek.

## Ö-1 düzeltmesi (`JOBS_CRON_ENABLED`)

`-2.md` ve ilk raporda (`TASK-MVC6JTIRAVCWF-devop-fb.md`) şu cümleler var:

> `env.ts` production'da `JOBS_CRON_ENABLED` gibi değişkenleri açıkça ister; ... CI/cPanel ortamında da aynı değişkenlerin olması gerekir (FO-44 için kontrol edilmeli).

Bu yanlış yere konmuş bir risk. Kodda `jobsCronEnabled()` yalnız `src/lib/jobs/worker.ts:28`'den, worker çalışırken çağrılıyor. `next build` bunu tetiklemiyor. Yani bu bir **build** riski değil, **worker çalışma zamanı** riski: FO-44 dağıtımında worker ortamında `JOBS_CRON_ENABLED` tanımlı olmalı. Build'in `NODE_ENV`'i düzeltmesiyle ilgisi yok.

Doğru ifade: "build için ek ortam değişkeni gerekmez; `JOBS_CRON_ENABLED` FO-44 worker dağıtımında kontrol edilecek."

## `-2.md` superseded

`docs/agent-results/TASK-MVC6JTIRAVCWF-devop-fb-2.md` (commit `0a261309`, dal `devop-fb/fo46-build-global-error`) **superseded**. Push bölümünde "Remote'a push EDİLMEDİ; PR açılmadı" ve commit `9744bb1b` yazıyor; ikisi de yanlış. Gerçek: push yapıldı, PR #113 merge edildi, dev'deki fix commit'i `cd25be1d`. Dosya silinmedi; yerine bu rapor geçer.

## Değişen dosyalar

- `docs/agent-results/TASK-MVC6JTIRAVCWF-devop-fb-3.md` (yeni, bu dosya).
- Kodda değişiklik yok. `-devop-fb.md` ve `-devop-fb-2.md` değiştirilmedi.

## Riskler

- **CI kırmızı, merge bu koşulda yapıldı.** PR #113'teki `build-and-test`, `lighthouse-a11y`, `i18n-audit` checkleri 2 saniyede bitti; GitHub mesajı: "recent account payments have failed or your spending limit needs to be increased". Yani GitHub billing sorunu; kod hatası değil. Kanıt yerel gate ve crw2-fb'nin yerel build'leri. Bu, CI'ın hiçbir PR'da koşmadığı anlamına geliyor (dev'deki son 5 koşu da aynı durumda, crw2-fb'nin notu).
- **Linux ve Windows koşulamadı** (platform satırına bak).
- Next'in dev-mod prerender hatasının iç nedeni upstream'de açık; bu düzeltme dev modunu atlıyor, hatayı çözmüyor. `next build` doğrudan (betik dışı) `NODE_ENV=development` ile çağrılırsa hata yine çıkar.
- Kart `TASK-MVC6JTIRAVCWF` açıklamasında "merge YOK" yazıyor; bu artık eskidi. Kart bu rapor yazılırken güncellenmedi.

## Açık sorular

- GitHub billing sorunu ofis sahibine iletilmeli mi (CI hiçbir PR'da koşmuyor).

## Sonraki adım

- Bu dosya için PR (`devop-fb/fo46-report` → `dev`) açıldı; merge edilmedi, patron onayı bekleniyor.
- FO-44 öncesi: cPanel/worker ortamında `JOBS_CRON_ENABLED` tanımlı olup olmadığı kontrol edilecek (build değil, çalışma zamanı).
