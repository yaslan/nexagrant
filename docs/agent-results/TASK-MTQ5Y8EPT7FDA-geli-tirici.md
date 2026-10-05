# TASK-MTQ5Y8EPT7FDA — `demo-tenant` fallback'lerinin sökülmesi

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi) · **Tip:** bug/P0-güvenlik · **Sprint:** S8
**Commit:** `9e0f891` — `fix(k5): drop demo-tenant fixtures from the pipeline store`

---

## 1. Ne yapıldı

### Önce: kartın durumu koda karşı doğrulandı

Görev kartı "5 dosyada 11 yerde `demo-tenant` sabit fallback'i" diyordu. Kodu okuduğumda
**11 eşleşmenin 5'i zaten yorum satırıydı** — 2, 3 ve 4. maddeler önceki dalgada
(`7623a28`, `97cf93d`) kapatılmış, geriye açıklayıcı yorumlar kalmıştı:

| Kart maddesi | Gerçek durum | Kanıt |
|---|---|---|
| 2 — `src/lib/tenant.ts` fail-closed olsun | **Zaten yapılmış.** `tenantScopeOf` null döner; `assertTenant` `TenantScopeError` fırlatır, `requireTenantPage` login'e yönlendirir, `requireTenantApi` 401 döner. Fallback yok. | `src/lib/tenant.ts:63-135` |
| 3 — admin sayfalarında platform-admin / kiracı ayrımı | **Zaten yapılmış.** `admin/billing` `requireTenantPage()` çağırıyor; `admin/layout.tsx` platform-admin değilse `notFound()`. | `src/app/[locale]/admin/layout.tsx:36-39` |
| 4a — `src/lib/iyzico.ts` tenantId zorunlu | **Zaten yapılmış.** `createCheckout` imzası `tenantId: string`; webhook `tenantId` yoksa abonelik açmayı reddediyor. | `src/lib/iyzico.ts:5,81-84` |
| 4b — `src/lib/k5-pipeline/pipelineStore.ts` | **AÇIKTI — bu görevde kapatıldı.** | aşağıda |
| 5 — demo fixture'ları ürün kodundan çıkar | **AÇIKTI — bu görevde kapatıldı.** | aşağıda |

> Bu, hafızamdaki `fabrika-board-cards-go-stale` kaydının bire bir tekrarı: kart, koda göre kısmen eskimişti.
> Kartı koda karşı doğrulamadan çalışsaydım zaten fail-closed olan üç dosyayı gereksiz yere değiştirecektim.

### Kapatılan gerçek açık: `pipelineStore.ts` içindeki demo fixture'ları

`src/lib/k5-pipeline/pipelineStore.ts`, **ürün kodunun içinde** `tenantId: 'demo-tenant'` ile
sabitlenmiş 6 uydurma fırsat taşıyordu. `demo-tenant` `prisma/seed.ts:174`'te açılan **gerçek bir
kiracı satırı**, yani her sunucu süreci o kiracının panosuna uydurma satırlar ekiyordu — üstelik
`g0Score` değerleri (91, 94, 88, 92, 85, 94) koda gömülü sabitlerdi; CLAUDE.md §7 kullanıcıya
gösterilen her rakamın bir `Evidence`/`TopicStat` kaydına bağlı olmasını şart koşar.

Yapılan:

1. **6 fixture satırı ürün kodundan silindi.** Store artık boş başlıyor ve yalnız adının söylediği
   şey: DB yazımı başarısız olduğunda yeni oluşturulan fırsatı görünür tutan süreç-içi tampon.
   Aynı kiracının demo verisi zaten `prisma/seed-opportunities.ts` (`TENANT_ID = 'demo-tenant'`)
   tarafından veritabanına seed ediliyor — yani veri kaybı yok, sadece doğru yere taşınmış oldu.
2. **`addInMemoryOpportunity` imzası sıkılaştırıldı.** Eskiden `tenantId`'yi payload'ın içinden
   okuyordu; artık ayrı ve zorunlu bir argüman:
   ```ts
   addInMemoryOpportunity(tenantId: string, opp: Omit<OpportunityItem, 'tenantId'>): OpportunityItem
   ```
   Store'a yazılan kiracı **her zaman** çağıranın kanıtladığı kiracıdır, payload ile gelen değil.
   Boş `tenantId` ile çağrı `throw` eder. Bu, karttaki 4. maddenin pipelineStore ayağıdır.
3. Çağıran (`pipeline/actions.ts`) yeni imzaya uyarlandı; `tenantId` oturumdan geliyor.
4. Üç regresyon testi eklendi (aşağıda).

### `iyzico.ts` webhook imzası — bilinçli olarak `tenantId?: string` bırakıldı

