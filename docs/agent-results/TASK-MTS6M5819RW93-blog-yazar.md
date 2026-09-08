# TASK-MTS6M5819RW93 — `/calls` "Aramayı Kaydet": gerçek yazma akışı (create/list/delete + notify)

## 0. Kartın iddiası — doğrulama

Kart doğru: `handleSaveSearch` (`calls/page.tsx:190-196`, görev başlamadan önceki hâliyle) yalnızca
`await new Promise(resolve => setTimeout(resolve, 500))` yapıp bir toast gösteriyordu — hiçbir API
çağrısı yoktu, `prisma.savedSearch.create` depoda hiç yoktu (bunu ben, bir önceki görevde de
bulup `docs/agent-results/TASK-MTRNQN0NNVBYM-blog-yazar.md`'de "bildirildi, dokunulmadı" olarak
işaretlemiştim — bu görev o takip kartı). `SavedSearch` modeli ve `tenant_isolation` RLS politikası
ise şemada zaten vardı (`prisma/schema.prisma:511`, `prisma/rls.sql:10`) — ölçtüm, gerçek DB'ye
karşı doğruladım (aşağıya bakın), migration gerekmedi.

## 1. Ne yapıldı

- **`src/app/api/saved-searches/route.ts`** (yeni) — `GET` (kendi aramalarını listele) ve `POST`
  (yeni kayıtlı arama oluştur). İkisi de `requireTenantApi()` + `withTenant(tenantId, tx => ...)`
  (CLAUDE.md kural 1). `filters` gövdesi, `alerts-daily.ts`'in dışa açtığı
  `SavedSearchFiltersSchema`'dan (tek kaynak, import) doğrulanıyor — burada tekrar tanımlanmadı,
  çünkü alan adları (`q`/`status`) orada ile burada ayrışırsa cron sessizce "filtresiz" davranışa
  düşüyor (o dosyadaki uyarı).
- **`src/app/api/saved-searches/[id]/route.ts`** (yeni) — `PATCH` (`notify` anahtarını değiştir) ve
  `DELETE`. İkisi de `id + tenantId + userId` ile daraltılır (`updateMany`/`deleteMany`, `count`
  kontrolü ile 404), böylece bir kurum üyesi başka bir üyenin kayıtlı aramasını değiştiremez/silemez.
- **`src/app/[locale]/(app)/[workspace]/calls/page.tsx`** — `handleSaveSearch` artık gerçek
  `POST /api/saved-searches` çağırıyor; sayfa yüklenince `GET` ile liste çekiliyor; yeni "Kayıtlı
  Aramalarım" paneli her satırda ad, `Bildirim` checkbox'ı (PATCH) ve `Sil` linki (DELETE)
  gösteriyor; hata durumunda kırmızı bir uyarı çubuğu var (önceden hata hiç gösterilmiyordu).
  React 19 "cascading render" lint kuralına uymak için ilk yükleme effect'i mevcut `/api/cagrilar`
  effect'iyle aynı `void (async () => {...})()` deseniyle yazıldı (satır ~150'deki desenle aynı).
- **`src/types/db-rows.ts`** — `SavedSearchRow` eklendi (dosyanın kendi kuralı: her sorgulanan model
  için elle yazılmış bir satır tipi, çünkü `prisma generate` bu depoda çalışmıyor).
- **`messages/tr.json` / `messages/en.json`** — 4 yeni anahtar (`saveSearchError`,
  `savedSearchesTitle`, `notifyLabel`, `deleteSavedSearchLabel`), iki dile de.
