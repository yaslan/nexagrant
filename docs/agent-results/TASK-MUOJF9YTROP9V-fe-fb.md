# TASK-MUOJF9YTROP9V — mobile-main-overflow.spec.ts "describe.configure() called here" kök nedeni

Hüküm: YEŞİL — test dosyası bozuk değil; hata çalıştırma şeklinden (iki ayrı Playwright kopyası). Kod değişikliği yok. Doğru komutla dev 0779e8f8'de gerçek Chrome'da 12/12 geçti.
Entegrasyona hazır: kod değişikliği yok (dal `fe-fb/e2e-configure-fix` yalnızca bu raporu taşıyor, dev'e merge gerekmez)
Platform: yalnız macOS 27.0 (arm64), Node v26.5.0, pnpm 11.25.0 üzerinde doğrulandı. Linux'ta CI zaten `pnpm exec playwright` kullanıyor, aynı mantık geçerli ama bu görevde CI koşulmadı. Windows koşulamadı (makine yok). Sorun platformdan bağımsız: Node modül çözümlemesiyle ilgili.

## 1. Ne yapıldı
- Scratchpad'de dev 0779e8f8'den ayrı bir worktree açtım (dal `fe-fb/e2e-configure-fix`). Ana checkout'ta komut koşmadım.
- Playwright 1.62.1 kaynağında hata metnini buldum: `_currentSuite()` içinde `currentlyLoadingFileSuite()` boş dönünce bu hata atılıyor (`playwright/lib/common/index.js:2260`). Bu durum yalnızca spec dosyası, onu yükleyen runner'dan farklı bir `playwright` kopyasına kaydolduğunda ortaya çıkıyor. Dosya düzeyinde `configure` çağrısı geçerli bir kullanım: aynı kalıp `tests/e2e` altında 14 dosyada daha var.
- Hatayı yeniden ürettim: runner olarak `npx -y playwright@1.63.0` çalıştırdım (bu makinede `~/.npm/_npx` önbelleğinde 1.63.0 ve 1.47.0 var). Spec'teki `import '@playwright/test'` ise repo'nun 1.62.1'ine çözümleniyor. Çıkan hata ve stack karesi devop-fb raporundakiyle birebir aynı: `_TestTypeImpl._configure (…/index.js:2360:24)`, `spec:67:15`. Raporda görünen "1.62.1" de spec tarafındaki kopyaya ait.
- Doğru komutla yeşil koşu aldım: `pnpm exec playwright test …`. İzole bir pgvector pg16 DB (127.0.0.1:55207) kullandım ve DB'yi CI sırasıyla hazırladım: db push → rls-role → apply-migrations ×2 → rls → seed.
- **Memory/önceki teşhis düzeltmesi:** Test dosyasındaki async `beforeAll` ile `configure` arasında bir "çakışma" yok. `fb-gates-playwright-syntax-error` kaydında yazan kök neden yanlış.

## 2. Kanıt
### Önce: hatanın yeniden üretimi (yanlış çağrı)
```
$ npx -y playwright@1.63.0 --version
Version 1.63.0
$ E2E_PORT=3217 npx -y playwright@1.63.0 test tests/e2e/mobile-main-overflow.spec.ts --project=chromium
Error: Playwright Test did not expect test.describe.configure() to be called here.
...
- You have two different versions of @playwright/test. ...
   at mobile-main-overflow.spec.ts:67
> 67 | test.describe.configure({ mode: 'serial' });
    at _TestTypeImpl._currentSuite (…/fb-e2e/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/lib/common/index.js:2263:13)
    at _TestTypeImpl._configure (…/fb-e2e/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/lib/common/index.js:2360:24)
    at Object.<anonymous> (…/fb-e2e/tests/e2e/mobile-main-overflow.spec.ts:67:15)
Error: No tests found.
```
### Sonra: doğru komut, gerçek Chrome (Chromium headless shell 151, playwright 1.62.1)
```
$ pnpm exec playwright --version
Version 1.62.1
$ DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55207/fabrika E2E_PORT=3217 \
  pnpm exec playwright test tests/e2e/mobile-main-overflow.spec.ts --project=chromium
  ✓   1 …:93:9 › no sideways scroll inside <main> on a phone › /tr/fabrika-beta/opportunities/demo-opp-1/evaluations (2.4s)
  ✓   2 …:93:9 › … › /tr/admin/cordis (2.4s)
  ✓   3 …:93:9 › … › /tr/admin/alerts (2.1s)
  ✓   4 …:93:9 › … › /tr/fabrika-beta/approvals (2.1s)
  ✓   5 …:93:9 › … › /tr/fabrika-beta/onay-merkezi (1.6s)
  ✓   6 …:93:9 › … › /tr/fabrika-beta/ayarlar/kapilar (2.0s)
  ✓   7 …:93:9 › … › /tr/fabrika-beta/settings/gates (1.5s)
  ✓   8 …:93:9 › … › /tr/fabrika-beta/firsatlar/demo-opp-1 (2.1s)
  ✓   9 …:137:7 › long real-world content stays inside <main> › approvals: a link pasted into the title and description (4.2s)
  ✓  10 …:179:7 › … › opportunity detail: a link pasted into the title (6.6s)
  ✓  11 …:215:7 › … › gate settings: a longer weight name than today’s (2.2s)
  ✓  12 …:231:7 › … › cordis tabs: every tab reached with the keyboard is fully visible (1.0s)
  12 passed (38.3s)
exit=0
```
### Yan bulgu: "1 failed …:93:9" satırının olası kaynağı
Taze kurulumda, 1.62.1'in tarayıcısı (chromium-headless-shell v1234) yüklü değilken ilk koşuyu yaptım. Sonuç: `✘ 1 …:93:9 … (0ms)`, `1 failed / 11 did not run` ve "Executable doesn't exist … pnpm exec playwright install". devop raporundaki `1 failed …:93:9` satırı büyük olasılıkla bu ayrı bir denemeden geliyor, configure hatasından değil. Bu bir çıkarım; devop'un koştuğu komut raporda yazılı olmadığı için doğrulanamadı.

## 3. Değişen dosyalar
- Yalnız bu rapor. Kod ya da test değişmedi, test gevşetilmedi.

## 4. Doğru çalıştırma komutu (belge)
```
pnpm install --frozen-lockfile
pnpm db:generate
pnpm exec playwright install chromium          # pinlenmiş 1.62.1'in tarayıcısı
DATABASE_URL=<izole db> E2E_PORT=<boş port> pnpm exec playwright test tests/e2e/mobile-main-overflow.spec.ts --project=chromium
# veya tüm e2e: pnpm test:e2e
```
- `npx playwright …` (sürüm belirterek ya da node_modules olmayan bir dizinden) ve global/`dlx` playwright KULLANMA. Bunlar ayrı bir runner kopyası getirir ve tüm spec'ler yüklemede düşer: `test.describe.configure()` içeren dosyalarda bu hata, diğerlerinde "did not expect test() …".
- Worktree'de önce `pnpm install` yapılmalı. node_modules yoksa `npx` registry'den en yeni Playwright'ı indirir.

## 5. Riskler
- Kapı koşusunu yapan kişi komutu elle kurarsa aynı hata tekrarlanır. CI (`pnpm exec playwright`) ve `pnpm test:e2e` doğru kopyayı kullanıyor.

## 6. Açık sorular
- devop-fb'nin kullandığı tam komut raporunda yok. Tekrar koşuda `pnpm test:e2e` ya da `pnpm exec playwright test` kullanılmalı.

## 7. Sonraki adım
- TASK-MUOIBDBQSKHQ3 kapı koşusu yukarıdaki komutla yeniden yapılmalı (devop-fb).
