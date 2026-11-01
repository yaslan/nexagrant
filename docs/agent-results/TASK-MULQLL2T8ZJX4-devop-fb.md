# TASK-MULQLL2T8ZJX4 — devop-fb: portal ve davet token'ları artık yalnızca SHA-256 olarak saklanıyor

**Kart:** FB GÜVENLİK: düz metin token'lar. `ApplicationPart.magicToken` ve `Invitation.token` hash'lendi (ApiKey.keyHash deseni). Account OAuth token'ları için karar notu hazırlandı.
**Dal:** `dev` (push yok, 1 Ekim) · **Commit'ler:** `587a50e0` (kod + migration), `ce2e7432` (canlı test)
**Platform beyanı:** Yalnız **macOS**'ta doğrulandı (Darwin 27, Postgres 16 `fabrika-postgres` :5433, Next 16 dev). Dokunulan kod platformdan bağımsız: Node `crypto`, Postgres `sha256()`, Prisma. Dosya yolu, süreç ya da kabuk kullanılmıyor. Windows ve Linux'ta **koşulamadı**, çünkü elimde o makineler yok. Koddan bakınca davranış aynı olmalı. CI (Linux) 1 Ekim push'unda koşacak.

## 1. Ne yapıldı

1. **`src/lib/secret-token.ts`** (yeni) şu fonksiyonları içeriyor:
   - `issueSecretToken()`: 32 bayt rastgele değer üretir, 64 karakterlik hex ham token ile `sha256` hex'ini birlikte döner.
   - `hashSecretToken()`.
   - `secretTokenMatches(raw, storedHash)`: iki 32 baytlık özeti `crypto.timingSafeEqual` ile karşılaştırır.
2. **Şema:** `ApplicationPart.magicToken` sütunu `magicTokenHash` (nullable, unique) oldu. `Invitation.token` sütunu `tokenHash` (NOT NULL, unique) oldu. Yeniden adlandırmanın amacı, eski alanı kullanan her yerin tip hatası vermesiydi. Bu sayede tüm çağrı yerleri derleyici tarafından bulundu.
3. **Migration `prisma/migrations/hash-bearer-tokens.sql`** ve **`.down.sql`** eklendi. `apply-order.txt` listesinin sonuna yazıldı.
   - **Mevcut satırlar için karar: yerinde hash'le, geçersiz kılma.** `encode(sha256(convert_to(t,'UTF8')),'hex')` Node'daki `createHash('sha256').update(t,'utf8')` ile bayt bayt aynı sonucu veriyor. Bu yüzden daha önce gönderilmiş ortak ve beta davet linkleri çalışmaya devam ediyor.
   - Geçersiz kılmak güvenliği artırmazdı: bugünden önce bir token'ı kopyalayan kişi onu her iki durumda da elinde tutuyor. Bu durum için UI'da "Yeni bağlantı oluştur" düğmesi var. Geçersiz kılmanın tek sonucu beta ortaklarına giden linklerin bozulması olurdu.
   - Her adım mevcut sütunlara göre korumalı ve tek transaction içinde. `db push` ile kurulmuş (CI) veritabanında hiçbir şey yapmıyor. RLS politikalarına dokunulmadı.
   - **down.sql KAYIPLI:** hash'ten token geri üretilemez. Geri alınınca sütunlara hash yazılır ve verilmiş linklerin hepsi ölür. Bu yüzden yalnız kod geri almasıyla birlikte koşulmalı. Dosyanın başlığında bu yazıyor.
4. **M11 ortak portalı:**
   - `createApplicationPart` artık token üretmiyor.
   - Token isteğe bağlı üretiliyor: yeni `src/modules/m11/server/partner-link.ts` → `issuePartnerPortalLink(partId)`. Bu eylem kiracı kapsamında çalışır, yalnız PART_A için geçerlidir ve ham token'ı **bir kez** döner. Yeniden üretmek eski linki iptal eder.
   - Başvuru ekranı artık token'ı ya da hash'ini hiç almıyor, yalnız `hasPortalLink` bilgisini alıyor. Link yalnız üretildiği anda gösteriliyor ve "yalnız şimdi gösterilir" uyarısı var.
   - Portal sayfası (`generateMetadata` ve gövde) ile `addBudgetLineByToken` satırı hash ile buluyor, sonra `secretTokenMatches` ile tekrar kontrol ediyor. be-fb'nin pilot kapısı `fe021b59` commit'lendikten sonra onun üstüne kuruldu; çakışma olmadı.
5. **Davet API'si (`/api/invitations`):**
   - Yalnız `tokenHash` yazılıyor. Ham token yanıttan tek bir kez, `inviteLink` içinde çıkıyor.
   - Yanıttaki `invitation` nesnesi artık token veya hash taşımıyor. Önceden satırın tamamını, token dahil, geri döndürüyordu.