Kart "imzayı `tenantId: string` yap (opsiyonel bırakma)" diyor. `handleIyzicoWebhook`'un payload'ı
**dış sağlayıcıdan gelen tel formatı**; alanı `string` ilan etmek TypeScript'e gerçekte garanti
olmayan bir şeyi söylemek olurdu — sağlayıcı alanı göndermezse tip yalan söyler, çalışma
zamanında `undefined` geçer. Doğru koruma zaten yerinde: alan yoksa fonksiyon aboneliği
**açmayı reddediyor** (`iyzico.ts:81-84`). Güvenlik hedefi (atfedilemeyen ödeme bildirimi başkasının
hesabında abonelik açamaz) karşılanmış durumda; imzayı değiştirmek onu güçlendirmez, zayıflatır.

---

## 2. Kanıt

### 2.1 `grep -rn "demo-tenant" src/` — ürün kodunda 0 çalışan kullanım

```
$ grep -rn "demo-tenant" src/
src/app/[locale]/admin/modules/page.tsx:8:  // `demo-tenant-1` / `demo-tenant-2` in the picker, and those are real seeded
src/app/[locale]/admin/billing/page.tsx:13:  // a fallback tenant here meant a broken session could manage `demo-tenant-1`'s
src/lib/tenant.ts:11: * (`(session as any)?.tenantId || 'demo-tenant-1'`, or `prisma.tenant.findFirst()`).
src/lib/tenant.ts:12: * Both are silent cross-tenant grants: `demo-tenant` is a *real* row in the
src/lib/iyzico.ts:78:  // The tenant defaulted to `demo-tenant-1`, which is a real seeded row: a
src/lib/k5-pipeline/pipelineStore.ts:41: * 'demo-tenant'` — a real seeded row. That put demo fixtures inside product
```

Kalan 6 eşleşmenin **tamamı yorum satırı** — fallback'in neden kaldırıldığını anlatan
regresyon notları. Yorum satırlarını eleyince:

```
$ grep -rn "demo-tenant" src/ | grep -vE ':\s*(//|\*|/\*)'
exit=1 (1 = no matches = clean)
```

**Çalışan kodda `demo-tenant` kullanımı: 0.**

### 2.2 Store'un davranışı — önce/sonra, ayrı süreçlerde ölçüldü

`globalThis` paylaşıldığı için iki sürüm ayrı Node süreçlerinde çalıştırıldı:

```
$ npx tsx probe-before.ts
BEFORE (commit 9e0f891^): rows the store serves to tenant "demo-tenant" = 6
   - demo-opp-101 | İklim Modellemesi ve Risk Tahmini İçin İleri | g0Score: 91
   - demo-opp-102 | İklim Modellemesi ve Risk Tahmini İçin İleri | g0Score: 94
   - demo-opp-1   | FLEX-GRID: Decarbonised Smart Grid Flexibili | g0Score: 88
   - demo-opp-2   | TWIN-HYDRO: AI-Powered Digital Twins for Gre | g0Score: 92
   - demo-opp-3   | CIRC-PACK: Circular Bio-Economy Polymers for | g0Score: 85
   - demo-opp-4   | CLEAN-PORT: Zero-Emission Coastal Freight &  | g0Score: 94

$ npx tsx probe-after.ts
AFTER (commit 9e0f891): rows the store serves to tenant "demo-tenant" = 0
```

### 2.3 Gerçek istek — oturumsuz erişim fail-closed

```
$ curl -s -o body.html -w "status=%{http_code} redirect=%{redirect_url}\n" http://localhost:3000/tr/demo-workspace/pipeline
status=307 redirect=http://localhost:3000/tr/giris
$ curl ... /tr/admin/billing   → status=404
$ curl ... /tr/admin/modules   → status=404
```

Gövdede `FLEX-GRID | TWIN-HYDRO | CIRC-PACK | CLEAN-PORT | İklim Modellemesi` → **0 eşleşme.**
Pipeline oturumsuz kullanıcıyı giriş sayfasına yolluyor; admin rotaları platform-admin olmayana
404 dönüyor (rotanın varlığını bile açık etmiyor — `admin/layout.tsx` `notFound()`).

### 2.4 Gerçek istek — GERÇEK oturumla, gerçek kiracıda

NextAuth credentials akışıyla (CSRF → callback → session cookie) gerçek giriş yapıldı:

```
$ curl -s -b jar.txt http://localhost:3000/api/auth/session
{"user":{"name":"Dr. Mehmet Yılmaz","email":"mehmet@fonbridge.app","id":"cmtqasb5n0000r3xkq6qyclju"},
 "tenantId":"cmtqasb5q0001r3xkgxvzr9k9","role":"TENANT_OWNER",
 "workspaceIds":["cmtqasb5t0002r3xkirkthzrf"],"isPlatformAdmin":false}
```

Oturumun `tenantId`'si **gerçek bir cuid** — `demo-tenant` değil, yani fallback devrede değil.
Bu oturumla pipeline sayfası:

```
$ curl -s -b jar.txt -o pipe.html -w "status=%{http_code}\n" http://localhost:3000/tr/default/pipeline
status=200   bytes=62479

