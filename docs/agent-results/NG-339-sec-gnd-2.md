# NG-339 (TASK-MWSWIQ87TQIIA) — 2. koşu: tamamlayıcı bastırma, 0/900 hedefi TUTMADI

**Hüküm: HEDEF TUTMADI.** Eşik 10 ve il kırılımının kaldırılması (önceki commit'ler) tamam. Ama dağıtılmış kayıt sızıntısı `spread` + `D = 0` kipinde 0/900'e inmedi: self-burn **6/900**, ucuz doldurma **4/900**. Bu tamamlayıcı bastırma kuralıyla kapatılamadı (kök neden aşağıda, ölçümle). **PR #421 birleştirilebilir değil; draft kalmalı. Bu dalı push etmedim** (kapı kırmızı; tam gate pre-push'ta zorunlu, `--no-verify` yok).

**Ajan:** sec-gnd (Güvenlik Mühendisi) · **Platform:** WSL2 Linux (Ubuntu 24.04), Node v26.5.0, pnpm 11.25.0 · **Dal:** `task/ng-339` (yerel, push edilmedi) · **Worktree:** `~/alan/wt/ng-339` · **Taban:** `se-fb/fo392-invite-code-limits` (2c8fd518) — yerel dal zaten bu tabanın üstünde, yeniden-tabana gerek kalmadı.

## Durum (istenen adımlar)

| Adım | Durum |
|---|---|
| (a) Tamamlayıcı bastırma, tek kural `small-cell.ts` içinde | **Yapılmadı.** Kural zaten `funnel.ts` `suppressedCells` içinde ve pano/rapor onu `buildAgencyFunnel` çıktısından okuyor (kendi maskesini hesaplamıyor). Bu oturumda denediğim ek bastırma sızıntıyı kapatmadı (aşağıda), dolayısıyla kuralı taşımak hedefe katkı sağlamaz; taşıma ayrı bir refactor olarak bırakıldı. |
| (b) Saldırı testi, her kipte ham `tablesWithLeak=` | **Yapıldı.** Hedef 0/900 **tutmadı** (aşağıda ham çıktı). |
| (c) `STEP10_CEILING` → 0; pozitif kontrol kırmızı | **Yapıldı.** Kapı artık gerçek hedefi ölçüyor ve kırmızı. Mutant (eşik 5) 7 testi kırmızıya çevirdi. |
| (d) Rapor/UI testleri, i18n | **Değişiklik gerekmedi:** bu oturumda UI ve metin değişmedi; `pnpm i18n:check` geçti. |
| (e) Rebase, PR #421 DIRTY, tam gate, `gh pr checks 421` | **Tam gate koşulmadı, push yapılmadı.** Yerel dal zaten tabanın üstünde (çakışma yok). Uzak PR `head` (34a09d02) eski taban (756d774d) üzerinde ve yerel dalla 31 dosyada ayrışıyor; düzeltmek uzak geçmişi zorla yeniden yazmayı gerektirir ve kapı kırmızıyken pre-push zaten durdururdu. |

## Kök neden (ölçümle doğrulandı)

Sızıntı gizli bir küçük hücreden gelmiyor. Tablo #319 örneği (`spread`, `D = 0`, step 10):

- Görünür, yuvarlanmış değerler: `registered|*|Samsun` = 570, `registered|*|Tokat` = 440, `registered|*|*` = 1020. Hepsi 10'un katı; tümü görünür, gizli bir hücre yok.
- Saldırgan bu yuvarlama aralıklarını kesiştirip genel toplamı **[1015, 1018]** aralığına sıkıştırıyor (gerçek 1015).
- `D = 0` ve self-burn ile filled kodların kullanımları kesin bilinince, son kodun kullanımı = R − Σ(bilinen kodlar) olur; R 4 genişliğe daraldığı için son kodun gerçek değeri (1) `[1, 4]` içinde kalıyor.
- Yani sızıntı, tamamlayıcı bastırmanın modellediği "gizli değerin toplamdan geri hesaplanması" değil; **görünür yuvarlanmış değerlerin kesişiminin, kodların kesin toplamıyla birleşmesi**. `suppressedCells` tam sayılar üzerinde çalışır ve yuvarlama aralıklarının kesişimini modellemez.

Deney: genel toplamı (`registered|*|*`) bastırmak iki sweep'te de 0/900 verdi (aşağıda). Bu, kökün o toplam olduğunu gösteriyor; ama başlık sayısını panodan ve rapordan kaldırmak K-585952'nin (tamamlayıcı bastırma) kapsamında değil, ürün ve hukuk kararı. **Uygulanmadı.** Geçici deney dalları geri alındı (`git checkout` ile `funnel.ts` HEAD'e döndü).

## Kanıt

### (b) Saldırı testi — komut ve ham çıktı

Komut: `FO392_TABLES=900 FO392_LOG=… npx vitest run src/lib/agency/funnel.attack.test.ts -t "self-burn|cheap fill|positive control"`

```
× self-burn gate, spread, D = 0: codes the agency filled itself are exact - at most 0 % (rounding step 10) 2646ms
AssertionError: #319 code#2=1 ∈ [1, 4]; #389 code#1=1 ∈ [1, 4]; #572 code#2=1 ∈ [1, 4]: expected 0.006666666666666667 to be less than or equal to 0
× FO-398 cheap fill gate, spread, D = 0: 5-30 own registrations on a fresh code - at most 0 % (rounding step 10) 1622ms
AssertionError: expected 0.0044444444444444444 to be less than or equal to 0
 Test Files  1 failed (1)
      Tests  2 failed | 13 passed | 39 skipped (54)
```

Ölçüm satırları (`FO392_LOG`, ham):

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
SATURATED-CONTROL fixed500 D=0 tablesWithLeak=35/600
```

Sızan hücreler (`LEAKDETAIL`, self-burn spread D=0): `#319 code#2=1`, `#389 code#1=1`, `#572 code#2=1`, `#736 code#2=1`, `#776 code#1=2`, `#819 code#2=2` — hepsi son kodun kullanımı, hepsi `[1, 4]`.

| Senaryo | Eşik 5 (eski) | Eşik 10 (şimdi) | Hedef |
|---|---|---|---|
| Self-burn, `single`, D = 0 | — | 0/900 | 0 |
| Self-burn, `spread`, D = 0 | 74/900 | **6/900** | 0 |
| Self-burn, `single` / `spread`, D ≥ 0 | — | 0/900 / 0/900 | 0 |
| Ucuz doldurma 5–30, `single`, D = 0 | — | 0/900 | 0 |
| Ucuz doldurma 5–30, `spread`, D = 0 | 60/900 | **4/900** | 0 |
| Ucuz doldurma, D ≥ 0 (iki kip) | — | 0/900 | 0 |

### Deney: genel toplamı bastırma (uygulanmadı, yalnız ölçüm)

`funnel.ts` içinde geçici olarak (1) bütün adımların genel toplamı, (2) yalnız `registered` genel toplamı gizlendi; aynı iki sweep koştu (`-t "self-burn gate|cheap fill gate"`, 900 tablo):

```
SELFBURN-SWEEP … step=10 spread, D = 0 tables=900 tablesWithLeak=0   (her iki varyantta)
CHEAPFILL      … step=10 spread, D = 0 tables=900 tablesWithLeak=0   (her iki varyantta)
(diğer kipler 0/900)
```

Bu bir ürün kararıdır: başlık "kayıtlı kurum" sayısı panodan ve rapordan kalkar. Karar verilene kadar kodda yok.

### (c) Mutant — eşik 5

`SMALL_CELL_THRESHOLD = 5` (geçici), `npx vitest run src/lib/agency`:

```
× threshold is 10 and a shown number is a multiple of 10
× a type of 5..9 organisations is masked on the type view, and so is the one visible beside it
× primary: under 10 is masked, 0 included
× B-1: two hidden parts that sum under the threshold cover nothing: the visible one is masked
× FO-398 cheap fill gate, spread, D = 0 … at most 0 %
 Test Files  2 failed | 6 passed (8)
      Tests  7 failed | 129 passed (136)
```

Eşik 10'a geri alındı (`small-cell.ts:12  export const SMALL_CELL_THRESHOLD = 10;`).

### Temel kapılar (eşik 10, kapı değişikliğiyle)

```
pnpm lint        → exit 0 ($ eslint)
pnpm typecheck   → exit 0 ($ tsc --noEmit)
pnpm i18n:check  → exit 0 ✅ i18n check passed: both catalogs agree …
npx vitest run src/lib/agency (varsayılan 150 tablo):
  × FO-398 cheap fill gate, spread, D = 0 … at most 0 %
  AssertionError: expected 0.006666666666666667 to be less than or equal to 0
  Test Files  1 failed | 7 passed (8)
  Tests  1 failed | 135 passed (136)
```

Tam `pnpm gate` **koşulmadı**: izole DB kurulmadı ve push yapılmadığı için pre-push kancası tetiklenmedi. Kapı kırmızı olduğundan tam gate de geçmezdi.

### (e) PR durumu

```
gh pr checks 421 → no checks reported on the 'task/ng-339' branch
gh pr view 421   → isDraft: true, baseRefName: se-fb/fo392-invite-code-limits,
                   mergeStateStatus: DIRTY, mergeable: CONFLICTING,
                   headRefOid: 34a09d02 (uzak), baseRefOid: 8d920fcd
```

Yerel dal: `2c8fd518` (taban) → `82285261` → `bb28e5ac` (önceki koşu). Uzak `task/ng-339` ise `756d774d` üzerinde, `34a09d02` ile — yerelde karşılığı olmayan, eski tabanlı bir sürüm.

## Değişen dosyalar

- `src/lib/agency/funnel.attack.test.ts`: `STEP10_CEILING` 0.02 → 0 (karşılaştırma `<=`, başlıklar "at most"), ölçüm satırı `LEAKDETAIL` eklendi (yalnız `FO392_LOG` ile).
- `docs/agent-results/NG-339-sec-gnd-2.md` (bu dosyanın kopyası).

`funnel.ts` ve `small-cell.ts` bu oturumda değiştirilmedi (deney geri alındı).

## Riskler

1. **Hedef tutmadı:** 6/900 + 4/900 sızıntı açık. PR birleştirilemez.
2. Yeşil kalan testler yok: kapılar artık hedefi ölçtüğü için bu dal kırmızı; push edilirse pre-push zaten durdururdu.
3. Eski `0.02` toleransı 0/900 hedefi değildi; kaldırıldı. Bu bir gevşetme değil, sıkılaştırma.
4. Yerel commit (testler kırmızı) yalnız yerelde; uzak PR'a dokunulmadı.

## Açık sorular / karar (K-585952 kapsamı dışı)

Seçenekler:
- **A (önerim):** Genel toplam `registered` panoda ve raporda gizlensin. Ölçüm: iki sweep'te 0/900 (yukarıda). Maliyet: başlık sayısı kaybolur; pano ve `funnel.test.ts`/`report.test.ts` güncellenir; i18n iki dilde.
- **B:** 6/900 + 4/900 kabul edilsin (<%1), ceiling 0.02'ye dönsün. Bu kartın DoD'u (0/900) ile çelişir; hukuk/ürün onayı gerekir.
- **C:** Yuvarlama adımını değiştirmek (K-577804 kararını değiştirir) — önermiyorum.

Lider/ürün A ya da B'yi seçmeli. A seçilirse uygulama ayrı bir commit olarak yapılır, sonra tam gate ve push.

## Sonraki adım

1. Karar (A/B) bekleniyor.
2. A seçilirse: genel toplam bastırma `small-cell.ts` içine taşınır (bu kart (a)'nın kalanı), UI/rapor testleri güncellenir, saldırı testi yeniden koşulur, tam gate, push, `gh pr checks 421`.
3. B seçilirse: ceiling 0.02 ile gerekçe belgesi (`docs/legal/**` dokunulmaz; belge kartı ayrı).
