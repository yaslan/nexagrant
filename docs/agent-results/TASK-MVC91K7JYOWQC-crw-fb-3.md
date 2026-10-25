---
sözleşme: 3
görev: TASK-MVC91K7JYOWQC
kod: TASK-MVC91K7JYOWQC
ajan: crw-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Onay: PR #92 head 3d5825bd için delta incelemesi temiz. Probe testi artık "açık alarm kimliklerine dokunmadı" iddiasını sayıyla değil satır bazında kontrol ediyor; bu iddiayı zayıflatmıyor. Merge 88d7b230 FO-50 kodunu değiştirmiyor. Bloke eden bulgu yok; 2 öneri notu var (ikisi de düzeltme şartı değil).
platform: mac (Darwin 27). Kod yolu tarayıcı E2E + Prisma sorgusu; platforma bağlı yol yok. Playwright probe'u koşulmadı (canlı DB + sunucu gerekir); yerine statik doğrulama yapıldı (eslint + tsc temiz). Windows/Linux koşulmadı, gerek yok.
sürüm: 3
tarih: 2026-10-19
---

# FO-50 PR #92 delta incelemesi — 3d5825bd (probe testi) + 88d7b230 (dev merge)

## Ne yapıldı
- `gh pr view 92`: headRefOid = `3d5825bd`, baseRefName = `dev`, mergeable = MERGEABLE.
- İncelenen delta: `9ecb8367`..`3d5825bd` (önceki incelemem `d1c4876f` üstündeydi; PR şimdi 3d5825bd).
- Kod değiştirmedim, commit/push/merge yapmadım. Worktree: `/Users/macbook/alan/FONBRIDGE-fo50` (branch `be-fb/fo50-prereg-retention`, temiz).
- Çalıştırılan statik kontroller: `npx eslint tests/e2e/qa-alert-console-probe.spec.ts` → exit 0; `npx tsc --noEmit -p tsconfig.json` → exit 0, `error TS` 0 satır.

## (a) 3d5825bd — probe testi zayıfladı mı?

Değişiklik yalnız `tests/e2e/qa-alert-console-probe.spec.ts` (14+/5-), `git show 3d5825bd --stat` ile doğrulandı.

Eski kontrol: `afterOpen === dbOpen` (açık alarm sayısı).
Yeni kontrol: test başında açık alarmların id listesi (`preOpenIds`) alınıyor; sonda bu id'lerden hâlâ açık olanların sayısı `dbOpen`'a eşit olmalı.

Sonuç: **anlam korunuyor, bir yönden daha sıkı.**
- Probe'un bir açık alarmı çözmesi (`resolvedAt` yazması) yeni kontrolde yakalanır. Eski sayı kontrolünde ise probe bir satırı çözüp başka bir yazıcı yeni bir açık satır eklerse sayı aynı kalır ve kaçardı. Yeni kontrol bu durumu kaçırmaz.
- Probe'un bir açık alarmı silmesi (`delete`) de yakalanır: silinen id, `in preOpenIds` sayımından düşer.
- Ancak eski kontrolün **yakaladığı bir şeyi yeni kontrol yakalamıyor**: probe'un kendisinin YENİ bir açık alarm oluşturması. Eski `afterOpen` bunu fark ederdi (gürültü yoksa). Yeni kontrol yalnız `preOpenIds` satırlarına bakar; `afterTotal` yalnız loglanıyor, assert edilmiyor. Probe salt-okunur tasarlandığı için ve UI'dan yazma yolu olmadığı için bu bir gerileme sayılmaz; yine de dosya başlığındaki "creates nothing" iddiası artık test tarafından zorlanmıyor. Öneri (bloke değil): ya başlık yorumunu "bu test oluşturmaz diye varsayar; zorlamaz" diye düzeltin, ya da creation için ayrı, zaman penceresine dayalı bir kontrol ekleyin.

## (a) İddianın gerekçesi doğru mu? (öneri notu)

Commit mesajı "diğer spec'ler çalışırken alarm yazıyor (413 → 714)" diyor. Ama `playwright.config.ts:66-67`: `fullyParallel: false`, `workers: 1`; probe de `mode: 'serial'`. Yani e2e spec'leri birbirinin üstüne binmez. Gürültü başka bir kaynaktan geliyor olmalı (app sunucusu arka plan işleri, paralel çalışan canlı testler). Yeni kontrol bu varsayımdan bağımsız olarak doğrudur, ama aynı dönemde **azalma** gürültüsü hâlâ mümkün:
- `src/lib/jobs/tasks/alerts-sweep.ts:273` kiracısı silinmiş açık alarmları `resolvedAt` ile kapatıyor.
- `src/lib/observability/system-alert.ts:422-435` (`resolveAlerts`) üretici kodu açık satırları çözüyor.
Bu iki yol probe sırasında çalışırsa `stillOpen < dbOpen` olur ve test yanlış kırmızı verir. Eski sayı kontrolü de aynı şekilde kırılırdı; yani regresyon değil, kalan bir kırılganlık. Commit mesajındaki "tek neden" tespiti eksik. Öneri: commit mesajı/yorum "artış gürültüsünü giderir; probe penceresinde arka plan çözme işleri de olabilir" diye tamamlansın. Kırmızı çıkarsa bu iki yolun probe'la aynı anda koştuğuna bakın.

