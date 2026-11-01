# TASK-MTSJIXP9V3JD7 — CalendarConnection token'ları: seçenek B'yi kilitleyen makine gate'i

**Lider kararı (girdi):** TASK-MTSHP3BMTAD3Y §3'teki **B** seçeneği onaylandı — şifreleme fonksiyonu şimdi yazılmıyor (0 satır, yazma yolu yok, OAuth exchange tasarımı yok), ama "şifrelenmemiş token asla yazılamaz" kuralı bugün makine tarafından zorlanacak.

## 1. Ne yapıldı

### (a) Zarf format sözleşmesi

`src/lib/calendar/token-envelope.ts` (yeni dosya): `CalendarConnection.accessToken`/`refreshToken` için tek kural — değer `null` ya da `fkenc1:` önekiyle başlamalı. Gerçek şifreleme şeması (AES-GCM mi, anahtar nerede tutulacak mı) hâlâ açık (OAuth exchange tasarımına ertelendi); bugün sabitlenen tek şey önek. `isEnvelopedToken`, `assertEnvelopedOrNull`, `PlaintextCalendarTokenError` bu dosyada.

### (b) Makine gate'i — Prisma `$extends` sorgu uzantısı

`src/lib/db.ts`: `createDbClient()`'ın döndürdüğü **her** client (yalnız `prisma` singleton değil — RLS-rolü test client'ı da dahil) `withCalendarTokenGate()` ile sarmalanıyor. Bu, `calendarConnection.create/update/updateMany/upsert` çağrılarının `data`/`create`/`update` gövdesinde `accessToken`/`refreshToken` alanı varsa `assertEnvelopedOrNull`'dan geçiriyor; uymuyorsa Postgres'e hiç gitmeden `PlaintextCalendarTokenError` fırlatıyor.

**Neden Prisma-extension, neden DB CHECK constraint değil:** İki seçenek de "makine zorlar" niteliğinde. Extension'ı seçtim çünkü (1) bu repoda henüz `$use`/`$extends` deseni yok, ama DB migration'ları da manuel SQL — ikisi de eşit "yeni desen" maliyeti taşıyor; (2) extension, hatayı Postgres round-trip'i olmadan, TypeScript tarafında, okunur bir mesajla (`PlaintextCalendarTokenError`, alan adı + kural açıklaması) fırlatıyor — ham bir Postgres CHECK-violation string'i değil; (3) `withTenant`'ın `tx` client'ı extension'ı miras alıyor (aşağıda kanıtlandı), yani tenant-scoped yazma yolları da kapsanıyor. Trade-off: bu gate yalnızca Prisma üzerinden yazan koda uygulanır — `psql` ile elle bir satır yazılırsa (yedek geri yükleme, elle müdahale) tetiklenmez. Bu, bugünkü tehdit modeliyle (kod yolu üzerinden yazma) tutarlı; DB'ye doğrudan erişimi olan bir tehdit modeli ayrı bir kararı hak eder (§8.3 altında not edildi).

`withTenantOn`/`withTenant` imzaları değişmedi (`PrismaClient` tipi korundu — `$extends`'in döndürdüğü tip `as unknown as PrismaClient` ile geri cast edildi, çünkü extension yeni bir public metot eklemiyor, yalnız var olan `calendarConnection.create/update/...` çağrılarını araya girip kontrol ediyor; bu, repodaki ~8 `PrismaClient` tip referansını (ör. `tests/rls.spec.ts`, `relationships/[id]/data.ts`) değiştirmeden bırakmayı sağladı — daha küçük, daha az riskli diff).

### (c) 3 birim test

`src/lib/calendar/__tests__/token-envelope.test.ts`:
1. Düz metin (`'ya29.plaintext-access-token'`) → `PlaintextCalendarTokenError` fırlatır.
2. Zarf (`fkenc1:abc123ciphertext`) → fırlatmaz, `isEnvelopedToken` `true` döner.
3. `null`/`undefined` → fırlatmaz (sütun henüz boş kalabilir).

```
$ npx vitest run src/lib/calendar/__tests__/token-envelope.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### (d) Gate'i gerçek bir betikle deneme — gerçek red hatası

Geçici betik (`scripts/_pm-calendar-gate-probe.ts`, iş bitince silindi) `createDbClient` üzerinden gerçek bir Postgres bağlantısıyla üç senaryo denedi:

```
--- 1) plaintext accessToken on create ---
REJECTED: PlaintextCalendarTokenError - CalendarConnection.accessToken must be null or an
encrypted envelope ("fkenc1:…") — plaintext OAuth tokens cannot be written. See
docs/ROADMAP.md open decision #12.

