# TASK-MTRK9FMKE3GSB — bağımsız doğrulama (salt-okunur)

**Ajan:** ex-en (Araştırmacı / Explorer) · **Tip:** verification · **Tarih:** 2026-09-08
**Görev:** `blockzincir-pm` ve `geli-tirici` raporlarının numaralı her iddiasını kendi
komutumla tekrar koşturmak. **Hiçbir kaynak dosya değiştirilmedi.**
**Doğrulanan taban:** `e0340c7` (dev)

> **Karar: KART KAPATILABİLİR — ama yalnız TypeScript kapsamı için.**
> Kartın orijinal iddiası ("CORDIS senkron işleri şemada olmayan tabloya yazıyor") o gün
> DOĞRUYDU ve TS tarafında gerçekten kapatılmış; bunu mock'la değil, **canlı Postgres'e karşı
> koşarak** doğruladım. Ancak **K2 boru hattı uçtan uca hâlâ çalışmaz**: Python worker aynı
> sınıftan hatayı taşıyor (§4.1) ve üstelik bu hata TS tarafına **hiç görünmüyor** (§4.3, yeni bulgu).

---

## 1. Ne yapıldı

Raporların manşetine bakılmadı; her numaralı iddia için kendi komutu koşuldu. Kapı ölçümleri,
paralel ajanların commit'lenmemiş dosyalarından etkilenmemek için **HEAD'den açılan izole bir
git worktree'de** koşuldu (worktree iş sonunda kaldırıldı).

Ölçüm ortamı notu: `node_modules/.prisma` yoktu, yani `@prisma/client` çalışma zamanında boştu.
Gerçek DB'ye karşı koşabilmek için `npx prisma generate` çalıştırıldı — **yalnız `node_modules`'a
yazar, hiçbir repo dosyası değişmez**.

---

## 2. Kanıt — hangi komut neyi kanıtladı

### 2.1 `prisma.organization` kalan çağrı var mı? → İDDİA DOĞRU (canlı çağrı yok)

```
$ grep -rn "prisma\.organization\b" src/ tests/ scripts/ prisma/ workers/
```
19 eşleşme; **hiçbiri çalışan çağrı değil** — 17'si dosya başlığı yorumu, 2'si tam tersini
doğrulayan test (`tests/cordis-rag.test.ts:50`, `tests/cordis-delta.test.ts:61`:
`expect(db.prisma.organization).toBeUndefined()`).

### 2.2 Canlı Postgres şemayla uyuşuyor mu? → EVET

Prisma'yı hiç kullanmadan, doğrudan `pg` ile `information_schema.columns`:

```
CordisProject        id,rcn,acronym,title,objective,status,framework,masterCall,subCall,
                     fundingScheme,legalBasis,startDate,endDate,ecSignatureDate,totalCost,
                     ecMaxContribution,grantDoi,contentUpdateDate,rawJson,importedAt
CordisOrganization   organisationId,name,nameNormalized,shortName,vatNumber,activityType,sme,
                     country,city,postCode,nutsCode,geolocation,url,isTurkish,rawJson,updatedAt
CordisParticipation  projectId,organisationId,role,order,ecContribution,netEcContribution,
                     totalCost,endOfParticipation,active
CordisProjectTopic   projectId,topicCode,topicTitle
RawFetch             id,source,key,hash,storageUrl,payload,fetchedAt
SystemAlert          id,level,source,message,meta,createdAt,resolvedAt
```

`cordis-sync.ts`, `cordis-delta.ts`, `k2-cordis/raw-fetch.ts` içindeki her model/alan adı bu
listede var. **Ama statik eşleşme kanıt değildir** — asıl ölçüm 2.3.

### 2.3 GERÇEK DB'YE KARŞI KOŞU — `persistCordisRecord`, iki kez (kartın (b)+(c) maddesi)

Mock yok: repo'nun kendi `prisma` tekili, canlı `localhost:5432/fabrika`.