## (b) 88d7b230 dev merge'ü — FO-50 kodunda beklenmedik değişiklik var mı?

- `git show --stat 88d7b230`: merge, ilk ebeveyn `9ecb8367`'ye göre 41 dosya değiştiriyor; hepsi dev'den gelen M2/M11/backup/messages/i18n dosyaları. FO-50 dosyaları bu listede YOK.
- `git diff 9ecb8367 88d7b230 -- src/lib/expert-prereg src/lib/jobs/schedule.ts src/lib/jobs/tasks/expert-prereg-cleanup.ts src/lib/jobs/tasks/index.ts prisma/schema.prisma prisma/rls.sql prisma/rls-app-role.sql prisma/migrations/add-expert-founder-counter.sql prisma/migrations/apply-order.txt scripts/check-rls-live.ts scripts/rls-models.ts tests/e2e/qa-alert-console-probe.spec.ts tests/helpers tests/expert-prereg-retention.live.test.ts` → çıktı BOŞ. Merge, FO-50 yollarında hiçbir içerik değiştirmiyor.
- PR'ın dev'e göre diff'i (`gh pr diff 92`) yalnız FO-50 dosyalarını ve `docs/DATA_MODEL.md` + `docs/agent-results/TASK-MVC91K7JYOWQC-be-fb.md`'yi içeriyor; M2/M11 dosyaları PR diff'inde yok → dev'den gelen değişiklikler PR'a sızmamış.

Sonuç: merge temiz.

## Bulgular (önem sırasıyla)

**Bloke eden: yok.**

1. (öneri) Probe spec'in creation kontrolü düştü — yukarıda (a) altında. Düzeltme şartı değil.
2. (öneri) Commit mesajındaki gürültü açıklaması eksik — arka plan çözme işleri de kırılganlık kaynağı. Düzeltme şartı değil.

## Kanıt (ham çıktı)

```
$ gh pr view 92 --json headRefOid,mergeable,baseRefName
{"baseRefName":"dev","headRefOid":"3d5825bde2caf9b38bccb22aa2df777e2a7cb1ad","mergeable":"MERGEABLE"}

$ git show --stat 3d5825bd
 tests/e2e/qa-alert-console-probe.spec.ts | 19 ++++++++++++++-----
 1 file changed, 14 insertions(+), 5 deletions(-)

$ git show --stat 88d7b230 | tail -1
 41 files changed, 1089 insertions(+), 133 deletions(-)
  (FO-50 yolları yok)

$ git diff 9ecb8367 88d7b230 -- <FO-50 yolları>
  (çıktı yok)

$ grep -nE "workers|fullyParallel" playwright.config.ts
66:  fullyParallel: false,
67:  workers: 1,

$ npx eslint tests/e2e/qa-alert-console-probe.spec.ts ; echo exit=$?
exit=0

$ npx tsc --noEmit -p tsconfig.json ; echo exit=$?
exit=0   (error TS: 0)
```

## Değişen dosyalar
- Yok (yalnız bu rapor yazıldı). Kod değişikliği yapılmadı.

## Riskler
- Probe canlı koşmadı; "gerçek koşuda yeşil" kanıtı yok. Canlı çalıştırma (DB + sunucu) gerekli; bu rapor statik doğrulama.
- Azalma yönünde yanlış kırmızı riski (yukarıda).

## Açık sorular
- Commit mesajındaki "diğer spec'ler çalışırken" ifadesinin kaynağı nedir? Ölçüm FO-50 gate koşusunda mı yapıldı; hangi süreç alarm yazdı? (Cevap, creation kontrolünü geri koyup koymama kararını belirler.)
- Sonuç dosyası yolu çelişkisi: görev kartının "Sonuç dosyası" satırı `-crw-fb-3.md`, kanıt satırı `-crw-fb-2.md` diyor. Önceki `-crw-fb-2.md` (d1c4876f incelemesi) korunsun diye bu rapor `-3.md`'ye yazıldı.

## Sonraki adım
- Lider/patron: merge kararı patronda. Bu inceleme merge'i engellemiyor.
- be-fb (isteğe bağlı): commit mesajı/başlık yorumunu tamamla; creation kontrolü için karar ver.
- Canlı probe koşusu: `pnpm test:e2e -- qa-alert-console-probe` (DB + sunucu ayaktayken), sonucu ayrı bir raporla.
- Commit: bu rapor henüz commit edilmedi (kullanıcı istemediği için).
