# TASK-MULQL2NYKRGJX — se-fb — FB zamanlanmış işler: K1 TopicMatch gece hesaplama + M4 60 gün hatırlatma

**Commit:** `b80d8360` (dev) — `feat(jobs): … K1 TopicMatch nightly recompute + M4 60-day stale-relationship digest`
**Sonuç:** iki iş de yazıldı, izole DB'de canlı testlerle ve gerçek worker koşusuyla doğrulandı. Önemli bir sınır var: **K1 işi bugün üretimde hiç satır yazmaz**, çünkü `Topic.embedding` ve `TenantProfile.embedding` hiçbir yerde doldurulmuyor (§4 R-1).

## 1) Ne yapıldı

### Keşif bulguları (koddan)
- `TopicMatch` K1 satırını (`opportunityId IS NULL`, `fitScore`) dolduran bir kod **yoktu**. Yalnız G0 okuyor (`src/lib/scoring/g0-compute.ts:220`) ve tohum yazıyor.
- İki embedding sütunu da hiçbir yerde yazılmıyor. Profil formu sahte kayıt yapıyor (`settings/profile/page.tsx:31`). OpenAI anahtarı ayrı kartta: TASK-MULQM3LFB4KRA.
- M4'te "son hatırlatma" alanı yoktu. `m4-weekly-summary` yalnız sayıyor, e-posta göndermiyor (`// TODO`).
- Şemada bildirim tercihi ya da abonelikten çıkma modeli **yok**. Görev "varsa uyulur" diyor: uyulacak bir şey yok, kanca noktası `recipientFor()`.

### (a) `k1-topic-match` — 02:30 UTC (k1-daily-calls'tan 30 dk sonra), kuyruk `k1-topic-match`
Dosyalar: `src/lib/scoring/topic-match.ts` ve `src/lib/jobs/tasks/k1-topic-match.ts`.
- **Skor:** pgvector kosinüsü, `fitScore = max(0, cos) × 100`. Kural düzeltmesi mevcut `isCountryEligible` ile yapılıyor (G0 kapısının kullandığı kural). Ülke uygun değilse skor 0 olur ve gerekçe `breakdown`'a yazılır (`{source, version, cosine, eligible, note}`).
- **Kiracı kapsamı:** her sayfa kendi `withTenant` işleminde koşar. Kiracı listesi, credits-monthly-grant'teki kalıpla kapsamsız okunur (`Tenant`, `deletedAt: null`). Kiracı listesi de sayfalıdır.
- **Bellek:** kosinüs Postgres'te hesaplanır. Node'a sayfa başına (500) yalnız `(topicId, eligibility, similarity)` gelir, vektör hiç gelmez.
- **Idempotent:** skor değişmediyse satır yeniden yazılmaz (`computedAt` sabit kalır). Değiştiyse id ile update edilir. Yeni satır `createMany skipDuplicates` ile girer (anahtar `NULLS NOT DISTINCT`).
- **Atlananlar (sayılır):** süresi dolmuş pilot (her sayfada `assertTenantWritable` yeniden kontrol edilir), profil embedding'i olmayan kiracı, CLOSED konu, vektörsüz konu, sıfır vektör (NaN).
- **Modül kapısı yok. Gerekçe:** K1 çekirdek bir özellik, M1..M11 dışında (docs/MODULES.md). `/calls` sayfasında da kapı yok. TopicMatch'i M1'e bağlasaydım, M1'i olmayan planlarda G0 hizalaması sessizce anahtar-kelime yedeğine düşerdi. Görev metni "M1/M4" diyordu; bu sapmayı bilerek yaptım (§5 Ö-1).
- **AuditEvent:** `topic_match.recomputed` yalnız sayı taşır: `{scored, created, updated, unchanged, ineligible, version}`.
- **SystemAlert:** kiracı hatasında `warn`, yalnız sayılarla (kiracı kimliği yazılmaz). Hiçbir şey skorlanamadıysa ve konularda embedding yoksa, **yalnız üretimde** `warn` yazılır (`dedupeKey k1-topic-match:no-embeddings`).

