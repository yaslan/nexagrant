# TASK-MUN36Z9JSJAM4 — FB İNCELEME-33: TASK-MUN2TQ1W6WP8E (fe-fb), İNCELEME-29 düzeltmelerinin yeniden kontrolü

**İnceleyen:** crw-fb · **Sprint:** FB-KAMU-2 · **Dal:** dev · **Tarih:** 29.09.2026
**İncelenen commit'ler:** `d03046cc`, `d5f5365f` (kod) · `079c3fd8` (fe-fb raporu)
**İncelenen HEAD:** `a2c89b99`, temiz worktree (`--detach`). Bu HEAD'den `6e8505d4`'e kadar 4 commit daha geldi. Hiçbiri incelenen dosyalara dokunmuyor (`git log a2c89b99..HEAD -- <dosyalar>` boş).
**Kaynak bulgular:** `docs/agent-results/TASK-MUN2AMIFGBQ90-crw-fb.md` (İNCELEME-29).

## Karar

| Kart | Karar |
|---|---|
| **TASK-MUN2TQ1W6WP8E** (fe-fb, düzeltmeler) | **ONAY**. B-1, B-2, Ö-1, Ö-2 ve Ö-3 kapandı. Bloke eden bulgu yok. |
| **TASK-MUMT3KVHJTYX0** (se-fb, ilk teslim) | **ONAY, kapanabilir**. İNCELEME-29'u DÜZELTME GEREKLİ yapan B-1 ve B-2 artık kapalı. Envanter (İNCELEME-29 §1) güncel HEAD'de hâlâ geçerli. Tek yeni okuma `lib/invitations/accept.ts:106` ve bu okuma tokenHash'i dışarı vermiyor (aşağıda). Prod build'de dört yüzey temiz. |

Aşağıdaki Ö-1..Ö-3 bulguları öneridir. Hiçbiri bugün bir sızıntı değil ve ikisi de rafa kaldırılabilir. En değerlisi Ö-1: iki satırlık bir sayım eklenirse, bekçinin tek "iki kapı da kör" boşluğu kapanır.

## İNCELEME-29 bulgularının durumu

| Bulgu | Durum | Kanıt |
|---|---|---|
| B-1 nesne argümanlı ilişki include'u | **Kapandı** | E1, E2 ve E11 artık `offences=1`. MU3c (`include: { applicationParts: { orderBy } }`) kırmızı. |
| B-2 izin listesindeki başvuru sayfası kapısızdı | **Kapandı** (a ve b birlikte) | Birebir MU3 artık 2 kapıda kırmızı. `RELATION_INCLUDE_ALLOWLIST` kaldırıldı. Canlı ölçümde hash yok, `hasPortalLink` doğru. |
| Ö-1 select değeri denetlenmiyordu | **Kapandı** | E6, E7 ve E8 artık 1. MU1, MU4 ve MU5 bekçide de kırmızı (önceden yalnız prop testi yakalıyordu). |
| Ö-2 erişim biçimi kaçışları | **Kapandı** (E3/E9 kod, E4/E5/E10 doküman) | E3 ve E9 artık 1. E4, E5 ve E10 hâlâ 0; bekçi dokümanında "Known blind spots" altında listeli. |
| Ö-3 kapsam | **Kapandı** | Kapsam artık src/app'in tamamı. Repo taraması 0 ihlal veriyor. src/lib bilerek kapsam dışında ve gerekçesi dokümanda. |

## Yeni bulgular (önem sırasıyla; hiçbiri bloke etmiyor)

### Ö-1 — `SECRET_SELECT_ALLOWLIST` dosya düzeyinde: izinli dosyaya eklenen yeni bir okuma iki kapıdan da geçiyor · Düşük-Orta
`tests/secret-model-select-guard.test.ts:99-104` anahtarı `dosya::model.sütun` biçiminde tutuyor. `selectProblem` (`:219`) bu yüzden o dosyadaki **her** `magicTokenHash: true` select'ini affediyor. Tazelik testi (`:291-298`) yalnız "en az bir tane var mı" diye bakıyor.

