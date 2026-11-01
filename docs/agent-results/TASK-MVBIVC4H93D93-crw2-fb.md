---
sözleşme: 3
görev: TASK-MVBIVC4H93D93
kod: FO-17
ajan: crw2-fb
motor: claude
tip: inceleme
okur: ekip
hüküm: Onay. PR #135'te (0221e661) bloke eden bulgu yok. pip-audit, kurulumla aynı 3.12 yorumlayıcısında hash'li lock üzerinde koşuyor; sürüm tek kaynaktan (.python-version) okunuyor; actionlint 0; dev ile çakışma yok. 4 öneri var, hiçbiri merge'ü engellemiyor.
platform: Linux. Doğrulama mac host üzerinde Docker Desktop ile python:3.12-slim ve python:3.9-slim konteynerlerinde, actionlint ise rhysd/actionlint:1.7.7 konteynerinde yapıldı. Değişiklik bir CI YAML'ı, bir sürüm dosyası ve README; süreç, yol ya da kabuk farkı yok. CI job'u ubuntu-latest'te koşar. Windows koşulmadı (makine yok, CI job'u da Windows'ta değil). GitHub Actions'ta koşulmadı, çünkü faturalama engeli var (FO-32).
sürüm: 1
tarih: 2026-10-21T21:05:00.000Z
---

# FO-17 · PR #135 kod incelemesi

## Ne yapıldı
`origin/se-fb/fo17-cordis-pin` (0221e661) ayrı bir worktree'de (`--detach`, scratchpad) satır satır okundu. 4 dosya: `.github/workflows/ci.yml` (+34), `workers/README.md`, `workers/cordis/.python-version` (yeni), `workers/cordis/requirements.txt` (yalnız yorum). Bağlam: lock (`requirements.lock`, uv, hash'li, 22 paket), sabit üst düzey sürümler ve `requirements-dev.txt` FO-14 (c7e9d40e) ile zaten dev'de. Bu PR bunlara `.python-version` ve CI job'u ekliyor. Ardından konteynerlerde gerçek doğrulama yapıldı.

## Odak soruları
1. **pip-audit kurulumla aynı yorumlayıcıda ve lock'tan mı koşuyor? Evet.** `cordis-worker` job'u tek bir `setup-python` adımı kullanıyor (`python-version-file: workers/cordis/.python-version`). Ardından `pip install --require-hashes -r requirements.lock` ve `pip-audit -r requirements.lock` aynı ortamda koşuyor. `python-version-file`, `defaults.run.working-directory`'den etkilenmez (o ayar yalnız `run` adımları için geçerli), repo köküne göredir. Yol doğru.
2. **Sürüm tek kaynakta mı? Evet, bir küçük istisnayla.** CI `.python-version`'ı okuyor, README ve `requirements.txt` ona işaret ediyor. README'deki kurulum komutu (`python3.12 -m venv`, README satır ~77) sürümü elle yazıyor. Bu satır PR'dan önce de vardı. Bkz. Ö4.
3. **actionlint:** 0 bulgu (aşağıda).
4. **dev'e göre:** Dal dev'in gerisinde, ama `git merge-tree --write-tree origin/dev origin/se-fb/fo17-cordis-pin` çakışmasız döndü. Rebase gerekmiyor.

