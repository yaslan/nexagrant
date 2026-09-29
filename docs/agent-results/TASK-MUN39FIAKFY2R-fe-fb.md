# TASK-MUN39FIAKFY2R — FB M8 pilot kapısı, İNCELEME-30 B-1 + B-2 · fe-fb

Kaynak: `docs/agent-results/TASK-MUN2FLEUQI3MT-se-fb.md` (B-1, B-2). Commit'ler: `261c3b88` (düzeltme + testler), `334b2fc7` (mobil taşma).

## 1) Ne yapıldı
- **B-1 (sunucu kapısı):** `computeSeatCandidates` artık `requireTenantAction()` çağırıyor; `readOnly: true` kaldırıldı (`src/modules/m8/server/actions.ts`). Kapı, fonksiyonun ilk satırında ve her okumadan önce çalışıyor. Bu yüzden `generateSeatCandidates` → `runSeatMatch` içindeki `deleteMany` + `create` süresi dolmuş pilotta hiç başlamıyor. Server action'larda HTTP 403 yok; ret, `PilotExpiredError` ile ve `digest = 'PILOT_EXPIRED'` damgasıyla çıkıyor (403 `PILOT_EXPIRED` karşılığı budur, `requireTenantApi` ile aynı kod).
- **B-1 (mesaj):** `computeSeatCandidatesForm` pilot reddini yakalayıp `{ status: 'error', code: 'pilotExpired' }` döndürüyor. "Aday Bul" düğmesi `useActionErrorText` ile `Common.pilotExpired` gösteriyor. Diğer hatalar eskisi gibi "Adaylar hesaplanamadı. <mesaj>" gösteriliyor.
- **B-2:** Matching sayfasındaki satır içi `'use server'` davet formu (reddi yalnız `console.error` ile logluyordu) yeni bir istemci bileşenine taşındı: `src/modules/m8/components/invite-candidate-button.tsx`. Pilot reddinde `role="alert"` ile `Common.pilotExpired` (tr/en, mevcut anahtar) gösteriliyor. Diğer hatalar eskisi gibi sessiz kalıyor. `organizationId` boşsa düğme çizilmiyor, önceki `return` korumasıyla aynı davranış.
- **N-1 kilidi genişletildi:** `tests/pipeline-actions-pilot-digest.test.ts` dosyasına M8 bölümü eklendi. `computeSeatCandidates` ve `assignCandidateToSeat` `PILOT_EXPIRED` digest'iyle reddediliyor, eşleştirici (`generateSeatCandidates`) hiç çağrılmıyor ve DB'ye erişilmiyor. `computeSeatCandidatesForm` ise `code: 'pilotExpired'` döndürüyor.
- **UI testi:** `tests/pilot-expired-write-paths.test.tsx` dosyasına "Aday Bul" (tr) ve "Davet Et" (en) vakaları eklendi. İkisi de başka hatalarda eski davranışın korunduğunu da doğruluyor.
- **Kapsam dışı ama aynı dosyada:** Canlı testte matching sayfası 390 px ekranda yatay taşıyordu. Taşma, tıklamadan önce de vardı (scrollWidth 399); pilot uyarıları çıkınca 416'ya çıkıyordu. Seat kartına `min-w-0`, başlığa `flex-wrap` eklendi (`334b2fc7`). Sonuç: scrollWidth 390; tablo kartın içinde kayıyor.
- be-fb'nin `isPresentId` guard'larına dokunulmadı. `actions.ts` baştan yazılmadı; yalnız ilgili satırlar düzenlendi.

## 2) Kanıt
**Hedefli vitest** (ana ağaç, son hâl):
```
vitest run tests/pipeline-actions-pilot-digest.test.ts tests/pilot-expired-write-paths.test.tsx src/modules/m8 \
           src/lib/billing/pilot-gates.test.ts tests/pilot-expired-action-message.test.tsx
→ Test Files 6 passed (6) · Tests 64 passed (64)
```
**Statik kontroller:** `tsc --noEmit` exit 0 · `eslint .` exit 0 · `i18n:check` → "✅ i18n check passed".
**Build:** Temiz worktree'de `next build` exit 0. Worktree `.claude/worktrees/fefb-mun39`, HEAD `261c3b88` + `334b2fc7` sayfası. Build iki kez koşuldu; ikincisi son sayfayla yapıldı ve içinde i18n kapısı 3 kez geçti. Yalnız o kopyada `turbopack.root` eklendi (node_modules symlink'i için), commit'lenmedi.