6. **`scripts/beta-onboarding.ts`:** Yeni davet hash olarak yazılıyor. Betik yeniden koşulduğunda daveti zaten olan ortak için e-postayı yeniden üretmiyor ve göndermiyor (`delivery: 'already-invited'`). Ham token artık saklanmadığı için bu kaçınılmazdı. Eski link çalışmaya devam ediyor.
7. `scripts/tenant-bypass-baseline.json`: portal girdisinin gerekçe metni güncellendi, sayılar aynı. İki test fixture'ı (`pilot-gates`, `public-sector-assignment`) yeni alan adlarına geçirildi.

## 2. Kanıt

### Migration (tek kullanımlık DB `fb_ts_hash`: eski şema + gerçek satırlar)
```
== up #1  exit=0     == up #2  exit=0   (NOTICE … already exists, skipping)
pa | PART_A | 0a07985e…647b9b   ← sha256('aaaa1111…') Node: 0a07985e…647b9b
i1 | 99244d1b…77ac7              ← sha256('inv-raw-hex-token-1') Node: 99244d1b…77ac7
i2 | 499cc1cf…b39ab              ← base64url eski token da doğru
diff (up sonrası) vs yeni schema.prisma: (no ApplicationPart/Invitation drift)
down#1 exit=0  down#2 exit=0 ;  diff (down sonrası) vs ESKİ şema: (no drift)
fresh push-DB (yeni şema) → up#1 exit=0, up#2 exit=0, çift index yok (pg_indexes: yalnız *_Hash_key)
```
### Paylaşılan yerel DB (`fabrika`)
```
apply exit=0, rerun exit=0
RLS identical before/after  (ENABLE+FORCE, tenant_isolation + system_scope, iki tabloda da)
invitations hashed correctly: 6/6 ; legacy part hash ok: True ; düz sütun kalmadı: 0
```
### Testler
- `src/lib/secret-token.test.ts` (5 test): bilinen SHA-256 vektörü, Postgres ile eşitlik, yanlış token / hash'in kendisi / boş / bozuk değer reddi, `timingSafeEqual`'ın 32+32 baytla çağrıldığı.
- `tests/modules/m11.test.ts` (+2 test, toplam 14): `issuePartnerPortalLink` yalnız hash yazıyor, where koşulu `{id, tenantId, part:'PART_A'}`, yeniden üretim eski hash'i değiştiriyor, PART_B / başka kiracı / oturumsuz istek reddediliyor.
- `tests/bearer-token-hash.live.test.ts` (3 test, gerçek DB):
  - Davet rotası hash yazıyor ve satırı yanıtta geri göstermiyor. Yeniden gönderimde yeni hash yazılıyor, eski link ölüyor.
  - Portal linkiyle yazma başarılı. **Saklanan hash token olarak kullanılınca** ve **rotasyonla iptal edilmiş eski link** kullanılınca `success:false` dönüyor ve hiçbir şey yazılmıyor.
  - Postgres `sha256()` ile Node sonucu eşit.
- **Mutasyon kanıtı (5/5 öldü):**
  ```
  actions.ts lookup ham token ile          → × portal link testi
  invitations update: tokenHash: token     → × davet testi   (ilk koşuda HAYATTA kaldı → teste yeniden-gönderim hash kontrolü eklendi, sonra öldü)
  invitations create: tokenHash: token     → × davet testi
  secretTokenMatches '===' ile             → × timingSafeEqual testi
  partner-link data: magicTokenHash: raw   → × 2 test (unit + live)
  mutasyonsuz: Tests 22 passed (22)
  ```

### Kapılar (commit'lerim, izole worktree @ce2e7432)
| Kapı | Sonuç |
|---|---|
| typecheck | exit 0 (paylaşılan ağaçtaki tek hata o anda komşunun izlenmeyen `tests/cordis-csv.test.ts`'iydi, sonra commit'lendi) |
| lint | exit 0 |
| rls:check | exit 0 (47 model, 4b ✅) |
| rls:bypass-check | **exit 1, sebebi benim değişikliğim değil.** Tek yeni girdi `src/lib/billing/pilot.ts:292` `withSystemScope('platform-admin','pilot.listPilots')`. Aynı hata benim commit'imden ÖNCEKİ `587a50e0~1` (be-fb `fe021b59`) üzerinde de var. Benim çağrı yerlerim değişmedi: tenant-discovery 6 (5 dosya). |
| `set -a; source .env; set +a; pnpm test` | **212 dosya geçti, 2 atlandı · 2422 test geçti, 8 atlandı, 0 kırmızı.** Atlanan 8 testin hepsi dış ağ adaptör testi (`adapters`, `k1-daily-calls`, `sedia-adapter`). İkinci bir koşuda yük altında 2 tarama testi 5 sn zaman aşımına düştü (`invoice-writer` decomposeGrossAmount, `withholding-rounding`). Bunlar fatura matematiği testleri, benim değişikliğimle ilgisi yok. |

