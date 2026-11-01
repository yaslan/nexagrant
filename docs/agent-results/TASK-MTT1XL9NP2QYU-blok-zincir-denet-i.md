# TASK-MTT1XL9NP2QYU — A4-C/2: `Relationship.ownerUserId` nullable + imhada koparılıyor (QA)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tarih:** 2026-09-09 · **Tip:** doğrulama + regresyon testi
**Ölçülen ağaç:** `d737759` (HEAD) · **İş inen commit:** `e2d90cc` (`feat(m4): detach the erased focal point…`)
**Bkz:** `docs/agent-results/TASK-MTPZF8X1W8WCU-ex-en-3.md` (A4 brifingi) ·
`docs/legal/processing-register.md` · TASK-MTT1VEUF8Z9SH (kararın diğer yarısı)

## Karar

**Kartın talebi karşılanıyor: yayına uygun.** Kolon canlı veritabanında gerçekten nullable,
gerçek imha işi silinen kişinin kimliğini ilişkiden koparıyor, kiracının partner kaydı ve
komşunun ataması el değmeden duruyor. Bu turda **2 bulgu** çıktı: biri test edilemez hâldeki
yeni davranış (F-3, düzeltildi — kırmızı→yeşil), ikisi yayın/ürün riski (F-1, F-2 — takip kartı).

## 1. Ne yapıldı

İş bana atandığında kod zaten inmişti (`e2d90cc`), bu yüzden bu tur **yazmak değil ölçmek**:
grep ile değil, canlı Postgres'te gerçek `purgeDueUsers()` koşularak. Yazılan her satır silindi.

- Sonda: `docs/agent-results/TASK-MTT1XL9NP2QYU-evidence/probe-rel-owner.mts`
- Sıralama sondası (F-1): `.../probe-migration-ordering.mts`
- Yeni regresyon testi: `tests/m4-weekly-summary.test.ts`

## 2. Kanıt

### 2.1 Şema: tipe değil, veritabanına soruldu

```
[{"column_name":"counterpartEmail","is_nullable":"YES"},
 {"column_name":"counterpartName","is_nullable":"YES"},
 {"column_name":"ownerUserId","is_nullable":"YES"}]

column comment: "Internal focal point (User.id, no FK). NULL = unassigned. Detached by the
KVKK/GDPR purge: a work assignment has no retention basis once the person is erased
(A4 option C, 2026-09-08)."
```

### 2.2 Gerçek imha yolu (canlı DB, fixture sonda tarafından silindi)

```
--- B. Before the purge ---
[{"id":"qa-rel-r1","ownerUserId":"qa-rel-subj","counterpartName":"Partner","counterpartEmail":"partner@x.invalid"},
 {"id":"qa-rel-r2","ownerUserId":"qa-rel-other","counterpartName":"NCP","counterpartEmail":"ncp@x.invalid"}]

--- C. Real purgeDueUsers() ---
{"success":true,"dueCount":1,"purgedCount":1,"failedCount":0}

--- D. After the purge ---
[{"id":"qa-rel-r1","ownerUserId":null,"counterpartName":"Partner","counterpartEmail":"partner@x.invalid"},
 {"id":"qa-rel-r2","ownerUserId":"qa-rel-other",...}]
subject user row still present? false
subject id left in ANY Relationship row? 0
untouched colleague still assigned? true
tenant's partner record survived (row + counterpart)? true

--- E. Raw scan (ownerUserId / counterpartName / counterpartEmail / notes ILIKE) ---
[{"hits":0}]
```
Tam çıktı: `.../01-live-purge-probe.txt`

### 2.3 Depodaki canlı imha süiti gerçekten koştu (atlanmadı)

```
✓ GDPR purge — live > erases the due subject for real and leaves every other tenant intact
✓ GDPR purge — live > leaves no row still carrying the erased id in a column the database does not cascade
✓ GDPR purge — live > the erased focal point is detached from the relationship, and the neighbour keeps theirs
✓ GDPR purge — live > no column anywhere still carries the erased person by name
✓ GDPR purge — live > detaches rather than destroys: the tenant keeps the work, minus the person
 Test Files  1 passed (1) · Tests  20 passed (20)
```

### 2.4 F-3 — BULUNDU ve DÜZELTİLDİ: yeni "sahipsiz" davranışın hiç testi yoktu

