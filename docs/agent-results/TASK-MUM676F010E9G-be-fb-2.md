# TASK-MUM676F010E9G — FB GİRİŞ OAUTH (pilot kapısı), İNCELEME-13 düzeltme turu — be-fb

Kod commit'i: `2ef3593e` (dal `dev`, push yok). İnceleme: crw-fb, TASK-MUM74TE5F3K44 (B-1 bloke, Ö-1, Ö-2).

## 1. Ne yapıldı

**B-1 (KVKK, bloke):** Onay çerezi (`fabrika_registration_ack`) artık yalnız işaretlendiği kayda ait.
- `src/lib/actions/auth.ts` `loginWithSocialAction`: kutu işaretli değilse (ya da davet kodlu başlatmaysa) `clearRegistrationAcknowledgementCookie()` çağrılıyor. Önceden yalnız "işaretliyse yaz" vardı.
- `src/lib/oauth-registration.ts` `decideOAuthSignIn`: kodsuz, onaylı yeni kayıt kararı artık `{ allow: true, plainRegistration: true }` döner. Diğer izin dalları (dönen giriş, e-posta bağlama, davetli kayıt) `{ allow: true }` olarak kaldı.
- `src/lib/auth.ts` signIn callback: karardan hemen sonra, **düz kayıt dışındaki her sonuçta** (izin ya da ret) onay çerezi siliniyor. Düz kayıtta çerez `events.createUser`'a kalıyor; o zaten okuyup siliyordu. Ek olarak `events.createUser`'ın "pending olmayan kullanıcı" dalı (bağlanan hesap, adapter fallback'i) da çerezi siliyor.
- Yaklaşım seçimi: crw-fb'nin 2. önerisindeki "değeri createdByAdapter'a taşı" yolu yerine kararın tipine bayrak koydum. Çerezi okuyan tek yer yine `events.createUser`. Bunun için modül düzeyinde bir istek-arası durum (e-posta anahtarlı map vb.) gerekmedi.

**Ö-1:** `registerOAuthUserWithInvite` artık `locale` alıyor (imzalı davet çerezindeki `invite.locale`, `tr|en`'e daraltılmış). `bootstrapOAuthTenant` → `writeRegistrationConsent(locale: input.locale ?? 'tr')`. Düz yol `tr` olarak kalıyor (çerez locale taşımıyor; yorum güncellendi).

**Ö-2:** `loginWithSocialAction`'daki gömülü TR/EN metin kaldırıldı; `getTranslations({ locale, namespace: 'Auth' })` → `t('disclosureRequiredAgency')`.

**Testler:**
- `tests/oauth-registration.live.test.ts` yeni describe bloğu, 5 test. Gerçek Auth.js callback + sahte sağlayıcı, `fabrika_app`:
  1. crw-fb'nin senaryosu, uygulamanın kendi `loginWithSocialAction`'ı ile: A işaretleyip vazgeçer, B işaretsiz başlatır. Callback `/tr/kayit?error=disclosure_required`, oturum yok, kullanıcı yok.
  2. Dönen giriş çerezi harcar; sonraki yeni hesap reddedilir (crw-fb Senaryo 2).
  3. E-posta bağlama (hem ret `email_unverified` hem başarılı bağlama) çerezi harcar; mevcut kullanıcıya Consent satırı yazılmaz.
  4. Davetli kayıt yanlışlıkla park edilmiş düz çerezi de harcar.
  5. Ö-1: `en` davet çereziyle kayıt → 3 Consent satırının hepsi `locale='en'`.
- `tests/social-action-disclosure.test.ts` (yeni, Ö-2): kod var + ek onayı yok → TR ve EN'de `Auth.disclosureRequiredAgency`'nin gerçek metni döner, hiçbir çerez park edilmez. `getTranslations` yalnız react-server koşulunda çalıştığı için test onu next-intl'in kendi `createTranslator`'ı ve gerçek `messages/*.json` ile değiştiriyor. Yani doğrulanan şey anahtar ve locale.
- `tests/oauth-registration.test.ts`: düz kayıt beklentisi `{ allow: true, plainRegistration: true }` oldu.

## 2. Kanıt

Hedefli koşu (canlı DB, `fabrika_app`, atlanan yok):
```
$ pnpm vitest run tests/oauth-registration.live.test.ts tests/oauth-registration.test.ts
 Test Files  2 passed (2)
      Tests  35 passed (35)
```

Mutasyon kanıtı (her düzeltme tek tek geri alındı, sonra geri yüklendi):
```
== M1: loginWithSocialAction'da else-clear yok
     × crw-fb's scenario: A ticks and gives up, B starts unticked with a new Google account — refused, no user, no consent
      Tests  1 failed | 17 passed (18)
== M2: signIn callback'te clear yok
     × a returning login spends a parked tick (it was not ticked for this person)
     × linking to an existing address spends it, and so does a refused link
      Tests  2 failed | 16 passed (18)
== M3: davet locale'i sabit 'tr'
     × Ö-1: an invite registration records the consent in the language it was read in
      Tests  1 failed | 17 passed (18)
== restored
      Tests  18 passed (18)
== Ö-2: t('disclosureRequiredAgency') → t('disclosureRequired')
      Tests  1 failed (1)          (geri yüklendi)
```
M2'de davetli-kayıt testi kırmızıya dönmedi. Bu beklenen bir durum: adapter'ın davet yolu `finally`'de onay çerezini zaten siliyordu. Signin callback'teki silme orada ikinci savunma hattı.

Kapılar (commit öncesi ağaç):
```
typecheck exit 0
lint exit 0
i18n exit 0   ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
rls exit 0    ✅ SUCCESS: All 47 tenant-scoped models have RLS policies registered.
              ✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
pnpm test:    Test Files  201 passed | 2 skipped (203)
              Tests  2336 passed | 8 skipped (2344)
```
8 atlanan testin hepsi dış API adaptör testi: `tests/adapters.test.ts` (2), `tests/k1-daily-calls.test.ts` (4), `tests/sedia-adapter.test.ts` (2). Hiçbiri DB, OAuth ya da RLS testi değil. OAuth canlı dosyası 18/18 koştu.

Commit:
```
2ef3593e fix(auth): OAuth acknowledgement cookie spent by every outcome; invite consent locale; translated refusal (TASK-MUM676F010E9G İNCELEME-13 B-1, Ö-1, Ö-2)
 src/lib/actions/auth.ts                |  21 ++++---
 src/lib/auth.ts                        |  10 ++++
 src/lib/oauth-registration.ts          |  30 +++++++---
 tests/oauth-registration.live.test.ts  | 101 ++++++++++++++++++++++++++++++++-
 tests/oauth-registration.test.ts       |   2 +-
 tests/social-action-disclosure.test.ts |  37 ++++++++++++
```

## 3. Değişen dosyalar
- `src/lib/actions/auth.ts`: B-1 else-clear, Ö-2 `getTranslations`
- `src/lib/auth.ts`: signIn callback'te çerezi harcama, `events.createUser` non-pending dalında silme, davet locale'ini geçirme
- `src/lib/oauth-registration.ts`: `plainRegistration` bayrağı, `locale` girdileri
- `tests/oauth-registration.live.test.ts`, `tests/oauth-registration.test.ts`, `tests/social-action-disclosure.test.ts`

Paylaşılan ağaçta başka ajanın commit'lenmemiş dosyaları vardı (`src/lib/agency/report*.ts`, `src/lib/inngest/*`, `tests/agency-report.live.test.ts`, `scratch/`). Bunlara dokunulmadı, commit'e girmedi.

## 4. Riskler
- Ö-2 yolu gerçek bir react-server bağlamında (çalışan uygulama, gerçek tıklama) koşulmadı; birim testi `getTranslations`'ı taklit ediyor. `getTranslations({ locale, namespace })` aynı biçimde `src/lib/modules/guard.tsx`'te sunucu tarafında zaten kullanılıyor. Eylem `'use server'` ve istek bağlamında çalıştığı için risk düşük.
- Düz (kodsuz) kayıtta Consent locale'i hâlâ `tr`. Onay çerezi locale taşımıyor. Bu Ö-1'in kapsamı dışında bırakıldı (crw-fb "düz yolda `tr` kalabilir" dedi).
- Onay çerezi hâlâ yalnız "bu tarayıcıda işaretlendi"yi kanıtlıyor, "bu kişi okudu"yu değil. Bu, tasarımın kabul edilmiş sınırı (`registration-ack-cookie.ts` başlık yorumu).

## 5. Açık sorular
- Düz OAuth kaydında locale'in de kaydedilmesi isteniyor mu? İsteniyorsa onay çerezinin değerine locale eklenir (`registrationAcknowledgementToken` + locale). Küçük bir iş ama çerez biçimi değişir.

## 6. Sonraki adım
- crw-fb yeniden incelemesi (B-1 regresyon testi: `acknowledgement cookie is spent by every OAuth outcome (İNCELEME-13 B-1)`).

**Platform beyanı:** mac'te doğrulandı (Darwin, yerel Postgres, `fabrika_app` rolü). Dokunulan kod platforma bağlı değil: çerez, Auth.js callback ve Prisma işlemleri; dosya yolu, süreç ya da kabuk kullanılmıyor. Windows/Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. Davranış koddan aynı olmalı; CI (Linux) aynı canlı testi koşar.
