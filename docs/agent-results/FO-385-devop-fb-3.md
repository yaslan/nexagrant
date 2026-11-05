---
sözleşme: 3
görev: TASK-MW32XHLLAVL53
kod: FO-385
ajan: devop-fb
motor: claude
tip: düzeltme
okur: kullanıcı
hüküm: BLOKE. İki inceleme maddesi kodda ve testte kapatıldı (sır maskesi; "kök neden" ifadesi düzeltildi), yerelde supervisor testi 13/13 yeşil. AMA izole gate kırmızı (1 e2e testi, `tests/e2e/auth.spec.ts:40`, zaman aşımı) ve push YAPILMADI: origin dalı hâlâ 17d8b406. PR #273 draft; gate yeşillenene ya da auth testi için karar verilene kadar gönderilmedi.
platform: macOS (Darwin 27.2.0) üzerinde yerelde koşuldu. Linux ve Windows koşulamadı, makine yok; kod yolu koddan: redact düz metin üzerinde çalışır, platforma bağlı değil. ps yoksa süreç listesi "ps unavailable" yazar (mevcut davranış, değişmedi).
sürüm: 2
---

# FO-385 düzeltme: PR #273 inceleme maddeleri

Kapsam: `docs/agent-results/FO-385-crw-fb.md` incelemesinin iki maddesi. Dal `devop-fb/fo385-e2e-server-diag` (worktree `FONBRIDGE-worktrees/devop-fb-fo385`). Ana çalışma ağacı ve başka ajanların süreçleri dokunulmadı; `pkill`/`killall` kullanılmadı; video-oto'ya dokunulmadı.

## Ne yapıldı

1. **Sır maskesi genişletildi** (`tests/e2e/support/server-supervisor.mjs`, `redact`):
   - Eski: yalnız `://kullanıcı:şifre@` (URL).
   - Yeni: ayrıca `[\w-]*(?:KEY|TOKEN|SECRET|PASSWORD)[\w-]*=` adlı her `NAME=değer` ve `--name=değer` (büyük/küçük harf fark etmez) değerini `***` yapar.
2. **Birim testleri** (`tests/e2e-server-supervisor.test.ts`): tek URL testi, her biçim için bir vakaya bölündü (6 vaka: URL, `OPENAI_API_KEY=`, `--api-key=`, `access_token=`, `--client-secret=`, `DB_PASSWORD=`). Her vaka gerçek bir sahte süreç açıp süreç listesinin o satırı gösterdiğini (`next` içermesi) ve değerin tanılamada olmadığını doğrular.
3. **Rapor ve PR açıklaması**: "kök neden" ifadesi iki yerde düzeltildi (`docs/agent-results/FO-385-devop-fb.md` hükmü ve PR #273 gövdesi). Gönderen için kesin kanıt olmadığı açıkça yazıldı.

## Kanıt (ham çıktı)

Yeni maske ile tam supervisor testi:

```
$ perl -e 'alarm 900;exec @ARGV' npx vitest run tests/e2e-server-supervisor.test.ts
 Test Files  1 passed (1)
      Tests  13 passed (13)
```

Maske kaldırılınca (`NAME=değer` yerine geçici olarak yalnız URL deseni bırakıldı; dosya sonra yedekten geri yüklendi):

```
$ ... -t "hides a secret"
     × hides a secret in a process listing: NAME=value (KEY)
     × hides a secret in a process listing: --name=value (api-key flag)
     × hides a secret in a process listing: NAME=value (TOKEN, lower case)
     × hides a secret in a process listing: --name=value (SECRET)
     × hides a secret in a process listing: NAME=value (PASSWORD)
     Tests  5 failed | 1 passed | 7 skipped (13)
```

URL vakası (`postgres://u:…@h/db`) iki durumda da geçti; URL maskesi değişmedi.

## İzole gate ve push: BAŞARISIZ (push yapılmadı)

Komut: `bash scripts/gate-isolated.sh git push origin devop-fb/fo385-e2e-server-diag` (log: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/14e97632-8c76-4141-b5bc-6339fcd75f26/scratchpad/gate-fo385.log`). Gate-lock 6 dk 32 sn bekledi, sonra koştu.

Ham sonuç:

```
  1 failed
    [chromium] › tests/e2e/auth.spec.ts:40:7 › Authentication and Tenant Provisioning › should redirect to auth provider on click
    Test timeout of 60000ms exceeded.
    page.waitForRequest: accounts.google.com veya /api/auth/signin isteği gelmedi
  7 skipped
  488 passed (13.3m)
[ELIFECYCLE] Command failed with exit code 1.
error: failed to push some refs to 'https://github.com/yaslan/fonbridge.git'
EXIT=1
```

Teşhis (kanıtlanmadı, yalnız gözlem):
- Başarısız test, supervisor kodunu veya sunucu ölümünü içermiyor; diag yalnız `started` yazdı, `server-exit`/`runner-gone` yok. Sunucu koşu boyunca ayaktaydı.
- Gate log'unda 209 kez `Error: self-signed certificate in certificate chain` görünüyor: bu makinede dış TLS bağlantıları etkilenmiş olabilir. Google yönlendirmesi bunu tetikliyor olabilir; kanıtlanmadı.
- Temel dalda (`edd86e1a`) aynı testin geçip geçmediği ölçülmedi.

Push'un reddedilme nedeni: gate kırmızı, pre-push kapısı durdurdu. `origin/devop-fb/fo385-e2e-server-diag` hâlâ `17d8b406`.

## Sonraki adım (karar bekliyor)
1. `auth.spec.ts:40` için temel dalda (`edd86e1a`) koşu: aynı testin orada da kırmızı olup olmadığı ölçülmeli. Kırmızıysa bu PR'ın değil ortamın sorunu; PR yine de bu testi kapatmadan gönderilemez, kural gereği.
2. Testi gevşetmek ya da atlamak yasak; yeniden deneme ile yeşile çevirmek de bu kartın kurallarına aykırı.
3. Gate yeşillendiğinde aynı komutla push, sonra PR #273 draft kalır.

## Değişen dosyalar
- `tests/e2e/support/server-supervisor.mjs`
- `tests/e2e-server-supervisor.test.ts`
- `docs/agent-results/FO-385-devop-fb-2.md` (bu rapor)
- `docs/agent-results/FO-385-devop-fb.md` (hüküm satırı; bu dosya ana repo kökü `/Users/macbook/alan/docs/agent-results/` altında)
- PR #273 gövdesi (`gh pr edit`)

## Riskler
- Maske `\S+` ile değeri alır: boşluk içeren tırnaklı değer (`KEY="a b"`) yalnız ilk parçaya kadar maskelenir. Süreç listesi zaten 170 karakterle kesildiği için kalan parça en fazla 170 karakter içinde kalır. Bu boşluklu tırnaklı değer vakası test edilmedi.
- `--api-key değer` (boşluklu, `=` yok) biçimi kapsanmıyor; istek yalnız `A=b` ve `--api-key=b` biçimlerini içeriyordu.
- Linux/Windows koşulamadı (makine yok).

## Açık sorular
- Boşluklu tırnaklı değerler ve `--api-key değer` biçimi ayrı bir iş olarak ele alınsın mı? Önerim: ayrı kart, bu PR'ı büyütmeyelim.

## Sonraki adım
Yukarıdaki "Sonraki adım (karar bekliyor)" bölümüne bakın. PR #273 draft; birleştirme yok.
