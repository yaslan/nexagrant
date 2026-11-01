# TASK-MTV8WPLBFQNAO — SMTP "from" adresi `env.ts` üzerinden okunsun

**Ajan:** customer-support (CS-EN) · **Tip:** bug (kural ihlali + çift varsayılan) · **Commit:** `545f412`
**Platform beyanı:** macOS (darwin 25.6.0, Apple Silicon) üzerinde doğrulandı. Windows/Linux **koşulmadı** — gerekçe: dokunulan kod yolu platforma bağlı değil (süreç öldürme, dosya yolu, kabuk/ikili adı, ekran izni yok); değişen şey bir zod şema değerinin React prop'u olarak taşınması ve bir e-posta başlığı dizesi. Kodda platforma özgü dal yok, bu yüzden diğer platformlarda davranış aynıdır.

---

## 1) Ne yapıldı

Kart üç şeyi istiyordu; üçü de yapıldı, artı ölçüm sırasında ortaya çıkan **üçüncü bir varsayılan kopyası** bulunup kaldırıldı.

**(a) `process.env` erişimi bileşenden tümüyle kalktı.**
Eski hâli (`src/app/[locale]/admin/settings/smtp-form.tsx:7`):

```ts
const SMTP_FROM_ADDRESS = process.env.NEXT_PUBLIC_SMTP_FROM_ADDRESS || 'noreply@usfinbridge.com';
```

Yeni hâli — değer artık sunucudan prop olarak geliyor:

```ts
export function SmtpSettingsForm({ fromAddress }: { fromAddress: string }) {
```

Bileşen içindeki 4 kullanım yeri (`user` başlangıç değeri, `fromEmail` başlangıç değeri, iki `placeholder`) `fromAddress` prop'unu okuyor.

**(b) `|| 'noreply@usfinbridge.com'` yedeği kalktı.** Varsayılan yalnızca zod şemasında yaşıyor (`src/lib/env.ts:51`). Kartın sorduğu "ayrışırlarsa hangisi kazanır" sorusu artık ortadan kalktı: tek kaynak var.

**(c) Client component olduğu için değer PROP ile geçiyor — gerekçesi tek cümle:**
Depoda `NEXT_PUBLIC_*` değişkenini `env.ts` üzerinden okuyan **mevcut örnek var ama hepsi sunucu tarafı** (`src/app/layout.tsx:19` → `env.NEXT_PUBLIC_APP_URL`); `'use client'` başlıklı hiçbir dosya `@/lib/env` import etmiyor (ölçüm aşağıda), ve edemez de: `env.ts` import anında **tüm** ortam nesnesini `safeParse` ediyor, tarayıcı paketinde böyle bir nesne yok (Next.js yalnızca gördüğü tekil `NEXT_PUBLIC_*` üye ifadelerini gömüyor), dolayısıyla istemcide şema hiçbir şey ayrıştıramaz ve ortam nasıl yapılandırılırsa yapılandırılsın kendi varsayılanını döndürürdü — bu yüzden değer, `env.ts`'i zaten sunucuda okuyan sayfadan (`src/app/[locale]/admin/settings/page.tsx`) prop olarak iniyor. Yeni desen icat edilmedi; `layout.tsx`'in kullandığı `env.<KEY>` okuma deseninin aynısı, sadece sunucu sınırında kalıyor.

**(d) Kapsam dışı görünen ama kartın KANIT ölçütünün zorunlu kıldığı ek düzeltme:**
`grep -rn "noreply@usfinbridge.com" src/` ilk çalıştırıldığında varsayılan **üç** yerde çıktı — bileşen, şema ve `src/actions/user/request-deletion.ts:200`:

```ts
from: `${PRODUCT_NAME} <noreply@usfinbridge.com>`,   // eski
from: `${PRODUCT_NAME} <${env.NEXT_PUBLIC_SMTP_FROM_ADDRESS}>`,   // yeni
```

Bu dosya `env`'i zaten import ediyordu (satır 7), sunucu tarafı, ek bir desen gerekmedi. Bu satır düzeltilmeseydi "varsayılan TEK yerde" ölçütü sağlanamazdı — ve daha önemlisi, GDPR silme onay e-postası, ortam başka bir adrese yapılandırılmış olsa bile sabit adresten gidiyordu.

---

## 2) Kanıt

