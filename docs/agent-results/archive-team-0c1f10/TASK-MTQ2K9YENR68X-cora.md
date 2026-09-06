# TASK-MTQ2K9YENR68X — E10.3 KVKK/GDPR Compliance Implementation

**Ajan:** Cora (Backend) · **Sprint:** S8 (MVP Final) · **Epik:** E10 · **Tarih:** 2026-09-06

---

## 1. Ne yapıldı

Görev başladığında E10.3'ün **UI ve API katmanı vardı ama veritabanı katmanı yoktu**: `src/actions/user/*`,
`src/app/api/{gdpr,user}/*`, ayarlar sayfası ve yasal sayfalar yazılmıştı, fakat `deletedAt` /
`deletionRequestedAt` / `deletionReason` sütunları **ne şemada ne de veritabanında** mevcuttu. Sonuç: her iki
GDPR uç noktası da çalışma anında 500 veriyordu (kanıt §2.1). Kök nedeni kapatıp uçtan uca doğruladım.

### 1.1 Migration (asıl eksik parça)

- `prisma/migrations/add-soft-delete.sql` — **additive + idempotent** (`ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`). 7 tabloya 15 sütun + 8 indeks.
  - `User`: `deletionRequestedAt`, `deletedAt`, `deletionReason`
  - `Tenant`, `Workspace`, `Opportunity`, `Proposal`, `GateDecision`, `Effort`: `deletedAt`, `deletionReason`
- `prisma/migrations/add-soft-delete.down.sql` — geri alma; başında "önce bekleyen silme talebi var mı" kontrol
  sorgusu ile birlikte, kendisi de idempotent (`IF EXISTS`).
- `prisma/schema.prisma` — aynı sütunlar + `@@index` tanımları eklendi.
  **Karar:** indeksler kasıtlı olarak *partial değil* düz b-tree. Bu repo şemayı `prisma db push` ile
  senkronluyor; Prisma partial index ifade edemediği için partial bir indeks drift eder ve ilk push'ta yeniden
  yaratılırdı. Düz indeks = DB ile şema birebir aynı.

### 1.2 Veri dışa aktarma (`src/actions/user/export-data.ts`)

- `Opportunity` + `Proposal` tabloları eklendi — **`ownerId` ile özneye kapsamlandı**, `tenantId` ile değil:
  kiracının geri kalan pipeline'ı bu kişinin kişisel verisi değil.
- Yumuşak silinmiş satırlar dışarıda bırakılıyor (`deletedAt: null`) — silinmek üzere işaretlenmiş veriyi
  taşınabilirlik dosyasıyla geri diriltmemek için.
- Kimlik doğrulama sırları (OAuth/oturum jetonları) hâlâ dışarıda (doğrulandı, §2.2).

### 1.3 30 günlük silme işi (`src/lib/inngest/jobs/users-scheduled-deletion.ts`)

- Purge mantığı `purgeDueUsers(gracePeriodDays)` olarak **dışa aktarılan saf fonksiyona** çıkarıldı; Inngest
  fonksiyonu artık yalnız tetikleyici. Böylece kural birim test edilebilir ve Inngest runtime'ı olmadan
  çalıştırılabilir hale geldi.
- **AuditEvent yazımı eklendi** (`type='user.erased'`), öznenin ait olduğu her kiracı için bir satır.
  Özne, silinen kimliği geri üretmemek için `sha256(userId)` ile referanslanıyor: GDPR md.5(2) hesap
  verebilirliği sağlanıyor, ama denetim kaydı tek başına kimseyi işaret etmiyor.
- `step.run` sınırından geçen değerler JSON'a dönüştüğü için `deletionRequestedAt` string olarak gelebiliyor;
  `new Date(...)` ile her iki şekil de doğru işleniyor (aksi halde `toISOString is not a function` ile patlardı).

### 1.4 i18n (CLAUDE.md kural 8)

- `settings.privacy.*` — 29 anahtar, TR + EN. Ayarlar gizlilik ekranındaki tüm sabit metinler `isTr ? ... : ...`
  üçlü ifadelerinden `useTranslations('settings.privacy')`'e taşındı. (Geriye kalan iki `isTr` kullanımı
  yalnızca tarih biçimi yerel ayarı — kullanıcıya görünen metin değil.)
- `legal.{privacy,terms,dpa}.metaTitle/metaDescription` — TR + EN.

