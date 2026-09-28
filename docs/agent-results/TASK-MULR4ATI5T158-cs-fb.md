# TASK-MULR4ATI5T158 — İlkadım pilotu + OKA kanal paketi · CS-FB

**Sprint:** FB-KAMU-1 · **Tip:** doküman (kod yok) · **Tarih:** 29.09.2026 · **Ajan:** cs-fb

## 1. Ne yapıldı

`docs/kamu/` altında 4 taslak belge yazıldı. Hiçbir kuruma gönderim yapılmadı. Kişi adı, unvan ve iletişim bilgisi yazılmadı; hepsi `[...]` yer tutucusu.

| Dosya                            | İçerik                                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/kamu/ILKADIM-PILOT.md`     | 90 günlük pilot: kapsam (6 koltuk, 4 birim, Ekip planı), 12 haftalık akış, 7 ölçülebilir başarı ölçütü (Ö1–Ö7, hedef + ölçüm kaynağı), 22/d sınırına göre 3 TL paket önerisi, 7 risk, 5 açık soru, kaynak listesi |
| `docs/kamu/OKA-KANAL-ONERISI.md` | Ajans dağıtım modeli, beyaz etiket seçenekleri, bölge başvuru hunisi raporu, ajans kazancı, 3 ticari seçenek, **12 maddelik ürün boşlukları listesi (B1–B12)**, kanal pilotu ölçütleri, kaynaklar                 |
| `docs/kamu/SUNUM-METNI.md`       | 10 dk görüşme akışı, 10 slayt + konuşma notları, demo sırası karne → radar → konsept not, görüşme öncesi kontrol listesi, SSS                                                                                     |
| `docs/kamu/EPOSTA-TASLAKLARI.md` | İlkadım Başkanlık + İlkadım AB birimi + OKA Genel Sekreterlik ilk temas; cevapsızlık takibi; görüşme sonrası takip (tr)                                                                                           |

### Kartın metninden sapan önemli bulgu — CERV

Kart hafta 5–8 için "CERV **veya** Erasmus+" konsept notu istiyor. Komisyonun resmî CERV katılımcı ülke listesinde (V10.0, 01.08.2025) **Türkiye yok**. AB dışında yalnız Arnavutluk, Bosna-Hersek, Kosova, Moldova, Karadağ, Kuzey Makedonya, Sırbistan ve Ukrayna var. Web aramasının özet cevabı bunun tersini söyledi; birincil PDF okunarak düzeltildi. Sonuç: pilotta konsept not **Erasmus+** için yazılır (Türkiye programa ortak ülke). Aynı kontrol **LIFE** için de yapıldı: LIFE katılımcı ülke listesinde (V10.0, 01.03.2026) de Türkiye yok; belgelerde LIFE aday program olarak geçmiyor. Paralel radar kartı (TASK-MULR39X1K5K6C, commit `819aff09`, `src/lib/public-sector/catalog.ts`) CERV ve LIFE'ı bağımsız olarak aynı şekilde "Türk başvuru sahiplerine kapalı" işaretliyor — iki kart tutarlı. ADR-0004 ise hâlâ CERV ve LIFE'ı belediye programları arasında sayıyor; LEED-FB'nin bilgisine. ADR dosyasına kural gereği dokunulmadı.

### Diğer dikkat noktaları

- 22/d sınırı 2026: büyükşehir sınırları içindeki idareler **1.021.827 TL**, diğer idareler **340.391 TL**. İlkadım üst satıra girer. OKA bölgesindeki büyükşehir olmayan illerde alt satır geçerli olabilir; paket tablosu bunu gösteriyor.
- TL paket tutarları (90.000 / 240.000 / 480.000 TL + KDV) **öneridir**, olgu değildir. Patron kararı bekler.
- Kalkınma ajansına gelir paylaşımı hukuk görüşü olmadan önerilmedi.

## 2. Kanıt

```
$ ls -la docs/kamu/
-rw-r--r--@ 1 macbook staff  8852 Sep 29 00:30 EPOSTA-TASLAKLARI.md
-rw-r--r--@ 1 macbook staff 21282 Sep 29 00:30 ILKADIM-PILOT.md
-rw-r--r--@ 1 macbook staff 16277 Sep 29 00:30 OKA-KANAL-ONERISI.md
-rw-r--r--@ 1 macbook staff  9167 Sep 29 00:30 SUNUM-METNI.md

