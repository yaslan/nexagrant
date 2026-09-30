# TASK-MUOC2KUFCQGH0 — crw-fb — FB test borcu (İNCELEME-91 O-1/O-2 + İNCELEME-88 O-1/O-2)

**Durum: TAMAM**

**Platform beyanı:** Yalnız macOS'ta doğrulandı: Darwin 27, Node 26.5, pnpm 11.25, pgvector/pgvector:pg16 Docker'da. Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız macOS var; CI (ubuntu, Node 22) bu dalı henüz koşmadı. Koda göre platform farkı şöyle:
- Route değişikliği saf JS: header okuma, `randomUUID`, `console.warn`.
- Kilit açma betiği yedeği `path.join(backupDir, …)` ile yazıyor; ayırıcıyı platform belirliyor. Dosya adındaki `:` ve `.` karakterleri zaten `-` ile değiştiriliyor, bu yüzden ad Windows'ta da geçerli.
- Canlı testin geçici dizini `os.tmpdir()`.
- Betiğin ana modül olup olmadığı `process.argv[1]?.includes('k1-embeddings-unlock-rejected')` ile anlaşılıyor. Bu kontrol yola değil ada bakıyor, Windows'taki `\` ayırıcısında da çalışır.

Ortam:
- Dal `crw-fb/muoc2k-test-debt`, dev `c4b0cc2d`'den açıldı. Kendi worktree'm scratchpad `wt`. "Önce" ölçümleri için ayrı bir temel worktree (`wtbase`, detached `c4b0cc2d`) kullandım.
- İzole DB: `crwfb-muoc2k-pg`, 127.0.0.1:55920. CI sırasıyla kuruldu: db push → db:rls-role → apply-migrations ×2 (41/41 iki kez) → db:rls (112 politika) → seed.
- Her koşudan önce `DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:55920/fabrika` echo ile doğrulandı. Mutant betiği URL'de 55920 yoksa koşmayı reddediyor.
- Paylaşılan :5433'e bağlanılmadı. Gerçek OpenAI çağrısı yapılmadı.
- DB adı `fabrika` olduğu için canlı süitler bu izole DB'de `CI=true` ile koştu (devop-fb'nin İNCELEME-88'deki yöntemi).

## 1. Ne yapıldı

### (a) K1 embedding (TASK-MUO4GPRO92N97)
- **O-1 (S5):** `src/lib/scoring/embeddings.test.ts` dosyasına yeni test: *"a 429 on the prefix retry judges the row on the 429: no probe, no mark, tried again next run"*.
  - Senaryo: tam metin 400 alıyor, önek 429 alıyor, probe 200 dönerdi.
  - Beklenen: `rejected 0`, `failed 1`, gönderilen istekler yalnız [tam metin, önek] (probe yok), satır işaretsiz. Sonraki koşuda önekten embed ediliyor (`shortened 1`).
- **O-2 (S15–S17):** `scripts/k1-embeddings-unlock-rejected.ts` test edilebilir hâle getirildi. CLI davranışı ve çıktısı aynı kaldı.
  - `unlockRejected({ apply, backupDir?, topicIds?, tenantIds? })` ve `restoreRejected(file)` dışa aktarıldı ve sayıları döndürüyor.
  - `main()` artık yalnız betik doğrudan çalıştırılınca koşuyor (`isMain`, `seed-relationship-e2e.ts` ile aynı yöntem).
  - `topicIds`/`tenantIds` kapsamı `runK1Embeddings`'teki aynı adlı seçenekleri örnek alıyor. CLI bunları hiç vermiyor. Kapsam gerekliydi: paralel koşan `k1-embeddings.live.test.ts` kendi satırlarını işaretliyor ve global bir temizlik o testi kırardı.
  - `backupDir` varsayılanı `.`. Yol yine `k1-unlock-backup-….json` olarak basılıyor.
- Yeni canlı test `tests/k1-embeddings-unlock.live.test.ts`: gerçek Postgres, kod `fabrika_app` (NOBYPASSRLS) rolüyle, profiller RLS altında. 4 test:
  1. Kuru koşu yalnız işaretli satırları listeliyor, hiçbir şey değiştirmiyor, yedek yazmıyor.
  2. `--apply` yalnız `rejected:` satırlarını açıyor. İşaretsiz hash'li satır, NULL satır ve kapsam dışı işaretler yerinde kalıyor. Yedek tam olarak listelenen satırları içeriyor. Çıktıda ve yedekte profil metni yok. İkinci `--apply` hiçbir şey bulmuyor.
  3. `--restore`, arada yeniden gömülen konuyu ve yeniden işaretlenen profili ezmiyor; yalnız hâlâ NULL olanları geri koyuyor (`{ topics: 1, profiles: 1 }`).
  4. Yedek yazılamazsa (dizin yok, ENOENT) hiçbir işaret silinmiyor.

