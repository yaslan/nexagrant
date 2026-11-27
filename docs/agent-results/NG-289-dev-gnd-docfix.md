# NG-289 · dev-gnd · belge düzeltmesi (PR #409 B/Ö)

Kart: TASK-MWQ2WWQ9DRT7S · Dal: `task/ng-289-faz3` (PR #409 → dev) · Girdi: `docs/agent-results/NG-289-crw-gnd.md` "B/Ö listesi (PR #409)"

## Ne yapıldı

- **Ö-1 (kanıt güncellendi):** `docs/GATE.md` "Kanıt" satırı, güncel PR head `a357ef45` koşusu `45435079166` rakamlarına çevrildi. Eski kanıt (`45056104610`, head `1549458e`) geçmişte bırakıldı.
- **Ö-2 (dakika maliyeti):** `docs/GATE.md` içinde 3 parça + heavy ile 4 parça + heavy düzeninin karşılaştırma tablosu eklendi. Kaynak: `gh run view <id> --json jobs` başlangıç/bitiş zamanları.
- **Ö-3 (actionlint):** Koşuldu, ilk çalıştırmada bir shellcheck uyarısı (SC2009, `ci.yml` örnekleyici satırı: `ps | grep`) çıktı; `pgrep -fxc 'sleep 60'` ile düzeltildi; sonuç temiz.
- **Ö-4 (kısmen kapatıldı):** Yeni yapılı bir kırmızı deneme koşusu yapılmadı (talimat gereği). Mevcut koşulardan artefakt ve sır kanıtı çıkarıldı (aşağıda). Tam kapsam kapatılamadı (aşağıda neden).
- **Ö-5 (test sayısı):** Belgede güncel durum satırı 735 (koşu günlüklerinden doğrulandı). `727` yalnızca tarihsel koşu (`44864261313`) satırında kaldı; güncel durum değil.

## Kanıt (ham)

### Ö-1 / koşu 45435079166 (head a357ef45) günlükleri

Komut: `gh run view 45435079166 -R yaslan/nexagrant --job <id> --log` + `[e2e-mem]` ve Playwright özet satırları.

| İş | Job id | `Running` | Playwright özeti | En yüksek `next-server` RSS | `approaching the used memory threshold` | `sampler stopped; orphan … left` |
|---|---|---|---|---|---|---|
| e2e (1) | 138596015378 | 192 | 189 passed + 3 skipped (12.8m) | 4350 MiB | 0 | 0 |
| e2e (2) | 138596015509 | 174 | 165 passed + 9 skipped (9.8m) | 5796 MiB | 0 | 0 |
| e2e (3) | 138596015499 | 200 | 199 passed + 1 skipped (12.5m) | 5040 MiB | 0 | 0 |
| e2e (4) | 138596015646 | 165 | 165 passed (10.2m) | 5457 MiB | 0 | 0 |
| e2e (heavy) | 138596015420 | 4 | 4 passed (3.3m) | 3202 MiB | 0 | 0 |

- Toplam koşan: 192+174+200+165+4 = **735**; geçen 722; atlanan 13. Eşik ≤ 6140 MiB: tüm parçalar tutuyor.
- Atlananlar koşulla atlanan (LIVE, clamd, bayrağı kapalı) testler; daha önce olduğu gibi.
- `e2e-gate` (`45435079166`): success.

### Ö-2 / dakika maliyeti

Komut: `gh run view <id> -R yaslan/nexagrant --json jobs` (job süresi = `completedAt − startedAt`, yuvarlama: iş başına yukarı dakika). `E2E Test` adımı süresi aynı JSON'un `steps` alanından.

| Düzen | İş | İş süresi (dk) | `E2E Test` (dk) | Kurulum ≈ (dk) |
|---|---|---|---|---|
| 3 parça + heavy, koşu `44913458118` | shard 1 / 2 / 3 | 23 / 16 / 19 | 19.9 / 12.5 / 15.7 | 3.1 / 3.5 / 3.3 |
| | heavy | 6 | 3.3 | 2.7 |
| | toplam | 64 (+ e2e-gate 1 = 65) | | 12.6 |
| 4 parça + heavy, koşu `45435079166` | shard 1 / 2 / 3 / 4 | 16 / 13 / 15 / 13 | 12.8 / 9.9 / 12.6 / 10.2 | 3.2 / 3.1 / 2.4 / 2.8 |
| | heavy | 6 | 3.3 | 2.7 |
| | toplam | 63 (+ e2e-gate 1 = 64) | | 14.2 |

Fark: faturalanan dakika 65 → 64 (−1). En uzun e2e işi 23 → 16 dk. Kurulum toplamı +1.6 dk (5 iş, dakika yuvarlamasından ±1 dk sapma olabilir).

### Ö-3 / actionlint

Komut (actionlint resmi `rhysd/actionlint:latest` Docker imajı, Git Bash'te Linux ikilisi çalışmadığı için indirilen tarball kullanılamadı):

```
cat .github/workflows/ci.yml | docker run --rm -i rhysd/actionlint:latest -no-color -
```

- Düzeltme öncesi çıktı: `<stdin>:388:7: shellcheck reported issue in this script: SC2009:info:18:60: Consider using pgrep instead of grepping ps output [shellcheck]` · EXIT=1.
- Düzeltme sonrası (commit içeriği): **çıktı yok, EXIT=0**.
- Imaj: `rhysd/actionlint@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667`.

### Ö-4 / artefakt ve sır taraması

- Komut: `gh api "repos/yaslan/nexagrant/actions/artifacts?per_page=100" --paginate` → yeni adlı (`e2e-results-<run>-<attempt>-shard-<n>`) kayıtlar: `e2e-results-45586661024-1-shard-1` (6591677 B), `e2e-results-45494878779-1-shard-3` (8601103 B), `e2e-results-45244385137-1-shard-4` (2782319 B), `e2e-results-45055884387-1-shard-3`, `e2e-results-44885188503-1-shard-4`.
- İndirilen: `e2e-results-45586661024-1-shard-1` (taze boş dizine, `gh run download -n`, 25 dosya). `trace.zip` açıldı.
- Tarama (yalnız sayı; değer yazılmadı):
  - Ağ kayıtlarındaki host: yalnız `localhost:3000` (167 istek).
  - Çerez adları: `authjs.session-token`, `authjs.csrf-token`, `authjs.callback-url`, `NEXT_LOCALE`. Session token, `alg: dir` şifreli JWE; yerel e2e oturumu.
  - `sk-[A-Za-z0-9]{20,}` 0 · `Bearer …` 0 · `DATABASE_URL` 0 · `AUTH_SECRET` 0 · büyük harf `AKIA…` 0 (büyük/küçük harf duyarsız taramada tek lexical eşleşme, büyük harfli AKIA eşleşmesi yok).
  - `password` 95 eşleşme: test hesap şifresi, alan adı `kurum.com` (repo fixture: `tests/e2e/team-members-ui.spec.ts`). Değeri belgelenmedi.
- Sonuç: gerçek üretim sırrı bulunmadı. Artefakt içinde e2e test hesabı şifresi ve yerel oturum çerezi var (14 gün saklanır). Bu bir risk notudur.
- **Kapatılamayan kısım:** NG-289 kartının "bilerek düşürülmüş test" içeren kırmızı deneme dalı açılmadı (talimat: yeni kırmızı deneme koşusu yapma). Bu nedenle `shard-2` ve `shard-4` için kırmızı koşu kanıtı yok; kart DoD'undaki "kırmızı deneme koşusu" maddesi açık kalır.

### Ö-5 / test sayısı

- `docs/GATE.md` içinde `727` aramasının kalan tek yeri: satır "Kanıt geçmişi" (`44864261313`, 2. tur). Tarihsel kayıt; güncel durum değil.
- Güncel durum: 735 (yukarıdaki toplam; `Running` satırlarından).

## Değişen dosyalar

- `docs/GATE.md` (Kanıt, dakika tablosu, Ö4 artefakt notu, sampler notu)
- `.github/workflows/ci.yml` (tek satır: `ps -eo args= | grep -c` → `pgrep -fxc 'sleep 60'`)
- `docs/agent-results/NG-289-dev-gnd-docfix.md` (bu rapor)

Commit ayrıntısı: CRLF yanlışlığı ilk commit'te oluştu (working tree CRLF, `core.autocrlf=false` ile kaydedildi; repo blob'ları LF). `sed -i 's/\r$//'` ile düzeltildi ve `--amend` ile LF blob'lar olarak yeniden kaydedildi. `git show --stat` yalnız iki dosyadaki 18 ekleme / 3 silme satırını gösteriyor.

## Riskler

- Ö-4 kısmi: yeni-adlı kırmızı artefakt kanıtı başka bir koşudan (`45586661024`); deneme dalı yapılmadı.
- Artefakt içinde test hesabı şifresi ve yerel oturum çerezi (14 gün). Gerçek sır değil, ama repodaki fixture ile aynı.
- Yerel pre-push kapısı Windows makinesinde çalıştırılıyor; CI sonucu Linux runner'da.

## Açık sorular

- Ö-4 için kırmızı deneme dalı (bilerek düşen test) açılsın mı? Talimata göre hayır; lider onayı gerekir.

## Sonraki adım

- Lider: PR #409 birleştirmesi (bu işte merge yok).
- Ö-4 deneme dalı kararı (yukarıdaki soru).

## Platform beyanı

- CI kanıtları: GitHub Actions, Linux (ubuntu) runner. `actionlint`: Docker (Linux imajı), Windows ana makine.
- Yerel pre-push kapısı: Windows (Git Bash + WSL). `ci.yml` değişikliği mac yerel kapısını etkilemez.
- Windows hedef değil; CI'da koşuldu.

## Push ve CI durumu (BLOKE)

- İlk push denemesi (`git push origin HEAD:task/ng-289-faz3`) pre-push kancasında durdu: `pre-push: bu checkout'ta .env yok ve DATABASE_URL tanımlı değil`. Kanca izole DB ister (CLAUDE.md "Worktree'de gate").
- İzole DB kurulumu (pgvector konteyneri + worktree `.env` + `pnpm db:setup`) başlatıldı ama `.env` oluşturma komutu izin reddiyle durdu; konteyner oluşmadı (`docker ps -a` boş). Yani tam gate henüz koşmadı.
- Uzak dal hâlâ `a357ef45` (`git ls-remote origin task/ng-289-faz3`). Yerel commit `711601c7` (dal: detached HEAD, worktree `dev-gnd-ng289-docfix`). Bu yüzden: CI yeşil kanıtı YOK, ls-remote = HEAD DOĞRULANAMADI.
- Bu rapordaki kanıtlar push'tan bağımsız (koşu günlükleri, gh API, Docker actionlint).

## Hüküm

**Hüküm: KISMEN — BLOKE.** Ö-1, Ö-2, Ö-3, Ö-5 kanıtla kapandı (yerel commit `711601c7`). Ö-4 kısmen: artefakt ve sır kanıtı var, kırmızı deneme koşusu yapılmadı (talimat). Push, pre-push tam gate (izole DB) ve PR #409 CI yeşili BEKLİYOR: izole DB kurulumu gerekli. Kart `done`a çekilmedi.

## Gerekli adım (kullanıcı / lider)

1. İzole DB kurulumu (CLAUDE.md "Worktree'de gate" adımları) worktree `dev-gnd-ng289-docfix` içinde yapılsın, ya da bu izni verin.
2. Sonra: `git push origin HEAD:task/ng-289-faz3` (WSL içinden, pre-push tam gate ~25 dk), `gh pr checks 409` ile CI yeşil kanıtı, `git ls-remote origin task/ng-289-faz3` = `git rev-parse HEAD`.
