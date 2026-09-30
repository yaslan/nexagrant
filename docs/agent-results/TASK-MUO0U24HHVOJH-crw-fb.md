# TASK-MUO0U24HHVOJH — agency/report "300 random tables" yük altında 120 sn'yi aşıyordu (İNCELEME-74 Ö-1)

**Durum:** TAMAM · **Ajan:** crw-fb · **Dal:** `crw-fb/muo0u2-agency-report-perf` (dev `413aca46`'dan) · **Platform:** mac (Darwin 27, 12 çekirdek)

## 1) Ne yapıldı

**Kök neden ölçüldü.** Yavaşlık üreticiden ya da DB'den gelmiyor. Test DB'ye hiç gitmiyor, testin kendi yazdığı dashboard kâhininden geliyor. Testin kopyasına zamanlayıcı ekleyip 300 tabloyu ölçtüm (yük ~12):

| parça | süre |
|---|---|
| `table()` üretici | 57 ms |
| `buildAgencyReport` (test edilen kod) | 959 ms |
| `dashboard()` kâhini | **21 646 ms (%94)** |
| `expect` çağrıları (ayrı ölçüm, 24 300 toBe + 24 300 toEqual) | ~2,6 sn |

`dashboard()` her tablo için `buildAgencyFunnel`'i 83 kez çağırıyordu: none, orgType ve 81 il. Her çağrı `suppressedCells` ile maskelemenin tamamını baştan hesaplıyor. 300 tabloda bu yaklaşık 25 000 maskeleme ediyor. Oysa maskeleme breakdown'a bağlı değil: `suppressedCells` her breakdown'u birlikte maskeliyor ve aynı tablo için 83 kez aynı sonucu veriyor.

**Üründe gerçek bir perf sorunu yok.** Tek çağrı ~0,35 ms. Dashboard istek başına bir kez maskeliyor, rapor ajans başına 1+il sayısı kadar. Üründeki tek israf bu: rapor aynı tabloyu il başına yeniden maskeliyordu.

**Düzeltme (kapsam korunarak "pahalı kurulumu paylaş"):**
- `src/lib/agency/funnel.ts`: yeni `maskAgencyFunnel(raw)` eklendi. Tabloyu bir kez normalleştirip maskeliyor ve `(breakdown) => AgencyFunnel` döndürüyor. Gövde, eski `buildAgencyFunnel` gövdesinin aynısı. `buildAgencyFunnel(raw, b)` artık `maskAgencyFunnel(raw)(b)`, yani imzası ve davranışı aynı kaldı. `all` görünümü her çağrıda yeniden kuruluyor, çağrılar aynı nesneyi paylaşmıyor.
- `src/lib/agency/report.ts`: `buildAgencyReport` tabloyu bir kez maskeliyor ve orgType ile il görünümlerini aynı maskeden alıyor (üründe küçük bir kazanç).
- `src/lib/agency/report.test.ts`: `dashboard()` kâhini tabloyu bir kez maskeleyip 83 yanıtın hepsini bu maskeden kuruyor. **300 tablo, her tabloda 81 il ve her hücre karşılaştırması aynen duruyor.** Tohum (`20260929`), tablo sayısı ve 120 sn bütçesi değişmedi. Ek olarak her tabloda sırayla bir breakdown (none → orgType → Samsun/Tokat/Çorum/Amasya) gerçek uç fonksiyon `buildAgencyFunnel` üzerinden de karşılaştırılıyor. Böylece kâhin, dashboard'un çağırdığı fonksiyona bağlı kalıyor.

Sayı düşürme, timeout büyütme ya da gevşetme yok.

## 2) Kanıt

**Önce/sonra, yalnız "300 random tables" testinin süresi (vitest JSON `duration`).** Önceki sürüm dev `413aca46`'nın ayrı worktree'si, sonraki bu dal. Sırayla koşuldu (`ekler/bench.sh`):

```
yüksüz (load ~10)            pre1 5801 ms   post1 459 ms
                             pre2 7437 ms   post2 697 ms
yük altında (+24 `yes` CPU yakıcı, 12 çekirdek; load 19→36)
                             lpre1 23577 ms  lpost1 2258 ms
                             lpre2 25695 ms  lpost2 2280 ms
```
Yük altında ~10,8× hızlandı. İNCELEME-74/se-fb'deki 130 sn'lik koşu aynı oranla ~12 sn'ye iner, 120 sn bütçesinin %10'u. Tam `vitest run` içinde (paralel 296 dosya + eşzamanlı `tsc`) test **2 344 ms** sürdü.

**Mutantlar (`ekler/mut.py`).** Her mutant için "300 random" testi tek başına ve `src/lib/agency/` dizininin tamamı koşuldu:
```
M1 report: shows=every                 : property300=KILLED | agency dir: Failed Tests 2
M2 report: skip Tokat                  : property300=KILLED | agency dir: Failed Tests 1
M3 report: byOrgType SME = all         : property300=KILLED | agency dir: Failed Tests 3
M4 report: province view off-by-one    : property300=KILLED | agency dir: Failed Tests 1
M5 mask: absent province known        : property300=KILLED | agency dir: Failed Tests 6
M6 wrapper: ignores breakdown          : property300=KILLED | agency dir: Failed Tests 25
M7 mask: province uses grand total     : property300=survived | agency dir: Failed Tests 14
```
M7 ortak maskeleme koduna dokunuyor, yani rapor ve kâhin aynı yanlışı üretiyor. **Önceki sürümde de aynı mutant bu testten kaçıyor** (`PRE M7 property300= survived`), çünkü o sürümde de iki taraf aynı `buildAgencyFunnel`'i çağırıyordu. Bu mutantı `funnel.test.ts` ile `funnel.attack.test.ts` yakalıyor (14 kırmızı). Kapsam kaybı yok. M5, kâhinin 81 il taramasının hâlâ işe yaradığını gösteriyor: rapor yalnız mevcut illeri dolaştığı için bu hatayı ancak o tarama yakalayabilir.

**Kapılar:**
```
npx tsc --noEmit            → TSC_EXIT=0
pnpm lint                   → LINT_EXIT=0
pnpm build                  → BUILD_EXIT=0 · ✓ Compiled successfully · i18n check passed
Tam vitest (CI=true, AUTH_SECRET = ci.yml değeri, izole DB crwfb-muo0u2-pg :5497; ekler/full.out)
  start 18:15:54 load 13.60 → end 18:16:27 load 20.95, eşzamanlı tsc
  Test Files  296 passed | 2 skipped (298)
  Tests  3701 passed | 41 skipped (3742)   EXIT=0
  scripts/check-live-skips.ts → SKIPGATE=0 (atlananlar izinli: evidence-upload-s3.live 21, evidence-confirm-store-faults.live 11, k1-daily-calls 4, adapters 2, sedia-adapter 2, k1-embeddings.live 1; S3/MinIO ve gerçek OpenAI yok)
```
DB CI sırasıyla hazırlandı: `db push` → `db:rls-role` → 40 migrasyon ×2 → `db:rls` (28 → 112) → seed (`ekler/db-prep.txt`). Paylaşılan :5433'e yazılmadı.

## 3) Değişen dosyalar
- `src/lib/agency/funnel.ts` — `maskAgencyFunnel` eklendi; `buildAgencyFunnel` onun sarmalayıcısı oldu.
- `src/lib/agency/report.ts` — rapor tabloyu bir kez maskeliyor.
- `src/lib/agency/report.test.ts` — kâhin maskeyi paylaşıyor; her tabloda bir breakdown `buildAgencyFunnel`'e karşı ayrıca kontrol ediliyor.
- `docs/agent-results/TASK-MUO0U24HHVOJH-crw-fb.md` + `-ekler/` (db-prep, full.out, mut.py, bench.sh).

## 4) Riskler
- `maskAgencyFunnel(raw)` maskeyi çağrı anındaki `raw`'dan hesaplıyor. Dönen fonksiyon, `raw` sonradan değiştirilirse eski maskeyi kullanır. Bugünkü iki kullanıcı (rapor ve test) onu hemen tüketiyor, `raw` her istekte taze.
- Rapor ve kâhin eskiden de ortak maskeleme kodunu çağırıyordu. Bu test bir maskeleme hatasını değil, raporun dashboard'u birebir kopyaladığını kanıtlıyor. Maskeleme doğruluğu `funnel*.test.ts`'in işi (M7 kanıtı).
- Build için worktree'ye `pnpm install --offline --frozen-lockfile` ile gerçek `node_modules` kuruldu. Nedeni: Turbopack symlink'i reddediyor (İNCELEME-74 notu).

## 5) Açık sorular
- `funnel.attack.test.ts`'deki 12 "300 random small tables" testi tam koşuda 1–3,6 sn sürüyor; bütçeleri 30 sn. Şimdilik risk görmüyorum, ayrı kart gerekmiyor.

## 6) Sonraki adım
- dev'e merge edildi (push yok). İnceleme kartı açılırsa inceleyici `ekler/bench.sh` ve `ekler/mut.py` ile yeniden koşabilir.

**Platform beyanı:** Yalnız mac'te doğrulandı (Darwin 27, 12 çekirdek, Node + vitest 4.1.11). Değişiklik saf TS hesaplaması: süreç, dosya yolu, kabuk ya da ikili yok, bu yüzden Linux CI'da ve Windows'ta davranış aynı. Windows ve Linux'ta ayrıca koşulmadı, çünkü bu makinede o ortamlar yok. Linux'u CI koşacak. Ölçüm betikleri (`bench.sh`, `mut.py`) bash ve python3 bekliyor.
