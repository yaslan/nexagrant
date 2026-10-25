---
sözleşme: 3
görev: TASK-MVC9FW2U15VM6
kod: TASK-MVC9FW2U15VM6
ajan: se-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: tasarım fazı tamam. Ölçüme göre public-intake kapsamı bugün 53 tablodan 30'unu açıyor ve yazmaya izin veriyor; patron C'yi seçti (K-569554), be-fb için uygulama planı hazır, kod yazılmadı.
platform: mac (darwin): yerel Docker Postgres fabrika-postgres :5433, origin/dev a59c7479. İş yalnız DB ve sunucu tarafında, platforma bağlı kod yolu yok; Windows/Linux ayrıca koşulmadı (gerek yok, aynı SQL).
sürüm: 1
tarih: 2026-10-18T15:49:38.454Z
---

# FO-52 tasarım: public-intake kapsamını ExpertPreRegistration'a kilitle (C seçeneği)

## Ne yapıldı
- `prisma/rls.sql` (`enter_system_scope`, `system_scope_open`, `system_scope_sealed`) ve tüm `withSystemScope` / `withSystemScopeOn` çağrı noktaları tarandı; amaç × tablo matrisi çıkarıldı.
- A, B ve C seçenekleri maliyetleriyle değerlendirildi ve karar soruldu: K-569554. **Patron kararı: C.**
- Bugünkü açıklık yerel DB'de ölçüldü. C, geri alınan bir işlem içinde prototiplenip ölçüldü.
- İnceleme ağacı: `/Users/macbook/alan/FONBRIDGE-se-fo52` (detached, origin/dev a59c7479). Başkasının ağacına yazılmadı.

## Amaç × tablo matrisi (kaynak koddan, origin/dev)
| Amaç | Çağrı noktası | Kullanılan modeller |
|---|---|---|
| public-intake | 3 (`expert-prereg/server/register.ts:151,278`, `verify.ts:35`) | ExpertPreRegistration (+ `pg_advisory_xact_lock`) |
| platform-aggregate | 6 | LifetimeLicence, Subscription, ExpertPreRegistration, Feedback |
| platform-admin | 12 | AuditEvent, Feedback, ModuleState, Subscription, Plan, PlanVersion, PlanAssignment, BlogPost, ExpertPreRegistration, Opportunity |
| tenant-discovery | 8 | ApplicationPart, Membership, ApiKey, User, LifetimeLicence, Invitation |
| subject-scoped | 9 | User, Membership, Account, Evaluation, Effort, AiUsageLog, ApprovalRequest, Opportunity, Notification, AuditEvent, CalendarConnection, SavedSearch, Feedback, ProposalUsage, Relationship |
| cross-tenant-job | 7 | StripeEventLog, Invitation, AuditEvent, PublicLead, Notification, SavedSearch, Membership, Relationship |

Çıkarma yöntemi: kaynakta `withSystemScope(On)?(…'amaç'` eşleşmeleri ve callback gövdesindeki `tx.<model>` kullanımları. Yardımcı fonksiyona geçilen 3 çağrı noktası elle okundu.

## Kanıt: bugünkü açıklık (ham çıktı)
Yöntem: süper kullanıcı oturumunda `BEGIN; SET LOCAL ROLE fabrika_app;`, kapsam dışında her system_scope tablosunda `count(*)`, ardından `enter_system_scope('public-intake')` ve aynı sayım, sonunda `ROLLBACK`.
```
role | tenant
fabrika_app |
scope | purpose
public-intake | public-intake
tables | rows_outside | rows_inside_public_intake | other_tables_with_rows
53 | 96 | 18218 | 30
tbl | outside | inside
Evidence | 0 | 12799
Consent | 0 | 3748
AuditEvent | 0 | 1203
Document | 89 | 267
Membership | 0 | 33
FollowupDoc | 0 | 22
GateDecision | 0 | 15
ModuleState | 0 | 14
Subscription | 0 | 14
Workspace | 0 | 14
Opportunity | 0 | 11
...
ExpertPreRegistration | 0 | 5
ApiKey | 0 | 1
ApiKey | mid-mv… (maskeli) | <tenantId>
-- yazma:
outside | 0 | 0          (ApiKey, Membership)
inside  | 1 | 33
INSERT 0 1             AuditEvent INSERT under public-intake: KABUL EDİLDİ (rollback)
```
Not: kapsam dışındaki 96 satır kiracıya ait olmayan, herkese açık `tenant_or_shared` satırları (Document 89, ConceptTemplate 7); bunlar her durumda görünür.

## Kanıt: C prototipi (geri alındı)
```
C/public-intake | 3 | ConceptTemplate=7,Document=89,ExpertPreRegistration=5
ERROR:  new row violates row-level security policy for table "AuditEvent"
```
Kapsam dışında da görünen paylaşımlı satırlar ve ExpertPreRegistration dışında hiçbir şey açılmadı; yazma reddedildi.

**Olay (dürüstçe):** Prototip betiği `ROLLBACK` yerine `COMMIT` ile bitti, bu yüzden paylaşımlı yerel DB'de `system_scope_open` birkaç dakika C halinde kaldı. Fonksiyon `origin/dev` `prisma/rls.sql` bloğuyla geri yüklendi. Doğrulama: gövdede `public-intake` geçmiyor, ACL `{fabrika=X/fabrika,fabrika_app=X/fabrika}` korunmuş, `public-intake` içinde Membership yeniden görünüyor. Değişiklik yalnız public-intake'in başka tabloları görmesini etkiledi ve kod o yolu kullanmıyor. Canlı DB'ye dokunulmadı.

