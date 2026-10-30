# TASK-MVV72UUJXVN1 (FO-254) — pre-push gate kararsızlığı: kısmi rapor

**Ajan:** devop-fb · **Platform:** mac · **Durum:** IN PROGRESS (tamamlanmadı)

## Ne yapıldı

1. Kırmızı testler sınıflandırıldı (yük kaynaklı mı, gerçek yarış mı).
2. `tests/expert-prereg.live.test.ts` founder yarışı düzeltildi (commit `70007c62`).
3. Kalan iki zamanlama dosyası (m17, rag-pdf) bu turda DEĞİŞTİRİLMEDİ.

## Sınıflandırma

| Test | Kök neden | Sınıf | Durum |
|---|---|---|---|
| `expert-prereg.live` › founder number race (2 test) + CSV | Paylaşılan pool `connectionTimeoutMillis: 1000` (`src/lib/db.ts:95`); 20 eşzamanlı doğrulama yük altında bağlantı alamadı → `timeout exceeded when trying to connect` | yük kaynaklı (gerçek yarış DEĞİL: sayaç mantığı izole koşuda geçti) | **düzeltildi** |
| `m17-interreg-extract` (event-loop maxGap < 120 ms, `Date.now` < 1500/2000 ms) | Sabit süre eşikleri, paralel gate yükünde | yük kaynaklı | açık |
| `rag-pdf-worker-isolation` (worstGapMs < 500; bomb ms < 2000/3000/5000) | Sabit süre eşikleri | yük kaynaklı | açık |

## Düzeltme: expert-prereg.live (commit 70007c62)

- **Eski:** test, paylaşılan `prisma` singleton'ını kullanıyordu → bağlantı kurma zaman aşımı 1000 ms.
- **Yeni:** test kendi istemcisini kuruyor: `createDbClient(DATABASE_URL, { max: 20, connectionTimeoutMillis: 15000 })`.
- Üretim havuzu (`src/lib/db.ts`) DEĞİŞMEDİ. Assertion'lar DEĞİŞMEDİ. Yalnız bağlantı bekleme süresi, bu dosyaya özel.

**Kanıt (yük ortalaması 20:05'te 37 → 102 → 121, düşük yük):**
```
Test Files  1 passed (1)   Tests  3 passed (3)   # koşum 1
Test Files  1 passed (1)   Tests  3 passed (3)   # koşum 2
```
Önceki gate hatası yük ~150'de oluştu; bu koşum o yükü birebir tekrarlamadı. Düzeltmenin yük altında kanıtı henüz yok.

Tip kontrolü: `tsc --noEmit` ile `expert-prereg.live` dosyasında hata yok. Pre-commit kapısı (`eslint` + `tsc` staged kapsamı) temiz geçti.

## Ortam notu

- Geçici DB: `docker` konteyneri `fo254-live` (pgvector pg16, `127.0.0.1:55433`), `scripts/db-setup.sh` ile kuruldu (exit 0). Konteyner ve parolalar yalnız bu geçici DB içindir; kod ya da log'a yazılmadı.
- `scripts/setup-rls-role.ts` eski porta (55432) bağlanıyordu; worktree `.env` dosyasındaki `DATABASE_URL_RLS_TEST` değerinden geliyor. `DATABASE_URL_RLS_TEST` ortam değişkeniyle geçildi.

## Kalan iş (FO-254 kapanmadı)

1. m17 ve rag-pdf zamanlama eşikleri: her biri için eski/yeni değer belgelenerek, eşikleri SESSİZCE gevşetmeden düzenleme ya da yük-bağımsız ölçüm (baseline'a göre oran).
2. `docs/GATE.md`: gate-lock beklemesi ve Bash 600 sn zaman aşımı notu.
3. İki ardışık temiz `scripts/gate-isolated.sh` koşumu (arka planda, `run_in_background`).

## Push durumu

FO-250 push'u (`99056cce`, `444d466d`, `7911b58d`, + `70007c62`) HÂLÂ BEKLİYOR. Lider kararı (seçenek a): FO-254 kapanana kadar push yok. `--no-verify` kullanılmadı.

## Riskler

- Sabit süre eşikleri yük altında yeniden kırılabilir; yalnız yarışı kapatmak gate'i tek başına kararlı yapmaz.
- Bu koşumlar düşük yükte; gate kararlılığı yüksek yükte kanıtlanmadı.

## Açık sorular

- Lider: m17/rag-pdf eşiklerinde yük-bağımsız ölçüm (oran) mı, yoksa eşik artırımı mı tercih edilir? Öneri: oran (baseline'a göre), eşik değişikliği belgelenerek.

## Sonraki adım

m17 ve rag-pdf zamanlama testlerini düzenle → `docs/GATE.md` notu → iki temiz arka plan gate koşumu → bu raporu güncelle → kart `review`.

## Kanıt (ham çıktı)

```
$ uptime
20:05  load averages: 37.05 102.13 121.86
$ npx vitest run tests/expert-prereg.live.test.ts   (x2)
 Test Files  1 passed (1)
      Tests  3 passed (3)
```
