# TASK-MTQZ9767FOZMB — M6 kriter slider'ı e2e (BE-EN / geli-tirici)

## 1. Ne yapıldı

**Kart bayattı.** Kartın iddiası: "`fill()` sonrası etiket 3/5'te kalıyor". Önce ölçtüm — bu iddia
DOĞRU DEĞİL. `fill()` React'in kontrollü `input[type=range]`'inde sorunsuz çalışıyor; etiketler
5/5, 4/5, 5/5, 3/5 oluyor ve önizleme ortalaması 4.4/5'e gidiyor (aşağıdaki 02-form-filled.png).

Testin gerçek kırmızısı **daha erken** bir noktadaydı: form hiç render edilmiyordu, çünkü fixture
kiracısının **plan hakkı yoktu**. Ekranda çıkan: "Evaluator Lens modülü aboneliğinizin kapsamı
dışında. Şu planlarda yer alıyor: Pro, Ultra."

Kök neden: M6 kapısı **iki kilit**. `ModuleState = ON` (kiracı açmış) **ve** planın M6'yı veriyor
olması (`plansGrantingModule('M6')` → pro, ultra). `scripts/seed-m6-e2e.ts` yalnız birincisini
kuruyordu; `Subscription` satırı hiç yaratılmıyordu, kiracı giriş katmanına düşüyor ve plan kapısı
sayfayı kapatıyordu.

Düzeltme: fixture'a gerçek bir kiracıdaki gibi `pro`/`ACTIVE` abonelik eklendi ve rollback'e
karşılığı yazıldı. Desen icat edilmedi — `scripts/seed-relationship-e2e.ts:89` ile aynı.
**Test gevşetilmedi**; hiçbir assertion değişmedi, spec dosyasına dokunulmadı.

## 2. Kanıt

### 2.1 ÖNCE — kırmızı (düzeltmeden önceki gerçek çıktı)

```
Running 1 test using 1 worker
[seed-m6-e2e] ready — tenant=m6-e2e-tenant proposal=m6-e2e-proposal evaluation=m6-e2e-evaluation criteria=4 clearedScores=0
  ✘  1 [chromium] › tests/e2e/m6-evaluator.spec.ts:48:7 › ... a seated reviewer scores a proposal ... (11.7s)

    Error: expect(locator).toBeVisible() failed
    Locator: getByRole('main').getByTestId('m6-evaluator-form')
    Expected: visible
    Error: element(s) not found
      > 75 |     await expect(form).toBeVisible();
```

Aynı koşunun `error-context.md` DOM anlık görüntüsü — kapının kendisi:

```yaml
- main:
  - alert:
    - heading "Bu modül şu anda kullanılamıyor" [level=1]
    - paragraph: "Evaluator Lens modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: Pro, Ultra."
```

### 2.2 SONRA — yeşil (tüm spec)

```
Running 4 tests using 1 worker
[seed-m6-e2e] ready — tenant=m6-e2e-tenant proposal=m6-e2e-proposal evaluation=m6-e2e-evaluation criteria=4 clearedScores=0
  ✓  1 › m6-evaluator.spec.ts:48:7  › a seated reviewer scores a proposal and sees it on the dashboard (1.6s)
  ✓  2 › m6-evaluator.spec.ts:134:7 › the English locale renders the English M6 copy (1.2s)
  ✓  3 › m6-evaluator.spec.ts:171:9 › the Evaluator Lens page states it is an internal pre-assessment (tr) (1.5s)
[seed-m6-e2e] rolled back
  ✓  4 › m6-evaluator.spec.ts:171:9 › the Evaluator Lens page states it is an internal pre-assessment (en) (1.1s)

  4 passed (6.3s)
```

### 2.3 Slider'ın gerçekten hareket ettiğinin görsel kanıtı

