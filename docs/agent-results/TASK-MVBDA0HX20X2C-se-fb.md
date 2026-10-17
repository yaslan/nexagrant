# TASK-MVBDA0HX20X2C (FO-10, FB-GAP-2) — RLS iddiası metinlerini ölçüme hizalama

**Ajan:** se-fb · **Dal:** `se-fb/fo10-rls-claim-align` (taban `origin/dev` @ `7f8d3de4`) · **PR:** `--base dev`, merge edilmedi
**Platform:** mac (darwin). Bu iş yalnız metin değiştirir; platforma bağlı kod yolu yok.

## Hüküm

Kullanıcıya gösterilen ve hukuki iddia taşıyan "RLS ile yalıtım" cümleleri **ölçülen gerçekle çelişiyordu**. Uygulamanın veritabanı bağlantısı RLS'i atlayan bir rolle (`fabrika`, SUPERUSER + BYPASSRLS) çalışıyor. Metinler, kiracı ayrımının uygulama katmanında (`withTenant`) yapıldığını ve RLS politikalarının tanımlı ama bu bağlantıda etkin olmadığını söyleyecek biçimde düzeltildi. Kod davranışı değişmedi.

## Ne yapıldı

1. **Bugünkü durumu ölçtüm** — `pnpm rls:verify --require-db` (ana depo, projenin kendi betiği).
2. **İddiaların tamamını tarandım** (`git grep` — `messages/`, `src/`, `docs/`).
3. **Metinleri düzelttim** (tr + en), ölçüme dayanarak.
4. `pnpm i18n:check`, `pnpm lint`, `pnpm typecheck` temiz.

## Kanıt (ham çıktı, `pnpm rls:verify --require-db`, 2026-10-17)

