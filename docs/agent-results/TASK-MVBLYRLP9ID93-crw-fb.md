---
sözleşme: 3
görev: TASK-MVBLYRLP9ID93
kod: TASK-MVBLYRLP9ID93
ajan: crw-fb
motor: claude
tip: karar
okur: ekip
hüküm: Kısmen bitti: inceleme tamamlandı, hüküm Düzeltme gerekli. Sayaç ve lastSubmittedAt mantığı doğru, testler yeşil. Tek bloke eden bulgu M1: yeni ExpertPreRegAttempt tablosu RLS kapalı açılmış, oysa FO-45'ten (K-562266=A) beri ana tablo ve FO-50'deki kardeş tablo system_scope politikasıyla çalışıyor, migration yorumu da bunun tersini söylüyor.
platform: mac (darwin): diff okundu, vitest koşuldu, deneme-merge yapıldı. Windows ve Linux koşulmadı. Değişiklik yalnız DB, SQL ve TS sunucu mantığı; platforma bağlı kod yolu yok.
sürüm: 1
tarih: 2026-10-18T22:50:05.180Z
---

# FO-26 — PR #95 yeniden inceleme

**Kapsam:** `gh pr diff 95` (dev'e karşı gerçek fark), head `62f7353dbbbad4a38c68d1b2209e9196ca8b5f87`, worktree `.claude/worktrees/fo26-attempt-counter` (HEAD aynı, temiz). Kod değiştirilmedi, commit, push ya da merge yapılmadı.

## Hüküm: **Düzeltme gerekli** (bloke eden 1 bulgu: M1)

## Bulgular (önem sırasıyla)

### M1 — MAJOR (bloke eder): `ExpertPreRegAttempt` RLS kapalı, FO-45 ve FO-50 duruşuyla çelişiyor
- `prisma/migrations/add-expert-pre-reg-attempt.sql:14-16,36`: `DISABLE ROW LEVEL SECURITY`. Yorumda "*the same standing as ExpertPreRegistration and PublicLead*" yazıyor. Bu yanlış: FO-45'ten (K-562266=A) beri `ExpertPreRegistration` RLS açık ve tek `system_scope` politikasıyla çalışıyor (`prisma/rls.sql:330-340`, `scripts/rls-models.ts:66` `SYSTEM_SCOPE_POLICY`).
- `scripts/rls-models.ts:40-41` tabloyu yalnız `SYSTEM_WIDE`'a ekliyor, `SYSTEM_SCOPE_POLICY`'ye eklemiyor. `prisma/rls.sql:115` tabloyu "politikasız" döngüsüne koyuyor. `docs/DATA_MODEL.md` (ExpertPreRegAttempt maddesi) da "RLS **kapalı**" diyor.
- FO-50 (#92) bu ana tablonun kardeşi olan `ExpertFounderCounter`'ı (kişisel veri yok) "*RLS on with the system_scope policy only, like ExpertPreRegistration*" diye açıyor. Kişisel veriye daha yakın olan deneme tablosu (IP'nin HMAC'i, KVKK/GDPR'da takma adlı kişisel veri) ise kapalı kalıyor. Aynı modülde ters yönde iki karar var.
- **Senaryo:** uygulama rolü `fabrika_app` için `SELECT/INSERT/UPDATE/DELETE` yetkisi verilmiş ve RLS kapalı. Herhangi bir kiracı oturumundaki bir hata ya da bir enjeksiyon (`withSystemScopeOn` dışında) `ExpertPreRegAttempt`'i okuyabilir veya `deleteMany` ile boşaltabilir. Boşaltılırsa FO-26'nın KVKK korumasını sağlayan IP sayacı sıfırlanır. Ana tabloda bu yol DB seviyesinde kapalı.
- **Not:** Kart "RLS kapalı, PublicLead/ExpertPreRegistration deseni" diyor. Ama kart FO-45'ten önce yazıldı; o desen artık yok.
- **Düzeltme:** Tabloyu `SYSTEM_SCOPE_POLICY`'ye ekle. Migration'da `ENABLE` + `system_scope` politikası yaz (`expert-prereg-rls-mail-quota.sql` deseni). `rls.sql`'de politikasız döngüden çıkarıp ExpertPreRegistration bloğu gibi yaz. `rls-coverage.test.ts:390` beklentisini güncelle, DATA_MODEL'i düzelt. Bu değişiklik davranışı kırmaz: tüm erişim zaten `withSystemScopeOn(db, 'public-intake', …)` içinde (`register.ts:153,294`). Düzeltme istenmiyorsa en azından yanlış yorum ve DATA_MODEL "bilinçli istisna" olarak, gerekçesi ve lider onayıyla yazılmalı.

### m1 — MINOR (#92 ile birleştirme sırası): 4 dosyada metin çakışması + bir anlam etkileşimi
- Deneme-merge (scratch worktree, sonra silindi): `origin/dev` + #95 temiz birleşiyor. Üstüne #92 (`3d5825bd`) eklenince `docs/DATA_MODEL.md`, `prisma/schema.prisma` (yeni iki model aynı yere eklenmiş), `scripts/rls-models.ts` (aynı satır) ve `scripts/check-rls-live.ts` çakışıyor. `check-rls-live.ts` çakışması #92'nin kendisiyle dev arasında, #95 kaynaklı değil. `apply-order.txt` ve `rls.sql` otomatik birleşiyor. Çakışmalar mekanik, iki tarafı tutmak yeterli.
- Anlam etkileşimi: #92'nin 365 günlük saklama işi `createdAt < cutoff` ile siliyor (`retention.ts` `purgeableExpertPreRegWhere`). FO-26 ile `createdAt` yeniden kayıtta artık ilerlemiyor. Bu yüzden 364. günde bağlantısı yenilenen bekleyen bir satır, 24 saatlik bağlantısı hâlâ geçerliyken silinebilir. Saklama süresi ilk rıza zamanından sayıldığı için bu doğru tarafta kalan bir sonuç, kayıp yok, yalnız kullanıcı "geçersiz bağlantı" görür. Bloke etmez; #92 tarafında DATA_MODEL'e tek cümle not düşülmesi yeterli.

### m2 — MINOR (sayaç boşluğu): soğuma ve günlük kota 429'ları deneme saymıyor
- `register.ts:197-198`: bekleyen bir adres için soğuma içindeki ya da kota aşımındaki 429 deneme satırı yazmıyor (DATA_MODEL bunu bilerek belirtiyor).
- **Senaryo:** saldırgan, adresin "bekleyen ve soğumada" olduğunu IP penceresine takılmadan sınırsız kez öğrenebilir. Bilinmeyen bir adres ise ilk denemede satır açar ve sayılır, bu yüzden sızıntı yalnız bekleyen adreslerle sınırlı. Kartın hedefi (doğrulanmış adres sorgusu) kapanmış durumda.
- **Öneri:** kilitten sonra 201 dışında dönen her sonuç bir deneme yazsın. Ya da bu bilinçli istisna DATA_MODEL'de KVKK gerekçesiyle yazılsın.

### m3 — MINOR (test): cooldown testi `lastSubmittedAt`'i ayırt etmiyor
- `register.test.ts` "*lets the cooldown read lastSubmittedAt…*": sahte DB'de yeniden kayıttan sonra `verifyTokenExpiresAt − TTL` ile `lastSubmittedAt` aynı ana denk geliyor. Kod eski formülle kalsaydı test yine geçerdi.
- **Öneri:** `lastSubmittedAt` ile `verifyTokenExpiresAt − TTL`'nin farklı olduğu bir satır tohumla (ör. `lastSubmittedAt = now − 1 dk`, bağlantı 2 saat önce verilmiş) ve 429 bekle.

### m4 — MINOR (doküman): "Saklama: açık karar" maddesinin yeri
- `docs/DATA_MODEL.md`: yeni `ExpertPreRegAttempt` maddesinden hemen sonra "*Bu tabloda henüz bir saklama/silme işi yok*" geliyor. Okuyan kişi bunu deneme tablosu sanabilir, oysa deneme tablosunun 24 saatlik saklaması var. #92 de bu maddeyi değiştirecek. Birleştirmede "ExpertPreRegistration" diye açıkça yazılmalı.

### Doğrulanan, sorun yok
- **IP sayacı:** kilit altında `deleteMany(<24 saat)` → satır + deneme sayımı → `>=5` ise 429. 409 yolu, transaction commit olurken deneme yazıp dönüyor (throw yok, satır kalıcı). Yeni satır deneme yazmıyor, satırın kendisi sayılıyor; çift sayım yok. 6. deneme 429 birim testle kanıtlı.
- **lastSubmittedAt:** yeni satırda `createdAt = lastSubmittedAt = now`. Yeniden kayıtta yalnız `lastSubmittedAt` ilerliyor. Posta düşünce geri alma `ReissueState.lastSubmittedAt` ile önceki değere dönüyor. Eski satırlar (NULL) için `verifyTokenExpiresAt − TTL` geri dönüşü korunmuş. CSV başlığı ve satırı (`admin.ts`) ile live test başlığı güncel.
- **Migration:** idempotent (`IF NOT EXISTS`), down kayıpçı ve guard'lı, apply-order'da doğru yerde, GRANT var. Tenant tablosu değil, `withTenant` gerekmiyor.
- **i18n:** kullanıcıya görünen yeni metin yok, bu açıdan sorun yok.
- **Kapsam:** dosyalar kartın izin verdiği alanda (`src/lib/expert-prereg/**`, prisma, DATA_MODEL, testler, rls listeleri).

## Kanıt (ham)
```
gh pr view 95 → headRefOid 62f7353dbbbad4a38c68d1b2209e9196ca8b5f87, mergeable MERGEABLE, mergeStateStatus UNSTABLE
gh pr checks 95 → build-and-test/i18n-audit/lighthouse-a11y/rls-check: fail (1-2 s)
gh run list --branch dev → CI failure 49e6a817, 6fc9011a, 2a0aac00, ee9631dd   # dev de aynı: altyapı, PR'a özgü değil
vitest run src/lib/expert-prereg tests/rls-coverage.test.ts → Test Files 6 passed, Tests 102 passed
deneme-merge dev+#95 → temiz; +#92 (3d5825bd) → CONFLICT: docs/DATA_MODEL.md, prisma/schema.prisma, scripts/check-rls-live.ts, scripts/rls-models.ts
```
Not: be-fb raporundaki "CLEAN" durumu artık "UNSTABLE" görünüyor. Sebep, dev'de de kırmızı olan 1-2 saniyelik CI işleri (runner/billing); kod kaynaklı değil. Yerel gate (e2e 377/0) be-fb raporunda var, burada yeniden koşulmadı.

## Değişen dosyalar
- Yalnız bu rapor. Scratch deneme worktree'si silindi.

## Riskler
- M1 düzeltmesi `rls.sql` ve migration'a dokunuyor; #92 de aynı bloklara dokunuyor. Hangisi önce merge edilirse diğeri rebase gerektirir.

## Açık sorular
- M1 için lider kararı: deneme tablosu `system_scope`'a mı alınsın (önerim), yoksa gerekçesi yazılı bir istisna olarak RLS kapalı mı kalsın?

## Sonraki adım
- be-fb: M1'i düzeltsin (m3 ve m4 ucuz, birlikte yapılabilir). Sonra kısa bir delta incelemesi. Birleştirme sırası: #92 → #95 rebase (çakışmalar mekanik).
