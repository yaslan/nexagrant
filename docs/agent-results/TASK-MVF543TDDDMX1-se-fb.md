---
sözleşme: 3
görev: TASK-MVF543TDDDMX1
kod: TASK-MVF543TDDDMX1
ajan: se-fb
motor: claude
tip: yayın
okur: kullanıcı
hüküm: Kısmen bitti: 14 override satırı eklendi; lock paket bölümü dev ile byte-aynı, audit önce/sonra aynı, seçici deneyi ve tam vitest (4800/0 fail) yeşil; push, pre-push kapısının rls:verify adımında ortak DB'deki bilinen FO-52 çakışması yüzünden reddedildi; dal commit'li, PR push bekliyor.
platform: mac (darwin, pnpm 11.25.0) üzerinde doğrulandı. Windows ve Linux koşulamadı (bu makinede yok). Koddan: değişiklik yalnız pnpm-workspace.yaml overrides + lock overrides bloğu + platformdan bağımsız bir vitest. pnpm overrides çözümlemesi paket indirmeden önce, OS'tan bağımsız yapılır. Lock'un importers/packages bölümü dev ile byte-aynı, yani her platform aynı paket setini kurar. sharp'ın @img/sharp-<os> opsiyonel ikilileri değişmedi (0.35.5).
sürüm: 1
tarih: 2026-10-19T21:28:51.552Z
---

# FO-96 · FO-18b — pnpm overrides: eksik hat satırları (GHSA gerekçeli)

## Kararlar

```karar
kimlik: karar-1
soru: brace-expansion 1.x (lock'ta 1.1.18, yalnız eslint→minimatch@3 dev ağacında, high GHSA-qhr7/6j4f) için ne yapalım? Satır eklemek lock paket bölümünü değiştirir (1.1.18→1.1.21, aynı hat yama).
seçenek: A | Ayrı küçük kart — 'brace-expansion@>=1.0.0 <1.1.21': '1.1.21' satırı, lock'ta yalnız bu paket değişir
seçenek: B | Bu PR'a ekle (kartın 'paket değişmez' kuralını bu tek paket için esnet)
seçenek: C | Satır ekleme, dev-only risk kabul edilir (yaml yorumunda belgeli)
öneri: A
karar_kimligi: K-570177
```