**Mutant N5:** `src/modules/m11/server/actions.ts`'in sonuna şu yeni server action eklendi:
```ts
export async function peekPart(id: string) {
  const { withSystemScope } = await import('@/lib/system-scope');
  return withSystemScope('tenant-discovery', 'm11.peek', (tx) =>
    tx.applicationPart.findUnique({ where: { id }, select: { id: true, magicTokenHash: true } })
  );
}
```
Sonuç: `Tests 39 passed (39)`, `tsc 0`. Bu action hash'i istemciye döndürür, ama:
- statik bekçi geçer, çünkü dosya izin listesinde;
- prop testi geçer, çünkü yalnız bilinen üç M11 action'ını çağırıyor;
- tsc geçer.

Bu, İNCELEME-29 B-2'deki "izinli satırı hiçbir kapı korumuyor" sınıfının bir kalıntısı. Fark şu: buradaki kaçış mevcut kodun silinmesiyle değil, **yeni kod** yazılmasıyla oluşuyor. Risk de yeni kodun en olası yazılma yolunda: `addBudgetLineByToken`'ın select'ini kopyalayan ikinci bir token'lı action. `m11/server/actions.ts` 600+ satırlık bir `'use server'` modülü.

**Önerilen düzeltme** (iki satır): izin listesi değerine beklenen sayıyı ekle (`portal/.../page.tsx` → 2, `m11/server/actions.ts` → 1). Tazelik testi `\bmagicTokenHash\s*:\s*true\b` eşleşmelerini **tam** bu sayıyla karşılaştırsın. Böylece yeni bir kopya kırmızı olur ve bir inceleyicinin izin listesini güncellemesi gerekir.

### Ö-2 — `hasPortalLink` artık ikinci bir sorgudan geliyor, ama doğruluğu sabitlenmemiş · Düşük (işlev, güvenlik değil)
`application/page.tsx:35-38` bağlantılı parçaları `where: { opportunityId, tenantId, magicTokenHash: { not: null } }` ile buluyor. Sahte `applicationPart.findMany` (`tests/secret-model-props.test.tsx`, `findMany: vi.fn(async (args) => [project(h.PART_ROW, args.select)])`) `where`'i yok sayıyor ve her zaman aynı satırı döndürüyor. Test yalnız `hasPortalLink: true` dalını doğruluyor.

**Mutant N1:** `magicTokenHash: { not: null }` filtresi silindi. Sonuç: `Tests 39 passed (39)`, `tsc 0`. Bu hâliyle her parça "portal bağlantısı var" gösterirdi. Eski destructure'da bu değer doğrudan hesaplanıyordu; yeni sorgu bu riski getirdi.

Bugün kod doğru. Canlı ölçümde Part A (hash'li) `true`, Part B (hash'siz) `false` döndü (Kanıt §3).

**Önerilen düzeltme:** Sahte `findMany` `where.magicTokenHash?.not === null` durumunda yalnız hash'i dolu satırları döndürsün. Fixture'a hash'i `null` olan bir `PART_B` eklenip `partB.hasPortalLink === false` assert edilsin.

### Ö-3 — Bekçinin belgelenmemiş yeni kör noktaları · Düşük
Aşağıdakilerin hepsi `findOffences` ile `offences=0` veriyor:

| # | Biçim | Not |
|---|---|---|
| X1 | select içinde spread: `select: { id: true, ...T }` (T `{ accessToken: true }`) | |
| X2 / X3 | tırnaklı ya da hesaplanan anahtar: `'accessToken': true`, `['accessToken']: true` | |
| X4 | kısaltılmış ilişki: `const applicationParts = true; include: { applicationParts }` | |
| X5 | `groupBy({ by: ['accessToken'] })` | Aynı aileden olan `aggregate` (E10) listede, `groupBy` yok. |
| X8 | select'ten sonra gelen spread: `{ select: { id: true }, ...opts }` | `opts.select` undefined olursa bütün satır döner. |
| N4 | yorum soyucu: `/*` içeren bir dize (`'/settings/*'`) sonraki gerçek bir `/* … */` yorumuna kadar olan kodu siliyor | `stripComments` (`:117-119`) dizeleri tanımıyor. |

Dört mutant (N2, N3, N4, N6) gerçek takvim sayfasında denendi. Dördünde de statik bekçi geçti, runtime prop testi kırmızı oldu (`1 failed | 38 passed`). Yani test edilen sayfalarda ikinci kapı tutuyor.