### (b) `m4-stale-relationships` — 07:00 UTC (10:00 İstanbul), kuyruk `m4-stale-relationships`
Dosyalar: `src/lib/relationships/{stale.ts, stale-reminder.ts}`, `src/lib/email/stale-relationships-email.ts` ve `src/lib/jobs/tasks/m4-stale-relationships.ts`.
- **Kural:** `lastContactAt ≤ şimdi − 60×24 sa` ise ilişki eskimiştir. 60. gün eskidir; 1 ms önce eski değildir. Hiç temas edilmemiş (NULL) ilişki eski sayılmaz; liste ekranı da böyle davranıyor.
- **Tekrar yok:** e-posta kabul edildikten sonra `Relationship.staleRemindedAt = tick` yazılır (yeni sütun). Aynı ilişki ancak daha yeni bir temas (`lastContactAt > staleRemindedAt`) da 60 gün eskidiğinde yeniden hatırlatılır.
- **Kullanıcı başına günde tek özet:** kiracılar arası tek e-posta, her kiracı ayrı bölüm. Aynı UTC gününde ikinci bir koşu (retry ya da elle) o gün damgalanmış bir sahibe ikinci e-posta atmaz; o gün yeni eskiyen satır ertesi güne kalır.
- **Kapılar:** plan hakkı (`getEntitlements().allowedModules` M4 içeriyor mu) ve `ModuleState`. Alıcının kendi rolüyle `canAccessStatus` çağrılır: ON herkese açık, PILOT yalnız yöneticilere, DEV yalnız platform ekibine, OFF kimseye. Süresi dolmuş pilotta ne gönderim ne yazma yapılır; damgalamada kontrol tekrarlanır. Sahipsiz ilişki, kiracıdan ayrılmış sahip ve silinmiş ya da silinmeyi bekleyen hesap atlanır.
- **SMTP yoksa** gönderim de damga da yapılmaz; çıktıda `reason: no_mail_provider` görünür. `error` SystemAlert **yalnız üretimde** yazılır. Reddedilen gönderim o kullanıcının satırlarını damgalamaz, ertesi gün yeniden denenir.
- **E-posta metni:** tr/en, `messages/*.json` → `staleRelationshipsEmail` namespace'inden, alıcının `User.locale`'ine göre. Kiracı adı ve karşı taraf adı HTML'de kaçışlanır, Subject'te satır sonları temizlenir.
- **AuditEvent:** `relationship.stale_reminded`, `{relationships, recipients, staleAfterDays}`. Ad ya da adres yazılmaz.
- `/relationships` listesindeki "eski" rozeti de aynı fonksiyonu kullanır (`isStaleRelationship`). Önceki kural `floor(gün) > 60`, yani ≥61 gündü. Ekran ile e-posta artık aynı günde eşik koyuyor.

### Şema
`Relationship.staleRemindedAt DateTime?` eklendi: `prisma/migrations/relationship-stale-reminded-at.sql` + `.down.sql`, `apply-order.txt`. Yalnız eklemeli ve idempotent (`ADD COLUMN IF NOT EXISTS`). RLS'e dokunulmadı.

## 2) Kanıt

**İzole DB** `sefb_mulql2` (fabrika-postgres :5433). Kurulum şöyle yapıldı: `prisma migrate diff --from-empty --to-schema` ile şema, `scripts/apply-migrations.sh` (psql konteyner sarmalayıcısıyla, 36 dosya) ile migration'lar, `pnpm db:rls` (0 → 112 politika) ve `pnpm db:rls-role`. Test kodu `fabrika_app` (NOBYPASSRLS) ile koşuyor.

