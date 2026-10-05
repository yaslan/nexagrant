# TASK-MUN2J9LLXNREG — Davet satırları saklama/temizlik (cs-fb)

Sprint FB-KAMU-2 · dal `dev` · kod `4a100e41` · belgeler ve bu rapor ayrı commit'te.
Kaynak bulgu: TASK-MUN2FJ4R24QPT-cs-fb B-5, TASK-MUN2AKGX5HOXN-se-fb B-5, envanter §2.

## 1) Ne yapıldı

**Saklama kuralı (30 gün):**
- Kabul edilmiş davet, `acceptedAt`'ten 30 gün sonra silinir.
- Kabul edilmemiş davet, `expires`'tan 30 gün sonra silinir.
- Bekleyen davet (süresi dolmamış, kabul edilmemiş) hiçbir koşulda silinmez.
- Bağlantı 7 gün geçerli olduğu için kullanılmayan bir davet son gönderimden en çok 37 gün yaşar.
- Yeniden davet `expires`'ı 7 gün ileri alır ve `acceptedAt`'i boşaltır (`route.ts:73`, `:142-148`). Bu yüzden süre baştan başlar. `8e74d546` (bekleme süresindeki yeniden davet) bu davranışı değiştirmiyor; kontrol ettim.

**Neden 30 gün:** Envanterdeki öteki silme süreleriyle aynı: hesap silme bekleme süresi (§17, `users-scheduled-deletion`), Stripe olay kaydı (`STRIPE_EVENT_RETENTION_DAYS`) ve ajans davet kodunun varsayılan süresi (§18c). Yönetici geçen ayın davetlerini hâlâ görebilir; adres bundan daha uzun kalmaz. Süre hukukça teyit edilmedi. Hukuk paketi 1.8'de §5 madde 6'ya soru olarak eklendi.

**Kod (`4a100e41`):**
- `src/lib/invitations/retention.ts`:
  - `INVITATION_RETENTION_DAYS = 30` ve `invitationPurgeCutoff()`: tam sayı olmayan ya da 1 günden kısa bir süre, ya da geçersiz bir `now` → `RangeError`.
  - `purgeableInvitationWhere(cutoff)`: geçersiz bir `cutoff` → `RangeError`. Filtre yalnız doğrulanmış bir `Date`'ten kuruluyor, bu yüzden hiçbir dalda boş ya da `undefined` bir where oluşamaz.
  - `purgeOldInvitations()`: `withSystemScope('cross-tenant-job', 'invitation-retention.purge')` içinde çalışır. Önce `groupBy tenantId` yapar. Sonra her kiracı için `deleteMany({ AND: [{ tenantId }, due] })` koşar; aynı tarih filtresi yeniden uygulanır, bu yüzden arada yeniden davet edilen satır silinmez. Silme ve denetim satırı aynı transaction'da: dokunulan her kiracıya bir `invitation.purged` `AuditEvent` yazılır, içinde yalnız `{count, retentionDays, cutoff}` var. Adres, davet id'si ya da `actorId` yok.
- `src/lib/jobs/tasks/invitation-cleanup.ts`:
  - graphile-worker işi (`defineJob`). Silme anı olarak cron tick'ini kullanır. Payload'ı okumaz, bu yüzden elle eklenen bir iş süreyi kısaltamaz.
  - Hata olursa hemen bir `error` `SystemAlert` (`source: invitation-cleanup`) yazar ve hatayı yeniden fırlatır; kuyruk işi yeniden dener. Son denemede de sarmalayıcı `job-queue:invitation-cleanup:exhausted` uyarısını yazar.
- `src/lib/jobs/schedule.ts`: `invitation-cleanup`, `30 3 * * *` UTC, `maxAttempts: 5`, `fill: 6h`, `missedTickAlert: true`. Kaçırılan tik mevcut `job-queue-health` işiyle raporlanır. `queue` yok, stripe-event-cleanup ile aynı: graphile-worker bir cron tick'ini tek kez planlar, silme de idempotent.
- `src/lib/jobs/tasks/index.ts`: görev listesine eklendi.
- `scripts/tenant-bypass-baseline.json`: gerekçeli yeni bir `system-scope:cross-tenant-job` kaydı.
- `tests/where-guard-src.test.ts`: `KNOWN` listesine gerekçeli bir kayıt. Nedeni: `tenantId`, `groupBy` anahtarı olarak null olamayan bir kolondan geliyor; `due` ise doğrulanmış bir filtre.
- Testler:
  - `src/lib/jobs/tasks/__tests__/invitation-cleanup.test.ts` (birim, 7 test).
  - `tests/invitation-retention.live.test.ts` (canlı, 6 test, `fabrika_app`). Bu dosya CI dışında `fabrika` adlı veritabanında **kendini atlar**, çünkü silme bütün kiracılarda çalışır.
  - `tests/jobs-schedule.test.ts`: cron ve crontab satırı sabitlendi.

