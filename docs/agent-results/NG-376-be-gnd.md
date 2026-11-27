# NG-376 — ReportLimiter: kurucu doğrulaması (Ö-B) ve global pencere uyarısı (Ö-A)

hüküm: TAMAM — draft PR #459 (base dev) açık, CI 10/10 pass, pre-push tam gate yeşil. Review'a alınabilir; merge yok.
platform: sunucu tarafı, platformdan bağımsız. Koşulan: Linux (WSL Ubuntu-24.04, CI Linux). Windows/mac'te koşulmadı; kod yolu süreç/dosya-yolu/ikili bağımlı değil (saf TypeScript sınıfı + logger), bu yüzden platform farkı beklenmez.

## Ne yapıldı

- **Ö-B:** `ReportLimiter` kurucusu `perClientLimit` ve `globalLimit` için `Number.isInteger(x) && x >= 1` şartını koşar; aksi halde `RangeError` atar. Limit 0 eskiden istemci haritası sınırını sessizce kapatıyordu.
- **Ö-A:** global pencere dolup bir istek reddedildiğinde, pencere başına **bir kez** `logger.warn('[report-limiter] global window full', { globalLimit, windowMs })` yazılır. Meta yalnız yapılandırma sayılarıdır; IP, istek verisi veya istemci anahtarı yoktur. Pencere yenilenince bayrak sıfırlanır.
- Çağıranlar (`csp-report`, `cookie-consent`, `email/opt-out`) değiştirilmedi.

## Kanıt (ham çıktı)

Birim testleri (değişiklik sonrası):
```
 ✓ src/lib/csp-report.test.ts (19 tests) 26ms
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

Mutant (Ö-B kontrolü geçici olarak kaldırıldı):
```
MUTANT_RC=1
 × NG-376 Ö-B: a per-client or global limit that is not an integer >= 1 throws RangeError 2ms
 FAIL  src/lib/csp-report.test.ts > ReportLimiter > NG-376 Ö-B: ... throws RangeError
AssertionError: expected function to throw an error, but it didn't
      Tests  1 failed | 18 passed (19)
```
Kontrol geri konunca:
```
RESTORED_RC=0
      Tests  19 passed (19)
```

Lint ve typecheck:
```
LINT_RC=0      (pnpm lint → eslint)
TYPECHECK_RC=0 (pnpm typecheck → tsc --noEmit)
```

Pre-push tam gate (`E2E_PORT=3100 git push -u origin task/ng-376`, `--no-verify` yok):
```
→ veritabanı: 127.0.0.1:5598/fabrika_test_ng376
736 passed (27.2m)     (e2e)
PUSH_RC=0
 * [new branch]        task/ng-376 -> task/ng-376
```

PR #459 CI (son durum, `gh pr checks 459`):
```
build-and-test  pass  6m52s
cordis-worker   pass  30s
e2e (1)         pass  11m33s
e2e (2)         pass  13m48s
e2e (3)         pass  18m39s
e2e (4)         pass  15m27s
e2e (heavy)     pass  4m41s
e2e-gate        pass  4s
i18n-audit      pass  25s
lighthouse-a11y pass  2m19s
```

Commit: `13da659b fix(csp-report): validate ReportLimiter limits and log a full global window (NG-376)`

## Değişen dosyalar

- `src/lib/csp-report.ts` — `assertPositiveInteger`, `globalFullWarned`, `globalFull()`
- `src/lib/csp-report.test.ts` — 4 yeni test: Ö-B sınır değerleri (0, -1, -300, 1.5, NaN, Infinity), limit 1 kabulü, Ö-A pencere başına tek satır ve IP'nin logda olmadığı, istemci-kaynaklı reddin global uyarı üretmediği.
- `docs/agent-results/NG-376-be-gnd.md` — bu rapor.

## Kararlar ve gerekçeler

- **SystemAlert eklenmedi (Ö-A "değerlendirilsin").** Limiter senkron ve süreç-içi; her dolu pencerede DB'ye async yazmak, herkese açık bir endpoint'ten gelen trafiğin DB yazımına dönüşmesi anlamına gelir. Pencere başına bir log satırı operatörün görmesi için yeterli bulundu. Alarm istenirse ayrı kart ve tenant/kapsam kararı gerekir.
- **`windowMs` doğrulanmadı.** Kart yalnız iki limiti istedi; `windowMs = 0` ya da NaN davranışı bu PR'da değişmedi.

## Riskler

- Üç limiter örneği (csp-report, cookie-consent, opt-out) aynı mesajı yazar ve birbirinden ayırt edilemez. Ayırt etmek için bir `name` parametresi gerekir; bu çağıranların değişmesini gerektirdiği için kapsam dışı bırakıldı.
- Uyarı yalnız ilk red anında bir kez yazılır; pencere içindeki toplam red sayısı loglanmaz. Sayı istenirse ayrı bir sayaç/özet gerekir.

## Açık sorular

- Ö-A için SystemAlert istenip istenmediği (yukarıdaki gerekçeyle önerim: hayır, ayrı kart).
- `windowMs` doğrulaması ayrı bir kart olarak açılsın mı?

## Sonraki adım

- PR #459 review (tek inceleyici; bu PR güvenlik/kimlik/ödeme/veri silme/canlı sunucu kapsamında değil).
- Sonuç dosyası bu commit'le branch'e eklenir ve push edilir (pre-push gate tekrar koşar).