`docs/agent-results/TASK-MTQ5ZF5ZRU5SM-screenshots/02-form-filled.png` (bu koşuda yeniden yazıldı,
22:21) — Yenilikçilik **5/5**, Uygulanabilirlik **4/5**, Etki **5/5**, İletişim **3/5**,
Panel Ortalaması **4.4/5**. Yani `fill()` etiketi 3/5'te bırakmıyor; kart bu noktada yanlıştı.
(Ekran görüntüsü yolu spec'in içinde sabit `TASK-MTQ5ZF5ZRU5SM-screenshots` — değiştirmedim,
spec'e dokunmama kuralı gereği.)

### 2.4 Idempotency (additive fixture — iki kez koşma kanıtı)

```
$ npx tsx scripts/seed-m6-e2e.ts && npx tsx scripts/seed-m6-e2e.ts
[seed-m6-e2e] ready — tenant=m6-e2e-tenant ... criteria=4 clearedScores=0
[seed-m6-e2e] ready — tenant=m6-e2e-tenant ... criteria=4 clearedScores=0
after 2x seed -> subscription: pro ACTIVE | moduleStates: 1 | criteria: 4

$ npx tsx scripts/seed-m6-e2e.ts --rollback
[seed-m6-e2e] rolled back
after rollback -> tenant rows: 0 | subscription rows: 0
```

İki kez koşmak satır çoğaltmıyor; geri-alma yolu (`--rollback`) eklenen aboneliği de temizliyor.

### 2.5 Kapılar

```
$ pnpm typecheck
$ tsc --noEmit        # (çıktı yok = temiz)

$ npx eslint scripts/seed-m6-e2e.ts tests/e2e/m6-evaluator.spec.ts src/modules/m6
                      # (çıktı yok = temiz)
```

## 3. Değişen dosyalar

- `scripts/seed-m6-e2e.ts` — `Subscription` (`pro`/`ACTIVE`) upsert'ü + rollback'te karşılığı
  (`prisma.subscription.deleteMany`). Toplam +12 satır, başka hiçbir şey değişmedi.

Dokunulmayan (kasıtlı): `tests/e2e/m6-evaluator.spec.ts` (tek assertion bile gevşetilmedi),
`src/modules/m6/**` (ürün kodunda hata yoktu — slider doğru çalışıyor).

## 4. Riskler

- Fixture artık `Plan` kataloğundaki `pro` id'sine bağlı. `pro` yeniden adlandırılır ya da M6'yı
  vermeyi bırakırsa test yine kapıda durur — ama kırmızı mesajı doğrudan sebebi söylüyor.
- Test yalnız `m6-e2e-tenant` kiracısının aboneliğini yazıyor/siliyor; `demo-tenant` ya da başka
  bir kiracıya dokunmuyor, yıkıcı işlem yok.
- e2e'yi mevcut 3000 dev sunucusunda koşarken `E2E_BASE_URL=http://localhost:3000/tr/giris`
  kullanmak zorunda kaldım — sebebi §5'teki başkasına ait hata.

## 5. Başka kartlara ait, düzeltmediğim kusurlar (yalnız bildirim)

- **`src/app/[locale]/admin/blog/actions.ts:32`** (ve `client.tsx:51-52`) — blog kaydının
  varsayılan görseli `https://images.unsplash.com/...`; `next.config.ts` içinde `images` alanı hiç
  yok, dolayısıyla bu hostname allowlist'te değil. Sonuç: **`/tr` ana sayfası 500 dönüyor**
  ("Invalid src prop ... hostname images.unsplash.com is not configured"). Bu, Playwright'ın
  `webServer.url` sağlık kontrolünü de düşürüyor: `reuseExistingServer` çalışmıyor, Playwright
  3000'i yeniden başlatmayı deniyor ve `EADDRINUSE` ile ölüyor — yani **tüm e2e kapısı bu tek
  hata yüzünden kapalı**. Benim dosyam değil, düzeltmedim.

## 6. Sonraki adım

- Yukarıdaki `/tr` 500'ü sahibine gitsin: `next.config.ts`'e `images.remotePatterns` eklemek ya da
  varsayılan görseli yerel bir asset yapmak. O düzelene kadar e2e koşarken
  `E2E_BASE_URL=http://localhost:3000/tr/giris` gerekiyor.
- Diğer e2e fixture'ları da aynı iki-kilit hatasını taşıyor olabilir: `ModuleState` yazıp
  `Subscription` yazmayan seed'ler taranmalı.
