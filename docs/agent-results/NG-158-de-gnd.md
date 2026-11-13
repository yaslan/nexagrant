---
task: NG-158
card: TASK-MWFJJIIACBVS
agent: de-gnd
branch: task/ng-158-topic
base: dev @ 5399ce51
status: partial
blocker: isolated-db-verification (prisma db push guard, needs user consent)
platform: mac (darwin, Apple Silicon); Windows path handled in code, not run
---

# NG-158 — TR ajans çağrıları → Topic (son tarih + tutar)

## Ne yapıldı

- `persistAgencyRun` her ajans çağrısı için bir `Topic` yazıyor. Kimlik: `<callIdentifier>#1`, `identifier` üzerinden upsert (idempotent).
  - `title`, `status` (= `OPEN`, kaynaklar yalnız açık listeler), `sourceUrl`.
  - `deadlines` = `[{stage:1, at:<UTC ISO>, tz:"Europe/Istanbul"}]`; tarihsiz çağrıda `[]`.
  - `nextDeadlineAt` = tek son başvuru tarihi; tarihsizse `null`.
  - `budgetPerProjectCents` = azami destek (`supportMaxTl`, yoksa `supportMinTl`) × 100; tutar yoksa `null`.
- `planAgencyWrites` saf kaldı; `topicUpserts` alanı eklendi. Tarih ya da tutar ayrıştırılamazsa çağrı ve topic yine yazılır (alan boş), `SystemAlert` (`warn`, `dedupeKey` = `agency:unparsed:deadline:<callId>` / `agency:unparsed:budget:<callId>`) üretilir; koşu kırılmaz.
- `agencyPythonPath(workdir, platform)`: `win32` → `.venv\Scripts\python.exe`, diğerleri → `.venv/bin/python`. `collectAgencySource` bunu kullanıyor.
- Şema değişmedi (`prisma/schema.prisma` yok sayılmadı, dokunulmadı). `messages/*.json` ve başka modüller dokunulmadı.
- `workers/agencies/README.md`: "Henüz yapılmayanlar" içindeki tarih/tutar maddesi güncellendi (artık `Topic`'e yazılıyor).

## Değişen dosyalar

- `src/lib/jobs/tasks/tr-agency-calls.ts`
- `src/lib/jobs/tasks/__tests__/tr-agency-calls.test.ts`
- `workers/agencies/README.md`
- `docs/agent-results/NG-158-de-gnd.md` (bu dosya)

## Kanıt (ham çıktı)

vitest (tr-agency):
```
 RUN  v4.1.11 /Users/macbook/alan/.agentspace/worktrees/nexagrant/ng-158
 Test Files  1 passed (1)
      Tests  13 passed (13)
```
Yeni testler: tarihli çağrı (UTC + Istanbul, TL→kuruş, OPEN, sourceUrl), tarihsiz çağrı (`deadlines: []`, `nextDeadlineAt: null`, uyarı yok), ayrıştırılamayan tarih (çağrı yazılır + `agency:unparsed:deadline:*`), geçersiz tutar (`budgetPerProjectCents: null` + `agency:unparsed:budget:*`), ikinci koşuda aynı topic kimlikleri, `agencyPythonPath` (darwin/linux/win32).

pytest (workers/agencies, ağ kapalı):
```
12 passed, 1 warning in 0.14s
```

Dry run (DB'ye dokunmadan):
```
[jobs:tr-agency] istka: calls=1 rawFetch=yes alerts=0
```

eslint (`tr-agency-calls.ts`, test, `run-tr-agency.ts`): çıkış kodu 0.

tsc: `tr-agency*` dosyalarında hata yok. Worktree'de 7 hata var, hepsi bu değişiklikle ilgisiz eksik paket: `@tiptap/extension-list`, `@tiptap/extension-image` (`RichTextEditor.tsx`), `@axe-core/playwright` (`tests/e2e/a11y-aa.spec.ts`).

## Riskler

- **İzole DB doğrulaması TAMAMLANMADI (blokaj).** Pgvector konteyneri (`ng158-pg`, `127.0.0.1:55871`, DB `ng158`) boş olarak ayakta. Şema `prisma db push` ile basılamadı: Prisma Migrate, AI ajan tarafından çağrıldığı için kullanıcı onayı istiyor ve bunu bilerek aşmadım. Bu yüzden iki koşunun sayım kanıtı ve `SELECT identifier, "nextDeadlineAt", deadlines FROM "Topic" WHERE identifier LIKE 'ISTKA:%' OR identifier LIKE 'UA:%'` çıktısı henüz YOK. Kart DoD'undaki "idempotent — iki koşunun sayım kanıtı" maddesi bu yüzden işaretlenmedi.
- `.env` oluşturma komutu izin reddi aldı; repo'ya `.env` yazılmadı. DB bağlantısı için gereken DB ortam değişkeni ile yapılacak.
- Para birimi: `Topic`'te `currency` yok. `budgetPerProjectCents` TL kuruşu; döviz çevrimi yok. Tüketici bunu TRY olarak okumalı. Şema değişikliği olmadan çözülemez.
- `nextDeadlineAt` tek tarihli çağrı için bu tarih; geçmiş bir tarih olabilir. Status `OPEN` kaynak listesinden geliyor, süre kontrolü yapılmıyor.
- UA kaynağında son başvuru tarihi bu adaptörde yok (duyuru sayfası); bu kart kapsamı dışı (kart madde 5). Tüm UA topic'leri şu an `deadlines: []`.

## Açık sorular

1. Blokajı nasıl açmak istersin: (a) sen onaylayıp `prisma db push` çalıştırılsın, veya (b) repo'nun `db:setup` yolu mu kullanılsın? Her iki durumda izole DB'de koşu yapılır, sonra ham SQL çıktısı bu rapora eklenir.
2. `budgetPerProjectCents` TL kuruşu olarak mı kalsın, yoksa `Topic`'e para birimi alanı eklensin mi (şema işi)?

## Sonraki adım

- Onay gelince: izole DB'ye `db push` → `pnpm jobs:tr-agency -- --from-json <istka fixture>` iki kez → `SELECT` çıktısı + sayımlar bu rapora eklenir.
- Ardından kart DoD'undaki idempotency maddesi işaretlenir ve kart `review`'a alınır.

## Platform beyanı

- Doğrulandı: macOS (darwin). vitest, pytest, eslint, dry run koştu.
- Windows: `agencyPythonPath` `win32` dalı birim testle sınandı; gerçek Windows venv'de koşulmadı (koşulamadı, makinede Windows yok).