```
BEFORE          {"project":20,"org":0,"part":0,"topic":20,"rawFetch":1274,"alert":5}
RUN1 persist    true {"project":21,"org":1,"part":1,"topic":21,"rawFetch":1274,"alert":5}
RUN2 persist    true {"project":21,"org":1,"part":1,"topic":21,"rawFetch":1274,"alert":5}  <- idempotent
AFTER CLEANUP   {"project":20,"org":0,"part":0,"topic":20,"rawFetch":1274,"alert":5}
```

Postgres'e gerçekten düşen satırlar (mock'un asla kanıtlayamayacağı şey):

```
CordisProject       {"id":"EXEN-VERIFY-2","framework":"HORIZON","rcn":"r2","acronym":"EX2",
                     "ec":"1234567","rawJson":{"aBrandNewUpstreamColumn":"drift-exen"}}
CordisOrganization  {"organisationId":"EXEN-PIC-2","name":"EX-EN Probe Org 2",
                     "nameNormalized":"EX-EN PROBE ORG 2","country":"TR","isTurkish":true,...}
CordisParticipation {"projectId":"EXEN-VERIFY-2","organisationId":"EXEN-PIC-2",
                     "role":"coordinator","ec":"1234567"}
CordisProjectTopic  {"projectId":"EXEN-VERIFY-2","topicCode":"EXEN-T2","topicTitle":null}
```

