---
sözleşme: 3
görev: TASK-MW32XHLLAVL53
kod: FO-385
ajan: devop-fb
motor: claude
tip: düzeltme
okur: kullanıcı
hüküm: İki inceleme maddesi kapatıldı. Sır maskesi artık NAME=değer ve --name=değer biçimlerini de kapsıyor (her biçim için test var, maske kaldırılınca 5 test kırmızı). "Kök neden" ifadesi "yüksek olasılıkla, zaman eşleşmesi ve süreç listesiyle; gönderen için işletim sistemi kaydı yok" diye düzeltildi. PR #273 draft kalıyor.
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

Gate sonucu: aşağıda, push çıktısıyla birlikte.

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
PR #273 draft; birleştirme yok. Gate ve push sonucu aşağıda eklenecek.