### (b) DOCX dışa aktarım (TASK-MUNDTW8O2IV6V)
- **O-1**, devop-fb'nin 4 eşdeğer olmayan sağ mutantı:
  - **D19**, Exif orientation girdisinin kütüphaneyle bayt uyumu (`docx-safe-html.image-size.test.ts`): girdi 2, 4, 6, 8, 9, 10, 11 ve 12 bayta kesiliyor. Her uzunlukta sanitizer'ın "tuttu" kararı **gerçek** html-to-docx'in "fırlatmadı" sonucuna eşit olmalı. Ayrıca sınır iki yönden sabitlendi (`kept === entryLen >= 10`).
  - **D4**, bütçe tam sınırı (`docx-safe-html.test.ts`): kalan bütçeye tam oturan görsel tutuluyor ve bütçe 0'a iniyor; bir bayt eksik bütçede görsel atılıyor ve bütçe değişmiyor.
  - **D14** (`content-disposition.test.ts`): `—.!` başlığında ASCII kısım `ConceptNote.docx`, `filename*` ise `—.!.docx` oluyor.
  - **D9** (`route.edge.test.ts`): yeniden deneme logu nedeni içermeli.
- **O-2**, `route.ts` değişikliği. Görselsiz yeniden deneme logu artık şu:
  ```
  console.warn('[concept-note export] retrying without images', { requestId, noteId, tenantId, reason })
  ```
  - `reason`: hatanın ilk satırı, en çok 200 karakter.
  - `requestId`: gelen `X-Request-Id` düz bir token ise (`^[\w.:-]{1,128}$`) o; değilse sunucuda `randomUUID()` ile üretiliyor.
  - Aynı kimlik 200 yanıtına `X-Request-Id` olarak ekleniyor, böylece kullanıcının indirmesi log satırıyla eşleştirilebiliyor. Kimlik yanıtta olmasaydı üretilen UUID'yi hiç kimse bir isteğe bağlayamazdı.
  - Log'da başlık, not metni, şablon adı ve görsel baytı yok.
  - 2 yeni test: tam log nesnesi ve sızıntı yokluğu; eksik ya da güvensiz başlıkta (boşluk/tab, 129 karakter, `<script>`) üretilen UUID'nin hem yanıtta hem logda aynı olması.

## 2. Kanıt

### Mutant tablosu (`…-ekler/mutants-once.log`, `mutants-sonra.log`, `mutant-betigi.sh`)
- ÖNCE: dev `c4b0cc2d` ve dev'in kendi testleri.
- SONRA: bu dal.
- Aynı perl ifadeleri kullanıldı. Hedef kümeler: emb = `embeddings.test` + iş testi + `tests/k1-embeddings*` (canlı dahil); docx = `export/` + `docx-safe-html*` + `content-disposition*`.

| Mutant | ÖNCE | SONRA |
|---|---|---|
| temel (emb / docx) | 114 geçti + 1 skip / 72 | 119 geçti + 1 skip / 83 |
| S5 önek 429 → ilk 400 ile yargıla | SAĞ | **ÖLÜ** (1 failed) |
| S15a restore Topic: `IS NULL` koruması yok | SAĞ | **ÖLÜ** (1) |
| S15b restore profil: `IS NULL` koruması yok | SAĞ | **ÖLÜ** (1) |
| S16a apply: Topic'te tüm hash'ler silinir | SAĞ | **ÖLÜ** (4) |
| S16b listeleme: `rejected:` yerine her hash | SAĞ | **ÖLÜ** (2) |
| S16c profil listeleme: her hash | SAĞ | **ÖLÜ** (2) |
| S16d profil apply: `LIKE` koruması yok | SAĞ | SAĞ (eşdeğer, bkz. Riskler) |
| S17a yedek temizlikten SONRA yazılır | SAĞ | **ÖLÜ** (1) |
| S17b yedek hiç yazılmaz | SAĞ | **ÖLÜ** (3) |
| S18 kuru koşu da temizler | SAĞ | **ÖLÜ** (2) |
| D4 bütçe `>` → `>=` | SAĞ | **ÖLÜ** (1) |
| D9 warn'da hata nedeni yok | SAĞ | **ÖLÜ** (1) |
| D14 ASCII yedekte harf-rakam kapısı yok | SAĞ | **ÖLÜ** (1) |
| D19 Exif `entry.length >= 10` → `>= 8` | SAĞ | **ÖLÜ** (2) |
| O2a log'da `noteId` yok | — (kod yoktu) | **ÖLÜ** (2) |
| O2b log'a başlık sızar | — | **ÖLÜ** (1) |
| O2c gelen `X-Request-Id` yok sayılır | — | **ÖLÜ** (1) |
| O2d güvensiz `X-Request-Id` kabul edilir | — | **ÖLÜ** (1) |

Özet: ÖNCE 14/14 sağ. SONRA 17 ölü, 1 sağ; o bir tanesi eşdeğer. Temel sayılar se-fb'nin (114 + 1) ve devop-fb'nin (72/72) raporladıklarıyla birebir aynı.

