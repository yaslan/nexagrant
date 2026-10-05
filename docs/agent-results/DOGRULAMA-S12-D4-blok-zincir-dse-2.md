# DOĞRULAMA S12-D4 · takip — §1.6 ve §1.7 kapatıldı

**Yazan:** ex-en · **Tarih:** 2026-09-08 · **Dal:** `dev`
**Kaynak:** `docs/agent-results/DOGRULAMA-S12-D4-blok-zincir-dse.md` §1.6, §1.7
**Görev:** TASK-MTS9W0C1VC9OS · **Tam rapor:** `docs/agent-results/TASK-MTS9W0C1VC9OS-ex-en.md`
**Kareler:** `docs/agent-results/TASK-MTS9W0C1VC9OS-screenshots/`

| dse bulgusu | Hüküm | Kanıt |
|---|---|---|
| §1.6 — `resend` beyan edilmemiş bağımlılık; temiz kurulumda `/api/saved-searches` derlenmiyor, "Aramayı Kaydet" 500 | **KAPANDI** | §A, §B, §C |
| §1.7 — `alerts-daily.ts:36-38` yorumu `266f00b`'den beri yanlış | **KAPANDI** | §D |

---

## A. `resend` artık beyanlı — temiz `--frozen-lockfile` kurulum build ediyor

Ölçüm, HEAD'den açılmış atılabilir bir `git worktree`'de yapıldı; üzerine **yalnız bu görevin
5 dosyası** kopyalandı, paylaşılan `node_modules`'a symlink **atılmadı** (kendi gerçek kurulumu):

```
$ git status --porcelain          # worktree içeriği
 M package.json
 M pnpm-lock.yaml
 M src/app/api/saved-searches/route.ts
 M src/lib/inngest/jobs/alerts-daily.ts
?? src/lib/saved-search-filters.ts

$ pnpm install --frozen-lockfile
Done in 5.5s using pnpm v11.25.0

$ ls -la node_modules/ | grep resend
resend -> .pnpm/resend@6.25.0/node_modules/resend
$ ls -ld node_modules
drwxr-xr-x@ 54 macbook wheel 1728 .../wt-resend/node_modules     # symlink DEĞİL

$ pnpm typecheck        -> tsc --noEmit, çıktı yok (temiz)
$ pnpm exec prisma generate
✔ Generated Prisma Client (v7.10.0) in 221ms
$ pnpm build ; echo EXIT=$?
✓ Compiled successfully in 950ms
✓ Generating static pages using 11 workers (26/26) in 283ms
├ ƒ /api/saved-searches
├ ƒ /api/saved-searches/[id]
EXIT=0
```

dse'nin ürettiği `Error: Module not found: Can't resolve 'resend'` bu kurulumda **oluşmuyor**.

## B. Kenar koptu — `saved-searches` artık `resend`'e bağlı değil

`SavedSearchFiltersSchema` cron iş dosyasından çıkarılıp `src/lib/saved-search-filters.ts`'e
taşındı; rota şemayı oradan alıyor. Kenarın gerçekten koptuğu, derleyiciye sorularak ölçüldü —
`node_modules/resend` gizlenip build tekrarlandı:

```
$ mv node_modules/resend node_modules/__resend_hidden
$ pnpm build ; echo EXIT=$?                                   -> EXIT=1
$ grep -c "Can't resolve 'resend'" build-noresend.log         -> 3
    ./src/actions/user/request-deletion.ts:4
    ./src/lib/feedback/digest-run.ts:91
    ./src/lib/inngest/jobs/alerts-daily.ts:4
      Import traces:
        #1 [App Route]: ./src/lib/inngest/jobs/alerts-daily.ts
                        ./src/app/api/inngest/route.ts

$ grep -n "saved-searches" build-noresend.log
  (hiçbir resend import izinde yok)
```

`alerts-daily.ts` hâlâ `resend`'e muhtaç (e-postayı o gönderiyor) ama tek rota tüketicisi artık
`/api/inngest`. `saved-searches` hiçbir izde geçmiyor.

Bu ölçüm ayrıca §1.6'nın **sanılandan geniş** olduğunu gösterdi: eksik beyan `saved-searches`'ün
yanı sıra GDPR silme talebi (`actions/user/request-deletion.ts`) ve geri bildirim dijesti
(`lib/feedback/digest-run.ts`) yollarını da temiz kurulumda kırıyordu.

## C. Gerçek tarayıcı — "Aramayı Kaydet" 201 + Postgres satırı

Sunucu **temiz kurulumun kendi `node_modules`'uyla** ayağa kaldırıldı
(`npx next dev --webpack --port 3141`, worktree içinden). Playwright/Chromium, gerçek kimlikle
giriş (`alice@fabrika.test`), gerçek tıklama; satır uygulamadan bağımsız ham `pg` ile okundu:

```
[DB] SavedSearch rows BEFORE: 0
[UI] logged in, landed on http://localhost:3141/tr/default/dashboard
[NET] GET  /api/saved-searches -> 200
[NET] POST /api/saved-searches -> 201
[NET] GET  /api/saved-searches -> 200
[DB] SavedSearch rows AFTER click: 1
[DB] ROW: {"id":"cmtsaeoda0001gwxkkzmah0xp","tenantId":"demo-tenant",
           "userId":"demo-user-alice","name":"ex-en-verify-1788848824254",
           "filters":{"q":"ex-en-verify-1788848824254","status":["OPEN","FORTHCOMING"]},
           "notify":true}
```

Kare `02-after-save-click.png`: arama kutusunda yazılan metin, "Arama kaydedildi
(ex-en-verify-1788848824254)" bildirimi ve "Kayıtlı Aramalarım" listesindeki satır aynı ekranda.
Ölçüm sonrası test satırı silindi; tablo bulunduğu gibi **0 satır** bırakıldı.

## D. §1.7 — yanlış yorum gitti

Eski metin (`alerts-daily.ts:36-38`):

> `there is no API route that creates a SavedSearch row, and the "Save search" button … only
> sleeps 500ms and shows a toast — it calls no API and touches no table.`

`266f00b` tam da o rotayı eklemişti. Yorum şemayla birlikte `src/lib/saved-search-filters.ts`'e
taşındı ve gerçeğe göre yeniden yazıldı; ayrıca `route.ts`'in doküman yorumu şemanın niçin
**kasten** cron dosyasında olmadığını söylüyor. Depoda o iddianın kalıntısı yok:

```
$ grep -rn "no API route that creates\|only sleeps 500ms" src/
  (eşleşme yok)
```

---

## Açık kalan (bu koşuda DÜZELTİLMEDİ, adıyla bildiriliyor)

1. `src/app/api/documents/export/route.ts:2` — `templateBodyText`, `@/lib/document-exporter`'dan
   export edilmiyor; `dev` üzerinde depo geneli `pnpm typecheck` **exit 2**. Başka bir ajanın
   commit'lenmemiş işi; dokunulmadı. (Kapı bu yüzden izole worktree'de koşuldu.)
2. Temiz kurulum `prisma generate` olmadan build **edilemiyor** — `package.json`'da `postinstall`
   yok. `pnpm install --frozen-lockfile && pnpm build` diyen bir CI işi
   `Can't resolve '.prisma/client/index-browser'` ile ölür. Bu düzeltme tek başına yeşil CI vermez.
3. `RESEND_API_KEY` yokken e-posta yolu ölçülmedi (kapsam dışı).
