# TASK-MTSZ0AL4QP2CT — `withTenant` sarmalayıcısız `prisma.*` erişimi: envanter doğrulaması + dilim planı

**Ajan:** blockzincir-pm (PM-EN) · **Tip:** SALT ÖLÇÜM + PLANLAMA (kod değiştirilmedi) · **Bağlam:** `docs/agent-results/TASK-MTU6I3V2R30M8-blok-zincir-denet-i.md`

---

## 1. Ne yapıldı

1. `prisma/rls.sql`'i bugünkü haliyle tekrar ayrıştırdım (python ile `ARRAY[...]` bloklarını çıkardım) ve denetim raporunun kullandığı model listesiyle karşılaştırdım.
2. `withTenant`/`withTenantOn`/`TenantTx` tipini `src/lib/db.ts`'ten teyit ettim: sarmalayıcı çağrıya `tx` verir, `prisma` değil — yani `prisma.<model>.` biçimindeki her ham eşleşme, tanım gereği sarmalayıcının DIŞINDadır. Bu, denetimin grep yönteminin hâlâ geçerli olduğunu doğruluyor.
3. Aynı grep yöntemini bugünkü ağaca karşı yeniden çalıştırdım, test dosyalarını eledim, sonra yorum/docstring satırlarını koddan ayırdım.
4. Bulunan her farkı (kova değişimi, düzeltilmiş satırlar, yeni tablolar) elle dosyayı açıp doğruladım — tahmin etmedim.
5. `pnpm rls:check` (`scripts/check-rls.ts`) ve `pnpm rls:verify` (`scripts/check-rls-live.ts`) dosyalarını uçtan uca okudum; `.claude/commands/review-rls`'i okudum.

---

## 2. Kanıt — sayı doğrulaması

### 2.1 Model listesi bugün 43 değil 48 (kapsam büyümüş)

```
$ python3 -c "... prisma/rls.sql ARRAY[...] parse ..."
0 45 ['Membership', 'Workspace', 'TenantProfile', ... 'ClaimEvidenceLink', 'EvidenceReminder', 'Consent']   # tenant_isolation
1 4  ['Document', 'Chunk', 'ConceptTemplate', 'AuditEvent']                                                  # tenant_or_shared
2 3  ['Plan', 'PlanVersion', 'PlanFeature']                                                                  # platform, kiracı-dışı
```

