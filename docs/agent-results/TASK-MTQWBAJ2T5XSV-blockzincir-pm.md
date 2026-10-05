# TASK-MTQWBAJ2T5XSV — F11 + F14: kanıtsız puanlar + öksüz kanıt satırları

**Ajan:** blockzincir-pm · **Tarih:** 2026-09-07 · **Commit:** `3a33311` (dev)

## 1) Ne yapıldı

### Önce — çökme sonrası DB durumu tespiti
Ağaçtaki `scripts/clean-orphan-topic-matches.ts` commit'lenmemiş haldeydi ve iki tip hatası veriyordu.
İşe başlamadan önce script'i çalıştırıp mevcut DB durumunu ölçtüm; sonuç, S10 çökme dalgasının şema
yeniden kurulumunun bu görevin varsaydığı fixture verisini de sildiğini gösterdi (bkz. §3).

### Tip hataları (satır 38, 61)
Kök neden `any` eksikliği değildi — **`prisma.topicMatch.findMany()` bu repoda `any[]` dönüyordu**,
`prisma.opportunity.findMany()` dahil tüm model delege'leri için genel bir inference sorunu (izole
prob dosyasıyla doğruladım, aşağıda kanıt). `scripts/rescore-g0.ts` bunu zaten satır 53-59'da elle
tip vererek atlatmış — aynı deseni uyguladım: `TopicMatchRow` arayüzü tanımlayıp `findMany` sonucuna
ve ara değişkenlere elle tip verdim. `any` eklemedim, gerçek satır tipini yazdım (CLAUDE.md "Yapma"
maddesine uygun). Ayrıca `pnpm prisma generate` çalıştırdım (yalnız client codegen — DB'ye dokunmaz,
bkz. §3) çünkü generated client `TopicMatch` modelini içermiyordu; bu adım gerekliydi ama tip
hatasının asıl nedeni değildi.

