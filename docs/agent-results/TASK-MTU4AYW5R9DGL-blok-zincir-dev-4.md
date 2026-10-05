# TASK-MTU4AYW5R9DGL — the empty-state heading rendered twice

**Platform beyanı: macOS (darwin 25.6.0, Apple silicon) üzerinde doğrulandı.**
Windows ve Linux'ta KOŞULMADI — bu ortamlar bu turda mevcut değil. Dokunulan kod
platforma bağlı değildir: silinen dosyalar Next.js rota kuralı (`loading.tsx`)
gereği yalnızca yol adına göre okunur, eklenen muhafız testi `path.join` ile
yürür ve dosya adını `/^loading\.(tsx?|jsx?)$/` ile eşler; ayırıcı, kabuk, süreç
öldürme ya da ikili adı geçmez. Tarayıcı tarafı da platform-bağımsızdır: sorun
React'in akış (streaming) davranışıdır, Chromium'un kendisinde değil.

---

## 1. Ne yapıldı

### Devralınan teşhis ÖLÇÜLDÜ ve ÇÜRÜTÜLDÜ

Kart, kök nedeni "commit 0d16788 (sunucuda tema çözümü) → SSR/istemci tema
uyuşmazlığı → ikinci render ağacı" diye veriyor ve "tekrar arama" diyordu. İki
deney bunu çürüttü (ikisi de kartta yasaklanan denemelerden farklıdır):

**Deney A — root layout'tan `cookies()` + `headers()` çıkarıldı** (tema sunucuda
çözülmüyor, uyuşmazlık imkânsız):

```
✘ 1 f10-absence-not-zero.spec.ts:66   (1.5s)
✘ 2 f10-absence-not-zero.spec.ts:87   (837ms)
✘ 3 f10-absence-not-zero.spec.ts:100  (745ms)
✘ 4 f10-absence-not-zero.spec.ts:128  (919ms)
✓ 5 f10-absence-not-zero.spec.ts:145  (1.1s)
4 failed / 1 passed
```

Hata GEÇMEDİ; 3 yerine **4** test düştü. Tema uyuşmazlığı kök neden değildir.

**Deney B — ThemeProvider'ın mount anındaki `applyTheme()` çağrısı tamamen
kaldırıldı** (kök seviyede hidrasyon sırasında hiç `setState` yok):

```
✓ 1 ... :66    ✘ 2 ... :87    ✘ 3 ... :100    ✘ 4 ... :128    ✓ 5 ... :145
3 failed / 2 passed
```

