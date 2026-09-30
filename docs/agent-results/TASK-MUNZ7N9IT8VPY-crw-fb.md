# TASK-MUNZ7N9IT8VPY — m8 "Aday Bul" iç hata metni sızıntısı (crw-fb)

**Durum: TAMAM**

Dal: `crw-fb/munz7n-m8-error`. Kod commit'i 83e79ed7. Dev dala iki kez alındı: e499a647 ve ardından 08745684 (dev 51f39e6c, TASK-MUNZKR3PEV8EI dahil). Kendi worktree'mde, izole Postgres `crwfb7n-pg` (:5478) üzerinde çalıştım. Paylaşılan fabrika DB'sine (:5433) hiç yazmadım: worktree `.env` içinde 5433 geçmiyor (`grep -c 5433 .env` → 0).

## 1. Ne yapıldı
- **Kök neden:** `computeSeatCandidatesForm` (src/modules/m8/server/actions.ts) yakaladığı her hatayı `{ status: 'error', message: errorMessage(e) }` olarak dönüyordu. Bir `useActionState` formunun durumu tarayıcıya olduğu gibi gider. Bu yüzden bir Prisma hatası da `Invalid tx.seatCandidate.deleteMany() invocation … Database error … P0001 …` gibi tablo ve kolon adlarıyla birlikte istemciye ulaşıyordu. Eksik id dalı da sabit bir Türkçe metin dönüyordu, i18n dışında kalıyordu.
- **Düzeltme:**
  - Yeni dosya `src/modules/m8/server/errors.ts`: `SeatNotFoundError` sınıfı (m6 `EvaluationNotFoundError` emsali) ve iki kod, `seatNotFound` ile `computeFailed`.
  - Koltuk ya da fırsat bulunamayınca atılan hatalar artık `SeatNotFoundError`. Bunlar `computeSeatCandidates` içindeki 2 yer ve `runSeatMatch` içindeki 3 yer. Mesajlar değişmedi, çünkü log'a gidiyorlar.
  - Form durumunda `message` alanı yok. `code` alanının alabileceği değerler: `pilotExpired | forbiddenRole | seatNotFound | computeFailed`. Eksik id ve `SeatNotFoundError` → `seatNotFound`. Diğer her hata → `console.error('[m8] computeSeatCandidatesForm failed', e)` + `computeFailed`.
  - `find-candidates-button.tsx` kodu çeviriyor. Yeni anahtar `Consortium.seatNotFound` tr/en'e eklendi. `computeFailed` mevcut anahtar.
- **Aynı kalıp m8'de başka yerde var mı:** `src/modules/m8` altında `catch` → `return` sızıntısı başka yerde yok. Diğer m8 eylemleri (`inviteCandidateToSeat`, `confirmSeatAssignment`) hatayı `throw` ediyor. Prod'da Next bunu digest'e çeviriyor ve metin istemciye gitmiyor. Ayrıca `invite-candidate-button` başarısız durumda `errorText(e, null)` ile hiçbir şey göstermiyor. Bekçinin sayımı da bunu doğruluyor: m8'in sayısı 0.
- **Bekçi:** `tests/api/api-error-body-guard.test.ts` içindeki `catchReturnLeaks` bu kalıbı zaten yakalıyordu. `message: errorMessage(e)` biçimi öz-test listesinde vardı. m8, bilinen sızıntılar listesinde (`KNOWN_ACTION_LEAKS`) sayılı olduğu için geçiyordu. Bu girdi silindi. Aşağıdaki mutantlar M1 ve M2, bekçinin bu sızıntıyı kendi başına kırmızıya çevirdiğini gösteriyor. Admin plan eylemlerinin girdisi de aynı saatlerde TASK-MUNZKR3PEV8EI ile silindi. Birleştirme çakışmasını ben çözdüm, sonuçta **`KNOWN_ACTION_LEAKS = {}`**. Liste artık boş, yeni bir girdi bir takip kartı gerektirir.

## 2. Kanıt
Ekler: `docs/agent-results/TASK-MUNZ7N9IT8VPY-crw-fb-ekler/`