### 2.1 `process.env` erişimi — BOŞ

```
$ grep -n "process.env" "src/app/[locale]/admin/settings/smtp-form.tsx"
$ echo $?
1
```

(çıktı yok, exit=1 → eşleşme yok. Yorum satırında bile `process.env` jetonu bırakılmadı; açıklama "ortam nesnesi" diye yazıldı ki bu grep gerçekten boş kalsın.)

### 2.2 Varsayılan tek yerde

```
$ grep -rn "noreply@usfinbridge.com" src/
src/lib/env.ts:49:   * Defaults to noreply@usfinbridge.com; can be overridden per environment.
src/lib/env.ts:51:  NEXT_PUBLIC_SMTP_FROM_ADDRESS: z.string().default('noreply@usfinbridge.com'),
```

İki satır da `src/lib/env.ts` içinde: biri doküman yorumu, biri şemanın kendisi. `src/` altında başka kopya yok.

### 2.3 İstemcide `env.ts` okuyan mevcut örnek var mı? (prop kararının ölçümü)

```
$ for f in $(grep -rl "from '@/lib/env'" src/); do echo "$(head -3 "$f" | grep -c 'use client')  $f"; done
0  src/app/layout.tsx
0  src/app/api/billing/invoices/[id]/export/route.ts
0  src/actions/user/request-deletion.ts
0  src/lib/storage.ts
0  src/lib/llm.ts
0  src/lib/calendar/encryption.ts
0  src/lib/fx/tcmb.ts
0  src/lib/inngest/client.ts
0  src/lib/inngest/jobs/k2-monthly-cordis.ts
0  src/lib/inngest/jobs/alerts-daily.ts
0  src/lib/feedback/digest-run.ts
0  src/lib/billing/active-tier.ts
```

Sol sütun `'use client'` sayısı: hepsi 0 → `env.ts`'i okuyan **tek bir client component yok**. Bu yüzden "aynısını yap" diyecek istemci-tarafı örnek yok; prop yolu seçildi.

### 2.4 GERÇEK TARAYICI — env tanımsızken ve tanımlıyken

`.env` dosyasında `NEXT_PUBLIC_SMTP_FROM_ADDRESS` **tanımlı değil** (içeriği okumadan, yalnız anahtarın varlığı sınandı):

```
$ node -e "const fs=require('fs');const t=fs.readFileSync('.env','utf8');console.log('has NEXT_PUBLIC_SMTP_FROM_ADDRESS:', /^\s*NEXT_PUBLIC_SMTP_FROM_ADDRESS=/m.test(t))"
has NEXT_PUBLIC_SMTP_FROM_ADDRESS: false
```

Gerçek Chromium'da, gerçek platform-admin oturumuyla `/tr/admin/settings` açıldı (tek kullanımlık Playwright probu; koşudan sonra silindi, commit edilmedi). Prob formun **üç** adres alanını da okudu: `SMTP Kullanıcı Adı`, `Gönderen E-posta Adresi` değeri ve aynı alanın placeholder'ı.

**Durum A — değişken TANIMSIZ (şema varsayılanı):**

```
$ E2E_PORT=3113 SMTP_PROBE_TAG=01-env-unset SMTP_PROBE_EXPECT=noreply@usfinbridge.com \
    npx playwright test tests/e2e/tmp-smtp-from-env.spec.ts

[probe:01-env-unset] NEXT_PUBLIC_SMTP_FROM_ADDRESS=(unset)
[probe:01-env-unset] From Address input value = noreply@usfinbridge.com
[probe:01-env-unset] From Address placeholder = noreply@usfinbridge.com
[probe:01-env-unset] SMTP User input value    = noreply@usfinbridge.com
  ✓  1 [chromium] › tests/e2e/tmp-smtp-from-env.spec.ts:39:5 › smtp from address shown by the form (1.4s)

  1 passed (6.6s)
```

**Durum B — değişken TANIMLI (ortam kazanıyor, `||` dalı yokken de):**