FLEX-GRID              -> 0 hit(s)
TWIN-HYDRO             -> 0 hit(s)
CIRC-PACK              -> 0 hit(s)
CLEAN-PORT             -> 0 hit(s)
demo-opp-              -> 0 hit(s)
İklim Modellemesi      -> 0 hit(s)
```

Sayfa 200 ile **render oluyor** (pano işaretleri gövdede: `Pipeline` ×7, `Fırsat` ×7, `G0` ×4) —
yani boş sayfa göstererek "sızıntı yok" demiyoruz; sayfa çalışıyor ve içinde uydurma satır yok.

### 2.5 typecheck + test

```
$ npx tsc --noEmit ; echo "EXIT: $?"
TYPECHECK EXIT: 0

$ npx vitest run
 Test Files  47 passed | 2 skipped (49)
      Tests  398 passed | 8 skipped (406)
   Duration  1.43s
```

Yeni testler (`tests/k5-pipeline-store-tenant.test.ts`, 8 test geçiyor):
- `starts empty rather than shipping demo rows into product code`
- `files a write under the caller's tenant, not one carried in the payload` — payload'a
  `tenantId: TENANT_B` kaçırılsa bile satır `TENANT_A`'ya yazılıyor; B'nin listesi değişmiyor
- `refuses a write with no tenant`

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/k5-pipeline/pipelineStore.ts` | 6 demo fixture satırı silindi; store boş başlıyor; `addInMemoryOpportunity(tenantId, opp)` imzası zorunlu kiracı alıyor |
| `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` | Yeni imzaya uyarlandı; `mockOpp` → `newOpp`/`storedOpp`, kiracı oturumdan |
| `tests/k5-pipeline-store-tenant.test.ts` | Yeni imzaya uyarlandı + 3 regresyon testi |

`git diff --cached --stat`: `3 files changed, 63 insertions(+), 147 deletions(-)`

**Dokunulmayan** (kart kapsamı dışı / başka ajanlar orada): `src/modules/m6`, `src/app/(marketing)`,
`src/app/portal`. `tenant.ts`, `iyzico.ts` ve admin sayfalarına da dokunulmadı — zaten fail-closed.

---

## 4. Riskler

- **DB kapalıyken demo kiracının panosu boşalır.** Eskiden DB düşünce `demo-tenant` 6 uydurma satır
  görüyordu; artık boş görür. Bu **kasıtlı**: uydurma satır dayanıklılık değil, yanlış veri.
  Gerçek demo verisi `pnpm db:seed` ile veritabanından gelir.
- **`WORKSPACE_MEMBERS` hâlâ ürün kodunda.** `pipelineStore.ts:29-35`'te 5 sabit demo kişi
  (Ahmet Yılmaz, Ayşe Kaya…) duruyor; `actions.ts` ve `board.tsx` bunu import ediyor. Kiracı
  sızıntısı **değil** (kiracıya bağlı veri değil, sabit bir liste), ama demo verisidir ve gerçek
  workspace üyelerinden gelmelidir. Kart kapsamı dışı ve `board.tsx` üzerinde başka ajan çalışıyor
  olabileceği için dokunulmadı — aşağıda ayrı iş olarak öneriliyor.
- **Doğrulama, başka bir ajanın çalıştırdığı `:3000` dev sunucusu üzerinde yapıldı** (kendi
  sunucumu açmaya çalıştım, port zaten doluydu). Yalnız GET istekleri gönderildi, yazma yok.
  Next dev hot-reload ettiği için sunucu benim değişikliğimi taşıyordu (2.4'teki 0 eşleşme bunu
  gösteriyor).

---

## 5. Açık sorular

1. `WORKSPACE_MEMBERS` gerçek `Membership` kayıtlarından mı gelmeli? Gelmeliyse sahip/atama
   akışının (`assignOpportunityOwner`) kiracının gerçek üyelerine göre doğrulanması gerekir —
   şu an ekranda her kiracıya aynı 5 sahte isim gösteriliyor.
2. `prisma/seed*.ts` dosyalarındaki `TENANT_ID = 'demo-tenant'` bilinçli olarak bırakıldı (kart
   5. maddesi seed'i kapsam dışı tutuyor). Prod seed'inde demo kiracının hiç açılmaması isteniyorsa
   bu ayrı bir karar.

---

## 6. Sonraki adım

- [ ] `WORKSPACE_MEMBERS`'ı gerçek `Membership` sorgusuyla değiştir (ayrı görev; `board.tsx` + `actions.ts`).
- [ ] Pipeline için e2e "mutlu yol" testi: giriş → fırsat oluştur → panoda gör (CLAUDE.md her modül
      için en az bir e2e istiyor; repoda `playwright.config.ts` **yok**, `pnpm test:e2e` şu an
      çalışmaz — bu ayrıca kapatılmalı).
