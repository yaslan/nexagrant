---
sözleşme: 3
görev: TASK-MVBIVC4H93D93
kod: FO-17
ajan: se-fb
motor: claude
tip: hata
okur: ekip
hüküm: Kısmen bitti: Değişiklik commit'lendi ve temiz 3.12 konteynerinde doğrulandı (lock kurulumu 0, test 11/11, pip-audit 0 açık, /health 200, actionlint 0). Push ve PR yapılamadı: 4 pre-push gate denemesinden 3'ü yük kaynaklı zamanlama flake'iyle düştü, 4.'sü sırasında paylaşılan Postgres/Docker çöktü (:5433 kapalı, disk 1.9 GB).
platform: Linux: python:3.12-slim ve python:3.9-slim Docker konteynerleri (mac host, Docker Desktop) + mac host (git, pnpm, pre-push gate). Değişiklik Python sürüm dosyası, README ve CI YAML'ı; süreç, dosya yolu ya da kabuk farkı yok. Windows koşulamadı, makine yalnız mac. Koddan bakınca: .python-version ve requirements.lock platformdan bağımsız. Lock'taki wheel hash'leri uv'nin çok platformlu çözümüyle üretilmişti (FO-14), Windows'ta kurulum denenmedi. GitHub Actions'ta koşulamadı: CI faturalandırma engeli.
sürüm: 1
tarih: 2026-10-19T22:22:25.504Z
---

# FO-17 · workers/cordis: Python 3.12 sabit, lock'lu CI denetimi (pip-audit)

## Ne yapıldı

