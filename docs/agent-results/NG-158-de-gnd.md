---
sözleşme: 3
görev: TASK-MWFJJIIACBVS
kod: NG-158
ajan: de-gnd
motor: claude-haiku-5-5
tip: feature
okur: ekip
hüküm: "Bitti: TR ajans çağrıları Topic'e idempotent yazılıyor (izole DB'de 20→26→26 sayım kanıtı), Call.currency TRY, 14 birim test + 12 pytest + eslint temiz."
sürüm: 2
tarih: 2026-11-14
task: NG-158
card: TASK-MWFJJIIACBVS
agent: de-gnd
branch: task/ng-158-topic
base: dev @ 5399ce51
status: done
blocker: none
platform: mac (darwin, Apple Silicon); Windows path handled in code, not run
---

# NG-158 — TR ajans çağrıları → Topic (son tarih + tutar)

## Ne yapıldı

- `persistAgencyRun` her ajans çağrısı için bir `Topic` yazıyor. Kimlik: `<callIdentifier>#1`, `identifier` üzerinden upsert (idempotent).
  - `title`, `status` (= `OPEN`, kaynaklar yalnız açık listeler), `sourceUrl`.
  - `deadlines` = `[{stage:1, at:<UTC ISO>, tz:"Europe/Istanbul"}]`; tarihsiz çağrıda `[]`.
  - `nextDeadlineAt` = tek son başvuru tarihi; tarihsizse `null`.
  - `budgetPerProjectCents` = azami destek (`supportMaxTl`, yoksa `supportMinTl`) × 100; tutar yoksa `null`. Kuruş dönüşümü kod yorumuyla ve birim testle (20.000.000 TL → 2.000.000.000 kuruş) sınandı.
- **Para birimi (lider kararı):** şema değişmedi. `Call` kaydı create ve update'te `currency: TR_AGENCY_CURRENCY` (= `'TRY'`) alıyor; önceki şema varsayılanı EUR'du, mevcut satırlar da bir sonraki koşuda TRY'ye düzelir. `Topic`'te döviz alanı yok; tutarlar TL kuruşu, döviz çevrimi yok.
- `planAgencyWrites` saf kaldı; `topicUpserts` alanı eklendi. Tarih ya da tutar ayrıştırılamazsa çağrı ve topic yine yazılır (alan boş), `SystemAlert` (`warn`, `dedupeKey` = `agency:unparsed:deadline:<callId>` / `agency:unparsed:budget:<callId>`) üretilir; koşu kırılmaz.
- `agencyPythonPath(workdir, platform)`: `win32` → `.venv\Scripts\python.exe`, diğerleri → `.venv/bin/python`. `collectAgencySource` bunu kullanıyor.
- Şema, `messages/*.json` ve diğer modüller dokunulmadı.
- `workers/agencies/README.md`: "Henüz yapılmayanlar" içindeki tarih/tutar maddesi güncellendi.

## Değişen dosyalar

- `src/lib/jobs/tasks/tr-agency-calls.ts` (TR_AGENCY_CURRENCY, Call.currency, kuruş yorumu)
- `src/lib/jobs/tasks/__tests__/tr-agency-calls.test.ts` (TRY + kuruş testi eklendi; toplam 14)
- `workers/agencies/README.md`
- `docs/agent-results/NG-158-de-gnd.md` (bu dosya)

Not: koşu fixture'ları (`istka.json`, `ua.json`) repoya girmedi; `workers/agencies/tests/fixtures/*.html` dosyalarından Python `run_source` ile **çevrimdışı** üretildi (ağ yok), `rawFetch` gövdesi dahil. Üretici betik: `/private/tmp/claude-501/-Users-macbook-alan--agentspace-worktrees-nexagrant-ng-158/b77dbed6-b234-4572-9b81-397f3d389e67/scratchpad/make_fixture.py`.

## Kanıt (ham çıktı)

### İzole DB kurulumu

`ng158-pg` (127.0.0.1:55871, DB `ng158`), `.env` yazılmadan, URL komut satırından:

```
DATABASE_URL="postgresql://fabrika:fabrika@127.0.0.1:55871/ng158" pnpm db:setup
...
apply-migrations: 68 files applied as fabrika
db-setup: [6/7] db:rls
✅ prisma/rls.sql applied. Policies in public: 163 → 163
db-setup: [7/7] db:seed
...
db-setup: done (127.0.0.1:55871/ng158)        EXIT=0
```

Brief'in 1. adımındaki `prisma migrate deploy` kullanılmadı: `prisma.config.ts` onu reddediyor ve repo kuralı (CLAUDE.md, `scripts/db-setup.sh`) bunun yerine `pnpm db:setup`'ı zorunlu kılıyor. `db push` onay istemedi.

### Koşu 1 ve 2 (kodun son hâli, ajans satırları sıfırlandıktan sonra)

Sıfırlama: yalnız `ISTKA:%` / `UA:%` Topic ve Call satırları silindi (`DELETE 6`, `DELETE 6`). Başlangıç sayımı 20 (seed).

