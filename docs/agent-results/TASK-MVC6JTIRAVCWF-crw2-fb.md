---
sözleşme: 3
görev: TASK-MVC6JTIRAVCWF
kod: TASK-MVC6JTIRAVCWF
ajan: crw2-fb
motor: claude
tip: karar
okur: ekip
hüküm: Kısmen bitti: DÜZELTME GEREK — kod değişikliği (package.json build satırı) doğru ve onaylanabilir, ama PR'daki -2 raporu güncel değil ("push bloke, PR açılmadı" diyor, commit SHA yanlış). Yalnız rapor düzeltilince merge edilebilir.
platform: mac (Darwin 27.0, worktree .claude/worktrees/fo46-build @ 0a261309). Linux koşulamadı (makinede yok); kodda POSIX `VAR=val cmd` Linux/Alpine sh'de çalışır, Dockerfile zaten ENV NODE_ENV=production veriyor. Windows koşulamadı (makine yok); betik Windows cmd/PowerShell'de çalışmaz, ama depoda Windows build yolu yok (Docker Alpine, CI ubuntu, `backup:*` betikleri zaten bash) — cross-env gerekmez.
sürüm: 1
tarih: 2026-10-18T16:40:27.794Z
---

# FO-46 PR #113 kod incelemesi — build NODE_ENV=production

## Ne yapıldı
PR #113 incelendi: diff satır satır okundu, build'i çağıran yollar ve `NODE_ENV` okumaları tarandı, `fo46-build` worktree'sinde kontrol build'i ve iki düzeltme build'i koşuldu, `next start` ile rotalar denendi, `git merge-tree` çalıştırıldı, iki rapor dosyası okundu. Kod değiştirilmedi, merge edilmedi, worktree'de dosya değişmedi (`git status --short` boş).

## Bulgular (önem sırasıyla)

### B-1 · BLOKE EDEN (yalnız belge) — `docs/agent-results/TASK-MVC6JTIRAVCWF-devop-fb-2.md` güncel değil
- "## Push durumu: BLOKE" bölümü şunu diyor: "Remote'a push EDİLMEDİ; PR açılmadı." Ayrıca commit'i `9744bb1b` diye veriyor. Gerçekte dalda `cd25be1d` var, push yapılmış ve PR #113 açık. Kart da "pre-push gate YEŞİL (vitest 4769 geçti, e2e 377 passed)" diyor.
- `-2.md` kendisini "push status" diye commit'lemiş (0a261309), ama içerik push'tan önceki durumu anlatıyor. "Değişen dosyalar" bölümü de kendisini listelemiyor.
- Neden önemli: bu dosya dev'e girince kalıcı kayıt olur ve okuyan kişi "PR yok, gate kırık" sonucuna varır.
- **Düzeltme:** `-2.md`'deki push bölümünü gerçek sonuçla değiştir: normal push, gate yeşil, PR #113, commit `cd25be1d`. Ya da `-3.md` ekleyip `-2.md`'nin başına "yerini -3 aldı" notu yaz.

### Ö-1 · Öneri — rapordaki `JOBS_CRON_ENABLED` riski yanlış yerde
Raporda "env.ts production'da JOBS_CRON_ENABLED ister, CI/cPanel build'de olmalı" deniyor. Kodda `jobsCronEnabled()` yalnız `src/lib/jobs/worker.ts:28`'den, worker çalışırken çağrılıyor; `next build` bunu tetiklemiyor. Bu bir build riski değil, FO-44 dağıtımındaki worker çalışma zamanının riski. B-1 düzeltilirken bu cümle de düzeltilebilir. Bloke etmez.

### Ö-2 · Bilgi — düzeltme bir güvenlik kenarını da kapatıyor
`src/lib/demo-login.ts:37` → `BUILT_FOR_PRODUCTION = process.env.NODE_ENV === 'production'`. Bu değer build sırasında koda gömülüyor. Eskiden dev-mode bir build geçseydi, şifresiz demo girişi derlenmiş pakette açık kalabilirdi. Build artık her zaman production, bu yol da kapandı. Olumlu yan etki.

