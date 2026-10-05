# TASK-MTVFKK8UZS5BF — Denetim: kart kapanabilir mi?

## HÜKÜM: KAPANAMAZ

Kod düzeltmesi doğru ve HEAD'de çalışır durumda (canlı tarayıcı testiyle doğrulandı), ama
**geliştirici raporu doğrulanamayan/yanlış bir iddia içeriyor** ve **kalıcı bir regresyon
testi yok**. Eksikler:

1. `docs/agent-results/TASK-MTVFKK8UZS5BF-blok-zincir-dev.md` "Test alerts were then
   removed" diyor — **YANLIŞ**. Doğrulama sırasında eklenen 286 test alarmı hâlâ canlı
   veritabanında duruyor (bkz. Bulgu 3). Silinen tek şey seed script *dosyasıydı*, DB
   satırları değil.
2. 300+ satır senaryosunu ölçen **otomatik/kalıcı bir test yok** (bkz. Bulgu 4). Doğrulama
   elle yapılmış, tek seferlik ve düzeltme sonrası koddan sökülmüş.
3. Düzeltme, konusu tamamen alakasız bir commit'e (`14c04f3`, billing/iyzico) sessizce
   gömülü — commit mesajı bu işten hiç bahsetmiyor (bkz. Bulgu 1). Fonksiyonel bir engel
   değil ama iz sürülebilirlik kaybı.

Kartı kapatmadan önce gereken: (a) 286 test-debris `SystemAlert` satırının temizlenmesi,
(b) >300 satır senaryosunu kapsayan kalıcı bir otomatik test, (c) ideali: düzeltmenin kendi
commit mesajıyla iz bırakması (retro-not olarak da kabul edilebilir).

---

## Bulgu 1 — Düzeltme hangi commit'te, hangi ağaçta test edildi

`git log -S` ile arandığında `totalCount`/`truncatedNote` değişikliği **tek bir commit'te**
bulundu:

```
commit 14c04f349e576952701676bc73c145ff5660b4ae
Date:   Thu Sep 10 14:48:18 2026 +0300
    fix(billing): require buyer identity from TenantBillingIdentity for iyzico
    ...
    Fixes TASK-MTSY7HZRYWWEL.
```

