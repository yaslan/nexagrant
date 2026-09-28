# TASK-MULRS12Y8F087 — FB KAMU B8: Kiracı bazlı haftalık aktif kullanıcı (WAU) sayacı

**Ajan:** se-fb · **Sprint:** FB-KAMU-2 · **Dal:** dev · **Tarih:** 2026-09-29

## 1. Ne yapıldı

### Keşif bulguları

| Soru                                               | Cevap (kaynak)                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Son giriş / oturum verisi nerede?                  | **Hiçbir yerde.** NextAuth `session: { strategy: "jwt" }` (`src/lib/auth.ts:177`). `Session` tablosu yazılmıyor, `User`'da `lastLoginAt` yok, oturum açma olayı (`events.signIn`) yok. "Bu hafta oturum açtı" veritabanından okunamaz.                                                                                                                             |
| `AuditEvent` yeter mi?                             | **Tek başına hayır.** 25 yazma noktası var; neredeyse hepsi yönetim eylemi (modül, plan, fatura, silme, ajans daveti). Pilot kullanıcısının günlük işi (pipeline, konsept not, kanıt) buraya düşmüyor.                                                                                                                                                             |
| Ö1'in tanımı ne istiyor?                           | `ILKADIM-PILOT.md` §5: "Haftada en az 1 kez oturum açıp **bir kayıt oluşturan/değiştiren** kullanıcı". Yani ölçülmesi gereken şey yazma etkinliği. Bu, mevcut tablolardan kısmen türetilebilir.                                                                                                                                                                    |
| Hangi tablolar yazan kullanıcıyı + zamanı tutuyor? | `AuditEvent.actorId`, `GateDecision.decidedBy/decidedAt`, `ConceptNote.createdBy`, `Evidence.createdBy`, `AiUsageLog.userId`, `SavedSearch.userId`, `Evaluation.userId`, `ApprovalRequest.requesterId`, `DualApprovalStep.actorUserId/decidedAt`, `ProposalUsage.usedByUserId/usedAt`, `Feedback.userId`. Hepsi `tenant_isolation` RLS altında (`prisma/rls.sql`). |
| Hariç tutulanlar                                   | `Effort.date`, `Interaction.at`: zaman kullanıcının girdiği iş/toplantı günü, yazma anı değil, bu yüzden etkinlik yanlış haftaya düşerdi. `Opportunity.ownerId`: oluşturan değil, sahip.                                                                                                                                                                           |
| Kör noktası                                        | Kaydı **yerinde düzenleyen** ama düzenleyeni tutmayan yollar: konsept not düzenleme, `moveOpportunityStage`, sahip atama, fırsat oluşturma (yaratıcı tutulmuyor). Haftası yalnızca bunlardan oluşan kullanıcı pasif görünür.                                                                                                                                       |

**Sonuç:** PII'siz, şema değişikliği gerektirmeyen ve yeni izleme eklemeyen bir **alt sınır** WAU hesaplanabiliyor. Pilot eşiği ("6 koltuğun 4'ü") için eksik sayım güvenli yöndür: bir başarıyı kaçırabilir ama olmayan bir başarı üretemez. Tam sayım için şema gerekiyor (§ Şema önerisi). Karar leed-fb'de.

### Kod

- `src/lib/metrics/weekly-active-users.ts`
  - `getWeeklyActiveUsers(tenantId, weeks = 12, now?)` → `Promise<{ weekStart: 'YYYY-MM-DD'; activeUsers: number }[]>`. Sıra en eski haftadan içinde bulunulan haftaya doğru; etkinliği olmayan haftalar `0` olarak listede yer alıyor. `withTenant` altında koşuyor.
  - `getWeeklyActiveUsersIn(tx, tenantId, weeks, now?)`: tenant'a zaten bağlanmış bir transaction içinde aynı okuma. Birden fazla rakamı tek `withTenant` içinde okuyan B2 ajans panosu ve yönetici konsolu bunu kullanabilir.
  - Kapsam: `withTenant` (system scope yok, bypass baseline gerekmiyor). Her UNION kolunda RLS'e ek olarak açık `"tenantId" = $1` filtresi var, çünkü yerelde uygulama BYPASSRLS rolle bağlanıyor.
  - `Membership` join'i: kiracıda işlem yapan platform yöneticisi (ör. `admin/modules` o kiracıya `AuditEvent` yazar) kiracının kullanıcısı olarak sayılmıyor.
  - Hafta: Türkiye saatiyle Pazartesi–Pazar (sabit UTC+3; SQL gruplaması ile JS pencere sınırları aynı kuralı kullanıyor).
  - Çıktıda yalnızca sayı var, kullanıcı kimliği dönmüyor. `weeks` 1–104 arası tamsayı olmalı; tenant boşsa DB'ye dokunmadan hata veriyor. Tüm değerler bind parametresi olarak gidiyor, metne gömülmüyor.
