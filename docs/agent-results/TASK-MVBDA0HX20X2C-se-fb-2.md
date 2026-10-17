# TASK-MVBDA0HX20X2C (FO-10, FB-GAP-2) — RLS iddiası metinlerini ölçüme hizalama

**Ajan:** se-fb · **Dal:** `se-fb/fo10-rls-claim-align` · **Commit:** `143ff671` (taban `origin/dev`) · **PR:** [#81](https://github.com/yaslan/fonbridge/pull/81) → `dev`, **merge edilmedi**
**Platform:** mac (darwin). Bu iş yalnız metin ve bir sürüm sabiti değiştirir; platforma bağlı kod yolu yok.

## Hüküm

Kullanıcıya gösterilen ve hukuki iddia taşıyan "RLS ile yalıtım" cümleleri **ölçülen gerçekle çelişiyordu**. Uygulama bağlantısı RLS'i atlayan `fabrika` rolüyle (SUPERUSER + BYPASSRLS) çalışıyor. Metinler, kiracı ayrımının uygulama katmanında (`withTenant`) yapıldığını ve RLS politikalarının tanımlı ama bu bağlantıda etkin olmadığını söyleyecek biçimde düzeltildi. Kod davranışı değişmedi. Kart DoD'unun ekran görüntüsü maddesi **açık** (aşağıda).

## Karar durumu

K-489304 cevabı **B** (kullanıcı, 16.10): `fabrika_app` geçişi ücretli satış kapısından önce yapılacak. B'de metin yine düzeltilir, ölçüm geçene kadar kalır; bu yüzden düzeltme bugünkü ölçüme göre yapıldı.

## Ne yapıldı

1. **Bugünkü durumu ölçtüm** — `pnpm rls:verify --require-db` (`.env` `set -a` ile aynı kabukta; kopyalama yok), exit 0.
2. **İddiaların tamamını tarandım** — `git grep` ile `messages/`, `src/`, `docs/` (tablo aşağıda).
3. **Metinleri düzelttim** (tr + en), ölçüme dayanarak; gizlilik metni değiştiği için `PRIVACY_NOTICE.version` artırıldı.
4. **Doğruladım**: `pnpm i18n:check`, `pnpm lint`, `pnpm typecheck` temiz.

## Kanıt (ham çıktı)

`pnpm rls:verify --require-db` — 2026-10-17, exit 0:

```
Kiracıya özel model: 47 · RLS açık tablo: 54 · tenant_isolation politikası: 48
RLS açık + 0 politika (deny-all): 0 · RLS kapalı + anon/authenticated erişimi: 0

⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
   Bu rolle yapılan bir izolasyon ölçümü GEÇERSİZDİR; RLS'e tabi bir rol aranıyor:

Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif) · ✓ okuma (pozitif) · ✓ okuma (NULL) · ✓ okuma (NULL, pozitif)
   ✓ kapsam (pozitif) · ✓ sahte kapsam (set_config) · ✓ sahte kapsam (SET) · ✓ sahte kapsam (mühür yeniden oynatma)
   ✓ yazma (negatif) · ✓ yazma (pozitif) · ✓ yazma (çapraz)

✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü.
```

Yorum: `✅` satırı yalnız test rolü `fabrika_app` için geçerli. Uygulamanın kendi bağlantısı (`fabrika`) bu ölçümde RLS'e tabi değil; betik bunu uyarıyor.

`pnpm i18n:check` → `✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.`

`pnpm lint` → 0 hata, 4 önceden var olan uyarı · `pnpm typecheck` → `tsc --noEmit` exit 0.

## Önce / sonra (tr + en)

`messages/*.json` → `securityBody`:

- **Önce (en):** "Your data is partitioned via PostgreSQL Row-Level Security (RLS) in a multi-tenant environment, …"
- **Sonra (en):** "Tenant data is separated at the application layer: each query is restricted to your tenant identifier. PostgreSQL Row-Level Security (RLS) policies are defined in the database, but they are not yet in effect on the application's database connection. …"
- **Önce (tr):** "Verileriniz çok kiracılı veritabanında PostgreSQL Row-Level Security (RLS) ile diğer kiracılardan yalıtılmış olup, …"
- **Sonra (tr):** "Kiracıya ait verileriniz, uygulama katmanında her sorgunun kendi kiracı kimliğinizle sınırlandırılmasıyla diğer kiracılardan ayrılır. PostgreSQL Row-Level Security (RLS) politikaları veritabanında tanımlıdır; ancak bu politikalar uygulamanın veritabanı bağlantısında henüz etkin değildir. …"

`src/lib/legal/consent-documents.ts`: `PRIVACY_NOTICE.version` `2026-10-02.1` → `2026-10-17.1` (metin değişti; eski onay kayıtları eski sürümde kalır).

## İddianın geçtiği yerler

| Dosya:satır | Metin (özet) | Kullanıcıya görünür mü | Durum |
|---|---|---|---|
| `messages/tr.json`, `messages/en.json` (`securityBody`) | "RLS ile diğer kiracılardan yalıtılmış" | **Evet** (gizlilik sayfası) | **Düzeltildi** |
| `docs/BETA_GUIDE.md`, `docs/BETA_GUIDE.en.md` | "RLS uygulanır" | **Evet** (beta kılavuzu) | **Düzeltildi** |
| `docs/legal/dpa-tr.md`, `docs/legal/dpa-en.md` (§5) | "RLS ile satır düzeyinde yalıtılır" | **Evet** (DPA eki) | **Düzeltildi** + hukuki soru |
| `docs/legal/privacy-notice-gap-analysis.md` | "RLS + şifreli nesne depolama" | Hayır (iç) | **Düzeltildi** |
| `docs/legal/processing-register.md` | "Teknik-idari tedbir: RLS" | Hayır (iç kayıt) | **Düzeltildi** |
| `docs/legal/HUKUK-SORULARI-2026-09.md` | sürüm 1.13 notu | Hayır (hukukçu paketi) | Not eklendi |
| `docs/SECURITY_COMPLIANCE.md` §1 | DB-level enforcement şeması | Hayır (iç) | **Değiştirilmedi** — §1 zaten "fabrika BYPASSRLS" uyarısını taşıyor |
| `src/app/[locale]/admin/settings/page.tsx:49` | Başlık "Veritabanı & RLS Güvenliği" | Yalnız admin | **Değiştirilmedi** — başlıkta yüzde/rozet iddiası yok |
| `src/app/[locale]/page.tsx:610` (en) | "isolated tenants" | Evet | **Değiştirilmedi** — RLS sözcüğü yok, genel kiracı yalıtımı ifadesi |

## Değişen dosyalar

- `messages/tr.json`, `messages/en.json`
- `docs/BETA_GUIDE.md`, `docs/BETA_GUIDE.en.md`
- `docs/legal/dpa-tr.md`, `docs/legal/dpa-en.md`, `docs/legal/privacy-notice-gap-analysis.md`, `docs/legal/processing-register.md`, `docs/legal/HUKUK-SORULARI-2026-09.md`
- `src/lib/legal/consent-documents.ts`
- `docs/agent-results/TASK-MVBDA0HX20X2C-se-fb.md` (bu rapor)

## Riskler ve sınırlar

- **Ekran görüntüsü (tr + en) alınmadı — DoD açık.** Gizlilik sayfasını tarayıcıda açıp göstermedim; metin değişikliği i18n kataloglarında ve kaynakta doğrulandı.
- **Hukuki ifade onaylı değil.** "Uygulama katmanında yalıtım" cümlesinin KVKK/GDPR açısından yeterli olup olmadığı `HUKUK-SORULARI-2026-09.md` 1.13'te soru olarak işaretli.
- **Önceki rapor sürümü geçersiz.** Bu dosyanın önceki hali "push bloke, PR yok" diyordu ve `b127e239` commit'ini gösteriyordu; o durum artık geçerli değil (`.env` ile gate koşuldu, dal `143ff671` ile push edildi, PR #81 açık).

## Açık sorular

1. DPA ve gizlilik metnindeki yeni ifade hukuken yeterli mi? (HUKUK-SORULARI 1.13)
2. `fabrika_app` geçişi (K-489304 B) yapıldığında bu metinler yeniden gözden geçirilecek; ölçüm geçince "RLS etkin" ifadesine dönülecek.

## Sonraki adım

1. Ekran görüntüleri (tr + en, gizlilik sayfası) — çalıştırılan uygulamada alınacak.
2. PR #81 hukuk onayından sonra `dev`'e merge (merge bu görevde yapılmadı).