**Mutantlar** (temiz worktree'de, her biri `git checkout` ile geri alındı, iş önceden commit'liydi):
```
M1 computeSeatCandidates → requireTenantAction({ readOnly: true })   → 2 failed (computeSeatCandidates, …Form)   ÖLDÜ
M2 assignCandidateToSeat → requireTenantAction({ readOnly: true })   → 1 failed (assignCandidateToSeat)           ÖLDÜ
M3 computeSeatCandidatesForm pilot dalı silindi                       → 1 failed (…Form answers the pilot code)   ÖLDÜ
M4 FindCandidatesButton errorText(undefined, …)                      → 1 failed ("Aday Bul": a pilot refusal…)    ÖLDÜ
M5 InviteCandidateButton catch reddi yutuyor                          → 1 failed ("Davet Et" (en)…)                ÖLDÜ
```
**Canlı test (:3000, gerçek tıklama/klavye):** Kendi `next dev -p 3000` sürecimi temiz worktree'den başlattım; :3000 önceden boştu. Kiracı gerçek `/tr/register` formuyla açıldı: çerez "Gerekli Çerezler", ad, kurum, e-posta, şifre, aydınlatma onayı, "Çalışma Alanı Oluştur", yönlendirme `/tr/default/dashboard`. Kurulum SQL ile yapıldı: `Subscription` (public-institution, TRIALING, provider pilot), ModuleState M1–M6 ve M8 ON, `Opportunity`, `ConsortiumSeat` (research, OPEN), 2 `SeatCandidate`, `trialEndsAt = now()-1dk`.
```
Süresi dolmuş, tr:
  önce  SeatCandidate: fefbmun39_cand1|1|0.5|19:53:19.93 · fefbmun39_cand2|2|0.3|19:53:19.93 · koltuk OPEN
  "Aday Bul" tıklama  → alert: "Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun."
  "Davet Et" (odak + Enter) → ikinci alert, aynı cümle
  sonra SeatCandidate: aynı 2 satır, aynı computedAt · koltuk OPEN, organizationId boş   ← veri değişmedi
  sunucu logu: assignCandidateToSeat … code: 'PILOT_EXPIRED', digest: 'PILOT_EXPIRED'
Süresi dolmuş, en: iki alert "The pilot has ended, so editing is off. Ask your administrator to extend it." · satırlar aynı
CANLI MUTANT (dev kopyasında readOnly: true geri): "Aday Bul" → alert yok, SeatCandidate 2 → 0   ← B-1 birebir; geri alındı
Aktif pilot kontrolü (trialEndsAt +10 gün): "Aday Bul" alert yok, eşleştirici çalıştı (bu test grafiğinde 0 aday);
  "Davet Et" → alert yok, koltuk INVITED|893274553, ekranda "Durum: DAVET EDİLDİ" (revalidate çalışıyor)
Mobil 390px: tıklamadan önce scrollWidth 399 → düzeltme sonrası 390 (iki ret sonrası da 390)
pageerror: yok
```
**Kareler** (`docs/agent-results/TASK-MUN39FIAKFY2R-screenshots/`):
- `expired-1-before.png`, `expired-2-find-after.png`, `expired-3-invite-after.png`: süresi dolmuş pilot, tr, masaüstü.
- `expired-en-3-invite-after.png`: süresi dolmuş pilot, en.
- `mutant-2-find-after.png`: canlı mutant, adaylar silinmiş.
- `active-invite-after.png`: aktif pilot, davet edildi.
- `mobile-before-click.png`, `expired-4-mobile.png`: 390 px, düzeltme öncesi (taşma).
- `expired-5-mobile-fixed.png`: 390 px, düzeltme sonrası.