## Seçenekler ve karar
| | Ne | Maliyet | Risk |
|---|---|---|---|
| **C (seçildi)** | Yalnız public-intake → ExpertPreRegistration | ≈0,5 gün | Öteki 42 çağrı noktası etkilenmez |
| A | 6 amacın hepsine tablo listesi | ≈2-3 gün | Unutulan tablo sessizce 0 satır döndürür (45 çağrı noktası) |
| B | Ayrı dar rol ve ikinci bağlantı havuzu | ≈2-3 gün + deploy/ops | SQL enjeksiyonuna karşı gerçek sınır; ADR-0009 yönü |

## be-fb için uygulama planı (C)
1. **`prisma/rls.sql` → `public.system_scope_open(tbl regclass)`**: mühürlü dala (sealed) amaç koşulunu ekle. Owner dalına (`pg_has_role`) DOKUNMA; SECURITY DEFINER fonksiyonları ve migration'lar o daldan geçiyor.
   ```sql
   SELECT coalesce(current_setting('app.system_scope', true) = 'on', false)
      AND (pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = tbl), 'USAGE')
           OR (public.system_scope_sealed()
               AND (coalesce(current_setting('app.system_scope_purpose', true), '') <> 'public-intake'
                    OR tbl::oid = to_regclass('public."ExpertPreRegistration"')::oid)))
   ```
   - `to_regclass` kullan, `'…'::regclass` kullanma. Fonksiyonun `search_path = pg_catalog` olduğundan tablo adı `public.` ile yazılmalı. Doğrudan çevirmede tablo yokken (sıra dışı bir kurulumda) bütün system_scope politikaları hata verir; `to_regclass` ise NULL döner ve yalnız public-intake'i kapalı bırakır.
   - Fonksiyon yalnız `rls.sql`'de tanımlı ve `pnpm db:rls` ile uygulanıyor; migration kopyası gerekmiyor. `CREATE OR REPLACE` ACL'yi koruyor (ölçüldü).
   - `COMMENT ON FUNCTION system_scope_open` ve üstteki yorum bloğu FO-52'ye atıfla güncellenmeli.
2. **Amaç GUC'si (`app.system_scope_purpose`)** USERSET olduğu için elle yazılabilir. Mühre katmak gerekmiyor: bunu yazabilen kod `enter_system_scope('<başka amaç>')`'ı da çağırabilir. Bu koruma unutmaya karşıdır, saldırgana karşı değil. Bu sınır `rls.sql` yorumuna yazılmalı.
3. **`scripts/check-rls-live.ts`** (`probeSystemScopeTable` yanına): `public-intake` içinde `pg_policies` (policyname='system_scope') tablolarının her birinde, ExpertPreRegistration dışında, kapsam dışı sayıdan fazla satır görülmüyor ölçümü; ayrıca AuditEvent INSERT reddediliyor ölçümü. Her ikisi de BEGIN/ROLLBACK içinde. Başarısızlık mesajı Türkçe, mevcut desende.
4. **`tests/system-scope.live.test.ts`**: (a) public-intake başka kiracının Membership ve ApiKey satırını 0 görür; (b) platform-admin hâlâ görür (regresyon); (c) public-intake ExpertPreRegistration'ı okur ve yazar.
5. **`src/lib/system-scope.ts`**: `public-intake` yorumuna "DB yalnız ExpertPreRegistration'ı açar (FO-52)" notu.
6. Doğrulama: `pnpm db:rls` → `pnpm rls:verify` (yeni satırlar yeşil) → `pnpm gate`. Ayrıca mutant kontrolü: koşul geçici olarak kaldırılınca yeni ölçüm KIRMIZI olmalı. Gerçek `/uzman-on-kayit` kaydı ve doğrulama akışı uçtan uca tıklanmalı. PR dev'e açılır, merge yok.

## Riskler
- ExpertPreRegistration ileride bir başka tabloya (ör. sayaç ya da kuyruk) yazarsa public-intake o tabloda 0 satır görür ve yazma reddedilir. Sonuç sessiz kalmaz, bir RLS hatası olarak görünür. Yeni tablo `system_scope_open`'daki izin listesine bilerek eklenmeli.
- **Kapsam dışı gözlem (ölçüldü):** `User`, `Tenant`, `Account` ve `Session` tablolarında RLS hiç açık değil (`relrowsecurity=f`); fabrika_app bunları kapsamdan bağımsız okuyor. C bunları korumaz, yalnız B korur. Bu açık ADR-0009 kapsamında ayrı bir iş olmalı.

## Değişen dosyalar
Yok (kod yazılmadı). Yalnız bu rapor dosyası.

## Sonraki adım
be-fb uygulamayı yukarıdaki 6 adımla yapar. se-fb, PR'da "sonra" ölçümünü bu raporun yöntemiyle yeniden koşar: beklenen sonuç yalnız ExpertPreRegistration ile paylaşımlı satırların görünmesi ve AuditEvent INSERT'in reddedilmesi.
