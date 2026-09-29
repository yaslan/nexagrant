# İNCELEME-51 — TASK-MULQL2NYKRGJX (se-fb) — crw-fb

**İncelenen:** `b80d8360` (feat: K1 TopicMatch gece hesabı + M4 60 gün hatırlatması), `e8990881` (se-fb raporu). Dal `dev`, inceleme ağacı `e644ebb6` (iki commit'i içeriyor, incelenen dosyalar sonradan değişmemiş).
**Kapsam:** yalnız inceleme, kod değiştirilmedi. Geçici denemeler kendi worktree'mde yapıldı, `git checkout` ile geri alındı.

## Karar: **DÜZELTME GEREKLİ**

Bloke eden iki bulgu var: **B-1** ve **B-2**. İkisi de M4'ün görev metnindeki iki sözünü bozuyor: "kullanıcı başına günlük tek özet" ve "60 gün etkileşimsiz ilişki hatırlatılır". Geri kalan kısım sağlam:
- kiracı kapsamı
- modül kapısı
- dolmuş pilot atlama
- SMTP yokken üretim alarmı
- HTML kaçışlama
- kiracılar arası sızıntı olmaması
- K1 idempotentliği
- 60. gün sınırı

Hepsini gerçek worker koşusuyla yeniden doğruladım (§3).

## 2) Bulgular (önem sırasıyla)

### B-1 — BLOKE EDER (idempotentlik): gönderimden sonra ama damgadan önce çökme olursa aynı gün ikinci özet gider
- **Yer:** `src/lib/relationships/stale-reminder.ts:306-327`. Önce bütün özetler gönderiliyor (`for … byUser`), damgalama (`stampTenant`) ancak döngü bittikten sonra, kiracı başına yapılıyor.
- **Senaryo:** worker özet gönderirken ölürse, gönderilmiş özetlerin hiçbir satırı damgalanmamış olur. Ölme sebebi deploy SIGTERM'i (graphile-worker 0.18'in kapanışı işi 5 sn sonra bırakıyor, log: "attempting global graceful shutdown…"), OOM ya da konteyner yeniden başlatması olabilir. Kuyruk işi yeniden koşar. `mailedToday` damgadan türetildiği için boş kalır ve o kişilere **aynı gün aynı ilişkilerle ikinci e-posta** gider. Gerçek SMTP'de gönderim başına 0,2–1 sn sürdüğü için yüzlerce alıcıda bu pencere dakikalarca açık kalır.
- **Kanıt** (izole DB, gerçek `smtpMailer` → kendi mailpit'im, `scratch crash.ts`; 2. gönderimden sonra `process.kill(pid,'SIGKILL')`):
  ```
  sent 2, simulating SIGKILL before stamp
  damgalı satır (bd hariç): 0
  yeniden koşu: {"sent":3,"reminded":6,"mailedToday":0}
  mailpit total 5 · Counter({'en.i51@…': 2, 'tr.i51@…': 2, 'x.i51@…': 1})
  ```
- **Düzeltme:** her özet kabul edildiği anda o özetin satırlarını damgala. Döngünün içinde, bölüm (kiracı) başına `stampTenant` çağrılır, audit sayaçları sonda toplanır. Pencere böylece "tek gönderim + tek damga" boyuna iner. Daha sıkısı "önce sahiplen, sonra gönder" kalıbı: `staleRemindedAt = tick` yazılır, gönderim reddedilirse geri alınır. R-3'teki bilinçli tercih ("iki kez söylemek, kaçırmaktan iyidir") yalnız *damga işleminin düştüğü* dar durumu kapsar; tüm koşunun yeniden gönderilmesini kapsamaz.
- **Test önerisi:** N'inci gönderimden sonra fırlatan değil süreci *terk eden* bir sahte mailer (ör. `runTenant`'ı stamp aşamasında durduran bir kanca). Ardından ikinci koşuda o kullanıcıya 0 e-posta beklenmeli.

