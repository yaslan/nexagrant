# NG-339 (TASK-MWSWIQ87TQIIA) — Ajans kurumsal küçük hücre eşiği 10, il kırılımı kaldırıldı

**Hüküm: HEDEF TUTMADI.** Eşik ve il kırılımı değişiklikleri tamam; ama dağıtılmış kayıt saldırısında ölçülen sızıntı 0/900'e inmedi (self-burn 6/900, ucuz doldurma 4/900, yalnız `spread` + `D = 0` kipinde). **Bu PR birleştirilebilir değildir — draft olarak kalmalı.** Açık kalan sızıntının kök nedeni kesin değil (aşağıda).

**Ajan:** sec-gnd (Güvenlik Mühendisi) · **Platform:** WSL2 Linux (Ubuntu 24.04), Node/pnpm WSL içinde · **Dal:** task/ng-339 · **Base:** se-fb/fo392-invite-code-limits (2c8fd518)

## Ne yapıldı

1. **Eşik 5 → 10.** `src/lib/agency/small-cell.ts`: `SMALL_CELL_THRESHOLD = 10`, `FUNNEL_ROUND_STEP = 10`; UI (`funnel-panel.tsx`, `reports-panel.tsx`), rapor (`report.ts`) ve i18n (`messages/tr.json`, `messages/en.json`) bu sabitlerden türetiyor (`{threshold}`, `{step}`, `shownRange()`); metinde sabit "5" yok.
2. **5e — il kırılımı KALDIRILDI (ayrım güvenilir değil).** Gerekçe kodda doğrulandı: `src/lib/oauth-registration.ts` her kod kaydında `tx.tenant.create` ile yeni bir kiracı açıyor ve `agencyId`'yi kodun ajansına bağlıyor. Ajansın kendi kurumlarını diğerlerinden ayıran bir iz yok; dolayısıyla "kendi kurumları hariç" hesabı güvenilir yapılamaz. Sonuç: panoda ve raporda il kırılımı yok (`report.ts` `byProvince` yazmıyor; rapor testi `İl kırılımı bu raporda yoktur.` ifadesini doğruluyor).
3. **Saldırı testleri** (`src/lib/agency/funnel.attack.test.ts`): NG-339 bloğu (eşik 10, tip görünümünde 5..9 maskeleme, ilin görünmemesi) ve mevcut FO-392/FO-398 kapıları. "Maskeli ile 1-4 kendi kurumu ekleme" ayrı bir test olarak yazılmadı: il kırılımı kaldırıldığı için bu saldırı yüzeyi yok; bunu yalnız "il kırılımı yok" testleri dolaylı olarak kapsıyor.
4. **Rapor testi** (`src/lib/agency/report.test.ts`): rebase sonrası iki beklenti düzeltildi (CSV referansı kaldırıldı; `10 birimine yuvarlanır`).

## Kanıt

### Birim/tip/lint/i18n (WSL2)
```
pnpm db:generate                      # eski Prisma client yüzünden tip hatası vardı; üretilince temiz
pnpm typecheck                        # tsc --noEmit: exit 0
pnpm lint                             # eslint: temiz
pnpm i18n:check                       # ✅ i18n check passed: both catalogs agree ... no file gained hard-coded text.
npx vitest run src/lib/agency         # Test Files 8 passed (8) · Tests 136 passed (136)
```

### Mutant (eşik 10 → 5, geçici; sonra geri alındı)
```
× the threshold is 10 and a shown number is a multiple of 10
× a type of 5..9 organisations is masked on the type view, and so is the one visible beside it
Tests 2 failed | 68 passed (70)
```
Geri alındı: `small-cell.ts:12  export const SMALL_CELL_THRESHOLD = 10;`

### Sızıntı ölçümü — ham çıktı (900 tablo, seed 31, limitSeed 3101, FO392_TABLES=900)
Kaynak: `FO392_LOG` dosyası (`/home/aslan/measure-after.log`), satırlar aynen:
```
SELFBURN-SWEEP seed=31 limitSeed=3101 step=10 single, D = 0 tables=900 tablesWithLeak=0
SELFBURN-SWEEP seed=31 limitSeed=3101 step=10 spread, D = 0 tables=900 tablesWithLeak=6
SELFBURN-SWEEP seed=31 limitSeed=3101 step=5 spread, D = 0 tables=900 tablesWithLeak=74 (the old residual; step 10: 6)
SELFBURN-SWEEP seed=31 limitSeed=3101 step=10 single, D >= 0 tables=900 tablesWithLeak=0
SELFBURN-SWEEP seed=31 limitSeed=3101 step=10 spread, D >= 0 tables=900 tablesWithLeak=0
CHEAPFILL seed=31 own=5..30 step=10 single, D = 0 tables=900 tablesWithLeak=0
CHEAPFILL seed=31 own=5..30 step=10 spread, D = 0 tables=900 tablesWithLeak=4
CHEAPFILL seed=31 own=5..30 step=10 single, D >= 0 tables=900 tablesWithLeak=0
CHEAPFILL seed=31 own=5..30 step=10 spread, D >= 0 tables=900 tablesWithLeak=0
CHEAPFILL seed=31 own=5..30 step=5 spread D=0 tables=900 tablesWithLeak=60 (step 10: 4; 500-record self-burn at step 5: 74)
SELFBURN-FLIP limits=500..524 exactlyLearned=25/25 costRealRecords=500..524
SELFBURN-WINDOW tables=400 D=0 windowSelfBurnedAvg=7.51 max=10 windowPublicRangeAvg=26.18 min=5 windowsInside1to4=0
SATURATED-CONTROL fixed500 D=0 tablesWithLeak=35/600
```