Kartın 1–3. adımlarının bir kısmını FO-14 (#74) zaten yapmıştı: `requirements.txt` sürümleri sabit, `requirements.lock` hash'li ve 3.12 için çözülmüş. Bu PR yalnız eksik kalanları tamamlıyor. Hiçbir paket yükseltilmedi.

1. `workers/cordis/.python-version` → `3.12` (makinece okunur, CI bu dosyayı okuyor).
2. `workers/README.md`: yığın satırı `.python-version`'a işaret ediyor ve kurulumun yalnız lock'tan yapıldığını, 3.9'da hata verdiğini yazıyor. Yerel kurulum komutu dev'de zaten lock'a geçmişti (dbba2196).
3. `workers/cordis/requirements.txt` başlığı da `.python-version`'a işaret ediyor (yalnız yorum değişti).
4. `.github/workflows/ci.yml`: ayrı bir `cordis-worker` işi eklendi. Adımlar: `setup-python` (`python-version-file`), `pip install --require-hashes -r requirements.lock`, `pip install -r requirements-dev.txt`, `pytest`, `pip-audit==2.10.1 -r requirements.lock`. pip-audit repoya bağımlılık olarak eklenmedi.
   - devop-fb taslağına göre fark: test pin'leri CI'da elle tekrar yazılmıyor, README'nin kullandığı `requirements-dev.txt`'ten geliyor. Böylece sürüm tek kaynakta.

Commit: `0221e661 chore(workers/cordis): pin Python 3.12 and audit the locked set in CI (FO-17)`. Dal `se-fb/fo17-cordis-pin`, worktree `/Users/macbook/alan/FONBRIDGE-fo17-se`. **Push edilmedi, PR yok.**

## Kanıt (ham çıktı)

Temiz `python:3.12-slim`, CI adımları birebir, ardından gerçek sunucu:
```
3.12                      ← workers/cordis/.python-version
Python 3.12.15
[step] install locked
install rc=0
[step] test-only pins
[step] test
...........ss                                                            [100%]
11 passed, 2 skipped in 0.98s
[step] audit
No known vulnerabilities found
AUDIT_RC=0
[step] serve
GET /health -> 200 {"status":"ok"}
POST /jobs/cordis?month=2026-09 -> 503 {"success":false,"message":"Worker is not configured: WORKER_TOKEN is unset","error":"worker_token_unset"}
INFO:     127.0.0.1:48124 - "GET /health HTTP/1.1" 200 OK
```

Sürüklenme kontrolü: kurulan paket seti lock ile birebir aynı. Token kapısı (token maskeli):
```
lock=22 installed=22
FREEZE_EQUALS_LOCK
auth= None -> 401 {"success":false,"message":"Missing or invalid bearer token","error":"unauthorized"}
auth= wr*** -> 401 {"success":false,"message":"Missing or invalid bearer token","error":"unauthorized"}
auth= t0*** -> 500 {"success":false,"message":"CORDIS pipeline failed","error":"No real CORDIS source is configured and mock ingest is disabled; ...
```
Doğru token ile dönen 500 beklenen davranış. Kaynak ya da mock tanımlı değil ve worker bunu sessizce geçmek yerine hata veriyor (kural 6).

Aynı lock, `python:3.9-slim`:
```
Python 3.9.25
ERROR: Ignored the following versions that require a different python version: 0.8.0 Requires-Python >=3.10
ERROR: Could not find a version that satisfies the requirement annotated-types==0.8.0 (from versions: 0.1.0, ... 0.7.0)
ERROR: No matching distribution found for annotated-types==0.8.0
rc=1
```

CI YAML:
```
YAML OK jobs= ['build-and-test', 'cordis-worker']
 - actions/checkout@v4 / actions/setup-python@v5 / Install locked dependencies / Install test-only pins / Test / Audit locked dependencies
docker run rhysd/actionlint:1.7.7 .github/workflows/ci.yml → actionlint rc=0
```
"CI'da koştu" denemez. GitHub faturalandırma engeli yüzünden iş akışı başlamıyor; adımlar yalnız yerelde birebir koşuldu.

Node tarafı (pre-push gate'in içinden, değişiklik yok): `eslint ✖ 4 problems (0 errors, 4 warnings)`. Uyarılar önceden vardı. typecheck adımı geçti, ardından vitest'e gelindi.

### Pre-push gate denemeleri (`--no-verify` yok)
DB env'i (`DATABASE_URL`, `_MIGRATE`, `_RLS_TEST`) izole kopyaya yönlendirildi: `fabrika_fo17_sefb` (pg_dump'tan, `db:rls` yalnız ona uygulandı: `Policies in public: 117 → 117`). Ortak `fabrika`'ya hiçbir şey uygulanmadı.

| # | Ayar | Sonuç | Düşen |
|---|---|---|---|
| 1 | varsayılan | 3 failed / 4861 passed | expert-prereg-form ×2 (30 sn timeout), rag-pdf (`3960 < 3000`) |
| 2 | VITEST_MAX_WORKERS=4 | 1 failed / 4863 passed | rag-pdf (`3093 < 3000`) |
| 3 | VITEST_MAX_WORKERS=2 | 1 failed / 4863 passed | expert-prereg-form (409 testi, timeout) |
| 4 | yük < 14 beklendi, workers=2 | 56 failed / 30 dosya | `ECONNREFUSED ::1:5433`: Postgres koşu sırasında düştü |

Düşen iki dosya tek başına koşulunca geçti: `Test Files 2 passed (2) · Tests 44 passed (44)`. Denemeler sırasında load avg 25–36 arasındaydı (12 çekirdek). O sırada başka ajanların 4 `next-server`'ı ve headless Chrome'u çalışıyordu. Değişiklik TS koduna dokunmuyor.

4. denemeden sonra: 5433'te dinleyen süreç yok, `docker` komutları yanıt vermiyor, disk 8.8 GB'tan **1.9 GB**'a düştü.

## Değişen dosyalar
- `workers/cordis/.python-version` (yeni)
- `workers/cordis/requirements.txt` (yalnız başlık yorumu)
- `workers/README.md`
- `.github/workflows/ci.yml` (`cordis-worker` işi)

## Kart 5. adım — tutarsızlıklar (raporlanıyor, kapsam dışı olduğu için düzeltilmedi)
- `CLAUDE.md:26` `pnpm worker:dev  # workers/ (python -m uvicorn app:app --reload)` diyor. `package.json`'da `worker:dev` script'i yok. Modül de `app:app` değil, `main:app` (`workers/cordis/main.py`). README'deki doğru komut: `cd workers/cordis && python -m uvicorn main:app`.
- `Dockerfile` / `docker-compose.yml` Python worker'ı içermiyor; yalnız Node graphile-worker'ı var. Fly.io dağıtımı README'de anlatılıyor ama repoda `fly.toml` yok. Yani üretim yorumlayıcısı repodan doğrulanamıyor.
- `PROJECT.md:95` "Python 3.12" diyor, tutarlı.

## Riskler
- PR açılmadı, dolayısıyla inceleme ve merge bekliyor. Dal yalnız yerelde duruyor.
- `actions/setup-python@v5` + `python-version-file` GitHub'da hiç koşmadı.
- devop-fb'nin yerel dalı `devop-fb/fo17-cordis-pin` (worktree `FONBRIDGE-fo17`) ve onun yerel raporu duruyor. Bu dalın push edilmemesi gerekir, çünkü eski `.venv`'i taşıyor.
- İzole DB `fabrika_fo17_sefb` sunucuda kaldı. Postgres geri gelince `drop database fabrika_fo17_sefb` ile silinebilir.

## Açık sorular
Yok. Ortam engeli ofis sahibine iletildi (aşağıda).

## Sonraki adım
1. Ofis sahibi: Docker Desktop / `fabrika-postgres` yeniden ayağa kalkmalı ve disk boşaltılmalı (1.9 GB). Bunu ben yapmadım, çünkü paylaşılan altyapı.
2. Postgres dönünce aynı worktree'den: `. <scratchpad>/dbenv.sh` (izole kopya), `VITEST_MAX_WORKERS=2 git push -u origin se-fb/fo17-cordis-pin`, ardından `gh pr create --base dev`. Merge yok.