$ grep -c "^## Kaynaklar" docs/kamu/*.md
docs/kamu/EPOSTA-TASLAKLARI.md:1
docs/kamu/ILKADIM-PILOT.md:1
docs/kamu/OKA-KANAL-ONERISI.md:1
docs/kamu/SUNUM-METNI.md:1

$ npx prettier --version
3.9.9
$ npx prettier --check docs/kamu docs/agent-results/TASK-MULR4ATI5T158-cs-fb.md
Checking formatting...
All matched files use Prettier code style!
exit=0
```

Commit hash: bu raporun commit'i ile birlikte aşağıda "Commit" satırında.

### Doğrulanan kaynaklar (erişim 29.09.2026)

| Kod | İddia                                                                                       | Kaynak                                                              | Nasıl doğrulandı                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Kamu İhale Tebliği 2026/1, RG 22.01.2026 sayı 33145, yürürlük 01.02.2026                    | https://www.resmigazete.gov.tr/eskiler/2026/01/20260122-3.htm       | **Doğrudan okunamadı** (araçta TLS sertifika hatası, curl zaman aşımı). Belgede bu durum yazılı; patron teyidi kontrol listesinde |
| K2  | 22/d: 800.366→1.021.827 TL, 266.618→340.391 TL; Yİ-ÜFE %27,67                               | https://www.hukukihaber.net/kamu-ihale-tebligi-no-20261             | Tam metin aktarımından okundu; oranlar tutarlı (800.366 × 1,2767 ≈ 1.021.827)                                                     |
| K3  | CERV'de Türkiye yok                                                                         | CERV list-3rd-country-participation_cerv_en.pdf (V10.0, 01.08.2025) | PDF indirildi ve iki sayfası okundu                                                                                               |
| K8  | LIFE'ta Türkiye yok                                                                         | LIFE list-3rd-country-participation_life_en.pdf (V10.0, 01.03.2026) | PDF indirildi ve iki sayfası okundu                                                                                               |
| K4  | Erasmus+'ta Türkiye programa ortak üçüncü ülke                                              | erasmus-plus.ec.europa.eu Part A — Eligible countries               | Sayfa okundu                                                                                                                      |
| K5  | KA210: 30.000 € / 60.000 €, en az 2 kurum/2 ülke, 6–24 ay, Ulusal Ajans, 5 Mart 12:00       | erasmus-plus.ec.europa.eu Part B — Small-scale partnerships         | Sayfa okundu; rehber yılı sayfada yazmıyor → başvuru yılı rehberinden yeniden doğrulanması belgede şart                           |
| K6  | OKA: Samsun/Amasya/Çorum/Tokat; 2009'dan beri 15 proje, 57 milyon €'nun üzerinde AB kaynağı | ka.gov.tr OKA Uluslararası İşbirlikleri                             | Sayfa okundu                                                                                                                      |

Kart açıklaması: list_tasks description döndürmediği için kart metni Task Board backend'inden salt-okuma ile alındı ve harfiyen uygulandı.

## 3. Değişen dosyalar

- `docs/kamu/ILKADIM-PILOT.md` (yeni)
- `docs/kamu/OKA-KANAL-ONERISI.md` (yeni)
- `docs/kamu/SUNUM-METNI.md` (yeni)
- `docs/kamu/EPOSTA-TASLAKLARI.md` (yeni)
- `docs/agent-results/TASK-MULR4ATI5T158-cs-fb.md` (bu rapor)

`docs/BUSINESS_MODEL.md` ve `docs/adr/` dokunulmadı. Paylaşımlı ağaçtaki komşu değişiklikler (`.github/workflows/*`, `messages/*`, `src/app/[locale]/fon-hazirlik/` vb.) commit'e alınmadı.

## 4. Riskler

- **K1 birincil kaynak doğrudan okunamadı.** Tutarlar ikincil tam metin aktarımına dayanıyor. Görüşme öncesi patronun RG'den teyidi gerekir (SUNUM-METNI §3 kontrol listesinde).
- **CERV/LIFE bulgusu** ADR-0004 metninde düzeltilmezse satış konuşmalarında bu programlar yanlışlıkla vaat edilebilir; sunum metni bunu açıkça engelliyor (Slayt 3, SSS).
- KA210 son tarihi (5 Mart) 90 günlük pilotun dışında kalabilir; ölçüt Ö5 bu yüzden "gönderim ya da hazır form" olarak yazıldı.
- Başarı ölçütlerinin bir kısmı (Ö1, Ö2) bugün üründen okunamıyor; ürün boşlukları B6, B8.

## 5. Açık sorular

- 22/d sınırı KDV hariç mi uygulanır; idareye özgü yıllık 22/d toplam tavanı var mı? (mali müşavir / hukuk)
- Kalkınma ajansı gelir paylaşımı alabilir mi? OKA hangi satın alma usulüne tabi? (hukuk)
- İlkadım'da AB işlerini yürüten birimin resmî adı ve muhatabı (patron, görüşmede)

## 6. Sonraki adım

1. **LEED-FB:** `OKA-KANAL-ONERISI.md` §6'daki B1–B12 için kart açar (Z öncelikliler: B1 toplu davet kodu, B2 ajans panosu, B3 bölge raporu, B6 karne–hesap bağı, B10 e-Fatura/alıcı kimliği, B12 KVKK).
2. **LEED-FB:** ADR-0004'teki program listesinde CERV ve LIFE'ın Türkiye'ye kapalı olduğu notu düşülür (radar kataloğu zaten doğru).
3. **Patron:** K1'i teyit eder, TL paketlerine karar verir, muhatap adlarını doğrular, e-postaları kendisi gönderir.

## Platform beyanı

Doğrulama **macOS (darwin)** üzerinde yapıldı. İş yalnız Markdown dokümanıdır; kod yolu yoktur, platforma bağlı davranış yoktur. Windows ve Linux'ta ayrıca koşulacak bir şey yoktur (prettier kontrolü platformdan bağımsızdır).

## Commit

- `cc9ebbd3` — docs(kamu): 4 belge (ilk commit)
- Bu raporun commit'i LIFE düzeltmesiyle birlikte ikinci commit'tir; hash'i `git log --oneline -- docs/agent-results/TASK-MULR4ATI5T158-cs-fb.md` ile görülür (bir commit kendi hash'ini içeremez).