--- 2) plaintext refreshToken on update ---
REJECTED: PlaintextCalendarTokenError - CalendarConnection.refreshToken must be null or an
encrypted envelope ("fkenc1:…") — plaintext OAuth tokens cannot be written. See
docs/ROADMAP.md open decision #12.

--- 3) enveloped token on create (should pass the gate, fail only on DB reachability) ---
DB write succeeded (gate passed it through)
```

Senaryo 3 gerçekten `probe-tenant` altında bir satır yazdı (gate doğru şekilde geçirdi) — hemen ardından `deleteMany({ where: { tenantId: 'probe-tenant' } })` ile temizlendi (`cleaned up 1 probe row(s)`), tablo yine 0 satır.

Ayrıca `withTenant`'ın transaction client'ının (`tx`) da gate'i miras aldığı ayrıca doğrulandı:

```
tx REJECTED: PlaintextCalendarTokenError - CalendarConnection.accessToken must be null or an
encrypted envelope ("fkenc1:…") — plaintext OAuth tokens cannot be written. ...
```

### (e) `prisma/schema.prisma:1164`, migration.sql, `docs/DATA_MODEL.md §8.2` — güncellendi

Üçü de artık aynı gerçeği söylüyor: şifreleme yardımcı fonksiyonu yok (B kararı gereği ertelendi), ama düz metin yazma bugün de makine tarafından engelleniyor (gate'in dosya konumu ve kuralı referanslı). `docs/ROADMAP.md` açık karar #12 güncellendi — B kararı, gate'in ne yaptığı ve §8.3 tarama sonucu oraya da yazıldı.

## 2. §8.3 — şemada aynı sınıftan başka açık-metin sır sütunu var mı (TARA VE LİSTELE, düzeltme yapılmadı)

```
$ grep -niE '(token|secret|apikey|password|credential|privatekey|clientsecret)' prisma/schema.prisma
```

| Model.alan | Sınıf | Canlı mı? | Not |
|---|---|---|---|
| `Account.access_token`/`refresh_token`/`id_token` | OAuth token (login, `@auth/prisma-adapter`) | **EVET — aktif yazılıyor.** `src/lib/auth.ts`, Google + Microsoft Entra ID sağlayıcıları yapılandırılmış (`providers: [Google(...), MicrosoftEntraID(...), Credentials(...)]`); `safeAdapter.linkAccount` → `baseAdapter.linkAccount!(account)` NextAuth'un varsayılan `PrismaAdapter` davranışını çağırıyor, bu da tam `AdapterAccount` nesnesini (token'lar dahil) olduğu gibi yazıyor. | `CalendarConnection`'ın aksine bu tablo **boş değil** — kullanıcı Google/Microsoft ile giriş yaptığı her an bu satırlar dolduruluyor. Aynı sınıftan risk, ölçek olarak daha acil. Kapsam dışı bırakıldı (bu görev yalnız `CalendarConnection`); ayrı bir karar/kart gerektirir — NextAuth'un kendi adapter sözleşmesini kırmadan şifrelemek, `linkAccount`'ı sarmalamayı gerektirir. |
| `ApplicationPart.magicToken` | Bearer erişim token'ı (ortak portalı) | **EVET — aktif yazılıyor.** `src/modules/m11/server/actions.ts:59` → `crypto.randomBytes(32).toString('hex')`, düz metin `create`'e yazılıyor, `where: { magicToken }` ile doğrudan karşılaştırılıyor. | Aynı repoda zaten kurulu bir karşı-örnek var: `ApiKey.keyHash` (satır 1267) API anahtarını **hash'leyerek** saklıyor. `magicToken` bu deseni izlemiyor — tutarsızlık, ayrı görev adayı. |
| `Invitation.token` | Davet linki token'ı | Evet, kısa ömürlü | Düz metin + `where: { token }` araması — davet linkleri için yaygın pratik (kısa TTL), ama yine `ApiKey` desenine göre daha zayıf. |
| `Session.sessionToken` | NextAuth oturum token'ı | Evet | NextAuth'un standart deseni; genelde bu sınıf ayrı ele alınmaz (kısa ömürlü, `deleteSession`'la iptal edilebilir). |
| `VerificationToken.token` | E-posta doğrulama / magic-link token'ı | Evet, tek kullanımlık | NextAuth standart deseni. |
| `ApiKey.keyHash` | API anahtarı | — | **Zaten hash'lenmiş** (`keyHash`, `prefix` ile birlikte) — sorun değil, karşılaştırma referansı olarak yukarıda kullanıldı. |

Düzeltme yapılmadı (görev kapsamı: tara + listele). En acil ikisi — `Account.*` (canlı, geniş yüzey) ve `ApplicationPart.magicToken` (kurulu `ApiKey.keyHash` desenine aykırı) — `docs/ROADMAP.md` açık karar #12'ye not düşüldü; ayrı bir kart açılması önerilir.

## 3. Anahtar üretme / env ekleme

Yapılmadı — talimat gereği. `fkenc1:` yalnızca bir format öneki, bir şifreleme anahtarı değil.

## 4. Değişen dosyalar

- `src/lib/calendar/token-envelope.ts` — yeni: zarf sözleşmesi (`ENVELOPE_PREFIX`, `isEnvelopedToken`, `assertEnvelopedOrNull`, `PlaintextCalendarTokenError`).
- `src/lib/calendar/__tests__/token-envelope.test.ts` — yeni: 3 birim test.
- `src/lib/db.ts` — `createDbClient()`'a `withCalendarTokenGate()` Prisma `$extends` sorgu uzantısı eklendi (create/update/updateMany/upsert için `calendarConnection`).
- `prisma/schema.prisma` — `CalendarConnection.accessToken` yorumu güncellendi (gate'e referans).
- `prisma/migrations/add-calendar-connections/migration.sql` — aynı yorum güncellemesi (uygulanmış migration, DDL değişmedi).
- `docs/DATA_MODEL.md §8.2` — aynı güncelleme.
- `docs/ROADMAP.md` açık karar #12 — B kararı, gate özeti, §8.3 tarama sonucu eklendi.

## 5. Riskler

- Gate yalnızca Prisma üzerinden yazan kod yolunu kapsıyor; `psql`/elle DB erişimi bu kontrolden geçmez (RLS de aynı sınırı taşıyor — bkz. TASK-MTSHP3BMTAD3Y §"Erişim yolu"). Bugünkü tehdit modeliyle (kod yolu üzerinden kazara plaintext yazma) tutarlı; DB'ye doğrudan erişim tehdidi ayrı bir karar.
- `Account.access_token`/`refresh_token`/`id_token` bu görevin kapsamı dışında kaldı ama **aktif olarak dolduruluyor** — `CalendarConnection`'dan (0 satır) daha acil bir risk sınıfı. Karar bekliyor.
- `fkenc1:` öneki sabit bir string sabiti; gerçek şifreleme şeması OAuth exchange tasarımıyla birlikte gelecek. O tasarım bu öneki üretmeyi unutursa (örn. base64 ciphertext'i doğrudan yazarsa) gate yine reddedecek — bu istenen davranış, ama OAuth PR'ını yazacak geliştiricinin `ENVELOPE_PREFIX`'i içe aktarıp kullanması gerektiği açıkça not edildi (schema yorumu + `token-envelope.ts` doc-comment).

## 6. Açık sorular

1. `Account.*` ve `ApplicationPart.magicToken` için ayrı bir kart açılsın mı — lider kararı bekliyor.
2. Gate'in DB CHECK constraint ile ikiye katlanması (defense-in-depth, doğrudan DB erişimine karşı) istenip istenmediği — bugün yapılmadı, §1(b)'de gerekçelendirildi.

## 7. Sonraki adım

OAuth callback/token-exchange PR'ı yazıldığında: encrypt adımı `ENVELOPE_PREFIX + <ciphertext>` üretmeli (`src/lib/calendar/token-envelope.ts`'ten import), aksi halde bu PR'ın kendi yazma denemesi gate tarafından reddedilecek — bu tam olarak istenen "unutma" koruması.
