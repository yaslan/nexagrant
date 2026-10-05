# TASK-MUN3W8R114QJZ — crw-fb: İNCELEME-37 (TASK-MUN39IR5NPLFY, be-fb)

**İncelenen:** `8e74d546` fix(invitations): a re-invite within the cooldown cannot change the mailed role · rapor `70c26854` (`docs/agent-results/TASK-MUN39IR5NPLFY-be-fb.md`).
**Kaynak bulgular:** İNCELEME-32 Ö-1..Ö-3 (`docs/agent-results/TASK-MUN2PP2OKQAZM-crw-fb.md`).

## Karar: **ONAY**

Bloke eden bulgu yok. Ö-1, Ö-2 ve Ö-3 kapandı:
- Soğuma içinde farklı rolle yapılan yeniden davet satırı hiç değiştirmiyor (rol, token, expires aynı kalıyor).
- `role_change_blocked` audit satırında `{from, to}` var, adres yok.
- Y3 ve Y11 artık ölüyor.
- Aynı rolle yeniden davet davranışı bozulmadı.
- Eşzamanlı 2'li ve 3'lü farklı rollü POST'ta tek e-posta gidiyor ve satırda kazananın rolü kalıyor.
- Kabul edilmiş davette farklı rolle yeniden davet `role_change_blocked`'e düşmüyor, `400 "zaten üye"` dönüyor.

Aşağıdaki dört bulgu öneri düzeyinde. İkisi test boşluğu (hayatta kalan mutantlar), biri bugün UI'dan erişilemeyen bir kenar durum, biri UX.

## 1) Ne yapıldı

1. `8e74d546`'nın 4 dosyası satır satır okundu. Ayrıca kabul akışı `src/lib/invitations/accept.ts` (cs-fb, `0ae3175b`) da okundu: rolü nereden okuyor, tek kullanım nasıl sağlanıyor.
2. Temiz worktree (`--detach a8322a79`, dev HEAD) kuruldu. Kendi `pgvector/pgvector:pg16` konteynerim `crwfb-mun37` (`:55491/crw37`) kullanıldı. Kurulum sırası:
   - `migrate diff --from-empty`
   - `apply-migrations.sh` (34/34)
   - `db:rls-role`, `db:rls` (28 → 112 politika)
   - `db:seed`
   - `prisma generate`

   `fabrika_app` rolünde `rolbypassrls=f`. Paylaşılan `fabrika` DB'sine ve `:3000`'e dokunulmadı.
3. Hedefli test, Y3/Y11 ve 6 kendi mutantım koşuldu.
4. Kendi senaryo testlerim S1–S5 yazıldı. Bunlar repoya girmedi; kanıt olarak scratchpad'de duruyor.
5. İzole DB'de tam süit, tsc ve eslint koşuldu.
6. be-fb'nin tr ekran görüntüsüne bakıldı. Hata stili (kırmızı) doğru.

## 2) Kanıt

### 2.1 Hedefli test (izole DB, `fabrika_app` altında)
```
tests/invitation-mail-limit.live.test.ts → Tests 15 passed (15)
tests/invitation-mail-limit.live.test.ts + src/lib/invitations → Tests 33 passed (33)   (atlanan yok)
```

### 2.2 Mutantlar (her biri koşu sonrası `git checkout` ile geri alındı)
```
Y3                   exit=1 Tests  1 failed | 14 passed   ÖLDÜ  (same role pushes the expiry out)
Y11                  exit=1 Tests  1 failed | 14 passed   ÖLDÜ  (recently_sent even at the daily limit)
C1_fallthrough       exit=1 Tests  2 failed | 13 passed   ÖLDÜ  (engel dalı audit yazıp upsert'e düşüyor)
C4_auditTypeSent     exit=1 Tests  1 failed | 14 passed   ÖLDÜ  (engel satırı INVITATION_MAIL_SENT tipinde → limite sayılır)
C5_target null       exit=1 Tests  1 failed | 14 passed   ÖLDÜ
C6_successTrue       exit=1 Tests  1 failed | 14 passed   ÖLDÜ
C2_anySkip           exit=0 Tests 15 passed               HAYATTA → Ö-1
C3_requestedRole     exit=0 Tests 15 passed               HAYATTA → Ö-2
```
C2: `mailSkip === 'recently_sent' && …` yerine `mailSkip && …`.
C3: `existing.role !== role` yerine `existing.role !== requestedRole`.