```
Kiracıya özel model: 48 · RLS açık tablo: 54 · tenant_isolation politikası: 48
RLS açık + 0 politika (deny-all): 0 · RLS kapalı + anon/authenticated erişimi: 0

⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
   Bu rolle yapılan bir izolasyon ölçümü GEÇERSİZDİR; RLS'e tabi bir rol aranıyor:

Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ ... (11 ölçüm, hepsi geçti; ayrıntı: fabrika_app test rolü)
✅ 48 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

Yorum: `✅` satırı **test rolü** (`fabrika_app`) için geçerli. Uygulamanın kendi bağlantısı (`fabrika`) ise bu ölçümde RLS'e tabi değil. Betik bunu kendisi uyarıyor ama kapı yine de exit 0 veriyor.

Ek kanıt — `docs/SECURITY_COMPLIANCE.md` §1 ve `docs/DATA_MODEL.md` (satır ~828, ~981) zaten aynı şeyi söylüyor: "Bugün uygulama BYPASSRLS bir rolle (`fabrika`) bağlandığı için …". Yani metinler kendi belgeleriyle de çelişiyordu.

Supabase MCP ile (`pxojxhvsvadqqaqudiok`) yapılan sorgu **uygulamanın canlı veritabanı değil**: o projede `fabrika`/`fabrika_app` rolleri yok, 19 public tablo var. Bu yüzden "canlı" ölçümün tek kaynağı yukarıdaki `rls:verify` çıktısıdır (uygulamanın `DATABASE_URL`'i).

## Tarama: iddianın geçtiği yerler

| Dosya:satır | Metin (özet) | Kullanıcıya görünür? | Durum |
|---|---|---|---|
| `messages/tr.json:847` · `messages/en.json:847` (`securityBody`) | "RLS ile diğer kiracılardan yalıtılmış" | **Evet** — gizlilik/KVKK sayfası | **Düzeltildi** |
| `docs/BETA_GUIDE.md:224` · `BETA_GUIDE.en.md:199` | "RLS uygulanır" | Evet (beta kullanıcı kılavuzu) | **Düzeltildi** |
| `docs/legal/dpa-tr.md:61` · `dpa-en.md:61` | "RLS ile satır düzeyinde yalıtılır" | Evet (DPA, müşteriye giden sözleşme eki) | **Düzeltildi** — hukuki soru eklendi |
| `docs/legal/privacy-notice-gap-analysis.md:37` | "RLS + şifreli nesne depolama" | Hayır (iç analiz) | **Düzeltildi** |
| `docs/legal/processing-register.md:22` | "Teknik-idari tedbir: RLS" | Hayır (iç kayıt) | **Düzeltildi** |
| `docs/legal/HUKUK-SORULARI-2026-09.md` | sürüm kaydı | Hayır (hukukçuya soru paketi) | Sürüm 1.13 notu eklendi |
| `docs/SECURITY_COMPLIANCE.md` §1 | "DB-level enforcement" şeması | Hayır (iç) | **Değiştirilmedi** — §1'in zaten "fabrika BYPASSRLS" uyarısı var; mimari açıklama olarak doğru, ölçüm durumu ayrıca belgelenmiş |
| `src/app/[locale]/admin/settings/page.tsx:49` | Başlık "Veritabanı & RLS Güvenliği" | Yalnız admin | **Değiştirilmedi** — başlıkta bir iddia (yüzde/rozet) yok; kart gereği yalnız metin iddiası değiştirildi |
| `src/app/[locale]/page.tsx:610` (en, pazarlama) | "isolated tenants" | Evet | **Değiştirilmedi** — RLS sözcüğü yok, iddia kiracı yalıtımı genel ifadesi; kapsam dışı |

## Değişen dosyalar

- `messages/tr.json`, `messages/en.json` — `securityBody`
- `docs/BETA_GUIDE.md`, `docs/BETA_GUIDE.en.md` — kiracı izolasyonu maddesi
- `docs/legal/dpa-tr.md`, `docs/legal/dpa-en.md` — §5 güvenlik önlemleri
- `docs/legal/privacy-notice-gap-analysis.md` — satır 4
- `docs/legal/processing-register.md` — teknik-idari tedbir
- `docs/legal/HUKUK-SORULARI-2026-09.md` — sürüm 1.13 notu
- `docs/agent-results/TASK-MVBDA0HX20X2C-se-fb.md` — bu rapor

Kod değişmedi, tek istisna: `src/lib/legal/consent-documents.ts` — gizlilik metni değiştiği için `PRIVACY_NOTICE.version` `2026-10-02.1` → `2026-10-17.1` (dosyanın kuralı: metin değişince sürüm artar; eski onay kayıtları eski sürümde kalır, silinmez).

## Doğrulama

- `pnpm i18n:check` → exit 0 (`both catalogs agree`, sabit metin eklenmedi)
- `pnpm lint` → exit 0 (0 hata, 4 önceden var olan uyarı)
- `pnpm typecheck` → exit 0 (worktree'nin kendi `pnpm install` + `pnpm db:generate` sonrası)
- JSON geçerliliği: `messages/tr.json`, `messages/en.json` `require` ile okundu

## Riskler ve sınırlar

- **Ekran görüntüsü (tr + en) alınmadı.** Worktree'de `.env` yok; `.env` okumaya izin kuralıyla engelli, kopyalamadım. Uygulamayı ayağa kaldırıp gizlilik sayfasını gösteremedim. Metin değişikliği i18n katalogları ve kaynak üzerinden doğrulandı; görsel kontrol açık kalıyor.
- **`K-489304` kararı bekleniyor.** A seçilirse (`fabrika_app` geçişi) metin yeniden gözden geçirilmeli; B seçilirse bu metin, ölçüm yeniden geçene kadar kalır. Kart iki durumda da metnin düzeltilmesini istiyor.
- **Hukuki iddia:** DPA ve gizlilik metninin yeni ifadesi hukuki onaylı değildir. `HUKUK-SORULARI-2026-09.md` 1.13'te soru olarak işaretlendi.
- **Tip kontrolü ön koşulu:** Ana depodaki `node_modules` eski bir Prisma istemcisi içeriyordu (444 TS hatası, `tokenHash`/`acceptedAt`). Bu değişiklikten bağımsız; worktree'ye kendi bağımlılıkları kurularak çözüldü.

## Push durumu: **BLOKE — push edilmedi, PR açılmadı**

- Commit yerelde: `b127e239` (`se-fb/fo10-rls-claim-align`, taban `origin/dev` `7f8d3de4`).
- `git push` pre-push kapısında (`pnpm gate` → vitest) durdu: **51 test, 14 dosya başarısız**.
- Kanıt: aynı sayı (14 dosya / 51 test) **origin/dev'in taze worktree'sinde de** çıktı → bu değişiklikten bağımsız.
- Neden: bu worktree'de `.env` yok; test DB'lerine `fabrika` rolüyle bağlanılamıyor ("credentials ... not valid"). `.env` okuma izin kuralıyla engelli, kopyalamadım ya da symlink'lemedim.
- `--no-verify` kullanılmadı (kapı atlanmadı).
- Sonuç: PR `--base dev` açılmadı. Bu, `.env`'li bir ortamdan (ya da kapının DB'siz kısmı için ayrılmış bir kurulumdan) push edilmesini gerektiriyor.

Ayrıca bu kapıda koşmayan / koşamayan kontroller: `pnpm gate` içindeki `test:e2e` (Playwright, DB ister) ve `rls:verify` (DB ister). `rls:check` exit 0 (ayrıca koştu).

## Açık sorular

1. `K-489304`: `fabrika_app` geçişi yapılacak mı? Yapılırsa bu metinler yeniden güncellenecek mi?
2. `HUKUK-5` / DPA: "uygulama katmanında yalıtım" ifadesi KVKK/GDPR açısından yeterli mi?

## Sonraki adım

PR `dev` tabanına açılır, merge edilmez. Ekran görüntüsü, `.env`'li bir ortamda (ana depo ya da izin verildiğinde worktree'ye sembolik bağlantı) alınır.