Repo taramasına göre bugün hiçbiri yok:
- tırnaklı sır anahtarı: 0,
- secret model üzerinde `groupBy`/`aggregate`: 0,
- kısaltılmış ilişki include'u: 0.

N4 için yorum soyucunun kaldırdığı her parça tek tek kontrol edildi. Kapsamdaki dosyalarda silinen parçaların hepsi gerçek yorum; hiçbir gerçek okuma gizlenmiyor.

**Öneri:** X1, X2, X4, X5, X8 ve N4'ü bekçinin "Known blind spots" listesine ekle. En ucuz iki düzeltme:
- `groupBy`'ı ROW_OPS'a benzer bir `by`/`_max` kontrolüyle yakalamak,
- select içinde `...` görüldüğünde ihlal saymak.

### K-1 — `_count` sayımı yanlış pozitif veriyor (not)
`select: { _count: { select: { applicationParts: true } } }` bir sayı döndürür, ama bekçi bunu ihlal sayıyor (`offences=1`). Hata güvenli tarafta; bugün repoda örneği yok. Gerekirse `_count` altı atlanabilir.

## Kanıt

### 1. İNCELEME-29 mutantlarının yeniden koşusu ve yeni mutantlar
Temiz worktree @ `a2c89b99`. Her mutanttan sonra `git checkout HEAD -- src`; sonda `git status` = clean. Betik: `scratchpad/mut33.py` (repoya eklenmedi).

Başlangıç (mutantsız): `Test Files 2 passed (2) · Tests 39 passed (39)`.
```
## MU1 calendar select names accessToken  exit=1
    × src/app files and server actions never read a secret model without select
    × calendar settings page: <CalendarClient> props carry no OAuth token
    Tests  2 failed | 37 passed (39)
## MU2 tx['calendarConnection'], select dropped  exit=1
    × src/app files and server actions never read a secret model without select
    × calendar settings page: <CalendarClient> props carry no OAuth token
    Tests  2 failed | 37 passed (39)
## MU3 verbatim: 7bb11e85 page, destructure dropped  exit=1
    × src/app files and server actions never read a secret model without select
    × application page: <ApplicationClient> learns a portal link exists, never its hash
    Tests  2 failed | 37 passed (39)
    tsc: 0                                         ← tsc hâlâ kör, iki test kapısı tutuyor
## MU3b new page: include true  exit=1              Tests  2 failed | 37 passed (39)
## MU3c new page: include with orderBy, no select  Tests  2 failed | 37 passed (39)
## MU3d new page: relation select names hash       Tests  2 failed | 37 passed (39)
## MU4 calendar select: undefined  exit=1          Tests  2 failed | 37 passed (39)
## MU5 keys page select names keyHash  exit=1      Tests  2 failed | 37 passed (39)
## N1 app page: hash filter dropped (functional)  exit=0
    Tests  39 passed (39)      tsc: 0              ← Ö-2
## N2 calendar: secret via spread in select  exit=1
    × calendar settings page: <CalendarClient> props carry no OAuth token
    Tests  1 failed | 38 passed (39)               ← bekçi kör, prop testi tuttu (Ö-3 X1)
## N3 calendar: quoted key 'accessToken'           Tests  1 failed | 38 passed (39)  (yalnız prop testi)
## N4 calendar: string with /* then real comment hides the read
                                                   Tests  1 failed | 38 passed (39)  (yalnız prop testi)
## N5 m11 actions: new action returns hash (file allowlisted)  exit=0
    Tests  39 passed (39)      tsc: 0              ← Ö-1: iki kapı da kör
## N6 calendar: groupBy by secret                  Tests  1 failed | 38 passed (39)  (yalnız prop testi)
clean
```
**İNCELEME-29 mutantları 8/8 kırmızı; her birinde iki kapı birden.** fe-fb'nin MU1..MU4 tablosuyla birebir aynı.

