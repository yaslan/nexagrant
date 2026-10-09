# TASK-MV14EDRV5K2HY (CE-689): be-fb worktree kurtarma

**hüküm:** İki worktree'deki commit'lenmemiş iş wip/ dallarına kurtarıldı ve push edildi. `befb-e2e-m7` kopyasının asıl yeni işi küçük (M7 "modül kapalıyken refusal mesajı" takibi, 10 dosya); `befb-approvals` kopyasının çoğu eski bir tabandan kalma kopya, asıl yeni içerik ise `ec26e24e` notifications E2E commit'i ve birkaç dosya. Worktree'ler kaldırılmadı.

**Platform:** mac (bu makinede çalışıldı). Kod yolu platforma bağlı değil; yalnız git işlemi yapıldı, uygulama çalıştırılmadı.

## Ne yapıldı

1. `git fetch origin dev` → `origin/dev` = `4875ee4b`.
2. İki worktree incelendi (durum, HEAD, origin/dev ile karşılaştırma, içerik özeti).
3. Gizli bilgi taraması yapıldı (aşağıda ayrıntı). Gerçek bir sır bulunmadı; eşleşmelerin hepsi test/yerel geliştirme yer tutucusu.
4. Her worktree'de yeni dal açıldı (`git switch -c wip/<ad>`), `test-results/` ve `test-artifacts/` hariç tutularak commit'lendi, push edildi.
5. Worktree'ler, mevcut dallar (`cae-fb/e2e-notifications`, `de-fb/fix-m7-tto`) ve ana repo dokunulmadı.

## Kanıt (ham çıktı)

```
$ git ls-remote origin wip/befb-approvals
bfde13a6e157412433795d78a2663f8854f2b3f7	refs/heads/wip/befb-approvals

$ git ls-remote origin wip/befb-e2e-m7
0f4b0d84db54c9a03d887053ce0fb1365fb99c60	refs/heads/wip/befb-e2e-m7
```

Commit'ler:
- `bfde13a6` chore(wip): rescue befb-approvals uncommitted work (410 dosya; base `ec26e24e`)
- `0f4b0d84` chore(wip): rescue befb-e2e-m7 uncommitted work (10 dosya; base `bca4de65`)

