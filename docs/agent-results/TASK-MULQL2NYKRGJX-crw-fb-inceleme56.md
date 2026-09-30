# TASK-MULQL2NYKRGJX — İNCELEME-56 (crw-fb): se-fb'nin K1 TopicMatch + M4 60 gün job'ları, İNCELEME-51 düzeltmesi

**Durum:** TAMAM
**Karar: DÜZELTME GEREKLİ.** Bloke eden tek bulgu B-1: dev'in test kapısı kırmızı, düzeltmesi tek satırlık. Çalışan kod davranışı gerçek worker ve gerçek cron ile doğru çıktı. İNCELEME-51'in B-1, B-2, Y-1 ve Y-2 bulguları kapandı. Yeni bir kenar durumu bulundu (Y-1): aynı gün ikinci özet hâlâ gidebiliyor.

İncelenen: `5e196e86`, `9229fef4`, `dca34806` (se-fb raporu `TASK-MULQL2NYKRGJX-se-fb-2.md`), dev HEAD `05cf050f`. Src dosyaları `362cbb82` ile aynı; aradaki fark yalnız leads.
Ortam: ayrı worktree (detached `05cf050f`) ve sıfırdan kurulmuş izole DB `crwfb_i56`. Kurulum `base.sql` + `scripts/apply-migrations.sh` ile yapıldı: 38 dosya, 0 hata. DB kendi `crwfb56-pg` konteynerimde çalışıyor (Postgres 16 + pgvector). Yanında kendi mailpit'im ve graphile-worker 0.18 vardı. Mutant koşusu ikinci izole DB'de yapıldı (`crwfb56m`). Paylaşılan fabrika DB'sine yazılmadı.

| # | Önem | Konu | Durum |
|---|---|---|---|
| B-1 | **bloke eder** | `9229fef4` dev'in tam test kapısını kırmızı yapıyor (`teardown-where-guard`) | açık |
| Y-1 | yüksek | Bir kiracısı ikinci koşuda atlanan kullanıcıya (M4 kapandı, pilot bitti, kiracı hata verdi) aynı gün 2. özet gidiyor | açık, canlı kanıtlandı |
| D-1 | test boşluğu | 20 mutantın 4'ü yaşadı (M02, M04, M11, K06), 1'i eşdeğer (M05) | öneri |
| D-2 | bilgi | SMTP kesintisinde job atmıyor, graphile `maxAttempts: 5` hiç devreye girmiyor. O günün hatırlatması ertesi sabaha kalıyor | karar/not |
| D-3 | bilgi (İNCELEME-51 D-3, hâlâ açık) | Boş DB'den kurulan ortamda TopicMatch anahtarı `NULLS NOT DISTINCT` değil; `topic-match.ts:140` yorumu bu DB için yanlış | ayrı kart |

## Bulgular

### B-1 — dev'in tam test kapısı kırmızı (bloke eder)
- **Nerede:** `tests/stale-relationship-reminder.live.test.ts:395`. CAS yarış testindeki Proxy, `return target.updateMany(args);` satırıyla argümanı olduğu gibi geçiriyor. `tests/helpers/where-guard-scan.ts:401` bunu `where: args (not a const object literal)` diye raporluyor.
- **Kanıt:** `npx vitest run` 5 kez koşuldu, 5/5 `Tests 1 failed | 3086 passed`. Tek kırmızı test `teardown-where-guard.test.ts:199`. `9229fef4~1`'de bu satır listede yok, `9229fef4`'te var. O tarihteki `evidence-object-key` girişleri başkalarınca kapatıldı, şu an listede kalan tek giriş bu.
- **Etkisi:** Test kodunda bir hata yok, ama CI'daki `vitest run` kapısı herkes için kırmızı.
- **Düzeltme önerisi:** Proxy'nin yeniden yazdığı çağrı, guard'ın kabul ettiği biçimde kurulabilir. Örneğin argüman `where: { tenantId: requireId(args.where.tenantId, …), userId: …, staleDigestOn: args.where.staleDigestOn }` diye yeniden kurulup öyle çağrılır. Bu mümkün değilse guard sahibinden (TASK-MUMSUA77J1C6Q) test dosyası için gerekçeli bir istisna istenmeli. Guard'ı gevşetmek ya da çağrıyı `Reflect.apply` ile saklamak önerilmez.