**Temizlik:** Tek transaction. Korumalar: id boş olamaz, e-posta eşleşmeli, `Tenant` ve `User` için `ROW_COUNT = 1`. Tenant `cmun3fxwb00010rxkcn7y3fxs`, User `cmun3fxw400000rxkjqw5i43v`. `SeatCandidate` satırlarında FK yok, bu yüzden önce `tenantId` ile açıkça silindi.
```
önce: Tenant 2 · User 43  →  sonra: Tenant 1 · User 42
tenantId/userId sütunlu tüm tablolar (information_schema taraması): 0 satır · fefbmun39_* opp/seat/cand: 0
```
Yalnız kendi PID'im (41476 ve çocukları) durduruldu; port 3000 boş. Worktree kaldırıldı.

## 3) Değişen dosyalar
- `src/modules/m8/server/actions.ts`: `readOnly` kaldırıldı, form state'ine `code` eklendi, pilot dalı yazıldı.
- `src/modules/m8/components/find-candidates-button.tsx`: `useActionErrorText` kullanıyor.
- `src/modules/m8/components/invite-candidate-button.tsx`: yeni.
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/matching/page.tsx`: satır içi form yerine `InviteCandidateButton`; `min-w-0` ve `flex-wrap` eklendi.
- `tests/pipeline-actions-pilot-digest.test.ts`, `tests/pilot-expired-write-paths.test.tsx`: yeni vakalar.
- `docs/agent-results/TASK-MUN39FIAKFY2R-fe-fb.md` ve `-screenshots/` (9 png).

## 4) Riskler
- **Davranış değişikliği (istenen):** Süresi dolmuş pilot artık "Aday Bul" ile aday listesini yenileyemiyor, yalnız mevcut listeyi görüyor.
- Davet düğmesi artık istemciden `assignCandidateToSeat` çağırıyor. Pilot dışı hatalar (koltuk bulunamadı, CONFIRMED çakışması) eskisi gibi kullanıcıya gösterilmiyor. Önceden bunlar sunucuda `console.error` ile loglanıyordu; artık loglanmıyor. INVITED yolunda çakışma kontrolü çalışmadığı için pratikte yalnız "koltuk bulunamadı" kalıyor.
- se-fb Öneri 4 (her `readOnly` action için "Prisma'ya yazma yok" bekçisi) bu kartta **yapılmadı**. Kalan istisna `updatePresenceHeartbeat` (N-2). `generateSectionDraftAi` gerçek model çağrısına geçerken `readOnly` işareti ayrıca gözden geçirilmeli.
- Üretimde digest'in tarayıcıya ulaştığı yalnız dev ortamında kanıtlı. Bu risk İNCELEME-17 ve 24'ten devralındı. "Aday Bul" yolu digest'e dayanmıyor (değer döndürüyor); "Davet Et" yolu dayanıyor.

## 5) Açık sorular
- Tam vitest süiti koşulmadı. Talimata göre yalnız izole DB'de koşulabilir; izole DB kurmak bu kartın kapsamı dışında kaldı. Hedefli 6 dosya ve 64 test koşuldu.
- `/tr/register` formundaki `<label>`'lar input'lara bağlı değil (`getByLabel` bulamıyor). Bu bir a11y sorunu, ayrı kart önerilir.

## 6) Sonraki adım
- İnceleme: aynı canlı senaryo (süresi dolmuş pilot → Aday Bul/Davet Et → satırlar aynı, pilot cümlesi görünür).
- Ayrı kart: `readOnly` action'lar için yazma bekçisi (se-fb Ö-4) ve register label a11y.

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı: Darwin 27, Node 26.5, `next dev`/`next build` 16.3.4, Docker Postgres `fabrika-postgres`, chrome-headless-shell 1243. Değişen kod sunucu tarafı TS (server action) ve React istemci bileşenleri. Süreç, dosya yolu, kabuk, kısayol ya da DPI bağımlılığı yok. Pilot kapısı, digest ve `useActionErrorText` platformdan bağımsız, Windows ve Linux'ta aynı davranmalı. Windows ve Linux **koşulamadı**, çünkü makinede yalnız macOS var.