**Canlı test (`live.mjs.txt` → `live-out.txt`):** prod `next build` standalone sunucusu, izole DB, gerçek Chromium ve alice (PIPELINE_MANAGER) oturumuyla "Aday Bul" tıklandı. Prisma hatası şöyle tetiklendi: `SeatCandidate` tablosuna `BEFORE DELETE FOR EACH STATEMENT` trigger eklendi, trigger `RAISE EXCEPTION 'crwfb7n-internal-detail: tablo=SeatCandidate kolon=seatId'` fırlatıyor. Trigger testten sonra geri alındı (sayı 0).
```
[tr prisma-hatası] alert="Adaylar hesaplanamadı." | POST gövdesi=1 (durum içermeyen=0) | sızıntı-eşleşen gövde=0
   gövde: 0:{"a":"$@1",…} 1:{"status":"error","code":"computeFailed"}
[en prisma-hatası] alert="Could not compute candidates." | … sızıntı-eşleşen gövde=0
   gövde: … 1:{"status":"error","code":"computeFailed"}
[tr koltuk-silinmiş] alert="Bu koltuk ya da fırsat bu çalışma alanında bulunamadı. Sayfayı yenileyip tekrar deneyin." | … 0
   gövde: … 1:{"status":"error","code":"seatNotFound"}
[en koltuk-silinmiş] alert="This seat or opportunity was not found in this workspace. Refresh the page and try again." | … 0
[tr sağlam] alert sayısı=0
GEÇTİ ×5, exit=0
```
- Sızıntı deseni: `/crwfb7n|internal-detail|SeatCandidate|invocation|prisma|P2010|P0001|tablo=|Seat .* not found|Opportunity .* not found|fabrika/i`. Tarama sunucu eyleminin ham RSC yanıt gövdesi üzerinde yapıldı.
- Tuzak: ilk koşuda gövdeler **boş** okunmuştu (`response` olayında `text()` çağrısı yapılmıştı). Yani "sızıntı=0" boş bir kümeden çıkıyordu, bir şey kanıtlamıyordu. Gövdeyi `requestfinished` olayında okuyacak şekilde düzelttim. Artık gövde `"status":"error"` içermiyorsa ya da hiç POST yoksa senaryo KALDI sayılıyor.
- Sunucu log'u (`server-log-excerpt.txt`): `[m8] computeSeatCandidatesForm failed Error [PrismaClientKnownRequestError] … Code: P0001 … crwfb7n-internal-detail: tablo=SeatCandidate kolon=seatId`. Ayrıntı log'da duruyor, istemciye gitmiyor.
- Sağlam yol: trigger kaldırıldıktan sonra tıklama yapıldı, alert çıkmadı.

**Mutantlar (`mutants.py.txt` → `mutants-out.txt`): 9/9 öldü, yaşayan 0**

| # | Mutant | Onu yakalayan test |
|---|---|---|
| M1 | `message: errorMessage(e)` geri konuldu | birim + **bekçi** ("no server action returns what it caught") |
| M2 | `detail: String(e)` | birim + **bekçi** |
| M3 | `instanceof SeatNotFoundError` dalı silindi | birim ×2 |
| M4 | her hata `seatNotFound` dönüyor | birim ×2 |
| M5 | eksik id yine sabit TR metin dönüyor | birim ×2 |
| M6 | `console.error` silindi | birim (log iddiası) |
| M7 | `runSeatMatch` opp-not-found yine düz `Error` | matching.test |
| M8 | `computeSeatCandidates` seat-not-found yine düz `Error` | birim |
| M9 | buton `seatNotFound`'u çevirmiyor | pilot-expired-write-paths (UI) |