### B-2 — BLOKE EDER (doğruluk): hatırlatmadan sonra girilen ama tarihi hatırlatmadan önceye düşen temas, ilişkiyi kalıcı olarak susturur
- **Yer:** `src/lib/relationships/stale.ts:41`: `staleRemindedAt < lastContactAt` ise ilişki yeniden hatırlatılır. `lastContactAt`, kullanıcının seçtiği tarihtir: `relationships/actions.ts:188` `new Date(data.at)`, formda `detail.tsx:251` `type="datetime-local"`, tarih serbest.
- **Senaryo:** 60. gün hatırlatması gelir. Kullanıcı "geçen hafta aramıştım" deyip temas kaydını 7 gün önceki tarihle girer. Bu durumda `lastContactAt` < `staleRemindedAt` olur. Yeni temas dönemi başlamıştır, ama ilişki 60 gün sonra (ya da hiçbir zaman) **bir daha hatırlatılmaz**. Tek istisna, tarihi hatırlatmadan sonraya düşen yeni bir temas girilmesidir.
- **Kanıt** (gerçek worker koşusu): `i51-bd` satırı `lastContactAt = −75 gün` (hatırlatmadan sonra girilmiş), `staleRemindedAt = −70 gün`. 75 gündür temas yok ama özete girmedi: `skippedAlreadyReminded: 1`, mailpit'teki tr özetinde BD satırı yok.
- **Düzeltme** (ikisinden biri):
  - Temas yazan iki yolda `staleRemindedAt: null` yap: `relationships/actions.ts:186` ve `src/modules/m4/server/actions.ts:53,92`.
  - Ya da damgada "hangi temas için hatırlatıldı" bilgisini sakla (`staleRemindedForContactAt = lastContactAt`) ve `lastContactAt` bu değerden farklıysa yeniden hatırlat.
- **Test:** hatırlatılmış satıra `staleRemindedAt`'ten eski bir tarihle temas yaz, 60 gün sonra özette görün.

### Y-1 — ORTA (ölçek): hatırlatılmış eski satırlar her gün yeniden taranıyor; kiracının tamamı tek 5 sn'lik işlemde toplanıyor → büyüyen kiracı sessizce düşüyor
- **Yer:** `stale-reminder.ts:114-192`. Sayfa sorgusu (`:159`) `staleRemindedAt` ile süzmüyor, süzme JS'te `isReminderDue` ile yapılıyor. Kiracının bütün sayfaları ve `recipientFor` sorguları tek `withTenant` işleminde (Prisma varsayılanı 5 sn). Hatırlatılmış satırlar eski kalmaya devam ettiği için tarama her gün büyüyor.
- **Kanıt:** 100 000 hatırlatılmış eski satır ve 1 taze eski satır içeren bir kiracıyla gerçek worker (job=5):
  ```
  DONE (reported failure) … "reason":"send_failed","tenantsFailed":1,"skippedAlreadyReminded":41504,"durationMs":5103
  SystemAlert warn: "0 digests, 1 tenants and 0 stamps failed"   (sebep hiçbir yerde görünmüyor)
  ```
  Aynı veride taze satır (X80) **hiç gönderilmedi**. Yerelde eşik yaklaşık 32–41 bin satır.