### 2. Kaçış denemeleri (`findOffences`, test dosyasından import edildi)
```
PROBE E1 relation include with args, no select: offences=1
PROBE E2 relation include with where: offences=1
PROBE E3 bracket accessor: offences=1
PROBE E4 aliased delegate: offences=0          (belgeli kör nokta)
PROBE E5 raw SQL: offences=0                   (belgeli)
PROBE E6 select: undefined: offences=1
PROBE E7 conditional select: offences=1
PROBE E8 select naming the secret: offences=1
PROBE E9 optional-chained op: offences=1
PROBE E10 aggregate of secret: offences=0      (belgeli)
PROBE E11 relation select with nested include: offences=1
PROBE X1 spread in select: offences=0
PROBE X2 quoted key 'accessToken': offences=0
PROBE X3 computed key ['accessToken']: offences=0
PROBE X4 shorthand relation: offences=0
PROBE X5 groupBy by secret: offences=0
PROBE X8 spread after select overrides it: offences=0
PROBE X9 relation arg in variable: offences=0  (belgeli)
PROBE F1 _count of relation (false positive?): offences=1
```
E1..E11 için sonuç 8/11; fe-fb'nin raporuyla aynı. Prob dosyası worktree'de geçici olarak duruyordu ve silindi.

### 3. Canlı ölçüm: prod build, izole DB
- **DB:** `fabrika-postgres` içinde `crwfb_mun36`. Şema `prisma migrate diff --from-empty`, ardından `db:rls-role`, `db:rls` (`Policies in public: 0 → 112`) ve `db:seed`. Ortak `fabrika` DB'sine dokunulmadı.
- **Yalnız bu DB'de:** demo-tenant `planId='ultra'`, `M11=ON`. Prob satırları: `crwfb-probe-cal` (`CRWFBPROBE_ACCESS/REFRESH`), `crwfb-probe-key` (`CRWFBPROBE_KEYHASH_<sha>`), `crwfb-probe-partA` (hash = sha256 bilinen ham token), `crwfb-probe-partB` (hash `null`).
- **Worktree kapıları:**
  - `tsc_exit=0`
  - `lint_exit=0`
  - `next build` (PATH'te `node_modules/.bin`) → `build_exit=0`
- **Sunucu ve oturum:** `DEMO_LOGIN_ENABLED=false next start -p 3133`, `cwd` = kendi worktree'm. `:3000`'e ve onun `.next` dizinine dokunulmadı. Oturum alice için `next-auth/jwt encode` ile üretildi.

```
cal     html 200 text/html bytes=145738 | accessToken=0 refreshToken=0 keyHash=0 magicTokenHash=0 tokenHash=0 CRWFBPROBE=0 hashhex=0 | probe-ids=crwfb-probe-cal
cal     rsc  200 text/x-component bytes=118622 | … hepsi 0 … | probe-ids=crwfb-probe-cal
keys    html 200 text/html bytes=148983 | … hepsi 0 … | probe-ids=crwfb-probe-key
keys    rsc  200 text/x-component bytes=118101 | … hepsi 0 … | probe-ids=crwfb-probe-key
cal-tr  html/rsc 200 (/tr/main/settings/calendar) | … hepsi 0 … | probe-ids=crwfb-probe-cal
keys-tr html/rsc 200 (/tr/main/ayarlar/api-anahtarlari) | … hepsi 0 … | probe-ids=crwfb-probe-key
app     html 200 bytes=163611 | magicTokenHash=0 tokenHash=0 hashhex=0 hashprefix12=0 tenantId-in-part=0 | probe-ids=crwfb-probe-partA crwfb-probe-partB content=CRWFB_CONTENT_A CRWFB_CONTENT_B
app     rsc  200 bytes=118892 | (aynı, hepsi 0)
app-tr  html/rsc 200 | (aynı, hepsi 0)
{"id":"crwfb-probe-partA","part":"PART_A","content":{"summary":"CRWFB_CONTENT_A"…},"hasPortalLink":true}
{"id":"crwfb-probe-partB","part":"PART_B","content":{"summary":"CRWFB_CONTENT_B"…},"hasPortalLink":false}
```
- Takvim ve api-keys sayfalarında (tr + en, HTML + RSC) token, hash ve sentinel yok. Prob id'leri yanıtta görünüyor, yani ölçüm boş bir sayfada yapılmadı.
- Başvuru sayfası, İNCELEME-29'da M11 kilidi yüzünden ölçülememişti; bu kez ilk kez canlı ölçüldü. Parça prop'u yalnız `id/part/content/hasPortalLink` taşıyor (`tenantId` vb. de gitmedi). `client.tsx` yalnız `partA?.content`, `partA?.hasPortalLink`, `partA.id`, `partB?.content` ve `partB?.id` alanlarını okuyor, kaldırılan alanlara dokunmuyor.
- RSC isteği `RSC: 1` + `curl -L` ile yapıldı.

### 4. Envanter (TASK-MUMT3KVHJTYX0 kapanışı için)
`src/` içinde sır modellerine yapılan okumalar yeniden tarandı (src/app dışı + `use server` dahil). İNCELEME-29 tablosunda olmayan tek okuma `src/lib/invitations/accept.ts:106` (`0ae3175b`, kabul sayfası):
- `tokenHash`'i select'liyor, ama `classifyInvitation` (`:78-97`) açık bir `InvitationView` kuruyor (`id, email, tenantId, tenantName, role, expires`).
- Hash dışarı çıkmıyor.

Kalan okumalar İNCELEME-29 §1 ile aynı.

### 5. Temizlik
```
kill <kendi next start pid'im>  (lsof cwd = scratchpad/wt33 doğrulandı; :3133 dinleyici = 0)
DROP DATABASE crwfb_mun36 with (force) → pg_database'de kalan = 0
git worktree remove --force scratchpad/wt33 → worktree list'te yok
```

## Değişen dosyalar
- Yalnız bu rapor. Kod değiştirilmedi.

## Riskler
- Ö-1'deki senaryoda (izinli dosyaya kopyalanmış yeni bir token'lı action) iki kapı da kör kalıyor. Bu, gelecekteki bir kod değişikliğine bağlı bir risk; bugün bir sızıntı yok.
- Statik bekçi metin tabanlı. Ö-3'teki kör noktalar ancak prop testinin render ettiği sayfalarda ikinci kapıya takılıyor. Yeni bir sayfa ya da action eklenirse o dosya için prop testi de yazılmalı.

