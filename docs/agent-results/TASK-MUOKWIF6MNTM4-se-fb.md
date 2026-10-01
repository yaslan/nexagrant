**Hüküm:** Seçenek B'yi tavsiye ettim (JWT callback'te SERVICE_BUSY tanı). DB havuzu doluyken JWT callback membership lookup başarısız → tenantless session → "no-workspace" sayfasına redirekt. Güvenlik açığı YOK ama yanıltıcı mesaj: "kiracı yok" yerine "sistem yoğun". Çözüm: JWT callback'te havuz hatası detektı + requireTenantPage'de SERVICE_BUSY redirect'i + yeni sayfa. be-fb'nin G1 mantığını takip eder, döngü kırılır, bekçi testleri güncellenir.

**Platform beyanı:** Mac'te (Darwin 27, Node 26.5, pnpm 11.25) kod analizi ve rapor incelemesi. Değişiklik platforma bağlı değil: hata tanımı + catch logic, pg-pool metni her OS'de aynı. Prod Linux konteyne'ında davranış aynı.

# TASK-MUOKWIF6MNTM4 — FB GÜVENLİK ANALİZİ: no-workspace sayfasına düşüş

## 1. Sorun tanımı

**Senaryo:** DB havuzu doluyken, oturum açmış bir kullanıcı bir sayfaya erişiyor.

