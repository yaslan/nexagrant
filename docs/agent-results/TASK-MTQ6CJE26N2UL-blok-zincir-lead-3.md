# TASK-MTQ6CJE26N2UL — Dalga 3: kapanış doğrulaması (S8 ölçümü → 2026-09-07 ölçümü)

**Ajan:** LEED-EN (`blok-zincir-lead`) · **Sprint:** S8 · **Tarih:** 2026-09-07

## 1) Ne yapıldı

Bu kart bir orkestrasyon kartı: "depoyu ölç → işi böl → dağıt → izle". Dalga 1 ölçümü ve
7 görev açılışını, Dalga 2 ise 12 görevlik sprint dağıtımını yaptı (`-1.md`, `-2.md`).
Bu dalgada kartın **kendi kapanış kapısı** koşuldu: 2026-09-06 ölçümündeki HER gösterge
AYNI komutla yeniden ölçüldü, kart iddiasına değil çıktıya bakıldı.

### Ölçüm karşılaştırması

| Gösterge | 2026-09-06 (kart açılışı) | 2026-09-07 (şimdi) | Durum |
|---|---|---|---|
| `pnpm lint` | 554 hata / 238 uyarı | **0 hata** / 171 uyarı | ✅ kapandı |
| `pnpm test` | 317/321 (4 kırmızı taban) | **708/721** (1 kırmızı, aşağıda) | ✅ taban çizgisi temizlendi |
| `demo-tenant`/`demo-user-id` canlı geri düşüş | 46 eşleşme, 20+ dosya | **0 canlı** (16 eşleşmenin hepsi YORUM) | ✅ kapandı |
| `withTenant` kullanan dosya | 4 | **43** | ✅ kapandı |
| İkinci sayfa ağacı | `(marketing)/` + `portal/` (7 sayfa) | `src/app` altında yalnız `[locale]` + `api` | ✅ kapandı |
| Manifest `routes[]` | 11 manifestin 0'ında | **11/11** | ✅ kapandı |
| `requireModule`/`checkModuleAccess` | 1 kullanım | 6 kullanım | 🟡 kısmi (aşağı bak) |
| G0 kanonik skorlayıcı | hiç çağrılmıyor, mock 92 | `computeG0ForOpportunity` detay sayfasından + `evaluateGate` içinden çağrılıyor | ✅ kapandı |
| Commit'siz dosya | 60+ | 1 dizin (aktif worker WIP'i) | ✅ kapandı |
| Sprint dağıtımı | — | `sprint-1788728327788` **12/12 done, 0 failed** | ✅ |

## 2) Kanıt (kopyalanmış komut çıktıları)

```
$ pnpm lint | tail -3
  256:11  warning  'res' is assigned a value but never used  @typescript-eslint/no-unused-vars
✖ 171 problems (0 errors, 171 warnings)
```

```
$ pnpm test | tail -5
 Test Files  1 failed | 64 passed | 2 skipped (67)
      Tests  1 failed | 708 passed | 12 skipped (721)
   ❯ tests/modules/route-catalog.test.ts:38 — "settings/calendar" katalogda yok
```

```
$ grep -rn "demo-tenant\|demo-user-id" src | sed 's/:.*//' | sort | uniq -c
  10 src/lib/billing/lifetime-licence.test.ts     ← test fixture
   2 src/lib/tenant.ts                            ← YORUM (kaldırılan geri düşüşü anlatıyor)
   1 src/lib/k5-pipeline/pipelineStore.ts         ← YORUM
   1 src/lib/billing/price-lock.test.ts           ← test fixture
   1 src/app/[locale]/admin/modules/page.tsx      ← YORUM
   1 src/app/[locale]/admin/billing/page.tsx      ← YORUM
```
Dört prod dosyasının hepsi tek tek açıldı: eşleşmeler `//` yorum satırlarının içinde,
kaldırılan geri düşüşü belgeliyor. Canlı `session?.tenantId || 'demo-tenant-1'` kalıbı yok.

```
$ grep -rl "withTenant" src | wc -l
43
$ ls src/app
[locale]  api  favicon.ico  global-error.tsx  globals.css  layout.tsx  not-found.tsx
$ grep -l "routes:" src/modules/*/manifest.ts | wc -l
11
```

```
$ grep -rn "computeG0ForOpportunity" src --include="*.tsx" --include="*.ts" | grep -v test
src/lib/gates/evaluate.ts:108:  const computation = await computeG0ForOpportunity(tx, tenantId, opportunityId);
src/app/[locale]/(app)/[workspace]/pipeline/[id]/page.tsx:111:  return { opp, g0: await computeG0ForOpportunity(tx, tenantId, id), efforts };
```

```
$ agentspace_sprint_status
sprint-1788728327788 [SETTLED] — 12/12 done, 0 in-flight, 0 pending, 0 failed, 0 skipped
```

### Tek kırmızı: aktif worker'ın yarım dosyası — regresyon DEĞİL

```
$ git status --porcelain
?? src/app/[locale]/(app)/[workspace]/settings/calendar/

$ pnpm typecheck
settings/calendar/page.tsx(3,37): error TS2307: Cannot find module '@/lib/auth/require-tenant-action'
settings/calendar/page.tsx(5,32): error TS2307: Cannot find module './client'
```
Not: bu ölçüm bir anlık görüntüdür — dört worker pane'i canlı çalışıyor, rapor yazılırken
commit'siz giriş sayısı 1'den 9'a çıktı (m9 takvim, m11 Part-B editör, i18n katalogları).
Hepsi aktif kartların WIP'i; 2026-09-06'daki "60+ sahipsiz dosya" tablosuyla aynı şey değil.

Bu dizin commit'lenmemiş ve `pane-35 blok-zincir-dse [WORKING]` şu an TASK-MTPZLC9PI5VEH
(Google/Outlook takvim sync) üzerinde çalışıyor. Typecheck hatası da tek test hatası da
AYNI yarım dosyadan geliyor. Ona dokunulmadı (başka worker'ın kapsamı).

## 3) Değişen dosyalar
- `docs/agent-results/TASK-MTQ6CJE26N2UL-blok-zincir-lead-3.md` (bu dosya)
- `.agentspace/memory/shared/fabrika-grep-count-drop-may-be-comments.md` (yeni)
- Kod değişikliği YOK — bu bir ölçüm/kapanış dalgası.

## 4) Riskler
- **Modül kapısı hâlâ opt-in.** 6 kullanım var ama manifest `routes[]` otomatik uygulanmıyor;
  yeni bir rota eklenirse kapısız kalır. Açık kart: TASK-MTQZ85NESC17T (backlog).
- **`pnpm gate` şu an kırmızı** — WIP yüzünden. DSE takvim işini bitirip commit edene kadar
  başka hiçbir worker'a "gate temiz" DoD'lu iş verilmemeli, yanlış kırmızı görürler.
- 171 lint uyarısı sıfırlanmadı; kapı hataya bakıyor, uyarı borcu duruyor.

## 5) Açık sorular
- Modül kapısının otomatikleştirilmesi (TASK-MTQZ85NESC17T) S12'ye alınsın mı, backlog'da mı kalsın?
- 171 lint uyarısı için ayrı bir temizlik kartı isteniyor mu, yoksa uyarı seviyesi kabul mü?

## 6) Sonraki adım
Bu kart kanıtla kapanıyor (done). DSE takvim commit'i indikten sonra `pnpm gate` yeniden
koşulup yeşil teyit edilecek; kırmızı kalırsa düzeltme kartı açılacak.