**Belgeler (bu rapordaki commit):**
- `docs/legal/processing-register.md`:
  - §2 saklama satırı yeni kurala göre yeniden yazıldı: süre, iş, denetim satırı, hata uyarısı ve gerekçe.
  - §22 madde 16 kapandı. Madde 14'teki "kalan" notu güncellendi.
- `docs/legal/HUKUK-SORULARI-2026-09.md`, **sürüm 1.8**:
  - Değişiklik notu (a) davet saklama süresini anlatıyor. (b) 1.6 (d)'yi kapatıyor: kabul sayfası `0ae3175b`'de. Bu, önceki kartta pakete işlenmemişti.
  - §5 madde 6'ya "30 gün uygun mu?" sorusu eklendi.

## 2) Kanıt

İzole DB `csfb_invret` (5433) şöyle kuruldu:
- `prisma migrate diff --from-empty --to-schema prisma/schema.prisma` ile şema.
- `pnpm db:rls` (politikalar 0 → 112) ve `pnpm db:rls-role`.
- Test kodu `fabrika_app` (NOBYPASSRLS) ile koşuyor.

Temiz worktree `4a100e41`'de koştu (`git status` boştu).

```
pnpm typecheck → tc=0
pnpm lint      → lint=0
pnpm build     → build=0
pnpm rls:bypass-check → ✅ SUCCESS … 35 on the sanctioned cross-tenant path (cross-tenant-job 4 call site(s) in 4 file(s))

vitest (izole DB): tests/invitation-retention.live.test.ts + src/lib/jobs/tasks/__tests__/invitation-cleanup.test.ts
  + tests/jobs-schedule.test.ts + tests/where-guard-src.test.ts + tests/teardown-where-guard.test.ts + src/lib/invitations
  → Test Files 6 passed (6) · Tests 56 passed (56)

vitest (paylaşılan fabrika, .env olduğu gibi): tests/invitation-retention.live.test.ts
  → Test Files 1 skipped (1) · Tests 6 skipped (6)   ← silme orada koşmadı
```

Canlı testlerin kapsamı:
- 31 gün önce süresi dolmuş → silinir. 29 gün önce süresi dolmuş → kalır. Bekleyen → kalır.
- 31 gün önce kabul edilmiş → silinir. 29 gün önce kabul edilmiş → kalır. İkinci kiracının 60 gün önce süresi dolmuş daveti → silinir.
- Kabul edilmiş satıra `acceptedAt`'e göre karar verilir, `expires`'a göre değil (iki yönde de denendi).
- Sınır katı: tam 30. günde → kalır. 1 ms daha eski → silinir.
- Dokunulan her kiracıya adres içermeyen bir `invitation.purged` satırı yazılır. İkinci koşu 0 satır siler ve yeni denetim satırı yazmaz.
- Süre 0, -1, 0.5, NaN ya da geçersiz `now` → `RangeError`; hiçbir satır değişmez.
- İş, cron tick'iyle koşunca siler.

