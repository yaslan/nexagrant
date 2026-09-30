# TASK-MUO12MFIF9HO6 — FB İNCELEME-81 (cs-fb): davet kabulünde kiracıya yeniden bağlama + /no-workspace + jwt yeniden deneme

**Durum:** TAMAM · **Ajan:** cs-fb · **Tarih:** 30.09.2026
**İncelenen:** `113ca7e1` (kod), dev merge `2b0bbae8` (TASK-MUNWZA26VGK0B, be-fb). Kaynak: `docs/agent-results/TASK-MUNWZA26VGK0B-be-fb.md`, `docs/agent-results/TASK-MUNT2439LF7AP-crw-fb.md`, `src/lib/auth.ts`.
**Ortam:** Ayrı worktree (detached `2b0bbae8`, kendi `pnpm install`). İzole Postgres `csfb81-pg` (127.0.0.1:5481, pgvector:pg16). Paylaşılan `fabrika` :5433 yalnız bir kez `pg_dump` ile **okundu**, yazılmadı. Worktree `.env`'inde `grep -c 5433` → 0. Dev sunucusu `:3481`, Chrome (`@playwright/test`, `channel: 'chrome'`). **Kod değiştirilmedi.** Mutantlar ve ölçüm sondaları geri alındı (`git status --short src` boş).

## Karar: ONAY

Engelleyici bulgu yok. İstemciden gelen `session.update` üye olunmayan kiracıya bağlamıyor. Bozuk, süresi dolmuş, iptal edilmiş ya da başkasına ait davet token'ı oturumu taşımıyor. İki sekmeden aynı davet tek üyelik ve tek audit satırı yazıyor. Davet dışındaki yollarda sessiz kiracı geçişi yok. /no-workspace hiçbir kiracı ya da kullanıcı bilgisi sızdırmıyor. DB kalıcı kapalıyken sonuç fail-closed. Bir orta bulgu (O-1) var, ama bu diff'ten önce de vardı. Ayrı bir kartla kapatılmasını öneriyorum. Diğerleri test boşluğu ve gözlem (Ö-1…Ö-5).

## 1. Ne yapıldı
1. Diff'i (`auth.ts` jwt/`requestedTenantOf`/`retryOnceIfNotConnected`, `actions.ts`, `dashboard/page.tsx`), Auth.js'in update yolunu (`@auth/core` 0.41.3 `lib/index.js:55-59`: POST `/api/auth/session` CSRF kontrollü, `body.data` → `trigger:"update"`) ve davet kabul çekirdeğini (`src/lib/invitations/accept.ts`) okudum.
2. Canlı saldırılar (gerçek HTTP ve Chrome): 10 `session.update` denemesi, 5 bozuk davet, iki sekmeden eşzamanlı kabul, /no-workspace sızıntısı ve açık yönlendirme denemesi, çıkış yapıp yeniden giriş.
3. DB kalıcı kapalı: `docker stop` (bağlantı reddi) ve `docker pause` (bağlantı hiç kurulmuyor, 1 sn zaman aşımı). Yeniden denemenin maliyetini ölçmek için gerçek kodu yeniden denemesiz mutantla karşılaştırdım, deneme süreleri işaretleyici logla ölçüldü.
4. Kendi 11 mutantım (be-fb'nin 12'sinden farklı), 4 test dosyası, 51 test.
5. Kapılar: tsc, lint, i18n, tam vitest, build.

## 2. Kanıt

### A. İstemciden `session.update` (`ekler/attack-out.txt`)
Kullanıcı u: A'da TENANT_OWNER (en eski), B'de MEMBER, **silinmiş** D'de TENANT_OWNER. X (başkasının) ve C'de üye değil.
```
[0]  signed in                                  : cf81-a TENANT_OWNER
[A1] update {tenantId: cf81-x} (not member)     : 200 cf81-a TENANT_OWNER | next GET cf81-a   ← bağ yerinde
[A2] update {tenantId: cf81-c} (not yet member) : 200 cf81-a TENANT_OWNER
[A3] update w/o csrf {tenantId: cf81-b}         : 400                     | next GET cf81-a   ← CSRF'siz reddedildi
[A4] {tenantId: {in:[cf81-x]}} (Prisma nesnesi) : 200 cf81-a              ← nesne enjeksiyonu yok
[A5] {tenantId: [cf81-x,cf81-b]} (dizi)         : 200 cf81-a
[A6] {tenantId: " cf81-x"} (boşluklu)           : 200 cf81-a
[A7] {tenantId:x, role:TENANT_OWNER, isPlatformAdmin:true, boundTenantId:x} : 200 cf81-a TENANT_OWNER ← ek claim'ler yok sayıldı
[A8] update {tenantId: cf81-b} (üye, MEMBER)    : 200 cf81-b MEMBER       ← yalnız üyesi olduğu kiracı, DB'deki rolüyle
[A9] update {tenantId: cf81-d} (üye, SİLİNMİŞ)  : 200 cf81-d TENANT_OWNER ← O-1
[A10] update {tenantId: cf81-a} (daha ESKİ üyelik) : 200 cf81-a TENANT_OWNER
[S1] A'dan çıkarıldı, düz GET ×3                : null null ×3            ← B'ye sessiz geçiş yok
```
Oturum JSON'unun anahtarları her adımda `user, expires, tenantId, role, workspaceIds, isPlatformAdmin`. `boundTenantId` dışarı sızmıyor.

