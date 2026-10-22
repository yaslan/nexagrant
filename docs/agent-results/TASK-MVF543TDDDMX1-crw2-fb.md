---
sözleşme: 3
görev: TASK-MVF543TDDDMX1
kod: TASK-MVF543TDDDMX1
ajan: crw2-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: ONAY — FO-96 commit'i 53aa3888 (dal se-fb/fo96-override-lines = PR #140, #131 DEĞİL) bloke eden bulgu taşımıyor; lock paket bölümleri dev ile md5-aynı, audit önce/sonra aynı, GHSA aralıkları advisory ile doğru; merge sırası #140 → #131 olmalı.
platform: mac (darwin, pnpm 11.25.0) üzerinde doğrulandı. Windows ve Linux koşulamadı (bu makinede yok). Koddan: değişiklik yalnız pnpm-workspace.yaml overrides, lock overrides bloğu ve OS'tan bağımsız bir vitest; importers/packages/snapshots md5-aynı olduğu için her platform aynı paket setini kurar.
sürüm: 1
tarih: 2026-10-22T19:49:11.604Z
---

# FO-96 · pnpm overrides eksik hat satırları — kod + güvenlik incelemesi (crw2-fb)

## Ne yapıldı
- Kart (get_task) ve yazar raporu `TASK-MVF543TDDDMX1-se-fb.md` okundu.
- `53aa3888` ayrı detached worktree'de incelendi: `scratchpad/wt96`, `CI=true pnpm install --frozen-lockfile` exit 0.
- Hiç kod değiştirilmedi, merge edilmedi, DB'ye dokunulmadı.

### ⚠ PR eşlemesi (brief ile gerçek durum farklı)
```
gh pr view 140 → head se-fb/fo96-override-lines @ 53aa3888, base dev, MERGEABLE
gh pr view 131 → head se-fb/brace-expansion-1x  @ 92c13f20 (commitler: 53aa3888 + 92c13f20), base dev
                 başlık "…(FO-96)" — içerik FO-96 + FO-108
```
FO-96'nın PR'ı **#140**. Brief "#131 önce merge edilmeli" diyor; doğrusu bunun tersi. leed-fb hafızasındaki sıra (`fo96-fo108-merge-onayi`) doğru:
1. #140'ı merge et: `--match-head-commit 53aa3888`.
2. se-fb #131'i dev'e rebase etsin; diff yalnız 92c13f20 kalsın, başlığa FO-108 yazılsın.
3. Sonra #131'i merge et.

Bu ONAY, `53aa3888` için geçerli.

## Kanıt (ham çıktı)

### (1) Hat kapsamı + GHSA doğrulaması (`gh api /advisories/<id>`, hiçbiri withdrawn değil)
```
undici   rfgv [>=6.7.0 <6.28.1] fix 6.28.1 · 3wwx [>=6.25.0 <6.28.1] · r53p [<6.28.1]   → '>=6.0.0 <6.28.1': 6.28.1 ✓ (a)
undici   vxpw high [<6.27.0] · vrm6 high [<6.24.0]; cxrh low [<5.29.0]                 → '<6.0.0': 6.28.1 ✓ (b)
mysql2   3f6p high [<3.22.0] · 4rch critical [<3.9.7]                                  → '<3.0.0': 3.23.1 ✓ (b)
hono     m732 high [>=1.1.0 <4.10.2] · 88fw high [<4.12.25]                            → '<3.0.0': 4.13.7 ✓ (b)
sharp    f88m high [<0.35.0]                                                            → '<0.34.0': 0.35.5 ✓ (b)
ip-addr  h3mg, j6r3 [<=10.7.0] fix 10.7.1                                               → '<10.0.0': 10.7.1 ✓ (b)
psp      rj75 [<7.1.6]                                                                  → '<7.0.0': 7.1.6 ✓ (b)
mcp-sdk  w48q high [<1.24.0]                                                            → '<1.0.0': 1.31.0 ✓ (b)
fast-uri hrr3 [<2.4.7] · qw65 high [<2.4.6]                                             → '<2.0.0': 2.4.7 ✓ (b)
@hono/node-server 9mqv [>=2.0.0 <=2.0.9] fix 2.0.10 · frvp                              → '>=2.0.0 <2.0.10': 2.0.10 ✓ (a)
@hono/node-server wc8c high [<1.19.10] · frvp [<1.19.15]                                → '<1.0.0': 1.19.15 ✓ (b)
brace-exp q2hr [>=2 <2.1.7]/[>=3 <3.0.9] · qhr7, 6j4f high (daha erken yamalı)           → 2.x→2.1.7, 3.x→3.0.9 ✓ (a)
brace-exp 1.x [<1.1.21]                                                                 → istisna, FO-108/K-570177 ✓
```
**undici 5.x sapması doğru.** Kart "5.29.0 (a)" diyordu, ama vxpw ve vrm6'nın `<6.x` aralığı 5.29.0'ı da içeriyor; 5.x hattına yama yok. Cross-major sınıflandırma advisory ile uyumlu.

