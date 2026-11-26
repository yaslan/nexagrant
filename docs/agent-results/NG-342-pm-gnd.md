---
görev: TASK-MWSWJWFAYNC6G
kod: NG-342
ajan: pm-gnd
motor: claude
tip: belge
okur: ekip
hüküm: "Bitti (belge): HUKUK-5 veri sorumlusu kararı (23.11.2026) HUKUK-SORULARI-2026-09.md sürüm 1.15'e işlendi; KVKK md.28/1 atfı düzeltildi; kanıt satırları sembol adlarına çevrildi. Kod değişmedi. Açık: 0/900 ↔ 4-6/900 (NG-339 bekleniyor), Yönetmelik md.11 / md.7/3 atfı resmî metinle teyit edilmedi. Birleştirilmedi."
platform: "Windows 11 + WSL2 Ubuntu-24.04: worktree ~/alan/wt/ng-342, izole DB (pgvector pg16, fabrika_test_ng342, 127.0.0.1:5521), pre-push tam gate. Belge değişikliği; platforma bağlı kod yok."
tarih: 2026-11-23
pr: https://github.com/yaslan/nexagrant/pull/420
dal: task/ng-342
commitler: [8e51d6d2]
---

# NG-342 — HUKUK-5 veri sorumlusu kararı (23.11.2026)

## Ne yapıldı
1. `docs/legal/HUKUK-SORULARI-2026-09.md` sürüm 1.15 (sürüm başlığı ve değişiklik notu).
2. §3.1 sonuna **"Karar (23.11.2026) — veri sorumlusu kararı, hukukçu görüşü değil"** alt bölümü eklendi:
   - 5a HAYIR (anonim sayılmaz) → NG-344.
   - 5b HAYIR (zaman kanalı pilottan önce kapanır; yalnız ay sonu güncellemesi) → NG-340.
   - 5c EŞİK 10 (`SMALL_CELL_THRESHOLD` 10; yuvarlama eşiğin katı) → NG-339.
   - 5d EVET (indirme kapalı, yalnız ekran) → NG-341.
   - 5e HAYIR (ajansın kendi kurumları il kırılımında düşülür; yapılamazsa il kırılımı kaldırılır) → NG-339.
   - Saklama/imha: ajans raporu 12 ay; 6 ayda bir periyodik imha; silme kaydı en az 3 yıl; süresiz saklama kaldırıldı; gerekçe KVKK md.4/2-d ve Yönetmelik md.11; ödeme/komisyon kayıtları ticari saklamaya tabi, kodda böyle bir bağ yok.
   - Pilot koşulu: dört koşul birlikte sağlanmadan pilot açılmaz.
   - "Cevaba göre ne değişir" tablosunda ilgili satırlar işaretlendi.
3. Düzeltmeler: 5a "5'e yuvarlama" → "10'a yuvarlama"; KVKK atfı md.28/1-ç → **md.28/1-b**; kanıt satırındaki `funnel.ts:61` / `:168` sabit satırları sembol adları ile değiştirildi (`SMALL_CELL_THRESHOLD`, `FUNNEL_ROUND_STEP`, `roundForDisplay`, `suppressedCells`, `buildAgencyFunnel`).
4. Sürüm numarası: kart "1.12" diyordu ama dosyada 1.12 zaten vardı; **1.15** kullanıldı.
5. Ek metin (`agency-channel-notice-addendum.md`) değiştirilmedi (NG-344 kapsamında).

## Kanıt (ham çıktı)

KVKK md.28/1-b (6698, mevzuat.gov.tr dosyası):
```
b) Kişisel verilerin resmi istatistik ile anonim hâle getirilmek suretiyle araştırma, planlama ve istatistik gibi amaçlarla işlenmesi.
```
KVKK md.28/1-ç (önceki atıf yanlıştı):
```
ç) Kişisel verilerin millî savunmayı, millî güvenliği, kamu güvenliğini, kamu düzenini veya ekonomik güvenliği sağlamaya yönelik olarak kanunla görev ve yetki verilmiş kamu kurum ve kuruluşları tarafından yürütülen önleyici, koruyucu ve istihbari faaliyetler…
```
KVKK md.4/2-d: "d) İlgili mevzuatta öngörülen veya işlendikleri amaç için gerekli olan süre kadar muhafaza edilme."

Yönetmelik md.11: resmî metin mevzuat.gov.tr'den okunamadı; üçüncü taraf özet (lexpera) md.11'in periyodik imhayı ve "altı ayı geçemez" üst sınırını, "en az üç yıl" silme kaydı cümlesini ise md.7/3'te gösteriyor.

Belge değişikliği:
```
docs/legal/HUKUK-SORULARI-2026-09.md | 40 ++++++++++++++++++++++++++++++++----
 1 file changed, 36 insertions(+), 4 deletions(-)
```

Pre-push: tam gate koştu (belge + `docs/artifacts` farkı nedeniyle). İlk koşuda 4 canlı test kırıldı (`tests/public-lead-stuck.live.test.ts` (h)/(i)/(j), `tests/province-lead-route.live.test.ts` D-2). Bu testler yalnız kendi dosyaları tek başına koşulduğunda 40/40 geçti; ikinci push denemesinde gate yeşil geçti, `PUSH_EXIT=0`. Kod değişmediği için kırılma paralel canlı testlerin ortak DB durumundan kaynaklanıyor olabilir; bu bir ön sezi, kanıtlanmış bir neden değildir.

## Değişen dosyalar
- `docs/legal/HUKUK-SORULARI-2026-09.md`
- `docs/agent-results/NG-342-pm-gnd.md` (bu dosya)

## Riskler
- Karar, veri sorumlusunun kararıdır; hukukçu görüşü değildir ve hukukçu onayı alınmamıştır. Belgenin her yerinde bu ayrım korunmuştur.
- Yönetmelik md.11 / md.7/3 çelişkisi resmî metinle teyit edilmedi. Yönetmelik mevzuat.gov.tr'den erişilemedi.
- md.28/1-b "resmî istatistik ile" anonimleştirmeyi anar; FonBridge'in kendi anonimleştirmesinin bu bente girip girmediği açıktır (hukukçu sorusu).
- Ajans panosunun ve raporunun pilottaki durumu 5a HAYIR kararında yazılı değildir; ayrı soru olarak açık.
- Canlı testlerin tam koşuda sıra/durum bağımlı kırılması (yukarıda) takip edilmeli.

## Açık sorular
1. **Tutarsızlık (c):** `funnel.ts` yorumundaki "10'da üç yolun üçü 0/900" ile 5e'deki "4-6/900". Base dalında yorum metni aranmış, bulunamamıştır. **NG-339 bekleniyor**; ölçüm gelince iki yer eşitlenecek.
2. Yönetmelik md.11 vs md.7/3: silme kaydı "en az 3 yıl" atfı hangi maddededir?
3. md.28/1-b kapsamı: FonBridge anonimleştirmesi bu bente girer mi?
4. Ajans panosunun/raporunun pilottaki durumu (5a HAYIR sonrası).

## Sonraki adım
- NG-339 ölçümü gelince "0/900" ve "4-6/900" tutarsızlığını kapatmak.
- Hukukçuya Yönetmelik atfı ve md.28/1-b sorularını iletmek.
- NG-344 ek metin güncellemesi.
- PR #420 `gh pr checks` yeşil olana dek izlenecek; birleştirme yok.