### Gerçek tarayıcı (AgentSpace iç tarayıcısı; izole `next dev` :3107, worktree @ce2e7432, gerçek giriş formu)
Kareler: `docs/agent-results/TASK-MULQLL2T8ZJX4-devop-fb/`
1. `01`: Part A kartında "Henüz bağlantı oluşturulmadı" yazıyor, düğme "Bağlantı oluştur".
2. `02`: Düğmeye tıklandı. Link bir kez gösterildi, altında "yalnız şimdi gösterilir" uyarısı var.
   DB: `6728bd0f…bb37ef` = sha256(link token). Ham token'ı tutan satır sayısı **0**.
3. `03`: Ortak portalı linkle açıldı, "Tarayıcı Kanıt Ortağı / 7 PM" gönderildi. **Mutasyon** DB'ye yazıldı: `[{"partnerName":"Tarayıcı Kanıt Ortağı","personMonths":7,"requestedTotal":48125,…}]`. Sayfa yenilenince tabloda €48.125 görünüyor.
4. `04`: DB'deki hash URL'ye token olarak konunca **404** döndü (sızmış DB senaryosu).
5. **Geçişten önce verilmiş gerçek link** (`crwfb-part-mumi0mfa`, migration öncesi düz token) geçişten sonra **200** döndü. Yerinde hash'leme kararı böylece doğrulandı.
6. `05`: Sayfa yenilendikten sonra link yeniden gösterilmiyor. Ekranda "daha önce oluşturuldu… yeni bağlantı oluşturursanız eskisi çalışmaz" yazıyor.
7. `06`: "Yeni bağlantı oluştur" tıklandı. **Eski link 404, yeni link 200** döndü. DB'deki `a1565a24…` = sha256(yeni token).
8. `07`: Ekip → Davet: `davetli-kanit@example.test` için link üretildi. DB'deki `tokenHash 29a4d841…` = sha256(link token). Ham token'ı tutan satır **0**.

Test kiracısı (`tokhash-e2e-*`) sonunda silindi. Kendi :3107 sunucum durduruldu, worktree kaldırıldı.

## 3. Değişen dosyalar
`src/lib/secret-token.ts` (yeni), `src/lib/secret-token.test.ts` (yeni), `src/modules/m11/server/partner-link.ts` (yeni), `src/modules/m11/server/actions.ts`, `src/app/[locale]/portal/partner/[token]/page.tsx`, `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/{client,page}.tsx`, `src/app/api/invitations/route.ts`, `src/types/db-rows.ts`, `prisma/schema.prisma`, `prisma/migrations/hash-bearer-tokens{,.down}.sql`, `prisma/migrations/apply-order.txt`, `scripts/beta-onboarding.ts`, `scripts/tenant-bypass-baseline.json`, `tests/modules/m11.test.ts`, `tests/bearer-token-hash.live.test.ts` (yeni), `src/lib/billing/{pilot-gates,public-sector-assignment}.test.ts`.

## 4. Riskler
- **Paylaşılan :3000 dev sunucusu yeniden başlatılmalı.** Sunucu (pid 34537, cwd FONBRIDGE, başka bir ajanın) Prisma istemcisini migration'dan önce yüklemişti. Başvuru sayfası orada şu hatayı veriyor: `The column ApplicationPart.magicToken does not exist`. Sunucu benim olmadığı için ben kapatmadım. Kim sahibiyse `pnpm db:generate` + yeniden başlatma yeterli.
- **Üretime geçiş sırası:** Mevcut bir DB'de migration **`db push`'tan ÖNCE** koşulmalı. Aksi halde `db push` eski sütunu siler ve veri kaybı olur, ardından NOT NULL `tokenHash` eklenirken dolu tabloda hata verir. CI'da DB boş olduğu için sorun yok. `RELEASE_CHECKLIST`'e not düşülmesi önerilir.
- down.sql kayıplı (yukarıda anlatıldı).
- Beta betiği yeniden koşulduğunda mevcut davet e-postasını yeniden üretemiyor. Bu bilinçli bir tercih. Yeni link gerekirse daveti silip betiği yeniden koşmak gerekir.