Hata GEÇMEDİ. (Kartın "koşullu setState de düzeltmedi" notu bununla tutarlı:
sorun setState'in koşullu olup olmaması değil, hiç ilgisi olmaması.)

Her iki deney de sonrasında geri alındı; `src/app/layout.tsx` ve
`src/components/ThemeProvider.tsx` bu görevde **değişmedi**.

### Gerçek kök neden (ölçümle)

İki elementin ne olduğu doğrudan tarayıcıdan okundu:

```
DIAG nodes [
  { "hiddenAncestor": null,       "offsetParentNull": false, "rect": 222,
    "text": "No opportunities in this workspace yetThe dashboard is calcu" },
  { "hiddenAncestor": "DIV#S:0",  "offsetParentNull": true,  "rect": 0,
    "text": "No opportunities in this workspace yetThe dashboard is calcu" }
]
DIAG raw occurrences=1            ← sunucu bu içeriği BİR KEZ gönderiyor
DIAG has <div hidden id="S:0">: true
```

Ata zinciri:

```
1) html > body > div.flex.flex-col > div.flex-1 > main > … > div#dashboard-panel-overview
2) html > body > div#S:0          > div.space-y-8 …  > div#dashboard-panel-overview
```

`<div hidden id="S:0">` React'in **sıra dışı akış (out-of-order streaming)
tamponudur**. Rota düzeyindeki `loading.tsx` bir Suspense sınırı kurar; sınır
varken Next kabuğu sayfa hazır olmadan boşaltır, sunucu render edilmiş sayfanın
tamamını `<body>` sonundaki gizli tampona park eder, istemci ise aynı alt ağacı
yerinde render eder. O pencerede belgede **her id'den iki tane** bulunur —
`page.locator('#dashboard-panel-overview')` ve `getByText(...)` gizli düğümü de
saydığı için Playwright strict mode ihlali verir.

### Beklemek çözmez (ölçüldü)

```
DIAG {
  "clearedAfterMs": 155.8,
  "log": ["499 readyState=interactive", "568 readyState=complete", "568 load"],
  "sheets": ["src_app_globals_162hn9o.css sheetLoaded=true media="]
}
```

`load` 568 ms'te geldi; ikinci kopya bundan **156 ms SONRA** düştü. Yani
`waitForLoadState('load')` bile pencerenin içinde kalır — testi bekleterek
düzeltmek mümkün değildi, testi gevşetmek de zaten yasaktı.

### Üretim derlemesinde de var

`pnpm build` (exit 0) + `next start -p 3100`, aynı spec:

```
✓ 1 :66 (732ms)   ✘ 2 :87 (347ms)   ✘ 3 :100 (398ms)   ✘ 4 :128 (449ms)   ✓ 5 :145 (537ms)
Error: strict mode violation: locator('#dashboard-panel-overview') resolved to 2 elements
3 failed / 2 passed
```

Bu bir `next dev` artefaktı DEĞİL: gerçek kullanıcının tarayıcısında da belge bir
süre iki kopya taşıyor (yinelenen `id`, belirsiz `aria-labelledby` hedefi).

### Düzeltme

`(app)` altındaki **18 `loading.tsx`** ve artık kullanılmayan
`src/components/WorkspaceLoadingSkeleton.tsx` kaldırıldı. Sınır aşağı taşınmadı,
tamamen kaldırıldı — çünkü aynı erken boşaltma daha önce `notFound()`'u 200
yapmıştı (TASK-MTRNO3LBZB2Q7, sınır o zaman aşağı taşınmıştı) ve aşağı taşımak bu
ikinci kusuru çözmüyor.

Kural iki yere yazıldı: `src/app/[locale]/(app)/layout.tsx` başındaki blok yorum
ve yeni **muhafız testi** `tests/app-shell-no-loading-boundary.test.ts`.

Muhafızın gerçekten kırmızı olduğu kanıtlandı (dashboard'a geçici bir
`loading.tsx` konarak):

```
AssertionError: a loading.tsx under (app) flushes the shell early: it turns
notFound() into 200 and leaves a hidden duplicate of the whole page in the DOM:
expected [ Array(1) ] to deeply equal []
+   "src/app/[locale]/(app)/[workspace]/dashboard/loading.tsx",
 Tests  1 failed (1)
--- restored, re-running ---
 Tests  1 passed (1)
```

### Fixture'ın tekrar koşulabilirliği

İlk koşumda süit `beforeAll`'da patladı — hedef hatadan önce gelen ayrı bir engel:

```
PrismaClientKnownRequestError:
Invalid `prisma.user.upsert()` invocation in scripts/seed-f10-e2e.ts:75:21
Unique constraint failed on the constraint: `User_email_key`
```

DB'de `f10-empty@fabrika.test` adresini **başka bir id** ile tutan artık bir satır
vardı (`cmtu6umhv000vk3xkpvaibi5q`): giriş akışı e-postadan kullanıcı yarattığı
için rollback'i tamamlanmamış her koşum böyle bir satır bırakır ve sonraki her
koşumu elle temizlemeye kadar bloke eder. Satır silindi ve `seatTenant()` artık
adresi upsert'ten önce sahipleniyor, böylece seed gerçekten yeniden koşulabilir.