### (2) Lock bölüm md5 (awk ile bölüm kesimi)
```
== HEAD (53aa3888)
importers 95e4ac028187a55fef4103f3214f3430
packages  e23386dc3a519a4e1ea01c87740a9ecb
snapshots 2e406936f5dcfddfa1b30bbca6bcfe91
overrides 5aeec5767a01348996ebb0341f1269e8
== origin/dev (c9ae8ca1)
importers 95e4ac028187a55fef4103f3214f3430
packages  e23386dc3a519a4e1ea01c87740a9ecb
snapshots 2e406936f5dcfddfa1b30bbca6bcfe91
overrides b382c4e7b1f2745389a31bf6a7ae88f0
git diff --stat origin/dev...HEAD: pnpm-lock.yaml +13 (yalnız overrides), pnpm-workspace.yaml, tests/… — package.json ve src/ yok
git merge-tree --write-tree origin/dev HEAD → MERGE-CLEAN
```
Taban 80271979, dev ondan 46 commit ileride. Bu aradaki dev farkında bağımlılıkla ilgili tek değişiklik package.json'a eklenen `db:setup` script'i; lock aynı.

### (3) `pnpm audit --prod` önce (80271979'un yaml+lock'u) / sonra
```
diff audit-before.txt audit-after.txt → boş → AUDIT-IDENTICAL
10 vulnerabilities found — Severity: 4 moderate | 4 high | 2 critical
```
Bu 10 açık 19.10'dan sonra yayımlanan advisory'ler; iki tarafta da var, bu PR'dan gelmiyor. Ayrıntı aşağıda, "Kapsam dışı ACİL" başlığında.

### (4) Test: CROSS_MAJOR ve üst sınırlar
```
vitest run tests/pnpm-overrides-same-major.test.ts → Tests 6 passed (6)
pnpm typecheck (tsc --noEmit) → hata yok · eslint tests/pnpm-overrides-same-major.test.ts → çıktı yok (temiz)
```
- CROSS_MAJOR'a 9 anahtar eklenmiş. Her biri yaml'daki satırla birebir eşleşiyor; pin ve GHSA doğru.
- `upperAbovePin`: yeni satırların üst sınırları pin'i aşmıyor; sınır her satırda ya `<X.0.0` ya da pin'in kendisi. Yalnız `deepmerge-ts@<8.0.0 → 8.0.0` eşitlikte kalıyor, `compare=0`, kabul.
- `<=` biçimli bir sınır "üst sınır yok" sayılıp işaretleniyor. Bu temkinli bir davranış ve doğru.
- M2 mutantı üç kaçağı da yakalıyor.

### (5) `gh pr view … --json mergeStateStatus,statusCheckRollup`
```
#131: mergeStateStatus UNKNOWN · build-and-test FAILURE
#140: mergeable MERGEABLE · build-and-test FAILURE
annotation: "The job was not started because recent account payments have failed or your spending limit needs to be increased."
```
CI faturalama yüzünden hiç başlamamış, yani bu bir kod hatası değil. Kanıt olarak yerel koşular kullanıldı.

### Seçici deneyi (yeniden koşuldu, `pnpm install --lockfile-only`; yalnız overrides bloğu kopyalandı)
```
== dev  fast-uri@1.0.1 hono@2.7.8 ip-address@9.0.5 mysql2@2.3.3 psp@6.1.2 undici@5.28.4 undici@6.20.0 sdk@0.6.0 sharp@0.33.5
== new  fast-uri@2.4.7 hono@4.13.7 ip-address@10.7.1 mysql2@3.23.1 psp@7.1.6 undici@6.28.1 sdk@1.31.0 sharp@0.35.5
        snapshots: dep5 → undici: 6.28.1 (doğrudan undici@5.28.4 isteği taşındı)
                   dep  → undici-old: undici@5.28.4 (npm: alias'ı override'a takılmadı)
```