Uygulanan delta (wip commit'i ile base arasındaki fark, yani gerçek kurtarılan iş):
```
$ git diff --stat ec26e24e bfde13a6 | tail -1
 410 files changed, 76201 insertions(+), 1433 deletions(-)
$ git diff --stat bca4de65 0f4b0d84 | tail -1
 10 files changed, 200 insertions(+), 4 deletions(-)
```

Not: `git diff --stat origin/dev...wip/<ad>` büyük sayılar veriyor (417 ve 11 dosya) çünkü iki worktree de origin/dev'den çok geride (sırasıyla 1955 ve 109 commit). Bu fark yeni iş değil, eski taban farkı; karşılaştırmayı bu yüzden içerik ve `git cherry` ile yaptım.

Dev'de zaten olup olmadığı (`git cherry origin/dev <commit>`):
```
- 0cbe3c92, 0d387c78, 36cda69d, da12240f, bca4de65   (befb-e2e-m7 branch'indeki 5 commit: hepsi dev'de patch-eşdeğer)
+ ec26e24e                                            (befb-approvals branch'indeki 1 commit: dev'de YOK)
```

## Değişen dosyalar / içerik özeti

### befb-e2e-m7 → `wip/befb-e2e-m7` (`0f4b0d84`)
Tek bir takip işi: M7 modülü kapalıyken TTO eylemleri "modül kullanılamıyor" mesajı göstersin (sessizce boş sonuç değil).
- Yeni: `src/lib/module-unavailable.ts`, `tests/module-unavailable-action-message.test.tsx`
- Değişen: `src/lib/modules/access.ts`, `src/lib/hooks/use-action-error-text.ts`, `src/modules/m7/server/actions.ts`, `src/app/[locale]/(app)/[workspace]/tto/client.tsx`, `messages/{en,tr}.json`, `tests/e2e/m7-tto-accelerator.spec.ts`, `tests/modules/m7.test.ts`
- Dev durumu: `assertModuleAccess('M7')` dev'de var, ama refusal mesajı akışı (`module-unavailable.ts`, `MODULE_UNAVAILABLE_DIGEST`, i18n `moduleUnavailable` anahtarı) dev'de yok.
- **Öneri: yarım iş, karta bağlanmalı.** Kurtarılan delta, M7 refusal takibinin ("refusal söylenir, yutulmaz") ardında kalan kısmı. Bir PR olarak dev'e alınmadan önce E2E doğrulanmalı (bu oturumda koşulmadı). `TASK-MUUS5HE3OW0CT` ile ilişkisi kart açıklamasından doğrulanmalı.

### befb-approvals → `wip/befb-approvals` (`bfde13a6`)
- Asıl tek commit: `ec26e24e` "Add E2E test suite for notifications center" (7 dosya, +890): `playwright.config.ts`, notifications `client.tsx`/`page.tsx`, `tests/e2e/{fixtures/auth-secret.ts, fixtures/session.ts, global-setup.ts, notifications-center.spec.ts}`. Dev'de bunların bir kısmı zaten var ama farklı sürümde (dev `notifications-center.spec.ts` 568 satır, ec26e24e 215 satır; `session.ts` 325 vs 287). Dev bu konuda çok daha ileride olduğu için bu commit'i olduğu gibi PR yapmak yerine dev'deki sürümle karşılaştırılmalı.
- Commit edilmemiş 127 değişiklik:
  - **383** untracked dosya `origin/dev` ile birebir aynı → çöp kopya, dev'de zaten var.
  - **21** untracked dosya dev'den farklı; dev'in sürümü daha yeni ve daha büyük (ör. `alerts-daily.ts` 330 vs 392 satır, `storage.ts` 599 vs 653, `schema.prisma` 1759 vs 1775). Bu 21 dosyada dev'de olmayan yalnız **89 satır** var (en çok `alerts-daily.ts` 26, `cron-tenant-scope.test.ts` 14, `schema.prisma` 18). Bunlar eski bir taban kopyası; yeni iş sayılmaz, ama 89 satırın dev'e taşınıp taşınmayacağı ayrıca bakılmalı.
  - **26** untracked dosya dev'de yok: `src/lib/hooks/use-read-notifications.ts` (dev'de silinmiş, eski kopya), 2 `docs/agent-results/*.md` (raporlar), ve `test-results/` + `test-artifacts/` (üretilmiş çıktı, commit'e alınmadı).
  - Değişen izlenen dosyalar: `package.json` (dev ile aynı), `pnpm-lock.yaml` ve `src/lib/env.ts` (dev'den farklı, eski taban).

## Gizli bilgi taraması
- `.env` dosyası commit'e girmedi (`git diff --cached --name-only | grep '.env'` boş).
- Eşleşen satırlar gerçek sır değil: `'sk_test_mock'` yer tutucusu (Stripe), `url.password === ''`, yerel test veritabanı `postgresql://fabrika:fabrika@localhost:5433/fabrika` (E2E için), `TEST_SECRET = 'test-only-…'`, `plain-access-token-123` (test fixture'ı). Bunlar yalnız test ve yerel geliştirme değerleri; yine de wip dalı push edildiği için repo erişimi olan herkes görür.

## Riskler
- wip dalları `dev`'den çok eski tabanlardan türetildi: `wip/befb-approvals` içindeki 383+21 dosya dev'in eski kopyası. Bu dalları **doğrudan dev'e PR olarak açmak yanlış olur** (dev'deki daha yeni sürümleri geri alırdı).
- İki worktree de 2.3–2.6 GB (`node_modules`, `test-results` vb.); kaldırılması disk kazandırır ama bu görevde kaldırılmadı.
- Platform: yalnız mac'te git işlemi yapıldı; uygulama/E2E koşulmadı.

## Açık sorular
1. M7 refusal işi (`wip/befb-e2e-m7`) hangi karta bağlanacak ve devam edilecek mi? Öneri: karta "yarım" olarak bağla, E2E'yi dev'in güncel tabanında (yeni worktree) koştur.
2. `ec26e24e` notifications E2E suite'i dev'deki sürümle birleştirilecek mi, yoksa tamamen atılacak mı? Dev'deki spec daha yeni (568 satır), büyük olasılıkla atılabilir; sahiplik kararı lidere ait.

## Öneriler (worktree başına)
- **`befb-e2e-m7`** → Kaldırılabilir **ama önce** `wip/befb-e2e-m7` push'u doğrulandı. Yarım iş: M7 refusal takibi karta bağlanmalı; dev güncel tabanından yeniden dallanıp PR açılabilir.
- **`befb-approvals`** → Kaldırılabilir (wip dalında güvende). İçeriğin çoğu dev'de zaten var; yalnız 89 satır (`alerts-daily.ts`, `cron-tenant-scope.test.ts`, `schema.prisma` vb.) incelenip gerekiyorsa ayrı bir karta alınmalı. Notifications E2E sürümü dev'dekiyle karşılaştırılmadan PR açılmamalı.

## Sonraki adım
- Lider onayıyla worktree'ler `git worktree remove` ile kaldırılabilir (bu görevde kaldırılmadı, kural gereği).
- Platform beyanı: mac.
