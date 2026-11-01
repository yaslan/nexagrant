# TASK-MTS9W0C1VC9OS — `resend` beyan edilmemiş bağımlılık + cron→rota import kenarı

**Ajan:** ex-en (Araştırmacı/Explorer) · **Tarih:** 2026-09-08 · **Dal:** `dev`
**Kaynak bulgu:** `docs/agent-results/DOGRULAMA-S12-D4-blok-zincir-dse.md` §1.6–§1.7
**Kanıt dizini:** `docs/agent-results/TASK-MTS9W0C1VC9OS-screenshots/`

---

## 1. Ne yapıldı

P0 CI blokerinin üç parçası da kapatıldı.

**(a) `resend` beyan edildi.** Paket `node_modules`'ta 6.25.0 olarak duruyordu ama ne
`package.json`'da ne `pnpm-lock.yaml`'daydı — yani yalnızca birinin elle kurmasıyla
yerelde vardı. `pnpm add resend@^6.25.0` ile `dependencies`'e eklendi; kilit dosyası
diff'i **30 satır ve tamamen ekleme** (kaldırma/sürüm oynatma yok).

**(b) Şema cron iş dosyasından çıkarıldı.** `src/app/api/saved-searches/route.ts`,
`SavedSearchFiltersSchema`'yı `src/lib/inngest/jobs/alerts-daily.ts`'ten import ediyordu;
bu yüzden yalnız cron'un gereksindiği `resend` bir **API rotasının derleme grafiğine**
giriyordu. Şema yeni bir modüle taşındı:

- **Yeni:** `src/lib/saved-search-filters.ts` — `SavedSearchFiltersSchema`,
  `SavedSearchFilters` tipi, `parseSavedSearchFilters()`.
- `alerts-daily.ts` artık `parseSavedSearchFilters`'ı buradan import ediyor
  (kullanılmayan `zod` importu da düştü); rota da şemayı buradan alıyor.
- **İş mantığı değişmedi:** şema gövdesi (`q` + `status`, `.partial()`) ve "parse
  edilemeyen satır filtresize düşer" davranışı birebir taşındı; sorgu/e-posta kodu
  ve `SAVED_SEARCH_ALERT_QUERY` elden geçirilmedi.

**(c) Yanlış yorum düzeltildi.** `alerts-daily.ts`'in eski 36–38. satırlarındaki
"there is no API route that creates a `SavedSearch` row … only sleeps 500ms and shows a
toast" iddiası `266f00b`'den beri yanlıştı. O yorum şemayla birlikte yeni dosyaya taşındı
ve gerçeğe göre yeniden yazıldı; rotanın kendi doküman yorumu da şemanın niçin **kasten**
cron dosyasında olmadığını söylüyor.

---

## 2. Kanıt

### 2.1 Temiz `--frozen-lockfile` kurulum → `pnpm build` hatasız