### Y-1 — kiracılar arası "günde tek özet" kenar durumu
- **Nerede:** `src/lib/relationships/stale-reminder.ts`
  - `:126-139`: pilot bitmiş ya da M4'ü kapalı kiracıda `return null`, `:158-162`'deki `claimedToday` okumasından önce geliyor. Kiracı hata verirse (`:349`) de aynısı oluyor.
  - `:223-243`: `claimDigest` yalnız özetin kapsadığı kiracının üyeliğine bakıyor.
- **Senaryo (canlı, gerçek worker):** `i56x` iki kiracıya üye: i56d ve i56e.
  - 07:00 cron'unda yalnız d-X65'in vadesi dolmuştu. Özet gitti, i56d üyeliği sahiplenildi.
  - e-XLATE'in vadesi 07:20'de doldu.
  - Kontrol koşusu (i56d'de M4 açık): `skippedMailedToday 3`, `digestsSent 0`, mailpit 7'de kaldı. Doğru.
  - i56d'de M4 `OFF` yapılıp elle koşuldu: `tenantsModuleClosed 2`, `digestsSent 1`, mailpit 8 oldu. **07:22:13'te `i56x`'e ikinci özet gitti** (`['e-XLATE']`). İki üyelik de `staleDigestOn = 2026-09-30` gösteriyor.
- **Neden önemli:** Kodun kendi sözleşmesi `:154-157` ("a second run on the same day … must not mail them again, even about rows that went stale in between") ve İNCELEME-51 B-1'in "günde en çok bir özet" hedefi bu yolda tutmuyor. Gerekli koşullar şunlar: aynı gün ikinci bir koşu (elle eklenen iş, ya da çökme sonrası kilidi düşen iş) ve ilk kiracının o koşuda atlanması (pilot bitişi, M4 kapatma, geçici kiracı hatası). Olasılık düşük, sonucu da yalnız fazladan bir e-posta. Bu yüzden bloke etmiyor ama kapatılmalı.
- **Düzeltme önerisi:** "Bugün sahiplenildi" bilgisi kiracı kapılarından önce ve kullanıcı bazında okunmalı. İki yol var:
  - (a) `collectTenant`'ta `claimedToday` sorgusu pilot ve modül kontrollerinin önüne alınır. Bu, kiracı hata verdiğinde yetmez.
  - (b) Daha sağlam olanı: sahiplenmeyi yaparken kullanıcının **tüm** üyeliklerinde `staleDigestOn >= bugün` olup olmadığına bakmak. Bunun için RLS dışı dar bir okuma gerekir: sahip bağlantısıyla `membership.findFirst({ where: { userId, staleDigestOn: { gte: today } } })` ya da tek amaçlı bir SECURITY DEFINER fonksiyonu.
  
  Regresyon testi: yukarıdaki senaryo, `now` 07:00 ve 07:22 olacak şekilde, ikinci koşuda ilk kiracının `ModuleState` değeri OFF.

### D-1 — mutantlar (20/16 öldü)
Mutantlar M4 canlı testleri (22) ve K1 canlı + birim testleri (17) üzerinde koşuldu. Temel koşu `31 passed`, her mutanttan sonra `git status` temiz.

| Mutant | Sonuç |
|---|---|
| M01 claim tarih ön-kontrolü yok · M03 isReminderDue yalnız NULL · M06 NOT(eq) kolu düşer · M07 `<=`→`<` (60. gün) · M08 claimedToday okunmaz · M09 red sonrası claim geri verilmez · M10 damga lastContactAt koşulsuz · M12 tick yerine gerçek saat | ÖLDÜ |
| K01 CLOSED puanlanır · K02 değişmeyen skor yeniden yazılır · K03 uygunsuz ülke sıfırlanmaz · K04 negatif kırpılmaz · K05 pilot bitmiş yazılır · K07 Y-2 profil kolu düşer · K08 audit yazılmaz | ÖLDÜ |
| **M02** CAS kaybında kısmi claim geri verilmez | YAŞADI: çok kiracılı kaybeden-koşu testi yok |
| **M04** 200'lük damga parçasında sınır satırı atlanır | YAŞADI: >200 satırlı tek alıcı testi yok |
| **M11** damgada `assertTenantWritable` yok | YAŞADI: okuma ile gönderim arasında pilotun bittiği test yok |
| **K06** kiracı hatası tüm koşuyu düşürür | YAŞADI. Davranışı canlıda doğruladım (aşağıda), ama birim ya da canlı testle sabitlenmemiş |
| M05 release `previous` yerine `null` yazar | eşdeğer: `staleDigestOn` yalnız `>= bugün` karşılaştırmasında okunuyor |

### D-2 — SMTP kesintisinde yeniden deneme yok
`m4-stale-relationships.ts:35-51` gönderim hatasını `success:false` + `warn` alarmı olarak döndürüyor, iş atmıyor. Graphile'ın 5 denemesi devreye girmiyor. Sahiplenmeler geri verildiği (`release`) için satırlar ertesi 07:00'de gidiyor. Bilinçli bir tasarım olabilir, ama "10:00'da hatırlatma" SMTP kesintisinde bir gün kayıyor. Aynı gün yeniden deneme isteniyorsa bu bir ürün kararı.

## Doğrulananlar (gerçek Postgres + gerçek graphile-worker + mailpit)

**M4, gerçek 07:00 UTC cron tik'i, iki cron-açık worker (pid 32758, 32759):**
```
DONE job=5 tick=2026-09-30T07:00:00.000Z {"tenants":6,"tenantsModuleClosed":1,"relationshipsDue":8,"relationshipsReminded":8,
  "skippedUnassigned":1,"skippedNeverContacted":1,"skippedMailedToday":1,"digestsSent":6,"durationMs":344}
```
İki worker'da yalnız job 5 koştu. `_private_known_crontabs.last_execution = 07:00:00`.

Mailpit (06:34 satırı aşağıdaki çökme adımından):
```
06:34:25 i56en | no contact with 1 relationships | ['a-E65']          ← çökme betiği, damgalanmadan SIGKILL
07:00:00 i56tr | 3 ilişkiyle 60 gündür temas yok  | ['a-R60','a-R61','b-TR80']
07:00:00 i56b1 | 1 ilişki | ['b-B70']
07:00:00 i56x  | 1 ilişki | ['d-X65']
07:00:00 i56k1 / i56k2 / i56k3 | ['f-K1'] / ['f-K2'] / ['f-K3']
```
- **Gün sınırı (tick'e göre):**

  | Satır | Son temas | Özette | Beklenen |
  |---|---|---|---|
  | a-R61 | 61 gün | var | var |
  | a-R60 | tam 60×24 saat | var | var |
  | a-R60m | 60 gün − 1 sn | yok | yok |
  | a-R59 | 59 gün | yok | yok |
- **Kiracı yalıtımı:**
  - i56b1'in özetinde yalnız b-B70 var, a kiracısının satırları yok.
  - i56tr'nin özetinde M4 kapalı kiracıdaki c-C90 yok.
  - Sahipsiz (a-UN) ve hiç temas edilmemiş (a-NEVER) satırlar sayıldı ama gönderilmedi.
- **Çökme (İNCELEME-51 B-1):** `scratch-crash-i56.ts KILL_AFTER=1` ilk gönderimden sonra SIGKILL yedi. Gönderim i56en'e gitmişti ve üyeliği sahiplenilmişti (`staleDigestOn 2026-09-30`), satır damgasızdı. 07:00 cron'u i56en'i `skippedMailedToday 1` ile atladı, **ikinci e-posta yok.** Aynı koşuda sahiplenilmemiş olan k1, k2 ve k3 birer kez aldı.
- **Aynı gün tekrar koşu (idempotentlik):** Elle job 6: `relationshipsDue 0, skippedAlreadyReminded 8, skippedMailedToday 2, digestsSent 0`, mailpit 7'de kaldı. 07:21'deki kontrol koşusunda da `digestsSent 0` çıktı.
- **Damgalar:** 8 satırda da `staleRemindedAt = 07:00` ve `staleRemindedContactAt = lastContactAt` (t). Audit satırları yalnız sayı içeriyor, isim ve adres yok.
- **Y-1 (İNCELEME-51) ölçek:** Önceki oturumun kendi worker log'u, aynı kod, `crwfb56m`: 100 000 hatırlatılmış satır + 1 taze satır için `durationMs 153`, `tenantsFailed 0`, taze satır gönderildi. 100 000 satırın aynı anda vadesinin dolduğu durumda tek koşu `durationMs 35792` sürdü ve başarılı oldu (`relationshipsReminded 100000`, damga 200'lük parçalarla).

**K1 TopicMatch:**
- **İki worker + gerçek cron geri doldurma:** `k1-topic-match` için `last_execution` dün olarak ayarlandı, iki worker aynı anda açıldı. Yalnız job 1 koştu, tick 02:30: `{"tenants":5,"done":2,"noProfileEmbedding":3,"scored":6,"created":6,"topicsWithoutEmbedding":1}`.
- **Kiracı yalıtımı:** i56a en yüksek skoru kendi profiline eşit olan t1'e verdi (100), i56b t2'ye (100). Embedding'i boş t4 ve CLOSED t5 için satır yok. Profil embedding'i boş olan i56c için satır yok, `noProfileEmbedding` olarak sayıldı. Toplam 6 satır, hepsi `opportunityId IS NULL`.
- **Idempotentlik:** Elle iki koşu (job 2, job 3): `created 0, updated 0, unchanged 6`, satır sayısı 6'da kaldı.
- **Hata davranışı:** i56b'nin TopicMatch yazımına hata tetikleyicisi takıldı ve iki profil değiştirildi. Job 4 `success:false, done 1, failed 1, updated 3` döndü. i56a güncellendi, i56b'nin sayfa işlemi geri alındı (eski skorlar duruyor). `SystemAlert warn "TopicMatch recompute failed for 1 of 5 tenants"` yazıldı. İş tamamlandı sayıldı, yeniden deneme olmadı (tasarım gereği). Tetikleyici sonra kaldırıldı.
- **Cron saatleri** (`schedule.ts`):
  - `k1-embeddings 15 2 * * *` → `k1-topic-match 30 2 * * *` sırası doğru; ayrı kuyruklar var, `fill 6h`.
  - `m4-stale-relationships 0 7 * * *` (10:00 İstanbul), kendi kuyruğunda, `fill 6h`.
  - Job M4'te tick zamanını kullanıyor. M12 mutantı bunu doğruladı; geri doldurulan bir koşu aynı çizgiyi çekiyor.

**Migration:** `m4-stale-reminder-idempotency.sql` boş DB'de 38 dosyalık zincirle 0 hatayla uygulandı. İdempotent (`IF NOT EXISTS`, `WHERE … IS NULL`). Geriye doldurma kuralı se-fb raporundaki R-5 varsayımıyla tutarlı.

**Statik:** `tsc --noEmit` 0 hata. Lint çıktısı boş.

## Riskler
- se-fb'nin R-1'i canlıda da görüldü: çökmeden sonra a-E65 damgasız kaldı, ertesi sabah bir kez daha anılacak. Bilinçli bir tercih, kabul edilebilir.
- D-3 (NULLS NOT DISTINCT) açık. K1 kuyruğu işleri sıraya koyduğu için bugün çift satır çıkmıyor, ama yorum ile şema bu ortamda çelişiyor.

## Açık sorular
- Y-1 için (b) yolu, yani RLS dışı dar okuma kabul edilir mi? Mimari/güvenlik onayı gerekebilir.
- D-2: SMTP kesintisinde aynı gün yeniden deneme istenir mi? Ürün kararı.

## Sonraki adım
- se-fb: B-1'i düzeltmek (tek satır) ve Y-1'i kapatıp regresyon testi eklemek. İsteğe bağlı olarak M02, M04, M11 ve K06 için testler.
- crw-fb: B-1 ve Y-1 düzeltmesinden sonra kısa yeniden inceleme: tam `vitest run` + Y-1 senaryosunun canlı tekrarı.

## Temizlik
İki worker'ım (kendi pid'lerim 32758, 32759) SIGTERM ile kapatıldı: `Global graceful shutdown complete`. `graphile_worker._private_jobs` 0 satır. Başka sürece dokunulmadı. `crwfb_i56` DB'si ile `crwfb56-pg`/`crwfb56-mailpit` konteynerleri, yeniden inceleme için yerinde bırakıldı; hepsi benim. Worktree'ler scratchpad'de, ana checkout'a yalnız bu rapor eklendi.

**Platform:** mac'te doğrulandı (darwin 27, Node, Postgres 16 + pgvector konteyneri, graphile-worker 0.18, mailpit). İncelenen kod platforma bağlı değil: süreç ya da dosya yolu yok, yalnız Node + Prisma + SQL, gün sınırı UTC (`dayStartUtc`), cron UTC. **Linux koşulamadı:** üretim worker imajı bu turda kurulmadı. Koddan beklenen bir fark yok; graphile kapanışı, cron tekilleştirmesi (`known_crontabs`) ve Postgres CAS platformdan bağımsız. **Windows koşulamadı:** makine yok. Koddan beklenen bir fark yok.
