# TASK-MULQJZNB7U3QN — FB REPO GÜVENCE (devop-fb)

Repo: `/Users/macbook/alan/FONBRIDGE` · Remote: https://github.com/yaslan/fonbridge (private) · Tarih: 29.09.2026

## 1. Ne yapıldı

1. `.gitignore`'a `/AB Project SaaS/` eklendi. Tek commit: `3ef94e35 chore(gitignore): ignore local 'AB Project SaaS/' folder holding OAuth client secret` (mesajda TASK kodu var). Commit'te yalnız `.gitignore` var.
2. Push'tan önce TÜM geçmiş (`git log --all -p`, 730 commit, 4 dal) kartta verilen desenlerle tarandı. Değer basılmadı, yalnız commit:dosya çıktısı alındı. **Gerçek sır bulunmadı.** Tüm eşleşmeler aşağıda tek tek elendi.
3. `origin` eklendi (`https://github.com/yaslan/fonbridge.git`), `main` ve `dev` push edildi. `worktree-e2e-fix` ve `worktree-zztest-validation` dalları itilmedi.
4. İlk CI koşuları izlendi. İkisi de **kırmızı**, kök nedenleri aşağıda. Workflow'lara dokunulmadı, düzeltme ayrı kartta yapılmalı.

## 2. Kanıt

### 2.1 .gitignore
```
$ git check-ignore -v "AB Project SaaS/client_secret_…apps.googleusercontent.com.json" "AB Project SaaS/PROJECT.md"
.gitignore:97:/AB Project SaaS/	AB Project SaaS/client_secret_…apps.googleusercontent.com.json
.gitignore:97:/AB Project SaaS/	AB Project SaaS/PROJECT.md
$ git show --stat HEAD
 .gitignore | 4 ++++
 1 file changed, 4 insertions(+)
```
`git status` çıktısında `AB Project SaaS/` artık untracked olarak görünmüyor.

### 2.2 Geçmişte sır taraması (`git log --all -p`, yalnız eklenen `+` satırları)
Desenler: `sk-ant-`, `sk_live_`, `sk_test_`, `whsec_`, `re_[A-Za-z0-9]{20,}`, `AKIA`, `-----BEGIN`, `client_secret`, `gho_`, `ghp_`.

| Desen | Commit | Dosya | Değerlendirme |
|---|---|---|---|
| sk_live_, whsec_, re_…, gho_, ghp_ | — | — | 0 eşleşme |
| `AKIA` | f681b96c95 | src/lib/billing/vat-rates.ts | `SLOVAKIA` ülke adı, anahtar değil |
| `sk-ant-` | b6f1642759 | src/lib/llm.generate.test.ts | `sk-ant-test` test sabiti (4 karakter) |
| `sk_test_` | 7d3b690b81, c915bc4319, c66bd344be, e49f515150 | docs/agent-results/DALGA-1-…, TASK-MTQ61HQDX035M-…, scripts/stripe-sync.ts, src/app/api/webhooks/stripe/route.ts, src/lib/billing/create-portal-session.ts, src/lib/billing/subscription-sync.ts | hepsi `sk_test_mock` yer tutucusu |
| `-----BEGIN` | 9cb205d36e, 7b26191314, c915bc4319 | messages/en.json, messages/tr.json, src/lib/sso.test.ts, src/app/[locale]/admin/billing/client.tsx, .venv/…/urllib3/…/low_level.py | hepsi `BEGIN CERTIFICATE` UI yer tutucusu (`MIIDdDCCAigCCQ...`), test fixture'ı (`abc`) veya kütüphanenin regex'i. Açık sertifika, özel anahtar değil |
| `client_secret` | c915bc4319 | .venv/lib/python3.9/site-packages/fastapi/security/oauth2.py | FastAPI kütüphane kaynak kodundaki alan adı |

Ek kontroller (kartta istenmedi, güvence için yapıldı):
```
$ git log --all -p | grep -cE 'GOCSPX-|PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}|xox[bap]-'
0
$ git log --all --name-only --format= | grep -ci client_secret      # OAuth JSON dosyası hiç commit'lenmemiş
0
$ git log --all --name-only --format= | grep -E '(^|/)\.env$|\.pem$' | sort -u
(boş, geçmişte .env veya .pem commit'lenmemiş)
```
GitHub'ın 100 MB sınırı için kontrol: `main` ve `dev` içinde 50 MB'tan büyük blob yok.

### 2.3 Push
```
$ git push -u origin main   →  * [new branch] main -> main
$ git push -u origin dev    →  * [new branch] dev -> dev
$ git ls-remote origin
bed633b1…	HEAD
3ef94e35…	refs/heads/dev
bed633b1…	refs/heads/main
```
worktree-* dalları remote'ta yok.

### 2.4 İlk CI koşuları (`gh run list --repo yaslan/fonbridge`)
| İş akışı | Olay/dal | Sonuç | Link |
|---|---|---|---|
| CI (`ci.yml`) | push / dev | ❌ failure (46 sn, "Use Node.js" adımı) | https://github.com/yaslan/fonbridge/actions/runs/36484787894 |
| `check-rls.yml` | push / dev | ❌ failure (0 sn, workflow dosyası hatası) | https://github.com/yaslan/fonbridge/actions/runs/36484781634 |