Commit mesajı **tamamen billing/iyzico konusunda** (TASK-MTSY7HZRYWWEL'i kapatıyor); alerts
konusundan tek kelime bahsetmiyor. Ama `git show --stat 14c04f3` diff'i şunu gösteriyor:

```
messages/en.json                         |  3 ++-
messages/tr.json                         |  3 ++-
src/app/[locale]/admin/alerts/client.tsx | 19 +++++++++++++++++--
src/app/[locale]/admin/alerts/page.tsx   | 10 ++++++++++
```

Yani TASK-MTVFKK8UZS5BF'nin **tüm kod değişikliği bu commit'in içinde**, başka bir işin
commit mesajı altında sessizce taşınmış. Bu, paylaşımlı ağaçta bilinen bir desenin
tekrarı ([[a-a-twins-failure-mode-does-not-repeat|benzer örnek]] değil ama aynı sınıf:
"bir commit başka işin dosyalarını da taşıyor" — bkz. `7fea439` commit mesajı ve takım
hafızasındaki ilgili not).

**Ağaç kontrolü:** `14c04f3`, mevcut `dev` dalının HEAD'i olan `6dcdaad`'ın atasıdır
(`git merge-base --is-ancestor 14c04f3 HEAD` → doğru). Yani düzeltme bugünkü HEAD'de
mevcut — bu kısım sorun değil.

**Rapor dosyasının zamanlaması:** `docs/agent-results/TASK-MTVFKK8UZS5BF-blok-zincir-dev.md`
git'e hiç commit edilmemiş (`??` — untracked), dosya sistemi mtime'ı `14:49:47`, yani
düzeltme commit'inden (`14:48:18`) sadece 89 saniye sonra yazılmış. Bu, raporun düzeltmeyi
içeren ağaca karşı yazıldığını düşündürür (rapordaki lint/typecheck iddiası muhtemelen
güncel ağaca karşı koşulmuş) — ama rapor hiçbir commit hash'i anmadığı için bu kesin
değil, çıkarım.

## Bulgu 2 — Bugünkü HEAD'de lint/typecheck bağımsız tekrar koşusu

```
$ pnpm typecheck
$ tsc --noEmit
(hata yok, temiz çıkış)

$ pnpm lint --quiet
$ eslint --quiet
(hata yok, temiz çıkış)
```

Her ikisi de bugünkü HEAD (`6dcdaad`) üzerinde, benim tarafımdan bağımsız olarak tekrar
koşuldu. Rapordaki iddia ("TypeScript strict check passes", "Lint produces no errors")
**doğrulandı** — bu kısım güvenilir.

## Bulgu 3 — "Test alerts were then removed" iddiası YANLIŞ

Canlı veritabanı sorgulandı:

```
{"total":320,"unresolved":320}
```

Kaynağa göre gruplama:
```
test-module / test-worker / test-api  → 286 satır  (mesaj: "Test alert for truncation testing #1..#286")
k2_monthly_cordis                     → 8
k1_daily_calls                        → 7
cordis-sync / cordis-delta            → 11
invoice_* / m10_document_generation_failed → 8
```

**320 toplam satırın 286'sı (%89,4) rapor tarafından eklenen test verisi** ve hâlâ
`resolvedAt: null` durumunda canlı duruyor. `createdAt` zaman damgaları (`2026-09-10
11:47:38.910Z`) düzeltme commit'inden (`14c04f3`, 11:48:18 UTC) önce, aynı gün.

Raporun "Test alerts were then removed (seed-test-alerts.ts deleted, seed.ts reverted)"
cümlesi **sadece seed script dosyasının silindiğini** anlatıyor — DB satırlarının
silindiğini değil. `pnpm alerts:check` bu satırları yakalamıyor çünkü gate yalnızca
`meta.tenantId`'si silinmiş bir kiracıya işaret eden satırları "öksüz" sayıyor; bu test
satırlarının `meta`'sında hiç `tenantId` yok, dolayısıyla gate'i geçiyorlar ama konsolun
"Toplam uyarı" / "Çözülmemiş" kartlarını gerçek anlamda kirletiyorlar — **tam da bu
kartın düzeltmeye çalıştığı problem** (operatöre yanlış sayı gösterme) şimdi farklı bir
yoldan geri gelmiş durumda: sayılar artık *gerçek* (rows.length değil count()), ama
gerçek sayının kendisi test çöpüyle şişirilmiş.

## Bulgu 4 — 300+ satır senaryosu için otomatik/kalıcı test yok

Arama:
```
grep -rl "isTruncated|totalCount|MAX_ROWS|truncatedNote" **/*.test.ts **/*.spec.ts
→ sonuç yok
```

`tests/e2e/qa-alert-console-probe.spec.ts` dosyasında `'300'` string'i geçiyor ama bu dosya
**salt-okunur bir ölçüm probu** (TASK-MTTUUGKNDGBXK'ten kalma), kendi test verisini
oluşturmuyor, hiçbir assertion bu düzeltmeye bağlı değil — yalnızca "sayfada '300' metni var
mı" diye log'luyor, gate değil.

**Sonuç: `>300` satır senaryosunu güvenilir şekilde ölçen kalıcı bir test yok.** Rapor
bunu zaten örtük olarak kabul ediyor ("Seed script created and ran... Test alerts were
then removed") — yani doğrulama bir kerelik, elle yapılmış ve koddan sökülmüş
(script silinmiş). Bu bir DoD eksiği.

## Bulgu 5 — Canlı tarayıcı testiyle işlevsel doğrulama (bu denetimde yapıldı)

Veritabanı zaten 320 satır (286'sı çöp) içerdiğinden, düzeltmeyi yeni veri eklemeden,
mevcut durum üzerinden gerçek bir tarayıcı oturumuyla doğruladım:

- `pnpm exec playwright test` ile geçici bir denetim spec'i (`_audit-truncation-check.spec.ts`,
  test sonrası silindi, repoya commit edilmedi) admin olarak giriş yaptı, `/tr/admin/alerts`
  sayfasını açtı.
- Playwright kendi dev sunucusunu başlattı (`reuseExistingServer: false` — [[fabrika-playwright-reuseexistingserver-lokal-risk]]
  notuyla uyumlu; benim elle başlattığım `pnpm dev` süreci (PID 74516, bu oturumda
  doğurulmuş) çakışmayı önlemek için önce durduruldu).
- Ölçülen sonuç:
  ```
  [audit] DB truth: total=320 open=320
  [audit] header tiles: ["Toplam uyarı\n320","Çözülmemiş\n320","Hata seviyesi\n104","Tekrar\n213"]
  [audit] truncation note visible: true
  [audit] rendered <tr> count (capped view): 300
  ```
- Kanıt: `test-artifacts/TASK-MTVFKK8UZS5BF-audit-screenshots/01-alerts-console.png`
  (tam sayfa ekran görüntüsü, uyarı bandı ve "320" kartları görünür durumda).

**Değerlendirme:** Kart sayıları artık gerçekten `rows.length` değil, gerçek `count()`
sonucu (320, 300'de sıkışmıyor); kesme uyarısı bandı doğru koşulda (`totalCount > 300`)
görünüyor; tabloya render edilen satır sayısı hâlâ 300 ile sınırlı (beklenen — `take:
MAX_ROWS`). **Bu üçü işlevsel olarak doğru çalışıyor.** Sorun kodun kendisinde değil,
raporun DB temizliği iddiasında ve kalıcı test eksikliğinde.

`pnpm alerts:check` de bugünkü HEAD'de temiz geçti (0 öksüz alarm) — ama yukarıda
açıklandığı gibi bu gate farklı bir şeyi ölçüyor, test-çöpünü yakalamıyor.

## Bulgu 6 — i18n anahtarları

```
messages/tr.json:1093: "truncatedNote": "300 uyarıdan fazlası varsa..."
messages/en.json:1093: "truncatedNote": "More than 300 alerts are in the system..."
```

Her iki dilde de mevcut, aynı satır numarasında, aynı JSON yapısında (`alertsConsole` /
ilgili namespace altında — bkz. commit diff'i). **Doğrulandı.**

## Kapanış için gereken adımlar (önerilen, bu denetimin kapsamı dışında uygulanmadı)

1. `SystemAlert` tablosundan `source IN ('test-module','test-worker','test-api')` ve/veya
   `message LIKE '%truncation testing%'` eşleşen 286 satırı sil (dar kapsamlı
   `deleteMany`, [[fabrika-tests-leave-permanent-alerts-in-the-operator-console]]
   desenini izleyerek).
2. `>300` satır senaryosunu kalıcı olarak ölçen bir test ekle (ör. test veritabanında
   301+ satır fixture'ı + `isTruncated`/`totalCount` assertion'ı, test sonunda kendi
   verisini temizleyen bir e2e veya entegrasyon testi).
3. (İsteğe bağlı, iz sürülebilirlik için) bu düzeltmeye referans veren küçük bir commit
   veya en azından mevcut commit mesajına retro-not.

## Platform Beyanı

**macOS (Darwin 25.6.0)** üzerinde doğrulandı — `pnpm typecheck`, `pnpm lint --quiet`,
`pnpm alerts:check` komut satırından; `/tr/admin/alerts` sayfası gerçek bir Chromium
oturumunda (Playwright, admin girişiyle) canlı olarak görüntülendi ve ekran görüntüsü
alındı. Dokunulan kod yolu (Next.js server component → Prisma `count()` → React props →
koşullu render + i18n string) platforma özgü hiçbir şey içermiyor (süreç yönetimi, dosya
yolu ayracı, kabuk komutu, DPI/ekran, mikrofon/kamera izni yok) — Windows/Linux'ta
davranış farkı beklenmiyor. Windows/Linux'ta ayrıca koşulmadı (bu denetimin kapsamında
gerek görülmedi).

---

**Denetleyen:** blok-zincir-denet-i (QA-EN)
**Oturum:** https://claude.ai/code/session_01EFgyPS3X2t9UudYS162DVf
