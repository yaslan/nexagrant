# TASK-MUO64UQJUWEBI — crw-fb — TAMAM

**createOpportunity girdisi zod ile doğrulanıyor, tampon yalnız gerçek DB kesintisinde (İNCELEME-83 Y-1). Alan slug'ı normalize ediliyor; sonsuz yönlendirme ve `default`'taki 500 kapandı (O-1).**

Dal: `crw-fb/muo64u-slug-validate` (dev 47c96594'ten açıldı, dev aea1a63d birleştirildi). Çalışma dizini kendi worktree'm. DB izole: `crwfb64u-pg` 127.0.0.1:5464. Paylaşılan :5433'e hiçbir şey yazılmadı.
Not: önceki koşu ağ kesintisiyle kesilmişti ve ondan geriye dal, worktree ya da dosya kalmamıştı. İş dev'den yeniden başladı.

Platform beyanı: **mac** (Darwin 27.0 / macOS 27.0.1, Apple Silicon; Node 26.5, Chrome kanalı Playwright). Değişen kod platforma bağlı değil: süreç, dosya yolu, kabuk ya da ikili adı yok. Yalnız saf string doğrulama, Prisma/pg hata sınıflandırma ve Next yönlendirmesi var. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız mac var. Koda bakınca davranış aynı olmalı: soket errno adları (`ECONNREFUSED` vb.) Node'da her platformda aynı.

## 1. Ne yapıldı

| # | Değişiklik | Dosya |
|---|---|---|
| 1 | `CreateOpportunityInput` zod şeması. `workspaceSlug` küçük harfli kebab ASCII, en fazla 63 karakter (`isWorkspaceSlug`). Metin alanları sınırlı string, NUL ya da kontrol karakteri içeremez (notlarda `\n` ve `\t` serbest). `stage` Gate enum'u. Geçmeyen girdi `INVALID_INPUT` alır; sorgu atılmaz, tampona yazılmaz. | `pipeline/actions.ts` |
| 2 | `catch` artık yalnız `isDatabaseUnavailable(err)` doğruysa tampona düşüyor. DB'nin reddettiği başka her hata `CREATE_FAILED` dönüyor. | `pipeline/actions.ts`, yeni `src/lib/db-unavailable.ts` |
| 3 | Satır commit edildikten sonra G0 skoru hata verirse oluşturma başarısız sayılmıyor, kart skorsuz kalıyor. Önceden bu durumda satır hem DB'de hem tamponda duruyordu. Madde 2'den sonra yeni bir risk doğacaktı: satır varken `CREATE_FAILED` dönmek, kullanıcıyı tekrar denemeye ve satırı iki kez dosyalamaya iterdi. | `pipeline/actions.ts` |
| 4 | `findScopedWorkspace`: slug dilbilgisine uymuyorsa sorgu atmadan `null` dönüyor. Takma ad ya da `null` ile çözülen en eski alanın saklı slug'ı URL olamıyorsa yine `null` dönüyor; alan yok sayılıyor, yönlendirme hedefi yapılmıyor. | `src/lib/workspaces.ts` |
| 5 | `normalizeWorkspaceSlug(segment)`: sırayla decode, NFC ve küçük harfe çevirme yapıyor; sonuç dilbilgisine uymazsa `null`. Bozuk kaçış dizisinde hata fırlatmıyor, `null` dönüyor. Çağrı detay sayfası bunu kullanıyor: `null` gelirse `notFound()`, `WS-B` gelirse `/ws-b/…` adresine 307. | `src/lib/workspaces.ts`, `calls/[id]/page.tsx` |

**Sınıflandırıcı neden allow-list.** Kesinti yedeği yalnız kesintiyi görmeli. Tanınmayan bir bağlantı hatası tampona düşmez ve açık bir ret olarak döner. Bu güvenli yöndeki hatadır. Tersi, yani sahte bir `success`, Y-1'in ta kendisiydi. Hata şekillerini canlı ölçtüm, Prisma 7 + `@prisma/adapter-pg` üzerinde, `createDbClient` ile:
```
nul      | PrismaClientKnownRequestError | code= P2039 | adapter cause 22021 "invalid byte sequence for encoding UTF8: 0x00"
obj      | PrismaClientValidationError   | Unknown argument `foo`
arr      | PrismaClientValidationError   | Argument `slug`: Invalid value provided. Expected StringFilter or String
num      | PrismaClientValidationError   | ... provided Int
refused  | PrismaClientKnownRequestError | code= ECONNREFUSED          (port kapalı)
tx-refused | AggregateError              | code= ECONNREFUSED          ($transaction içinde)
badauth  | PrismaClientKnownRequestError | code= P1000
dns      | PrismaClientKnownRequestError | code= P1001
blackhole| Error (kodsuz)                | "Connection terminated due to connection timeout"  (1007 ms, pool connectionTimeoutMillis)
```
Kabul edilenler: Prisma P1000/P1001/P1002/P1008/P1011/P1017/P2024; Node soket errno'ları; PG `08xxx`, `57P01-03` ve `53300` (hem `code`'da hem `meta.driverAdapterError.cause.code`'da); pg-pool mesajları; `PrismaClientInitializationError`. `cause` ve `AggregateError.errors` zinciri de geziliyor.

## 2. Kanıt

### Birim + mutant
Yeni ve güncellenen testler: `tests/workspace-scoped-writes.test.ts` (+27), `tests/db-unavailable.test.ts` (17, yeni), `tests/call-topic-route.test.ts`. Sonuncusundaki kaynak-metin testi değişken adı değiştiği için güncellendi (`requested`) ve normalize'nin sorgudan önce geldiğini de doğruluyor.

14 mutant uygulandı, hepsi öldü (`python3 mut.py`, her biri iki test dosyasına karşı):
```
M1 safeParse atlandı                     | ÖLDÜ | Failed Tests 16
M2 catch her hatayı kesinti sayar        | ÖLDÜ | Failed Tests 1
M3 slug dilbilgisi yok                   | ÖLDÜ | Failed Tests 9
M4 NUL/kontrol karakter kontrolü yok     | ÖLDÜ | Failed Tests 2
M5 findScopedWorkspace ön-kontrol yok    | ÖLDÜ | Failed Tests 1
M6 en-eski alan son-filtresi yok         | ÖLDÜ | Failed Tests 1
M7 normalize küçük harf yok              | ÖLDÜ | Failed Tests 1
M8 normalize decode try yok              | ÖLDÜ | Failed Tests 1
M9 soket errno listesi yok               | ÖLDÜ | Failed Tests 4
M10 pg sürücü mesajı yok                 | ÖLDÜ | Failed Tests 1
M11 cause zinciri gezinmesi yok          | ÖLDÜ | Failed Tests 1
M12 skor hatası try yok                  | ÖLDÜ | Failed Tests 1
M13 PG 08xxx adaptör kodu yok            | ÖLDÜ | Failed Tests 1
M14 slug uzunluk sınırı yok              | ÖLDÜ | Failed Tests 1
```

### Canlı Y-1 (next build + next start :3564, izole DB, cs-fb'nin İNCELEME-83 fikstürleri, gerçek action id `40141539…`)
curl ile yeniden oynatma:
```
1 restr "ws-a"            -> "success":false,"error":"WORKSPACE_NOT_FOUND"
2 restr "ws-c"            -> "success":false,"error":"WORKSPACE_NOT_FOUND"
3 restr "WS-B"            -> "success":false,"error":"INVALID_INPUT"
4 restr ""                -> "success":false,"error":"INVALID_INPUT"
5 restr "ws-a\u0000"      -> "success":false,"error":"INVALID_INPUT"      (önce: success:true TAMPON)
6 restr {"contains":"ws"} -> "success":false,"error":"INVALID_INPUT"
7 restr {"foo":1}         -> "success":false,"error":"INVALID_INPUT"      (önce: TAMPON)
8 restr ["ws-a"]          -> "success":false,"error":"INVALID_INPUT"      (önce: TAMPON)
9 restr 7                 -> "success":false,"error":"INVALID_INPUT"      (önce: TAMPON)
10 restr "çalışma alanı"  -> "success":false,"error":"INVALID_INPUT"
11 restr "ws-b"           -> "success":true, workspaceId "o83-ws-b"       (meşru yol çalışıyor)
none/t5u/t6u "x\u0000" | {"foo":1} | 7 -> INVALID_INPUT (9/9);  "default" -> WORKSPACE_NOT_FOUND (3/3)
nomem (hepsi)            -> TENANT_SCOPE_REQUIRED (4/4)
title "…\u0000" -> INVALID_INPUT;  title {"foo":1} -> INVALID_INPUT
```
Gerçek Chrome'da tıklama (Playwright, istek gövdesi yolda değiştirildi). Kareler `shots/01..04`:
```
1 restr gerçek tıklama → /tr/ws-b/firsatlar
2 restr tampered nul → "success":false,"error":"INVALID_INPUT" | url=/tr/ws-b/cagrilar/HORIZON-CL2-2026-D1-01
2 restr tampered obj → "success":false,"error":"INVALID_INPUT" | url=…   (kullanıcıya "Fırsat eklenemedi. Lütfen tekrar deneyin.")
2 restr tampered arr → "success":false,"error":"INVALID_INPUT"
2 restr tampered num → "success":false,"error":"INVALID_INPUT"
4 owner ws-a pano işaretçileri: CRW64U-11
```
DB'nin son hâli: yalnız iki meşru satır var, ikisi de ws-b'de. Sunucu günlüğünde bir kez bile `resilient pipeline store` ya da `refused by the database` geçmiyor, yani ret sorgudan önce gerçekleşti.
```
 CRW64U-11          | o83-ws-b
 Health & Wellbeing | o83-ws-b
```

### Canlı O-1
```
t8u /tr/calls/topic/…            : 307 -> /tr/no-workspace 200            (önce: 8+ hop döngü, ERR_TOO_MANY_REDIRECTS)
t8u /en/calls/topic/…            : 307 -> /en/no-workspace 200
t8u /tr/default/cagrilar/…       : 307 -> /tr/calls/topic/… 307 -> /tr/no-workspace 200   (önce: 500 Invalid character in header)
t8u /en/default/calls/…          : 307 -> /en/calls/topic/… 307 -> /en/no-workspace 200
t8u /tr/%C3%A7al…%20alan%C4%B1/… : 404
restr /tr/WS-B/cagrilar/…        : 307 -> /tr/ws-b/cagrilar/… 200
restr /tr/ws-a/cagrilar/…        : 307 -> /tr/calls/topic/… 307 -> /tr/ws-b/cagrilar/… 200   (regresyon yok)
owner /tr/default/cagrilar/…     : 307 -> /tr/ws-a/cagrilar/… 200
owner /tr/calls/topic/…          : 307 -> /tr/ws-a/cagrilar/… 200
none  /tr/calls/topic/…          : 307 -> /tr/no-workspace 200
Chrome: t8u tr/en topic ve default → 200 /…/no-workspace (hata yok)
```

### Kapılar (dev aea1a63d ile birleşik ağaçta)
```
tsc --noEmit 0 · eslint (tam) 0 · i18n:check 0 ("both catalogs agree")
next build 0 (tek uyarı src/instrumentation.ts process.exit/Edge — önceden var, dokunulmadı)
npx vitest run: Test Files 290 passed | 6 skipped · Tests 3498 passed | 172 skipped · 0 failed
```
Atlanan 172 test ortam kapısına bağlı; bu değişiklikten önce de atlanıyordu. RLS canlı testleri izole DB'de `fabrika_app` ile koştu ve geçti.

## 3. Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts`
- `src/app/[locale]/(app)/[workspace]/calls/[id]/page.tsx`
- `src/lib/workspaces.ts`
- `src/lib/db-unavailable.ts` (yeni)
- `tests/workspace-scoped-writes.test.ts`, `tests/db-unavailable.test.ts` (yeni), `tests/call-topic-route.test.ts`

## 4. Riskler
- **Slug dilbilgisi sıkı.** Kodda alan yaratan her yol (`default`, `main`, `demo-ws`, `pilot-ws-*`, roster kebab) bu dilbilgisine uyuyor. DB'de elle yazılmış ASCII dışı, büyük harfli ya da alt çizgili bir slug varsa o alan artık yok sayılıyor: 404 ya da no-workspace alır, fırsat eklenemez. Bugün döngü ya da 500 veren durum buydu. Prod'da böyle bir satır var mı diye bakılmalı: `select slug from "Workspace" where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'`.
- **`""` slug artık reddediliyor.** cs-fb bunu "izinli en eski alan" olarak kabul etmişti. Uygulamadan boş slug gönderen bir çağrı yok (`board.tsx` ve `add-button.tsx` URL segmentini geçiriyor), bu yüzden bilerek daraltıldı.
- **Allow-list dışında kalan gerçek bir kesinti biçimi olursa** tampona düşmez ve `CREATE_FAILED` döner. Güvenli yön bu. Yeni bir şekil görülürse `db-unavailable.ts`'e eklenir.

## 5. Açık sorular / kapsam dışı gözlemler
1. **Bozuk yüzde kaçışı 500 veriyor** (`/tr/%E0%A4%A/cagrilar/x`, `/tr/%E0%A4%A/firsatlar`, `/tr/calls/topic/%E0%A4%A`). Oturumsuz istekte de oluyor, değiştirmediğim rotalarda da. Yani Next'in segment çözümlemesinde, sayfa kodundan önce patlıyor. Bu değişiklikten gelmiyor. İstenirse ayrı kart açılabilir (proxy'de `decodeURIComponent` ön-kontrolü → 404).
2. **Pano kiracı genelinde listeliyor.** ws-b'deki meşru `CRW64U-11`, owner'ın ws-a panosunda da görünüyor. cs-fb'nin ölçümünde de böyleydi (DB satırları 4, 6 ve 10 ws-a panosundaydı). Y-1'in tampon açığından bağımsız, önceden var olan bir durum. Alan başına filtre istenip istenmediği ürün kararı.
3. **Tampon üst sınırı yok** (cs-fb'nin Y-1 etki notu). Artık yalnız gerçek kesintide yazılıyor, sınırsız büyüme ancak uzun bir kesintide mümkün. Sınır bu kartın kapsamında değil.

## 6. Sonraki adım
cs-fb yeniden inceleyebilir: Y-1 tablosu ve O-1 zincirleri yukarıda. Merge dev'e yapıldı, push yapılmadı.