### B. Oturumu taşımaması gereken davet token'ları (Chrome, `ekler/attack-out.txt`)
| Deneme | Ekran | Oturum sonrası |
|---|---|---|
| B1 başkasının token'ı (victim@, X) | "Bu davet başka bir e-posta adresine gönderildi … c\*\*\*@fabrika.test" (maskeli), kabul düğmesi yok (`shot-B1-other-token.png`) | null (değişmedi) |
| B2 süresi dolmuş (X) | "Davetin süresi doldu" | null |
| B3 iptal (kiracı D silinmiş) | "Davet iptal edildi" | null |
| B4 başkası kullanmış, üye değil (Y) | "Bu davet zaten kullanıldı" | null |
| B5 bilinmeyen token | "Davet bağlantısı geçersiz" | null |

DB: u'nun üyelikleri denemelerden sonra `cf81-b:MEMBER, cf81-d:TENANT_OWNER`. Yeni üyelik yazılmadı.

### C. /no-workspace (`ekler/attack-out.txt`, `attack-out-b.txt`)
```
[C1] tenantless /tr/default/dashboard -> 200 /tr/no-workspace
     leaks? A name: false B name: false email: false user name: false tenant ids: false   (sayfa HTML'inin tamamı tarandı)
[C2] tenantless /en/default/dashboard -> 200 /en/no-workspace (EN metin)
[C3] /%2F%2Fevil.example/default/dashboard -> 404 · /%5C%5Cevil.example/... -> 404 · /xx/... -> 307 /en/xx/...  ← locale'den açık yönlendirme yok
[C5] C'ye bağlı, C'den çıkarıldı (B duruyor): dashboard -> /tr/no-workspace
[C6] "Tekrar giriş yap" -> /tr/giris (oturum hâlâ kiracısız), form görünür
[C7] formdan yeniden giriş -> /tr/default/dashboard | cf81-b MEMBER
```
Kareler: `shot-C1-no-workspace.png`, `shot-C6-giris-while-signed-in.png`, `shot-C7-after-resignin.png`. (`shot-C4-…png` ilk denememden kalma: dev derlemesi bitmeden çekildi, üzerinde "Rendering…" yazıyor. Bulgu değil, C6/C7 aynı adımı doğru beklemeyle tekrarlıyor.)

### D. Aynı davet, iki sekme, eşzamanlı tıklama
```
[D1] tab1 -> /tr/default/dashboard   [D2] tab2 -> /tr/default/dashboard
[D3] session cf81-c PIPELINE_MANAGER
[D4] DB: memberships C = 1 · audit invitation.accepted = 1 · acceptedAt set = t
[E1] sign-out -> {} · [E2] yeniden giriş -> cf81-b MEMBER (en eski canlı üyelik)
```

### E. DB kalıcı kapalı (`ekler/dbdown-out.txt`, `pause-*.txt`)
```
[S1-3] docker stop (bağlantı reddi): 200, 0.03–0.05 sn, tenant=None role=None admin=False   ← fail-closed, yeniden deneme yok
[S4]   20 paralel: max 0.52 sn
[S5]   dashboard -> 307 /tr/no-workspace
[P1-3] docker pause (bağlantı zaman aşımı): 200, 2.06–2.08 sn, tenant=None role=None admin=False
[P5]   unpause -> cf81-b MEMBER (kendiliğinden düzeldi)
```
Deneme süreleri (işaretleyici logla, `pause-probe.txt`): `attempt1 failed after 1008ms` → `attempt2 failed after 1007ms`. 41 isteğin 41'inde ikinci deneme de başarısız oldu, sonuç fail-closed.

| DB dondurulmuş | tek istek | 20 paralel medyan | 20 paralel maks |
|---|---|---|---|
| yeniden denemesiz mutant (`pause-noretry.txt`) | 1.05 sn | 3.25 / 3.67 sn | 4.07 / 4.23 sn |
| gerçek kod (`pause-retry.txt`, `pause-probe.txt`) | 2.08–2.10 sn | 3.83 / 4.71 / 4.48 / 6.47 sn | 4.33 / 5.29 / 5.02 / 7.84 sn |

