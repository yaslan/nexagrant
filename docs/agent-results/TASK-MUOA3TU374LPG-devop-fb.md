# TASK-MUOA3TU374LPG — FB İNCELEME-99: agency/report "300 random tables" hızlandırması (TASK-MUO0U24HHVOJH)

**Durum:** TAMAM · **Ajan:** devop-fb · **İncelenen:** `6b27d927` (merge `46da08d7`), dev HEAD `29f0e560` · **Önce:** `413aca46`
**Karar: ONAY (1 düşük öneriyle, Ö-1).** Hızlandırma örnek sayısını, tohumu, üreticiyi ve 81 il taramasını değiştirmiyor. Üretim kodunun davranışı aynı: farklılık testi 1500+1500 geniş tabloda eski ve yeni kod arasında sıfır fark buldu. Rapor tarafındaki 8 mutantın 8'i hem eski hem yeni testte ölüyor. Güç kaybı tek bir yerde var: kapanışın (closure) çağrı geçmişine bağlı olduğu bir hatayı yeni kâhin göremiyor. Bu hatayı eski test yakalıyor. Tek satırlık bir test düzeltmesi açığı kapatıyor (Ö-1).

## 1) Ne yapıldı
Üç ayrı worktree kuruldu: `wt99` (dev HEAD, farklılık testi), `wt99g` (dev HEAD, kapılar ve mutantlar), `wt99pre` (`413aca46`). İzole DB `devopfb99-pg` 127.0.0.1:5599'da. Paylaşılan :5433'e yazılmadı. Worktree'lere `pnpm install --offline --frozen-lockfile` ve `prisma generate` koşuldu.

### a) Diff satır satır: örnek sayısı, tohum, üretici
- `413aca46..HEAD` arasında `src/lib/agency` altında yalnız 3 dosya değişti: `funnel.ts`, `report.ts`, `report.test.ts`. Merge'den sonra agency'ye dokunan başka bir commit yok.
- Property testi bloğunun eski/yeni `diff`'i (awk ile `property: 300 random` … `120_000` aralığı):
  ```
  3a4,9   > endpoints dizisi eklendi (none, orgType, Samsun/Tokat/Çorum/Amasya)
  28c34   expectSameAsDashboard(..., raw)  →  (..., raw, endpoints[n % endpoints.length])
  30c36   yalnız yorum
  ```
  Değişmeyenler: `lcg(20260929)`, `n < 300`, iller listesi, `rnd() < 0.3` / `< 0.6` eşikleri, `reg = floor(rnd()*14)`, `pick()` zinciri ve 120 000 ms bütçe. `endpoints` seçimi `n % 6` ile yapılıyor, `rnd()` tüketmiyor. Bu yüzden 300 tablonun dizisi eskisiyle bit bit aynı.
- `lcg` fonksiyonu aynı (`lcg-ayni`). `edge cases` describe bloğu aynı (`edge-ayni`). `expectSameAsDashboard(` çağrı sayısı eskide 6, yenide 6.
- Kâhinde değişen tek şey şu: eskiden 83 yanıtın her biri için taze `buildAgencyFunnel(raw, b)` çağrılıyordu. Şimdi tek bir `maskAgencyFunnel(raw)` kapanışı 83 kez çağrılıyor. Her tabloda ayrıca bir breakdown taze `buildAgencyFunnel` ile karşılaştırılıyor. Karşılaştırılan hücre kümesi (all, byOrgType, 81 il, listelenmeyen il = sayı yok) aynı.

### b) Üretim kodu davranışı
Üretim kodu da değişti: `funnel.ts` (yeni `maskAgencyFunnel`, `buildAgencyFunnel` artık onun sarmalayıcısı) ve `report.ts` (tabloyu bir kez maskeliyor). Kod okuması: kapanışın gövdesi eski fonksiyonun gövdesiyle aynı. `hidden`, `total` ve `byProvince` yalnız okunuyor. `all` her çağrıda yeniden kuruluyor. Kapanışın durumu yok. Dashboard yolu (`funnel.ts:434`, `readAgencyFunnel…` → `buildAgencyFunnel`) istek başına taze maske kullanıyor, bu yüzden dashboard'da davranış farkı yok.

**Farklılık testi** (`ekler/zz_diff.test.ts.txt`, repoya eklenmedi). Eski `funnel.ts`/`report.ts` `413aca46`'dan `zz_*_pre.ts` olarak kopyalandı ve yeni kodla yan yana koşuldu:
- Her tablo için 83 breakdown'un hepsinde `OLD.buildAgencyFunnel == NEW.buildAgencyFunnel == maskAgencyFunnel(raw)(b)` kontrol edildi. Aynı tablo için `repOld == repNew` de kontrol edildi.
- Tablolar testteki üreticiden daha geniş: her 10 tablodan biri 0–81 il içeriyor. Değerler 60'a kadar çıkıyor. %10 olasılıkla iç içe olmayan adımlar var (`rest < 0` dalı). Normalleştirme dalları için `samsun`, `Bilinmeyen`, `' Tokat'`, `''` gibi anahtarlar da eklendi.
- Sonuç: `SEED=99, N=1500` → `Tests 1 passed`, 96 sn. `SEED=7, N=1500` → `Tests 1 passed`, 111 sn. İki tohumda toplam 2×1500×83 = 249 000 yanıt ve 3000 rapor bire bir eşit çıktı.
- İlk deneme (4000 tablo, her 3 tablodan biri geniş) eski kodun il başına maskelemesi yüzünden 600 sn bütçeyi aşacaktı. Kendi sürecimi durdurup N'i küçülttüm.

