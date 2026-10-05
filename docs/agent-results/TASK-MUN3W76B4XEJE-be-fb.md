# TASK-MUN3W76B4XEJE — FB konsorsiyum findCandidates pilot kapısı · be-fb

Kaynak: se-fb'nin İNCELEME-36 bulgusu. Bu bulgu, İNCELEME-30 B-1'in ikizi (M8 düzeltmesi fe-fb `261c3b88`, rapor `TASK-MUN39FIAKFY2R-fe-fb.md`). Düzeltme commit'i: `362ee353`.

## 1) Ne yapıldı
- **Önce kanıt (düzeltmeden önce):** Bulgu doğrulandı. Gerçek `findCandidates`, izole DB'de ve süresi dolmuş gerçek bir pilot `Subscription` satırıyla çağrıldı. Çağrı reddedilmedi ve SeatCandidate satırları **2'den 0'a** indi (§2.1).
- **`readOnly` neden silmeyi engellemiyor:** `requireTenantAction({ readOnly: true })` bir yetki ya da salt-okuma modu değil. Bu bayrak yalnız `assertTenantActionWritable` çağrısını atlatıyor (`src/lib/tenant.ts:101-104`). Sonrasındaki kodu kısıtlayan bir şey yok. Veritabanı tarafında da pilot kontrolü bulunmuyor: `withTenant` yalnız `app.tenant_id` ayarlıyor, RLS de yalnız kiracı sınırını koruyor. Bu yüzden `scoreCandidatesForSeat` → `runScoring` sonunda `seatCandidate.deleteMany({ tenantId, seatId })` ve `create` (`src/lib/scoring/consortium.ts`, "7. Persist") sorunsuz çalışıyordu. Yani bayrak "bu action yazmıyor" diye verilmiş bir sözdü ve söz yanlıştı.
- **Düzeltme (fe-fb'nin M8 kalıbı):** `findCandidates` artık `requireTenantAction()` çağırıyor, yani `readOnly` kaldırıldı. Kapı ilk satırda, `isPresentId` ve bütün `withTenant` çağrılarından önce çalışıyor. Ret `PilotExpiredError` ile ve `digest = 'PILOT_EXPIRED'` damgasıyla çıkıyor. Server action'larda HTTP 403 yok; `PILOT_EXPIRED` kodu `requireTenantApi`'nin 403'ü ile aynı.
- **İstemci mesajı:** `manager.tsx` içindeki `handleFindCandidates` fonksiyonunda hiç `catch` yoktu, ret doğrudan hata sınırına düşüyordu. Artık `addSeat` ve `assignSeat` ile aynı `refuse` yolunu kullanıyor: `useActionErrorText` → `Common.pilotExpired`. Anahtar tr/en'de zaten vardı, yeni anahtar eklenmedi. Pilot dışı hatalar eskisi gibi hata sınırına gidiyor.
- **Tarama (madde 3), `pipeline/[id]/**`:**
  - `addSeat` ve `assignSeat` zaten varsayılan kapıdan geçiyor (yazıyorlar). Artık kilit testinde de sabitlendiler.
  - `getConflicts` `readOnly` kalıyor, doğru: `detectConflicts` yalnız `consortiumSeat.findMany` yapıyor.
  - `page.tsx` ile `consortium/page.tsx` sunucu bileşenleri, yazma yok. `computeG0ForOpportunity` persist etmiyor; persist `persistG0`'da ve bu sayfadan çağrılmıyor. `consortium/page.tsx` içindeki `recordAlert` sorgu hatasında yazılan bir sistem gözlem kaydı, kiracı verisi değil.
  - `client.tsx` ve `effort.tsx` `../actions` içindeki `archiveOpportunity`, `declareApplication`, `evaluateOpportunityGate` ve `logEffort`'u çağırıyor. Bu dördü N-1 kilidinde zaten var.
  - Sonuç: bu ağaçta kapıdan kaçan başka yazma yolu yok.
- **N-1 kilidi:** `tests/pipeline-actions-pilot-digest.test.ts` dosyasına konsorsiyum bölümü eklendi: `addSeat`, `findCandidates`, `assignSeat`. Hepsi `PILOT_EXPIRED` digest'iyle reddediliyor ve skorlayıcı (`scoreCandidatesForSeat`) hiç çağrılmıyor.
- **UI testi:** `tests/pilot-expired-write-paths.test.tsx` dosyasına ConsortiumManager "Aday Bul" vakası eklendi (tr ve en). Pilot cümlesi gösteriliyor, listelenmiş aday ekranda kalıyor.
- **Canlı DB testi:** Yeni dosya `tests/consortium-find-candidates-pilot.live.test.ts`. Pilot kapısı mock'lanmadı, gerçek `Subscription` satırı okunuyor ve bağlantı `fabrika_app` üzerinden (NOBYPASSRLS). Süresi dolmuş pilotta ret var ve satırlar birebir aynı kalıyor. Aktif pilotta aynı çağrı satırları yeniden yazıyor; bu, testin boşa geçmediğinin kontrolü.

## 2) Kanıt
Ortam: kendi konteynerim `befb-mun3w` (`pgvector/pgvector:pg16`, `:55473/befb3w`). Kurulum sırası: `prisma db push` → `scripts/apply-migrations.sh` **iki kez** (34 dosya, rc=0/0) → `db:rls-role` → `db:rls` (0 → 112 politika). `fabrika_app` için `rolbypassrls = f`. Paylaşılan `fabrika` DB'sine ve `:3000`'e dokunulmadı.

### 2.1 Önce: bulgu gerçek (düzeltme öncesi kod, canlı test + geçici log)
```
PROBE before [ 'cfp-mun3zcmz-org-1|2026-09-29T20:08:10.722Z', 'cfp-mun3zcmz-org-2|2026-09-29T20:08:10.725Z' ]
      after 0   answer {"resolved":[]}
× expired pilot: … expected { resolved: [] } to be an instance of PilotExpiredError
```
Süresi dolmuş pilotta çağrı `[]` döndürdü ve iki satır silindi. İzole DB'de CORDIS profili yok, bu yüzden yerine yeni satır da yazılmadı.

### 2.2 Sonra: hedefli vitest
```
tests/pipeline-actions-pilot-digest.test.ts + tests/pilot-expired-write-paths.test.tsx
  + tests/consortium-find-candidates-pilot.live.test.ts (izole DB)          → Tests 27 passed (27)
✓ expired pilot: refused with the PILOT_EXPIRED digest and the seat candidates are unchanged
✓ running pilot: the same call deletes and rewrites the seat candidates
tests/teardown-where-guard.test.ts + tests/rls-coverage.test.ts             → Tests 33 passed (33)
```

### 2.3 Mutantlar (temiz worktree, HEAD `362ee353`, her biri `git checkout` ile geri alındı)
```
M1 findCandidates → requireTenantAction({ readOnly: true })   → 3 failed (live expired + live running* + digest findCandidates)  ÖLDÜ
M2 manager: findCandidates try/catch kaldırıldı                → 2 failed ("Aday Bul" tr, en)                                    ÖLDÜ
M3 manager: catch reddi yutuyor (refuse yok)                   → 2 failed ("Aday Bul" tr, en)                                    ÖLDÜ
M4 addSeat → readOnly: true                                    → 1 failed (digest addSeat)                                       ÖLDÜ
M5 assignSeat → readOnly: true                                 → 1 failed (digest assignSeat)                                    ÖLDÜ
```
\* M1'de "running" vakası da düşüyor, çünkü mutant ilk vakada satırları siliyor.

Not: Taban `vitest.config.mts` dosyası `**/.claude/worktrees/**` yolunu dışlıyor. Worktree'de yalnız exclude'u değiştiren commit'lenmemiş bir config kullanıldı. Ayrıca zsh `$T` değişkenini kelimelere bölmüyor, `${=T}` gerekiyor. İlk koşu bu yüzden "No test files" verdi; bu koşu sayılmadı.

### 2.4 Gerçek tıklama (kendi `next dev -p 3341` sürecim, temiz worktree, izole DB, Playwright + sistem Chrome)
- Kiracı `demo-tenant`. `Subscription` şu hale getirildi: provider `pilot`, `TRIALING`, `trialEndsAt = now()-1dk`. Koltuk `demo-seat-opp1-research`'e iki satır eklendi: `befb3w_cand1` ve `befb3w_cand2`.
- Giriş `/tr/login` formundan yapıldı (çerez diyaloğu → e-posta → gönder). Ardından `/…/main/pipeline/demo-opp-1/consortium` açıldı.
- Tıklanan düğme: `data-testid=m8-builder-seat-research` içindeki "Aday Bul". Sunucu logu `findCandidates("demo-seat-opp1-research")` gösteriyor. İlk turda tıklama başka koltuğa gitmişti, o tur sayılmadı.

```
Süresi dolmuş, tr:
  önce  befb3w_cand1|1|20:12:38.916 · befb3w_cand2|2|20:12:38.916
  alert "Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun."
  sonra befb3w_cand1|1|20:12:38.916 · befb3w_cand2|2|20:12:38.916      ← veri değişmedi (computedAt dahil)
Süresi dolmuş, en:
  alert "The pilot has ended, so editing is off. Ask your administrator to extend it."
  sonra aynı iki satır, aynı computedAt
CANLI MUTANT (dev kopyasında readOnly: true geri):
  alert null · önce 2 satır → sonra (0 satır)                            ← bulgu birebir; geri alındı
Aktif pilot (trialEndsAt +10 gün, düzeltme yerinde):
  alert null · 2 satır → 0 satır (skorlayıcı çalıştı; izole DB'de CORDIS profili yok)
pageerror: hiçbir koşuda yok
```
Kareler (`docs/agent-results/TASK-MUN3W76B4XEJE-be-fb/`): `expired-tr-{1-before,2-after}.png`, `expired-en-{1-before,2-after}.png`, `mutant-{1-before,2-after}.png`, `active-{1-before,2-after}.png`.

### 2.5 Kapılar
```
pnpm typecheck                              → tc=0 (ana ağaç)
eslint <5 dosya>                            → lint=0
pnpm i18n:check                             → ✅ passed (yeni anahtar yok)
pnpm build (temiz worktree, HEAD 362ee353)  → build=0, i18n kapısı 3× passed, "Compiled successfully"
```
Symlink'li `node_modules` için yalnız worktree kopyasında `turbopack.root` eklendi. Bu değişiklik geri alındı ve commit'lenmedi (fe-fb ile aynı durum).

### 2.6 Tam süit, yalnız izole DB'de
`env | grep DATABASE_URL`: üç değişken de `:55473/befb3w`. Süitten önce `db:seed` koşuldu.
```
Tenant önce: 1
 Test Files  228 passed | 2 skipped (230)
      Tests  2677 passed | 8 skipped (2685)        vitest=0
Tenant sonra: 1
```

### 2.7 Temizlik
- Canlı testin teardown'u tek `tenantId` ile çalışıyor ve id boşsa `requireId` fırlatıyor. Koşudan sonra `Tenant`, `SeatCandidate` ve `Subscription` sayıları 0/0/0 idi (seed öncesi).
- Yalnız kendi PID'im durduruldu (`next dev` 62186 ve çocuğu 62202). `:3341` boş.
- Worktree `.claude/worktrees/befb-mun3w` kaldırıldı. Konteyner `befb-mun3w` silindi.

## 3) Değişen dosyalar (`362ee353`)
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions.ts`: `readOnly` kaldırıldı ve nedeni yoruma yazıldı.
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager.tsx`: "Aday Bul" artık `try/catch` + `refuse` kullanıyor.
- `tests/pipeline-actions-pilot-digest.test.ts`: konsorsiyum bölümü eklendi.
- `tests/pilot-expired-write-paths.test.tsx`: ConsortiumManager vakası eklendi (tr, en).
- `tests/consortium-find-candidates-pilot.live.test.ts`: yeni.
- Rapor: bu dosya ve `TASK-MUN3W76B4XEJE-be-fb/` (8 png).

Paralel ajanların dosyalarına dokunulmadı: fe-fb (calendar, env, instrumentation, app-url), cs-fb (davet) ve crw-fb.

## 4) Riskler
- **Davranış değişikliği (istenen):** Süresi dolmuş pilotta konsorsiyum sayfası aday listesini artık yenileyemiyor. Kayıtlı liste görünmeye devam ediyor.
- **Kök risk sürüyor:** `readOnly` bir sözden ibaret ve doğrulanmıyor. se-fb'nin Ö-4 önerisi (her `readOnly` action için "Prisma'ya yazma yok" bekçisi) hâlâ yapılmadı. Aynı sınıftan üçüncü bir bulgunun çıkması bu yüzden olası. Ayrı kart önerilir (§6).
- Üretimde digest'in tarayıcıya ulaştığı yalnız dev ortamında kanıtlı; risk İNCELEME-17 ve 24'ten devralındı. Bu yol digest'e dayanıyor, çünkü action değer değil hata döndürüyor.

## 5) Açık sorular
- Yan gözlem, kapsam dışı: konsorsiyum sayfasında tr dilinde sabit İngilizce metinler var: "Consortium Builder", "Back to Pipeline", "Invite", "⚠ Conflicts Detected" (kare: `expired-tr-2-after.png`). `i18n:check` bunları yakalamıyor, çünkü borç `i18n-baseline.json`'da kayıtlı (`manager.tsx: 5`, `page.tsx: 1`). Ayrı kart gerekip gerekmediğine karar verilmeli.
- Seed'de `CONFIRMED` durumunda ama `organizationId` boş olan koltuklar var. Bu koltuklarda "Aday Bul" düğmesi görünüyor. Ürün hatası değil, seed tutarsızlığı.

## 6) Sonraki adım
- İnceleme (crw-fb): aynı canlı senaryo, yani süresi dolmuş pilot → konsorsiyum "Aday Bul" → satırlar aynı ve pilot cümlesi görünüyor.
- Ayrı kart: `readOnly` bekçisi (se-fb Ö-4). Önerilen yöntem: `{ readOnly: true }` geçen her action'ı bir kez yazma yapan Prisma proxy'siyle koşan bir statik ya da canlı test.
- Ayrı kart: konsorsiyum sayfasının i18n boşlukları.

**Görev şablonu notu:** Görev metnindeki "KANIT ZORUNLU" satırı `/Users/macbook/alan/docs/agent-results/TASK-MUN39FIAKFY2R-fe-fb.md` yolunu gösteriyor. Bu yol fe-fb'nin başka bir görevine ait, üstelik repo dışında. O dosyaya yazılmadı. Görevin kendi SONUÇ DOSYASI yolu bu dosya.

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı: Darwin 27, Node 26.5, Next 16 (`next dev` ve `next build`), Docker `pgvector/pgvector:pg16`, Playwright ve sistem Chrome. Değişen kod iki parça: sunucu tarafında bir TS server action ve bir React istemci bileşeni. Süreç, dosya yolu, kabuk, kısayol ya da DPI bağımlılığı yok. Pilot kapısı, digest ve `useActionErrorText` koddan bakıldığında platformdan bağımsız, Windows ve Linux'ta aynı davranmalı. Windows ve Linux **koşulamadı**, çünkü makinede yalnız macOS var. Worktree yardımcıları (`${=T}`, `docker exec` psql sarmalayıcısı) yalnız bu doğrulama içindi ve commit'lenmedi.