## Açık sorular
- Görevin sarmalayıcı bloğu sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUN2TQ1W6WP8E-fe-fb.md` dosyasına yazmamı istiyor. Bu yol hem repo dışında hem de incelenen ajanın (fe-fb) rapor adı. Oraya yazmak, bu incelemeyi fe-fb'nin teslimi gibi gösterirdi. Gövdedeki SONUÇ DOSYASI satırı esas alındı: bu dosya. İNCELEME-29 ve İNCELEME-32'de de aynı karar verilmişti. Denetçi o yolu beklerse bu görevi yanlışlıkla BAŞARISIZ sayabilir.
- Ö-1 ile Ö-2 aynı karta mı alınsın? İkisi de yalnız test dosyası değişikliği ve toplamı yaklaşık 20 satır.

## Sonraki adım
- fe-fb (isteğe bağlı küçük kart): Ö-1 sayım pini, Ö-2 `PART_B`/`where` fixture'ı, Ö-3 kör nokta listesi ve `groupBy`/spread kontrolü. Ardından N5 ve N1 yeniden koşulup kırmızı görülmeli.
- TASK-MUN2TQ1W6WP8E ve TASK-MUMT3KVHJTYX0 `done`'a alınabilir.

## Platform
- **Doğrulandığı yer:** macOS (Darwin 27.0.0), Node + pnpm, vitest 4.1.11, Next 16 prod build (`next start`), Docker Postgres `fabrika-postgres` (izole `crwfb_mun36`), curl ve grep.
- İncelenen kod platformdan bağımsız: Prisma `select`/`include` semantiği, RSC serileştirmesi ve metin tabanlı statik tarama. Bekçi yolları `path.sep` → `/` ile normalleştiriyor (`:276`), bu yüzden Windows'ta kapsam ve izin listesi anahtarları aynı kalır. `stripComments` ve regex'ler satır sonundan bağımsız. CRLF dosyada `[^\n]*` `\r`'yi de yutar; bu da sonucu değiştirmez.
- Windows ve Linux **koşulamadı**, çünkü bu makinede yalnız macOS var. Koddan bakınca aynı sonuç beklenir.