Önerdiğim S4 ve S5 testleri bu iki mutantı öldürüyor:
```
C2_anySkip        exit=1 Tests 1 failed | 3 passed   × S4 (mutant C2) at the daily limit, outside the cooldown, a role change goes through with a link
C3_requestedRole  exit=1 Tests 1 failed | 3 passed   × S5 (mutant C3) an uninvitable role inside the cooldown reads as the same role (MEMBER)
```

### 2.3 Kendi senaryolarım (`zz-crw37.live.test.ts`, repoya girmedi)
```
S1 accept = accepted
S1 reinvite TENANT_ADMIN = 400 {"error":"Bu e-posta adresi zaten bu kurumun üyesidir."}
S1 membership role = MEMBER                                   ← kabul edilmiş davet: blocked audit 0, satır toEqual(before)
S2 left+reinvite WRITER = 200 {"success":false,…,"role":"MEMBER",…,"reason":"role_change_blocked"}
S2 left+reinvite MEMBER = 200 {"success":true,"emailSent":false,"reason":"recently_sent"}
S2 row = {"role":"MEMBER","acceptedAt":"2026-09-29T20:16:09.590Z"} mailed link state = used send calls = 1   → Ö-3
S3 200:sent:MEMBER | 200:role_change_blocked:MEMBER | 200:role_change_blocked:MEMBER   (3 eşzamanlı, 3 farklı rol; 1 e-posta, 2 blocked audit)
S4 200 {"success":true,…"role":"WRITER"…,"inviteLink":"present","emailSent":false,"reason":"daily_limit"}
S5 200 {"success":true,"emailSent":false,"reason":"recently_sent"}   (TENANT_OWNER → MEMBER'e indirgeniyor, engel yok)
 ✓ S1  ✓ S3  ✓ S4  ✓ S5    Tests 4 passed (4)
```

### 2.4 Tam süit, yalnız izole DB'de
```
env: DATABASE_URL / _MIGRATE / _RLS_TEST → localhost:55491/crw37
iso before: 1  shared before: 1
 Test Files  228 passed | 2 skipped (230)
      Tests  2677 passed | 8 skipped (2685)        vitest=0
iso after: 1  shared after: 1
```
Seed'siz ilk koşuda 7 kırmızı vardı: `cron-tenant-scope` ("no Topic rows locally"), `plan-admin` (M6 plan grant), `stripe-webhook-tenant-scope`, `double-charge-prevention`. Hepsi seed verisine bağlı, davet koduyla ilgisi yok. `db:seed` sonrası 0 kırmızı.

### 2.5 Kapılar
```
pnpm exec tsc --noEmit → tsc=0
eslint <4 değişen dosya> → lint=0
```
Build'i yeniden koşmadım. be-fb temiz worktree'de `build exit=0` raporladı ve inceleme sonrası `src/` altında değişiklik yok (`git diff a8322a79 HEAD -- src tests` boş).

## 3) Bulgular (önem sırasıyla)

- **Ö-1 (test boşluğu, düşük): engel koşulunun yalnız `recently_sent`'e bağlı olduğu sabitlenmemiş.** Bkz. `src/app/api/invitations/route.ts:124`.
  - C2 mutantı (`mailSkip && …`) hayatta kalıyor.
  - Başarısızlık senaryosu: tenant günlük 50 sınırında ve x@'ye 1 saat önce MEMBER daveti gitmiş. Yöneticinin WRITER'a çevirmesi bugün doğru çalışıyor: `daily_limit` dönüyor, rol WRITER oluyor, bağlantı elle iletiliyor (S4). C2 regresyonunda ise istek `role_change_blocked` alıyor ve "10 dakika sonra" mesajı yalan oluyor: sınır dolu olduğu sürece rol hiç değişmiyor.
  - Düzeltme: S4'ü `invitation-mail-limit.live.test.ts`'e ekle.
- **Ö-2 (test boşluğu, çok düşük): karşılaştırmanın indirgenmiş `role` ile yapıldığı sabitlenmemiş.** Bkz. `route.ts:124`.
  - C3 (`requestedRole`) hayatta kalıyor.
  - Senaryo: istemci davet edilemeyen bir rol yolluyor (`TENANT_OWNER`). Bugün bu rol MEMBER'e indirgeniyor ve `recently_sent` dönüyor (S5). C3 regresyonunda audit'e `to: 'TENANT_OWNER'` yazılıyor ve istek engelleniyor. Yetki açığı yok, ama audit gerçekte olmayan bir rol isteğini kaydetmiş olur.
  - Düzeltme: S5'i ekle.
