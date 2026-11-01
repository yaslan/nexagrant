# TASK-MTQ6CJE26N2UL — Dalga 2: bekleyen tüm kartların sprint kuyruğuna bağlanması

## 1) Ne yapıldı
Patron direktifi: "tüm bekleyen görevleri ajanlara dağıt, biri bitince diğeri otomatik
devam etsin, ajanlar boşta beklemesin."

Board'daki bekleyen cekirdek kartları **koda karşı ölçüldükten sonra** tek uzun sprint'e
bağlandı: `sprint-1788728327788` (12 görev, maxConcurrent=4, plan diskte — oturum kapansa
da devam eder). Tek tek delegasyon yerine sprint seçildi; çünkü sprint per-worker
serialization yapıyor: bir worker işini bitirince kuyruğundaki sonraki görev otomatik
başlıyor, boşta beklemiyor.

Dağıtım:
| Worker | Kuyruk (sırayla) |
|---|---|
| geli-tirici | T1 tenant izolasyonu → T7 M6 gerçek veri → T9 iyzico → T12 lint kapısı |
| blok-zincir-dse | T2 G0 kanonik skorlayıcı → T8 M9.2 brief UI → T10 takvim sync |
| blockzincir-pm | T3 E11.4+E11.3 review doğrulama → T6 docker/seed + E10.2 kart doğrulama |
| ex-en | T5 sayfa ağacı tekilleştirme (T1'e bağımlı) |
| customer-support | T4 E11.2 feedback/triage e2e doğrulama |
| blog-yazar | T11 marketing i18n/SEO regresyon (T5'e bağımlı) |

Çakışma önleme: aynı dosyaya iki worker dokunmuyor. iyzico.ts ve marketing ağacı T1'e,
takvim T8'e, lint görevi tüm diğerlerine bağımlı yapıldı (repo geneline dokunduğu için en son).

## 2) Kanıt

Dağıtım öncesi gerçek ölçüm (kart iddiası değil, kod):

```
$ pnpm lint | tail -3
✖ 750 problems (537 errors, 213 warnings)
[ELIFECYCLE] Command failed with exit code 1
```

```
$ grep -rn "demo-tenant" src/ | wc -l
11
src/app/[locale]/admin/modules/page.tsx
src/app/[locale]/admin/billing/page.tsx
src/lib/iyzico.ts
src/lib/tenant.ts
src/lib/k5-pipeline/pipelineStore.ts
```

```
$ ls src/modules/m6 → manifest.ts server/{scoring.ts,actions.ts,__tests__} ui/{EvaluatorForm,EvaluationDashboard}.tsx
$ ls src/modules/m9 → manifest.ts server/actions.ts   (UI yok → M9.2 gerçekten açık)
$ src/lib/calendar.ts → yalnız generateIcsContent (Google/Outlook sync gerçekten yok)
$ src/app → [locale] YANINDA ikinci ağaç: (marketing)/ ve portal/ (7 sayfa)
```

Sprint durumu (başlatma anı):
```
sprint-1788728327788 [RUNNING] — 0/12 done, 4 in-flight, 8 pending, 0 failed
T1:dispatched · T2:dispatched · T3:dispatched · T4:dispatched · T5..T12:pending
```

## 3) Değişen dosyalar
- `.agentspace/memory/agents/blok-zincir-lead/fabrika-s8-s10-sprint.md` (yeni)
- `docs/agent-results/TASK-MTQ6CJE26N2UL-blok-zincir-lead-2.md` (bu dosya)
- Board: 13 kartın assignee/status alanı sprint'e hizalandı (kod değişikliği değil)

## 4) Riskler
- Worker pane'leri ~30 dk'da code 129 ile düşebiliyor; her göreve "20 dakikada bir dev'e
  commit et + `git diff --cached` ile doğrula" kuralı yazıldı, ama kayıp riski sıfır değil.
- T12 (lint, 537 hata) tek worker'da ve en sonda — sprint'in kuyruğunu o belirleyecek.
- T10 takvim sync ve T9 iyzico dış servis anahtarı isteyebilir; workerlara "anahtar üretme,
  eksikse raporla" talimatı verildi. Bu iki kart "önkoşul eksik" ile kapanabilir.

## 5) Açık sorular
- iyzico ve Google/Outlook için sandbox kimlik bilgileri var mı? Yoksa T9/T10 kod+mock ile
  kapanır, canlı doğrulama patron onayına kalır.
- E11.3'ün "%85 doğruluk" iddiası ölçülebilir değilse kart done'a alınamaz — T3 bunu ölçüyor.

## 6) Sonraki adım
`agentspace_sprint_status sprint-1788728327788` ile dalga takibi; ilk dalga (T1–T4)
raporları geldiğinde kanıtları okuyup kartları done'a al ya da düzeltme görevi aç.