### F14 — öksüz TopicMatch satırları
Script'in mantığı zaten doğru: `g0ScorerPlaceholderFitScore: true` bayraklı `breakdown` satırlarını
(G0 skorlayıcının bir fırsatın skor kırılımını tutmak için ürettiği, gerçek K1 eşleşmesi olmayan
satırlar) bulup, o (tenantId, topicId) çiftine bağlı canlı (deletedAt=null) fırsat kalmamışsa öksüz
sayıyor. Dry-run sonucu: **0 öksüz** (bkz. §3 — DB'de sadece 5 satır var, hepsi canlı fırsata bağlı).
Silme işlemi çalıştırılmadı çünkü silinecek bir şey yok.

### F11 — esr-calibration kararı
Kod değişikliği gerektirmedi: DB'de `esr-calibration` kiracısı **mevcut değil** (0 fırsat). Görev
metninde tarif edilen "20 fırsat, g0Score 35.65–81.51, topicId=null" senaryosu şu an DB'de yeniden
üretilemiyor — S10 çökme dalgasının şema yeniden kurulumu bu fixture'ı da silmiş. Karar: **eylem yok,
gerekçeli erteleme**. Detay §3.4.

### F14(4) — öksüz kayıt yeniden oluşmasın mı?
Şema doğrulaması: `TopicMatch`'in `Opportunity`'ye hiçbir FK/cascade ilişkisi yok (yalnız `Topic`'e
cascade var, `prisma/schema.prisma:387`). `Opportunity.deletedAt` soft-delete. Yani bir fırsat
silindiğinde (soft ya da hard) o topicId'ye bağlı `TopicMatch` satırına hiçbir şey olmuyor — script'in
kendi docstring'i bunu zaten TASK-MTQZNBGENT12T olarak dosyalamış (satır 12-13). Yeni bir bulgu değil,
teyit ettim; tekrar dosyalamadım.

## 2) Kanıt

### Tip hataları giderilmeden önce
```
$ npx tsc --noEmit -p tsconfig.json 2>&1 | grep clean-orphan
scripts/clean-orphan-topic-matches.ts(38,12): error TS7006: Parameter 'rows' implicitly has an 'any' type.
scripts/clean-orphan-topic-matches.ts(38,34): error TS7006: Parameter 'r' implicitly has an 'any' type.
scripts/clean-orphan-topic-matches.ts(61,89): error TS7006: Parameter 'o' implicitly has an 'any' type.
```

### Kök neden doğrulaması (izole prob — `prisma.opportunity.findMany` de aynı sorunu veriyor)
```
$ cat scripts/tmp-probe-tm2.ts   # (geçici — silindi)
...
$ npx tsc --noEmit -p tsconfig.json 2>&1 | grep tmp-probe-tm2
scripts/tmp-probe-tm2.ts(8,26): error TS7006: Parameter 'r' implicitly has an 'any' type.   # opportunity.findMany
scripts/tmp-probe-tm2.ts(11,27): error TS7006: Parameter 'r' implicitly has an 'any' type.  # topicMatch.findMany({})
```
→ repo genelinde bilinen bir sorun, `scripts/rescore-g0.ts:53-59` zaten aynı elle-tip desenini kullanıyor.

### Düzeltmeden sonra — tip hataları temiz, repo geneli 0 hata
```
$ npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l
0
```

### Script dry-run — DB durumu (öncesi = sonrası, silme yapılmadı)
```
$ pnpm tsx scripts/clean-orphan-topic-matches.ts
DRY RUN — TopicMatch rows before: 5
placeholder rows (g0-scorer-created): 5
orphans (no live opportunity references that topic): 0

Nothing deleted (dry run). Re-run with -- --apply to delete the rows listed above.
```
5 satırın 5'i de `demo-tenant`e ait, `computedAt` hepsi 2026-09-07T10:35:21 civarı — S10 rebuild/reseed
zaman damgasıyla örtüşüyor; hepsinin karşılık gelen canlı fırsatı var (orphan=0).

### F11 — esr-calibration kiracısı DB'de yok
```
$ pnpm tsx scripts/tmp-probe-esr2.ts   # (geçici — silindi)
tenants: demo-tenant(Fabrika Beta)
opportunities with topicId=null AND g0Score set: 0
total opportunities in DB: 5
```
Tek kiracı `demo-tenant`; `esr-calibration` kiracısı ve `scripts/esr-calibration.ts --apply`'ın
yazdığı 20 örnek fırsat DB'de mevcut değil.

### pnpm gate
```
$ pnpm typecheck     → temiz (0 hata)
$ pnpm test          → 537 passed | 8 skipped (56 test dosyası)
$ pnpm rls:check     → ✅ 38/38 model RLS'e kayıtlı
$ pnpm rls:verify    → ✅ 38/38 tabloda izolasyon canlı ölçümde doğrulandı (41 RLS-açık tablo, 38 tenant_isolation politikası)
$ pnpm lint          → 2 hata — ama benim dosyamda değil: tests/e2e/zz-tmp-consortium-shot.spec.ts
                        (untracked, başka bir ajanın geçici probe dosyası, benim kapsamım dışında)
$ npx eslint scripts/clean-orphan-topic-matches.ts → 0 hata/uyarı
```
`pnpm gate` tam koşumu lint adımında bu yabancı dosya yüzünden kırmızı duruyor; kendi dosyam ve
staged kapsam (`githooks/pre-commit`) temiz — commit hook'u bunu doğruladı ve geçti.

## 3) DB'ye ne yapıldı / yapılmadı (ekip için kritik)

1. **`pnpm prisma generate` çalıştırdım** — yalnız client kod üretimi, `schema.prisma`'yı okur,
   DB'ye BAĞLANMAZ, hiçbir migration/tablo/veri değiştirmez. Gerekliydi çünkü generated client
   `TopicMatch` modelini (ve dolayısıyla `.topicMatch` erişimini) içermiyordu.
2. **`prisma migrate` / `db push` / `reset` ÇALIŞTIRMADIM.** DB'ye yaptığım tek şey iki `SELECT`/`count`
   sorgusu (dry-run script + iki geçici prob dosyası, ikisi de yalnız okuma yaptı, ikisi de silindi).
   `--apply` bayrağını hiç geçmedim; `deleteMany` hiç çalışmadı.
3. **DB'de bulduğum durum, benim değiştirdiğim bir şey değil, S10 çökme dalgasının mirası:**
   `TopicMatch` tablosunda 5 satır (hepsi bugün 10:35'te oluşmuş — muhtemelen rebuild sonrası reseed/
   rescore), `esr-calibration` kiracısı hiç yok, DB'de tek kiracı `demo-tenant`.
4. **F11 kararı — gerekçeli erteleme, silme değil:** Görev metninin tarif ettiği 20 fırsatlık
   kalibrasyon fixture'ı `scripts/esr-calibration.ts` tarafından `esr-calibration` kiracısına yazılıyor
   (kendi kendine izole, `--apply` olmadan hiçbir şey yazmıyor, idempotent upsert, `--rollback` ile geri
   alınabilir — script docstring'i satır 9-23). Bu fixture DB'de artık yok, dolayısıyla "meşru mu artık
   mı" sorusu şu an **cevaplanamaz durumda** — silinecek ya da etiketlenecek bir satır yok. Fixture'ı
   kendim yeniden üretmedim: bu, bloke `TASK-MTQ2KL3JO4MK2`'nin (E11.3, 2026-09-20'yi bekliyor) sahibinin
   kararı olmalı. **Bulgu:** o görev yeniden başladığında `esr-calibration.ts --apply` çalıştırılmadan
   önce bu rapor okunmalı — kalibrasyon verisi S10 çökmesinde kaybolmuş, sıfırdan yeniden üretilmesi
   gerekiyor.

## 4) Değişen dosyalar
- `scripts/clean-orphan-topic-matches.ts` (yeni, commit `3a33311`) — tip hataları giderildi, mantık
  değişmedi.
- Geçici prob dosyaları (`scripts/tmp-probe-tm*.ts`, `scripts/tmp-probe-esr*.ts`) oluşturuldu, test
  edildi, **silindi** — repoda iz bırakmadı.

## 5) Riskler
- `esr-calibration` fixture'ının kaybolmuş olması, TASK-MTQ2KL3JO4MK2'nin kalibrasyon sonuçlarını
  etkileyebilir — o görev sahibi bunu bilmeli (bu rapor + görev kartı yorumuyla iletiliyor).
- `tests/e2e/zz-tmp-consortium-shot.spec.ts` (untracked, başka ajana ait) `pnpm gate`'i kırıyor;
  benim kapsamım dışında, dokunmadım, ama ekip genel gate'i şu an bu dosya yüzünden kırmızı.

## 6) Açık sorular
- Yok — F11 kararı görev metninde öngörülen ikinci seçenekle (bloke görevle ilişkilendir, silme)
  uyumlu; sadece "etiketlenecek satır" şu an DB'de mevcut değil.

## 7) Sonraki adım
- Bu rapor + bulgu, `TASK-MTQ2KL3JO4MK2` kartına not düşülmeli (fixture'ın kaybolduğu, yeniden
  `--apply` gerektiği).
- `tests/e2e/zz-tmp-consortium-shot.spec.ts` dosyasının sahibi tespit edilip temizletilmeli
  (gate'i kırıyor) — benim kapsamım dışında olduğu için ben silmedim.
