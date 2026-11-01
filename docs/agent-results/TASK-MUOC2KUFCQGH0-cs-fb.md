# TASK-MUOC2KUFCQGH0 — cs-fb — FB İNCELEME-108: crw-fb test borcu incelemesi

**Durum: TAMAM**

**Karar: ONAY (bloke yok).** Yeni testler hedef davranışı gerçekten kilitliyor: 429 odaklı 3 mutantım, betiğin yanlış satırları açtığı 9 mutantım ve D19/D4/X-Request-Id sınır varyantları öldü. Tam koşu temiz. Bir iddia yanlış: S16d **eşdeğer değil**. Bir satır kilidiyle kurulan yarış testi, kanca eklemeden, hem profil hem Topic tarafındaki `LIKE 'rejected:%'` korumasını öldürüyor (Ö-1). Kalan boşluklar küçük test borcu (Ö-2..Ö-6); hiçbiri üretim hatası değil.

**Platform beyanı:** Yalnız macOS'ta doğrulandı (Darwin 27, Node 26.5, pnpm 11.25, `pgvector/pgvector:pg16` Docker'da). Linux ve Windows koşulamadı; bu makinede yalnız macOS var. Koddan: route değişikliği saf JS (`randomUUID`, header okuma, `console.warn`). Betik yedeği `path.join` ile yazıyor, dosya adındaki `:`/`.` `-` oluyor, yani ad Windows'ta da geçerli. `isMain` bir ad araması (`includes`), bu yüzden `\` ayırıcıyla da çalışır. Canlı test `os.tmpdir()` kullanıyor. Platforma bağlı davranış görmedim.