### F. Mutantlar (`ekler/mutants81.py.txt`, `ekler/mutants81-out.txt`; 4 dosya, 51 test)
| Mutant | Sonuç |
|---|---|
| N1 `requestedTenantOf` String() zorlaması (7→"7", dizi→"a,b") | 1 kırmızı ✅ |
| N2 yeniden deneme regex'i `/timeout/i` (statement timeout da yeniden denenir) | **yaşadı** → Ö-2 |
| N3 sınırsız yeniden deneme (özyineleme) | 1 kırmızı ✅ |
| N4 kabulde `unstable_update` hatası yakalanmıyor | **yaşadı** → Ö-3 |
| N5 dashboard yönlendirmesinde locale yok | 1 kırmızı ✅ |
| N6 oturum `boundTenantId`'ye düşüyor (çıkarılan üye kiracıyı korur) | 3 kırmızı ✅ |
| N7 istenen yerine en yeni satır (`memberships.at(-1)`) | **yaşadı** → Ö-1 |
| N8 ikinci başarısızlık yutuluyor (null, log yok) | **yaşadı** → Ö-4 |
| N9 kabul, oturumun eski kiracısına yeniden bağlar | 1 kırmızı ✅ |
| N10 `trigger !== undefined` ile istek okunur | yaşadı, **eşdeğer**: Auth.js `session`'ı yalnız update'te geçiriyor |
| N11 oturum `boundTenantId` claim'ini açığa verir | **yaşadı** → Ö-4 |

Geri yüklemeden sonra: `Tests 51 passed (51)`, `src restored clean`. Güvenlik açısından ağır mutantlar (N1, N3, N6, N9) ve be-fb'nin R1–R7'si kırmızı. Yaşayanların hiçbiri yetki vermiyor.

### G. Kapılar (`ekler/gates.txt`, `ekler/vitest-summary.txt`; ağaç `2b0bbae8`)
```
npx tsc --noEmit                → exit 0
pnpm lint                       → exit 0
npx tsx scripts/i18n-check.ts   → exit 0
npx vitest run (tam)            → Test Files 278 passed | 6 skipped (284) · Tests 3359 passed | 81 skipped (3440) · exit 0
pnpm build                      → exit 0
```
`gates.txt`'teki ilk `vitest exit=1` benim ortam hatam (54 kırmızı, `DriverAdapterError: ColumnNotFound`, `Membership.staleDigestOn`). Paylaşılan DB'nin dökümü, `apply-order.txt`'teki elle yazılmış SQL migration'larının gerisinde. CI'daki hazırlık adımlarını izole DB'ye uyguladım (`prisma db push` → "already in sync", `db:rls-role`, `scripts/apply-migrations.sh` ×2 → "40 files applied", `db:rls`). Sonra tam koşu yeşil oldu: sayılar be-fb ile aynı, 3359/81. Yan not: paylaşılan `fabrika` :5433'te de `staleDigestOn` yok. Oraya yazmadım, bu kartın konusu değil.

## 3. Bulgular