- Arayüz yok (kart gereği). PostHog kartına (TASK-MULQMKP4YOM04) dokunulmadı: `src/lib/analytics.ts` değişmedi, yeni olay/izleme eklenmedi.

## 2. Kanıt

**Birim + canlı test (yeni dosyalar):**

```
$ npx vitest run src/lib/metrics tests/weekly-active-users.live.test.ts
 Test Files  2 passed (2)
      Tests  16 passed (16)

$ npx vitest run tests/weekly-active-users.live.test.ts --reporter=verbose
 ✓ … two members over two weeks, counted per week under RLS 10ms
 ✓ … tenant B sees only its own member, not A's 5ms
 ✓ … bound to tenant B, a query for tenant A's id returns nothing: RLS, not only the WHERE 4ms
```

Canlı test 2 kullanıcı × 2 hafta fikstürü kuruyor: hafta 1'de A (konsept not + AI) ve B (gate kararı) → **2**; hafta 2'de A iki kez kayıtlı arama yapıyor → **1** (tekil); hafta 3 → **0**. Negatif kollar: kiracıda `AuditEvent` yazan üyeliksiz platform yöneticisi, B kiracısının üyesi, ve B'ye bağlıyken A'nın id'siyle yapılan okuma (sonuç `[0,0,0]`). Okuma `DATABASE_URL_RLS_TEST` (NOBYPASSRLS) üzerinden yapılıyor. `tests/helpers/live-db-role.ts` → `assertRlsSubjectRole` rol BYPASSRLS ise suite'i kırıyor; CI'da `requireRlsTestUrl`/`skipOrFailInCi` sessizce atlamaya izin vermiyor.