`e2d90cc` haftalık özete `unassignedCount` ekledi ve NULL sahibi gruplamanın dışında bıraktı —
ama bu mantık Inngest handler'ının içindeki kapalı bir closure'daydı: `grep -rn unassignedCount
tests src` **tek bir test dosyası** döndürmüyordu ve testten çağrılabilir değildi. Deponun kendi
kalıbı bunun tersi: `purgeDueUsers()` tetikleyicisinden ayrı export edilmiş, "so the rule can be
unit-tested".

Kırmızı → düzeltme → yeşil (test gevşetilmedi):
```
=== RED: grouping rule not extracted (HEAD code) ===
 FAIL tests/m4-weekly-summary.test.ts > groups by tenant and focal point
 FAIL ... > an unassigned relationship is counted, never grouped
 FAIL ... > unassigned rows from unrelated tenants never share one recipient
 FAIL ... > an owner id that is undefined rather than null is still not a recipient
   TypeError: groupPendingActionsByFocalPoint is not a function
 Tests  4 failed (4)

=== GREEN: after extracting groupPendingActionsByFocalPoint() ===
 Tests  4 passed (4)
```
Kanıt: `.../02-red-green-grouping.txt`

**Kırmızı ölçümün atfı.** RED koşusu `git stash push -- <tek dosya>` ile alındı; paylaşılan
ağaçta bu tek başına zayıf bir temeldir (bkz. `fabrika-git-stash-is-unsafe-in-shared-tree`).
Bu yüzden aynı kanıt yarış-koşulundan bağımsız olarak da yazıldı — fonksiyon işin indiği
commit'te hiç yok, yani test o ağaçta geçemezdi:
```
$ git show e2d90cc:src/lib/inngest/jobs/m4-weekly-summary.ts | grep -c groupPendingActionsByFocalPoint
0
$ git show e2d90cc:... | grep -n 'ownerUserId ==* null'
48:        if (action.ownerUserId === null) {     <- düzeltilen kontrol
```

**Not:** Bu düzeltme ben rapor yazarken paylaşılan ağaçtan `f5fd3c6`
(`refactor(m4): make the focal-point grouping rule testable, and pin it`) olarak commit'lendi;
kod ve testler HEAD'de duruyor, kapı o hâlde ölçüldü.

Testler yalnız mevcut davranışı sabitlemedi, **bir kusuru da kapattı**: kontrol `=== null` idi;
`undefined` gelen bir satır (kısmi `select`, elle kurulmuş satır) `t1:undefined` adında bir
alıcıya gruplanıyordu. Yeni kural `== null` ve testle sabit.

Ayrıca tip kapısı, `step.run` sınırının değerleri JSON'a çevirdiğini gösterdi
(`nextStepDue` çalışma anında `Date` değil `string`); bu yüzden `PendingAction` yalnız
gruplamanın okuduğu iki alanı tarif ediyor, satırın ikinci ve yanlış bir tarifini değil.

### 2.5 Kapı

```
$ pnpm gate   -> exit 0
  lint       0 error, 2 warning  (ikisi de başka ajanın sondası: TASK-MTSYH8LDGV5YU)
  typecheck  exit 0
  test       Test Files 130 passed | 2 skipped · Tests 1547 passed | 8 skipped
  i18n ✅ · rls:check 43/43 · rls:verify fabrika_app rolüyle gerçekten ölçüldü
```
Tam log: `.../03-gate-full.txt`

## 3. Bulgular

### F-1 — Migration elle koşulmazsa imha **sessizce** başarısız oluyor · **Önem: Yüksek** (yayın sırası)

`relationship-owner-nullable.sql` bu depodaki 15 benzeri gibi **başıboş bir .sql**: `pnpm db:migrate`
(= `prisma migrate dev`) bu dosyaları uygulamıyor, `scripts/` altında da uygulayan bir araç yok.
Kod migration'dan önce yayına çıkarsa kolon hâlâ NOT NULL olur ve iş NULL yazmaya çalışır.