**Mutantlar** (koşu `../mut.py`; her mutanttan sonra dosya `.bak`'tan geri kondu, `git status` temiz):
```
M1 kabul dalı yok (yalnız expires)       → 3 failed | 10 passed → ÖLDÜ
M2 lt → lte                              → 2 failed | 11 passed → ÖLDÜ
M3 kabul dalı expires ile                → 3 failed | 10 passed → ÖLDÜ
M4 bekleyen dalda acceptedAt:null yok    → 2 failed | 11 passed → ÖLDÜ
M5 gün koruması yok                      → 2 failed | 11 passed → ÖLDÜ
M6 deleteMany yalnız tenantId            → 5 failed |  8 passed → ÖLDÜ
M7 denetim satırı yazılmıyor             → 2 failed | 11 passed → ÖLDÜ
M8 cutoff işareti ters                   → 6 failed |  7 passed → ÖLDÜ
M9 system scope yok (düz prisma)         → 5 failed |  8 passed → ÖLDÜ   (RLS satırları gizliyor, 0 siliniyor)
M10 iş tick yerine şimdi                 → 1 failed | 12 passed → ÖLDÜ
M11 hata alarmı yok                      → 2 failed | 11 passed → ÖLDÜ
M12 denetim satırında e-posta            → 1 failed | 12 passed → ÖLDÜ
```

**Gerçek worker koşusu** (izole DB). Worker `DATABASE_URL=fabrika_app`, `JOBS_DATABASE_URL=owner`, `JOBS_CRON_ENABLED=false` ile başlatıldı; iş `pnpm jobs:enqueue -- invitation-cleanup` ile kuyruğa kondu:
```
ÖNCE  inv-acc35 (kabul, 35 gün) · inv-exp10 (10 gün) · inv-exp40 (40 gün) · inv-pend (-5 gün, bekliyor)
[jobs] queued: invitation-cleanup job=1 key=invitation-cleanup:manual attempts=0/5
[invitation-cleanup] START job=1 attempt=1/5 tick=-
[DEBUG] cross-tenant read {"purpose":"cross-tenant-job","context":"invitation-retention.purge"}
[invitation-cleanup] DONE job=1 attempt=1/5 tick=- {"success":true,"deletedCount":2,"tenantCount":1,"cutoff":"2026-08-30T20:00:51.167Z","retentionDays":30}
Completed task 1 (invitation-cleanup, 219.93ms) with success
SONRA inv-exp10 · inv-pend
AUDIT t-worker-run | invitation.purged | actorId - | {"count": 2, "cutoff": "2026-08-30T20:00:51.167Z", "retentionDays": 30}
AuditEvent'te '@' geçen satır: 0 · worker günlüğünde '@example.test': 0 · graphile_worker.jobs: 0 (iş tamamlandı)
```
Cron açıkken ikinci bir worker açıldı. `graphile_worker._private_known_crontabs` içinde `invitation-cleanup` dahil 12 iş kayıtlı; kaçırılan tik denetimi bu tabloyu okuyor. İki worker'ı da ben başlattım ve ikisini de ben kapattım (SIGTERM, süreç bitti).

**Paylaşılan DB'ye dokunulmadı** (salt okuma): `fabrika | Invitation 0 | purge adayı 0 | invitation.purged 0`.

## 3) Değişen dosyalar
- `4a100e41`:
  - `src/lib/invitations/retention.ts` (yeni)
  - `src/lib/jobs/tasks/invitation-cleanup.ts` (yeni)
  - `src/lib/jobs/tasks/__tests__/invitation-cleanup.test.ts` (yeni)
  - `tests/invitation-retention.live.test.ts` (yeni)
  - `src/lib/jobs/schedule.ts`
  - `src/lib/jobs/tasks/index.ts`
  - `tests/jobs-schedule.test.ts`
  - `tests/where-guard-src.test.ts`
  - `scripts/tenant-bypass-baseline.json`
- Belge commit'i:
  - `docs/legal/processing-register.md`
  - `docs/legal/HUKUK-SORULARI-2026-09.md`
  - bu rapor

## 4) Riskler
- **Kabul edilmiş bir bağlantı 30 gün sonra "geçersiz" görünür.** Satır silindiği için eski bağlantı artık "zaten kullanıldı" demez, "geçersiz bağlantı" der. Üye yine üyedir; üyelik `Membership`'tedir, davet satırında değil. Bilinçli bir sonuç.
- **Yönetici listesindeki eski davetler kaybolur.** Üyeler sayfasında süresi dolmuş davetler 30 gün sonra görünmez. Bu, saklama kuralının amacıdır.
- **`cron-tenant-scope.test.ts` boş izole DB'de 4 test düşürüyor.** Neden: "no Topic rows locally". Aynı dosya `dev` ağacında aynı boş DB'yle de aynı 4 testi düşürüyor; paylaşılan DB ile 11/11 geçiyor. Benim değişikliğimle ilgisi yok. Bu yüzden rapordaki hedefli koşuya alınmadı.
- İzole DB `csfb_invret` duruyor. İncelemede tekrar kullanılabilir; bitince `DROP DATABASE csfb_invret` ile kaldırılabilir.
- Envanter satırları `4a100e41` ve `8e74d546` sonrası koda göre yazıldı (`route.ts:73`, `:142-148`).

## 5) Açık sorular
- 30 gün hukukça uygun mu? Kısalmalı mı? (HUKUK-SORULARI 1.8, §5 madde 6)
- `invitation.purged` denetim satırları §13'teki denetim kaydı saklamasına tabi. O süre zaten açık bir kalem.

## 6) Sonraki adım
- Kartı `review`'a alıyorum. İnceleme için se-fb ya da crw-fb uygun. Mutant ve worker adımları raporda; tekrar koşmak için `csfb_invret` hazır.
- ROADMAP'e bir satır işlenebilir (bu kartta dokunulmadı).

**Platform beyanı:** Doğrulama mac'te (Darwin 27, Apple Silicon) yapıldı: Postgres 16 Docker (`fabrika-postgres`, 5433), Node + tsx, graphile-worker 0.18.0. Kod platforma bağlı değil: süreç öldürme, dosya yolu, kabuk ya da ikili adı kullanmıyor. Bütün tarih hesabı UTC milisaniyeyle yapılıyor ve cron UTC. Bu yüzden Linux'ta (üretim worker'ı) ve Windows'ta aynı davranış beklenir. Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız macOS var. CI (Linux) canlı dosyayı kendi `fabrika` konteynerinde koşar; atlama korumasına `isCi()` ile girmez.