Fikstür saatleri sınırlara yakın seçildi: Pazartesi 00:10 TR (UTC'de hâlâ Pazar), Pazar 23:59 TR, Pazartesi 00:00 TR. Bu sayede saat dilimi hatası sayıyı değiştirir.

**Negatif kontrol (mutasyon):** `Membership` join'i geçici olarak `WHERE a.uid IS NOT NULL` ile değiştirildi:

```
 × two members over two weeks, counted per week under RLS
-     "activeUsers": 1,
+     "activeUsers": 2,
```

Test, platform yöneticisini sayan hatayı yakalıyor. Dosya geri alındı (`grep -c 'JOIN "Membership"'` → 1).

**Dev seed üzerinde gerçek okuma** (geçici betik, commit edilmedi; kiracı id'leri kısaltıldı):

```
tenant=demo… members=11 [{"weekStart":"2026-08-17","activeUsers":2},{"weekStart":"2026-08-24","activeUsers":2},{"weekStart":"2026-08-31","activeUsers":2},{"weekStart":"2026-09-07","activeUsers":3}] weeks= 12
tenant=cmtr… members=1 [] weeks= 12
```

**Kapılar:**

```
$ npx tsc --noEmit        → exit 0
$ npm run lint            → exit 0
$ npm test                → Test Files 7 failed | 162 passed | 8 skipped (177); Tests 39 failed | 1882 passed
```

`npm test` 0 değil. Temel çizgiyle karşılaştırdım: scratchpad'de HEAD'in (`aa6a0fef`) ayrık worktree'si + symlink `node_modules` üzerinde **aynı 7 dosya / 39 test** kırmızı (`Test Files 7 failed | 160 passed`, `Tests 39 failed | 1866 passed`). `comm` farkı her iki yönde boş. Yani bu kart kırmızı eklemedi (+2 dosya / +16 test, hepsi yeşil). Temel çizgideki kırmızılar ortamdan geliyor: `__no_database__` bekleyen testler DB'ye ulaşabiliyor, bir URL'de `fabrika` kimlik doğrulaması başarısız (`plan-admin`, `plan-repository`, `double-charge-prevention`, `relationship-tenant-scope`, `calendar-token-db.live`, `concept-template-tenant-scope.live`, `plan-entitlement-version.spec`).

## 3. Değişen dosyalar

- `src/lib/metrics/weekly-active-users.ts` (yeni)
- `src/lib/metrics/weekly-active-users.test.ts` (yeni, birim, 13 test)
- `tests/weekly-active-users.live.test.ts` (yeni, canlı, 3 test)
- `docs/agent-results/TASK-MULRS12Y8F087-se-fb.md` (bu rapor)

`prisma/schema.prisma`, `src/lib/auth.ts`, `.github/workflows/ci.yml`, pazar yeri dosyaları: **dokunulmadı.**

## 4. Riskler

- **Alt sınır, tam sayı değil.** Yukarıdaki kör nokta nedeniyle gerçek WAU'dan düşük çıkabilir. Panoda "en az" diye etiketlenmeli.
- **Geçmiş dondurulmuş değil.** Kiracıdan ayrılan üye geçmiş haftalardan da düşer (join o anki üyeliğe bakıyor). Pilotta koltuk değişimi olursa geçmiş haftaların sayısı değişir.
- **Maliyet.** 11 tablo UNION ediliyor. Çoğunda `(tenantId, createdAt)` indeksi yok; `tenantId` ile başlayan indeks + zaman filtresi kullanılıyor. Pilot hacminde önemsiz. Yüzlerce kiracılı bir konsol taraması yapılacaksa kiracı başına ayrı çağrı + önbellek gerekir.
- **B2 ajans panosu:** fonksiyon bağlı müşterinin kiracısıyla `withTenant` açar. Ajansın o müşteriyi görme yetkisini **çağıran taraf** kontrol etmeli (ajans bağlantı kontrolü). Fonksiyon bu yetkiyi kendisi doğrulamıyor.
- Sabit UTC+3: Türkiye yaz saatine dönerse (2016'dan beri yok) `TR_OFFSET_HOURS` güncellenmeli.

## 5. Açık sorular / Şema önerisi (leed-fb kararı)

"Kayıt değiştiren" kısmını tam ölçmek için en küçük olay kaydı önerisi. **Uygulanmadı**, çünkü fe-fb şemada çalışıyor ve sırada se-fb CI kartı var:

```prisma
/// Ö1 — one row per member per tenant per Turkey-time day with any write. No content.
model UserActivityDay {
  tenantId String
  userId   String
  day      DateTime @db.Date   // Turkey-time calendar day
  firstAt  DateTime @default(now())
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@id([tenantId, userId, day])
  @@index([tenantId, day])
}
```

- Yazım: `INSERT … ON CONFLICT DO NOTHING`, `requireTenantAction` / `requireTenantApi` sonrası tek noktadan. Kullanıcı başına günde bir satır, sayfa görüntüleme kaydı yok.
- RLS: `prisma/rls.sql` `tenant_isolation` listesine eklenir. Silme: `users-scheduled-deletion` job'u `userId` ile siler. KVKK dışa aktarımına eklenir. Saklama süresi 13 ay önerisi.
- `getWeeklyActiveUsers` bu tabloya geçerse imza değişmez, yalnızca `activity` CTE'si tek tabloya iner.
- **Reddedilen alternatif:** şema değiştirmeden `AuditEvent` içine `user.active` yazmak. Denetim izini heartbeat gürültüsüyle kirletir (`admin/audit` sayfası) ve "denetim kaydı = yönetim eylemi" anlamını bozar.
- Oturum açmayı (Ö1'in "oturum açıp" kısmı) ayrıca ölçmek gerekirse bu `auth.ts`'e (be-fb) `events.signIn` eklemek demek. O kartla koordine edilmeli.

## 6. Sonraki adım

1. leed-fb: alt sınır Ö1 için yeterli mi, yoksa `UserActivityDay` şema kartı mı açılsın (fe-fb pazar yeri + se-fb CI kartından sonra)?
2. B2 ajans panosu / yönetici konsolu kartı `getWeeklyActiveUsers(tenantId, 12)` çağırıp "≥4 aktif hafta sayısı"nı gösterebilir.
3. Temel çizgideki 39 kırmızı ortam testi ayrı bir kartta ele alınmalı (bu kartın kapsamı dışında).

## Platform beyanı

Doğrulama **macOS**'ta yapıldı (Darwin 27.0, Node + vitest 4.1.11, Postgres docker `fabrika-postgres:5433`). Dokunulan kod platformdan bağımsız: yalnızca Prisma raw SQL ve `Date` aritmetiği kullanıyor. Dosya yolu, süreç, kabuk ya da saat dilimi veritabanı bağımlılığı yok (ofset sabit, `Intl`/TZ kullanılmıyor). Bu yüzden Linux (CI) ve Windows'ta davranış aynı olur. Windows ve Linux'ta **koşulmadı**: bu makinede bu platformlar yok. Linux CI koşusu devop-fb/se-fb CI kartında canlı suite ile birlikte gerçekleşecek.