### c) Mutant tablosu (`ekler/mut99.py`, `ekler/mut.out`)
Aynı mutant aynı kod üzerinde iki ayrı testle koşuldu: **yeni** `report.test.ts` ve **eski** `report.test.ts` (`413aca46`'dan `zz_report_old.test.ts` olarak kopyalandı). Eski test yalnız `buildAgencyFunnel` kullandığı için yeni kodla uyumlu. Ayrıca `src/lib/agency/` dizininin tamamı koşuldu (`zz_*` hariç, 88 test).

| # | Mutant | yeni-300 | eski-300 | agency/ tamamı |
|---|---|---|---|---|
| R1 | rapor: `shows` → every | KILLED | KILLED | 2 kırmızı |
| R2 | rapor: Tokat atlanıyor | KILLED | KILLED | 1 |
| R3 | rapor: byOrgType.SME = all | KILLED | KILLED | 3 |
| R4 | rapor: il görünümü kayıyor | KILLED | KILLED | 1 |
| R5 | rapor: il'siz kurumlar maskeden önce atılıyor (**toplamlar**) | KILLED | KILLED | 2 |
| R6 | rapor: il tek başına maskeleniyor (**suppressedCells** tamamlayıcı bastırma kaybı) | KILLED | KILLED | 3 |
| R7 | rapor: `all` 10'a yeniden **yuvarlanıyor** | KILLED | KILLED | 3 |
| R8 | rapor: gizli `pipeline` hücresi 0 olarak açılıyor | KILLED | KILLED | 1 |
| F1 | ortak: `suppressedCells` ikincil bastırma kapalı | survived | survived | 20 |
| F2 | ortak: birincil eşik 5→4 | survived | survived | 13 |
| F3 | ortak: il toplamı = genel toplam (crw M7) | survived | survived | 14 |
| W1 | sarmalayıcı: il → none (crw M6) | KILLED | KILLED | 25 |
| S2 | kapanış durumlu: ilk il görünümü önbelleğe alınıyor | KILLED | KILLED | 3 |
| S1 | kapanış durumlu: orgType çağrısından sonra iller maskeleniyor | **survived** | KILLED | 1 (edge "one province") |
| S1b | S1, yalnız ≥2 il varken | **survived** | KILLED | **0 (88/88 yeşil)** |
| S3 | kapanış durumlu, sızıntı yönü: orgType'tan sonra il gizlileri açılıyor (≥2 il) | KILLED | KILLED | 3 |

Okuma:
- **Rapor tarafı (R1–R8):** güç kaybı yok. Görevdeki suppressedCells/toplam/yuvarlama hataları rapora sokulduğunda hem eski hem yeni test yakalıyor.
- **Ortak maskeleme (F1–F3):** eskiden de bu testten kaçıyordu, çünkü rapor ve kâhin aynı maskeleme kodunu çağırıyor. Bu hataları `funnel*.test.ts` yakalıyor (13–20 kırmızı). Bu hızlandırmayla gelen bir gerileme değil.
- **Güç kaybı (S1/S1b):** eski kâhin her yanıt için taze maske kurduğundan, kapanışın çağrı geçmişine bağlı hatalarında raporla ayrışıyordu. Yeni kâhin raporla aynı kapanışı paylaşıyor. Uç kontrolü (`endpoint`) de kapanışın **ilk** çağrısı olarak yapılıyor, yani taze sonuçla her zaman eşit çıkıyor. Böylece "orgType çağrısından sonra iller yanlış" türü bir hata yeni testten kaçıyor. S1b tüm agency suite'inden de kaçıyor. Üretimde bu hata raporda illerin düşmesi anlamına gelir (dashboard taze maske kullanıyor, rapor kullanmıyor). Yön aşırı maskeleme, sızıntı değil. Sızıntı yönündeki eşi S3'ü rapor şeması (`CellSchema`: sayı ≥5, 5'in katı) ve 300 testi yine de yakalıyor. Bugünkü kodda kapanışın durumu yok (b), bu yüzden bu bir **gelecek-regresyon kör noktası**, bugün var olan bir hata değil.

### d) Yük altında süre (yalnız "300 random" testi, vitest JSON `duration`, `ekler/bench99.sh`)
```
yüksüz  (load ~16)          pre1 8052 ms   post1 484 ms   pre2 5764 ms   post2 476 ms
yüklü   (+16 `yes`, load 31–36)  lpre1 13818 ms lpost1 1043 ms lpre2 13140 ms lpost2 788 ms
paralel iki tam koşu (pre+post aynı anda, load 32→39):
                            par-pre 38491 ms   par-post 3828 ms
tek tam koşu (kapılar, load 10→18): 1264 ms
```
Oran yüksüzken ~12–17×, yük altında ~13–17×, paralel tam koşuda ~10×. En kötü gözlem 3,8 sn, 120 sn bütçenin %3'ü. `yes` süreçlerini ben başlattım ve PID'leriyle ben durdurdum (`killed 16`). Paralel koşuda pre tarafında DB'yi bilerek erişilemez bir adrese (`127.0.0.1:1`) verdim. Oradaki 43 kırmızı yalnız DB'li testlerden geliyor. Ölçülen agency testi DB kullanmıyor.

## 2) Kanıt — kapılar (wt99g, dev HEAD `29f0e560`)
```
npx tsc --noEmit  → TSC_EXIT=0
pnpm lint         → LINT_EXIT=0
pnpm build        → ✓ Compiled successfully in 7.9s · i18n check passed · BUILD_EXIT=0
Tam vitest (CI=true, AUTH_SECRET=ci.yml değeri, izole DB :5599; ekler/full.meta, full-summary.txt)
  start 18:54:25 load 10.12 → end 18:55:01 load 18.14
  Test Files  296 passed | 2 skipped (298)
  Tests  3754 passed | 41 skipped (3795)   VITEST_EXIT=0
  scripts/check-live-skips.ts → SKIPGATE=0 (atlananlar izinli: S3/MinIO ve gerçek OpenAI)
DB hazırlığı (ekler/db-prep.txt): db push=0 → db:rls-role=0 → 41 migrasyon ×2 (=0/=0) → db:rls 28→112 → seed=0
```
Not: bu makinede `psql` PATH'te yok. `apply-migrations.sh` ilk denemede `psql: command not found` verdi, ama `| tail` yüzünden `m1=0` gösterdi. Konteyneri silip `/opt/homebrew/opt/libpq/bin` PATH'e eklenmiş ve `pipefail` açık olarak DB'yi baştan kurdum. Yukarıdaki çıktı ikinci kurulumun çıktısı.

## 3) Değişen dosyalar
- Yalnız bu rapor ve `TASK-MUOA3TU374LPG-devop-fb-ekler/` (mut99.py, mut.out, bench99.sh, zz_diff.test.ts.txt, full.meta, full-summary.txt, db-prep.txt). Kod değiştirilmedi. Mutantlar ve `zz_*` dosyaları yalnız scratchpad worktree'lerinde kaldı. Her mutanttan sonra `git status` temizdi (yalnız izlenmeyen `zz_report_old.test.ts`).

## 4) Riskler
- **Ö-1 (düşük, öneri):** yeni kâhin, kapanışın çağrı geçmişine bağlı hatalarını göremiyor (S1b tüm suite'ten kaçıyor). **Tek satırlık düzeltme:** `report.test.ts:53`'teki `if (endpoint) expect(funnel(endpoint)).toEqual(buildAgencyFunnel(raw, endpoint));` satırı `dashboard()` içinde 81 il döngüsünden **sonraya**, `return`'ün hemen önüne taşınmalı. Böylece taze sonuç, kapanışın 83. çağrısıyla karşılaştırılır. Denendi (scratchpad, geri alındı): S1 ve S1b bu değişiklikle **KILLED**, S3 KILLED, mutantsız `report.test.ts` 16/16 yeşil, ek maliyet tablo başına bir maske (~0,35 ms). Karar geliştiricinin (crw-fb). Kod değiştirmediğim için ayrı kart önerilir.
- `maskAgencyFunnel(raw)` maskeyi çağrı anındaki `raw` üzerinden hesaplıyor (crw-fb'nin Risk 1'i). Doğru, bugünkü iki çağıran da sonucu hemen tüketiyor.

## 5) Açık sorular
- Yok. Ö-1'in kart olarak açılması lidere kalmış.

## 6) Sonraki adım
- Ö-1 için küçük bir test kartı açılması (crw-fb, `report.test.ts` tek satır + S1b mutant kanıtı).
- Temizlik: scratchpad worktree'leri (`wt99`, `wt99g`, `wt99pre`) ve `devopfb99-pg` konteyneri bu raporla birlikte kaldırıldı.

**Platform beyanı:** Yalnız mac'te doğrulandı (Darwin 27, Node 26.5, vitest 4.1.11). İncelenen değişiklik saf TS hesaplaması: süreç, dosya yolu, kabuk ya da ikili yok. Bu yüzden Linux CI'da ve Windows'ta davranış aynı, farklılık ve mutant sonuçları platformdan bağımsız. Süre rakamları makineye bağlı. Linux ve Windows bu makinede olmadığı için koşulamadı. Linux'u CI koşacak. Ölçüm betikleri bash (`bench99.sh`) ve python3 (`mut99.py`) bekliyor, BSD `sed -i ''` kullanımı yalnız mac'e özgü.