- **Düzeltme denendi (geçici yama, geri alındı):** sayfa sorgusuna `OR: [{ staleRemindedAt: null }, { staleRemindedAt: { lt: prisma.relationship.fields.lastContactAt } }]` eklendi. Sonuç: `{"tenantsFailed":0,"due":1,"sent":["x.i51@…"],"ms":514}`. Aynı veride dev kodu: `{"tenantsFailed":1,"alreadyReminded":32000,"ms":5444}`. B-2 düzeltmesi damgayı sıfırlama yoluyla yapılırsa filtre `staleRemindedAt: null`'a iner.
- Ek not: kiracı hatası `reason: "send_failed"` diye etiketleniyor ve hata metni hiçbir yere yazılmıyor (şema `errors`'ı atıyor). Operatör zaman aşımını göremez. Kimlik taşımayan bir sınıf (ör. Prisma kodu `P2028`) log'a yazılabilir.

### Y-2 — ORTA (alarm boşluğu): K1, profillerde embedding yokken sessizce 0 satır yazar
- **Yer:** `src/lib/jobs/tasks/k1-topic-match.ts:32`. Alarm koşulu `scored === 0 && topicsWithoutEmbedding > 0`.
- **Senaryo:** TASK-MUN7C48UHPOGI konu embedding'lerini doldurduğunda `topicsWithoutEmbedding` 0 olur. Profil formu hâlâ sahte kayıt yaptığı için `noProfileEmbedding` = tüm kiracılar olur. Bu durumda `scored` 0 kalır ama **alarm yazılmaz**. K1 üretimde fiilen kapalıdır ve kimse haberdar olmaz. (Koddan kanıtlı. İzole koşuda `noProfileEmbedding: 2` görüldü.)
- **Düzeltme:** `scored === 0 && (topicsWithoutEmbedding > 0 || noProfileEmbedding > 0)`.

### D-1 — DÜŞÜK (test boşluğu): 13 mutantımdan 9'u yaşadı (§4)
Davranışı bugün doğru olan ama korunmayan noktalar:
- M4 koşusunda silinmiş kiracı (`deletedAt: null`; K1'de A6 var, M4'te karşılığı yok)
- "günde tek" penceresinin gün başı olması (1 saatlik kayan pencere de geçiyor)
- 25 satır sınırı
- silinmiş çalışma alanına bağlantı
- sayfa içi pilot yeniden kontrolü
- K1 `note` karşılaştırması
- damgada `tenantId` (RLS örtüyor)

Her biri için tek bir `expect` yeter.

### D-2 — DÜŞÜK / açık soru (Ö-2'nin devamı): abonelikten çıkma ya da tercih yok
Günlük özetin kapatılabileceği bir yer yok: `List-Unsubscribe` başlığı ve e-postada bağlantı yok (mailpit'te doğrulandı). Hizmet e-postası varsayımı makul, ama hukuk teyidi ve bir ürün kararı bekliyor. Bloke etmez.

### D-3 — BİLGİ (R-2 teyit): boş DB'den kurulan ortamda K1 anahtarı düz indeks
İzole DB'de `db push → apply-migrations` sonrası indeks `CREATE UNIQUE INDEX … ("tenantId","topicId","opportunityId")` olarak kuruldu, `NULLS NOT DISTINCT` **yok**. Yani `createMany skipDuplicates` bu ortamlarda K1 satırını korumuyor. Ayrı kart önerisine katılıyorum.

### D-4 — BİLGİ (performans): K1 güncelleme yolu satır satır
Profil embedding'i değişince 5000 konu için 4951 ayrı `update` gerekiyor, süre 9,1 sn. Sayfa başına yaklaşık 0,9 sn, yani 5 sn işlem sınırının altında. Ama sürüm artışında (`k1-cosine-2`) ya da embedding modeli değiştiğinde kiracı × konu kadar sorgu çalışır. İleride tek `UPDATE … FROM (VALUES …)` ile yazılabilir. Bloke etmez.

### Uyumlu bulunanlar (kanıtlı)
- **graphile kalıbı:** `defineJob` ve `tick` kullanılıyor. `fill: '6h'` ve `missedTickAlert: true`. Her işin kendi kuyruğu var ve eşzamanlı iki koşu seri çalışıyor. Son denemede `exhausted` alarmı yazılıyor. Cron adları çakışmıyor.
- **Kiracı kapsamı:** bütün okuma ve yazma `withTenant` içinde, test `fabrika_app` (NOBYPASSRLS) ile koşuldu. **Sızıntı yok:** x.i51'in özetinde yalnız Kurum B'deki kendi satırı var. tr.i51'in tek e-postasında iki kiracı var ve yalnız kendi satırları listeleniyor.
- **60. gün:** 60 gün + 1 dk olan satır dahil, 59 gün olan hariç. Yazarın testi de 60 gün tam dahil ve 60 gün − 1 ms hariç durumlarını kapsıyor.
- **Diğerleri:**
  - HTML kaçışlama doğru: `<script>` HTML'de `&lt;script&gt;` olarak çıkıyor.
  - Alıcının diline göre metin ve `/en/` bağlantısı gidiyor.
  - Audit kayıtları yalnız sayı taşıyor.
  - SystemAlert'te kiracı kimliği yok.
  - `undefined` ile `where` kurulmuyor. `in: ids` boş listede çağrılmıyor, where-guard'da gerekçeli.
  - Down migration `DROP COLUMN IF EXISTS`.

## 3) Kanıt

**Ortam:**
- Temiz worktree (`git worktree add --detach … dev` @ `e644ebb6`).
- İzole DB `crwfb_i51` (fabrika-postgres :5433). Kurulum sırası: `prisma db push` → `apply-migrations.sh` (36 dosya, psql konteyner sarmalayıcısıyla) → `db:rls-role` → `db:rls` (28 → 112 politika) → `db:seed`.
- `.env` içindeki üç URL de `crwfb_i51`'e çevrildi. **Paylaşılan `fabrika` DB'sine veri yazılmadı.** Yalnız küme düzeyindeki `fabrika_app` rolü `db:rls-role` ile aynı parolayla yeniden onaylandı.

**Gerçek worker** (`JOBS_CRON_ENABLED=false`, `DATABASE_URL=fabrika_app`, `JOBS_DATABASE_URL=owner`, SMTP → kendi mailpit'im `crwfb-mailpit` 127.0.0.1:11125). İşler `jobs:enqueue` ile kuyruğa kondu:
```
[k1-topic-match] DONE job=1 {"success":true,"tenants":3,"done":1,"noProfileEmbedding":2,"scored":4,"created":4,"ineligible":1,"topicsWithoutEmbedding":20}
[m4-stale-relationships] DONE job=2 {"success":true,"relationshipsDue":5,"relationshipsReminded":5,"skippedAlreadyReminded":1,"digestsSent":3}
TopicMatch: tp1 100 cos 1 · tp2 70.71 cos 0.7071 · tp3 0 eligible=false (EU_EEA_CH_ONLY, TR) · tp4 0 cos -1 · tp5 CLOSED → satır yok
mailpit total 3:
  x.i51  | FonBridge: 1 ilişkiyle 60 gündür temas yok   → Kurum B: X80 Gizli (80 gün)
  en.i51 | FonBridge: no contact with 1 relationships for 60 days → Kurum A <b>&: EN Partner (61 days) · /en/ws-i51-ta/relationships
  tr.i51 | FonBridge: 3 ilişkiyle 60 gündür temas yok   → Kurum A: <script>…(90), A60 (60) · Kurum B: B70 (70); A59 yok; BD yok (B-2)
  HTML: '<script>' yok, '&lt;script&gt;' var · List-Unsubscribe yok
AuditEvent: topic_match.recomputed {scored 4, created 4, …} · relationship.stale_reminded {recipients 2, relationships 3} / {2, 2}
İkinci koşu (aynı gün, arada yeni eskiyen bir satır eklendi):
  k1 {"created":0,"updated":0,"unchanged":4} · m4 {"relationshipsDue":0,"skippedAlreadyReminded":6,"skippedMailedToday":1,"digestsSent":0} · mailpit total 3
```
Worker'ımı SIGTERM ile kapattım ("Global graceful shutdown complete"). Mailpit konteynerimi sildim, `crwfb_i51`'i DROP ettim, worktree'yi kaldırdım. Başka sürece dokunmadım.

**Hedefli testler (izole DB, temiz ağaç):** `topic-match-nightly.live`, `stale-relationship-reminder.live`, `k1-topic-match-m4-stale`, `jobs-schedule`, `where-guard-src` → `Test Files 5 passed (5) · Tests 44 passed (44)`.
Not: katalogda benim eklediğim 5000 embedding'li konu varken K1 canlı testi 5 sn test zaman aşımına düşüyor. Test, paylaşılan `Topic` kataloğunun küçük olduğunu varsayıyor. Toplu konuları silince test yeşil oldu. Kodda kusur değil, test ortamı bağımlılığı.

## 4) Mutantlar (`scratchpad/mut.py`; her mutanttan sonra `git checkout -- <dosya>`, sonda `git status` temiz; yalnız `scratch-i51/` kaldı ve silindi)
```
M1  isReminderDue < → <= (eşit damga)            YAŞADI  (pratikte eşdeğer; eşit ms olası değil)
M2  damga where'inden tenantId düşer            YAŞADI  (RLS örtüyor; savunma katmanı testsiz)
M3  e-postasız kullanıcı kontrolü düşer         YAŞADI  (eşdeğer: User.email zorunlu)
M4  M4 koşusu silinmiş kiracıyı okur            YAŞADI  → D-1
M5  25 satır sınırı kalkar                      YAŞADI  → D-1
M6  "günde tek" gün başı yerine 1 saat          YAŞADI  → D-1
M7  silinmiş çalışma alanına bağlantı           YAŞADI  → D-1
M8  SMTP alarmı error → warn                    ÖLDÜ    1 failed
M9  K1 sameBreakdown note'u yok sayar           YAŞADI  → D-1
M10 K1 kiracı ülkesi yok sayılır                ÖLDÜ    2 failed
M11 K1 sayfa içi pilot kontrolü düşer           YAŞADI  → D-1
M12 gönderilen özetler damgalanmaz              ÖLDÜ    5 failed
M13 FORTHCOMING dışlanır (yalnız OPEN)          ÖLDÜ    2 failed
```
Yazarın 22 mutantı kendi seçtiği yolları öldürüyor. Benimkiler bilerek o listenin dışında kalan yolları hedefledi: 4 öldü, 9 yaşadı (2'si eşdeğer).

## 5) Riskler / açık sorular
- **Ö-1** (se-fb): K1'de modül kapısının olmaması gerekçeli (K1 çekirdek) ve G0 yedeğini koruyor. Katılıyorum, bulgu değil.
- **Ö-2 → D-2:** abonelikten çıkma için ürün ve hukuk kararı gerekiyor.
- **Ö-3 → D-3:** R-2 için ayrı kart önerisine katılıyorum.
- **Yeni gözlem:** hatırlatma "tick"e göre, yani 07:00 UTC'de hesaplanıyor. Temas saati 07:00 UTC'den sonraysa hatırlatma 61. günün sabahına kayıyor. Ekrandaki rozet ise anlık `now` kullanıyor. Sözleşmeye uygun (60 × 24 sa), yalnız bilgi.

## 6) Sonraki adım
1. se-fb: B-1 (gönderim başına damga) ve B-2 (temas yazıldığında `staleRemindedAt`'i sıfırla) düzeltilsin, her biri için regresyon testi eklensin.
2. Aynı turda Y-1 (SQL filtresi; bu düzeltme denendi, 514 ms) ve Y-2 (alarm koşulu) yapılsın.
3. D-1'deki `expect`'ler eklensin.
4. Yeniden inceleme: B-1 için çökme senaryosu, B-2 için geriye tarihli temas, Y-1 için 100 bin satır. Hepsi bu rapordaki betiklerle tekrar koşulabilir.

**Platform:** mac (darwin, Node 26.5, Postgres 16 + pgvector konteyneri, graphile-worker 0.18) üzerinde doğrulandı. İncelenen kod platforma bağlı değil: süreç yönetimi, dosya yolu ya da kabuk kullanmıyor, bütün mantık Node + SQL, zaman hesapları UTC. Çökme senaryosundaki SIGKILL yalnız benim test sürecimdi. B-1 Linux üretim worker'ında (Dockerfile `worker` hedefi) da aynı şekilde oluşur, çünkü graphile'in kapanış davranışı platformdan bağımsız. **Linux koşulamadı** (imaj bu incelemede kurulmadı). **Windows koşulamadı** (makine yok). Koddan beklenen bir fark yok.
