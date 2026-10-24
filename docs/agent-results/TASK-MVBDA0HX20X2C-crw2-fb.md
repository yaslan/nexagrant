---
sözleşme: 3
görev: TASK-MVBDA0HX20X2C
kod: TASK-MVBDA0HX20X2C
ajan: crw2-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: inceleme tamam, hüküm DÜZELTME GEREKLİ — kullanıcıya görünen ana cümle ölçüme uyuyor ama işleme envanteri §1 yanlış tedbir yazıyor ve DPA/gizlilik metni "her sorgu" diyerek sistem kapsamı erişimini yok sayıyor.
platform: mac (darwin) — yerel Postgres (localhost, rol fabrika) + fabrika_app test rolü; değişiklik yalnız metin/sürüm dizesi, platforma bağlı kod yolu yok; Windows/Linux koşulmadı (gerek yok: davranış farkı üretmez).
sürüm: 1
tarih: 2026-10-17T09:27:43.815Z
---

# FO-10 PR #81 inceleme — RLS iddiası metin hizalaması

## Ne yapıldı
PR #81 (`se-fb/fo10-rls-claim-align` @`143ff671` → `dev` @`fb087338`) satır satır okundu; ayrı worktree'de (PR head) ölçüm ve kontroller koşuldu. **MERGE edilmedi, approve verilmedi.**

## Kanıt (ham çıktı)
`set -a; . FONBRIDGE/.env; set +a; pnpm rls:verify --require-db` (PR head):
```
Kiracıya özel model: 47 · RLS açık tablo: 54 · tenant_isolation politikası: 48
⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif) … ✓ yazma (çapraz): başka kiracıya INSERT reddedildi
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```
DATABASE_URL host: `localhost`, user: `fabrika`.

SYSTEM_WIDE tablolar (psql, `pg_class` + `pg_policy`):
```
PublicLead|f|f|0
ExpertPreRegistration|f|f|0      (relrowsecurity | relforcerowsecurity | politika sayısı)
```
`prisma/rls.sql:113-116` bu tabloları ve `User`, `Account`, `Session`, `VerificationToken`'ı açıkça `DISABLE ROW LEVEL SECURITY` listesinde tutuyor.

`pnpm i18n:check` → `✅ i18n check passed: both catalogs agree…` (exit 0).
`git merge-tree --write-tree origin/dev origin/se-fb/fo10-rls-claim-align` → `6f6772af…`, exit 0 (çakışma yok; merge-base `7f8d3de4`).

## Ölçüm ↔ metin karşılaştırması
| Metin | Ölçümle uyum |
|---|---|
| `messages/{tr,en}.json:847` securityBody — "RLS politikaları tanımlı, uygulama bağlantısında etkin değil" | ✅ doğru (fabrika BYPASSRLS; 48 politika tanımlı) |
| aynı — "uygulama katmanında her sorgu kiracı kimliğiyle sınırlanır" | ⚠ fazla söz (M2) |
| SYSTEM_WIDE (ExpertPreRegistration, PublicLead) | ✅ metin "kiracıya ait veri" ile sınırlı; bu tablolar için RLS iddiası yok. FO-45 sonrası durumu da iddia etmiyor |
| `docs/legal/processing-register.md:22` (§1 hesap/kimlik) | ❌ yanlış (M1) |

## Bulgular (önem sırasıyla)

**M1 — Orta (düzeltme gerekli) · `docs/legal/processing-register.md:22`**
§1'in kaynak tabloları `User`, `Account`, `Session`, `VerificationToken` (aynı tablo, "Kaynak dosya yolu" satırı). Dördü de `prisma/rls.sql:113-116`'da sistem-geneli, RLS kapalı; `tenantId` alanları yok. Yeni metin "Kiracı filtresi (uygulama katmanı; RLS politikaları tanımlı…)" diyor, iki iddia da bu tablolar için yanlış. VERBİS'e esas envanterde gerçek dışı teknik tedbir yazılmış oluyor (eski "RLS" de yanlıştı; PR düzeltmek yerine başka bir yanlış koydu).
Öneri: "Sistem-geneli tablolar (RLS kapsamı dışı); kullanıcı kaydına erişim oturum sahibinin kimliğiyle sınırlı; JWT oturum; `Session`/`Account` dışa aktarıma dahil değil."

**M2 — Orta (düzeltme gerekli) · `docs/legal/dpa-tr.md:61`, `dpa-en.md:61`, `messages/tr.json:847`, `messages/en.json:847`, `docs/BETA_GUIDE.md:224`, `BETA_GUIDE.en.md:199`**
"her sorgu / every query … kiracı kimliğiyle sınırlanır" mutlak bir söz. Kodda onaylı kiracılar arası kapsam var: `enter_system_scope`/system scope kullanan `src/app/[locale]/admin/audit/page.tsx`, `admin/feedback`, `admin/modules`, `src/actions/user/export-data.ts`, `src/app/api/billing/portal/route.ts`, `src/lib/api-auth.ts`. Yani "her sorgu" doğru değil. DPA sözleşme metni olduğundan bu fazla söz hukuken bağlayabilir.
Öneri: "kiracı verisine erişen sorgular kiracı kimliğiyle sınırlanır; yetkili platform yönetimi işlemleri denetim kaydıyla (AuditEvent) kiracılar arası çalışabilir" (tr+en eşit).

