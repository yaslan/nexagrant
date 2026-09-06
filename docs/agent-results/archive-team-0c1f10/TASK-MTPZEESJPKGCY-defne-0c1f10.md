# TASK-MTPZEESJPKGCY — E11.1 Beta User Onboarding (10 Design Partners)

**Ajan:** Defne (`defne-0c1f10`) — DevOps / Altyapı Mühendisi
**Tarih:** 2026-09-06 · **Sprint:** E11 (S8 → S16) · **Branch:** `dev`

> ⚠️ **ÖNEMLİ — GÖREV ÇAKIŞMASI.** Bu görev iki ajana birden verilmiş. Sora (`sora-0c1f10`,
> rapor: `TASK-MTPZEESJPKGCY-derin.md`) görevin **doküman ayağını** benden önce tamamlayıp
> `c5efc03` ile commit'lemiş. Ben çalışmaya başladığımda o commit henüz yoktu; kendi
> `docs/BETA_GUIDE.md` / `.en.md` sürümümü yazdım ve bu, onların commit'li dosyalarını ezdi.
> **Fark edince kendi rehber sürümümü attım ve onlarınkini `git checkout c5efc03 --` ile
> aynen geri getirdim.** Bu rapordaki teslimat, onların dokümanının üstüne gelen ve onda
> **olmayan** parçadır: çalışan, geri alınabilir, DB'ye gerçekten yazan onboarding otomasyonu.
> Çözülmesi bana ait olmayan bir tasarım çelişkisi kaldı — § 5'e bakın.

---

## 1. Ne yapıldı

Sora'nın çıktısı bir **program dokümanıdır** (rehber + elle yazılmış ICS + takip şablonları) ve
"Gün 0 · Hazırlık (biz yaparız)" adımını insan checklist'i olarak bırakır. Ben o adımı
**çalıştırılabilir, idempotent ve geri alınabilir** hale getirdim:

| Çıktı | Dosya | Ne yapar |
|---|---|---|
| Ortak listesi (şablon) | `docs/BETA_DATA/beta-partners.csv` | 10 tasarım ortağı; tümü RFC 2606 `.invalid` yer tutucu, PII uyarısı başlıkta |
| Roster ayrıştırıcı | `src/lib/beta/roster.ts` | CSV doğrulama (slug, orgType, locale, e-posta) + yer-tutucu adres tespiti |
| Davet e-postası | `src/lib/beta/invite-email.ts` | tr/en şablon, HTML + düz metin, alıcı verisi HTML-escape'li |
| Check-in takvimi | `src/lib/beta/checkin-schedule.ts` | Zaman dilimi farkında 8 haftalık program + RFC 5545 ICS üretimi |
| Program sabitleri | `src/lib/beta/constants.ts` | Modül kümeleri (`all` / `mvp`), slot varsayılanları, adresler |
| Onboarding CLI | `scripts/beta-onboarding.ts` | Tenant + owner + üyelik + workspace + abonelik + davet + ModuleState=PILOT; dry-run varsayılan, `--send` kapısı, `--rollback` |
| Birim testler | `tests/beta/*.test.ts` | 40 test |
| Kısayollar | `package.json` | `pnpm beta:onboard`, `pnpm beta:rollback` |
| Sır sızıntısı kapatma | `.gitignore` | `docs/BETA_DATA/generated/` (canlı davet token'ları) repoya girmiyor |

### Tasarım kararları ve gerekçeleri

1. **Dry-run varsayılan.** Bayraksız koşum hiçbir şey yazmaz/göndermez. DB yazımı `--apply`,
   e-posta `--send` ister. İkisi ayrı bayrak: DB'yi hazırlayıp e-postayı sonra göndermek
   normal bir iş akışı.
2. **Gerçek gönderim yapılmadı — bilinçli.** Elimde gerçek ortak adresi yok ve gönderim geri
   alınamaz. Kullanıcı bu oturumda açıkça "Hayır — dry-run + şablon" dedi. Script, roster'da
   tek bir `.invalid`/`.test`/`example.com` adresi kaldığı sürece `--send`'i **reddediyor**
   (§ 2.4 kanıt) — yanlışlıkla yer tutucuya gönderim mümkün değil.
3. **DST doğru hesaplanıyor.** Slot "Europe/Brussels'te Pazartesi 15:00" olarak tanımlı.
   8 haftalık dizi 25 Ekim 2026'daki yaz saati sonunu aşıyor; offset sabit yazılsaydı
   son toplantı bir saat kayardı. Her hafta kendi UTC anını zone'dan çözüyor ve ICS
   RRULE yerine **haftaya bir VEVENT** yazıyor (istemciler recurrence'ı DST üzerinden
   farklı genişletebiliyor).
4. **Token yeniden üretilmiyor.** Davet token'ı varsa korunuyor; aksi halde ikinci koşum
   gönderilmiş bağlantıyı geçersiz kılardı.
5. **Program tasarımı bayrağa bağlandı** — § 5.

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

### 2.1 Onboarding uygulandı — DB'ye gerçek yazım

```
$ npx tsx scripts/beta-onboarding.ts --start=2026-09-06 --apply
[beta-onboarding] mode               ONBOARD · db=APPLY · email=RENDER-ONLY
[beta-onboarding] modules            set "all" → 11 modules PILOT (M1, M2, M3, M5, M4, M8, M11, M6, M7, M9, M10)
[beta-onboarding] schedule           8 check-ins, 2026-09-07 → 2026-10-26, Mondays 15:00 Europe/Brussels
[beta-onboarding]   check-in         W1 2026-09-07 15:00 (UTC+02:00) → 2026-09-07T13:00:00.000Z
[beta-onboarding]   check-in         W2 2026-09-14 15:00 (UTC+02:00) → 2026-09-14T13:00:00.000Z
[beta-onboarding]   check-in         W3 2026-09-21 15:00 (UTC+02:00) → 2026-09-21T13:00:00.000Z
[beta-onboarding]   check-in         W4 2026-09-28 15:00 (UTC+02:00) → 2026-09-28T13:00:00.000Z
[beta-onboarding]   check-in         W5 2026-10-05 15:00 (UTC+02:00) → 2026-10-05T13:00:00.000Z
[beta-onboarding]   check-in         W6 2026-10-12 15:00 (UTC+02:00) → 2026-10-12T13:00:00.000Z
[beta-onboarding]   check-in         W7 2026-10-19 15:00 (UTC+02:00) → 2026-10-19T13:00:00.000Z
[beta-onboarding]   check-in         W8 2026-10-26 15:00 (UTC+01:00) → 2026-10-26T14:00:00.000Z
[beta-onboarding] db                 beta-anadolu-teknoloji: tenant cmtq0eiyo0000vsxka42mx21k, owner partner01@example.invalid, 11 modules PILOT
... (10 ortağın hepsi)
[beta-onboarding] done               onboarding applied
```

**W8 satırı kritik:** 26 Ekim'de yaz saati bittiği için UTC+01:00 → `14:00Z`; diğer 7 hafta
UTC+02:00 → `13:00Z`. Brüksel duvar saati her hafta 15:00 kalıyor.

### 2.2 DB doğrulaması — DoD "tüm modüller pilot"

```
slug | locale | orgType | modules PILOT | plan | owner | invite
beta-anadolu-teknoloji   | tr | SME          | 11/11 | enterprise/TRIALING | partner01@example.invalid (TENANT_OWNER) | TENANT_OWNER → 2026-11-02
beta-ankara-kume         | tr | CLUSTER      | 11/11 | enterprise/TRIALING | partner06@example.invalid (TENANT_OWNER) | TENANT_OWNER → 2026-11-02
beta-benelux-innov       | en | SME          | 11/11 | enterprise/TRIALING | partner08@example.invalid (TENANT_OWNER) | TENANT_OWNER → 2026-11-02
beta-bogazici-tto        | tr | UNIVERSITY   | 11/11 | enterprise/TRIALING | partner03@example.invalid (TENANT_OWNER) | TENANT_OWNER → 2026-11-02
beta-ege-arge            | tr | SME          | 11/11 | enterprise/TRIALING | partner02@example.invalid (TENANT_OWNER) | TENANT_OWNER → 2026-11-02
beta-iberia-research     | en | RESEARCH     | 11/11 | enterprise/TRIALING | partner09@example.invalid (TENANT_OWNER) | TENANT_OWNER → 2026-11-02
beta-izmir-belediye      | tr | MUNICIPALITY | 11/11 | enterprise/TRIALING | partner07@example.invalid (TENANT_OWNER) | TENANT_OWNER → 2026-11-02
beta-marmara-danismanlik | tr | CONSULTANCY  | 11/11 | enterprise/TRIALING | partner05@example.invalid (TENANT_OWNER) | TENANT_OWNER → 2026-11-02
beta-nordic-consulting   | en | CONSULTANCY  | 11/11 | enterprise/TRIALING | partner10@example.invalid (TENANT_OWNER) | TENANT_OWNER → 2026-11-02
beta-odtu-arge           | tr | UNIVERSITY   | 11/11 | enterprise/TRIALING | partner04@example.invalid (TENANT_OWNER) | TENANT_OWNER → 2026-11-02
---
TOPLAM beta tenant: 10
ModuleState dağılımı: [{"_count":{"_all":110},"status":"PILOT"}]
PILOT olmayan modül sayısı: 0
```

### 2.3 Idempotency — üç kez koşuldu, tekilleşme bozulmadı

Aynı komut 3 kez `--apply` ile koşuldu. Tenant id'leri değişmedi, satır sayıları sabit kaldı:

```
beta tenants: 10
moduleState by status: [{"_count":{"_all":110},"status":"PILOT"}]   ← 10 tenant × 11 modül
memberships TENANT_OWNER: 10
invitations: 10
subscriptions enterprise: 10
audit events: 20                                                    ← append-only log, kasıtlı olarak birikir
token (3 apply koşumundan sonra): C6v0eJn4LYVSCgsa… | role: TENANT_OWNER | expires: 2026-11-02
```

Davet token'ı koşumlar arasında **aynı** kaldı — gönderilmiş bir bağlantı ikinci koşumda kırılmıyor.
`AuditEvent` bilinçli olarak her koşumda büyüyor; denetim kaydı üzerine yazılmaz.

### 2.4 `--send` güvenlik kapısı

```
$ npx tsx scripts/beta-onboarding.ts --start=2026-09-06 --send
[beta-onboarding] FAILED: Refusing --send: 10 roster address(es) are on reserved, undeliverable
domains (partner01@example.invalid, … partner10@example.invalid). Replace them with the real
design partners first.
```

### 2.5 Geri alma (rollback) — gerçekten koşuldu

Tek satırlık geçici roster ile uçtan uca test edildi; 10 gerçek beta tenant'a dokunulmadı:

```
--- 1) apply ---
[beta-onboarding] db        beta-rollback-probe: tenant cmtq0o61y0000iaxkegdej4xb, owner probe@example.invalid, 11 modules PILOT
--- 2) DB'de var mı? ---
tenant: cmtq0o61y0000iaxkegdej4xb | moduleStates: 11 | user: VAR
--- 3) rollback dry-run ---
[beta-onboarding] rollback  beta-rollback-probe: WOULD delete tenant cmtq0o61y0000iaxkegdej4xb (cascade) — dry run
--- 4) rollback apply ---
[beta-onboarding] rollback  beta-rollback-probe: tenant + orphaned user removed
--- 5) DB'de kaldı mı? ---
tenant: YOK | user: YOK | artık moduleState: 110
10 gerçek beta tenant hâlâ yerinde mi: 10
```

### 2.6 İkinci program tasarımı da çalışıyor (BETA_GUIDE.md'nin tasarımı)

```
$ npx tsx scripts/beta-onboarding.ts --modules=mvp --day=4 --time=14:00 --tz=Europe/Istanbul
[beta-onboarding] modules            set "mvp" → 6 modules PILOT (M1, M2, M3, M5, M4, M8)
[beta-onboarding] schedule           8 check-ins, 2026-09-10 → 2026-10-29, Thursdays 14:00 Europe/Istanbul
[beta-onboarding]   check-in         W1 2026-09-10 14:00 (UTC+03:00) → 2026-09-10T11:00:00.000Z
[beta-onboarding]   check-in         W8 2026-10-29 14:00 (UTC+03:00) → 2026-10-29T11:00:00.000Z
```

### 2.7 Üretilen ICS (RFC 5545)

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Fabrika SaaS//Beta Check-in//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:fabrika-beta-checkin-w1@fabrika.dev
DTSTAMP:20260906T000000Z
DTSTART:20260907T130000Z
DTEND:20260907T134500Z
SEQUENCE:0
SUMMARY:Fabrika Beta check-in — week 1
DESCRIPTION:Fabrika Beta weekly check-in — week 1/8.\n2026-09-07 15:00 Euro
 pe/Brussels (UTC+02:00).\nAgenda: what you tried\, what broke\, what is mi
 ssing\, one pricing question.\nJoin: https://meet.google.com/fabrika-beta-
 checkin
LOCATION:https://meet.google.com/fabrika-beta-checkin
ORGANIZER;CN=Fabrika Beta:mailto:support@fabrika.dev
ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:partne
 r01@example.invalid
```
Satır katlama 75 oktette, CRLF satır sonları, kararlı UID (yeniden üretim aynı etkinliği günceller).

### 2.8 Üretilen TR davet e-postası (düz metin, ilk kısım)

```
Subject: Fabrika Beta — Sizi davet ediyoruz
To: Design Partner 01 <partner01@example.invalid>

Merhaba Design Partner 01,

Anadolu Teknoloji A.Ş. adına Fabrika'nın 8 haftalık kapalı betasına tasarım ortağı olarak
davet ediyoruz. …

Beta nedir?
8 hafta boyunca tüm modüller hesabınızda "pilot" durumunda açık olur. Ücret alınmaz. …

Neleri test edeceksiniz?
- K1 — Çağrı takibi: size uygun açık çağrıları bulma ve son tarih takibi.
- M5 — Teklif hattı: G0–G4 kapıları, ekip ataması, ilerleme takibi.
- M2 — Konsept not: şablondan taslak üretme ve düzenleme.
- M3 — Kanıt paketi: iddialarınızın arkasındaki kaynakları toplama.

İlk toplantı: 7 Eylül 2026 Pazartesi 15:00 (Europe/Brussels saatiyle). Takvim daveti ekte.
```

### 2.9 Testler

```
$ npx vitest run tests/beta
 Test Files  3 passed (3)
      Tests  40 passed (40)
```

### 2.10 Lint / typecheck

```
$ npx eslint src/lib/beta scripts/beta-onboarding.ts tests/beta
ESLINT_EXIT=0        (çıktı yok — temiz)

$ npx tsc --noEmit  | grep -E "src/lib/beta|scripts/beta|tests/beta"
(eşleşme yok — benim dosyalarımda TS hatası yok)
```

---

## 3. Değişen dosyalar

**Eklenen**
- `docs/BETA_DATA/beta-partners.csv`
- `src/lib/beta/constants.ts`, `roster.ts`, `invite-email.ts`, `checkin-schedule.ts`
- `scripts/beta-onboarding.ts`
- `tests/beta/checkin-schedule.test.ts`, `roster.test.ts`, `invite-email.test.ts`
- `docs/agent-results/TASK-MTPZEESJPKGCY-defne-0c1f10.md` (bu dosya)

**Değiştirilen**
- `package.json` — `beta:onboard`, `beta:rollback` script'leri
- `.gitignore` — `docs/BETA_DATA/generated/` + `beta-partners.local.csv`

**Geri getirilen (benim ezdiğim, Sora'nın commit'li dosyaları)**
- `docs/BETA_GUIDE.md`, `docs/BETA_GUIDE.en.md` → `c5efc03` sürümü

**Repoya YAZILMAYAN (bilinçli, gitignore'lu)**
- `docs/BETA_DATA/generated/` — 33 dosya; davet HTML/TXT'leri **canlı invitation token'ı** içeriyor
  (TENANT_OWNER erişimi verir). Bunlar sır niteliğindedir, versiyon kontrolüne girmez.

---

## 4. Riskler

1. **Yer tutucu roster.** 10 kayıt gerçek ortak değil. Gerçek liste girilene kadar davet
   gönderilemez (script zaten engelliyor). Gerçek liste **repoya konmamalı** — CSV başlığında
   ve `.gitignore`'da bu yazılı.
2. **Davet token'ı sırdır.** `docs/BETA_DATA/generated/` gitignore'lu; `--out=` ile başka bir
   yere yazdırılırsa o dizinin de korunması gerekir.
3. **Bu DB yerel dev veritabanı.** Şema `prisma db push` ile uygulandı (kullanıcı onayıyla,
   § 6). 10 beta tenant bu makinedeki `localhost:5432/fabrika` içinde; canlıya taşınmadı.
4. **`enterprise` planı gerçek fatura üretmez** (`TRIALING`, Stripe abonelik yok). Beta bitince
   planın ne olacağı E11.4'ün çıktısına bağlı.

### 4.1 Görevimin dışında bulunan güvenlik bulgusu — RLS uygulanmıyor

`tests/rls.spec.ts > Tenant A cannot see Tenant B workspaces` kırmızı. **Sebep benim verim değil:**

```
bağlanan rol: {"current_user":"fabrika","rolsuper":true,"rolbypassrls":true}
RLS etkin mi: Workspace/ModuleState/Opportunity → relrowsecurity=true, relforcerowsecurity=true
public şemadaki policy sayısı: 39
```

Uygulama, **superuser + BYPASSRLS** yetkili `fabrika` rolüyle bağlanıyor. Postgres'te bu rol
RLS'i tamamen atlar; `FORCE ROW LEVEL SECURITY` bile superuser'ı bağlamaz. Yani 39 politika
bu bağlantı için etkisiz. Test, veritabanı **boşken de** geçemezdi (tenant A + tenant B = 2 ≠ 1),
dolayısıyla benim eklediğim 10 workspace'ten önce de kırıktı; benim verim yalnızca sayıyı
3'ten 13'e çıkardı.

**Önerilen düzeltme (uygulamadım):** `.env.example` zaten ayrı bir `fabrika_migrate` rolü
tanımlıyor; asıl eksik, uygulamanın **NOSUPERUSER / NOBYPASSRLS** bir rolle bağlanması.
Uygulamadım çünkü (a) E11.1 kapsamı dışı, (b) aynı veritabanına yazan 3 paralel E11 ajanı var
ve rol değişimi hepsini anında kırar. Ayrı bir görev açılmalı.

### 4.2 Bana ait olmayan diğer kırmızılar

- `tests/k1-daily-calls.test.ts` (2), `tests/sedia-adapter.test.ts` (1) — canlı SEDIA API'sine
  çıkan ağ testleri, 5–10 sn timeout. Ortam kaynaklı, benim değişikliğimle ilgisiz.
- `src/lib/billing.ts:103 TS7006` — başka bir ajanın commit'lenmemiş değişikliğinden geliyor
  (`git diff` bu dosyada +41 satır gösteriyor, hiçbiri benim).

---

## 5. Açık sorular (KARAR GEREKİYOR — patron/lider)

Görev metni ile commit'li `docs/BETA_GUIDE.md` **iki farklı beta tasarımı** söylüyor.
Hangisinin geçerli olduğuna ben karar veremem; **ikisini de destekleyecek şekilde bayrağa bağladım**.

| Konu | E11 görev metni | `docs/BETA_GUIDE.md` (Sora) | Şu an DB'de olan |
|---|---|---|---|
| Modül kapsamı | **Tüm modüller** `pilot` | Yalnız MVP (M1,M2,M3,M4,M5,M8); M6/M7/M9/M10/M11 **kapsam dışı** | 11/11 PILOT (görev metni) |
| Toplantı günü/saati | **Pazartesi 15:00 CET** | **Perşembe 14:00 Europe/Istanbul** | Pazartesi 15:00 Brüksel |
| Beta bitişi | 8 hafta (→ 2026-10-26) | 2026-11-01 | 2026-11-02 (davet süresi) |
| Ortak kimlikleri | CSV'de e-posta listesi | Repoda PII yok, yalnız slot kodu | Yer tutucu + PII uyarısı |

**Karar "MVP + Perşembe İstanbul" çıkarsa** tek komutla dönülür (kod değişikliği yok):
```bash
pnpm beta:rollback --apply                     # mevcut 10 tenant'ı kaldır
pnpm beta:onboard -- --apply --modules=mvp --day=4 --time=14:00 --tz=Europe/Istanbul
```

Diğer açık noktalar:
1. **Gerçek 10 ortak kim?** Liste gelmeden davet gönderilemez.
2. **Toplantı bağlantısı.** `BETA_MEETING_URL` şu an yer tutucu bir Google Meet adresi.
3. **Google Calendar.** AgentSpace entegrasyon kataloğunda **yok** (`agentspace_integrations`
   ile soruldu: coolify, hostinger, posthog, sentry, stripe, vercel, github, supabase,
   elevenlabs). Bu yüzden takvim **ICS dosyası** olarak üretildi — Google Calendar / Outlook /
   Apple Takvim'e içe aktarılır. Otomatik davet için Google Calendar entegrasyonunun
   *Ayarlar → Entegrasyonlar*'dan bağlanması gerekir; bağlanırsa 8 daveti ben oluştururum.
4. **Resend** de katalogda yok; anahtar yalnız `.env`'de olabilir. Gönderim komutu hazır,
   tetiği çekmek için gerçek liste + açık onay gerekiyor.

---

## 6. Kullanıcı onayları (bu oturumda alındı)

- **`prisma db push`**: Yerel dev DB'ye şema uygulaması için açık onay istendi ve
  "Evet, çalıştır" alındı. Komut, Prisma'nın AI-ajan koruması nedeniyle
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` ile koşuldu. Sonuç:
  `The database is already in sync with the Prisma schema.` (paralel bir ajan şemayı
  bu arada uygulamıştı; veri kaybı olmadı).
- **Gerçek e-posta gönderimi**: "Hayır — dry-run + şablon" seçildi. **Hiçbir e-posta
  gönderilmedi.**

---

## 7. Definition of Done

- [x] **10 kullanıcı kaydedildi** — 10 tenant + 10 TENANT_OWNER üyelik + 10 davet, DB'de doğrulandı (§ 2.2)
- [ ] **Davet e-postaları gönderildi** — **GÖNDERİLMEDİ.** Şablon (tr/en) + gönderim komutu hazır ve
      test edildi; gerçek ortak listesi yok ve kullanıcı gönderim yapılmamasını seçti. Script,
      yer tutucu adres varken gönderimi reddediyor (§ 2.4). Resend log'u bu yüzden **yok**.
- [x] **Onboarding dokümanı hazır (tr/en)** — `docs/BETA_GUIDE.md` + `.en.md`, **Sora tarafından**
      yazıldı (`c5efc03`); benim ezdiğim sürüm geri alındı. DoD maddesi karşılanıyor, kredi Sora'nın.
- [x] **Tüm modüller `pilot` durumunda** — 110/110 ModuleState = PILOT, 0 istisna (§ 2.2)
- [x] **8 haftalık check-in zamanlandı** — ICS üretildi ve doğrulandı (§ 2.1, § 2.7). Google Calendar
      entegrasyonu mevcut olmadığı için davetler ICS olarak teslim; içe aktarılabilir.
- [x] **lint / typecheck temiz** (benim dosyalarımda) — § 2.10
- [x] **Adım idempotent, loglanabilir, geri alınabilir** — § 2.3, § 2.5
- [x] **Sır sızıntısı yok** — davet token'ları gitignore'lu; roster PII uyarılı; loglarda token yok
- [x] **Canlıya geçiş yok** — yalnız yerel dev DB
- [x] **Kanıt dosyası** — bu dosya

**Özet:** 6/7 DoD maddesi tamam. Tek eksik madde (gerçek e-posta gönderimi) teknik değil,
**girdi + onay eksikliği**: gerçek 10 ortak adresi verildiğinde tek komutla kapanır.

---

## 8. Sonraki adım

1. **Lider kararı:** § 5'teki tasarım çelişkisi (modül kapsamı + toplantı slotu) çözülsün.
   "MVP + Perşembe" seçilirse geri alma + yeniden koşum komutu § 5'te hazır.
2. **Gerçek ortak listesi** repo dışı bir CSV olarak verilsin →
   `pnpm beta:onboard -- --roster=<yol> --apply --send`.
3. **Ayrı görev açılsın:** uygulama DB rolü NOSUPERUSER/NOBYPASSRLS yapılsın, yoksa 39 RLS
   politikası etkisiz (§ 4.1). Çok kiracılılık güvencesi şu an kod seviyesinde, DB seviyesinde değil.
4. **E11.2 ile bağlantı:** rehber `/beta/feedback` ve `/beta/pricing-feedback` rotalarını
   işaret ediyor; o formlar E11.2/E11.4'te açılınca bağlantılar canlanır.