### Ö-3 · Bilgi — Windows
`NODE_ENV=production next build` Windows cmd ve PowerShell'de çalışmaz. Depoda Windows build yolu yok: Docker `node:22-alpine`, CI `ubuntu-latest`, `backup:*` betikleri zaten `bash`. Bu yüzden şu an `cross-env` gerekmiyor. İleride Windows'ta build gerekirse `cross-env` ya da `.npmrc` içinde `shell-emulator=true` yeterli.

## Kontrol listesi
1. **Kök nedeni gideriyor mu? EVET.**
   - Kontrol: `NODE_ENV=development pnpm exec next build` → exit=1, hata `/_global-error` `TypeError: Cannot read properties of null (reading 'useContext')` (Next "non-standard NODE_ENV" uyarısıyla).
   - `NODE_ENV=development pnpm build` → exit=0.
   - `.env` kaynaklı kabukta `pnpm build` → exit=0.
   - `next start -p 3191`: `/` 307→`/tr`, `/tr` 200, `/en` 200, `/tr/nope-xyz` 404. Süreci kendi PID'imle durdurdum.
2. **Yan etki: YOK.**
   - CI `ci.yml:192` (`e2e_server: start` olduğunda) ve `a11y-check.yml:45` `pnpm build` çağırıyor; ikisinde de `NODE_ENV` tanımlı değil. Next `NODE_ENV` tanımsızsa build'i zaten production koşar, yani CI'da davranış değişmiyor.
   - `Dockerfile:22`'de builder aşamasında zaten `ENV NODE_ENV=production` var; değişiklik orada etkisiz.
   - `next.config.ts` yalnız `R2_PUBLIC_HOST` okuyor, `NODE_ENV` okumuyor.
   - `src/lib/env.ts`'nin production kuralları (`JOBS_CRON_ENABLED`, `DEMO_LOGIN_ENABLED`) çalışma anında devreye giriyor; build bunlarla düşmedi (B2 exit 0).
   - cPanel (FO-44) de `pnpm build` çağırırsa aynı sonucu alır.
3. **dev ile çakışma: YOK.** `git merge-tree --write-tree origin/dev origin/devop-fb/fo46-build-global-error` → `105eae67…`, exit 0. Dal dev'in 8 commit gerisinde; `package.json` çakışmıyor.
4. **Raporlar güncel mi? HAYIR.** B-1'e bak. `-devop-fb.md` (ilk rapor) kendi anı için doğru. `-2.md` push sonrasını anlatmıyor.

## CI notu
PR'daki üç kırmızı check (`build-and-test`, `lighthouse-a11y`, `i18n-audit`) 2 saniyede bitmiş. Annotation: "The job was not started because recent account payments have failed or your spending limit needs to be increased." dev dalındaki son 5 CI koşusu da aynı durumda. Kırmızılar koddan değil, GitHub billing'den geliyor. Kod tarafının kanıtı yerel pre-push gate ve bu incelemedeki build'ler.

## Kanıt (ham çıktı)
```
CONTROL(next build, NODE_ENV=development) exit=1
B1(NODE_ENV=development pnpm build) exit=0
B2(env-file sourced, pnpm build) exit=0
--- control log
158:Error occurred prerendering page "/_global-error".
159:TypeError: Cannot read properties of null (reading 'useContext')
164:⨯ Next.js build worker exited with code: 1 and signal: null
--- start
/ -> 307 http://localhost:3191/tr
/tr -> 200
/en -> 200
/tr/nope-404 -> 404
stopped
--- merge-tree
105eae671b7905769142797623032f1bd1e11137  exit=0
```

## Değişen dosyalar
- `docs/agent-results/TASK-MVC6JTIRAVCWF-crw2-fb.md` (bu rapor). Kodda değişiklik yok.

## Riskler
- Linux ve Windows koşulamadı (bkz. platform).
- Next'in dev-mode prerender hatasının iç nedeni upstream'de açık kalıyor; düzeltme bu modu atlıyor, hatayı çözmüyor. Yerel `next build` doğrudan, `pnpm build` olmadan çağrılırsa hata yine çıkar (kontrol build'i bunu gösterdi).

## Sonraki adım
- devop-fb: B-1 (rapor düzeltmesi) yapılsın, Ö-1 de isteğe bağlı. Sonra kod tarafı ONAY, merge edilebilir.
- GitHub billing sorunu ofis sahibine iletilmeli; CI hiçbir PR'da koşmuyor.
