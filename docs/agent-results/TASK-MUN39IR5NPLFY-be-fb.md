# TASK-MUN39IR5NPLFY — be-fb: FB davet rol değişimi, İNCELEME-32 Ö-1..Ö-3

**Kaynak:** `docs/agent-results/TASK-MUN2PP2OKQAZM-crw-fb.md` Ö-1, Ö-2, Ö-3 (fc763927'nin incelemesi, ONAY).
**Commit (dev):** `8e74d546` fix(invitations): a re-invite within the cooldown cannot change the mailed role.
**Ön koşul:** TASK-MUN2KUHP1BP18 raporu ve bekçinin POSIX yol düzeltmesi commit'lenmemiş kalmıştı. Önce onları `db762138` ile commit'ledim (`tests/where-guard-src.test.ts` 3/3).
**Durum:** Ö-1, Ö-2 ve Ö-3 kapandı.

## 1) Ne yapıldı

### Ö-1: 10 dakikalık soğuma içinde rol değiştirilemiyor (lider kararı)
- **`src/app/api/invitations/route.ts`:** Kilit altındaki `existing` sorgusu artık `role` alanını da okuyor. `mailSkip === 'recently_sent'` iken istenen rol mevcut davettekinden farklıysa:
  - `upsert` çalışmıyor. Satır e-postayla gönderildiği gibi kalıyor: rol, tokenHash ve **expires** değişmiyor.
  - `AuditEvent` yazılıyor: `type: 'invitation.role_change_blocked'`, `actorId` = çağıran, `target` = davet id, `data: { from, to }`. **Adres yazılmıyor.**
  - Yanıt: `200 { success: false, invitation (değişmemiş satır), emailSent: false, reason: 'role_change_blocked' }`. `inviteLink` dönmüyor.
- **Rol aynıysa** davranış bugünküyle aynı: token korunuyor, expires 7 gün uzuyor, `reason: 'recently_sent'`.
- **`src/lib/email/invitation-mail-policy.ts`:** `INVITATION_ROLE_CHANGE_BLOCKED` sabiti eklendi ve modül açıklaması güncellendi. Limit sorguları tipe göre filtrelediği için bu satır soğumaya da günlük sınıra da sayılmıyor (testle sabit).
- **`settings/members/page.tsx`:**
  - TR: "Davet az önce gönderildi; rolü değiştirmek için 10 dakika sonra yeniden davet edin"
  - EN: "The invitation was sent a moment ago; to change the role, invite again in 10 minutes"
  - Hiçbir şey değişmediği için mesaj hata stiliyle (kırmızı) gösteriliyor. İlk denemede yeşil başarı kutusunda çıkıyordu ve bu yanıltıcıydı; tek satırla düzelttim.
  - `i18n:check` geçti ve baseline artmadı.
- **Tasarım notu:** Engellenen istekte expires uzatılmıyor. Lider kararı "rol DEĞİŞMEZ" diyor; satıra hiç dokunmamak en dar ve en az şaşırtan yol. Bu durum testle sabit (`after toEqual(before)`).

### Ö-2: `recently_sent` → `daily_limit` sırası sabitlendi
Test senaryosu crw'nin önerdiği gibi: 2 dk önce SENT + 1 sa önce 49 satır (toplam 50 = sınır). Beklenen sonuç `reason: 'recently_sent'`, `inviteLink` yok, `tokenIsCurrent(mailed) === true`.

### Ö-3: `recently_sent`'te expires davranışı sabitlendi
Aynı rolle yeniden davet senaryosu. Satırın expires değeri 1 saat sonraya çekiliyor, ardından yeniden davet ediliyor. Beklenen: expires > şimdi + 6 gün, rol ve token korunmuş.

### Ek: eşzamanlı farklı rol (crw §2.4)
MEMBER ve WRITER aynı anda gönderiliyor. Kazanan istek e-postayı atıyor, kaybeden `role_change_blocked` alıyor ve satırda kazananın rolü kalıyor. Önceden son yazanın rolü kalıyordu.

### Mevcut testte değişen beklenti
İlk testteki "ikinci davet rolü WRITER'a çevirir" beklentisi lider kararıyla geçersiz oldu. Test artık aynı rolle yeniden davet ediyor ve `role: 'MEMBER'` bekliyor. Rol değişimi ayrı testte, engellenmiş olarak doğrulanıyor. Bu değişiklik testi gevşetmiyor: eski beklenti, kapatılan açığın kendisiydi.

## 2) Kanıt

Ortam: temiz worktree (HEAD `6e8505d4` + yalnız bu 4 dosyanın yaması) ve kendi `pgvector/pgvector:pg16` konteynerim `befb-mun39` (`:55472`). Şema `migrate diff --from-empty` ile kuruldu, ardından `db:rls-role` + `db:rls` (0 → 112 politika). `fabrika_app` NOBYPASSRLS. Paylaşılan `fabrika` DB'sine ve `:3000`'e dokunulmadı.

### 2.1 Hedefli vitest (izole DB)
```
tests/invitation-mail-limit.live.test.ts + src/lib/email/__tests__/mailer.test.ts → Tests 35 passed (35)   (31 eski + 4 yeni)
```

### 2.2 Mutantlar (her biri koşu sonrası geri alındı)
```
Y3  keepToken dalında expires yok ({ role })                    → 1 failed | 14 passed  ÖLDÜ  ("…same role pushes the expiry out…")
Y11 günlük sınır soğumadan ÖNCE                                 → 1 failed | 14 passed  ÖLDÜ  ("…recently_sent even when the tenant is at the daily limit")
Z1  rol karşılaştırması kapalı (existing && false)              → 2 failed              ÖLDÜ
Z2  role_change_blocked AuditEvent yazılmıyor                   → 1 failed              ÖLDÜ
Z3  AuditEvent data'sına e-posta ekleniyor                      → 1 failed              ÖLDÜ
Z4  reason 'role_change_blocked' → 'recently_sent'              → 2 failed              ÖLDÜ
Z5  aynı rolde de engelleniyor (existing)                       → 4 failed              ÖLDÜ
```
crw'nin hayatta kalan iki mutantı Y3 ve Y11 artık ölüyor. 7/7.

### 2.3 Gerçek tıklama + mailpit (izole `next dev -p 3339`, mailpit `befb-mun39-mailpit` 11339/18339, Playwright + system Chrome)
Tenant `rc-t` kuruldu: OWNER `rc-owner@`, TENANT_ADMIN `rc-admin@`, `seatsExtra=20`. İki kullanıcı da `/tr/giris` formundan giriş yaptı.
```
OWNER MEMBER            200 {"success":true,"role":"MEMBER","inviteLink":"present","emailSent":true}
  (AuditEvent createdAt → now() - 5 dk: soğuma içinde)
ADMIN(tr) TENANT_ADMIN  200 {"success":false,"invitation":{"role":"MEMBER",...},"emailSent":false,"reason":"role_change_blocked"}
UI(tr): Davet az önce gönderildi; rolü değiştirmek için 10 dakika sonra yeniden davet edin
ADMIN(en) TENANT_ADMIN  200 {"success":false,...,"reason":"role_change_blocked"}
UI(en): The invitation was sent a moment ago; to change the role, invite again in 10 minutes
mailpit total 1
mail → rc-davetli@example.test token 3b1db3a2… → row: MEMBER | valid=true      ← e-postadaki davet hâlâ MEMBER
AuditEvent:
invitation.email_sent          | rc-owner@example.test | target=invitation:true |
invitation.role_change_blocked | rc-admin@example.test | target=invitation:true | {"to": "TENANT_ADMIN", "from": "MEMBER"}
invitation.role_change_blocked | rc-admin@example.test | target=invitation:true | {"to": "TENANT_ADMIN", "from": "MEMBER"}
```
Ekran görüntüleri (hata stiliyle): `docs/agent-results/TASK-MUN39IR5NPLFY-be-fb/role-blocked-tr.png`, `…/role-blocked-en.png`

### 2.4 Kapılar
```
pnpm typecheck                 → tc=0 (ana ağaç)
eslint <4 dosya>               → lint=0
pnpm i18n:check                → passed, no file gained hard-coded text
pnpm build (temiz worktree)    → build exit=0 (son sayfa değişikliğinden sonra yeniden koşuldu)
```

### 2.5 Tam süit, yalnız izole DB'de (`befb39full`)
Kurulum: `migrate diff` → `apply-migrations.sh` ×2 (34 files, rc=0/0) → `db:seed` → `db:rls-role` → `db:rls` (28 → 112) → `apply-migrations.sh`. `env | grep DATABASE_URL`: üç değişken de `:55472/befb39full`.
```
isolated before: 1
 Test Files  224 passed | 2 skipped (226)
      Tests  2644 passed | 8 skipped (2652)          vitest exit=0
isolated after: 1
```
İlk tam koşuda 2 kırmızı vardı, ikisi de giderildi:
1. `teardown-where-guard`: Yeni testimdeki `updateMany({ where: { tenantId: requireId(…), type: INVITATION_MAIL_SENT } })` satırını yakaladı. `type` filtresini kaldırdım; bu testte gereksizdi.
2. `bearer-token-hash.live`: Kod kaynaklı değil. e2e için worktree `.env`'ine yazdığım mailpit SMTP ayarı gerçek `smtpMailer`'ı açtı ve ikinci davet `recently_sent`'e düştü. `.env` özgün hâline dönünce yeşil (hedefli 3 dosya 24/24, ardından tam süit yeşil).

## 3) Değişen dosyalar (`8e74d546`)
- `src/app/api/invitations/route.ts`
- `src/lib/email/invitation-mail-policy.ts`: **yalnız benim hunk'larım.** Aynı dosyada başka bir ajanın (TASK-MUN3OAFIVW9NA, `appBaseUrl` taşıması) commit'lenmemiş değişikliği var. Onu `git apply --cached` ile dışarıda bıraktım; çalışma ağacında duruyor.
- `src/app/[locale]/(app)/[workspace]/settings/members/page.tsx`
- `tests/invitation-mail-limit.live.test.ts`
- Rapor: bu dosya + `TASK-MUN39IR5NPLFY-be-fb/role-blocked-{tr,en}.png`

## 4) Riskler
- **Yanıt sözleşmesi:** `role_change_blocked` 200 + `success: false` ile dönüyor. Tek istemci members sayfası ve `reason`'a bakıyor. `success`'e güvenen başka bir istemci yok (`grep` ile kontrol ettim).
- **Engellenen istekte expires uzamıyor.** Davetli 7 günlük süreyi e-postanın gönderildiği andan itibaren kullanıyor; bu bugünkü gönderimle aynı.
- **cs-fb'nin accept-invite akışına dokunulmadı.** Kabul, rolü satırdan okuyor ve satır artık e-postadaki rolle aynı kalıyor.
- **Komşu değişiklik:** TASK-MUN3OAFIVW9NA `invitationMailBaseUrl`'i `appBaseUrl`'e taşıyor. Benim hunk'larım o bölgeye dokunmuyor, bu yüzden çakışma beklenmez.

## 5) Açık sorular
- Engellenen istek için davet edene "şu anki rol X" bilgisini göstermek ister miyiz? Yanıt `invitation.role`'ü taşıyor, ancak arayüz bugün göstermiyor. Göstermek bir ürün kararı.

## 6) Sonraki adım
- crw-fb incelemesi. Önerilen odak:
  - Z1–Z5 mutantları.
  - Eşzamanlı farklı rol testi.
  - 10 dk sonra rol değişiminin yeni e-postayla gittiği (testin son bölümü).

## Temizlik
- `befb-mun39` ve `befb-mun39-mailpit` konteynerleri kaldırıldı. Kendi `next dev` (:3339) sürecim kapatıldı. Worktree `git worktree remove` ile silindi.
- Başkalarının commit'lenmemiş dosyaları (`FON_BRIDGE.md`, `src/lib/app-url.ts`, calendar/billing vb., komşunun policy hunk'ı) commit'e girmedi.

## Platform
- **Doğrulandığı yer:** mac (Darwin 27, Docker `pgvector/pgvector:pg16`, Node, vitest 4.1.11, Next 16.3.4 build + dev, Playwright + system Chrome).
- Değişen kod platforma bağlı değil: Prisma sorgusu, dize karşılaştırması, JSON yanıt ve React metni. Dosya yolu, süreç ya da kabuk kullanılmıyor.
- **Windows ve Linux koşulamadı** (makinede yalnız mac var). Koddan bakınca aynı sonuç beklenir.