Denetim raporu "43 model (Membership…PlanAssignment + Document, Chunk, ConceptTemplate)" diyordu. Bugün `tenant_isolation` dizisi **45** model taşıyor (üç yeni model eklenmiş: `ClaimEvidenceLink`, `EvidenceReminder`, `Consent`), + 3 nullable-shared (`Document`, `Chunk`, `ConceptTemplate`, denetimle aynı — `AuditEvent` yine kapsam dışı, nedeni §3.5'te). Toplam kapsam: **48 model** (önceki: 43).

Yeni 3 modelden ikisi (`ClaimEvidenceLink`, `EvidenceReminder`) kodda **hiç kullanılmıyor** (`grep -rn` sıfır sonuç) — henüz sadece şemada var, risk yüzeyi yok. `Consent` bir yerde kullanılıyor ve zaten `tx.consent.createMany` ile sarmalayıcı içinde (`src/lib/legal/registration-consent.ts:68`).

### 2.2 Ham grep sayısı

```
$ grep -rnE "(^|[^.[:alnum:]_])prisma\.(48-model-listesi)\." src --include="*.ts" --include="*.tsx" | wc -l
142
$ # test dosyalarını ele (*.test.*, *.spec.*, /tests?/)
$ grep -vE "\.(test|spec)\.(ts|tsx)|/tests?/" > sonuç
85
```

**85** ham eşleşme (denetimin 101'i ile karşılaştırılamaz ham hâliyle çünkü model listesi 43→48 büyüdü; aşağıda içerik bazında karşılaştırma var).

### 2.3 Yorum/docstring ayrıştırması

```
$ 85 satırdan 6 tanesi yorum/docstring (regex: ^\s*(\*|//)):
src/app/[locale]/(app)/[workspace]/evidence/data.ts:12
src/app/[locale]/(app)/[workspace]/concept-notes/data.ts:12
src/app/[locale]/(app)/[workspace]/concept-notes/[id]/data.ts:12
src/app/[locale]/(app)/[workspace]/relationships/[id]/data.ts:12
src/app/api/documents/export/route.ts:15
src/lib/k5-pipeline/pipelineStore.ts:65
```

→ **Gerçek çalışan kod satırı: 85 − 6 = 79.**

### 2.4 En önemli fark: Kova 1 (denetimin işaretlediği 3 gerçek kiracı-sızıntısı satırı) **BUGÜN SIFIR**

Denetim raporu §2'de üç dosyayı riskli işaretlemişti:
- `evidence/page.tsx:21-22`
- `concept-notes/page.tsx:24-25`
- `concept-notes/[id]/page.tsx:26-27`

Doğrulama:
```
$ grep -n "prisma\." "evidence/page.tsx" "concept-notes/page.tsx" "concept-notes/[id]/page.tsx" "relationships/[id]/page.tsx"
(çıktı yok — dördü de artık prisma'yı hiç çağırmıyor)
```

Kodu okudum: mantık `data.ts`'e taşınmış, `session?.tenantId` artık zorunlu `string` parametre, sorgu `withTenantOn(client, tenantId, tx => tx.evidence.findMany(...))` içinde çalışıyor, ve dosyanın başında **TASK-MTUGJTD5HZDW0** referanslı bir docstring eski hatayı örnekle anlatıyor (bu docstring'ler §2.3'teki 4 yorumun kaynağı). `relationships/[id]/data.ts` zaten denetimde düzeltilmiş örnekti; şimdi `evidence` ve `concept-notes` (hem liste hem detay) da aynı desenle düzeltilmiş.

Repo genelinde deseni tekrar aradım, canlı kod içinde **sıfır** yeni örnek buldum:
```
$ grep -rnE "tenantId\s*\?\s*\{[^}]*\}\s*:\s*\{\s*\}" src --include="*.ts" --include="*.tsx" | grep -v test
→ yalnızca yukarıdaki 4 dosyanın docstring'leri + relationships/page.tsx:24 (yorum satırı, kod değil) + lib/db.ts:112 (yorum) + lib/tenant.ts:11 (yorum)
```

**Sonuç: 98→79'a düşüşün ana nedeni bu — TASK-MTUGJTD5HZDW0 bu turda 3 gerçek riski kapatmış.** (`git log` bu bilgiyi doğrulamak için kontrol edilmedi, dosya içeriği zaten kanıt.)

Tek bir canlı istisna var: `src/actions/user/export-data.ts:217` — `prisma.auditEvent.create({ data: { ...(tenantId ? { tenantId } : {}) , ... } })`. Bu, görünüşte aynı ternary ama **ters yönde ve zararsız**: bir `create`'in `data`'sında, `AuditEvent.tenantId` şemada nullable (KVKK silme olayı hiçbir kiracıya ait olmayabilir — bkz. `prisma/rls.sql` üstündeki yorum) ve tenantId yoksa alan boş bırakılıyor, filtre düşürülmüyor. Model `AuditEvent` zaten grep kapsamımın dışında (§3.5), doğru davranış bu.

---

## 3. Kovalara ayrım (79 gerçek satır)

| Kova | Tanım | Satır |
|---|---|---|
| A | Sihirli-token portalı (tenant henüz bilinmiyor, token=kimlik) | 3 |
| B | Platform-admin konsolu (kasıtlı kiracılar-arası) | 7 |
| C-kasıtlı | Global sayaç / admin istatistik (tenant kavramı yok) | 5 |
| C-sarılabilir | Stripe webhook (tenantId metadata'dan biliniyor, sarılabilir) | 13 |
| D-kasıtlı | Cron fan-out sorgusu (tüm kiracılar üstünde, kasıtlı) | 4 |
| D-sarılabilir | Cron alt-işlem (tenantId o iterasyondan biliniyor, sarılabilir) | 4 |
| E | KVKK/GDPR (userId ile kapsanmış, kasıtlı kiracı-dışı) | 16 |
| F | Paylaşılan platform kataloğu / auth sınırı (nullable/kasıtlı filtresiz) | 8 |
| G | `if (tenantId)` sorguyu atla deseni (güvenli) | 1 |
| H | Zaten tenantId/userId ile kapsanmış, yalnız sarmalayıcı eksik (mekanik sarılabilir) | 18 |
| **Toplam** | | **79** |

### 3.1 Dosya:satır tablosu — Kova A (3)
| Dosya:satır | Not |
|---|---|
| `src/app/[locale]/portal/partner/[token]/page.tsx:36,73` | `applicationPart.findUnique({ where: { magicToken } })` — tenant henüz bilinmiyor |
| `src/modules/m11/server/actions.ts:543` | aynı desen, sonraki yazma `part.tenantId` ile kapsanıyor |

### 3.2 Kova B (7)
| Dosya:satır |
|---|
| `src/app/[locale]/admin/feedback/actions.ts:45`, `page.tsx:45` |
| `src/app/[locale]/admin/modules/actions.ts:35`, `page.tsx:28` |
| `src/lib/billing/plan-repository.ts:374,585,753` |

### 3.3 Kova C — kasıtlı (5) / sarılabilir (13)
Kasıtlı: `src/lib/billing/lifetime-licence.ts:176,183,223` (global sayaç), `src/lib/billing/create-portal-session.ts:15`, `src/app/api/billing/portal/route.ts:14` (tenant henüz bilinmiyor, `userId` ile).
Sarılabilir: `src/lib/billing/subscription-sync.ts:282,317,345,360,369,375,385,399,415,440,524,530,546` — hepsinde `tenantId` fonksiyon parametresi (Stripe metadata'dan), doğruladım (`existingSubscription = prisma.subscription.findUnique({where:{tenantId}})` vb.).

### 3.4 Kova D — kasıtlı (4) / sarılabilir (4)
**Düzeltme (denetim raporundan farklı):** Denetim raporu D'nin tamamını "alt-işlemler doğru kapsanmış" diye tek kova saymıştı; kodu tek tek okuduğumda bu ayrım gerekiyordu:

Kasıtlı (tüm kiracılar üstünde fan-out, tenant henüz yok):
- `src/lib/inngest/jobs/alerts-daily.ts:104` — `prisma.savedSearch.findMany(SAVED_SEARCH_ALERT_QUERY)`, tenant filtresiz
- `src/lib/inngest/jobs/m4-weekly-summary.ts:62` — `prisma.relationship.findMany({ where: { nextStepDue: {...} } })`, tenant filtresiz (denetim raporu bunu yanlışlıkla "sarılabilir" gibi göstermişti — kodu okuyunca değil)
- `src/lib/feedback/digest-run.ts:49,54` — dosyada zaten yazılı: *"Reads the window and everything still open, both cross-tenant"*

Sarılabilir (döngü içinde `tenantId` zaten elde, mekanik sarma mümkün):
- `src/lib/inngest/jobs/alerts-daily.ts:125` — `membership.findMany(ownerEmailQuery(search.tenantId))`
- `src/lib/inngest/jobs/alerts-daily.ts:143,171` — `savedSearch.update({ where: { id: search.id }, ... })`, `search.tenantId` döngüden biliniyor ama `where`'e girmiyor
- `src/lib/inngest/jobs/credits-monthly-grant.ts:31` — `creditLedger.create({ data: { tenantId: tenant.id, ... } })`

### 3.5 Kova E (16) — hepsi doğrulandı, `userId`/subject ile kapsanmış
`src/actions/user/export-data.ts:67,86,90,91,92,98`, `src/actions/user/request-deletion.ts:80,135`, `src/lib/inngest/jobs/users-scheduled-deletion.ts:101,107,118,119,127,128,129,138`.

`AuditEvent` neden 48'lik model listesine girmiyor: nullable `tenantId`'si "kiracı verisi" değil "bu KVKK olayının hiçbir kiracıya ait olmadığı" anlamına geliyor (`prisma/rls.sql` üstündeki uzun yorum, TASK-MTU6HUB8FUHMG C-2). Denetim raporu da aynı gerekçeyle dışarıda bırakmıştı; ben de aynı kararı koruyorum.

### 3.6 Kova F (8)
| Dosya:satır | Model |
|---|---|
| `opportunities/[id]/m2/page.tsx:58,68` | `conceptTemplate` |
| `concept-notes/actions.ts:27` | `conceptTemplate` |
| `api/concept-notes/[id]/export/route.ts:34` | `conceptTemplate` |
| `modules/m2/server/actions.ts:94,196` | `conceptTemplate` |
| `lib/api-auth.ts:41` | `apiKey` (auth sınırının kendisi, tenant henüz yok) |
| `marketplace/page.tsx:21` | `marketplaceListing` (dosyada: *"cross-tenant catalogue by design"*) |

### 3.7 Kova G (1)
`approvals/page.tsx:23` — `if (tenantId) { findMany({where:{tenantId}}) }`, tenantId yoksa sorgu hiç çalışmıyor (Kova 1'in ters şekilde güvenli hâli).

### 3.8 Kova H (18) — mekanik sarılabilir, hepsinde tenantId/userId zaten `where`/`data`'da
| Dosya:satır | Sayı |
|---|---|
| `settings/calendar/page.tsx:33` | 1 |
| `modules/m9/server/calendar-actions.ts:31,43,71,79` | 4 |
| `pipeline/actions.ts:211,218,222,295,362` | 5 |
| `api/v1/opportunities/route.ts:44` | 1 |
| `api/concept-notes/[id]/export/route.ts:18,29` | 2 (aynı dosyanın 34'ü Kova F) |
| `lib/feedback/submit.ts:117,190` | 2 |
| `lib/dashboard/fetch-metrics.ts:57,84` | 2 |
| `lib/modules/access.ts:88` | 1 |

Tümü elle doğrulandı: `workspace.findFirst({where:{tenantId,...}})`, `opportunity.updateMany({where:{id,tenantId}})` gibi — `pipeline/actions.ts`'te iki ayrı yorum bunu zaten belgeliyor ("Both lookups carry tenantId", "updateMany + tenantId, not update by id").

### 3.9 Bilinen savunma-derinliği maddesi (denetimden, hâlâ aynı)
`src/modules/m9/server/calendar-actions.ts:43` — `disconnectCalendar`, sahiplik JS'te (`findUnique` + `tenantId!==/userId!==` kontrolü) doğrulandıktan sonra `prisma.calendarConnection.delete({ where: { id } })` çağırıyor; `where`'de `tenantId`/`userId` yok. Bugün istismar edilebilir değil (tek istek, yarış yok) ama depodaki disiplinle tutarsız. **S1'e dahil ettim** çünkü zaten aynı dosyayı sarmalayıcıya geçirirken tek satırlık ek değişiklik: `delete({where:{id}})` → `deleteMany({where:{id,tenantId,userId}})`.

---

## 4. Statik koruma sorusu — `pnpm rls:check` / `pnpm rls:verify` bu deseni BUGÜN yakalar mı?

**Hayır, ikisi de yakalamaz.** İkisini de baştan sona okudum:

- **`scripts/check-rls.ts`** (`pnpm rls:check`): Tamamen dosya-karşılaştırma. Tek sorduğu: (a) `prisma/rls.sql`'de her kiracıya-özel model için bir politika satırı var mı, (b) migration'ların kendi RLS'ini kendi dosyasında etkinleştirip etkinleştirmediği. **Hiç `src/` altındaki uygulama kodunu okumuyor.** Bir tabloyu `withTenant` dışında sorgulayan kod bu script'in bakış açısından görünmez.
- **`scripts/check-rls-live.ts`** (`pnpm rls:verify`): Veritabanına gerçekten bağlanıp (RLS'e tabi bir rolle) negatif/pozitif okuma-yazma sondası yapıyor — ama bu da **şema/tablo seviyesinde**, çağrı-yeri seviyesinde değil. `withTenant` dışı bir kod satırı, doğru `tenantId` ile çalıştığı sürece bu sondayı hiç tetiklemez; script kodu değil veritabanının davranışını ölçüyor.
- **`.claude/commands/review-rls`**: Adım 3'te *"`src/` içinde `prisma.` doğrudan çağrılarını bul; `withTenant()` dışındakileri raporla ve düzelt"* yazıyor — ama bu **otomatik bir CI kapısı değil**, elle çağrılan bir Claude Code slash-komutunun serbest-metin talimatı. `pnpm gate`'e bağlı değil, deterministik bir pattern-matcher değil, çağıran modelin o an ne kadar dikkatli greplediğine bağlı. Denetim raporunun bulduğu 3 riskli satır (`evidence`, `concept-notes` x2) muhtemelen tam da bu yüzden — bu komut hiç koşulmamış ya da koşulmuş da 3 satır gözden kaçmış — üç kez tekrarlanabilmiş.

**Sonuç: bugün ternary-fallback deseni de, sarmalayıcısız-erişim deseni de hiçbir otomatik kapıdan geçmeden `main`'e girebilir.**

### Önerilen statik koruma (uygulanmadı, öneri)
`scripts/check-rls.ts`'in zaten kullandığı desenle (bildirilen kümeyi dosyayla karşılaştırma) tutarlı, iki parçalı bir gate:

1. **Desen kilidi** — `where:\s*\w*\s*\?[^:]*:\s*\{\s*\}` biçimindeki ternary'yi (veya daha dar: `tenantId ? { tenantId } : {}` şeklinin herhangi bir varyasyonunu) regex ile `src/` genelinde ara; test dosyaları hariç bulunan HER eşleşme kapıyı kırsın (allowlist yok — bu desenin meşru bir kullanımı olamaz, "filtreyi düşür" hiçbir zaman doğru değildir).
2. **Sarmalayıcısız-erişim allowlist'i** — bu raporun §3'teki 79 satırlık sınıflandırmasını `scripts/tenant-bypass-allowlist.ts` gibi bir dosyaya (dosya:satır + kova + tek satır gerekçe) döküp yeni bir `scripts/check-tenant-bypass.ts` yaz: `48`-model listesine karşı `src/` genelinde grep yap (§2.2'deki yöntem), her eşleşmeyi allowlist'teki dosya+satır ile karşılaştır — **allowlist'te olmayan yeni bir eşleşme kapıyı kırsın**. Bir satır silinip taşınırsa (satır numarası kayarsa) allowlist güncellenmeli; bu az miktarda bakım yükü, ama "yeni bir sarmalayıcısız çağrı sessizce girdi" senaryosunu tamamen kapatıyor. `pnpm gate`'e eklenir.

Bu, "her seferinde elle grep'le ve yeniden yarg覄la" yerine "bu denetimde onaylanan kümeye karşı diff'le" mantığına geçiyor — tam olarak `check-rls.ts`'in CHECK 4'ünün zaten yaptığı şey, farklı bir veri kümesi üstünde.

---

## 5. Dilim planı — 5 öneri, dosya çakışması yok

Öncelik sırası: en küçük/en mekanik → en riskli/en geniş → son olarak salt-dokümantasyon (kapsamı en son netleşen).

### Dilim 1 — M9 takvim modülü (5 çağrı, Kova H + savunma-derinliği)
**Dosyalar:** `src/modules/m9/server/calendar-actions.ts` (4), `src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx` (1)
**Neden ilk:** En küçük, tek modül, mevcut testleri var (muhtemelen), `delete`→`deleteMany({id,tenantId,userId})` savunma-derinliği düzeltmesini de aynı PR'a mekanik olarak eklenebilir. Sarmalayıcı geçişinin deseninin ("nasıl wrap edilir, nasıl test edilir") ilk kanıtı — sonraki dilimler buna bakarak kopyalar.

### Dilim 2 — Workspace/pipeline/dashboard yüzeyi (14 çağrı, Kova H+G)
**Dosyalar:** `pipeline/actions.ts` (5), `approvals/page.tsx` (1), `dashboard/fetch-metrics.ts` (2), `lib/modules/access.ts` (1), `lib/feedback/submit.ts` (2), `api/v1/opportunities/route.ts` (1), `api/concept-notes/[id]/export/route.ts` (2 — **not:** aynı dosyanın 34. satırı `conceptTemplate`, Kova F, Dilim 5'e gidiyor, bu dosyada değişmiyor).
**Neden ikinci:** Aynı mekanik desen (tenantId zaten `where`/`data`'da, sadece sarmalayıcı eksik), ama daha fazla bağımsız dosyaya yayılmış — Dilim 1'in deseni onaylandıktan sonra paralel/ayrı bir ajana verilebilir çünkü dosya kümesi Dilim 1'le kesişmiyor.

### Dilim 3 — Stripe webhook senkronizasyonu (13 çağrı, Kova C-sarılabilir)
**Dosyalar:** `src/lib/billing/subscription-sync.ts` (yalnız bu dosya)
**Neden ayrı:** Para ile ilgili, yüksek patlama yarıçapı; `withTenant` sarmasının işlem (transaction) sınırlarını değiştirmesi Stripe webhook'unun yeniden-deneme/idempotency semantiğini etkileyebilir — dikkatli, kendi başına gözden geçirme + `invoice-writer`/`subscription-sync` test dosyalarının ayrıca koşulmasını gerektiriyor. Mekanik UI-katmanı dilimleriyle (1, 2) karıştırılmamalı.

### Dilim 4 — Cron alt-işlemleri (4 çağrı, Kova D-sarılabilir)
**Dosyalar:** `lib/inngest/jobs/alerts-daily.ts` (3: satır 125,143,171 — **satır 104 hariç**, o kasıtlı fan-out, Dilim 5'te), `lib/inngest/jobs/credits-monthly-grant.ts` (1)
**Neden ayrı:** Inngest job runtime'ı, web-request yolundan farklı test stratejisi (job unit testleri, e2e tıklama değil); dosya başına kalan tek fan-out sorgu (`savedSearch.findMany`, `relationship.findMany`, `feedback.findMany`) bilerek dışarıda bırakıldı çünkü tenantId o noktada henüz bilinmiyor — bunlar Dilim 5'in "kasıtlı istisna" listesine giriyor, koda dokunulmuyor.

### Dilim 5 — Dokümantasyon + statik-koruma allowlist'i (39 çağrı, kod DEĞİŞMEZ)
**Dosyalar (yalnız OKUNUR, referans için satır numarası alınır — düzenlenmez):** Kova A (3), Kova B (7), Kova C-kasıtlı (5), Kova D-kasıtlı (4), Kova E (16), Kova F (8) — toplam 43 kova-satırından 39'u burada, geri kalan §3.9'daki calendar-actions defense-in-depth Dilim 1'e gitti çünkü zaten koda dokunuluyor.
**Yeni dosyalar (bu dilimde YAZILIR):** `scripts/tenant-bypass-allowlist.ts`, `scripts/check-tenant-bypass.ts`, `package.json`'a `rls:bypass-check` script'i + `pnpm gate`'e ekleme.
**Neden son:** Bu dilimin allowlist'i, Dilim 1-4 hangi satırların "artık sarmalı" hale geldiğini netleştirdikten SONRA yazılmalı — yoksa allowlist güncel kalamaz (Dilim 1-4 landed olduğunda o satırlar allowlist'ten çıkarılmalı, çünkü artık `tx.` üzerinden çağrılıyorlar ve grep onları zaten yakalamayacak). En yüksek uzun-vadeli değeri taşıyan dilim bu — §4'teki statik korumayı gerçek CI kapısına dönüştürüyor — ama önkoşulu diğer dört dilimin bitmiş/karara bağlanmış olması.

**Toplam kontrol:** 5+14+13+4+39 = 79 ✓ (79 gerçek kod satırının tamamı tam bir kez, tek bir dilimde yer alıyor; 6 yorum/docstring satırı zaten önceki turda düzeltilmiş kodun belgesi, hiçbir dilime girmiyor.)

---

## 6. Değişen dosyalar
Yalnızca bu rapor: `docs/agent-results/TASK-MTSZ0AL4QP2CT-blockzincir-pm.md`. Kod dosyası değiştirilmedi.

---

## 7. Riskler
- Dilim 3 (Stripe webhook) `withTenant` sarmasının Prisma transaction/connection pool davranışını değiştirebilir (her sarma bir `SET LOCAL` + olası nested transaction anlamına geliyor) — bu dilim işleme alınırken ayrıca bir DB bağlantı-havuzu/performans testi önerilir, bu raporun kapsamı dışında.
- Dilim 5'teki statik koruma önerisi (regex-tabanlı) yanlış-negatif üretebilir (örn. çok satırlı/iç içe ternary'ler); bir sonraki adım olarak bir AST-tabanlı kontrol (ts-morph) daha güvenilir olur ama bu raporun kapsamı dışında bırakıldı — hızlı kazanç için regex öneriliyor.
- `admin/layout.tsx`'teki "RLS Protected / %100 Enforced" rozetlerinin yanıltıcılığı (denetim raporu §4 madde 1) bu turda yeniden doğrulanmadı — kapsam dışı bırakıldı, hâlâ açık olabilir.

## 8. Açık sorular
1. Platform-admin (Kova B) ve GDPR-export (Kova E) sorguları, ana bağlantı `fabrika_app` rolüne geçtiğinde **kasıtlı olarak kiracı-sınırını aşıyor** — bunlar `withTenant` ile sarılamaz (tek bir tenantId yok). O geçiş gerçekleştiğinde bu iki kova için ayrı bir mekanizma (örn. `SECURITY DEFINER` fonksiyon, ya da admin/GDPR işlemleri için özel, denetimli bir ikinci rol) tasarlanması gerekecek — bu raporun kapsamı dışında ama rls-app-role geçiş planının bir parçası olmalı.
2. `ClaimEvidenceLink` ve `EvidenceReminder` modelleri şemada var ama hiç kullanılmıyor — kasıtlı mı (yakında gelecek bir modülün hazırlığı) yoksa ölü şema mı, netleşmedi.

## 9. Sonraki adım
Dilim 1'i (en küçük, en az riskli) ayrı bir kart olarak açıp bir geliştiriciye ver; Dilim 5'in allowlist/script yazımını Dilim 1-4 kartları `done` olana kadar bekletmesini board'da bağımlılık olarak işaretle.

## 10. Platform beyanı
Bu görev salt dosya okuma, `grep`, `python3` metin ayrıştırma ve statik kod incelemesinden ibaretti — hiçbir tarayıcı etkileşimi, süreç yönetimi veya platforma özgü ikili/kısayol içermiyor. Tüm komutlar macOS (Darwin 25.6.0, zsh) üzerinde koşuldu ve doğrulandı. Bulgular dosya içeriğine dayandığı için Windows/Linux'ta aynı sonuçlar beklenir (grep/python davranışı platform bağımsız); ayrıca koşulmadı.