## Kanıt (ham çıktı)
actionlint:
```
$ docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -no-color
actionlint_exit=0
```
Temiz python:3.12-slim (CI adımlarının sırasıyla):
```
Python 3.12.15
lock_install_exit=0            # pip install --require-hashes -r requirements.lock
dev_install_exit=0             # pip install -r requirements-dev.txt
No broken requirements found.  # pip check
11 passed, 2 skipped in 0.75s  # python -m pytest -q
No known vulnerabilities found # pip-audit==2.10.1 -r requirements.lock
audit_exit=0
No known vulnerabilities found # pip-audit -r requirements-dev.txt (ek kontrol, CI'da yok)
audit_dev_exit=0
anyio==4.15.1 / fastapi==0.143.3 / pydantic==2.14.1 / starlette==1.8.0
22 / lock_entries=22           # pip-audit kurulduktan SONRA bile ortam = lock (sürüm kayması yok)
```
Atlanan testler:
```
SKIPPED [1] test_main.py:136: CORDIS_TEST_DATABASE_URL is unset (isolated Postgres required)
SKIPPED [1] test_main.py:143: CORDIS_TEST_DATABASE_URL is unset (isolated Postgres required)
```
Gerçek endpoint:
```
$ python -m uvicorn main:app --port 8000 &  ;  GET /health
200 {"status":"ok"}
INFO:     127.0.0.1:47930 - "GET /health HTTP/1.1" 200 OK
```
3.9 karşılaştırması (beklenen hata):
```
$ (python:3.9-slim) pip install --require-hashes -r requirements.lock
ERROR: Ignored the following versions that require a different python version: 0.8.0 Requires-Python >=3.10
ERROR: No matching distribution found for annotated-types==0.8.0
exit=1
```
Node tarafı: diff `src/`, `package.json` ve `tests/`'e dokunmuyor. Lint ve typecheck yeniden koşulmadı, çünkü etkilenen girdi yok.

## Bulgular (önem sırasıyla, hepsi öneri, bloke eden yok)
- **Ö1 · `.github/workflows/ci.yml` "Install test-only pins".** `pytest` ve `httpx2` sabit, ama geçişli bağımlılıkları (pluggy, iniconfig, httpcore…) hash'siz ve sürümsüz kuruluyor, CI'da da denetlenmiyor. Senaryo: pytest'in bir bağımlılığında açık çıkarsa CI yeşil kalır. Etkisi düşük, çünkü yalnız test ortamı etkileniyor ve README satır ~41 bunu belgeliyor. Öneri: audit adımına `pip-audit -r requirements-dev.txt` eklenebilir. Yerelde bugün 0 açık veriyor.
- **Ö2 · Adım sırası.** Audit, Test adımından sonra geliyor. Senaryo: bir test kırılırsa job orada durur ve güvenlik sonucu o koşuda hiç üretilmez. Öneri: audit'i Test'ten önceye al ya da `if: ${{ !cancelled() }}` ekle.
- **Ö3 · DB testleri CI'da hep atlanıyor.** Job'da Postgres yok ve `CORDIS_TEST_DATABASE_URL` set edilmiyor, bu yüzden `test_main.py:136,143` CI'da her zaman `skipped`. Job yorumu "it needs no Postgres" diyor, yani bu bilinçli bir seçim. Yine de "worker CI'da test ediliyor" sözü 11/13 test için geçerli. Bu kartın kapsamı dışında, ayrı bir kart olabilir.
- **Ö4 · README `python3.12 -m venv`** sürümü elle yazıyor (PR'dan önce de böyleydi). `.python-version` değişirse bu satır eskir. Öneri: README'ye "sürüm `.python-version`'dan" notu ya da `python3 -m venv` + sürüm kontrolü. Zevk düzeyinde.

Kapsam dışı gözlem: `CLAUDE.md`'deki `pnpm worker:dev` (`python -m uvicorn app:app`) `package.json`'da yok, modül de `main:app`. Bu belge PR'dan önce de böyleydi, bu PR'ın işi değil.

## Değişen dosyalar
Yalnız bu rapor. PR koduna dokunulmadı. Merge yapılmadı.

## Riskler
- CI faturalama yüzünden hiç koşmadı. YAML'ın GitHub'da ilk gerçek koşusu merge'den sonra olacak. actionlint ve yerel adım adım tekrar bu riski azaltıyor, ama sıfırlamıyor.
- `setup-python`'ın "3.12" için seçeceği yama sürümü (ör. 3.12.x) yereldeki 3.12.15'ten farklı olabilir. Lock 3.12 genelinde çözüldüğü için sorun beklenmiyor.

## Açık sorular
- Görev metnindeki KANIT satırı yol olarak `git show 9d1aafb5:…-se-fb.md` diyordu. Bu, SE-FB'nin raporu. Üzerine yazılmadı. Açık sonuç yolu `…-crw2-fb.md` kullanıldı.

## Sonraki adım
Lider merge'ü patrona sunabilir. Ö1 ve Ö2 aynı PR'da tek satırlık eklerle kapanabilir ya da ayrı karta gidebilir. Bu yazarın kararı. Kart `review`'da bırakıldı.