### 1.5 Yasal sayfa metadata'sı (OG)

`/{locale}/privacy`, `/{locale}/terms`, `/{locale}/compliance/dpa` sayfalarının **hiç** title/description/OG
etiketi yoktu (DPA'da yalnız title+description vardı). Üçüne de `generateMetadata` eklendi: locale'e göre
title, description, canonical, `og:title/description/url/type/locale`, twitter card.

### 1.6 Erişilebilirlik / SEO düzeltmeleri (DoD gereği)

Lighthouse ilk ölçümde a11y **91** (< 95) verdi. İki gerçek kusur:

- `<html>` etiketinde `lang` yoktu — `src/app/layout.tsx` `<html>`'i `[locale]` segmentinin üzerinde olduğu için
  locale'i route parametresinden alamıyor; `getLocale()` (next-intl/server) ile istekten okunuyor. **Tüm
  uygulamayı** etkileyen bir düzeltme.
- Beyaz metin taşıyan dolu accent butonlar karanlık temada 3.68:1 kontrast veriyordu (WCAG AA = 4.5:1).
  `--accent-strong` token'ı eklendi (açık: `#0369A1`, karanlık: `#0E7490` → 5.36:1) ve beyaz metinli iki butona
  uygulandı (çerez onayı "Kabul Et" + "Verilerimi İndir").
- Eklediğim relative `canonical` crawler'lar için geçersizdi → kök layout'a `metadataBase`
  (`env.NEXT_PUBLIC_APP_URL`, `process.env` değil) eklendi.

### 1.7 Test

`tests/users-scheduled-deletion.test.ts` — 7 birim testi (prisma mock'lu, DB'siz, CI-güvenli): itiraz süresi
sınırı, süre içindeki hesabın asla silinmemesi, özel grace period, purge sayımları, kiracı başına denetim
kaydı + ham kimliğin sızmaması, üyeliksiz kullanıcı, bir hatanın partiyi durdurmaması.

---

## 2. Kanıt (gerçek komut çıktıları)

### 2.1 Başlangıç durumu — uç noktalar çalışma anında kırıktı

```
$ curl -b cookies.txt -X POST http://localhost:3000/api/user/export
HTTP 500
{"error":"Invalid `prisma.user.findUnique()` invocation ...
   deletionRequestedAt: true,
   ~~~~~~~~~~~~~~~~~~~
 Unknown field `deletionRequestedAt` for select statement on model `User`."}
```

```
$ # information_schema: soft-delete sütunları
┌─────────┐
│ (index) │   ← 0 satır: hiçbir tabloda deletedAt/deletionRequestedAt/deletionReason yok
└─────────┘
```

### 2.2 Migration — birinci ve ikinci koşu (idempotency kanıtı)

```
$ node apply.js prisma/migrations/add-soft-delete.sql        # 1. koşu
applied prisma/migrations/add-soft-delete.sql in 16ms
row counts BEFORE: {"User":24,"Tenant":11,"Workspace":11,"Opportunity":5,"Proposal":3,"GateDecision":15,"Effort":10}
row counts AFTER : {"User":24,"Tenant":11,"Workspace":11,"Opportunity":5,"Proposal":3,"GateDecision":15,"Effort":10}
unchanged: true
soft-delete columns present: 15
indexes: Effort_deletedAt_idx, GateDecision_deletedAt_idx, Opportunity_deletedAt_idx,
         Proposal_deletedAt_idx, Tenant_deletedAt_idx, User_deletedAt_idx,
         User_deletionRequestedAt_idx, Workspace_deletedAt_idx

$ node apply.js prisma/migrations/add-soft-delete.sql        # 2. koşu — hata yok, değişiklik yok
applied prisma/migrations/add-soft-delete.sql in 4ms
row counts BEFORE: {"User":24,...,"Effort":10}
row counts AFTER : {"User":24,...,"Effort":10}
unchanged: true
soft-delete columns present: 15
```

### 2.3 Rollback testi (transaction içinde — dev DB'ye dokunulmadı)

```
non-null soft-delete values before test: 0
columns before      : 15
columns after DOWN  : 0
columns after DOWN x2: 0      ← geri alma da idempotent
columns after re-UP : 15
columns after ROLLBACK (dev DB untouched): 15
User rows still: 24
```

### 2.4 Export — gerçek oturumla

```
$ curl -b cookies.txt -X POST http://localhost:3000/api/user/export      # alice@fabrika.test
HTTP 200
content-disposition: attachment; filename="fabrika-data-export-2026-09-06.json"
cache-control: no-store

tables: User=1 Membership=1 Account=0 Evaluation=1 Opportunity=3 Proposal=2 Effort=4 AiUsageLog=0 ApprovalRequest=0
Opportunity[0]: {"id":"demo-opp-1","tenantId":"demo-tenant","workspaceId":"demo-workspace",
                 "title":"District renovation pilot — İzmir","stage":"G0","status":"ACTIVE",...}
Proposal[0]:    {"opportunityId":"demo-opp-1","id":"demo-proposal-1","acronym":"DREN",...}
Effort[0]:      {"id":"demo-effort-01","userId":"demo-user-alice","hours":16,...}
secret leak check: clean            ← access_token/refresh_token/sessionToken/id_token/password yok

$ curl -X POST http://localhost:3000/api/user/export     # oturumsuz
HTTP 401
```

**Yumuşak silme filtresi çalışıyor mu (satır işaretle → export → geri al):**

```
soft-deleted demo-effort-01 + demo-opp-3
before → Opportunity=3 Effort=4
after  → Opportunity=2 Effort=3
soft-deleted rows excluded: true
demo-opp-3 gone: true | demo-effort-01 gone: true
restored effort rows: 1 opportunity rows: 1
remaining soft-deleted → Effort: 0 Opportunity: 0      ← sonda temiz
```

### 2.5 Silme talebi akışı

```
GET  /api/user/request-deletion  → {"pending":false}
POST /api/user/request-deletion  → {"status":"pending","deletedAt":"2026-10-06T17:22:47.615Z"}   HTTP 200
DB   → {"deletionRequestedAt":"...","deletedAt":"...","deletionReason":"subject_request"}
POST tekrar (idempotency)        → aynı tarih döner, yeni süre başlatmaz
GET  /api/user/request-deletion  → {"pending":true,"requestedAt":"2026-09-06T17:22:47.615Z",
                                    "purgeAt":"2026-10-06T17:22:47.615Z"}     ← tam 30 gün
POST oturumsuz                   → HTTP 401
DELETE (iptal)                   → {"status":"active"}  HTTP 200
DB   → {"deletionRequestedAt":null,"deletedAt":null,"deletionReason":null}
pending requests in DB: 0
```

### 2.6 30 günlük purge işi — gerçek çalıştırma

Tek kullanımlık bir özne (`test-erasure-*`, talep tarihi 31 gün önce) + bir kontrol öznesi (talep dün) yaratıldı:

```
BEFORE purge: {"user":1,"memberships":1,"efforts":1,"totalUsers":25}
[R2 Cleanup] Storage not configured, skipping cleanup.
purgeDueUsers() → {"success":true,"dueCount":1,"purgedCount":1,"failedCount":0}
AFTER purge : {"user":0,"memberships":0,"efforts":0,"totalUsers":25,"controlStillThere":1}
                                                        ↑ itiraz süresi içindeki hesap SİLİNMEDİ
AuditEvent rows: 1 {"type":"user.erased",
   "target":"53307dc1540b34b3e57ba7c97aacc2c75ceeefa5e906d133c40f5680fc067e91",
   "data":{"reason":"subject_request","subjectRef":"5330...","requestedAt":"2026-08-06T17:23:49.399Z"}}
audit references raw user id anywhere? false
control user removed; final user count: 24      ← test verisi temizlendi, DB başlangıç durumunda
```

### 2.7 Birim testler

```
$ pnpm vitest run tests/users-scheduled-deletion.test.ts
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

### 2.8 Yasal sayfalar — 6 URL, metadata + OG

```
=== /tr/privacy   <title>Gizlilik Politikası ve KVKK Aydınlatma Metni — Fabrika</title>
                  og:title / og:description / og:url=/tr/privacy / og:locale=tr_TR / og:type=article
=== /en/privacy   <title>Privacy Policy &amp; GDPR Disclosure — Fabrika</title>          og:locale=en_GB
=== /tr/terms     <title>Kullanım Koşulları ve Hizmet Sözleşmesi — Fabrika</title>       og:locale=tr_TR
=== /en/terms     <title>Terms of Service — Fabrika</title>                              og:locale=en_GB
=== /tr/compliance/dpa  <title>Veri İşleme Sözleşmesi (DPA) — Fabrika</title>            og:locale=tr_TR
=== /en/compliance/dpa  <title>Data Processing Agreement (DPA) — Fabrika</title>         og:locale=en_GB

$ curl -s http://localhost:3000/tr/privacy | grep canonical
<link rel="canonical" href="http://localhost:3000/tr/privacy"/>
```

### 2.9 Lighthouse (yerel dev sunucu, headless Chrome)

| Sayfa | Performance | **Accessibility** | Best Practices | SEO |
|---|---|---|---|---|
| /tr/privacy | 100 | **100** | 100 | 100 |
| /tr/terms | 100 | **100** | 100 | 100 |
| /tr/compliance/dpa | 99 | **100** | 100 | 100 |

DoD hedefi Perf ≥80 / a11y ≥95 → **karşılandı**. İlk ölçüm a11y 91'di; §1.6'daki iki kusur düzeltildikten
sonra 100'e çıktı (failing a11y audits: none).

### 2.10 Gerçek etkileşimli doğrulama (tarayıcı, tıklama)

Ekran görüntüleri: `docs/agent-results/TASK-MTQ2K9YENR68X-screenshots/`

| Dosya | Ne gösteriyor |
|---|---|
| `01-privacy-settings-tr.png` | `/tr/main/settings/privacy` — tüm metinler `settings.privacy.*`'ten geliyor |
| `02-delete-confirm-modal-tr.png` | "Hesabı Sil İsteği" tıklandı → 30 gün uyarısı içeren onay modalı |
| `03-privacy-settings-en.png` | `/en/main/settings/privacy` — aynı sayfa İngilizce |
| `04-privacy-settings-tr-after-contrast-fix.png` | kontrast düzeltmesinden sonra |

Ham anahtar (`settings.privacy.x`) hiçbir sayfada görünmüyor — next-intl eksik anahtarda anahtar adını basar,
basmadı:

```
=== TR page strings ===   Aktif · Gizlilik ve Verilerim · Hesabı Sil · Hesap Durumu · Verilerimi İndir · Yasal Belgeler
=== EN page strings ===   Account Status · Delete Account · Export My Data · Legal Documents · Privacy & My Data
```

### 2.11 CI kapısı

```
$ pnpm typecheck        →  temiz (çıktı yok)

$ pnpm i18n:check       →  "missingInTurkish": []  ·  "missingInEnglish": []  ·  "missingInBoth": []
                           ✅ All translation keys are present in both languages!   (exit 0)

$ pnpm lint <dokunduğum dosyalar>   →  temiz (0 hata, 0 uyarı)

$ pnpm test
 Test Files  3 failed | 31 passed (34)
      Tests  4 failed | 162 passed (166)
 FAIL tests/k1-daily-calls.test.ts  › SediaTopicSchema should validate topic structure
 FAIL tests/k1-daily-calls.test.ts  › should return empty array on fetch failure gracefully
 FAIL tests/sedia-adapter.test.ts   › should format framework programme filters correctly
 FAIL tests/rls.spec.ts             › Tenant A cannot see Tenant B workspaces
```

Bu **tam olarak belgelenmiş taban çizgisi**: 3 canlı SEDIA ağ testi + 1 RLS testi (yerel rol BYPASSRLS).
Değişikliğimden **yeni bir kırmızı yok**; taban çizgisine göre +21 geçen test.

---

## 3. Değişen dosyalar

**Yeni**
- `prisma/migrations/add-soft-delete.sql` · `add-soft-delete.down.sql`
- `tests/users-scheduled-deletion.test.ts`
- `docs/agent-results/TASK-MTQ2K9YENR68X-cora.md` + `TASK-MTQ2K9YENR68X-screenshots/` (4 png)

**Değiştirilen**
- `prisma/schema.prisma` — 7 modele soft-delete alanları + `@@index`
- `src/actions/user/export-data.ts` — Opportunity/Proposal, soft-delete filtresi
- `src/actions/user/request-deletion.ts` — `deletionReason` yazımı/temizliği
- `src/lib/inngest/jobs/users-scheduled-deletion.ts` — `purgeDueUsers()` + AuditEvent
- `src/app/[locale]/(app)/[workspace]/settings/privacy/client.tsx` — next-intl
- `src/app/[locale]/privacy/page.tsx` · `terms/page.tsx` · `compliance/dpa/page.tsx` — `generateMetadata`
- `src/app/layout.tsx` — `<html lang>` + `metadataBase`
- `src/app/globals.css` — `--accent-strong` token
- `src/components/CookieConsent.tsx` — buton kontrastı (tek className)
- `messages/tr.json` · `messages/en.json` — `settings.privacy.*` (29) + `legal.*`
- `docs/DATA_MODEL.md` — §7.1 yumuşak silme

---

## 4. Riskler

1. **`prisma/migrations/add_soft_delete/` (eski klasör) hâlâ duruyor.** Başka bir ajanın bıraktığı, benim
   dosyamın yerini aldığı, **idempotent olmayan** bir kopya (`ADD COLUMN` — `IF NOT EXISTS` yok), üstelik
   `deletionRequestedAt` sütununu hiç eklemiyor. İkinci kez koşulursa hata verir. Git'e eklemedim; **silinmeli**
   ama silme işlemini onaysız yapmadım.
2. **Yasal metin ikilemesi.** `src/app/(marketing)/{privacy,terms,compliance/dpa}` altında yalnızca Türkçe,
   **erişilemeyen** ikinci bir yasal metin seti var (`/privacy` → 307 → `/tr/privacy` → `[locale]` sürümü
   çalışıyor). Ayrıca `[locale]/dpa` ve `[locale]/compliance/dpa` diye iki DPA rotası var. Tek üründe iki farklı
   gizlilik bildirimi hukuki bir risk — hangisinin bağlayıcı olduğuna karar verilip diğeri kaldırılmalı.
3. **`src/components/CookieConsent.tsx` içinde bana ait olmayan 1 lint hatası** var
   (`react-hooks/set-state-in-effect`). Dosya başka bir ajan tarafından çalışma ağacında yeniden yazılmış
   durumda (HEAD'de 10 hata veriyordu, şimdi 1); benim katkım tek className. Paralel yazım yarışına girmemek
   için düzeltmedim.
4. **Repo geneli `pnpm lint` zaten kırmızı**: 797 problem (559 hata) — taban çizgisi, benim dosyalarımın
   dışında. Benim dokunduğum dosyalar temiz.
5. **RLS**: yeni sütunlar politika gerektirmiyor — `prisma/rls.sql` politikaları `tenantId` üzerinden *satır*
   bazlı; sütun eklemek kapsamı değiştirmez. Yine de yerel rol `BYPASSRLS` olduğu için izolasyon yerelde
   gerçekten sınanamıyor (bilinen durum).
6. **Purge işi Inngest üzerinden canlıda tetiklenmedi** — Inngest dev sunucusu ayakta değil. `purgeDueUsers()`
   gerçek DB'ye karşı doğrudan çalıştırılıp doğrulandı (§2.6); cron sarmalayıcısı yalnızca bu fonksiyonu çağırıyor.

---

## 5. Açık sorular

1. Eski `prisma/migrations/add_soft_delete/` klasörü silinsin mi? (Risk 1 — onay bekliyor.)
2. Bağlayıcı yasal metin hangisi: `(marketing)/*` mi `[locale]/*` mi? Ölü olan kaldırılmalı (Risk 2).
3. `Tenant/Workspace/Opportunity/Proposal/GateDecision/Effort` üzerindeki `deletedAt` sütunları şu an **yalnızca
   export tarafında** okunuyor. Pipeline sorgularının da (`M5` KPI, fırsat listeleri) `deletedAt: null`
   filtrelemesi gerekir mi, yoksa bu sütunlar şimdilik yalnız kiracı silme senaryosu için mi duruyor?
4. Silme onay e-postası `RESEND_API_KEY` yoksa sessizce atlanıyor. Beta'da anahtar tanımlı mı?

---

## 6. Sonraki adım

- Yukarıdaki 1 ve 2 numaralı temizlikler için onay al, uygula.
- Soru 3'e verilen cevaba göre pipeline sorgularına `deletedAt: null` filtresi ekle (ayrı, küçük bir görev).
- Beta ortamına migration'ı uygula: `add-soft-delete.sql` → iki kez koş → `information_schema` ile 15 sütunu
  doğrula (yerelde yapılan adımların aynısı).
- `--accent-strong` token'ı beyaz metin taşıyan diğer dolu butonlara da yayılmalı (Sora / tasarım sistemi).
