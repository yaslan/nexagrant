# HANDOVER-1 — `dev` üstündeki yarım kalan işi tamamla ve ağacı yeşile al

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi · Çekirdek takımı)
**Tarih:** 2026-09-06
**Dal:** `dev`
**Başlangıç:** `0f8bbea` + commit edilmemiş değişiklikler → `pnpm typecheck` 19 hata, `pnpm test` 7 başarısız / 316 geçiyor
**Bitiş:** `3528a03` → `pnpm typecheck` **temiz**, `pnpm test` **333 geçiyor / 3 başarısız (hepsi önceden vardı, kanıtı aşağıda)**

---

## 1. Ne yapıldı

Görev alanı yalnız `src/` ve `tests/` idi; `docs/ROADMAP.md` ve `docs/agent-results/`
(bu rapor hariç) hiç değiştirilmedi — paralel çalışan ajanla çakışma olmadı.

### Ön adım — Prisma client
`node_modules/.prisma/client/` yoktu. `pnpm exec prisma generate` koşuldu; bu
yapılmadan alakasız tip hataları çıkıyor ve teşhis yanlış yöne gidiyor.

### (a) M5–M11 manifest sözleşmesi — 7 tip hatası → 0
`src/lib/modules/types.ts` `version, routes, nav, permissions, tables` alanlarını
zorunlu yaptı, ama M5–M11 hâlâ tek satırlık eski biçimdeydi. Yedisi de dolduruldu:

| Modül | routes (katalogdan) | nav | tables (schema.prisma'dan) |
|---|---|---|---|
| M5 workflows | `pipeline`, `pipeline/[id]`, `reports/person-days` | `pipeline` (20) | Opportunity, GateDecision, Proposal, Effort, ProposalUsage |
| M6 evaluator | `opportunities/[id]/evaluations` | — | Evaluation, Reviewer, Criterion, Score |
| M7 tto | `tto` | `tto` (70) | TtoPortfolioItem |
| M8 consortium-matching | `opportunities/[id]/matching`, `pipeline/[id]/consortium` | — | ConsortiumSeat, SeatCandidate, TopicMatch |
| M9 briefs | `opportunities/[id]/briefs` | — | MeetingBrief |
| M10 followups | `opportunities/[id]/documents` | — | FollowupDoc |
| M11 application | `opportunities/[id]/application` | — | ApplicationPart |

- Her `routes[].path` `WORKSPACE_ROUTE_CATALOG` içinde **gerçekten** var (uydurma rota yok).
- `nav[].labelKey` olarak yalnız `pipeline` ve `tto` kullanıldı; **ikisi de zaten
  hem `messages/tr.json` hem `messages/en.json` `Navigation` bloğunda var**, bu yüzden
  yeni i18n anahtarı eklemek gerekmedi (CLAUDE.md §8 ihlali yok).
- Bir fırsata bağlı sayfası olan modüller (M6, M8–M11) kenar çubuğuna giriş koymuyor → `nav: []`.

Bunlar **iddia değil, teste bağlandı**: yeni `validateRegistry()` (src/lib/modules/registry.ts)
+ `tests/modules/route-catalog.test.ts` katalog↔disk, rota tekil sahiplik, izin ad-alanı,
i18n anahtarı ve Prisma model adlarını doğruluyor.

### (b) Role tip hatası (m1–m4, 8 adet) — KÖK NEDEN BULUNDU
Görev metni "`import type { Role }` string union vermiyor" diyordu; **nedeni** ölçüldü:
`src/types/prisma-override.d.ts` (commit `c915bc4`'te eklenmiş, önceden var olan dosya)
`declare module '@prisma/client'` ile gerçek üretilmiş tipleri **tümüyle gölgeliyor** ve
`Role`'u bir TS `enum`'u (nominal tip) olarak tanımlıyor. Bu yüzden `'MEMBER'` atanamıyor.
Çözüm: `Role` **değer** olarak import edilip `Role.MEMBER` yazıldı (rbac.ts'teki çalışan kalıp).
Bu kalıp override kalksa da çalışır (gerçek client de `Role` const'unu dışa veriyor).

**Override neden silinmedi (ölçülmüş karar):** silmeyi denedim — 8 Role hatası sıfırlanıyor,
ama maskelediği 3 gerçek hata ortaya çıkıyor (`prisma/seed-m6-evaluations.ts` ×2 —
`callId`/`status` diye alanlar Opportunity/Proposal'da yok, yani seed çalışma anında patlar —
ve `pipeline/actions.ts` ×1). Asıl engel: **CI `prisma generate` koşmuyor**
(`.github/workflows/ci.yml` → `pnpm install` → `prisma validate` → `lint` → `typecheck`),
yani override kalkarsa CI'da `@prisma/client` tipleri hiç bulunamaz ve typecheck kırmızıya döner.
Bu bir DevOps değişikliği (`.github/` benim alanım değil) → **Riskler**'e yazdım.

### (c) `pipelineStore` kiracı kapsamı
Store `globalThis` üzerinde yaşıyor ve **tüm istekler arasında paylaşılıyor** — yani
"in-memory" ≠ "özel". Argüman silinerek değil, store **kiracı-kapsamlı yapılarak** düzeltildi:
- `getInMemoryOpportunities(tenantId)` → yalnız o kiracının satırları.
- `updateInMemoryOpportunityStage / …Owner / addInMemoryOpportunityNote` artık
  `(tenantId, id, …)` alıyor ve **hem id hem tenantId** eşleşmezse `false` dönüyor.
- `pipeline/actions.ts`: tarayıcıdan gelen `tenantIdParam` **kaldırıldı**
  (saldırgan kontrolündeki girdiydi), `prisma.tenant.findFirst()` yedeği kaldırıldı,
  kiracı yalnız oturumdan (`tenantScopeOf`) geliyor; oturumda kiracı yoksa eylem **reddediyor**.
  DB yazmaları `updateMany({ where: { id, tenantId } })` biçimine çevrildi.
- `board.tsx`: artık `tenantId` prop'u almıyor (ölü ve yanıltıcıydı).

### (d) `settings/billing/page.tsx` — 3 × TS2339
`withTenant` dönüşü `{}` değil aslında **`unknown`**; `if (tenant)` doğruluk daralmasıyla
`{}`'ye dönüşüyordu. Kök neden yine override: `PrismaClient` `[key: string]: any` indeks
imzasıyla tanımlı olduğu için `withTenant`'ın `T` çıkarımı çöküyor. Çözüm: çağrı yerinde
tip argümanı açıkça verildi (`withTenant<TenantBillingRow | null>(…)`) — cast yok, `any` yok,
override kalksa da çalışır.

### (e) `tests/api/v1-partners.test.ts` — 4 başarısız → 6 geçiyor
Testler kaldırılan `fp_live_demo` bypass'ını bekliyordu. **Bypass geri getirilmedi, iddialar
gevşetilmedi.** Mock artık gerçek bir `ApiKey` satırı taklit ediyor: anahtar düz metin
gönderiliyor, satır **üretim kodunun hesapladığı SHA-256** altında duruyor
(`pnpm db:seed`'in yazdığı şeklin aynısı). Ayrıca **yeni bir regresyon testi** eklendi:
satırı olmayan, "demo gibi görünen" bir anahtar 401 alıyor.

### (f) `k1-daily-calls` (2) + `sedia-adapter` (1) — ÖNCEDEN KIRIK, KANITLI
Aşağıda kanıt bölümünde.

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

### Typecheck — temiz
```
$ pnpm typecheck
$ tsc --noEmit
exit=0
```
Başlangıçtaki 19 hatanın tamamı gitti (7 manifest + 8 Role + 1 pipelineStore + 3 billing).

### Test — 333 geçiyor / 3 başarısız
```
$ pnpm test
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/k1-daily-calls.test.ts > K1 Adapters > SediaAdapter > should return empty array on fetch failure gracefully
 FAIL  tests/k1-daily-calls.test.ts > K1 Adapters > SediaAdapter > SediaTopicSchema should validate topic structure
 FAIL  tests/sedia-adapter.test.ts > SediaAdapter & Live SEDIA Search API > should format framework programme filters correctly
 Test Files  2 failed | 44 passed (46)
      Tests  3 failed | 333 passed (336)
```
Başlangıç: `7 failed | 316 passed (323)`. → 4 API testi düzeldi, 17 yeni test eklendi, 3 kaldı.

### (f) "önceden vardı" kanıtı — canlı ağ zaman aşımı, benim değişikliğim değil
Başarısızlığın **nedeni** zaman aşımı, iddia hatası değil:
```
 FAIL  tests/k1-daily-calls.test.ts > … > should return empty array on fetch failure gracefully
Error: Test timed out in 5000ms.
 FAIL  tests/sedia-adapter.test.ts > … > should format framework programme filters correctly
Error: Test timed out in 10000ms.
stdout | [INFO] [SediaAdapter] Fetching page 10/10, size=3
```
Bu testlerin dokunduğu HİÇBİR dosya değiştirilmedi:
```
$ git diff --stat HEAD -- tests/sedia-adapter.test.ts tests/k1-daily-calls.test.ts src/lib/adapters
(çıktı boş)
```
Test dosyaları `src/lib/adapters/{sedia,eurostars,tubitak}`'ı import ediyor; üçü de
başlangıç `git status`'unda değişmiş dosyalar listesinde yok. Yani bu 3 başarısızlık
`0f8bbea`'da da mevcut ve canlı SEDIA API'sine bağlı — ağsız/yavaş ortamda her koşuda kırılır.
**Düzeltilmedi** (görev talimatı: önceden kırıksa dokunma).

### (e) API testleri — geçiyor
```
$ pnpm exec vitest run tests/api/v1-partners.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### Yeni testler gerçekten "ısırıyor" (mutasyon kontrolü)
Bir test yazıp "geçti" demek kanıt değil; testlerin bozulmayı yakaladığı ölçüldü.

M7 manifestine kasten sahte rota/i18n anahtarı/model adı kondu:
```
$ pnpm exec vitest run tests/modules/route-catalog.test.ts
+   "M7: route \"tto-that-does-not-exist\" is not a page in WORKSPACE_ROUTE_CATALOG",
+   "M7: Navigation.ttoNotAKey missing in tr.json",
+   "M7: Navigation.ttoNotAKey missing in en.json",
+   "M7: \"NotARealModel\" is not a model in schema.prisma"
      Tests  3 failed | 4 passed (7)
```
(geri alındıktan sonra: `Tests  7 passed (7)`)

`pipelineStore`'daki kiracı filtresi kasten kaldırıldı:
```
$ pnpm exec vitest run tests/k5-pipeline-store-tenant.test.ts
     × returns only the rows of the tenant that asked
     × returns nothing for a tenant with no rows
     × refuses a stage move against another tenant's opportunity
     × refuses an owner change against another tenant's opportunity
     × refuses a note written onto another tenant's opportunity
      Tests  5 failed (5)
--- restored, re-run ---
      Tests  5 passed (5)
```

### Lint — temiz DEĞİL, ama benim yüzümden değil (ölçüldü)
`pnpm lint` bütün repoda **543 error / 222 warning, 185 dosya** veriyor. Bu, işe başlamadan
önce de vardı ve neredeyse tamamı dokunmadığım kodda `@typescript-eslint/no-explicit-any`.
DoD'daki "lint temiz" bu alt-görevin kapsamında ulaşılabilir değil (543 hatanın tamamını
düzeltmek `src/` genelinde ayrı bir iştir), bu yüzden **ölçülebilir olanı** yaptım:
dokunduğum hiçbir dosyanın hata sayısını artırmadım.

Her dosya için `git show HEAD:<yol>` ile eski sürüm geri yazılıp aynı ESLint yapılandırmasıyla ölçüldü:
```
src/app/[locale]/(app)/[workspace]/pipeline/actions.ts        HEAD=12  NOW=11
src/app/[locale]/(app)/[workspace]/pipeline/board.tsx         HEAD=6   NOW=6
src/app/[locale]/(app)/[workspace]/pipeline/page.tsx          HEAD=3   NOW=2
src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx  HEAD=3   NOW=2
src/lib/k5-pipeline/pipelineStore.ts                          HEAD=0   NOW=0
```
Net **−3 hata**, hiç artış yok. Yazdığım tüm yeni dosyalar 0 hata:
```
src/lib/tenant.ts                        errors=0
src/lib/modules/route-catalog.ts         errors=0
src/lib/modules/registry.ts              errors=0
src/lib/modules/types.ts                 errors=0
tests/modules/route-catalog.test.ts      errors=0
tests/k5-pipeline-store-tenant.test.ts   errors=0
tests/api/v1-partners.test.ts            errors=0
src/modules/m5..m11/manifest.ts          errors=0 (hepsi)
```

### Commit'ler (`git add -A` kullanılmadı; her commit öncesi `git diff --cached` doğrulandı)
```
3528a03 fix(k5): scope the in-memory pipeline store to a tenant
7e6e534 fix(security): resolve the request tenant from the session and nothing else
5cf3d9f fix(modules): complete the manifest contract for M1-M11
```
Sahnelenen içerik doğrulaması (paralel-ajan içerik kaybına karşı):
```
$ git show :src/lib/api-auth.ts | grep -c "fp_live_demo"     → 1  (yalnız açıklama satırı, kod değil)
$ git show :src/lib/auth.ts | grep -c "demo-tenant-hq"       → 0
$ git show :src/lib/tenant.ts | grep -c "requireTenantPage"  → 1
$ git show :src/modules/m7/manifest.ts | grep -c "routes:|nav:|permissions:|tables:|version:" → 5
$ git show :.../pipeline/board.tsx | grep -c "tenantIdParam" → 0
```

---

## 3. Değişen dosyalar

**Yeni:**
- `src/lib/tenant.ts` — tek kiracı çözümleme noktası *(önceki ajanın bıraktığı dosya, commit edildi)*
- `src/lib/modules/route-catalog.ts` — gerçek sayfa kataloğu *(aynı şekilde)*
- `tests/modules/route-catalog.test.ts` — katalog/manifest/i18n/şema doğrulaması
- `tests/k5-pipeline-store-tenant.test.ts` — store kiracı sınırı regresyonu

**Değişen:**
- `src/lib/modules/types.ts`, `src/lib/modules/registry.ts` (+`validateRegistry()`)
- `src/modules/m1…m11/manifest.ts` (11 dosya)
- `src/lib/auth.ts`, `src/lib/api-auth.ts`
- `src/lib/k5-pipeline/pipelineStore.ts`
- `src/app/[locale]/(app)/[workspace]/` altında: `pipeline/{page,board,actions}`,
  `settings/{billing,api-keys,modules}/page`, `marketplace/page`, `tto/page`,
  `opportunities/[id]/{application,briefs,documents,evaluations}/page`
- `tests/api/v1-partners.test.ts`

---

## 4. Riskler

1. **CI `prisma generate` koşmuyor** (`.github/workflows/ci.yml`). Repo bunu
   `src/types/prisma-override.d.ts` ile telafi ediyor, ama o override gerçek Prisma
   tiplerini tümüyle gölgeliyor: `prisma.*` her yerde `any`, `Role` nominal enum,
   `withTenant`'ın generic çıkarımı çöküyor. Yani **tip sistemi kiracı hatalarını
   yakalayamıyor** — bu işte düzelttiğim sınıftaki hatalar tam olarak böyle geçiyor.
   Önerilen (bu görevin alanı dışında, `.github/` DevOps): CI'a `pnpm exec prisma generate`
   adımı ekle, sonra override'ı sil. Ölçüldü: silince yalnız 3 hata kalıyor ve **ikisi
   gerçek çalışma-anı hatası** — `prisma/seed-m6-evaluations.ts` `Opportunity.callId` ve
   `Proposal.status` yazıyor, bu alanlar `schema.prisma`'da YOK, yani o seed patlar.
2. **Demo pipeline kartları artık gerçek kiracıya görünmüyor.** `pipelineStore`'daki
   örnek satırlar `tenantId: 'demo-tenant'` taşıyor; kiracı filtresi eklendiği için başka
   bir kiracıyla giren kullanıcı boş board görür. Bu **istenen güvenlik sonucu** (o satırlar
   demo kiracıya ait) ama demo/sunum akışını değiştirir — seed ile gerçek kiracıya satır
   yazmak gerekebilir.
3. **Oturumu kiracısız kullanıcı artık `/{locale}/no-workspace`'e yönleniyor.** Bu sayfanın
   var olduğunu doğrulamadım (benim yazdığım kod değil, `src/lib/tenant.ts`'ten geliyor) —
   yoksa 404 görünür. Kontrol edilmeli.
4. **Gerçek tarayıcı e2e koşulmadı.** DB + oturum gerektiriyor ve `pnpm dev`'i ön planda
   çalıştırmak bu ortamda ajan oturumunu düşürüyor (bkz. hafıza: `agent-exit-129-sighup`).
   Kanıtım tipler + 336 birim testi + mutasyon kontrolü seviyesinde; **tarayıcıda tıklama
   kanıtı yok.** Özellikle `pipeline` board sürükle-bırak ve billing sayfası elle görülmeli.

---

## 5. Açık sorular

1. Override + CI `prisma generate` konusu (Risk 1) kimin işi — DevOps mu, ayrı bir görev mi?
   Bu düzeltilmeden tip sistemi kiracı sızıntılarını yakalamıyor.
2. `prisma/seed-m6-evaluations.ts` gerçekten kırık mı, yoksa şema mı geride kaldı
   (`Opportunity.callId`, `Proposal.status` eklenecek miydi)? Karar verilmeden düzeltmedim.
3. `pnpm lint`'teki 543 hatalık taban temizlenecek mi? Kurallar (`no-explicit-any`) mı
   gevşetilecek, kod mu düzeltilecek — ürün kararı.
4. Demo pipeline satırları (Risk 2) hangi kiracıya taşınsın?

---

## 6. Sonraki adım

1. `no-workspace` sayfasının varlığını doğrula (Risk 3) — yoksa ekle.
2. `pnpm dev` ile gerçek tarayıcı doğrulaması: pipeline sürükle-bırak, not ekleme,
   sahip atama, billing sayfası — ekran görüntüsüyle.
3. CI'a `prisma generate` ekle, ardından `src/types/prisma-override.d.ts`'i sil ve
   ortaya çıkan 3 hatayı düzelt (2'si gerçek seed hatası).
4. Demo pipeline satırlarını gerçek bir kiracıya seed'le.

---

## Definition of Done

- [x] `pnpm typecheck` temiz (19 → 0)
- [ ] `pnpm lint` temiz — **ulaşılamadı**; 543 hata bu iş başlamadan önce vardı ve
      dokunmadığım kodda. Ölçülebilir olan sağlandı: dokunduğum dosyalarda net −3 hata,
      artış yok; yazdığım her yeni dosya 0 hata. (bkz. Kanıt → Lint)
- [x] `pnpm test` — her başarısızlık ya düzeltildi (4 API testi) ya da kanıtıyla
      "önceden vardı" belgelendi (3 canlı-ağ zaman aşımı)
- [x] Bekleyen kiracı-izolasyonu işi geri alınmadı; tamamlandı ve testlerle bağlandı
- [x] `git add -A` kullanılmadı; her commit öncesi `git diff --cached` ile doğrulandı
- [x] `docs/ROADMAP.md` ve diğer `docs/agent-results/` dosyalarına dokunulmadı
- [x] Sır / kişisel veri sızıntısı yok