```
$ E2E_PORT=3114 NEXT_PUBLIC_SMTP_FROM_ADDRESS=ops@fonbridge.example \
    SMTP_PROBE_TAG=02-env-set SMTP_PROBE_EXPECT=ops@fonbridge.example \
    npx playwright test tests/e2e/tmp-smtp-from-env.spec.ts

[probe:02-env-set] NEXT_PUBLIC_SMTP_FROM_ADDRESS=ops@fonbridge.example
[probe:02-env-set] From Address input value = ops@fonbridge.example
[probe:02-env-set] From Address placeholder = ops@fonbridge.example
[probe:02-env-set] SMTP User input value    = ops@fonbridge.example
  ✓  1 [chromium] › tests/e2e/tmp-smtp-from-env.spec.ts:39:5 › smtp from address shown by the form (1.0s)

  1 passed (4.5s)
```

Yani `|| 'noreply@usfinbridge.com'` dalı kaldırıldıktan sonra ölçüm hâlâ geçerli: tanımsızken varsayılan, tanımlıyken override görünüyor. Kareler:

- `docs/agent-results/TASK-MTV8WPLBFQNAO-screenshots/01-env-unset.png`
- `docs/agent-results/TASK-MTV8WPLBFQNAO-screenshots/02-env-set.png`

### 2.5 Kapı (`pnpm gate`) — commit `545f412` üzerinde

`pnpm gate` **kırmızı**, ama kırmızılığın hiçbir parçası bu commit'ten gelmiyor. Adım adım, aynı commit üzerinde:

| adım | sonuç |
|---|---|
| `pnpm db:generate` | ✅ |
| `pnpm lint` | ❌ — 1960 error / 21724 warning, **tamamı `src/` DIŞINDA** (aşağıya bak) |
| `pnpm typecheck` | ✅ temiz (`tsc --noEmit`, çıktı yok) |
| `pnpm test` | ❌ — 3 fail / 1700 pass; üçü de marka geçişi kaynaklı (aşağıya bak) |
| `pnpm i18n:check` | ✅ `both catalogs agree and every key used in src/ resolves` |
| `pnpm rls:check` | ✅ `All 44 tenant-scoped models have RLS policies registered` |
| `pnpm rls:verify` | ✅ `44 kiracıya özel tabloda … izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü` |
| `pnpm test:e2e` | ❌ — 146 passed / 5 failed / 1 skipped / 3 did not run |

**Lint neden kırmızı (BENİM DEĞİL):** bulguların hepsi ya git-ignore edilmiş bir iç worktree'den (`.claude/worktrees/zztest-validation/**`, `.claude/worktrees/e2e-fix/**` — `.gitignore:93`) ya da commit edilmiş kanıt probu dosyalarından (`docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/*.mts`, 2026-09-08'de `30c3c6c` ile inmiş) geliyor. Ölçüm:

```
$ pnpm lint 2>&1 | grep -E "^/Users.*\.(ts|tsx)$" | grep -v "\.claude/worktrees" | grep -v "docs/agent-results" | head -20
(çıktı yok)
```

`src/` altında **tek bir lint bulgusu yok**; `admin/settings` ve `request-deletion` için de eşleşme yok.

**Birim testler neden kırmızı (BENİM DEĞİL):**
- `tests/brand-surfaces-render.test.tsx` (2 fail) — test satır 41'de `expect(copyright.textContent).not.toContain('FonBridge')` diyor, oysa `PRODUCT_NAME === 'FonBridge'`; test kendi içinde çelişiyor, markanın FonBridge'e geri dönüşünden sonra güncellenmemiş.
- `tests/document-exporter.test.ts` (1 fail) — beklenen dize hâlâ `"… Fabrika'da hazırlanmıştır"`, üretilen belge `FonBridge` yazıyor.

Her ikisi de **marka geçişi işi** ve şu anda ağaçta commit edilmemiş hâlde duran komşu değişikliklerine ait (`messages/tr.json`, `messages/en.json`, `src/lib/beta/**`, `src/lib/billing/subscription-sync.ts`, `src/lib/efatura.ts`). Kart kuralı gereği **dokunulmadı, adıyla bildiriliyor**.

**E2E neden kırmızı (BENİM DEĞİL):** başarısız 5 spec —
`document-export-tenant-isolation.spec.ts:97` (organizasyon adı / marka), `price-lock.spec.ts:71,97,118` (fiyat kilidi), `render-purity-refactor.spec.ts:79` (çağrı listesi yüklenme durumu).
Hiçbiri `/tr/admin/settings` sayfasına ya da `SmtpSettingsForm`'a uğramıyor; benim dokunduğum bileşen bu sayfaların hiçbirinde **bulunmuyor**. Bu sayfanın kendisi ise yukarıdaki 2.4'te gerçek tarayıcıda iki kez yeşil.

