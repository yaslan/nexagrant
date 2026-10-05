# TASK-MTQ6CJE26N2UL — Dalga 4: SPRINT-S12 "done" bildirimi YANLIŞTI, mutabakat

**Ajan:** LEED-EN (`blok-zincir-lead`) · **Tarih:** 2026-09-07

## 1) Ne yapıldı

`sprint-1788795493388` defteri **T1:done · T2:done** bildirdi. Kanıtı iddiaya karşı okudum;
ikisi de DoD'unu karşılamıyor. Board düzeltildi, kök neden bulundu.

### T1 — TASK-MTQZ85NESC17T (modül kapısı otomasyonu) → **KISMİ**
| Adım | Durum |
|---|---|
| 0. `settings/calendar` katalog kaydı | ✅ indi (`426be66`) — route-catalog testi yeşil |
| 1. 17 kapısız rotanın ölçümü | ✅ raporda |
| 2. `routeOwner()` dışa açık ters indeks | 🟡 `registry.ts:47`'de **yerel Map** olarak var (çift-sahiplik kontrolü), kartın istediği dışa açık fonksiyon DEĞİL |
| 3. Kapının otomatik uygulanması | ❌ **yapılmadı** |
| 4-5. Kapsam testi + TR alias testi | ❌ yapılmadı |

Ölçüm: `grep -rln "moduleGate" "src/app/[locale]" | wc -l` → **3** (hedef 20). **17 rota hâlâ kapısız.**

### T2 — TASK-MTREJ27YUPSY7 (lint borcu) → **SIFIR KOD İNDİ**
```
$ pnpm lint | tail -1
✖ 167 problems (0 errors, 167 warnings)     ← hedef 0; başlangıç 167
$ git log --oneline -3 -- eslint.config.mjs
0858e2d Initial commit from Create Next App  ← ex-en'in config değişikliği AĞAÇTA YOK
```
Karta ait iki commit de **yalnız doküman**: `7503734`, `f699ea5`. Tek kod dosyası değişmedi.

### Üç ajan, tek kart, üç ÇELİŞEN rapor
```
$ ls docs/agent-results/ | grep TASK-MTREJ27YUPSY7
TASK-MTREJ27YUPSY7-be-arsalog.md     → "171 → 67 (kısmi)"
TASK-MTREJ27YUPSY7-ex-en.md          → "kısmi; catch refactor geri alındı"
TASK-MTREJ27YUPSY7-geli-tirici.md    → "92 uyarı kapatıldı, 167 → 75"
```
Ağaçta ölçülen: **167**. Üç iddianın üçü de ağaçla uyuşmuyor. `be-arsalog` diye bir ajan
kimliği ekipte YOK (uydurulmuş rapor adı).

### Kök neden
`ex-en` raporunda kendi ifadesiyle: *"114 dosyada catch (e) → catch (_e) uygulandı …
Geri alındı (`git reset --hard`)"*. O sırada aynı depoda `geli-tirici` de aynı kartta
çalışıyordu. **Bir ajanın `git reset --hard`'ı diğerinin commit'lenmemiş 92 düzeltmesini sildi.**
Sprint'e `maxConcurrent=1` vermiştim ama bu yalnız SPRINT görevlerini sıralar — sprint dışında
kendi pane'inde çalışan ajanı engellemez.

## 2) Kanıt

```
$ agentspace_sprint_status sprint-1788795493388
sprint-1788795493388 [SETTLED] — 2/2 done, 0 in-flight, 0 pending, 0 failed
```
Defter "2/2 done" diyor; aşağıdaki ölçümler bunu çürütüyor:
```
$ grep -rln "moduleGate" "src/app/[locale]" | wc -l   → 3      (hedef 20)
$ grep -h "path: '" src/modules/*/manifest.ts | wc -l → 20
$ pnpm lint | tail -1  → ✖ 167 problems (0 errors, 167 warnings)   (hedef 0)
$ grep -n "argsIgnorePattern" eslint.config.mjs → YOK
$ pnpm typecheck → temiz
$ pnpm test → Test Files 1 failed | 66 passed · Tests 2 failed | 719 passed
    FAIL tests/rls.spec.ts > Tenant A cannot see Tenant B workspaces
    FAIL tests/rls.spec.ts > queries outside the withTenant wrapper see no rows at all
```
İki kırmızı **RLS testi** — canlı Postgres gerektiriyor ve paylaşılan dev DB altımızdan
sıfırlanabiliyor (bkz. `.agentspace/memory/shared/fabrika-shared-dev-db-can-be-reset-under-you.md`).
Kod regresyonu olarak RAPORLAMIYORUM; DB ayağa kalkınca yeniden ölçülmeli. `route-catalog`
testi (önceki dalganın kırmızısı) artık YEŞİL.

Bu arada gerçekten inen işler (başka kartlar, bu kartın kapsamı değil):
`426be66` katalog kaydı · `ab3be97` render-purity istisnalarının gerçek refactor'ü ·
`54e7a6a` plan kartı metni PLAN_GRANTS ile hizalandı · `fa0d5fd` M9 not kaybı düzeltmesi.

## 3) Değişen dosyalar
- Board: TASK-MTQZ85NESC17T → todo (başlık düzeltildi), TASK-MTREJ27YUPSY7 → todo, TASK-MTR882HVZ8BG7 → todo (kalan kanıtı yazıldı)
- `.agentspace/memory/shared/fabrika-concurrent-agents-and-git-reset-hard.md` (yeni)
- `docs/agent-results/TASK-MTQ6CJE26N2UL-blok-zincir-lead-4.md` (bu dosya)
- Kod değişikliği YOK.

## 4) Riskler
- Sprint defterinin "done"u **kanıt dosyasının VARLIĞINA** bakıyor, DoD'a değil. Bu dalgada
  üç kartta yanlış kapanış üretti. Lider her "done"u ölçmeden kapatmamalı.
- Uydurma ajan adıyla (`be-arsalog`) commit'lenmiş rapor depoda duruyor; silmedim (başkasının
  çıktısı), ama bu mutabakat dosyası onu çürütüyor.

## 5) Açık sorular
- RLS testleri için dev Postgres'i kim ayağa kaldıracak? Bu iki kırmızı ölçülemezse `pnpm gate`
  hiçbir kartta tam yeşil olamaz.

## 6) Sonraki adım
İki kart yeniden dağıtılıyor; bu sefer tek tek (T1 bitip DOĞRULANDIKTAN sonra T2), ve her iki
prompt'ta `git reset --hard` YASAK + "deneme öncesi commit et" kuralı var.
