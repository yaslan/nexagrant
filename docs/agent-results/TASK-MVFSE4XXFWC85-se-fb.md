---
sözleşme: 3
görev: TASK-MVFSE4XXFWC85
kod: FO-108
ajan: se-fb
motor: claude
tip: hata
okur: ekip
hüküm: Kısmen bitti: override ve lock değişikliği commit'li (92c13f20), lock diff'inde yalnız brace-expansion 1.x değişiyor, audit 2 high + 1 moderate kapandı; push ve PR yapılmadı çünkü paylaşılan Postgres (:5433) hâlâ kapalı ve disk 1.6 GB.
platform: mac (darwin). Değişiklik yalnız bağımlılık çözümlemesi (pnpm-workspace.yaml overrides + lockfile), platforma bağlı kod yolu yok; Linux CI ve Windows aynı lock'u kurar. Linux/Windows'ta koşulamadı: push gate/CI çalıştırılamadı (DB kapalı).
sürüm: 1
tarih: 2026-10-19T22:28:46.086Z
---

# FO-108 · brace-expansion 1.x override (1.1.21)

## Ne yapıldı
- Kart TASK-MVFSE4XXFWC85 get_task ile okundu. Kartta `package.json` yazıyor ama FO-96'daki overrides bloğu `pnpm-workspace.yaml`'da duruyor. Kart "FO-96'nın yaml/yorum kuralına uygun" dediği için satırı oraya ekledim.
- Dal `se-fb/brace-expansion-1x`, `se-fb/fo96-override-lines` (53aa3888) üstünde. Worktree: `/Users/macbook/alan/FONBRIDGE-fo108-se`. Commit: `92c13f20`.
- Satır: `'brace-expansion@>=1.0.0 <1.1.21': '1.1.21'`. Aynı hat yaması olduğu için `CROSS_MAJOR` listesine girmesi gerekmedi. Üstündeki yorumda GHSA-q2hr (<1.1.21), GHSA-qhr7 (<1.1.20, high), GHSA-6j4f (<1.1.19, high) ve yol (eslint > minimatch@3) yazıyor.
- Blok başındaki "Still NOT covered" yorumu güncellendi. Artık yalnız brace-expansion 0.0.0 açıkta. Advisory aralığı `<1.1.21` olduğu için 0.x'i de kapsıyor, ama lock'ta 0.x hattı yok ve kart `>=1.0.0` alt sınırını istediği için 0.x'e satır eklemedim.

## Kanıt (ham çıktı)
`pnpm install --lockfile-only` (pnpm 11.25.0) çalıştırıldı, ardından `git diff pnpm-lock.yaml`:
```
@@ overrides:
   brace-expansion@>=3.0.0 <3.0.9: 3.0.9
+  brace-expansion@>=1.0.0 <1.1.21: 1.1.21
@@ packages:
-  brace-expansion@1.1.18:
-    resolution: {integrity: sha512-Edep/X9f...ADvtw==}
+  brace-expansion@1.1.21:
+    resolution: {integrity: sha512-9zeA+KLZ...4ZZSy1Ujw==}
@@ snapshots:
-  brace-expansion@1.1.18:
+  brace-expansion@1.1.21:
     dependencies:
       balanced-match: 1.0.2
       concat-map: 0.0.1
@@   minimatch@3.1.5:
-      brace-expansion: 1.1.18
+      brace-expansion: 1.1.21
```
`git diff --stat`: pnpm-lock.yaml 9 (+5/−4), pnpm-workspace.yaml 10. Başka paket değişmedi. minimatch satırındaki değişiklik aynı paketin referansı, ondan kaçış yok.

`npm view brace-expansion@1.1.21` sonucu: integrity lock'takiyle birebir aynı, bağımlılıklar `concat-map 0.0.1` ve `balanced-match ^1.0.0` (değişmedi).

Tam `pnpm audit --json` (dev dahil), ÖNCE:
```
{"info":0,"low":0,"moderate":1,"high":3,"critical":0}
brace-expansion GHSA-q2hr-2g5m-vwhr moderate <1.1.21  1.1.18 .>eslint>@eslint/config-array>minimatch>brace-expansion
brace-expansion GHSA-qhr7-859c-m2p7 high     <1.1.20  1.1.18
brace-expansion GHSA-6j4f-fj2g-mc7p high     <1.1.19  1.1.18
braces          GHSA-vfj7-8cjw-p6xm high     <=3.0.3  3.0.3  .>shadcn>fast-glob>micromatch>braces
```
SONRA:
```
{"info":0,"low":0,"moderate":0,"high":1,"critical":0}
braces GHSA-vfj7-8cjw-p6xm high <=3.0.3
prod: {"info":0,"low":0,"moderate":0,"high":1,"critical":0}
```

Override seçici testi (`tests/pnpm-overrides-same-major.test.ts`): `Test Files 1 passed, Tests 6 passed`. İki mutant denendi, ikisi de düştü, yani test bu satırı gerçekten denetliyor:
- `<1.1.21` → `<1.1.30`: `expected [ 'brace-expansion@>=1.0.0 <1.1.30' ] to deeply equal []`
- `>=1.0.0 <1.1.21` → `<1.1.21` (açık seçici): `expected [ 'brace-expansion@<1.1.21' ] to deeply equal []`

1.1.21 ile çalışma zamanı denemesi (izole klasörde npm pack): `a{b,c}d → ["abd","acd"]`, `{1..3} → ["1","2","3"]`, `*.{ts,tsx} → ["*.ts","*.tsx"]`.

## Değişen dosyalar
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`

## Yapılamayanlar
- **Push ve PR yapılmadı.** Pre-push gate DB istiyor, ama `localhost:5433` kapalı, `docker ps` yanıt vermiyor ve disk 1.6 GB'a indi. Paylaşılan altyapı olduğu için yeniden başlatmadım. `--no-verify` kullanılmadı, ortak DB'ye `db:rls` çalıştırılmadı, merge yapılmadı.
- FO-96 dalı da henüz push edilmedi. Bu dal onun üstünde duruyor; PR'ın dev'e, "FO-96 (#…) üstüne, önce o merge edilmeli" notuyla, FO-96 PR'ından sonra açılması gerekiyor.
- Görev metnindeki ikinci kanıt yolu (`/Users/macbook/alan/docs/agent-results/TASK-MVFMK08Z447OR-be-gnd.md`) başka bir ajanın (be-gnd) raporu ve repo dışında. Üzerine yazmadım; rapor bu kartın kendi yolunda.
- `eslint` 1.1.21 ile tam lint koşusu yapılmadı. Worktree'de `node_modules` kurmak disk alanı yetmediği için mümkün olmadı. Gate/CI bunu kapsayacak.

## Riskler
- Düşük. Sürüm aynı hat içinde bir yama (1.1.18 → 1.1.21), yalnız dev ağacını etkiliyor.
- Kalan high (braces GHSA-vfj7) prod yolunda. Bu kartın kapsamı dışında, ayrı bir kart gerekiyor.

## Sonraki adım
1. Postgres ve disk düzelince önce FO-96 dalını push edip PR'ını açmak.
2. Ardından aynı worktree'de izole DB kopyası env'iyle `VITEST_MAX_WORKERS=2 git push -u origin se-fb/brace-expansion-1x` (`--no-verify` yok).
3. `gh pr create --base dev`, açıklamada FO-96 PR numarasıyla.
4. Raporu PR linkiyle güncellemek, kartı `review`'a almak.