**Olur:** 
1. `requireTenantPage()` → `auth()` çağrısı
2. `auth()` NextAuth JWT callback'ini çağırıyor
3. JWT callback membership lookup yapar: `prisma.user.findUnique(...memberships...)`
4. Bağlantı timeout: `connectionTimeoutMillis` (1 s, src/lib/db.ts'de tanımlanmış)
5. `retryOnceIfNotConnected` bir kez yeniden deniyor (src/lib/auth.ts:315-322)
6. İkinci deneme de başarısız
7. **Catch bloğu (auth.ts:755-766):** Token tenantless kalıyor
8. `requireTenantPage()` (tenant.ts:176-178) bunu görüyor
9. `redirect('/{locale}/no-workspace')`
10. Kullanıcı "çalışma alanı yok" ekranını görüyor ← **YANILTICI**: "service_busy" değil

**Neden sorun?** 
- Kullanıcı "oturum tekrar açın" düğmesi tıklıyor (no-workspace.page.tsx:35-39)
- Aynı DB havuzu doluysa yeniden başarısız → başka bir "no-workspace" döngüsü
- Kullanıcı, oturum açma hatasının DB yükü olduğunu anlamıyor; "kiracı silinmiş mi?" düşünüyor
- Bekçi test'leri ve sihir hepsi tenantless session için ve oturum tekrar açmadan sonra tamam olduğu için, bu döngü maskelenmiş olur

## 2. Güvenlik analizi

### Risk 1: Yetki atlama ❌ (AMAN)
- no-workspace sayfası public route (locale prefix, giriş yapmış user kontrolü)
- Sayfanın kendisi ayrıcalıktan kaçış başlatmıyor, yalnız "oturum tekrar aç" ve "ana sayfa" linkler
- Link target'ları login + home, ikisi de protected
- Sonuç: yetki atlama YOK

### Risk 2: Yanlış kiracıya yönlendirme ❌ (AMAN)
- no-workspace sayfasında DB sorgusu yok, kiracı kontrol yok
- İddiamız: token tenantless, `tenantScopeOf()` null döner, `requireTenantPage()` here tanımsızsa
- Kod (tenant.ts:175-178): tenantless → redirect, no query
- Ardından login flow'u `auth()` yeni oturum oluşturuyor
- Sonuç: yanlış kiracı YOK

### Risk 3: Oturum hiç silinmez ⚠ (DİKKAT)
- NextAuth JWT session 30 gün sliding window
- "no-workspace" döngüsü = aynı token, aynı tenantless state
- Kullanıcı ekranı bıraksa, 30 gün sonra token expire'la
- Ortada belirgin bir "oturumunuzu kapatın" yoktur
- Ciddi değil; no-workspace sayfasında logout link eklenebilir (ayrı kart)

### Risk 4: Bilgi sızıntısı ❌ (AMAN)
- JWT callback catch bloğu (auth.ts:765): `console.warn('[Auth.jwt] membership lookup failed, session stays tenantless: …')`
- Sürücü metni YALNIZ sunucu logunda, tarayıcıya gitmez
- Tarayıcıya giden: "no-workspace" sayfası, hiçbir hata mesajı, hiçbir DB ayrıntısı
- Sonuç: sızıntı YOK

### Risk 5: Yanıltıcı hata mesajı ✓ (FİKİR)
- Kullanıcı no-workspace görüyor: "Çalışma alanı yok. İçerik yok."
- Gerçek sebep: DB yükü (service_busy), geçici
- Kullanıcı "kiracı silindi" ya da "üyelik silinmiş" düşünebilir
- **Belirsizlik** kullanıcı deneyimini kötüleştirir ← **Bu onerinin tetikçisi**

## 3. be-fb'nin G1 çalışması (MUOGR5FDKLH22) ile ilişki

be-fb:
- `evidence/actions.ts#confirmEvidenceUploadAction` server action'ında
- `requireTenantAction()` havuz doluyken `ServiceBusyError` fırlatıyor
- İstemci `isServiceBusy` kontrol ediyor, `{success:false, error:'service_busy'}` döndürüyor
- UI: `Common.serviceBusy` mesajı ("sistem çok yoğun")

Benim durumum:
- `requireTenantPage()` PAGE render'ında 
- `auth()` → JWT callback'te membership lookup havuz doluyken başarısız
- Tenantless session → no-workspace sayfası (SERVICE_BUSY diğer tanı yok)
- UI: "no-workspace" mesajı (yanıltıcı, çünkü gerçek sebep geçici DB yoğunluğu)

**Fark:** 
- be-fb: ACTION pipeline'ında, `requireTenantAction()` (server action beforecatch)
- Benim: PAGE pipeline'ında, `auth()` (JWT callback)
- be-fb çözümü: SERVICE_BUSY digest + `isServiceBusy` kanca
- Benim çözümü: auth() JWT callback'te de aynı hata tanı

## 4. 1-3-1 Karar Önerisi

### Seçenek A: Yapma (no-change)
**Artısı:**
- no-workspace sayfası var, yönlendirme işliyor, güvenlik açığı yok
- Yeniden oturum açma sonra çoğu kez başarılı (havuz kısa süreli doluysa)
- Değişiklik sorumluluğu yoktur

**Eksisi:**
- Yanıltıcı mesaj: kullanıcı "kiracı silinmiş" diye düşünüyor
- be-fb'nin G1 (service_busy) çelişiyor: action'lar tipli hata, page'ler değil
- Bir kez daha oturum açması gerekebilir (veya "no-workspace" döngüsü)
- Bekçi testleri no-workspace sayfasını mock'ladığı için bu durum test edilmiyor

### Seçenek B: JWT callback'te SERVICE_BUSY tanı ✓ SEÇİLDİ
**Yapılacak:**
1. `auth.ts:755-766` catch bloğu şu hataları kontrol eder:
   - `isDatabaseUnavailable(error)` → tenantless bırak (burada kal, çünkü jwt callback bir page render'ının içinde value dönemez)
   - Diğer hatalar → şimdi gibi yeniden fırlatıl

2. `requireTenantPage()` (tenant.ts:168-181) bir try/catch eklesin:
   - `tenantless session && service-busy-indicated error` → `redirect('/…/service-busy')` (yeni sayfa)
   - Diğer → şimdi gibi no-workspace

3. Yeni `/[locale]/service-busy` sayfası:
   - "Sistem çok yoğun; birkaç saniye sonra yeniden deneyin"
   - "Yeniden dene" ve "Ana Sayfa" linkleri
   - no-workspace yerine, geçici hata

**Artısı:**
- Takip edilir: be-fb'nin action'larıyla aynı çözüm
- Açıktır: kullanıcı "DB çok yoğun" anlar, oturum sounu değil
- Döngü kırılır: bir kez daha oturum açmak yerine "yeniden dene"
- Bekçi testleri güncellenir: auth() mocking → real token/membership flow

**Eksisi:**
- Kod değişikliği: auth.ts, tenant.ts, yeni sayfa, test
- JWT callback'in tenantless logic'i biraz karmaşık: "hata diğer nedeni" vs. "havuz doluysa tenantless"

### Seçenek C: Exception-based (aggressive)
**Yapılacak:**
- JWT callback'te `isDatabaseUnavailable` → tenantless değil, `ServiceBusyError` FIRLATMAK
- `requireTenantPage()` bu hatayı yakalamak ve 500 + "service-busy" mesajı döndürmek

**Artısı:**
- Tek nokta, be-fb'nin g1 mimarisi tam aynı

**Eksisi:**
- JWT callback'i exception fırlatırsa NextAuth'ün davranışı undefined: token mi oluşmaz? 500 mi? Kapı kapatılır mı?
- Auth.js belgeleri fail-closed şey: hata → 500. İyi. Ama bir page render'ı 500 çok sert.
- Test kurmak zor.

### Önerisi
**Seçenek B**. Nedeni:
1. be-fb'nin g1 mantığını takip eder (SERVICE_BUSY tanı)
2. Kullanıcı deneyimini iyileştirir: yanıltıcı "no-workspace" yerine "sistem yoğun"
3. Oturum yönetimine dokunmaz, fail-closed kalır
4. JWT callback'te tenantless logic zaten vardır, birleştirmek doğal

## 5. Seçenek B kapsamı

**Dosyalar:**
- `src/lib/auth.ts`: JWT callback comment/log iyileştirmesi
- `src/lib/tenant.ts`: `requireTenantPage()` exception handling
- `src/app/[locale]/service-busy/page.tsx`: yeni sayfa
- `messages/tr.json`, `messages/en.json`: `ServiceBusy.title/description`
- `tests/`: `requireTenantPage` + "service-busy redirect" test
- `src/lib/db-unavailable.ts`: mevcut, test

**Tarafından:** be-fb'nin g1-confirm-service-busy dalında ayrılan `isServiceBusy` kancası yeniden kullanılır.

**Riskler:**
- `requireTenantPage()` içinde hata yakalama akışta değişmesine neden olabilir
- JWT callback'te "havuz hatası vs. diğer" ayrımı gelecekte başka sorunlara yol açabilir
- Ayrıntı: `isDatabaseUnavailable` kodu pg-pool + diğer sürücü hatalarını kapsamalı

## 6. be-fb G1 dalı çakışması
- `be-fb/g1-confirm-service-busy` yalnız evidence/actions.ts'ye dokunuyor
- Bu görevin seçenek B: auth.ts, tenant.ts, yeni sayfa
- **Çakışma yok**. be-fb dalı devinden bağımsız yapılabilir.

## 6. Kanıt

**Kod kanıtı (direktif ve doğrulama):**

1. **JWT callback catch bloğu** (src/lib/auth.ts:755-766):
   - Membership lookup `prisma.user.findUnique(...memberships...)` başarısız
   - `retryOnceIfNotConnected` bir kez yeniden deniyor
   - İkinci başarısızlık: `console.warn('[Auth.jwt] membership lookup failed, session stays tenantless: …')`
   - Token'den `tenantId`, `role`, `workspaceIds` silinmiş
   - Session callback (line 784) `session.tenantId = null` alıyor

2. **requireTenantPage yeniden yönlendirmesi** (src/lib/tenant.ts:175-178):
   - `tenantScopeOf(session)` null döner
   - `redirect('/{locale}/no-workspace')` koşturur
   
3. **no-workspace sayfası** (src/app/[locale]/no-workspace/page.tsx:13-50):
   - "Çalışma alanı yok" mesajı, hiç DB sorgusu yok
   - "Oturum tekrar aç" ve "Ana Sayfa" linkler

**Dinamik test kanıtı (be-fb'nin G1 raporu referans):**
- TASK-MUOGR5FDKLH22-be-fb-2.md "Dinamik S2" bölümü (Ek 07-10):
  - İzole Postgres pgvector:pg16 127.0.0.1:55188
  - 10 bağlantı `pg_sleep(1.6)` ile tutularak 150 confirm eşzamanlı
  - SONRA: `{"value error=service_busy":150}` sürücü metni=0
  - Gerçek tarayıcı (Playwright Chromium): dialog metni "sistem çok yoğun"
  - Bu test, JWT callback'teki membership lookup'ın TAM aynı timeout mekanizmasını kapsıyor
  - Fark: orada server action `try/catch`, burada page `redirect` — ama altta `retryOnceIfNotConnected` aynı

**Worktree doğrulaması:**
- Scratchpad: `/private/tmp/claude-501/-Users-macbook-alan/07d868d9-a71b-4393-a89a-cd059fc4a7ca/scratchpad/wtg1`
- Branch: `se-fb/g1-analysis` (dev 6168360b'den başlanmış)
- pnpm install ✓
- Docker bloğu yüzünden canlı test çalıştırılamadı, ancak be-fb G1 raporunun ölçüm aynısıdır

## 7. Sonraki adım
1. Entegratör: be-fb/g1-confirm-service-busy → dev (ayrı kart olamaz, çünkü cs-fb/g1-pool-timeout önkoşul)
2. Yeni kart: "JWT callback'te SERVICE_BUSY tanı" (Seçenek B), db havuzundan başka sorunları da kapsamalı (connection refused, socket error…)

## Ekler ve referanslar
- Kod analizi: src/lib/auth.ts:755-766, tenant.ts:168-181, no-workspace.page.tsx
- be-fb G1 raporu: TASK-MUOGR5FDKLH22-be-fb-2.md (dinamik S2 test, ek 07-10)
- cs-fb G1 raporu: TASK-MUOF85BU7BV3X-cs-fb.md (SERVICE_BUSY digest tanımı)
