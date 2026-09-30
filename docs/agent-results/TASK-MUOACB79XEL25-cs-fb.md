# TASK-MUOACB79XEL25 — cs-fb — FB TAKİP (İNCELEME-93 D-1 + İNCELEME-94 Ö-1/Ö-2/G-1)

**Durum:** TAMAM
**Dal:** `cs-fb/muoacb-action-leak-guard` (dev 32eff357'den), kendi worktree'si; dev'e merge edildi, push yok.
**Platform:** macOS (Darwin 27, arm64). Ayrıntı en altta.

## 1. Ne yapıldı

### D-1: eylem bekçisi artık sözdizimi ağacını okuyor (X2–X7)
Eski `catchReturnLeaks` bir regex tarayıcısıydı. `catch (ad) { … }` bloğuna bakıyor, bir çağrıya adına göre güveniyordu. Yerine `tests/api/action-leak-scan.ts` geldi. Bu dosya TypeScript derleyicisinin AST'sini ve sembol çözümünü kullanıyor (devDependency olan `typescript`; yeni bağımlılık yok). Adlara değil değerlere bakıyor:

- **Kaynaklar:** catch bağlaması (yapıbozumlu hali dahil, X2); reddetme işleyicisinin parametresi (`.catch(h)`, `.then(_, h)`); işleyici aldığını geri veriyorsa bu çağrının sonucu (X5).
- **Akış:** Değer şu yollarla taşınıyor ve sabit noktaya kadar izleniyor: bildirim; atama (bir alana ya da dıştaki değişkene yapılan atama da, X3/X4; alana atama bütün nesneyi kirletir); yapıbozumlu atama; kirli değer üzerinde `for…of`; kirli argümanlı metot çağrısı (`out.push(e)`, `Object.assign(out, e)`). Adlar sembolle çözülüyor, yani başka fonksiyondaki aynı adlı `e` başka bir değişken sayılıyor.
- **Sanitiser (X6):** İki tür var.
  - İçe aktarılan sanitiser: adı ve modülü `SANITISERS` haritasında eşleşmeli (`errorCode`←`src/lib/errors` vb.). Yeniden adlandırılmış import (`errorMessage as errorCode`) ya da başka modülden gelen aynı ad güvenilmez. Parametre gölgelemesi de güvenilmez.
  - Yerel fonksiyon: **adına göre değil gövdesine göre** değerlendiriliyor. Bütün parametreleri kirli sayılır; hiçbir dönüşü sızmıyorsa temizdir. Gerçek ağaçtaki ajans `errorCode` ve plans `planFailure` bu yolla temiz çıkıyor. Adı kalıcı güven listesinden kalktı; `planFailureCode` ise import olarak listeye girdi.
- **Direktif (X7):** `hasUseServerDirective` direktif önsözünü AST'den okuyor, bu yüzden önündeki yorumlar sorun olmuyor. Fonksiyon içindeki satır içi `'use server'` da bulunuyor. Sonuç: `portal/partner/[token]/page.tsx` artık taranıyor (37 dosya; eski regex 36 dosya tarıyordu).
- **Hedefler:** Dosyadaki her `return` ve ok fonksiyonunun ifade gövdesi. Reddetme işleyicisinin içi hariç, çünkü onun değeri çağrı sonucu üzerinden izleniyor.
- Bekçi gevşetilmedi. `KNOWN_ACTION_LEAKS` boş kaldı. Eski 13 sızıntı fixture'ı aynı `toHaveLength(1)` ile duruyor. "fine" fixture'larına gerçek dosyalardaki gibi import satırları eklendi; bu sıkılaştırmadır, çünkü artık import olmadan sanitiser sayılmıyorlar. 15 yeni kendi-mutant fixture'ı var: X2–X7, X6b/c/d, push, Object.assign, `.then` işleyicisi, adıyla verilen işleyici, sızdıran yardımcı ve yapıbozumlu atama.

### Ö-1: admin plan testleri gerçek hata sınıfıyla
`actions.test.ts` artık `vi.mock('@/lib/tenant', async (i) => ({ ...(await i()), requirePlatformAdmin: h.admin }))` kullanıyor. Ret de gerçek `new PlatformAdminRequiredError()` ile kuruluyor. Sahte `PlatformAdminRequired` sınıfı silindi.

### Ö-2: "sürücü kodu anahtar olamaz" kuralı artık doğrudan test ediliyor
Yeni test şunu doğruluyor: her `PLAN_FAILURE_CODES` girdisi `SCREAMING_SNAKE` biçiminde. Hiçbiri Prisma (`P\d{4}`), SQLSTATE (`[0-9A-Z]{5}`) ya da Node (`E[A-Z]+`) kodu biçiminde değil.

### G-1: `setVisibilityAction` değeri çalışma anında doğruluyor
- Doğrulama `z.enum` ile yapılıyor. Liste `VISIBILITIES`'ten geliyor ve `satisfies Record<PlanVisibility, true>` ile tipe eşit tutuluyor: tipe yeni bir değer eklenirse ya da listeden bir değer eksilirse tsc kırılır.
- Sıra: önce yetki (`requirePlatformAdmin`), sonra doğrulama. Admin olmayan kullanıcı her durumda yalnız `PLATFORM_ADMIN_REQUIRED` alır.
- Geçersiz değer için `{ ok: false, code: 'INVALID_VISIBILITY' }` dönüyor ve log'a yalnız kod ile `logger.warn` yazılıyor. Kullanıcının gönderdiği değer log'a geçmiyor.
- `INVALID_VISIBILITY`, `PLAN_FAILURE_CODES` listesine ve tr/en kataloglarına eklendi.

## 2. Kanıt (ekler: `TASK-MUOACB79XEL25-cs-fb-ekler/`)

### 2.1 Gerçek m8 dosyasına mutantlar (`mutants-acb.py.txt` → `mutants-acb-out.txt`)
Mutantlar devop-fb'nin `mutants93.py`'si ile uygulandı ve yalnız bekçi koşuldu. Son `git diff`: temiz.
```
ÖLDÜ   | bekçi=KIRMIZI | X1 ekstra alan message: String(e) (kontrol)
ÖLDÜ   | bekçi=KIRMIZI | X2 yapıbozumlu catch ({ message })
ÖLDÜ   | bekçi=KIRMIZI | X3 nesneye sonradan atama (out.detail = String(e))
ÖLDÜ   | bekçi=KIRMIZI | X4 dış let + atama (why = String(e))
ÖLDÜ   | bekçi=KIRMIZI | X5 promise .catch((err) => err)
ÖLDÜ   | bekçi=KIRMIZI | X6 sahte sanitiser adı errorCode()
ÖLDÜ   | bekçi=KIRMIZI | X7 'use server' önünde yorum + X1 sızıntısı
YAŞADI | bekçi=yeşil   | X8 X1 + eski bilinen-liste girdisi {m8:1} geri   ← kontrol: bilinen-liste muafiyeti tasarım gereği maskeler; liste boş tutuluyor
ÖLDÜ   | bekçi=KIRMIZI | X10 ajans yerel errorCode gövdesi sızdırır (ad aynı)
ÖLDÜ   | bekçi=KIRMIZI | X11 planFailure: code yerine e.message
ÖLDÜ   | bekçi=KIRMIZI | X12 planFailureCode başka modülden aynı adla
ÖLDÜ   | bekçi=KIRMIZI | X13 m8 errors.push + dönüş
```
İlk koşuda X10–X13 geçersizdi, bu yüzden sayılmadı. Nedeni: X8 bekçi test dosyasını değiştiriyor, betik de ardından `git checkout` yapıyor. O sırada test dosyasındaki değişikliklerim commit edilmemişti ve checkout onları sildi. Değişiklikleri yeniden uygulayıp commit ettim (04caaf72) ve mutantları tekrar koştum; yukarıdaki tablo bu ikinci koşunun sonucu.

### 2.2 Analizcinin kendisine mutantlar (`scan-mutants-out.txt`): 9/9 öldü
Her kural tek tek gevşetildi. Her seferinde en az bir bekçi testi kırmızı oldu:
- S1 yapıbozum → X2
- S2 alan/dış atama → X3, X4
- S3 `.catch` sonucu → X5, `.then`, adıyla verilen işleyici
- S4 ada göre sanitiser → X6, X6b, X6c, X6d
- S5 import modülü → X6b
- S6 eski direktif regex'i → X7 ve direktif testi
- S7 metot çağrısı alıcısı → push, Object.assign
- S8 ternary koşulunu da sayma → gerçek ağaçta yanlış pozitif; FP testi kırmızı
- S9 `.code`/`.message` gevşek → 6 test

### 2.3 Gerçek ağaç
- 531 kaynak dosya içinde 37 eylem dosyası var ve hepsinde **sızıntı 0** (FP 0).
- Tarama süresi yaklaşık 0,8 sn.
- Yeni taranan dosya: `src/app/[locale]/portal/partner/[token]/page.tsx`.

### 2.4 Ö-1 / Ö-2 / G-1 testlerine mutantlar (`plan-mutants-out.txt`): 6/6 öldü
```
ÖLDÜ | O1 tenant.ts PlatformAdminRequiredError.code yeniden adlandırıldı (crw-fb X6) | kırmızı: 13   (önce: 33 test yeşil kalıyordu)
ÖLDÜ | O2 P2002 listeye ve iki kataloğa eklendi | kırmızı: 12
ÖLDÜ | O2b 23505 (SQLSTATE) listeye ve iki kataloğa | kırmızı: 1   ← yalnız yeni Ö-2 testi yakalıyor
ÖLDÜ | G1 doğrulama kaldırıldı | kırmızı: 9
ÖLDÜ | G1b doğrulama yetki kontrolünden önce | kırmızı: 1
ÖLDÜ | G1c enum gevşek (z.string()) | kırmızı: 4
```

### 2.5 G-1 canlı ret (`live-g1.mjs.txt` → `live-g1-out.txt`)
Ortam: prod `next build` + `next start` (:47931) ve izole `csfb-acb-pg` DB'si. Çağrı, tarayıcının göndereceği POST'un aynısıydı: `Next-Action` başlığı ile `encodeReply` gövdesi. Token'lar `next-auth/jwt` `encode()` ve CI test fikstürüyle üretildi; admin bilgisi DB'deki `User.isPlatformAdmin` alanından okunuyor.
```
[admin, geçersiz "csfb-acb"] HTTP 200 sonuç={"ok":false,"code":"INVALID_VISIBILITY"} | Plan.visibility public→public | audit 0→0
[admin, geçersiz "PUBLIC" / "" / "public " / "archived\u0000"]  → aynı ret, DB değişmedi
[admin, dize olmayan null / 42 / ["public"] / {"v":"public"}]   → aynı ret, DB değişmedi
[üye (admin değil), geçersiz] sonuç={"ok":false,"code":"PLATFORM_ADMIN_REQUIRED"}
[admin, geçerli private] sonuç={"ok":true} | public→private | audit 0→1
[admin, geri public]     sonuç={"ok":true} | private→public | audit 1→2
SONUÇ: 12/12 beklenen; son Plan.visibility=public
```
- Sunucu log'unda 10 `[admin/plans] setVisibility refused` satırı var: 9 geçersiz değer ve 1 yetkisiz çağrı.
- Log'da `csfb-acb` geçmiyor, yani girdi log'a yansımadı.
- Karşılaştırma: aynı çağrı dev'de `{"ok":true}` dönüyor ve değeri yazıyordu (crw-fb İNCELEME-94 G-1, `crw94`).

### 2.6 Kapılar (`gates.txt`, HEAD a7c84c92)
```
tsc exit=0
eslint exit=0
i18n exit=0   (✅ both catalogs agree …)
build exit=0  (✓ Compiled successfully; tek uyarı src/instrumentation.ts Edge process.exit — dev'de de var)
npx vitest run exit=0 — Test Files 296 passed | 2 skipped (298) · Tests 3785 passed | 41 skipped (3826)
check-live-skips exit=0
```
- DB: izole `csfb-acb-pg`. Hazırlık CI sırasıyla yapıldı: `db push` → `db:rls-role` → `apply-migrations.sh` ×2 (41 dosya) → `db:rls` (112 politika) → `db:seed`.
- Ortam: `CI=true` ve CI'daki `AUTH_SECRET` fikstürü.
- Paylaşılan `fabrika` :5433 DB'sine yazılmadı.

## 3. Değişen dosyalar
- `tests/api/action-leak-scan.ts` (yeni): AST analizcisi, `SANITISERS` ve `hasUseServerDirective`.
- `tests/api/response-status-scan.ts`: eski `catchReturnLeaks` ve yardımcıları çıkarıldı. 5xx bölümü aynı kaldı.
- `tests/api/api-error-body-guard.test.ts`: AST dosya seçimi, direktif testi ve X2–X7 + yakın mutant fixture'ları.
- `src/app/[locale]/admin/billing/plans/actions.ts`: G-1 zod doğrulaması.
- `src/app/[locale]/admin/billing/plans/failure-codes.ts`: `INVALID_VISIBILITY`.
- `src/app/[locale]/admin/billing/plans/actions.test.ts`: Ö-1, Ö-2 ve G-1 testleri.
- `messages/tr.json`, `messages/en.json`: `adminPlans.errors.INVALID_VISIBILITY`.
- `docs/agent-results/TASK-MUOACB79XEL25-cs-fb.md` ve `…-ekler/`.

## 4. Riskler / bilinen sınırlar
Aşağıdaki sınırlar analizcinin başlık yorumunda da yazılı. Bugün `src`'de hiçbirinin örneği yok:
- `Promise.allSettled(...).reason` yolu izlenmiyor.
- `new Promise` içindeki reject geri çağrısı izlenmiyor.
- EventEmitter `error` dinleyicisi izlenmiyor.
- Sanitiser olmayan ama temiz dönen, başka modülden içe aktarılmış bir yardımcı sızıntı sayılır. Bu güvenli yönde bir hata; gerekirse `SANITISERS`'a testiyle birlikte eklenir.
- `.code` muafiyeti korunuyor: catch değerinin kendi `.code`'u güvenilir. Bir eylem Prisma `.code`'unu doğrudan döndürürse bekçi bunu kaçırır. Plans tarafında bu Ö-2 testi ile kapalı; diğer modüllerde kodu i18n anahtarı ya da `toEqual` birim testi tutuyor. Muafiyeti daraltmak ayrı bir iş olur, çünkü `evidence/actions.ts UploadRefused` buna dayanıyor.
- Analizci eylem dosyası başına bir `ts.createProgram` kuruyor (`noLib`, `noResolve`). Maliyeti yaklaşık 0,8 sn.

## 5. Açık sorular
Yok.

## 6. Sonraki adım
- İnceleme: bekçinin yapısal kuralları ve G-1.
- İsteğe bağlı takip: `.code` muafiyetini `instanceof` ile daraltılmış alan hatalarına sınırlamak.
- Worktree'de kalan: izole `csfb-acb-pg` konteyneri. Merge sonrası kaldırıldı (aşağıda).

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, arm64; Node 26; Docker `pgvector/pgvector:pg16`; prod `next build`/`next start`). Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. Koda göre beklenen davranış:
- Analizcinin platforma bağlı tek yeri modül yolu karşılaştırması. `node:path` `join`/`normalize` kullanılıyor, `\` karakteri `/`'ya çevriliyor ve uzantı atılıyor; Windows'ta da aynı `src/lib/errors` biçimine iner.
- Bekçi testi dosya yollarını mevcut `rel()` ile `sep`→`/` normalleştiriyor.
- G-1 değişikliği bir sunucu eylemi girdisini doğruluyor; süreç, kabuk ya da dosya yolu kullanmıyor.
- Ekteki betikler (`python3`, `docker exec`, psql shim) yalnız test aracı.