```
== RUN 1 istka
[jobs:tr-agency] istka: calls=1 rawFetch=yes alerts=0
[jobs:tr-agency] istka: {"rawFetchWritten":false,"callsCreated":1,"callsUpdated":0,"topicsCreated":1,"topicsUpdated":0,"alertsRecorded":0}
== RUN 1 ua
[jobs:tr-agency] ua: calls=5 rawFetch=yes alerts=0
[jobs:tr-agency] ua: {"rawFetchWritten":false,"callsCreated":5,"callsUpdated":0,"topicsCreated":5,"topicsUpdated":0,"alertsRecorded":0}
== COUNT AFTER RUN 1: SELECT count(*) FROM "Topic"  → 26
== RUN 2 istka
[jobs:tr-agency] istka: calls=1 rawFetch=yes alerts=0
[jobs:tr-agency] istka: {"rawFetchWritten":false,"callsCreated":0,"callsUpdated":1,"topicsCreated":0,"topicsUpdated":1,"alertsRecorded":0}
== RUN 2 ua
[jobs:tr-agency] ua: calls=5 rawFetch=yes alerts=0
[jobs:tr-agency] ua: {"rawFetchWritten":false,"callsCreated":0,"callsUpdated":5,"topicsCreated":0,"topicsUpdated":5,"alertsRecorded":0}
== COUNT AFTER RUN 2: SELECT count(*) FROM "Topic"  → 26
```

`rawFetchWritten: false` her iki koşuda da: RawFetch satırları önceki (hash'li) koşudan kalmıştı, Call/Topic sıfırlanıp yeniden yazıldı. Bu, ilk koşuda `rawFetchWritten:true` olduğu önceki turdaki gözlemle uyumlu.

### Sorgu çıktısı (her koşu sonrası, ham)

`SELECT identifier, "nextDeadlineAt", deadlines FROM "Topic" WHERE identifier LIKE 'ISTKA:%' OR identifier LIKE 'UA:%' ORDER BY identifier;` — Run 1 ve Run 2 çıktıları birebir aynı:

```
                                        identifier                                         |   nextDeadlineAt    |                               deadlines                               
-------------------------------------------------------------------------------------------+---------------------+-----------------------------------------------------------------------
 ISTKA:İSTKA/2026/YEG#1                                                                    | 2026-12-04 20:59:00 | [{"at": "2026-12-04T20:59:00Z", "tz": "Europe/Istanbul", "stage": 1}]
 UA:2026_ka2_r1#1                                                                          |                     | []
 UA:2026-yili-avrupa-dayanisma-programi-esc-teklif-cagrisi-ve-program-rehberi-yayimlandi#1 |                     | []
 UA:2026-yili-erasmus-teklif-cagrisi-ve-program-rehberi-yayimlandi#1                       |                     | []
 UA:avrupa-dayanisma-programi-gonulluluk-faaliyeti-esc51-proje-uygulama-el-kitabi#1        |                     | []
 UA:ka240-projeleri-basvuru-sonuclari#1                                                    |                     | []
(6 rows)
```

Para birimi kontrolü (`SELECT "callIdentifier", currency FROM "Call" WHERE …`): 6 satırın 6'sı `TRY`. Başlık sütunu uzun olduğu için burada kısaltılmadan yazılmadı; sorgu tekrar koşulabilir.

Ham koşu günlüğü: `/private/tmp/claude-501/-Users-macbook-alan--agentspace-worktrees-nexagrant-ng-158/b77dbed6-b234-4572-9b81-397f3d389e67/scratchpad/run-evidence-final.log`

### Testler ve statik kontrol

vitest (tr-agency):
```
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

pytest (workers/agencies, ağ kapalı):
```
12 passed, 1 warning in 0.12s
```

eslint (`tr-agency-calls.ts`, test, `run-tr-agency.ts`): çıkış kodu 0.

tsc: `tr-agency*` dosyalarında hata yok. Worktree'de bu değişiklikle ilgisiz eksik paketlerden hatalar var (`@tiptap/extension-list`, `@tiptap/extension-image`, `@axe-core/playwright`).

Yeni/değişen testler: tarihli çağrı (UTC + Istanbul, TL→kuruş, OPEN, sourceUrl), **TRY + kuruş (20.000.000 TL → 2.000.000.000 kuruş)**, tarihsiz çağrı (`deadlines: []`, `nextDeadlineAt: null`, uyarı yok), ayrıştırılamayan tarih, geçersiz tutar, ikinci koşuda aynı topic kimlikleri, `agencyPythonPath` (darwin/linux/win32).

## Riskler

- **UA son başvuru tarihi yok (kart kapsamı dışı, madde 5).** UA adaptörü duyuru sayfasından çalışıyor; tüm UA topic'leri `deadlines: []`, `nextDeadlineAt: null`.
- `nextDeadlineAt` geçmiş bir tarih olabilir; `status` `OPEN` kaynak listesinden geliyor, süre kontrolü yapılmıyor.
- Döviz çevrimi yok: `budgetPerProjectCents` TL kuruşu. Tüketici bunu `Call.currency` = TRY ile birlikte okumalı.
- `rawFetchWritten` ilk kez yazılan ham kayıt için `true` olur (önceki turda gözlendi); bu koşuda RawFetch önceden vardı.
- Veri, izole DB'deki demo seed'in üstüne yazıldı; `fabrika` paylaşımlı DB'ye dokunulmadı.

## Açık sorular

Yok. Önceki turdaki iki soru çözüldü:
1. Blokaj: `db:setup` ile izole DB'de koşuldu (bkz. Kanıt).
2. Para birimi: lider kararı uygulandı (`Call.currency = TRY`, `Topic` şeması değişmedi).

## Sonraki adım

- Kart `review` durumuna alınabilir; DoD maddelerinin tamamı kanıtla karşılandı.
- UA son başvuru tarihi için ayrı bir kart açılması önerilir (UA duyuru sayfasında tarih yapısı araştırılacak).

## Platform beyanı

- Doğrulandı: macOS (darwin, Apple Silicon). vitest, pytest, eslint, `db:setup`, iki koşu (sayım ve SELECT kanıtı) bu makinede koştu.
- Windows: `agencyPythonPath` `win32` dalı birim testle sınandı; gerçek Windows venv'de koşulmadı (koşulamadı: makinede Windows yok).