Tekrar-üretim (`.../probe-migration-ordering.mts`, kolonu ölçüm sonunda geri alır):
```
--- Rolling the column back to the pre-migration shape (NOT NULL) ---
is_nullable now: NO
--- The erasure job runs against the un-migrated column ---
purgeDueUsers -> {"dueCount":1,"purgedCount":0,"failedCount":1,
                  "errors":[{"message":"...relationship.updateMany... Null constraint violation"}]}
subject user row still present? true
subject id still in Relationship? 1
SystemAlert rows written by the failure: 0
column restored, is_nullable: YES
```
**Beklenen:** yasal süresi dolmuş imha ya tamamlanır ya da görünür biçimde alarm üretir.
**Gözlenen:** kişi silinmez, kimliği ilişkide kalır, tek iz `console.error` ve iş çıktısındaki
`failedCount` — `SystemAlert` **yazılmıyor**, yeniden deneme yok. Kimse bakmazsa imha borcu
sessizce büyür.
**Etki:** KVKK md.7 / GDPR md.17 süresinin kaçırılması + silinmiş kişinin kimliğinin kalması.
**Öneri:** (a) yayın kontrol listesine "`.sql`'i deploy'dan ÖNCE uygula" maddesi; (b) `failedCount > 0`
için `SystemAlert` (ayrı kart — bu kartın kapsamı değil).

### F-2 — Sahipsiz kalan ilişkiye üründe yeni sahip atanamıyor · **Önem: Orta**

Şema yorumu ve iş kodu NULL'ı "unassigned — needs a new focal point" diye tanımlıyor, ama
`ownerUserId`'yi **yazan tek yer kayıt oluşturma**:
```
$ grep -rn "ownerUserId" src | grep -v inngest
src/app/.../relationships/actions.ts:31:      ownerUserId: userId,     <- create
src/modules/m4/server/actions.ts:48:        ownerUserId: userId,       <- create
```
`updateRelationship` bu alana dokunmuyor, arayüzde sahip alanı hiç yok (`RelationshipRow`
tipinde bile yok — bu yüzden NULL bir sahip **hiçbir ekranı kırmıyor**, regresyon yok).
**Sonuç:** imhadan sonra ilişki kalıcı olarak sahipsiz kalır; vadesi gelen `nextStep`'leri
haftalık özet kimseye bildirmez (`unassignedCount` yalnız iş çıktısında görünür; bildirim
yolunun kendisi de hâlâ `TODO` durumunda). Kişisel veri açısından doğru, **iş akışı açısından
kör nokta**. Takip kartı önerildi.

### F-3 — Yeni davranışın testi yoktu → **düzeltildi** (§2.4)

## 4. Değişen dosyalar

- `src/lib/inngest/jobs/m4-weekly-summary.ts` — gruplama kuralı `groupPendingActionsByFocalPoint()`
  olarak export edildi (deponun `purgeDueUsers` kalıbı), `undefined` sahip de sahipsiz sayılıyor
  — `f5fd3c6` ile indi
- `tests/m4-weekly-summary.test.ts` — 4 regresyon testi (yeni dosya) — `f5fd3c6`
- `docs/agent-results/TASK-MTT1XL9NP2QYU-evidence/` — iki sonda + üç kanıt dosyası

## 5. Riskler

1. F-1 yayın sırasına bağlı: migration önce koşmazsa imha işi sessizce kırılır.
2. Sonda ölçüm için kolonu kısa süreliğine NOT NULL yapıp geri alıyor; **yalnız yerel dev
   veritabanında** koşulmalı, prod'da asla.
3. `m4WeeklySummary` sorgusu kiracı filtresi olmadan tüm kiracıları tarıyor (sistem işi olduğu
   için `withTenant` dışında). Bu kartla gelmedi, ama gruplama anahtarı artık tek savunma —
   bu yüzden "sahipsiz satırlar tek alıcıda birleşmez" testi kiracı sınırını da ölçüyor.

## 6. Açık sorular

1. Sahipsiz ilişkiler kiracıya nasıl gösterilecek — konsolda liste mi, haftalık özet e-postası mı?
2. `failedCount > 0` için `SystemAlert` bu sprintte mi açılacak (F-1/b)?

## 7. Sonraki adım

1. Kart kapatılabilir (`done`) — literal talep kanıtlı.
2. F-1/b + F-2 için takip kartı açıldı (yayın kontrol listesi + alarm + yeniden atama).
3. Prod açılışında `relationship-owner-nullable.sql` deploy'dan **önce** uygulanmalı.