- **`docs/DATA_MODEL.md`** — §12: yazma akışının rota listesi ve **kişisel liste** kararının
  (`tenantId`+`userId` daraltması, `alerts-daily`'nin kiracı-geneli sorgusundan bağımsız) "neden"i.
- Migration/`rls.sql` **değişmedi** — tablo zaten vardı, RLS zaten kapsıyordu (bkz. Kanıt).

## 2. Kanıt (bu koşuda üretildi)

### 2.1 Tablo zaten vardı, RLS zaten kapsıyordu (migration'a gerek olmadığının kanıtı)
```
$ pnpm exec tsx -e "... SELECT to_regclass('\"SavedSearch\"')::text as exists ..."
[{"exists":"\"SavedSearch\""}]

$ pnpm rls:check
✅ SUCCESS: All 41 tenant-scoped models have RLS policies registered.
   (SavedSearch listede.)
```

### 2.2 Otomatik testler (yeni, mock tabanlı — 14 test)
```
$ pnpm exec vitest run src/app/api/saved-searches
 Test Files  2 passed (2)
      Tests  14 passed (14)
```

### 2.3 Uçtan uca kanıt — gerçek Postgres, gerçek route handler'lar (geçici test dosyasıyla, koştuktan sonra silindi)
```
$ pnpm exec vitest run src/app/api/saved-searches/__tmp_e2e_proof.test.ts --reporter=verbose
POST status: 201 {"success":true,"search":{"id":"cmts6ztt300003bxkcydwoaxh","tenantId":"cmtrhjys10001ncxk13gwtbcb","userId":"cmtrhjyry0000ncxkbm1xnfma","name":"HORIZON-CL5 route-handler-proof","filters":{"q":"HORIZON-CL5","status":["OPEN"]},"notify":true,"lastRunAt":null,"createdAt":"2026-09-08T04:51:40.071Z"}}
GET status: 200 count: 1
DELETE status: 200 {"success":true}
GET after delete count: 0
 ✓ ... 116ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### 2.4 alerts-daily artık gerçekten görüyor — "gece düzelttiğin eşleşme sayısı" gerçek bir DB sorgusu üretiyor
```
$ pnpm exec tsx -e "... import { SAVED_SEARCH_ALERT_QUERY, matchCountQuery, ownerEmailQuery } from './src/lib/inngest/jobs/alerts-daily'; ..."
created via real writer: cmts707g700009xxk9swosr45
alerts-daily sees 1 notify:true row(s); includes ours: true
matchCountQuery where: {"fetchedAt":{"gt":"2026-09-08T04:51:57.751Z"},"status":{"in":["OPEN"]}}
real matchCount for this saved search: 0
owner email lookup ok: true
cleaned up
```
`alerts-daily`'nin kendi `SAVED_SEARCH_ALERT_QUERY`'si bu görevden önce hiçbir zaman bir satır
görmüyordu (yazıcı yoktu); şimdi görüyor, ve `matchCountQuery` gerçek bir `prisma.topic.count`
üretiyor (0 döndü çünkü bu satırdan sonra hiç yeni `Topic` çekilmedi — sabit/uydurma değil, gerçek
ölçüm).

### 2.5 Gerçek tarayıcıda tıklama (AgentSpace internal browser, `owner@demo.fabrika.test` ile giriş)
- `/tr/default/calls`: "HORIZON-CL5" yazıldı → **Aramayı Kaydet & Bildirim Al** tıklandı → yeşil
  "Arama kaydedildi (HORIZON-CL5)..." mesajı + "Kayıtlı Aramalarım" paneli belirdi.
- Sayfa **yeniden yüklendi** → kayıt hâlâ listede (gerçek DB'den geldiğinin kanıtı, state'ten değil).
- **Bildirim** checkbox'ı kaldırıldı → sayfa yeniden yüklendi → işaretsiz kaldı (PATCH kalıcı).
- **Sil** tıklandı → panel kayboldu (liste boşaldı).
- `/en/default/calls`'da aynı akış İngilizce metinlerle tekrarlandı ("Save Search & Alert" /
  "Search saved for..." / "My Saved Searches" / "Notify" / "Delete") — sil ile temizlendi.
- Ekran görüntüleri bu oturumda alındı, kalıcı dosyaya yazılmadı (görev dosya listesi buna izin
  vermiyordu); istenirse tekrar üretilebilir — akış yukarıda adım adım anlatıldı.
- DB'de artık iz yok: `prisma.savedSearch.count({ where: { tenantId } })` → `0`.

Not (yol tuzağı): tarayıcı aracının `click` action'ı `button:has-text(...)` ile
`guest eval failed: Uncaught` verdi (Playwright'a özgü sözde-sınıf, gerçek CSS değil).
`button.border-accent` de yanlış elemanı (aktif "Tüm Programlar" sekmesi, aynı sınıfı taşıyor)
tıkladı — sessizce hiçbir şey olmadı. `button.border-accent.text-accent` (yalnızca kaydet
düğmesinin taşıdığı çift) doğru elemanı buldu. Kaydedildi: [[agentspace-browser-click-fallback-playwright]].

### 2.6 Kapı
```
$ pnpm lint        → 0 errors (9 pre-existing warning, benim dosyalarımda değil)
$ pnpm typecheck   → temiz (tsconfig.tsbuildinfo silinip tekrar koşuldu — kanıt için, bkz. Riskler)
$ pnpm test        → Test Files 99 passed | 2 skipped (101) — Tests 1127 passed | 8 skipped (1135)
```

## 3. Değişen dosyalar
- `src/app/api/saved-searches/route.ts` (yeni)
- `src/app/api/saved-searches/route.test.ts` (yeni)
- `src/app/api/saved-searches/[id]/route.ts` (yeni)
- `src/app/api/saved-searches/[id]/route.test.ts` (yeni)
- `src/app/[locale]/(app)/[workspace]/calls/page.tsx`
- `src/types/db-rows.ts`
- `messages/tr.json`, `messages/en.json`
- `docs/DATA_MODEL.md`

## 4. Riskler
- Liste/silme/bildirim `userId`'ye daraltılı — bilinçli bir ürün kararı (§DATA_MODEL.md §12), ama
  yazılı bir "kayıtlı arama tenant genelinde mi kişisel mi" kararı daha önce hiçbir yerde yoktu; biri
  "kurum içinde herkes herkesin aramasını görsün" isterse bu route'ların `where` bloklarını
  değiştirmesi gerekir.
- `pnpm typecheck` bu görev sırasında bir ara `src/lib/document-exporter.ts`'de 2 hata gösterdi
  (TS2339, `leadAuthorLabel`/`leadAuthorUnassigned`). Doğruladım: benim değişikliklerimle **ilgisiz**
  — `tsconfig.tsbuildinfo` silinip temiz `dev`'de tekrar koşulduğunda da aynı 2 hata çıktı (kanıt:
  [[fabrika-typecheck-incremental-cache-can-hide-errors]]). Dosya benim listemde değildi,
  dokunmadım — o sırada `git status` başka bir ajanın `document-exporter.ts`'i eşzamanlı
  değiştirdiğini gösteriyordu; görev bitene kadar hata kendiliğinden kayboldu (muhtemelen o ajan
  düzeltti). Kural (b) gereği burada **bildiriliyor**, benim tarafımdan düzeltilmedi.
- Geçici e2e kanıt dosyası (`src/app/api/saved-searches/__tmp_e2e_proof.test.ts`) ve scratchpad'deki
  ikizi çalıştırıldıktan hemen sonra silindi — commit edilen test paketinde yok (mock tabanlı 14 test
  kaldı, real-DB testi tek seferlik kanıt amaçlıydı).

## 5. Açık sorular
- Yok.

## 6. Sonraki adım
- Yok — kart tam kapsandı (create/list/delete + notify, uçtan uca kanıt).