**M3 — Orta · `docs/legal/processing-register.md:36,78,106,134,148,193,279`**
Envanterde yedi satır hâlâ yalın "RLS" tedbiri sayıyor. `:279`'daki "RLS (`tenant_isolation`, FORCE)" de yanıltıcı: FORCE, SUPERUSER/BYPASSRLS rolü bağlamaz. Kartın 1. adımı ve DoD'si "iddianın geçtiği tüm yerler" diyor; hizalama yarım. Öneri: hepsini §1 dışındaki doğru kalıpla değiştir ("kiracı filtresi (`withTenant`); RLS politikası tanımlı, uygulama bağlantısında etkin değil").

**D1 — Düşük · "henüz / not yet" (DPA :61, messages :847, BETA_GUIDE)**
"henüz etkin değildir" etkinleştirme planı ima ediyor. Ama `docs/ROADMAP.md` Açık karar #16 = **HAYIR** (ana `DATABASE_URL` `fabrika_app`'e geçmiyor). K-489304 açık; sonuç bilinmeden gelecek ima etmek fazla söz. Öneri: "etkin değildir" (K-489304'te geçiş seçilirse metin o gün güncellenir).

**D2 — Düşük · `docs/legal/HUKUK-SORULARI-2026-09.md:3`, `privacy-notice-gap-analysis.md:37`, `processing-register.md:22` ("ölçüm 2026-10-17")**
Ölçüm yerel DB'de (`localhost`, rol `fabrika`) yapıldı. Canlı ortamdaki rol bu ölçümle kanıtlanmıyor; canlı durumun dayanağı karar #16. Öneri: "dayanak: Açık karar #16 (canlı bağlantı fabrika rolüyle kalıyor); yerel ölçüm 2026-10-17" diye kaynağı doğru yaz. Ek not (kapsam dışı, PR'ın değil): `docs/DATA_MODEL.md:981` "Canlı uygulama `fabrika_app` ile bağlanır" diyor, karar #16 ile çelişiyor. Ayrı kart önerilir.

**D3 — Düşük · `docs/legal/HUKUK-SORULARI-2026-09.md:3`**
1.13 eki 1.12 satırının sonuna eklenmiş, başlık hâlâ "**Sürüm 1.12** · 29.09.2026". Sürüm etiketi 1.13 / 17.10.2026 olmalı.

**D4 — Düşük · `docs/SECURITY_COMPLIANCE.md:5,19`**
"PostgreSQL RLS politikası ile korunur" ve "DB-level enforcement" iç belge, kullanıcıya görünmüyor. Kartın "Bkz" listesinde §1 var ama PR dokunmamış. Bu bir güvence iddiası değil, mimari anlatı. İsteğe bağlı: ":50"deki uyarıya işaret eden tek satır.

**D5 — Süreç · ekran görüntüsü yok**
Kart DoD'si "tr + en ekran görüntüsü" istiyor; PR "alınmadı (.env yok)" diyor. `.env` ana checkout'ta var. `/tr/privacy` ve `/en/privacy` §7 görüntüsü eklenmeli.

### Doğru bulunanlar
- `PRIVACY_NOTICE.version` artışı (`consent-documents.ts:58`) doğru: `:41` "Bump whenever the copy changes" diyor; eski sürüme bağlı test yok.
- tr/en anlam eşit; i18n:check temiz.
- SYSTEM_WIDE tablolar için metin RLS iddia etmiyor; FO-45 sonrası için de bir şey vaat etmiyor.

## Hüküm
**Düzeltme gerekli.** M1 ve M2 hukuki metinde gerçek dışı ya da fazla söz olduğu için merge'i bloke eder. M3 kartın DoD'sini karşılamıyor. D1–D5 aynı turda düzeltilebilir.

## Değişen dosyalar
Yalnız bu rapor. Kod/PR'a dokunulmadı.

## Riskler
- M2 düzeltilmeden DPA imzalanırsa, admin/system scope erişimi sözleşmedeki "her sorgu" sözüyle çelişir.
- K-489304 sonucu metinleri yeniden değiştirecek; sürüm dizesi o gün de artmalı.

## Notlar
- PR'daki "DPA'da uygulama katmanı yalıtımı yeterli mi" sorusu hukukçuya gidiyor (HUKUK 1.13); inceleme kapsamında karar verilmedi.

## Sonraki adım
se-fb: M1–M3 + D1, D3, D5 düzeltmesi aynı dala; sonra yeniden inceleme.