`main`'de `.github/workflows` yok (2 commit'lik eski gövde), bu yüzden main push'u koşu başlatmadı. `a11y-check` ve `i18n-check` yalnız `pull_request` ve `workflow_dispatch` ile tetikleniyor, push'ta koşmaması beklenen davranış.

**Kök neden 1: CI, "Use Node.js" adımında düşüyor. DB veya servisle ilgisi yok.**
```
[command]/home/runner/setup-pnpm/node_modules/.bin/pnpm store path --silent
 ERROR  packages field missing or empty
```
- `ci.yml` `pnpm/action-setup@v3` ile `version: 9` sabitliyor. `package.json` ise `"packageManager": "pnpm@11.25.0"` diyor.
- `pnpm-workspace.yaml` yalnız pnpm 10+/11 ayar biçiminde (`allowBuilds:`) yazılmış ve içinde `packages:` alanı yok. pnpm 9 bu dosyayı workspace tanımı olarak okuyor ve reddediyor.
- Ayrıca `pnpm-workspace.yaml` içinde `protobufjs: set this to true or false` satırı var. Bu, doldurulmamış bir yer tutucu. pnpm 11 bu satırı nasıl yorumlar, ayrıca doğrulanmalı.
- Önerilen düzeltme (ayrı kart): workflow'lardaki `version: 9` kaldırılsın, action-setup `packageManager` alanını okusun (ya da `version: 11` yazılsın). `protobufjs` değeri true veya false olarak kararlaştırılsın. Bundan sonraki adımlarda (prisma validate, lint, typecheck, test, e2e) gerçek hatalar ancak o zaman görünür. DB/servis eksikliği de ancak o noktada ortaya çıkar.

**Kök neden 2: `check-rls.yml` geçersiz YAML.**
```
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/check-rls.yml'))"
  in ".github/workflows/check-rls.yml", line 49, column 1
```
`script: |` bloğundaki template literal gövdesi (satır 47–60) 1. sütundan başlıyor. Blok skaler, girintiden çıkınca bitiyor. GitHub dosyayı ayrıştıramadığı için `pull_request`-only iş akışını push'ta "failure" olarak gösteriyor. Düzeltme (ayrı kart): gövde satırlarını `script:` girintisine almak, ya da mesajı `\n` birleştirmesiyle kurmak. Aynı dosyada `version: 9` sorunu da var.

Diğer uyarılar: Node 20 action'ları Node 24'e zorlanıyor. `ubuntu-latest` 19.10.2026'dan itibaren Ubuntu 26'ya geçecek.

## 3. Değişen dosyalar
- `FONBRIDGE/.gitignore` (+4 satır), commit `3ef94e35` (dev, origin/dev'e push edildi)
- Git yapılandırması: `origin` remote eklendi, `main`→`origin/main` ve `dev`→`origin/dev` upstream ayarlandı.
- Dokunulmayanlar: be-fb'nin marketplace dosyaları (prisma/schema.prisma, prisma/rls.sql, prisma/migrations/add-marketplace-order*, src/lib/billing.ts, src/lib/modules/access.ts, src/lib/inngest/jobs/index.ts, src/types/db-rows.ts, tests/modules/*) ve `FON_BRIDGE.md`. Bunlar commit'lenmemiş halde yerinde duruyor.

## 4. Riskler
- **`.venv/` (5659 dosya, Python 3.9 site-packages) repoda izleniyor** ve GitHub'a gitti (c915bc4319'dan beri). Sır değil ama repoyu şişiriyor ve lisanslı üçüncü taraf kodu içeriyor. `.gitignore`'a `.venv/` eklenip `git rm -r --cached .venv` yapılması önerilir. Bu ayrı kart olmalı, çünkü kartın kapsamı dışında.
- CI şu an her dev push'unda kırmızı. Kök neden 1 düzelene kadar gerçek kalite kapısı yok.
- Geri alma: remote tarafı `git push origin --delete dev main` ile, yerel taraf `git remote remove origin` ile geri alınabilir. `.gitignore` commit'i `git revert 3ef94e35` ile geri alınır.

## 5. Açık sorular
- `pnpm-workspace.yaml` → `protobufjs` için build izni true mu false mu olmalı? (be-fb/leed-fb kararı)
- `main` 2 commit'te duruyor, `dev` ondan 728 commit önde. main'e ne zaman ve nasıl (PR ile) taşınacak? Patron kararı.

## 6. Sonraki adım
- Ayrı kart: CI pnpm sürüm uyumsuzluğu + check-rls.yml YAML girinti hatası. Kök nedenler yukarıda. Workflow gevşetilmeyecek.
- Ayrı kart: `.venv/` izlemeden çıkarılsın.

**Platform beyanı:** mac (Darwin 27.0.0) üzerinde doğrulandı. Git ve gh adımları platformdan bağımsız. CI koşusu GitHub'ın `ubuntu-latest` (Linux) runner'ında gerçekleşti. Windows'ta koşulmadı, çünkü bu kartta Windows'a bağlı kod yolu yok.

## Kapanış (29.09)

- Rapor `/Users/macbook/alan/docs/agent-results/` altından bu repoya taşındı, eski konumdaki kopya silindi.
- Rapor sır değeri içermiyor: yalnız desen adları ve commit:dosya bilgisi var.
- CI kırmızısı (pnpm sürüm uyumsuzluğu, `check-rls.yml` YAML girintisi) için düzeltme kartı henüz açılmadı.