## 5. Açık sorular / kapsam dışı gözlemler
- **`/accept-invite` sayfası YOK** (`/tr/accept-invite?token=…` 404 veriyor). Beta e-postasındaki `/invite/<token>` de aynı durumda. Bu önceden biliniyordu (crw-fb K-7). Davet token'ını tüketen bir kod henüz yok. Kabul akışı yazılırken satır `tokenHash: hashSecretToken(raw)` ile bulunup `secretTokenMatches` ve `expires` kontrolünden geçirilmeli. Canlı test bu arama şeklini zaten doğruluyor.
- UI'da ortak portalı için ayrı bir "iptal et" düğmesi yok. Şu an yeniden üretmek eski linki iptal ediyor.
- Başvuru ekranındaki "Toplam Bütçe" değeri `toLocaleString()`'i locale vermeden çağırıyor. Sunucu 48,125, istemci 48.125 üretiyor ve hydration uyarısı çıkıyor. Bu hata önceden vardı, bütçe satırı olunca görünür hale geliyor. Ayrı kart açılması önerilir.
- Portal sayfası `generateMetadata` içinde token'ı canonical ve og:url'e yazıyor, sayfada `noindex` yok. Token zaten URL'de olduğu için yeni bir sızıntı değil ama sertleştirme adayı.

## 6. Account OAuth token'ları ve Session: karar notu (1-3-1, KOD DEĞİŞTİRİLMEDİ, karar Patron'un)

**Sorun:** NextAuth Prisma adapter'ı Google/Microsoft girişinde `Account.access_token`, `refresh_token` ve `id_token`'ı düz metin yazıyor. DB sızarsa kullanıcıların sağlayıcı hesaplarına (ör. Google) API erişimi sızar.
**Ölçülen gerçekler:**
- `src/**` içinde bu alanları **okuyan hiçbir kod yok**. Tek referans `export-data.ts:88` ve orada bu alanlar zaten dışarıda bırakılıyor.
- Oturum stratejisi zaten `session: { strategy: "jwt" }` (`src/lib/auth.ts:276`). Yerel DB'de `Session` tablosu **0 satır**, `Session.sessionToken` pratikte kullanılmıyor.
- Takvim için ayrı token'lar var (`CalendarConnection`) ve bunlar `fkenc1:` AES-256-GCM zarfıyla saklanıyor. DB kapısı da düz metni reddediyor.

**Seçenekler:**
- **A: Sakla-ma.** Adapter'ın `linkAccount` sarmalayıcısında `access_token`, `refresh_token` ve `id_token` alanlarını `null`'a çevir. Tek seferlik bir migration ile mevcut satırları NULL'la. Ayrıca `rls`/db kapısına "Account token'ları null olmalı" kuralı ekle.
  - Artı: Sır tamamen yok oluyor. Okuyan kod olmadığı için davranış değişmiyor. İş ~yarım gün.
  - Eksi: İleride Google/Microsoft API'si (ör. Drive) gerekirse token yeniden istenmeli. Takvim zaten ayrı bir akış kullanıyor.
- **B: AES-GCM zarfı.** `CALENDAR_ENCRYPTION_KEY` desenini (`fkenc1:`) kullan: `linkAccount`'ta şifrele, okurken çöz, DB kapısında `assertEnvelopedOrNull` uygula.
  - Artı: Token'lar ileride kullanılabilir kalır. Desen repoda zaten var.
  - Eksi: Okuyan kod olmadığı halde anahtar yönetimi, rotasyon ve yedekte anahtar gibi yükler geliyor. Anahtar ile DB birlikte sızarsa koruma olmuyor. ~1 gün.
- **C: Olduğu gibi bırak, yalnız belgele.** Session için ayrıca: JWT zaten kullanılıyor, `Session` tablosu boş, işlem gerekmez.
  - Artı: Sıfır iş.
  - Eksi: Düz metin OAuth sırrı DB'de kalıyor, açık karar #12 kapanmıyor.

**Öneri: A** (Session için değişiklik gerekmez, zaten JWT). Gerekçe: okuyan kod olmadığı sürece saklanan her sır saf risk. Sağlayıcı API'si gerçekten gerektiğinde, o gün B'ye (repodaki hazır zarf deseni) geçilir.

## 7. Sonraki adım
- Paylaşılan :3000 sunucusunun sahibi `pnpm db:generate` çalıştırıp sunucuyu yeniden başlatmalı.
- Patron A/B/C kararını vermeli, sonra kart açılmalı.
- `/accept-invite` kabul akışı (K-7) yazılırken `secretTokenMatches` kullanılmalı.
- 1 Ekim push'unda (TASK-MUMACETT8NSI4) CI'da migration iki kez koşup idempotentliği doğrulayacak.
- `rls:bypass-check` kırmızısı `pilot.ts:292` için be-fb'nin (TASK-MUMABL78X5JLX) baseline girdisi eklemesi gerekiyor.