Atılabilir `git worktree` (HEAD'den, üzerine **yalnız benim 5 dosyam** kopyalandı),
paylaşılan `node_modules`'a symlink **yok** — kendi gerçek kurulumu:

```
$ git worktree add --detach $SCRATCH/wt-resend HEAD
$ git status --porcelain          # worktree'de yalnız benim dosyalarım
 M package.json
 M pnpm-lock.yaml
 M src/app/api/saved-searches/route.ts
 M src/lib/inngest/jobs/alerts-daily.ts
?? src/lib/saved-search-filters.ts

$ pnpm install --frozen-lockfile
Done in 5.5s using pnpm v11.25.0

$ ls -la node_modules/ | grep resend
resend -> .pnpm/resend@6.25.0/node_modules/resend
$ ls -ld node_modules      # symlink DEĞİL, gerçek dizin
drwxr-xr-x@ 54 macbook wheel 1728 .../wt-resend/node_modules

$ pnpm typecheck
$ tsc --noEmit            # (çıktı yok = temiz)

$ pnpm exec prisma generate
✔ Generated Prisma Client (v7.10.0) in 221ms

$ pnpm build ; echo "EXIT=$?"
✓ Compiled successfully in 950ms
✓ Generating static pages using 11 workers (26/26) in 283ms
├ ƒ /api/saved-searches
├ ƒ /api/saved-searches/[id]
EXIT=0
```

### 2.2 Karşı-olgu: kenar gerçekten koptu mu?

Aynı worktree'de `node_modules/resend` geçici olarak gizlenip yeniden build alındı.
Amaç, `resend`'i **kimin** gerçekten gerektirdiğini derleyiciye söyletmek:

```
$ mv node_modules/resend node_modules/__resend_hidden
$ pnpm build ; echo "EXIT=$?"      -> EXIT=1
$ grep -c "Can't resolve 'resend'" build-noresend.log     -> 3

./src/actions/user/request-deletion.ts:4      (→ /api/user/request-deletion, settings/privacy)
./src/lib/feedback/digest-run.ts:91           (dinamik import)
./src/lib/inngest/jobs/alerts-daily.ts:4
  Import traces:
    #1 [App Route]: ./src/lib/inngest/jobs/alerts-daily.ts
                    ./src/app/api/inngest/route.ts        ← tek rota tüketicisi artık bu

$ grep -n "saved-searches" build-noresend.log
  (NOT in any resend import trace)
```

`alerts-daily.ts` hâlâ `resend`'e muhtaç — olması gereken bu, e-postayı o gönderiyor —
ama tek rota tüketicisi `/api/inngest` (cron uç noktası). **`saved-searches` hiçbir
`resend` import izinde geçmiyor**: (b)'nin iddia ettiği kenar ölçülerek koptu.

Ayrıca bu ölçüm, eksik beyanın **saved-search'ten fazlasını** kırdığını gösterdi:
`request-deletion` (GDPR silme talebi) ve `feedback/digest-run` da aynı temiz kurulumda
derlenmiyordu.

### 2.3 Gerçek tarayıcı: "Aramayı Kaydet" → 201 + Postgres satırı

Sunucu, **temiz kurulumun kendi `node_modules`'uyla** ayağa kaldırıldı
(`npx next dev --webpack --port 3141`, worktree içinden). Playwright/Chromium ile
gerçek kimlikle giriş, gerçek tıklama; satır uygulamadan bağımsız ham `pg` ile okundu:

```
[DB] SavedSearch rows BEFORE: 0
[UI] logged in, landed on http://localhost:3141/tr/default/dashboard
[NET] GET  /api/saved-searches -> 200
[NET] GET  /api/saved-searches -> 200
[NET] POST /api/saved-searches -> 201
[NET] GET  /api/saved-searches -> 200
[DB] SavedSearch rows AFTER click: 1
[DB] ROW: {"id":"cmtsaeoda0001gwxkkzmah0xp","tenantId":"demo-tenant",
           "userId":"demo-user-alice","name":"ex-en-verify-1788848824254",
           "filters":{"q":"ex-en-verify-1788848824254","status":["OPEN","FORTHCOMING"]},
           "notify":true}
```

`POST` 201 (200 sınıfı, `NextResponse.json(..., { status: 201 })`), `filters.q` ekranda
yazılan metnin birebir karşılığı, `tenantId`/`userId` oturumdan geliyor.
Kareler: `01-calls-loaded.png`, `02-after-save-click.png` — ikincisinde "Arama kaydedildi
(ex-en-verify-1788848824254)" bildirimi ve "Kayıtlı Aramalarım" listesinde satır görünüyor.

Ölçüm sonrası test satırı silindi; tablo bulduğum gibi **0 satır** bırakıldı.

### 2.4 Birim testler

```
$ npx vitest run src/app/api/saved-searches/route.test.ts \
                 src/lib/inngest/jobs/__tests__/alerts-daily.test.ts
 Test Files  2 passed (2)
      Tests  16 passed (16)
```

### 2.5 Lint

```
$ pnpm lint src/lib/saved-search-filters.ts src/lib/inngest/jobs/alerts-daily.ts \
            src/app/api/saved-searches/route.ts
$ eslint ...        # (çıktı yok = temiz)
```

Depo geneli `pnpm typecheck` şu an **kırmızı**, ama benim dosyalarımdan değil — bkz. §5.
Kapı bu yüzden HEAD'den açılan izole worktree'de koşuldu.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `package.json` | `dependencies`'e `"resend": "^6.25.0"` |
| `pnpm-lock.yaml` | +30 satır (resend, postal-mime, standardwebhooks@1.0.0) — hepsi ekleme |
| `src/lib/saved-search-filters.ts` | **YENİ** — şema + tip + `parseSavedSearchFilters()` |
| `src/lib/inngest/jobs/alerts-daily.ts` | Şema/`parseFilters` çıktı, yeni modülden import; kullanılmayan `zod` importu silindi; yanlış yorum gitti |
| `src/app/api/saved-searches/route.ts` | Şema importu `@/lib/saved-search-filters`'a taşındı; yorum güncellendi |

---

## 4. Riskler

- **Düşük.** Şema gövdesi ve okuma davranışı birebir taşındı; `alerts-daily`'nin sorgu ve
  e-posta yolu elden geçirilmedi. Şema artık iki tüketicinin de dışında bir dosyada, yani
  ileride alan adı değişirse iki taraf birlikte kırılır (istenen davranış: tek sözleşme).
- `resend` ilk kez kilit dosyasına giriyor; sürüm zaten yerelde koşan 6.25.0, tedarik
  zinciri politikası kontrolü `pnpm` tarafından geçti (`✓ Lockfile passes supply-chain policies`).

---

## 5. Açık sorular (yolun üstünde görülen, DÜZELTİLMEYEN kusurlar)

1. **`src/app/api/documents/export/route.ts:2` — depo geneli typecheck kırık.**
   `error TS2305: Module '"@/lib/document-exporter"' has no exported member 'templateBodyText'`.
   Bu dosya şu anda başka bir ajanın çalışma ağacındaki commit'lenmemiş işi; bu koşuda
   `dev` üzerinde `pnpm typecheck` **exit 2** veriyor. Dokunmadım.
2. **Temiz kurulum `prisma generate` olmadan build edilemiyor.** `package.json`'da
   `postinstall` yok; `pnpm install --frozen-lockfile && pnpm build` diyen bir CI işi
   `Can't resolve '.prisma/client/index-browser'` ile ölür. Bu koşuda `pnpm exec prisma
   generate`'i elle koştum. Ayrı bir kart hak ediyor (CI adımı ya da `postinstall`).
3. **`resend` eksikliği üç dosyayı birden vuruyordu** (§2.2): `saved-searches`'ün yanında
   `actions/user/request-deletion.ts` ve `lib/feedback/digest-run.ts`. Bunlar da aynı
   düzeltmeyle açıldı; ayrıca bir iş gerekmiyor — ama kartın kapsamı sanılandan genişti.
4. **`RESEND_API_KEY` yokken davranış ölçülmedi.** Kod `env.RESEND_API_KEY` yoksa
   istemciyi kurmuyor; bu koşuda gerçek e-posta gönderimi denenmedi (kapsam dışı).

---

## 6. Sonraki adım

- Bu değişiklik `dev`'e commit edildi. CI'da ilk temiz kurulumda §5.2'nin (prisma generate)
  ayrıca ele alınması gerekiyor — yoksa bu düzeltme tek başına yeşil build vermez.
- `docs/agent-results/DOGRULAMA-S12-D4-blok-zincir-dse.md` §1.6 ve §1.7 artık **kapatılabilir**.