### CLI (izole DB, `fabrika_app`, `tsx scripts/k1-embeddings-unlock-rejected.ts`, repo kökünden)
```
tp-cli-m|rejected:cli   tp-cli-ok|okcli
--- dry     DRY RUN — marked rows: topics 1, tenant profiles 0 /  topic tp-cli-m / Nothing changed (dry run)…
--- apply   Backup written: k1-unlock-backup-2026-09-30T16-56-05-145Z.json (undo: …) / Cleared: topics 1, tenant profiles 0.
            yedek: {"topics":[{"id":"tp-cli-m","embeddingHash":"rejected:cli"}],"profiles":[]}
            tp-cli-m|NULL   tp-cli-ok|okcli
--- apply again   Nothing to clear.
--- restore RESTORE from …json: topics 1/1, profiles 0/0 marks put back → tp-cli-m|rejected:cli
--- import (main koşmuyor)   exports: restoreRejected,unlockRejected
```

### Kapılar (`…-ekler/kapilar.txt`, `vitest-tam-ozet.txt`)
```
CI=true AUTH_SECRET=<ci fixture> vitest run (izole DB :55920):  Test Files 298 passed | 2 skipped (300)
                                                                Tests 3845 passed | 50 skipped (3895)   exit=0
live-skip gate: 46 live files, 401 live tests passed, 42 allowed skip(s)   exit=0
  tests/k1-embeddings-unlock.live.test.ts → ['passed','passed','passed','passed']
tsc --noEmit -p .  → exit 0
pnpm lint          → exit 0 (0 problems; temel dal da 0)
pnpm i18n:check    → ✅ i18n check passed   exit 0
pnpm build         → exit 0 (├ ƒ /api/concept-notes/[id]/export)
```
Build'deki tek uyarı `src/instrumentation.ts:18` içindeki `process.exit` Edge uyarısı. Bu uyarı önceden de vardı, bu değişiklikten gelmiyor.

## 3. Değişen dosyalar
- `scripts/k1-embeddings-unlock-rejected.ts`: fonksiyonlar dışa aktarıldı, `isMain`, kapsam, `backupDir`. CLI çıktısı aynı.
- `src/app/api/concept-notes/[id]/export/route.ts`: yeniden deneme logunda kimlikler, yanıtta `X-Request-Id`.
- `tests/k1-embeddings-unlock.live.test.ts` (yeni)
- `src/lib/scoring/embeddings.test.ts`, `src/lib/docx-safe-html.test.ts`, `src/lib/docx-safe-html.image-size.test.ts`, `src/lib/content-disposition.test.ts`, `src/app/api/concept-notes/[id]/export/route.edge.test.ts`
- `docs/agent-results/TASK-MUOC2KUFCQGH0-crw-fb.md` ve `…-ekler/`: mutant betiği, loglar, kapılar ve psql sarmalayıcısı. Betikler scratchpad yollarını varsayıyor.

## 4. Riskler
- **S16d sağ kaldı ve eşdeğer.** Profil temizliğindeki `AND "embeddingHash" LIKE 'rejected:%'` yalnız listeleme ile temizlik arasında o profil yeniden gömülürse bir işe yarıyor. Tek iş parçalı bir testte bu yarışı kurmak için betiğe bir kanca eklemek gerekirdi, bunu kapsam dışı bıraktım. Topic tarafındaki aynı koruma için de durum aynı. Bugün bu yolu hiçbir test sabitlemiyor.
- `reason` alanı kütüphanenin hata mesajının ilk satırı. html-to-docx ya da image-size bir gün girdiden alıntı yapan bir mesaj üretirse, en çok 200 karakteri log'a girer. Bugünkü mesajlar sabit metin ve sayılardan oluşuyor ("Invalid JPG…", "offset out of range … Received 8").
- `X-Request-Id` artık her 200 yanıtında var. Değer ya istemcinin gönderdiği doğrulanmış token ya da rastgele bir UUID; gizli bir bilgi taşımıyor.
- `tenantId` log'da. Bu bir kiracı kimliği; kişisel veri değil ve embedding işi de aynı şekilde logluyor.
- Linux/Windows ve CI koşulmadı (bkz. platform beyanı).

## 5. Açık sorular
- `X-Request-Id`'nin tüm API yanıtlarına yayılması istenir mi? Bugün projede bir istek kimliği konvansiyonu yok; `api-error.ts` yalnız `ids.requestId` alanını tanımlıyor. Bu kart yalnız export rotasına ekledi.
- Görev metnindeki "KANIT ZORUNLU" satırı sonucun `/Users/macbook/alan/docs/agent-results/TASK-MUO64MPOYXLY5-devop-fb.md` yoluna yazılmasını istiyordu. O dosya başka bir ajanın (devop-fb) İNCELEME-88 raporu. Üzerine yazmadım; görevin açıkça verdiği sonuç dosyası yolunu kullandım.

## 6. Sonraki adım
- Dal dev'e merge edildi (push yok). CI'da yeni canlı dosya live-skip kapısına dahil olacak; ilk CI koşusunda `tests/k1-embeddings-unlock.live.test.ts`'in 4/4 koştuğu kontrol edilmeli.
- Temizlik: `crwfb-muoc2k-pg` kabı ve `wtbase` worktree'si rapor commit'inden sonra kaldırılır. `wt` dal worktree'si merge'den sonra kaldırılır.