---

## 3) Değişen dosyalar

Commit `545f412` — `git show --name-only`:

```
545f412 fix(admin): read SMTP from address through env schema, drop duplicate default
src/actions/user/request-deletion.ts
src/app/[locale]/admin/settings/page.tsx
src/app/[locale]/admin/settings/smtp-form.tsx
```

Ayrıca bu rapor + iki kanıt karesi (`docs/agent-results/TASK-MTV8WPLBFQNAO-*`).

**DOKUNULMADI:** `src/lib/beta/**`, `src/lib/billing/subscription-sync.ts`, `messages/*.json`, `src/lib/env.ts` (şema zaten doğruydu, değiştirmeye gerek olmadı). Paylaşımlı ağaçta `git add -A` kullanılmadı; yalnız üç yol staged edilip `git commit -- <yollar>` ile inildi, öncesinde `git diff --cached` ile içerik doğrulandı.

## 4) Riskler

- `SmtpSettingsForm` artık **zorunlu** bir prop alıyor. Başka bir çağıran yok (`grep -rn "SmtpSettingsForm" src/` → yalnız `page.tsx`), ama ileride bileşeni başka bir sayfaya koyan biri değeri sunucudan geçirmek zorunda; typecheck bunu zaten yakalar.
- Form hâlâ bir **maket**: "Kaydet" ve "Test Et" düğmeleri `setTimeout` ile sahte başarı döndürüyor, gerçek SMTP bağlantısı kurmuyor ve girilen değerleri hiçbir yere yazmıyor. Bu kartın kapsamı dışında ama kullanıcıya "SMTP Handshake OK" diyen bir ekran, gerçekte hiçbir şey denemiyor — ayrı bir kart hak ediyor.
- `request-deletion.ts`'deki `from` başlığı artık ortam değişkenine bağlı. Ortam yanlış bir alan adına ayarlanırsa Resend'in SPF/DKIM doğrulaması nedeniyle GDPR onay e-postası **sessizce** düşebilir (fonksiyon zaten "best-effort", hatayı `console.warn` ile yutuyor). Sabit adresle de aynı risk vardı; fark, artık yanlış yapılandırmanın tek bir yerden geldiği.

## 5) Açık sorular

- `.env.example` dosyasına `NEXT_PUBLIC_SMTP_FROM_ADDRESS` satırı eklenmeli mi? Şu an eklenmedi (kart istemiyordu ve `.env` içeriğine erişim bu oturumda kapalı). Ortamı kuran kişi değişkenin varlığını yalnız `src/lib/env.ts`'i okuyarak öğrenebiliyor.
- Adres istemciye `NEXT_PUBLIC_` önekiyle gidiyor, yani tarayıcıya sızıyor. Bu bir sır değil (giden postanın gönderen adresi zaten alıcıya görünür), ama önek artık gereksiz: değeri okuyan üç yerin üçü de sunucu tarafı. `SMTP_FROM_ADDRESS` olarak yeniden adlandırmak daha doğru olurdu — ayrı bir kart olarak açılsın mı?

## 6) Sonraki adım

- Marka geçişinin bıraktığı 3 birim testi + 5 e2e hatası ilgili ajana devredildi (bu raporda adlarıyla listelendi); bu kart onları beklemiyor.
- `pnpm lint`'in git-ignore edilmiş `.claude/worktrees/**` ağacını ve `docs/agent-results/**` kanıt dosyalarını taraması, kapıyı `src/` tertemizken bile kırmızı tutuyor. ESLint flat config'e bir `ignores` girdisi bunu çözer — ayrı bir kart.
- Bu sayfada ayrıca bir **bitişik hata** görüldü, düzeltilmedi: dev sunucu açılışında `src/app/[locale]/page.tsx:19` `generateMetadata` içinde `FORMATTING_ERROR: The intl string context variable "brand" was not provided to the string "{brand} — AB Finansman Platformu …"` fırlatıyor. `{brand}` yer tutucusu `metaTitle`/`metaDescription`'a interpolasyon değeri geçirilmeden okunuyor. Marka işini yürüten ajanın alanı.