**Temiz worktree** `se-fb/mulql2-jobs` @ `7c6969ab` (içerik `b80d8360` ile aynı; yalnız doküman commit'lerinin üzerine yeniden tabanlandı), `git status` boş:
```
pnpm typecheck        → tc=0
pnpm lint             → lint=0
pnpm i18n:check       → ✅ i18n check passed: both catalogs agree …
pnpm rls:bypass-check → ✅ SUCCESS: no new tenant bypass … 36 on the sanctioned cross-tenant path
pnpm build            → BUILD_EXIT 0
vitest (izole DB, hedefli): topic-match-nightly.live + stale-relationship-reminder.live
  + k1-topic-match-m4-stale + jobs-schedule + where-guard-src + teardown-where-guard + public-lead-cleanup
  → Test Files 7 passed (7) · Tests 54 passed (54)
```
Canlı testlerin kapsamı:
- **K1:** kosinüs 1 → 100; 0.7071 → 70.71; −1 → 0. EU_EEA_CH_ONLY konusu TR kiracıda 0 (`eligible:false`), DE kiracıda 100. CLOSED, vektörsüz ve sıfır vektörlü konu için satır oluşmaz. Sayfa boyutu 2 iken ≥3 sayfa geziliyor. İkinci koşuda `created 0 / updated 0`, `computedAt` değişmiyor, yeni audit yazılmıyor, konu başına tek satır kalıyor. Değişen embedding satırı yerinde güncelliyor. Audit yalnız sayı taşıyor. Profilsiz ve pilotu dolmuş kiracıda satır yok. Silinmiş kiracı okunmuyor. `tenantIds: []` hiçbir kiracıyı işlemiyor ("her kiracı" demek değil). Satırlar kiracılar arasında karışmıyor.
- **M4:** SMTP yokken gönderim ve damga 0. Kiracılar arası 3 özet gidiyor (U.tr'nin tek e-postasında iki kiracı var). 60. gün satırı dahil, 60 gün eksi 1 ms dahil değil. NULL, sahipsiz, zaten hatırlatılmış, OFF, planı yok (free), pilotu dolmuş, silinmeyi bekleyen, üye olmayan ve PILOT altındaki MEMBER atlanıyor; PILOT altındaki PIPELINE_MANAGER dahil. `<img onerror>` HTML'de kaçışlanıyor. en alıcıya en konu ve `/en/` bağlantısı gidiyor. İkinci koşuda 0 e-posta. Aynı gün yeni eskiyen satır → 0 e-posta (`skippedMailedToday 1`), ertesi gün yalnız o satır geliyor. Reddedilen gönderim damgalamıyor, diğer kullanıcı gidiyor. Yeni temas yeni 60 günlük dönem başlatıyor (59. günde yok, 60. günde var). Audit `{relationships:4, recipients:2, staleAfterDays:60}` taşıyor, içinde `@` yok.
- **İş sarmalayıcıları (birim):** tick zamanı kullanılıyor. `no_mail_provider` ve `no-embeddings` alarmları yalnız `NODE_ENV=production`'da yazılıyor. Hata alarmında ve iş günlüğünde kiracı kimliği ya da adres yok. Son denemede `job-queue:k1-topic-match:exhausted` yazılıyor.

**Mutantlar** (`scratchpad/mut.py`; her mutanttan sonra dosya `.bak`'tan geri kondu, `git status` temiz). **22/22 ÖLDÜ**:
```
A1 ülke uygunluğu yok sayılır → 1 failed · A2 CLOSED da eşleşir → 1 · A3 süresi dolmuş pilot yazılır → 2
A4 değişmeyen satır yeniden yazılır → 2 · A5 yalnız ilk sayfa → 2 · A6 silinmiş kiracı koşar → 1
A7 negatif kosinüs kırpılmaz → 1 · A8 audit yazılmaz → 1 · A9 embedding alarmı üretim dışında → 1
A10 kiracı kapsamı yok (düz prisma işlemi, RLS) → 7
B1 60. gün sınırı < → 7 · B2 staleRemindedAt yok sayılır → 6 · B3 modül kapısı yok → 3
B4 PILOT kitlesi yok sayılır → 2 · B5 dolmuş pilot hatırlatılır → 3 · B6 günde-tek-özet yok → 2
B7 başarısız gönderim de damgalanır → 2 · B8 SMTP alarmı üretim dışında → 1 · B9 ad kaçışlanmaz → 1
B10 silinmeyi bekleyen kullanıcıya gider → 3 · B11 dil yok sayılır → 1 · B12 kiracı kapsamı yok (RLS) → 7
```

**Gerçek worker koşusu** (izole DB). Worker şu ortamla başlatıldı: `DATABASE_URL=fabrika_app`, `JOBS_DATABASE_URL=owner`, `JOBS_CRON_ENABLED=false`, SMTP → kendi mailpit konteynerim (127.0.0.1:11025). İşler `pnpm jobs:enqueue -- k1-topic-match` / `-- m4-stale-relationships` ile kuyruğa kondu:
```
[k1-topic-match] DONE job=1 … {"success":true,"tenants":1,"done":1,…,"scored":3,"created":3,"updated":0,"unchanged":0,"ineligible":1,"topicsWithoutEmbedding":1,"durationMs":180}
[m4-stale-relationships] DONE job=2 … {"success":true,"tenants":1,…,"relationshipsDue":2,"relationshipsReminded":2,…,"digestsSent":1,"digestsFailed":0,"durationMs":92}
TopicMatch: tp-wr-1 100 cos 1 true · tp-wr-2 70.71 cos 0.7071 true · tp-wr-3 0 cos 1 false   (tp-wr-4 vektörsüz → satır yok)
Relationship: r-wr-1 (75 gün) reminded=t · r-wr-2 (60 gün 1 dk) reminded=t · r-wr-3 (10 gün) reminded=f
AuditEvent: topic_match.recomputed {"scored":3,"created":3,"updated":0,"version":"k1-cosine-1","unchanged":0,"ineligible":1}
            relationship.stale_reminded {"recipients":1,"relationships":2,"staleAfterDays":60}
mailpit total 1 · focal.wr@example.test | FonBridge: 2 ilişkiyle 60 gündür temas yok
  - Ege Üniversitesi TTO — son temas 2026-07-16 (75 gün önce)
  - TÜBİTAK NCP — son temas 2026-07-31 (60 gün önce)
  İlişkileri aç: http://localhost:3000/tr/ana/relationships
İkinci koşu: k1 {"created":0,"updated":0,"unchanged":3} · m4 {"relationshipsDue":0,"skippedAlreadyReminded":2,"digestsSent":0} · mailpit total 1
SystemAlert (dev koşusu): 0
```
**Hacim ve bellek** (aynı worker, pid 27493, RSS örneklemesi):
```
5 000 konu:  created 5000, 654 ms,  RSS 145 → tepe 251 MB
20 000 konu: created 20000, 1944 ms, RSS 247 → tepe 329 MB   (4× hacim, tepe artışı +82 MB: sayfa ile sınırlı, doğrusal değil)
```
Kendi worker'ımı SIGTERM ile kapattım (graceful shutdown), mailpit konteynerimi (`sefb-mailpit`) sildim. Tohum satırlarını id ile sildim. Başka oturumların worker süreçlerine dokunmadım.

**Tam süit (izole DB):** `Test Files 4 failed | 236 passed | 2 skipped · Tests 7 failed | 2802 passed | 13 skipped`. 7 hatanın hepsi değişikliklerim geri alınmışken de aynı biçimde düşüyor (aynı 4 dosya, `Tests 7 failed | 36 passed`). Hepsi boş DB'ye bağlı ve önceden var:
- `cron-tenant-scope` ×4: "no Topic rows locally". cs-fb TASK-MUN2J9LLXNREG'de de kayıtlı.
- `plan-admin` ×2: `ModuleNotGrantedError M6`.
- `double-charge-prevention` ×1.
- `stripe-webhook-tenant-scope.live` ×1.

**Paylaşılan DB (`fabrika`):** yalnız eklemeli migration uygulandı (`ALTER TABLE` → `staleRemindedAt | timestamp | YES`). Diğer ajanların eklemeli migration'larıyla aynı kural (PublicLead, acceptedAt orada). Başka hiçbir satır yazılmadı. Canlı testler paylaşılan DB'yi reddediyor.

**dev'e alma:** cherry-pick durdu, çünkü `messages/*.json`'da başka bir ajanın (K6 belge ekranı) commit'lenmemiş değişikliği vardı. Onu ezmemek için şöyle ilerledim:
- dev ref'ini `update-ref <yeni> <eski>` ile atomik ilerlettim.
- Yalnız kendi 19 yolumu ağaca yazdım.
- messages'a yalnız kendi namespace'imi ekledim.
- İlgili yolları index'te HEAD'e çektim.

Doğrulama: diğer ajanın messages farkı öncesiyle **birebir aynı** (`their messages diff UNCHANGED`), index temiz, benim 21 yolum HEAD ile aynı.

## 3) Değişen dosyalar (`b80d8360`)
- Yeni:
  - `src/lib/scoring/topic-match.ts`
  - `src/lib/relationships/stale.ts`
  - `src/lib/relationships/stale-reminder.ts`
  - `src/lib/email/stale-relationships-email.ts`
  - `src/lib/jobs/tasks/k1-topic-match.ts`
  - `src/lib/jobs/tasks/m4-stale-relationships.ts`
  - `src/lib/jobs/tasks/__tests__/k1-topic-match-m4-stale.test.ts`
  - `tests/topic-match-nightly.live.test.ts`
  - `tests/stale-relationship-reminder.live.test.ts`
  - `prisma/migrations/relationship-stale-reminded-at.sql` + `.down.sql`
- Değişen:
  - `prisma/schema.prisma` (tek alan)
  - `prisma/migrations/apply-order.txt`
  - `src/lib/jobs/{schedule.ts, events.ts, tasks/index.ts}`
  - `messages/{tr,en}.json` (`staleRelationshipsEmail`)
  - `src/app/[locale]/(app)/[workspace]/relationships/page.tsx` (tek satır, aynı 60 gün kuralı)
  - `tests/jobs-schedule.test.ts`
  - `tests/where-guard-src.test.ts` (tek KNOWN girdisi, gerekçeli)
- Cron adı çakışması yok: fe-fb'nin `public-lead-cleanup` (03:45) işi korunarak birleştirildi.

## 4) Riskler
- **R-1 (yüksek, ürün): K1 işi bugün üretimde 0 satır yazar.** Sebep: embedding'ler hiçbir yerde üretilmiyor. İş bunu dürüstçe sayar (`noProfileEmbedding`, `topicsWithoutEmbedding`) ve üretimde bir `warn` alarmı yazar. Anahtar-kelime örtüşmesini "K1 eşleşmesi" diye yazmadım: G0 bu durumda zaten belgelenmiş yedeği (`keywords ∩`) kullanıyor, onu "ölçülmüş" diye göstermek kanıt kapsamını şişirirdi. Gereken: TASK-MULQM3LFB4KRA (anahtar) ve ayrı bir "Topic + TenantProfile embedding üretimi" kartı (maliyet kararı).
- **R-2 (orta, önceden var):** boş DB'den (`prisma db push` / `migrate diff`) kurulan bir veritabanında `TopicMatch_tenantId_topicId_opportunityId_key` **NULLS NOT DISTINCT olmadan** oluşuyor. `topicmatch-per-opportunity/migration.sql` `CREATE UNIQUE INDEX IF NOT EXISTS` kullandığı için mevcut düz indeksi atlıyor. İzole DB'de ölçüldü, elle düzeltildi. Paylaşılan DB'de doğru. Sonuç: CI ve yeni ortamlarda K1 satırının tekilliği veritabanı düzeyinde korunmuyor. Benim işim önce okuyup sonra yazdığı ve kuyrukla serileştiği için pratikte tek satır kalır, ama migration'ın düzeltilmesi gerekiyor (DROP + CREATE ya da indeks tanımını kontrol eden bir DO bloğu).
- **R-3 (düşük):** gönderim kabul edilip damga işlemi düşerse (`scope: stamp`, `warn` alarmı) ertesi gün aynı satırlar yeniden gönderilir. "Kaçırmak yerine iki kez söylemek" bilinçli bir tercih.
- **R-4 (düşük):** e-posta bağlantısı kiracının ilk çalışma alanına gidiyor. `Membership.workspaceIds` ile kısıtlı bir kullanıcı o alanı açamayabilir.
- **R-5 (düşük):** hatırlatmadan sonra sahip değişirse yeni sahip bir sonraki eskime dönemine kadar hatırlatılmaz. Embedding'i silinen konunun eski K1 satırı kalır (silme yok).
- **R-6 (davranış değişikliği):** `/relationships` "eski" rozeti artık 60. günde yanıyor (önce 61. gün).
- **R-7 (paylaşılan ağaç):** paylaşılan ağaçta worker'ı çalıştıran biri `pnpm db:generate` yapmalı. Yeni istemci yoksa `staleRemindedAt` seçimi hata verir; web sayfaları etkilenmez.
- `Relationship`'in Tenant'a FK'si yok: kiracı silinince ilişki satırları yetim kalıyor (önceden var, elle tohumda gözlendi).

## 5) Açık sorular
- **Ö-1:** TopicMatch için "M1 kapısı" gerçekten isteniyor mu? Ben K1'i çekirdek sayıp modül kapısı koymadım (§1a gerekçe). İsteniyorsa tek satırlık bir ekleme.
- **Ö-2:** bildirim tercihi / abonelikten çıkma modeli yok. İç kullanıcıya giden, kendi iş kaydıyla ilgili bir hizmet e-postası olduğu için ticari ileti sayılmadığını varsaydım (varsayım, hukuk teyidi yok). Tercih modeli gelince kanca noktası `recipientFor()`.
- **Ö-3:** R-2 için ayrı bir düzeltme kartı açılsın mı (topicmatch-per-opportunity indeksinin yeniden kurulması)?

## 6) Sonraki adım
- Embedding üretimi kartı (R-1). Ardından K1 işi ek bir değişiklik olmadan dolmaya başlar.
- R-2 migration düzeltmesi.
- İnceleme (crw-fb / be-fb).
- Üretime dağıtımda `relationship-stale-reminded-at.sql`, worker imajından önce uygulanmalı.
- İzole DB `sefb_mulql2` ve worktree `scratchpad/wt` (dal `se-fb/mulql2-jobs`) inceleme için bırakıldı. İkisi de atılabilir.

**Platform:** mac (darwin, Node 26, Postgres 16 + pgvector konteyneri) üzerinde doğrulandı. Dokunulan kod platforma bağlı değil: süreç, yol, kabuk ya da ikili adı yok. Tüm mantık Node + SQL'dedir, zaman hesapları UTC'dir. Linux: üretim worker imajı (`Dockerfile` `worker` hedefi) aynı kodu koşar; **koşulamadı**, çünkü bu görevde imaj yeniden kurulmadı. Windows: **koşulamadı** (makine yok). Koddan beklenen fark yok.
