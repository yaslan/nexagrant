**Hüküm: TAMAM** — canlı Supabase'de `a***@yasinaslan.com.tr` kalıcı platform yöneticisi yapıldı (`"User"."isPlatformAdmin"=true`, tek satır, korumalı tek işlem, salt-okur doğrulama geçti).

- **Tip:** runtime / canlı veri değişikliği (patron açık talebi, 01.10.2026)
- **Görev:** TASK-MUOG51GJ3PUOG#admin · **Ajan:** devop-fb
- **Platform:** mac (darwin, `/opt/homebrew/bin/psql`). Değişiklik yalnız veritabanında; platforma bağlı kod yolu yok — Windows/Linux'ta koşulmadı, gerekmez (aynı SQL her psql istemcisinde aynıdır).

## 1. Ne yapıldı
1. Bağlantı: `FONBRIDGE/.env.supabase.local` → `SUPABASE_OWNER_URL` (rol `fabrika_migrate`, süper kullanıcı DEĞİL, `"User"` tablosunun sahibi). `postgres` kullanılmadı, bağlantı değerleri basılmadı.
2. Ön kontrol (`BEGIN READ ONLY`): toplam 1 satır, e-posta eşleşen 1, eşleşen-ve-admin 0, toplam admin 0; `"User"` RLS kapalı; tabloda kullanıcı tetikleyicisi yok.
3. Tek işlem: `UPDATE "User" SET "isPlatformAdmin"=true WHERE lower(email)='admin@yasinaslan.com.tr' AND "isPlatformAdmin"=false;` bir `DO` bloğu içinde çalıştı. `ROW_COUNT <> 1` olsaydı `RAISE EXCEPTION` ile işlem geri alınacaktı. Etkilenen satır = 1, COMMIT edildi.
4. Salt-okur son kontrol: eşleşen satır admin=true, toplam platform admin = 1, toplam satır = 1.

Başka hiçbir satıra ya da tabloya yazılmadı.

## 2. Kanıt (kopyalanmış çıktı)
Ön kontrol:
```
whoami=fabrika_migrate super=false owner=fabrika_migrate rls=false
total=1 match=1 match_admin=0 admins=0
triggers=0
accounts_on_user=google
```
Uygulama + doğrulama (UTC 2026-10-01T20:26:45Z → 20:26:46Z):
```
BEGIN
NOTICE:  affected=1
DO
COMMIT
BEGIN
post total=1 match_admin=1 admins=1
updatedAt_col=1
COMMIT
exit=0
```
Not: `"updatedAt"` Prisma `@updatedAt` alanıdır, veritabanı varsayılanı ya da tetikleyicisi değildir. Bu yüzden ham SQL bu alanı değiştirmedi. Değişikliğin zamanı aşağıdaki denetim kaydındadır.

## 3. Denetim izi (elle kayıt — uydurma satır EKLENMEDİ)
- Uygulamada platform düzeyinde bir yönetici değişikliği kaydı yok. `AuditEvent` (`prisma/schema.prisma:1236`) kiracı odaklıdır, `isPlatformAdmin` için yazan bir kod yolu da yok. Bu yüzden veritabanına kayıt eklenmedi.
- **Kayıt:** 2026-10-01 20:26:45Z (UTC) · **kim:** devop-fb (AgentSpace), `fabrika_migrate` rolüyle · **ne:** `"User"."isPlatformAdmin"` false→true, 1 satır (`a***@yasinaslan.com.tr`) · **neden:** patron açık talebi. Yönetici hakkı şimdiye kadar yalnız demo girişinin `demoAdmin` claim'inden geliyordu. Üretim derlemesinde demo girişi kapalı olduğu için bu hak kaybolacaktı (`src/lib/demo-login.ts` `isDemoLoginEnabled`). Veritabanı bayrağı kalıcıdır; jwt callback bayrağı her çağrıda veritabanından okur (`src/lib/auth.ts:742`).

## 4. Riskler
- **Google hesap bağlama — artık GERÇEK yol (en önemli bulgu):** Bu kullanıcıya bağlı bir **Google `Account` satırı zaten var** (`accounts_on_user=google`). Google sağlayıcısı `allowDangerousEmailAccountLinking: true` ile tanımlı (`src/lib/auth.ts:366-373`). `src/lib/auth.ts:464-468` yorumu tam bu durumu anlatıyor. Sonuç: bu adresin Google hesabıyla giriş yapan herkes artık platform yöneticisi olur. Yönetici hesabının güvenliği şu an **o Google hesabının ve `yasinaslan.com.tr` posta kutusunun güvenliğine** bağlı. Öneri: o Google hesabında 2FA zorunlu olsun.
- **Google girişi açık mı:** Yerel `.env` dosyasında `AUTH_GOOGLE_ID` ve `AUTH_GOOGLE_SECRET` DOLU (değerler basılmadı). Üretim ortam değişkenleri henüz tanımlanmadı (devir özeti §6). Üretimde de doldurulursa yukarıdaki yol canlıda açık olur.
- **Demo girişi + canlı veritabanı:** Demo sağlayıcısı parola kontrol etmez (`auth.ts:375`). Üretim derlemesinde demo kapalıdır, ama `DEMO_LOGIN_ENABLED=true` olan bir geliştirme sunucusu (yerel `.env` böyle) canlı DB'ye bağlanırsa, bu adresle parolasız giriş artık **veritabanından gelen gerçek yönetici** hakkı verir. Kural: demo açık bir sunucu canlı DB'ye ASLA bağlanmamalı.
- **Geri alma** (tek işlem, aynı rol):
  `BEGIN; UPDATE "User" SET "isPlatformAdmin"=false WHERE lower(email)='admin@yasinaslan.com.tr' AND "isPlatformAdmin"=true; -- 1 satır bekle → COMMIT`
  Açık oturumlar yetkiyi bir sonraki jwt yenilemesinde kaybeder, çünkü bayrak her çağrıda yeniden okunur.

## 5. Açık sorular
- Üretimde Google girişi açılacak mı? Açılacaksa o Google hesabında 2FA zorunlu tutulsun mu? (Patron kararı.)
- Platform düzeyindeki yönetici değişiklikleri için bir denetim tablosu ya da `AuditEvent` tipi istenir mi? Şu an elle yapılan değişiklikler iz bırakmıyor.

## 6. Sonraki adım
- Önceki maddeler aynen geçerli: SSL ve Data API kararları, `a617188a` inceleme kartı, üretim ortam değişkenleri, §3.3 dağıtımı.
- Kod ya da migration değişikliği yok; commit edilen tek şey bu rapor.