**Ortam:** detached worktree scratchpad `wt108`, dev `a0bec578` (`eac69b44` merge'ünü içeriyor). İzole DB `csfb108-pg`, 127.0.0.1:55108. CI sırasıyla kuruldu: db push → db:rls-role → apply-migrations ×2 (41/41 iki kez) → db:rls (28→112 politika) → db:generate → seed (`…-ekler/db-setup.log`). Her koşudan önce `DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:55108/fabrika` echo ile basıldı; mutant betiği URL'de 55108 yoksa koşmuyor. Paylaşılan :5433'e bağlanılmadı, gerçek OpenAI çağrısı yapılmadı, kod değiştirilmedi. Mutantlar dosyanın bayt kopyasından geri yüklendi; her turdan sonra `git status` temiz.

## 1. Ne yapıldı
- `eac69b44` diff'i okundu: betik, route ve 6 test dosyası.
- crw-fb'nin temel sayıları yeniden üretildi: emb 119 geçti + 1 skip, docx 83.
- **36 kendi mutantım** (`mut108.sh`, `mut108c.sh`, `mut108d.sh`) ve S16d için bir **yarış testi** (`csfb108-race.live.test.ts`, commit'lenmedi, koşudan sonra silindi) çalıştırıldı.
- Log sızıntısı denetimi: html-to-docx, xmlbuilder2 ve @oozcitak/dom hata mesajları tarandı.
- Canlı testin DB kurulumu okundu. Kapılar koşuldu: tam vitest, live-skip gate, tsc, lint, build.

## 2. Kanıt

### Kendi mutantlarım (`…-ekler/mutants-108.log`, `mutants-108-ek.log`)
| # | Mutant | Sonuç |
|---|---|---|
| E1 | 429 girdi reddi sayılır | ÖLÜ (3) |
| E2 | önekte yalnız 5xx kendi hatasıyla yargılanır (429 ve 503 ayrışır) | **ÖLÜ** (yalnız yeni O-1 testi) |
| E3 | önek 429 özel: ilk 400 ile yargıla | **ÖLÜ** (yalnız yeni test) |
| E4 | önek dışı (tam metin) 429 da önekle yeniden denenir | **SAĞ** → Ö-2 |
| E5 | önek 429'da da `shortened++` | ÖLÜ (yeni test) |
| E6 | önek 429 hata sayacına eklenmez | ÖLÜ (2) |
| U1 | LIKE deseni `%` (her hash) | ÖLÜ (3) |
| U2 | Topic apply'da `id = ANY` kapsamı yok | ÖLÜ (2) |
| U3/U4 | listelemede topic/tenant kapsamı yok sayılır | ÖLÜ (3/3) |
| U5 | profil apply'da `tenantId` filtresi yok | SAĞ: RLS altında eşdeğer (`withTenant`, başka kiracı görünmüyor); derinlemesine savunma |
| U6 | silinmiş kiracılar da taranır (`deletedAt`) | SAĞ → Ö-6 |
| U7 | yedeğe profiller yazılmaz | ÖLÜ (2) |
| U8/U9 | restore Topic döngüsü atlanır / yanlış hash yazılır | ÖLÜ / ÖLÜ |
| U10 | `isMain` hep true (import `main()`'i koşturur) | SAĞ → Ö-6 |
| U11 | "Nothing to clear" dalı yok (boş yedek yazılır) | ÖLÜ |
| U12b | profil metni `console.log` string'inde | ÖLÜ |
| U12c | profil satırı `console.log` **nesne** olarak | **SAĞ** → Ö-3 |
| U12d | profil metni `console.warn` ile | **SAĞ** → Ö-3 |
| C1 | ASCII kapısı yalnız harf ("2030" başlığı düşer) | SAĞ → Ö-5 |
| C2 | ASCII kapısı `\w` ("///" → `___.docx`) | SAĞ → Ö-5 |
| C3 | ASCII kapısı başta harf-rakam ister | SAĞ → Ö-5 |
| C4 | ASCII kapısı `\S` | ÖLÜ |
| C5 | `filename*` de kapıdan düşer | ÖLÜ (2) |
| D19b/c | `>=10` → `>=9` / `>=11` | ÖLÜ / ÖLÜ |
| D19d | sayım (`!== 1`) kontrolü yok | SAĞ → Ö-4 |
| D19e | `entry < 8` → `< 7` | SAĞ → Ö-4 |
| D19f | LE sayımı BE okunur | SAĞ → Ö-4 |
| D4b | bütçe düşümü 1 eksik | ÖLÜ |
| R1 | `reason` kesilmez (ilk satır/200 yok) | SAĞ → Ö-3 |
| R2 | `reason` 20 karakter | ÖLÜ |
| R3 | yanıtta `X-Request-Id` yok | ÖLÜ (2) |
| R4/R5 | regex boşluk kabul / 256 karakter | ÖLÜ / ÖLÜ |
| R6 | log'a `user: session?.user?.email` eklenir | **SAĞ** → Ö-3 |

Toplam: 36 mutant, 25 ölü, 11 sağ (U5 RLS nedeniyle eşdeğer). "429 yerine 503" ayrımı E2 ile ölçüldü. Yeni O-1 testi olmadan 503'lü eski test (`a 400 does not reset…`) bu mutantı yakalamıyordu; yeni test yakalıyor.

### S16d eşdeğer değil (`…-ekler/race-s16d.log`)
Kurulum: sahip rolüyle bir transaction açılıyor, profil ve topic hash'i `new-…` yapılıyor, satır kilidi tutuluyor. `unlockRejected` başlıyor. Listeleme eski `rejected:` değerini okuyor ve yedeği yazıyor. UPDATE kilitte bekliyor. Commit sonrası READ COMMITTED yeniden kontrol ediyor.
```
== ORIGINAL                                   Tests 1 passed (1)
== S16d profil apply: LIKE koruması yok       -"prof": "new-…"  +"prof": null   clearedProfiles 0→1   Tests 1 failed
== S16d-topic Topic apply: LIKE koruması yok  -"top": "newt-…"  +"top": null    clearedTopics 0→1     Tests 1 failed
   aynı mutant, commit'li emb kümesi:         Tests 119 passed | 1 skipped (120)
```

### Log sızıntısı
- `reason`: xmlbuilder2 ve @oozcitak/dom mesajları sabit metin ve düğüm adı içeriyor (`node: <w:p>`). "Text data contains invalid characters" gibi mesajlar metni içermiyor. image-size mesajları sabit metin ve sayı. Kullanıcı metni sızmıyor.
- `requestId`: `^[\w.:-]{1,128}$`. Satır sonu ve `@` geçmiyor; log enjeksiyonu yok.
- `noteId` ve `tenantId`: kişisel veri değil.
- Mevcut test başlık, not metni, görsel baytı ve şablon adı için sızıntıyı gerçekten kilitliyor (O2b ölü). Oturum alanları için kilitlemiyor (R6).

### Canlı testin DB izolasyonu
- Test URL'leri ortamdan alıyor: `DATABASE_URL_RLS_TEST` varsa kod `fabrika_app` ile koşuyor, fixture'lar sahip rolüyle.
- `vitest.config.mts` yalnız ortamda olmayan anahtarları kök `.env`'den dolduruyor. Worktree'de `.env` yok, bu yüzden bu koşu yalnız :55108'e gitti (echo ile doğrulandı).
- Ana checkout'ta `.env` iki URL'yi de `localhost:5433`'e veriyor. Orada çıplak bir `pnpm test`, bu dosyayı da diğer 46 canlı dosya gibi paylaşılan DB'de koşar. Bu bir repo konvansiyonu, bu karta özel değil.
- Etki sınırlı: yalnız `RUN` sonekli satırlar oluşturuluyor, her çağrı `topicIds`/`tenantIds` ile daraltılıyor (U2–U4 ölü, kapsam gerçekten kilitli), temizlik `presentIds`/`requireId` ile yapılıyor, yedek `os.tmpdir()` altında.

### Kapılar (`…-ekler/kapilar-108.txt`, `gate.log`)
```
HEAD a0bec578 · DATABASE_URL=…127.0.0.1:55108/fabrika · CI=true
vitest run:  Test Files 299 passed | 2 skipped (301) · Tests 3896 passed | 50 skipped (3946)   exit=0
  tests/k1-embeddings-unlock.live.test.ts → [passed, passed, passed, passed]
live-skip gate: 46 live files, 401 live tests passed, 42 allowed skip(s)   exit=0
tsc --noEmit -p . exit=0 (0 satır) · pnpm lint exit=0 · pnpm build exit=0 (├ ƒ /api/concept-notes/[id]/export)
```
Sayılar crw-fb'nin birleşik dev sayısıyla (3896/0) birebir aynı.

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUOC2KUFCQGH0-cs-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUOC2KUFCQGH0-cs-fb-ekler/`: mutant betikleri, loglar, yarış testi, kapılar, DB kurulum logu. Betikler scratchpad yollarını varsayıyor.
- Kod değişikliği yok.

## 4. Riskler
- S16d ve Topic karşılığı test edilmiyor. Koruma bugün kodda var. Kaldırılırsa, gece işinin listeleme ile temizlik arasında gömdüğü bir satırın hash'i silinir. Sonraki `--restore` da o satıra eski `rejected:` işaretini geri koyar (restore yalnız `IS NULL` satıra yazıyor), yani iyi bir vektörü olan satır "reddedildi" olarak kilitlenir. Olasılık düşük: betik elle ve tek sefer koşuluyor.
- D19f (LE yolu) güvensiz yönde kayabilir: kütüphanenin okuyamadığı bir görsel tutulur. Sonuç 500 değil, görselsiz yeniden deneme olur (route'taki catch).

## 5. Açık sorular / öneriler (bloke değil)
- **Ö-1:** crw-fb raporundaki "S16d eşdeğer" ifadesi düzeltilmeli. `…-ekler/csfb108-race.live.test.ts` (yaklaşık 40 satır, kanca yok) `tests/k1-embeddings-unlock.live.test.ts`'e taşınabilir. Profil ve Topic korumalarının ikisini de öldürüyor.
- **Ö-2 (E4):** tam metinde 429 alan **uzun** bir satır önekle yeniden denenmemeli; aksi hâlde rate-limit anında satır kalıcı olarak kısaltılmış metinden gömülür. Mevcut 429 testi kısa metin kullanıyor (önek = metin), bu yüzden kör kalıyor. Uzun metinli bir 429 testi ekle.
- **Ö-3:** sızıntı kontrolleri dar kalıyor:
  - (a) Betik testi yalnız `console.log` string argümanlarını birleştiriyor (`calls.flat().join`). Nesne argümanı `[object Object]` oluyor ve `console.warn`/`error` hiç yakalanmıyor (U12c/d). `JSON.stringify(calls)` kullan ve warn/error'u da dinle.
  - (b) Route testindeki oturum mock'u `{ tenantId }`. Log'a eklenen `user.email` `undefined` oluyor ve tam eşleşme bunu yok sayıyor (R6). Mock'a e-posta ve ad ekle, sızıntı listesine koy.
  - (c) `reason`'ın ilk satır ve 200 karakter kesimi sabitlenmemiş (R1).
- **Ö-4 (D19 ailesi):** yalnız big-endian ve count=1 fixture'ı var. LE fixture, `count ≠ 1` ve 7 baytlık kesim eklenmeli (D19d/e/f). "İki yönden sabitlendi" iddiası yalnız son `>= 10` sınırı için doğru.
- **Ö-5 (C1–C3):** yalnız rakamdan oluşan ("2030"), yalnız `/` işaretinden oluşan ("///" → `___`) ve noktalamayla başlayan başlıklar ASCII yedeğinde sabitlenmemiş. D14 testi yalnız `—.!` durumunu kilitliyor. Düşük öncelik.
- **Ö-6:** `isMain` import'ta `main()`'i koşturmadığını hiçbir test sabitlemiyor (U10). Silinmiş kiracı filtresi de sabitlenmemiş (U6). Düşük öncelik.
- Görev metnindeki "KANIT ZORUNLU" satırı sonucun `/Users/macbook/alan/docs/agent-results/TASK-MUO7JSP5FKI8-se-fb.md` yoluna yazılmasını istiyordu. O başka bir ajanın (se-fb) görev kimliği ve dosya adı. Üzerine yazmadım; görevin açıkça verdiği `FONBRIDGE/docs/agent-results/TASK-MUOC2KUFCQGH0-cs-fb.md` yolunu kullandım (crw-fb de aynı uyumsuzluğu bildirmişti).

## 6. Sonraki adım
- Ö-1..Ö-4 için küçük bir test borcu kartı açılabilir (yalnız test; kod değişmez).
- CI'ın ilk koşusunda `k1-embeddings-unlock.live.test.ts`'in 4/4 koştuğunu kontrol et.
- Temizlik: `csfb108-pg` kabı ve `wt108` worktree'si rapor commit'inden sonra kaldırılır (yalnız benim doğurduklarım).