## Ne yapıldı
Worktree `/Users/macbook/alan/FONBRIDGE-fo96`, dal `se-fb/fo96-override-lines`. Taban `origin/dev` 80271979 (#117 merge'ü). Commit: `53aa3888 fix(deps): restore override rows for older lines dropped by FO-18 (FO-96)`.

Advisory kaynağı: `gh api "/advisories?ecosystem=npm&affects=<pkg>"`. Geri çekilmiş advisory'ler hariç tutuldu.

### Hat → satır listesi (ham)
| Hat | Satır | Sınıf | GHSA |
|---|---|---|---|
| undici 6.x | `'undici@>=6.0.0 <6.28.1': '6.28.1'` | a (aynı hat) | rfgv-xxqx-mfg5, 3wwx-pv8p-q78v, r53p-7pc4-xj5r |
| undici ≤5.x (<5 dahil) | `'undici@<6.0.0': '6.28.1'` | b (cross-major) ⚠ karttan sapma | vxpw-j846-p89q (high <6.27.0), vrm6-8vpv-qv8q (high <6.24.0) |
| mysql2 1.x/2.x | `'mysql2@<3.0.0': '3.23.1'` | b | 3f6p-5ww8-9rcr, 4rch-2fh8-94vw (critical) |
| hono 0.x–2.x | `'hono@<3.0.0': '4.13.7'` | b | m732-5p4w-x69g, 88fw-hqm2-52qc |
| sharp ≤0.33 | `'sharp@<0.34.0': '0.35.5'` | b | f88m-g3jw-g9cj (54xq, gp95'i de kapsar) |
| ip-address ≤9.x | `'ip-address@<10.0.0': '10.7.1'` | b | h3mg-xc3c-68pw, j6r3-76f7-8jcv |
| postcss-selector-parser ≤6.x | `'postcss-selector-parser@<7.0.0': '7.1.6'` | b | rj75-hqrm-r3gf |
| @modelcontextprotocol/sdk 0.x | `'@modelcontextprotocol/sdk@<1.0.0': '1.31.0'` | b | w48q-cv73-mx4w |
| fast-uri 0.x/1.x | `'fast-uri@<2.0.0': '2.4.7'` | b | hrr3-gc8f-f4qj, qw65-cvwx-89v3 |
| @hono/node-server 2.x | `'@hono/node-server@>=2.0.0 <2.0.10': '2.0.10'` | a | 9mqv-5hh9-4cgg, frvp-7c67-39w9 |
| @hono/node-server 0.x | `'@hono/node-server@<1.0.0': '1.19.15'` | b (ek: npm'de 0.6.0 var) | wc8c-qw6v-h7f6 |
| brace-expansion 2.x | `'brace-expansion@>=2.0.0 <2.1.7': '2.1.7'` | a | q2hr-2g5m-vwhr, qhr7, 6j4f |
| brace-expansion 3.x | `'brace-expansion@>=3.0.0 <3.0.9': '3.0.9'` | a | aynı |
| brace-expansion 1.x (+0.0.0) | **satır yok, gerekçeli istisna** | — | q2hr (<1.1.21), qhr7/6j4f (high) |

**Sapma 1: undici 5.x.** Kart "a: 5.29.0" diyor. Oysa vxpw, vrm6, v9p9, f269 ve 4992 gibi advisory'ler `< 6.x` aralığında ve 5.x'e yama yok, yani 5.29.0 hâlâ high açık taşıyor. Yaml'ın kendi kuralı ("kendi yaması olmayan hat GHSA'lı sınırlı cross-major satırı alır") gereği satır 6.28.1'e gider; `undici <5` aynı satıra katıldı.

**Sapma 2: brace-expansion 1.x.** Lock'ta `brace-expansion@1.1.18` var. Yolu: eslint → @eslint/config-array → minimatch@3.1.5; yalnız devDependency, `audit --prod`'da görünmüyor. Bu sürüm etkilenen aralıkta. `>=1.0.0 <1.1.21` satırı paket bölümünü değiştirirdi (1.1.18 → 1.1.21); kartın "sürüm yükseltme yok, packages byte-aynı" kuralına aykırı olur. Satır eklenmedi; yaml yorumu bunu açıkça yazıyor. Karar aşağıda.

### Test (`tests/pnpm-overrides-same-major.test.ts`)
- `CROSS_MAJOR`'a 9 yeni anahtar eklendi; her biri pin ve GHSA ile yaml'da aranıyor.
- Yeni `upperAbovePin`: her sürüm seçicisinde `<` üst sınırı olmalı ve pin'i aşmamalı. Cross-major satırlar da kapsamda; eski `openSelectors` bu satırları atlıyordu.
- Mutant M1 aynen duruyor. Yeni mutant M2: `<6.28.1`→`<6.30.0`, `undici@<6.0.0`→`<7.0.0`, `mysql2@<3.0.0`→`>=1.0.0`; üçü de yakalanıyor.

## Kanıt (ham çıktı)
Lock bölüm md5'leri (yeni / origin/dev):
```
packages:  e952e8afad619dc25aa552dea48048ee / e952e8afad619dc25aa552dea48048ee
importers: 711d8d739e167b72629741366fe5408e / 711d8d739e167b72629741366fe5408e
git diff pnpm-lock.yaml → yalnız overrides: bloğunda +13 satır
```
Audit (`pnpm audit --prod`): `diff before after` → boş (AUDIT-IDENTICAL). İki tarafta da `1 vulnerabilities found / Severity: 1 high` (braces, GHSA-vfj7-8cjw-p6xm). Dosyalar: ekler/audit-prod-*.txt.

Seçici deneyi. Yerel `file:./dep` paketi şunları çekiyor: postcss-selector-parser 6.1.2, undici 6.20.0, ip-address 9.0.5, mysql2 2.3.3, brace-expansion 2.0.1. Komut: `pnpm install --lockfile-only`, yalnız overrides bloğu kopyalandı.
```
== pre117 (9166a99d)  brace 2.0.1  ip 10.7.1  mysql2 3.23.1  psp 7.1.6  undici 7.29.1   ← 6→7 sessiz sıçrama
== dev (origin/dev)   brace 2.0.1  ip 9.0.5   mysql2 2.3.3   psp 6.1.2  undici 6.20.0   ← hepsi yamasız
== new (bu dal)       brace 2.1.7  ip 10.7.1  mysql2 3.23.1  psp 7.1.6  undici 6.28.1   ← undici kendi hattında
```
(Kartın 5. adımı "yeni yaml'da 6.x/9.x yerinde kalır" diyordu; bu, #117 öncesi açık seçicilere göre yazılmıştı. #117 sonrası gerçek durum yukarıda.)

Gate:
```
CI=true pnpm install --frozen-lockfile  → exit 0
pnpm lint       → ✖ 4 problems (0 errors, 4 warnings)  (uyarılar bu dalın dokunmadığı dosyalarda)
pnpm typecheck  → exit 0   (yeni worktree'de önce prisma generate)
pnpm build      → exit 0
vitest overrides testi → 6/6
pre-push pnpm gate (.env yüklü kabuk):
  Test Files  363 passed | 7 skipped (370)
       Tests  4800 passed | 120 skipped (4920)
  i18n:check, rls:check, rls:bypass-check → geçti
  rls:verify --require-db → ❌ tenant-discovery / subject-scoped: ExpertPreRegAttempt=0, ExpertPreRegistration=0
  error: failed to push some refs
```
`.env`'siz worktree'de tam `pnpm test` ilk denemede 19 dosyada 60 test düşürdü. Düşen 19 dosya origin/dev'de (stash) ve bu dalda ayrı ayrı koşuldu; ikisinde de aynı sonuç çıktı: `16 failed | 3 passed`, `56 failed`. Bunlar ortam kaynaklı. `.env`'li koşuda düşen test 0.

**rls:verify düşüşü değişiklikten bağımsız:** `git diff --name-only origin/dev` = `pnpm-lock.yaml pnpm-workspace.yaml tests/pnpm-overrides-same-major.test.ts`; prisma/ ve scripts/ farkı yok. Adım tek başına tekrar koşuldu, aynı ❌ geldi (deterministik). Bu, be-fb'nin kayıtlı bulgusu: ortak DB'deki FO-52 `system_scope_open` intake tablolarını tenant-discovery/subject-scoped'a kapatıyor, dev'in `check-rls-live.ts` ise açık bekliyor. Karar FO-52 kartımda (TASK-MVC9FW2U15VM6). Talimat gereği `--no-verify` kullanılmadı.

## Değişen dosyalar
- `pnpm-workspace.yaml`: 14 satır + GHSA yorumları; "NOT covered" yorumu güncellendi.
- `pnpm-lock.yaml`: yalnız `overrides:` (+13).
- `tests/pnpm-overrides-same-major.test.ts`: CROSS_MAJOR +9, `compare` / `upperAbovePin`, mutant M2.
- package.json ve src/ dokunulmadı.

## Riskler
- Cross-major satırlar bugün etkisiz (lock'ta eşleşen kopya yok). Gelecekte bir bağımlılık eski majörü çekerse paket bilerek yeni majöre taşınır, örneğin postcss-selector-parser 6→7 ya da undici 5→6. Bu kırılma yaratabilir; ilke budur ve yorumlarda GHSA'yla belgeli. Pnpm sessiz kalır, kırılma testte ya da çalışma anında görünür.
- brace-expansion 1.1.18 (dev ağacı) yamasız kalıyor; prod etkisi yok.

## Açık sorular
- Karar kutusu: brace-expansion 1.x satırı.

## Sonraki adım
1. FO-52 rls:verify çakışması çözülünce (TASK-MVC9FW2U15VM6 kararı ya da DB'ye dev'in rls.sql'inin uygulanması) push: `cd /Users/macbook/alan/FONBRIDGE-fo96 && set -a; . ../FONBRIDGE/.env; set +a; git push -u origin se-fb/fo96-override-lines`.
2. `gh pr create --base dev --head se-fb/fo96-override-lines --title "fix(deps): restore override rows for older lines dropped by FO-18 (FO-96)" --body-file docs/agent-results/TASK-MVF543TDDDMX1-se-fb-ekler/pr-body.md` (merge YOK).

## DoD
- [x] Hatların tamamı satırla ya da gerekçeli istisnayla kapsanıyor (tablo)
- [x] Lock paket bölümü dev ile aynı (md5)
- [x] Audit önce/sonra aynı (ham)
- [x] Seçici deneyi (ham)
- [x] Gate: frozen install, lint, typecheck, test (4800 geçti / 120 skipped), build. ⚠ pre-push rls:verify ortamdan düştü.
- [ ] PR --base dev açık: **push bekliyor** (rls:verify ortak DB çakışması)
- [x] Platform beyanı: mac; lock paket bölümü platformdan bağımsız (yukarıda)