**Drift (CLAUDE.md #6) doğrulandı:** eşlenmeyen üst-kaynak alanı `rawJson`'da korundu, koşu
kırılmadı, alert yazıldı:
```
{"level":"warn","source":"cordis-sync",
 "message":"CORDIS record carried fields this importer does not map",
 "meta":{"projectId":"EXEN-VERIFY-2","unknownFields":["aBrandNewUpstreamColumn"]}}
```

**`recordRawFetch` "değiştiğinde yaz" doğrulandı** (aynı koşuda, gerçek tabloya):
```
[{"status":"recorded","hash":"015abd7f…"},   <- ilk
 {"status":"unchanged","hash":"015abd7f…"},  <- aynı gövde, satır eklenmedi
 {"status":"recorded","hash":"7e8059f4…"}]   <- gövde değişti, yeni satır
```
Probe'un yazdığı her satır silindi; sayımlar başlangıca döndü (yukarıda `AFTER CLEANUP`).

### 2.4 `pnpm jobs:k2` gerçekten var ve iddia edilen gibi davranıyor mu? → EVET

```
$ npx tsx scripts/run-k2-monthly.ts --month 2026-09
[jobs:k2] start 2026-09-08T04:48:42.195Z month=2026-09
[jobs:k2] { "success": false, "message": "fetch failed", "error": "fetch failed" }
[jobs:k2] FAILED — the worker did not take the job. A SystemAlert was written; …
REAL_EXIT=1
```
Worker bu makinede ayakta değil — pm'in 2.4'teki durumu birebir yeniden üretildi. Alert
gerçekten yazıldı ve **kimlik bilgisi sızdırmıyor** (yalnız `host`):
```
{"level":"error","source":"k2_monthly_cordis","message":"CORDIS worker unreachable: fetch failed",
 "meta":{"host":"localhost:8000","month":"2026-09"}}
```
Aynı sorguda pm'in **2026-09-07T19:42:45** tarihli özgün alert satırı da DB'de duruyor —
raporlarının gerçekten koştuğunun bağımsız teyidi.

### 2.5 K1 idempotency — üç koşu (kartın (c) maddesi)

```
BEFORE       {"Call":430,"Topic":1288,"RawFetch":1274,"SystemAlert":7,"Programme":9}
AFTER RUN 1  {"Call":430,"Topic":1288,"RawFetch":2486,"SystemAlert":8,"Programme":9}
AFTER RUN 2  {"Call":430,"Topic":1288,"RawFetch":2486,"SystemAlert":9,"Programme":9}
AFTER RUN 3  {"Call":430,"Topic":1288,"RawFetch":2486,"SystemAlert":10,"Programme":9}
```
`Call`/`Topic`/`Programme` üç koşuda da kıpırdamadı → **normalize tablolar idempotan, iddia doğru.**
`RawFetch` RUN 1'de +1212 büyüdü, RUN 2–3'te sabit kaldı → bu **üst kaynağın bir günde gerçekten
değişmesi**, regresyon değil ("değiştiğinde yaz" böyle çalışıyor). Ayrıntı §3.2'de.
`SystemAlert` **her koşuda +1** → §4.2, yeni bulgu.

### 2.6 Kapı — HEAD'den izole worktree'de (paralel ajanların kirinden arınmış)

| Aşama | Komut | Sonuç |
|---|---|---|
| typecheck | `npx tsc --noEmit` | ✅ **exit 0**, çıktı 0 satır |
| lint | `npx eslint .` | ✅ **exit 0** — `15 problems (0 errors, 15 warnings)` |
| test | `npx vitest run --passWithNoTests` | ✅ **exit 0** — `Test Files 96 passed \| 2 skipped`, `Tests 1075 passed \| 8 skipped`, **0 fail** |
| rls:check | `npx tsx scripts/check-rls.ts` | ✅ `All 41 tenant-scoped models have RLS policies registered.` |
| rls:verify | `npx tsx scripts/check-rls-live.ts` | ✅ `41 kiracıya özel tablonun tamamında izolasyonu uyguluyor.` |

### 2.7 Şema-sözleşme koruması gerçekten koruyor mu? → KISMEN (deneyle ölçüldü)

`src/modules/m8/server/schema-contract.test.ts` şemayı parse edip **tüm `src/`**'i mock'suz
tarıyor ve iki muafiyet listesi de **boş** (satır 80, 93). Kapsamını uydurmadım, worktree'de
uydurma bir kolon enjekte edip ölçtüm:

```
A) create/data gövdesine:  create: { id: projectId, totallyBogusColumn: 'x', … }
   → Tests 11 passed — YAKALAMADI (exit 0)

B) where gövdesine:        where: { id: projectId, totallyBogusColumn: 'x' }
   → Tests 1 failed — YAKALADI (exit 1):
     "cordisProject.upsert.where.totallyBogusColumn — `totallyBogusColumn` is not a
      field of model `CordisProject` in prisma/schema.prisma"
```
(Deney izole worktree'de yapıldı, `git checkout --` ile geri alındı; kullanıcının çalışma
ağacına dokunulmadı.) → §4.4.

### 2.8 Kanıt dosyalarının mtime'ı (kartın (d) maddesi) → TUTARLI

| Dosya / commit | Zaman |
|---|---|
| `src/lib/cordis-{sync,delta}.ts` | 21:29:13 |
| `TASK-…-geli-tirici.md` | 21:32:11 |
| commit `b0b2ccd` | 21:34:16 |
| `k2-cordis/raw-fetch.ts` · `scripts/run-k2-monthly.ts` | 22:41–22:42 |
| `TASK-…-blockzincir-pm.md` | 22:49:36 |
| commit `9544224` | 22:49:58 |

Her rapor kendi kaynak dosyalarından **sonra** yazılmış, commit'i de raporundan sonra.
Eski bir koşunun kanıtının geri dönüştürüldüğüne dair işaret yok; DB'deki 19:42:45 alert satırı
da bunu bağımsız olarak destekliyor.

---

## 3. Raporlarla farklılıklar (yanlış değil — BAYAT)

**3.1 Kapı durumu artık daha iyi.** `blockzincir-pm` §2.7 `4 failed` test ve `80 warning`,
`geli-tirici` §2.6 `lint 2 errors` (`src/lib/billing/plan-repository.ts:169-170`) bildirmişti.
HEAD'de ölçtüm: **0 fail / 1075 pass, 0 lint error, 15 warning.** İkisi de kirli bir ağacın
anlık görüntüsünü raporlamış; commit'lenmiş hâl temiz. İddiaları o an doğruydu, bugün geçersiz.

**3.2 "RawFetch değişmedi" ifadesi yanıltıcı okunabilir.** pm §2.2 (`RUN A/RUN B: 1274 → 1274`)
arka arkaya iki koşu için doğru ve ben de doğruladım. Ama tablo **her gün ~1200 satır büyüyor**
(1274 → 2486, tek gün). Bu tasarım gereği; yine de "tam idempotan" ifadesi tabloyu sabit
sanmaya davet ediyor. pm bunu kendi Risk #4'ünde zaten işaretlemiş — saklama politikası hâlâ yok.

**3.3 Ölçüm ortamı kırılgan.** `node_modules/.prisma` yoktu; `npx prisma generate` çalıştırmadan
gerçek DB'ye karşı hiçbir şey koşulamıyor. Her iki rapor da bunu "sistemik iş" diye işaretlemiş
(`prisma generate` kurulumun/kapının parçası değil) — doğru teşhis, hâlâ açık.

---

## 4. AÇIK KALAN maddeler (dosya:satır)

**4.1 `workers/cordis/main.py` şemada olmayan üç tabloya yazıyor — DOĞRULANDI.**
`workers/cordis/main.py:99` `INSERT INTO "Organization"`, `:119` `INSERT INTO "Project"`,
`:131` `INSERT INTO "Participation"`. Canlı DB'ye sordum:
```
Worker hedef tablolari, canli DB'de bulunanlar: HICBIRI YOK
public semadaki toplam tablo sayisi: 71
```
Kartın TS tarafında kapattığı hatanın **aynısı**, Python tarafında duruyor. pm'in açık soru #1'i
doğru; bu yüzden bu kart K2'yi uçtan uca kapatmıyor.

**4.2 YENİ — `SystemAlert`'in tekrar koruması yok, her koşuda aynı satır yeniden yazılıyor.**
`src/lib/observability/system-alert.ts:139` düz `systemAlert.create`; ne dedupe, ne throttle.
Ölçüm (gerçek DB, `group by`):
```
k2_monthly_cordis  error  "CORDIS worker unreachable: fetch failed"          n=3
k1_daily_calls     warn   "K1 sources returned 2 identifier(s) more than…"   n=3
```
Aynı metin, aynı `meta`. K1 her gece koştuğuna göre bu **gecede bir özdeş satır, sonsuza dek** —
kopya-identifier sorunu üst kaynakta sürdüğü sürece. `/admin/alerts` ekranı gerçek sinyali
gömecek. Hiçbir rapor bunu saymadı (pm'in idempotency tablosunda `SystemAlert` sütunu yok).

**4.3 YENİ — worker'ın başarısızlığı TS tarafına GÖRÜNMÜYOR; 4.1 düzelse bile K2 yalan söyler.**
`workers/cordis/main.py:145` `trigger_cordis` işi `BackgroundTasks`'a atıp **hemen** `200
{"message": "CORDIS pipeline triggered"}` dönüyor; asıl iş sonra koşuyor ve `:141`
`except Exception as e: print(...)` ile hatayı yutuyor. Yani `k2-monthly-cordis.ts` boru hattı
tamamen çökmüş olsa bile `success:true` yazar. 4.1 tek başına düzeltilse bile K2'nin
"başarılı koşu" raporu kanıt değeri taşımaz — yeni kart bu ikisini birlikte ele almalı.

**4.4 YENİ — şema-sözleşme koruması yazma gövdesini (`create`/`update`/`data`) taramıyor.**
`src/modules/m8/server/schema-contract.test.ts:103` — `FIELD_BEARING` yalnız
`where/select/include/orderBy`. §2.7'deki deney bunu ölçtü: uydurma kolon `where`'de yakalanıyor,
`create`'te geçiyor. Kartın uyardığı "hayalet kolon" sınıfının **yazma yarısı hâlâ kapıya
görünmez** — bu koda özgü değil, repo geneli bir boşluk.

**4.5 `recordRawFetch` her hatayı yutuyor.** `src/lib/k2-cordis/raw-fetch.ts:72-77` — yanlış bir
kolon adı `status:'failed'` olarak sessizce dönerdi, iş kırılmazdı. Denetim yazarı için
bilinçli bir tasarım (yorumda yazıyor) ama şu sonucu doğuruyor: **bu dosyanın doğruluğu ancak
gerçek DB koşusuyla kanıtlanabilir, testle değil.** §2.3'te gerçek DB'ye karşı koştu ve çalışıyor.

**4.6 `workers/README.md:3` `?month=YYYY-MM` diyor, worker parametreyi okumuyor.**
`k2-monthly-cordis.ts:43` parametreyi doğru gönderiyor; `main.py:145` imzasında `month` yok.
pm'in açık soru #2'si doğrulandı.

**4.7 Kapsam dışı gözlem — doğrulama sırasında dosya değişti.** `src/lib/k2-cordis/importer.ts`
işe başlarken temizdi, bitişte `M` (tek satır, `catch (err)` → `catch`). Paralel bir ajanın
uçuştaki işi; bulgularımı etkilemiyor, sahibinin haberi olsun.

---

## 5. DB'de bıraktıklarım (dürüstlük notu)

Probe'un yazdığı **her satır silindi** (§2.3). Bilerek bırakılanlar, çünkü gerçek koşuların
ürünü: 2 adet `k2_monthly_cordis` "worker unreachable" alert'i ve 3 adet `k1_daily_calls`
kopya-identifier alert'i (benim üç K1 koşumdan), artı K1'in gerçekten içeri aldığı
`RawFetch` 1274 → 2486 büyümesi. `Call`/`Topic`/`Programme` sayıları başladığı yerde: 430/1288/9.

---

## 6. Değişen dosyalar

**Hiçbir kaynak/test/şema dosyası değiştirilmedi.** Yalnız bu rapor eklendi
(`docs/agent-results/TASK-MTRK9FMKE3GSB-blockzincir-pm-2.md`, kopyası
`…-ex-en.md`). `npx prisma generate` çalıştırıldı — çıktısı yalnız `node_modules` altında,
commit edilmez. Doğrulama worktree'si kaldırıldı; geçici probe script'leri silindi.

---

## 7. Riskler

1. **Kart "done" işaretlenirse K2 bitmiş sanılabilir.** Bitmedi — §4.1 + §4.3 duruyor.
2. **§4.2 sessiz bir büyüme yolu.** Kimse `SystemAlert`'e bakmıyor, tablo her gece büyüyor.
3. **§4.4 sınıfı yeniden açabilir.** Yazma tarafındaki hayalet kolon bugün kapıdan geçer.

---

## 8. Açık sorular

1. §4.1 ve §4.3 tek kartta mı toplanacak? (Worker düzeltilmeden K2'nin "başarılı" raporu
   kanıt değil — ikisi birlikte ele alınmazsa yeşil bir yalan üretilir.)
2. `RawFetch` saklama politikası kimin kararı? Günde ~1200 satır.
3. §4.2 için doğru davranış ne: alert dedupe/throttle mı, yoksa `/admin/alerts` tarafında
   gruplama mı? Bu bir ürün kararı.

---

## 9. Sonraki adım

1. **Kart `done`'a alınabilir** — kapsamı (TS tarafı) uçtan uca, gerçek Postgres'e karşı
   doğrulandı; kapı beş ayakta da yeşil.
2. **Yeni kart (yüksek öncelik):** `workers/cordis/main.py` — §4.1 (olmayan tablolar) + §4.3
   (hatanın TS'e görünmemesi) + §4.6 (`month` parametresi) birlikte.
3. **Yeni kart:** §4.4 — `schema-contract.test.ts` `FIELD_BEARING`'ine yazma gövdesi eklensin.
4. **Yeni kart / karar:** §4.2 alert tekrarı.