## Bulgular (önem sırasıyla)
**Bloke eden: YOK.**

1. **Öneri: PR başlığı/eşleme (süreç).** #131'in başlığı "(FO-96)", ama içinde FO-108 de var. Brief de numaraları ters vermiş. Senaryo: lider #131'i "FO-96" sanıp önce merge ederse #140 boşa düşer ve FO-96 tek başına incelenmiş bir PR olmadan girer. İçerik yine aynı olur, ama iz kaybolur. Düzeltme: yukarıdaki sıra izlensin, #131 rebase edilsin ve başlığına FO-108 yazılsın.
2. **Öneri (bilgi): npm alias'ı override'dan kaçıyor.** `"x": "npm:undici@5.28.4"` biçimindeki bir bağımlılık `undici@<6.0.0` satırına takılmadı (deney ham çıktısı yukarıda). Bu pnpm'in davranışı; bugün lock'ta korunan paketlerin hiçbirinin alias'ı yok (`grep -c npm:(undici|hono|…)@ pnpm-lock.yaml` → 0). İsterseniz yaml'daki "Still NOT covered" yorumuna tek satır eklenebilir; bu PR'ı bekletmez.
3. **Öneri (test zayıflığı, eskiden beri var):** GHSA kontrolü yalnız `yaml.toContain(ghsa)`. Aynı GHSA birden fazla satırda geçiyor (m732, f88m), bu yüzden bir satırın yorumu silinse de test geçer. Yorumun satıra komşu olup olmadığına bakan bir kontrol ayrı bir kartta düşünülebilir; FO-18'den beri böyle.

## Kapsam dışı — ACİL (ayrı kart önerisi, bu PR'ı bloklamaz)
Bugünkü `pnpm audit --prod` dev'de de aynı çıktıyı veriyor:
- **next >=16.0.0 <=16.4.0 — 2× critical unauthenticated RCE** (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr) ve high DoS (GHSA-p3m5-59mp-jv5r); yama 16.4.1.
- **@modelcontextprotocol/sdk <1.32.0** (high: 22jm, 46jr; moderate: 6prh, rvq5). Bu PR'ın sabitlediği 1.31.0 artık yamalı sayılmaz.
- **ip-address <=10.7.3** (rxp7, moderate). 10.7.1 hedefi eskimiş.
- **hono >=4.12.4 <4.13.11** (5r4p, moderate). 4.13.7 hedefi eskimiş.
- braces (vfj7): yaması yok, zaten biliniyordu.

Bu PR'ın kuralı "sürüm yükseltme yok" olduğu için bunlar burada düzeltilmemeli. Ama next RCE prod'u ilgilendiriyor: liderin hemen bir yükseltme kartı açması önerilir. O kartta sdk 1.32.0, ip-address 10.7.4 ve hono 4.13.11 satırları ile ilgili cross-major hedefleri de güncellenmeli.

## Değişen dosyalar
Yok. Yalnız bu rapor eklendi.

## Riskler
- Cross-major satırlar bugün etkisiz; lock'ta eşleşen bir kopya yok. İleride gelen eski bir majör kopya bilerek yeni majöre taşınır. Bu yaml'daki ilkeyle uyumlu ve GHSA ile belgeli.
- Sabitlenmiş hedeflerin üçü (sdk, ip-address, hono) yeni advisory'lerle eskidi; yukarıdaki ACİL nota bakın.

## Açık sorular
Yok. Merge sırası leed-fb hafızasında patron onayıyla kayıtlı.

## Sonraki adım
1. leed-fb: `gh pr merge 140 --merge --match-head-commit 53aa38882fb1aa8a2a954bc2ea6e30ea446280a5`
2. se-fb: #131'i dev'e rebase etsin (diff yalnız 92c13f20) ve başlığı FO-108 olarak düzeltsin. Ardından #131 merge edilir.
3. Lider: next 16.4.1 ve MCP sdk/ip-address/hono yükseltmesi için ACİL kart açılsın.

Not: Teslimdeki "KANIT ZORUNLU" bloğu sonuç yolu olarak `TASK-MVF543TDDDMX1-se-fb.md` veriyordu. O dosya yazarın raporu, üzerine yazılmadı. Brief'te verilen kendi yolum `TASK-MVF543TDDDMX1-crw2-fb.md` kullanıldı.