**Kapılar:**
- Dal (`gates.txt`): tsc 0 · eslint 0 · i18n 0 · next build 0 · `npx vitest run` 0. Sonuç 291 dosya geçti / 6 atlandı, 3616 test geçti / 91 atlandı.
- Ara birleşik ağaç (HEAD e499a647): 5 kapı 0. Sonuç 3619 geçti / 0 kaldı.
- **Son birleşik ağaç** (`gates-merged.txt`, HEAD 08745684, dev 51f39e6c + bekçi çakışması çözümü): tsc 0 · eslint 0 · i18n 0 · next build 0 · `npx vitest run` 0. Sonuç 292 dosya geçti / 6 atlandı, **3646 geçti / 0 kaldı** / 96 atlandı. Mutantlar aynı ağaçta yeniden koşuldu, 9/9 öldü (`mutants-merged-out.txt`).
- Not: ilk çakışma çözümünde BSD `sed 'N;…;P;D'` dosyanın son satırını (`});`) yuttu ve tsc/build/vitest kırmızıya döndü. Kapılar bunu yakaladı. Satırı geri koydum, düzeltmeyi yerel merge commit'ine ekledim (push yok) ve yukarıdaki yeşil sonuç bu düzeltmeden sonra alındı.
- i18n çıktısındaki "Baseline is looser than reality … admin/settings/page.tsx 9 → 7" uyarısı dev'den geliyor. Benim değişikliğim değil, kapıyı da kırmızıya çevirmiyor.

## 3. Değişen dosyalar
- `src/modules/m8/server/errors.ts` (yeni)
- `src/modules/m8/server/actions.ts`, `src/modules/m8/server/matching.ts`
- `src/modules/m8/components/find-candidates-button.tsx`
- `messages/tr.json`, `messages/en.json` (`Consortium.seatNotFound`)
- `tests/m8-seat-candidates-form-errors.test.ts` (yeni, 7 test)
- `src/modules/m8/server/matching.test.ts` (+3 test: `SeatNotFoundError` sınıfı)
- `tests/pilot-expired-write-paths.test.tsx` (UI: seatNotFound/computeFailed metinleri, "Seat not found." ham metni artık gösterilmiyor)
- `tests/api/api-error-body-guard.test.ts` (`KNOWN_ACTION_LEAKS`'ten m8 silindi; dev birleşiminde liste `{}`)

## 4. Riskler
- **Atlanan testler:** bu makinede 96 test atlandı, be-fb koşusunda 36 atlanmıştı. Atlananlar dış servis isteyen live suite'ler: `evidence-upload-s3` (minio), `public-lead`, `stale-relationship-reminder`, `invitation-retention` (mail), `k1-embeddings`, `topic-match-nightly` (OpenAI) vb. İzole ortamımda bu servisler yoktu. Hiçbiri m8 ya da hata-dönüş yoluna dokunmuyor.
- **Sınıf tanımanın sınırı:** `SeatNotFoundError` modül sınırında `instanceof` ile tanınıyor. İleride matcher'ı başka bir paketten (ayrı bundle) sarmalayan biri çıkarsa sınıf eşleşmeyebilir. Bu durumda sonuç güvenli tarafa düşer: `computeFailed` döner ve sızıntı olmaz.
- **Kullanıcıya görünen değişiklik:** eski "Adaylar hesaplanamadı. Seat X not found…" metni artık yok. Yerine çevrilmiş tek bir cümle çıkıyor.
- **Kapsam dışı ama aynı sınıftan:** `src/lib/scoring/consortium.ts:80` ve `pipeline/[id]/consortium/actions.ts` içindeki `findCandidates` hatayı `throw` ediyor (digest), `return` etmiyor. Sızıntı yok, dokunmadım.

## 5. Açık sorular
Yok.

## 6. Sonraki adım
- `KNOWN_ACTION_LEAKS` boşaldı. İstenirse sabit kaldırılıp düz `toEqual({})` yazılabilir; bu kozmetik bir değişiklik.
- i18n baseline'ı (`pnpm i18n:check --update-baseline`) dev sahibi yenilemeli.

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, arm64): prod standalone sunucu, headless Chromium, Docker `pgvector/pgvector:pg16`. Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. Kodda platforma bağlı yol yok: değişiklik sunucu eylemi dönüş değeri, bir hata sınıfı ve bir i18n anahtarından ibaret. Süreç, dosya yolu ya da kabuk kullanımı yok. Bekçinin yol karşılaştırması zaten `sep` ile `/`'ya normalleştiriliyor. Canlı test betiği (`live.mjs.txt`) `docker exec` ve Playwright önbellek yolu kullanıyor. Bu yalnız bir test aracı, ürün kodu değil.