**O-1 (orta, bu diff'ten önce de vardı, bu diff kapsamı biraz genişletiyor): jwt üyelik okuması `Tenant.deletedAt`'e bakmıyor.**
- Canlı [A9]: silinmiş D'de üyeliği olan kullanıcı `POST /api/auth/session {tenantId:"cf81-d"}` ile D'ye bağlanıyor (TENANT_OWNER). Panel D'nin çalışma alanını açıyor (`shot-A9b-deleted-tenant-dashboard.png`).
- Diff'ten önce de var ([P1], `attack-out-b.txt`): D en eski üyelikse düz giriş de D'ye bağlıyor. Yeni olan, kullanıcının bunu artık istediği an seçebilmesi.
- Tutarsızlık: davet yolu silinmiş kiracıyı `revoked` sayıp reddediyor ([B3]), oturum yolu reddetmiyor.
- Olasılık düşük: uygulamada `Tenant.deletedAt` yazan bir kod yolu bulamadım (`grep tenant.update` → yalnız province/kind/cobrand güncellemeleri). Silme bugün yalnız operasyon ya da elle yapılıyor.
- Öneri (ayrı kart, be-fb): jwt'nin membership `where`'ine `tenant: { deletedAt: null }` eklensin. Bu hem girişi hem yeniden bağlamayı kapatır. Testi de olsun: silinmiş kiracının hem en eski üyelik hem update isteği olduğu durum.

**Ö-1 (test boşluğu): istenen üyeliğin bağlı olandan daha ESKİ olduğu durum testte yok.** N7 (`at(-1)`) yaşadı, çünkü testlerde istenen satır hep daha yeni. Gerçek kod doğru çalışıyor: canlı [A10], B'ye bağlıyken daha eski A'ya geçiyor. Ama bunu hiçbir test sabitlemiyor. Birim teste bir satır yeter: satırlar `[istenen(eski), bağlı(yeni)]` sırasında dönsün.

**Ö-2 (test boşluğu): yeniden deneme regex'inin darlığı sabitlenmemiş.** `/timeout/i` mutantı (N2) yaşadı. "Başka hata yeniden denenmez" testi yalnız `relation "User" does not exist` kullanıyor. `canceling statement due to statement timeout` gibi bir sorgu zaman aşımı da reddedilmesi gereken örneklere eklensin, çünkü yük altında sorgu yeniden denemek yükü ikiye katlar.

**Ö-3 (test boşluğu, düşük): kabulden sonra `unstable_update` hatası testsiz.** N4 yaşadı. Yeniden bağlama çağrısı hata fırlatırsa, üyelik yazılmış olsa bile kullanıcı hata sayfası görür. Bir birim testte `unstable_update` hata fırlatsın, sonuç yine `/tr/default/dashboard` yönlendirmesi olsun.

**Ö-4 (düşük): oturumun şekli ve ikinci başarısızlığın logu sabitlenmemiş.** N11 (`boundTenantId` oturuma sızar) ve N8 (ikinci hata yutulur, uyarı logu yok) yaşadı. N11 kullanıcıya yalnız kendi eski kiracısının id'sini gösterir, yetki vermez. Oturum anahtarlarını tam liste olarak doğrulayan bir assert ikisini birden kapatır.

**Ö-5 (gözlem): DB çöktüğünde yeniden denemenin maliyeti ve boş hata logu.**
- DB tamamen kapalıyken (bağlantı reddi) yeniden deneme devreye girmiyor. Her istek 30–50 ms'de fail-closed dönüyor.
- DB dondurulmuşken (bağlantı kurulamıyor) tek istek 1,05 sn yerine 2,1 sn sürüyor. Bu be-fb'nin "en fazla +1 sn" iddiasıyla uyumlu.
- 20 paralel istekte medyan 3,3–3,7 sn'den 3,8–6,5 sn'ye çıkıyor (koşudan koşuya oynuyor). Nedeni havuzda ikinci bağlantı denemelerinin sıraya girmesi. Sonuç yine fail-closed, DB açılınca kendiliğinden düzeliyor ([P5]). Kabul edilebilir.
- Önceden de var olan log boşluğu: bağlantı reddinde `[Auth.jwt] membership lookup failed, session stays tenantless: ` satırı **boş sebeple** yazılıyor (dev.log'da 25 satır). pg'nin `AggregateError`'ının `message` alanı boş. `errorMessage()` bu durumda `code` alanını (`ECONNREFUSED`) da yazabilir. Ayrı ve küçük bir iş.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUO12MFIF9HO6-cs-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUO12MFIF9HO6-cs-fb-ekler/`: çıktılar (`attack-out*.txt`, `dbdown-out.txt`, `pause-*.txt`, `mutants81-out.txt`, `gates.txt`, `vitest-summary.txt`), betikler (`*.txt`) ve 11 kare. Ham davet token'ı yok (`grep -E '[0-9a-f]{64}'` → boş).
- Kod: **yok**.

## 5. Riskler
- O-1 açık kalırsa, ileride kiracı silme bir özellik olarak eklendiğinde silinmiş kiracının verisine hem girişle hem yeniden bağlamayla erişilir.
- Doğrulama yalnız dev sunucusunda (`next dev`) yapıldı. `pnpm build` geçti ama prod sunucusunda canlı koşulmadı. Jwt ve server action yolu ikisinde de aynı kod.
- Ö-5'teki ölçümler, bu makinenin yüküne bağlı ve gürültülü.

## 6. Açık sorular
- O-1 için ayrı bir kart açılsın mı? Önerim evet, be-fb'ye, küçük bir kart: tek `where` koşulu ve 2 test.
- Ö-1, Ö-2, Ö-3 ve Ö-4 aynı karta test borcu olarak eklenebilir.

## 7. Sonraki adım
- Lider: O-1 (+Ö-1…Ö-4 test borcu) için takip kartı.
- `113ca7e1` / `2b0bbae8` dev'de kalabilir. Push yok.

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, arm64, Chrome). İncelenen kod platforma bağlı değil: jwt callback, server action, sayfa yönlendirmesi ve pg hata mesajı eşleşmesi süreç, dosya yolu, kabuk ya da ekran kullanmıyor. Bu yüzden Windows ve Linux'ta davranış koddan bakınca aynı olur. Yeniden deneme regex'i pg/pg-pool mesaj metnine bağlı, bu metin işletim sistemine göre değişmiyor. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var. CI (ubuntu) aynı vitest takımını koşuyor.
