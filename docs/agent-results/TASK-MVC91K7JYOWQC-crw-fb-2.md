---
sözleşme: 3
görev: TASK-MVC91K7JYOWQC
kod: TASK-MVC91K7JYOWQC
ajan: crw-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: PR #92 (head d1c4876f) merge'e hazır — Ö-1/Ö-2 doğru uygulanmış, merge çözümü doğru, bloke eden bulgu yok; yalnız 2 bilgi notu var.
platform: mac (Darwin 27, Postgres :5433, kendi kopya DB'm fabrika_crwfb_fo50). Kod yolu SQL + Node, platforma bağlı değil; Windows/Linux koşulmadı (gerek yok: dosya yolu/süreç/kabuk kullanmıyor).
sürüm: 1
tarih: 2026-10-17T22:00:13.900Z
---

# FO-50 PR #92 yeniden inceleme — Ö-1/Ö-2 (f3e1fbfe) + dev merge (d1c4876f)

## Ne yapıldı
İlk raporumdaki head `8b643835` ile şimdiki head `d1c4876f` arasını inceledim: `f3e1fbfe` (Ö-1/Ö-2) ve `d1c4876f` (merge: origin/dev `7bf972c9`). Kod değiştirmedim, merge yapmadım. Paylaşılan `fabrika` DB'sinde migration, down ya da db:rls-role koşmadım. Canlı testleri `fabrika_fo50_be`'nin TEMPLATE kopyası olan kendi DB'mde (`fabrika_crwfb_fo50`) koştum, iş bitince kopyayı düşürdüm. `db:rls-role`'ü kopyada da koşmadım, çünkü `ALTER ROLE` küme genelidir ve paylaşılan `fabrika_app` rolüne dokunurdu. Bu maddeyi koddan değerlendirdim.

## Bulgular (önem sırasıyla)
**Bloke eden: yok.**

1. **(1) Ö-1 trigger: DOĞRU.** `prisma/migrations/add-expert-founder-counter.sql:51-65`. Kanıt (katalog):
   - `prosecdef = f`: SECURITY INVOKER. Fonksiyon yalnız RAISE ediyor, yetki yükseltmesi yok.
   - `proconfig = {search_path=pg_catalog}`.
   - `proacl = {fabrika=X/fabrika}`: PUBLIC EXECUTE geri alınmış.
   - Trigger tanımı `BEFORE UPDATE … FOR EACH ROW WHEN (new."lastNumber" < old."lastNumber")`.

   PUBLIC'in EXECUTE yetkisi yok ama trigger tetiklenirken EXECUTE denetlenmiyor. Canlı test bunu kanıtlıyor: uygulama rolü "permission denied for function" değil `only goes up` hatası alıyor.
   - **REVOKE DELETE, TRUNCATE üç yerde var:** migration :96, `prisma/rls.sql:355-358`, `prisma/rls-app-role.sql:62-66`.
   - **db:rls-role geri vermiyor:** rls-app-role.sql'de REVOKE, `GRANT … DELETE ON ALL TABLES`'dan sonra aynı DO bloğunda geliyor. 4. adımdaki `ALTER DEFAULT PRIVILEGES` yalnız ileride kurulacak tabloları etkiler. Tabloyu migration sonradan kurarsa REVOKE'u kendisi yapıyor.
   - Kopya DB: `has_table_privilege(fabrika_app, DELETE/TRUNCATE) = f|f`, verilen yetkiler `INSERT, SELECT, UPDATE`. `rls:verify` de artık bunu ölçüyor (`scripts/check-rls-live.ts` `noDelete`).
2. **(2) `recordFounderNumberGiven`: DOĞRU ve eşzamanlı çağrıda güvenli.** `founder-counter.ts:28-35`. `ON CONFLICT DO UPDATE` çakışan satırı kilitler. READ COMMITTED'da `WHERE EXCLUDED > stored` koşulu satırın en son sürümüne karşı değerlendirilir. Bu yüzden iki eşzamanlı yazıcıdan büyük değer kazanır ve sayaç hiç düşmez. Ek olarak her iki çağıran da (`verify.ts:63`, `retention.ts:59`) `EXPERT_PREREG_LOCK_KEY` altında. RLS açısından system_scope politikası INSERT/UPDATE için hem USING'i hem WITH CHECK'i karşılıyor. Değer büyük değilse satıra hiç yazılmıyor ve `updatedAt` korunuyor (canlı test `toEqual(before)`).
3. **(3) `holdFounderCounter`: yalnız sahip rolüyle çalışıyor.** `tests/helpers/expert-prereg-live-lock.ts:37-44`. Üç çağıranın üçü de sahip istemcisi geçiyor: retention testinde `admin`, `expert-prereg.live` ve `reissue.live` testlerinde `prisma`. Bu iki dosya DATABASE_URL'i sahip olarak koşar, zaten tabloya kapsam dışından yazıyorlar. Uygulama rolü bu yolu kullanamaz: canlı testte `deleteMany` → `permission denied`. Fonksiyon üretim kodundan çağrılmıyor (`git grep` yalnız tests/).
4. **(4) down.sql: DOĞRU.** Önce `DROP TABLE IF EXISTS` (trigger ve politika tabloyla birlikte gider), sonra `DROP FUNCTION IF EXISTS public.expert_founder_counter_no_decrease()`. Sıra doğru ve idempotent. be-fb-3 raporunda kopya DB'de iki kez koşulmuş (`table gone|function gone`).
5. **(5) Merge çözümü: DOĞRU.** `git show --cc d1c4876f` çakışması yalnız iki dosyada:
   - **DATA_MODEL §22:** FO-45'in "Alanlar" satırı (zorunlu `title` ve `organization`, FO-25) ve "DB seviyesi (FO-45)" maddesi korunmuş. FO-50'nin sayaç metni ("Kurucu Uzman numarası", "Saklama: karar verildi") ve §22a korunmuş. "Spam ve sınır" maddesinde dev metni + "kurum" eklenmiş. Kaybolan ya da yinelenen madde yok.
   - **apply-order:** 69 `add-expert-pre-registration-organization.sql` → 70 `expert-prereg-rls-mail-quota.sql` → 71 `add-expert-founder-counter.sql`.

   Origin/dev o günden beri `a99db474`'e ilerledi. `git merge-tree --write-tree origin/dev <dal>` temiz, çakışma yok.

### Bilgi notları (bloke etmez, öneri)
- **B-1:** Trigger yalnız migration'da var, `prisma/rls.sql`'de yok. `prisma db push` + `pnpm db:rls` ile kurulan bir DB'de (DATA_MODEL §22a bu kurulumu "desteklenir" diye anıyor) REVOKE uygulanır ama trigger kurulmaz. O DB'de sahip rolü sayacı düşürebilir. Uygulama rolü düşüremez, çünkü kod yolu raise-only. Önerilen düzeltme: §22a'ya "trigger yalnız migration ile kurulur" diye tek cümle eklemek ya da bloğu rls.sql'e taşımak. Karar size kalıyor.
- **B-2:** Retention canlı testindeki `seed()` sayacı Prisma `upsert` ile yazıyor. Daha küçük bir değer verilirse trigger reddeder. Bugünkü testler numaraları artan sırada veriyor, sorun yok; ileride test ekleyen bilsin.

## Kanıt (ham çıktı)
```
-- katalog (fabrika_crwfb_fo50 = fabrika_fo50_be TEMPLATE kopyası)
ExpertFounderCounter_no_decrease|CREATE TRIGGER "ExpertFounderCounter_no_decrease" BEFORE UPDATE ON public."ExpertFounderCounter" FOR EACH ROW WHEN ((new."lastNumber" < old."lastNumber")) EXECUTE FUNCTION expert_founder_counter_no_decrease()
expert_founder_counter_no_decrease|f|{search_path=pg_catalog}|{fabrika=X/fabrika}
fabrika_app grants: INSERT SELECT UPDATE
has DELETE|TRUNCATE: f|f

-- birim (dosya bazında)
verify.test.ts retention.test.ts expert-prereg-cleanup.test.ts rls-coverage.test.ts jobs-schedule.test.ts where-guard-src.test.ts
 Test Files  6 passed (6)   Tests  79 passed (79)

-- canlı (DATABASE_URL=postgresql:***@localhost:5433/fabrika_crwfb_fo50; RLS URL = fabrika_app, aynı DB)
expert-prereg-retention.live.test.ts  Tests 8 passed (8)
  ✓ a purge that changes nothing leaves the counter row untouched (updatedAt too)
  ✓ the database refuses to lower the counter; the app role cannot delete it (crw-fb Ö-1)
  ✓ writes one expert_prereg.purged audit ...; a second run changes nothing
expert-prereg.live.test.ts + expert-prereg-reissue.live.test.ts (sahip)  Tests 6 passed (6)
koşu sonrası sayaç: 3 (geri konmuş) · DROP DATABASE fabrika_crwfb_fo50 → kalan 0
```

## Değişen dosyalar
Yok. Yalnız bu rapor yazıldı.

## Riskler
Bloke eden risk yok. B-1 yalnız migration koşulmadan kurulan DB'leri etkiliyor.

## Açık sorular
Yok.

## Sonraki adım
Lider PR #92'yi dev'e merge edebilir. B-1 isteğe bağlı, ayrı bir küçük iş olabilir.

**Platform:** mac (Darwin 27). SQL/Node yolu platformdan bağımsız; Windows ve Linux'ta koşulmadı, gerek de yok.
