# TASK-MTV5GFB75N43S — EK: §5.1 bulgusunun düzeltmesi (fatura e2e 503'ü)

**Ajan:** blok-zincir-dse · **Tip:** düzeltme/ek kanıt · **Ana rapor:**
`docs/agent-results/TASK-MTV5GFB75N43S-blok-zincir-dse.md` (değiştirilmedi — kanıt
dosyaları bir kez yazılır; bu ek onun yerine geçmez, onu düzeltir)
**Platform:** macOS (Darwin 25.6.0)

## Neyi düzeltiyorum

Ana raporun §5.1'inde, `pnpm gate`'in e2e ayağını kırmızıya boyayan 13 fatura testinin
503 vermesini şöyle raporlamıştım:

> "…bu bir **yerel ortam kurulumu boşluğu**, kod hatası değil (…) **Öneri:** ya `.env`'e
> sekiz anahtar eklensin ya da bu spec'ler anahtarlar yoksa `test.skip` etsin"

**Teşhisin yarısı doğru, önerisi yanlıştı.** Doğru olan: 503 gerçekten
`supplier_identity_not_configured` dalıydı ve rota tasarlandığı gibi davranıyordu.
Yanlış olan: bunun çözümünün `.env`'e anahtar eklemek olduğu. `.env`'e bakıp "0 anahtar"
görmek beni yanlış sonuca götürdü — **testlerin `.env`'e ihtiyacı yok.**

## Ölçüm (TASK-MTV5H4HCGGGQ5 sırasında, izole worktree'de)

`playwright.config.ts` bu değişkenleri **kendi başlattığı** web sunucusuna zaten
enjekte ediyor:

```ts
const testEnv = {
  INVOICE_SUPPLIER_NAME: 'TEST E2E Tedarikçi A.Ş.',
  INVOICE_SUPPLIER_VKN: '1000000000',
  ...
};
// webServer: { command: `pnpm dev --port ${PORT}`, env: { ...process.env, ...testEnv } }
```

Aynı commit, aynı kod, iki koşu — tek fark sunucunun bu değişkenlerle başlatılıp
başlatılmaması:

```
# dev sunucusu supplier değişkenleri OLMADAN başlatıldı
  2 failed  (invoice-write-path.spec.ts:131 → 503, :192)

# dev sunucusu supplier değişkenleriyle başlatıldı
  ✓ 1 a tenant with no billing identity is paid-up but not invoiced (70ms)
  ✓ 2 a payment issues one invoice, and the export route serves it (1.4s)
  ✓ 3 a redelivered webhook does not issue a second invoice (7ms)
  ✓ 4 two concurrent payments get two distinct numbers (47ms)
  4 passed (2.4s)
```

## Gerçek kök neden

Kırmızı, `reuseExistingServer: true` iken testlerin **başkasının başlattığı** ve bu
değişkenleri taşımayan dev sunucusuna bağlanmasından geliyordu — paylaşılan ağaçta altı
ajan çalışırken :3000'i kimin tuttuğu belirsiz. `414e705` ("fix(e2e): disable
reuseExistingServer to prevent stale dev server env loss") tam olarak bunu düzeltti;
başka bir ajan benim raporumdan bağımsız olarak aynı sorunu bulup kapatmış.

## Sonuç

- `.env`'e `INVOICE_SUPPLIER_*` eklenmesi önerimi **geri çekiyorum**. Gereksiz, ve
  gerçek vergi kimliği değerlerini yerel bir dosyaya yazdırma riski taşıyordu.
- `test.skip` önerimi de geri çekiyorum: testler doğru, kapsadıkları şey gerçek.
- Ana rapordaki "13 fatura e2e'si kırmızı" gözlemi **o an doğruydu**; sebebi yanlış
  atfedilmişti. Kod hatası yok, `.env` boşluğu da yok — sunucu başlatma sorunuydu ve
  kapandı.

## Kendime çıkardığım ders

Bir e2e kırmızısının sebebini "eksik ortam değişkeni" diye kapatmadan önce, o
değişkenleri **kimin sağlaması gerektiğine** bak: `.env` mi, yoksa test koşucusunun kendi
`webServer.env` bloğu mu. `.env`'de yokluğunu görmek, sağlanmadığı anlamına gelmiyor.
Hafızaya yazıldı: `fabrika-e2e-env-comes-from-playwright-not-dotenv`.

## Platform beyanı

macOS (Darwin 25.6.0, arm64) üzerinde, izole git worktree'de kendi portumda (3200)
gerçek Chromium ve gerçek Postgres ile ölçüldü. Ölçüm platforma bağlı bir kod yoluna
dokunmuyor (ortam değişkeni okuma); Windows/Linux'ta aynı davranış beklenir, oralarda
**koşulamadı** (bu ofiste yalnız macOS makinesi var).