Özet tablo (ham x/900):

| Senaryo | Eşik 5 (eski) | Eşik 10 (yeni) | Hedef |
|---|---|---|---|
| Self-burn, `single`, D=0 | — | 0/900 | 0 |
| Self-burn, `spread`, D=0 (kart "dağıtılmış kayıt") | 74/900 | **6/900** | 0 |
| Self-burn, `spread`, D≥0 | — | 0/900 | 0 |
| Ucuz doldurma 5–30, `single`, D=0 | — | 0/900 | 0 |
| Ucuz doldurma 5–30, `spread`, D=0 | 60/900 | **4/900** | 0 |
| Ucuz doldurma, D≥0 (her iki kip) | — | 0/900 | 0 |

Sızan tablo örnekleri (eşik 0 probunda ortaya çıkan, tablo kimliği): `#319 code#2=1 ∈ [1,4]; #389 code#1=1 ∈ [1,4]; #572 code#2=1 ∈ [1,4]`. Gizli değer 1–4 aralığında kalıyor.

**Kapılar hakkında not:** `funnel.attack.test.ts` `spread`+`D=0` kipi için yüzde tolerans kullanıyor (`STEP10_CEILING = 0.02`, yani %2 ≈ 18/900). 6/900 ve 4/900 bu tolerans içinde kaldığı için kapılar yeşil. Bu tolerans **0/900 hedefi değildir**; kart hedefi 0/900 idi. Tolerans bu PR'da gevşetilmedi, değiştirilmedi; ama yeşil kapılar "hedef tuttu" anlamına gelmez.

## Kök neden (hipotez — doğrulanmadı)

Eşik 5'ten 10'a inince sızıntı 74 → 6'ya düştü, yani değişiklik büyük ölçüde işe yaradı. Kalan 6 tablo `spread` (kod başına dağıtılmış kullanım) + `D = 0` (hiç silinmemiş kayıt) kombinasyonunda oluşuyor; saldırgan toplam ve kod başına pencereyi daraltarak son kodun gerçek sayısını 1–4 aralığına sıkıştırabiliyor. Ölçülen ortalama pencere (`windowSelfBurnedAvg=7.51`, `max=10`) hâlâ 1–4 aralığıyla çakışan durumlar üretiyor. **Bunun tam mekanizması (hangi çıkarım adımının tabloyu açtığı) bu oturumda izole edilmedi.** Bunu kesinleştirmek için: `attack()` içinde hangi kısıtın 1–4 aralığını daralttığını kayıt bazında loglamak gerekir.

## Değişen dosyalar

- `src/lib/agency/small-cell.ts` (eşik 10, önceki commit `82285261`)
- `src/lib/agency/report.ts`, `report.test.ts` (önceki commit + bu oturumda test düzeltmesi)
- `src/app/[locale]/(app)/ajans/funnel-panel.tsx`, `reports-panel.tsx`
- `messages/tr.json`, `messages/en.json`
- `src/lib/agency/funnel.attack.test.ts`
- `tests/e2e/reports-ui.spec.ts`, `tests/agency-report.live.test.ts`
- `docs/agent-results/NG-339-sec-gnd.md` (bu dosya)

## Riskler

1. **Açık sızıntı 6/900 + 4/900** (spread, D=0). Birleştirme için 0/900'e inmesi gerekiyor. Bu, kart kuralına göre PR'ı birleştirilebilir yapmaz.
2. **Yüzde toleransı** kapıları yeşil tutuyor; tolerans bir tasarım kararı, teknik bir çözüm değil.
3. **Tam `pnpm gate` koşulmadı.** Bu oturumda yalnız typecheck, lint, i18n:check, agency birim testleri ve mutant koşuldu. e2e (`reports-ui.spec.ts`) ve canlı DB testleri (`agency-report.live.test.ts`) izole DB/port olmadığı için koşulmadı; alt PR CI durumu da bu rapor yazılırken kontrol edilmedi.
4. **Eski Prisma client** tip hatası üretti (`agencyReportDeletionLog`); `pnpm db:generate` ile çözüldü, CI'da da gerekli.

## Açık sorular

- Kart "1–4 kendi kurumu maskeli ile ekleme" saldırısının ayrı bir testini istiyor. İl kırılımı kaldırıldığı için bu yüzey yok; bu yorumu lider onaylamalı.
- Dağıtılmış kayıt sızıntısını 0/900'e indirmek için: (a) kod başına dağıtımı değiştirmek, (b) ek bastırma (complementary suppression) kuralı eklemek, (c) eşiği 10'un üstüne çekmek — hangisinin kabul edileceği ürün/risk kararı.

## Sonraki adım

1. Dağıtılmış kayıt sızıntısının kök nedenini kayıt bazında izole et (hipotez yukarıda).
2. 0/900 hedefi için çözüm seç ve ölçümü aynı komutla tekrarla (`FO392_TABLES=900 FO392_LOG=... npx vitest run src/lib/agency/funnel.attack.test.ts -t "self-burn|cheap fill|positive control"`).
3. Hedef tutunca tam `pnpm gate` (izole DB, boş port) ve e2e; o zaman birleştirme önerisi.