- **Ö-3 (düşük, bugün UI'dan erişilemiyor; kısmen `0ae3175b`'den önce de vardı): `existing` sorgusu `acceptedAt`'e bakmıyor.** Bkz. `route.ts:115-142`.
  - Senaryo S2: davet 5 dk önce MEMBER olarak gönderildi, kabul edildi, sonra üyelik silindi. `src/` içinde üye silme yolu yok (`grep membership.delete` yalnız bir test dosyası buluyor), bu yüzden bugün yalnız DB ya da ileride eklenecek "üyeyi çıkar" özelliğiyle erişilebilir.
    - Farklı rolle yeniden davet `role_change_blocked` alıyor. Mesaj "davet az önce gönderildi" diyor, ama o davet kullanılmış.
    - Aynı rolle yeniden davet `success: true, recently_sent` alıyor ve "davetli e-postadaki bağlantıyı kullanabilir" mesajını gösteriyor. Oysa bağlantının durumu `used`, `acceptedAt` NULL'a dönmüyor, yani kişi 10 dk boyunca geri katılamıyor.
    - İkinci davranış (aynı rolde `keepToken` dalının `acceptedAt`'i sıfırlamaması) be-fb'nin bu commit'inden önce de vardı.
  - Düzeltme önerisi: `select`'e `acceptedAt` ekle. `existing.acceptedAt` doluysa `keepToken`/engel dalına girme (e-posta atılabiliyorsa yeni token + `acceptedAt: null`). Üye çıkarma özelliği eklendiğinde bu şart olur. O kartın DoD'una not düşülmeli.
- **Ö-4 (UX, öneri): engellenen istekte e-posta alanı temizleniyor ve mevcut rol gösterilmiyor.** Bkz. `members/page.tsx:71` (`setEmail('')`), be-fb ekran görüntüsünde alan boş.
  - Kullanıcı 10 dk sonra adresi yeniden yazmak zorunda kalıyor.
  - Yanıtta `invitation.role` zaten var. "Mevcut rol: Üye" eklemek be-fb'nin açık sorusuyla aynı ürün kararı.
  - Hata değil.

**Bilgi (bulgu değil):** Her engellenen tık yeni bir `invitation.role_change_blocked` satırı yazıyor ve bunun sınırı yok. Yalnız OWNER/ADMIN tetikleyebiliyor, satırda adres yok, limitlere sayılmıyor (C4 bunu kanıtlıyor). Kabul akışı rolü satırdan okuyor ve engel dalı satıra dokunmuyor. Bu yüzden e-postadaki bağlantı gönderildiği rolle kabul ediliyor (S1: `membership role = MEMBER`).

## 4) Değişen dosyalar
- Yalnız bu rapor. Kod değiştirilmedi.
- Kanıt dosyaları scratchpad'de, repoya girmedi: `…/scratchpad/ev37/` (`full37b.txt`, `s37.txt`, `zz-crw37.live.test.ts`, `mut37.py`).

## 5) Riskler
- Ö-3, "üyeyi çıkar" özelliği eklendiğinde görünür hale gelir: çıkarılan kişi 10 dk boyunca yeniden davet edilemez ve arayüz yanlış mesaj gösterir.
- Ö-1 ve Ö-2 testleri eklenmezse ilgili regresyonlar sessiz kalır.

## 6) Açık sorular
- (Ürün) Engellenen istekte mevcut rolü göstermek ve e-posta alanını korumak (Ö-4).

## 7) Sonraki adım
- be-fb (isteğe bağlı, küçük): S4 ve S5 testlerini ekle. Ö-3 için `acceptedAt` kontrolünü ekle ya da üye çıkarma kartına not düşür.
- Kart `done`'a alınabilir. Bu inceleme ONAY.

## Temizlik
- `crwfb-mun37` konteyneri kaldırıldı (`docker rm -f`).
- Worktree `git worktree remove` ile silindi.
- Paylaşılan `fabrika` DB'sinde kiracı sayısı 1'den 1'e, değişmedi.

## Platform
- **Doğrulandığı yer:** mac (Darwin 27, Docker `pgvector/pgvector:pg16`, Node, vitest 4.1.11).
- İncelenen kod platforma bağlı değil: Prisma sorgusu, dize karşılaştırması, advisory lock, JSON yanıt ve React metni. Dosya yolu, süreç, kabuk ya da kısayol yok.
- **Windows ve Linux koşulamadı** (makinede yalnız mac var). Koddan bakınca aynı sonuç beklenir.
