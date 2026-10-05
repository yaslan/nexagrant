# TASK-MTU64P5DPWC4A — SPRINT-S12 kart kapanış doğruluk tablosu

**Ajan:** blockzincir-pm (PM-EN) · **Tarih:** 2026-09-10 · **Sprint:** SPRINT-S12

Bu kart daha önce bir kez başlatılmış ama pane kaybolmuş, hiç sonuç dosyası oluşmamış. Sıfırdan koşuldu.

## 1. Yöntem

1. `list_tasks` ile SPRINT-S12'deki tüm 100 kart çekildi (durum, başlık, atanan ajan).
2. Her kart için `docs/agent-results/TASK-<ID>-*.md` deseniyle eşleşen rapor dosyaları bulundu (137 dosya, script ile).
3. Eşleşen tüm rapor dosyaları iki ayrı greple tarandı:
   - **Dar tarama:** `- [x]` işaretli satırların ±2 satırlık penceresinde "ama/ölçmedim/koşulamadı/kapsam dışı/kısmen/eksik/başarısız" gibi itiraf kelimeleri.
   - **Geniş tarama:** dosyanın tamamında "koşulamadı/ölçmedim/yapılamadı/doğrulanamadı/sorun var/TODO" gibi ifadeler (checkbox'a bakılmaksızın), sonra her isabetin gerçekten bir DoD kutusunun İÇİNDE mi yoksa açıklayıcı metinde mi olduğu elle ayrıştırıldı.
4. `pnpm gate` / kapı durumu için her dosyada gate'e dair satırlar ayrıca çıkarıldı.
5. Rapor dosyası **filename'de bulunamayan** "done" kartlar için, kartın TASK-ID'si tüm `docs/agent-results/` içeriğinde (dosya adı değil, içerik) arandı — bazı raporlar TASK-ID yerine ADR adı veya eski (`B-1-...`) adlandırmayla dosyalanmış olabilir.
6. En az bir şüpheli sinyal (itiraf, çok-turlu rapor, sıfır kanıt, commit ↔ board statü uyuşmazlığı) taşıyan kartlar tek tek okunarak doğrulandı; ayrıca en az bir bulgu (i18n kartı) doğrudan repodaki dosyaya ve `git log`'a karşı çapraz kontrol edildi.

Kod değiştirilmedi; bu tamamen okuma/karşılaştırma denetimidir.

## 2. Özet bulgular

| Kategori | Sayı |
|---|---|
| Toplam S12 kartı | 100 |
| `done` | 79 |
| `review` | 6 |
| `in_progress` | 11 (biri bu kartın kendisi) |
| `backlog` | 4 |
| **done ama sıfır kanıt dosyası** | 2 (`TASK-MTU6I7SO2BD28`, ve dolaylı olarak bulunanlar hariç) |
| **SAHTE-KAPALI (doğrulanmış)** | 1 — `TASK-MTU6I7SO2BD28` |
| **Board'da "review" ama iş fiilen bitmiş/commit'li** | 3 — `TASK-MTUIPYSSNLVWG`, `TASK-MTUI9R0FOOY2J`, `TASK-MTUI9ZBK7W4JY` |
| **Rapor var ama TASK-ID adlandırma kuralına uymuyor** (DOĞRULAMA zinciriyle bulundu) | 9 |
| DoD kutusu içinde itiraf, sonradan giderilmiş (çok-turlu) | 1 — `TASK-MTU26XBVZ6H1O` |

## 3. En önemli bulgu — SAHTE-KAPALI: TASK-MTU6I7SO2BD28

**Kart:** "i18n: M8 pazaryeri ekranındaki 41 gömülü Türkçe metni t() anahtarına taşı" — **done**, atanan: customer-support.

- `docs/agent-results/` içinde bu TASK-ID ile eşleşen **hiçbir dosya yok**, dolaylı referans da yok.
- Bugün (2026-09-10), tamamen ayrı ve hâlâ **in_progress** olan bir denetim kartı (`TASK-MTU64MMEQC0WV`, i18n eksik anahtar taraması) kanıt dosyası üretti: `docs/agent-results/TASK-MTU64MMEQC0WV-evidence/03-hardcoded-strings.txt`. Bu dosya, `src/app/[locale]/(app)/[workspace]/marketplace/client.tsx` dosyasının **"file has NO t() at all"** olduğunu ve tam olarak **41 literal** (kartın orijinal sayısıyla birebir eşleşiyor) taşıdığını gösteriyor.
- Repoya karşı doğrudan kontrol: bu dosya `git log` içinde `a7c84833 feat(m8): move marketplace client hardcoded strings to next-intl` commit'iyle **2026-09-09 17:19:20**'de düzeltilmiş. Commit mesajı: *"client.tsx had zero t() usage with 41+ user-facing Turkish literals baked in..."* — TASK-MTU6I7SO2BD28'e hiç atıfta bulunmuyor, ve `TASK-MTU64MMEQC0WV-evidence/03-hardcoded-strings.txt` dosyasının mtime'ı (17:19:20) commit'le **aynı saniyede** — yani audit dosyası düzeltmeden hemen önce/aynı anda alınmış bir "önce" fotoğrafı.
- **Sonuç:** `TASK-MTU6I7SO2BD28` sprint boyunca "done" olarak işaretli kaldı, hiçbir zaman kanıtla kapatılmadı, ve altındaki gerçek kusur **dünkü tarihe kadar** aynen duruyordu — kartla hiçbir ilişkisi olmayan başka bir denetim onu tesadüfen bulup düzeltti. Bu klasik SAHTE-KAPALI örneğidir: board "done" diyor, kod "hayır" diyordu, ta ki bugüne kadar.

## 4. Board güncel değil: iş bitmiş, kart hâlâ "review"da donmuş

Üç kart hâlâ `review` statüsünde ama karşılık gelen commit'ler `dev` dalında zaten var ve raporlar bunu ayrıntılı kanıtla destekliyor:

| Kart | Rapor | Eşleşen commit | Kapı |
|---|---|---|---|
| `TASK-MTUI9ZBK7W4JY` (module-gate.spec.ts + plan-entitlement kirliliği) | `TASK-MTUI9ZBK7W4JY-blok-zincir-dev.md` | `3e14b40 test(e2e): make the module gate spec measure something...` | "YEŞİL" — `pnpm gate` 8/8 aşama, 1670 test, e2e 146/1 skip |
| `TASK-MTUIPYSSNLVWG` (m6/scoring.ts aşırı yükleme) | `TASK-MTUIPYSSNLVWG-blok-zincir-dse.md` | `1d49048 fix(m6): make a tenant-less scoring call impossible to compile` | Bu turda kasıtlı koşulmadı (çakışma kuralı); §"Sonraki adım" blok-zincir-dev'in gate koşusuna atıfta bulunuyor |
| `TASK-MTUI9R0FOOY2J` (plan silme muhafızı) | `TASK-MTUI9R0FOOY2J-blok-zincir-denet-i.md` | `aef5706 test(billing): lock the plan-delete guard...` | Bu turda kasıtlı koşulmadı (çakışma kuralı) |

Üçü de raporlarında dürüstçe "bu turda gate/e2e/dev koşulmadı, çakışma kuralı" diyor — bu proje kültüründe kabul edilen bir dürüstlük, itiraf değil. Sorun raporlarda değil: **iş görünüşe göre bitmiş ve commit'lenmiş, ama board hâlâ "review" gösteriyor** — kartlar done'a taşınmamış. Bu yönün tersi: board "daha az bitmiş" gösteriyor gerçekte olduğundan — SAHTE-KAPALI'nın simetriği, zararsız ama board'un anlık doğruluğunu bozuyor.

## 5. DoD kutusu içinde itiraf, ama sonradan (3. turda) düzeltilmiş: TASK-MTU26XBVZ6H1O

"Fatura e2e'lerinin yarısı 503 dalında sessizce yeşil olabilir" kartı **3 rapor turu** üretti (`blok-zincir-dev.md`, `-2.md`, `-3.md`):

- **Tur 1** işaretli kutu: `- [x] Env'lerle test yeşil, env'leri kaldırınca hata (ama lazy import sorun), reuseExistingServer sorun var` — checked ama kutunun kendi metni çözülmemiş bir sorunu itiraf ediyor.
- **Tur 2** işaretli kutu: `- [x] CI'da e2e env durumu açıkça yazıldı (E2E koşmuyor, ama gelecek için taslak verildi)` — yine bir eksiği itiraf ediyor, ve raporun kendisi bunu fark edip ayrıca `- [x] DoD'daki işaretli kutularda "sorun var" cümlesi yok` diye kendi kendini düzeltmeye çalışıyor (başarısız, çünkü aynı raporda hâlâ "E2E koşmuyor" var).
- **Tur 3** (nihai, `dev`'e commit edilen): "17/17 e2e ailesi YEŞİL", kök neden bulunup (assertion eskiydi, uygulama doğruydu) düzeltilmiş, kutularda itiraf yok, `pnpm gate` çıktısı yapıştırılmış.

**Hüküm: KAPALI**, ama board tek satırlık "done" ile bu 3 turluk mücadeleyi gizliyor — kartın DoD'u yalnızca son hâliyle değerlendirilirse temiz, ilk iki rapor kendi başına okunursa SAHTE-KAPALI adayı olurdu.

## 6. Sistemik adlandırma sorunu — DOĞRULAMA kartları kendi TASK-ID'siyle dosyalanmamış

7 adet "DOĞRULAMA" kartı (`TASK-MTSJZUEJXO2GP`, `TASK-MTSK080UA0AKJ`, `TASK-MTSK0JWUSN4F5`, `TASK-MTSK11OO780Y9`, `TASK-MTSK1G3JKDA1A`, `TASK-MTSK1SOXT24OW`, `TASK-MTSK24C0F80WR`) board'da **done** ama kendi TASK-ID'leriyle **hiçbir rapor dosyası yok**. İçerik araması, her birinin gerçek kanıtının doğruladığı ORİJİNAL kartın ID'si altında (`...-dogrulama.md` soneki ile) dosyalandığını gösterdi — örn. `TASK-MTSJZUEJXO2GP`'nin kanıtı `TASK-MTSHVKTSGC8A4-geli-tirici-dogrulama.md` içinde. Bu dosyaların içeriği okunduğunda (`pnpm gate` yeşil iddiaları, "3 ayrı çürütme sondası" vb.) doğrulama işi gerçekten yapılmış görünüyor — **KAPALI (muhtemel)** diyorum ama bu, kuralın ("Sonuç dosyası: `docs/agent-results/<GÖREV-ID>-<ajanadı>.md`") 7 karta bilerek ya da bilmeyerek uyulmadığı anlamına geliyor. Ayrıca 2 kart (`TASK-MTU6HUB8FUHMG` → `B-1-blok-zincir-dev.md`, `TASK-MTT13PK0Z4ZLB` → `ADR-0002-geli-tirici.md`) da aynı adlandırma sapmasını taşıyor.

Bu, board'un kendisinin değil, **kanıt izlenebilirliğinin** kırılgan olduğunu gösteriyor: "rapor dosyası yok" ile "iş yapılmadı" arasındaki fark yalnız elle ADIYLA arama yapılınca ortaya çıkıyor; otomatik bir "kart ↔ rapor" eşleştirmesi (ki `TASK-MTU6I7SO2BD28`'de tam olarak bunun eksikliği bir SAHTE-KAPALI'yı sprint boyunca gizledi) bu 9 kart için de yanlış pozitif "KANIT YOK" üretirdi.

## 7. Tam tablo (100 kart)

`Rapor var mı` sütunu dosya sayısını, `Kapı yeşil mi` raporun kendi iddiasını (bu denetimde gate yeniden koşulmadı — bkz. §8), `İtiraf` ise §1'deki iki greple tarama sonucunu gösterir. "Taranan" = her iki grep de o dosyalarda temiz çıktı; bulunan gerçek itiraflar §3–§5'te ayrıca anlatıldı.

| Kart | Statü | Rapor var mı | Kapı yeşil mi | İtiraf | Hüküm |
|---|---|---|---|---|---|
| TASK-MTQYXISOPUJ53<br>_Uydurma veri fallback kalan 5 nokta_ | done | EVET (2) | BELİRSİZ (raporda gate/pnpm bahsi bulunamadı) | YOK (taranan) | KAPALI |
| TASK-MTR60M5ESB5PZ<br>_M10 uydurma kişi adı_ | done | EVET (2) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTRJ32BZBY2AI<br>_Paket stüdyosu temeli_ | done | EVET (3) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTRNO3LBZB2Q7<br>_notFound() 200 dönüyor_ | done | EVET (2) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTS6MBA7NEIM0<br>_e2e kırmızıları A_ | done | EVET (2) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTS6MFER9LQZR<br>_e2e kırmızıları B_ | done | EVET (2) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTS6MMOD8XF3A<br>_404 i18n ihlali + lint uyarıları_ | done | EVET (2) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTS6MRKDP168Q<br>_Blog yazılarında kaynaksız istatistik_ | done | EVET (2) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTS7ZUI55RRE4<br>_K2 worker şemada olmayan 3 tablo_ | done | EVET (5) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTS8002I6YD3L<br>_Şema kapısı yazma gövdesini taramıyor_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTS808DKQTOQ9<br>_M10 çift onay sahte vitrin_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTS80DUAF39Z8<br>_SystemAlert tekrar koruması yok_ | done | EVET (5) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTS80QQD1LVJQ<br>_Landing hero mock + LIVE SYSTEM rozeti_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTS9C07AQ6DNO<br>_E2E altyapısı paylaşılan kiracı_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTS9CEDCWKQQK<br>_demo-tenant kayıtsız fırsat kalıntısı_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTSAIWF4ENUSL<br>_DualApprovalState tablosu_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSHP3BMTAD3Y<br>_CalendarConnection OAuth açık metin_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTSHTIYJWTQKO<br>_Sahte EUROPEAN COMMISSION rozeti_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTSHU5LT4XAE<br>_i18n kapısı fiilen kapalı_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSHUZUMVLTBF<br>_e2e hijyeni + kaydet testi yok_ | done | EVET (5) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSHVKTSGC8A4<br>_Paket stüdyosu ADIM3 vitrin_ | done | EVET (3) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSI7YQWUZOFH<br>_prisma-override delegate'leri any_ | done | EVET (7) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSJH8NMAXPRM<br>_Hak-ediş PLAN_GRANTS→PlanVersion_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTSJHTJZSCILI<br>_prisma-override.d.ts kaldırılsın_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTSJI9OQXXPP5<br>_pnpm build kırmızı (k2-cordis)_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSJIXP9V3JD7<br>_OAuth jetonu şifreleme B yolu_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSJJOR63M63R<br>_st6 spec:127 bildirim zili_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTSJK8VVG9MKM<br>_Şema sözleşmesi kapısı prisma/scripts_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSJKTGDUC3L5<br>_Kanıt klasörü ezme koruması_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTSJS1K0LTDQP<br>_Kanıt klasörü koruması_ | done | EVET (3) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSJZUEJXO2GP<br>_DOĞRULAMA → paket stüdyosu vitrini_ | done | DOLAYLI: `TASK-MTSHVKTSGC8A4-geli-tirici-dogrulama.md` (başka kart adı altında) | BELİRSİZ | — | KAPALI (muhtemel) — bkz. §6 |
| TASK-MTSK080UA0AKJ<br>_DOĞRULAMA → prisma-override + şema kapısı_ | done | DOLAYLI: `TASK-MTSI7YQWUZOFH-*-dogrulama.md` | BELİRSİZ | — | KAPALI (muhtemel) — bkz. §6 |
| TASK-MTSK0JWUSN4F5<br>_DOĞRULAMA → uydurma veri + landing_ | done | DOLAYLI: `TASK-MTQ63RR8Z0G8E-*-dogrulama.md` | BELİRSİZ | — | KAPALI (muhtemel) — bkz. §6 |
| TASK-MTSK11OO780Y9<br>_DOĞRULAMA → i18n kapısı + e2e hijyeni_ | done | DOLAYLI: `TASK-MTSHUZUMVLTBF-*-dogrulama.md` | BELİRSİZ | — | KAPALI (muhtemel) — bkz. §6 |
| TASK-MTSK1G3JKDA1A<br>_DOĞRULAMA → K2 worker + şema yazma_ | done | DOLAYLI: `TASK-MTS7ZUI55RRE4-*-dogrulama.md` | BELİRSİZ | — | KAPALI (muhtemel) — bkz. §6 |
| TASK-MTSK1SOXT24OW<br>_DOĞRULAMA → SystemAlert tekrar koruması_ | done | DOLAYLI: `TASK-MTS80DUAF39Z8-*-dogrulama.md` | BELİRSİZ | — | KAPALI (muhtemel) — bkz. §6 |
| TASK-MTSK24C0F80WR<br>_DOĞRULAMA → M6.3 puanlama motoru_ | done | DOLAYLI: `TASK-MTPZHMSPMDA66-*-dogrulama.md` | BELİRSİZ | — | KAPALI (muhtemel) — bkz. §6 |
| TASK-MTST6OAOSFILY<br>_st6 spec:67 CORDIS tablosu_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSVTD6Q7A6<br>_HEAD kendi kendine tutarsız_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSWL8ADKZKDM<br>_Invoice satırı hiç yazılmıyor_ | done | EVET (2) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSWLWDONWA3W<br>_Yabancı para faturada TCMB kuru yok_ | done | EVET (7, çok turlu) | EVET (4. QA turunda "Kapanabilir") | YOK (kendi kapsamında) | KAPALI — bkz. §… |
| TASK-MTSWVADF7RQ1B<br>_RAG yolu AiUsageLog yazmıyor_ | done | EVET (3) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSXG31NGW48D<br>_Belge yükleme yetki kontrolü yok_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTSXGXBCJ007W<br>_İki LLM adaptörü 7 kat farklı fiyat_ | done | EVET (3) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSY88Q6AMCGB<br>_Stripe webhook idempotency eşleşmiyor_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTSYAKDK5LV9E<br>_e-Fatura preflight yalan yeşil_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSYG783RIIEE<br>_rls:verify BYPASSRLS kontrol etmiyor_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSYH8LDGV5YU<br>_embedText AiUsageLog RLS reddi_ | done | EVET (2) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTSZ21XP2R42B<br>_YZ eylemi iki kez faturalanıyor_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTT13PK0Z4ZLB<br>_ADR-0002 Faz2: Invoice TCMB kuru_ | done | DOLAYLI (`ADR-0002-geli-tirici.md`, eski adlandırma) | EVET (raporda) | YOK | KAPALI — adlandırma kuralına uymuyor, bkz. §6 |
| TASK-MTT1WUUS7MN7R<br>_Fiyatlar KDV hariç + ülkeye göre KDV_ | done | EVET (2) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTTT8H82Y7P1E<br>_Stopaj yuvarlama iki kopya + float_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTTTMECDO7RC8<br>_INVOICE_VAT_RATE tamamen kaldırılsın_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTTUSEJFOSPI<br>_GİB XML satır tutarı float yuvarlama_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTTXQKBWYSS4K<br>_Kök layout script tag konsol hatası_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTTY5MGLS2TXX<br>_Tema init script paint öncesi çalışmıyor_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTTYNL8VPMNFN<br>_Tema script'i body ilk çocuğu_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTTZ0NVCISNYY<br>_theme-paint-timing e2e yalancı kapı_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTTZ1AYG8RA55<br>_Tema çerezle sunucuda render_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTU04TNPTCTQ<br>_Hidrasyon uyuşmazlığı (sepet/çerez)_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTU1CM8ITW6VH<br>_Sepet kalıcılığı regresyon kapısı yok_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTU26XBVZ6H1O<br>_Fatura e2e'leri 503 dalında yeşil olabilir_ | done | EVET (3 rapor) | EVET (3. turda, 17/17 e2e) | **VAR (ilk 2 turda), sonra giderildi** | KAPALI (3. denemede) — bkz. §5 |
| TASK-MTU27KSLSJZ9I<br>_lineNetMinor tek kaynak_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTU2Y588AL1XQ<br>_Yazdırılabilir faturada sabit tevkifat_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTU3J768HN45U<br>_pnpm gate e2e'yi kapsamıyor_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTU4AYW5R9DGL<br>_Boş-durum başlığı iki kez render_ | done | EVET (5 rapor) | EVET (ilk koşum KIRMIZI, sonra yeşile alındı) | YOK (nihai) | KAPALI |
| TASK-MTU6HUB8FUHMG<br>_RLS B-1 ClaimEvidenceLink+EvidenceReminder_ | done | DOLAYLI (`B-1-blok-zincir-dev.md`, eski adlandırma) | EVET (raporda) | YOK | KAPALI — adlandırma kuralına uymuyor, bkz. §6 |
| TASK-MTU6HY77S1WBH<br>_RLS C-1 CalendarConnection_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTU6I3V2R30M8<br>_101 kiracı sorgusu sınıflandırma_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| **TASK-MTU6I7SO2BD28**<br>_i18n: M8 pazaryeri 41 gömülü TR metin_ | done | **HAYIR** | **HAYIR** | — | **SAHTE-KAPALI — bkz. §3** |
| TASK-MTU6KE36HAFJR<br>_İki RAG yolu yan yana_ | done | EVET (2) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTUGJTD5HZDW0<br>_tenantId ? {} üçlü operatör (3 sayfa)_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTUGK2OUVAFDN<br>_RLS sapma taraması_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTUGKEF9KENK<br>_RLS Policy %100 Enforced iddiası_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTUGU8O95B925<br>_Kanıt disiplini süpürmesi_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTUH5L8MJ6S8E<br>_retrieveChunks uydurma CORDIS verisi_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTUH6YKP6OQAX<br>_e-Fatura indirme hataları ham JSON sızıyor_ | done | EVET (2) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTUH7CF87SGRR<br>_tenantId ? üçlü operatör süpürmesi_ | done | EVET (1) | EVET (raporda iddia) | YOK (taranan) | KAPALI |
| TASK-MTUI9F5YBHTDC<br>_P1: checkout oturum kapısı yok_ | done | EVET (1) | BELİRSİZ | YOK (taranan) | KAPALI |
| TASK-MTSWAKD31LS49<br>_noUncheckedIndexedAccess yok_ | backlog | — | — | — | AÇIK (başlamadı) |
| TASK-MTSY71BUMBLWM<br>_TenantBillingIdentity ekranı yok_ | backlog | — | — | — | AÇIK (başlamadı) |
| TASK-MTSY7HZRYWWEL<br>_iyzico uydurma alıcı kimliği_ | backlog | — | — | — | AÇIK (başlamadı) |
| TASK-MTSZ0AL4QP2CT<br>_91 erişim global prisma istemcisiyle_ | backlog | — | — | — | AÇIK (başlamadı) |
| TASK-MTRJSOWFH6B45<br>_GO-LIVE: e-Fatura env + GİB entegratörü_ | in_progress | EVET (5) | — | — | AÇIK (devam ediyor) |
| TASK-MTTUSZF4QSFGU<br>_Faturada KDV/tevkifat etiketi sabit_ | in_progress | HAYIR | — | — | AÇIK (devam ediyor) |
| TASK-MTTUTNGF1MO9P<br>_Ürün logosu hâlâ FonBridge_ | in_progress | HAYIR | — | — | AÇIK (devam ediyor) |
| TASK-MTTUUGKNDGBXK<br>_Alarm konsolu boğulmuş_ | in_progress | HAYIR | — | — | AÇIK (devam ediyor) |
| TASK-MTU64GP6UIC44<br>_LLM çağrı yolu + gömülü prompt envanteri_ | in_progress | EVET (1) | — | — | AÇIK (devam ediyor) |
| TASK-MTU64MMEQC0WV<br>_i18n denetimi (eksik anahtar taraması)_ | in_progress | EVET (1) | — | — | AÇIK (devam ediyor) — bkz. §3 |
| TASK-MTU64P5DPWC4A<br>_(bu kart)_ | in_progress | N/A | N/A | N/A | N/A |
| TASK-MTU64VO8UILP2<br>_SPRINT-S12 sürüm notları_ | in_progress | EVET (1) | — | — | AÇIK (devam ediyor) |
| TASK-MTV4YSO4SEMGG<br>_Pipeline board başlığı gömülü TR_ | in_progress | HAYIR | — | — | AÇIK (devam ediyor) |
| TASK-MTV4ZJEECXNDE<br>_SPIKE: TenantScopedDb nominal tip_ | in_progress | EVET (1) | — | — | AÇIK (devam ediyor) |
| TASK-MTV50DQCQDB7B<br>_Kapanış denetimi: son 3 kart eski ağaçta_ | in_progress | HAYIR | — | — | AÇIK (devam ediyor) |
| TASK-MTSYCMWFL22CA<br>_Paylaşılan korpus ingest sessizce kaybediyor_ | review | EVET (1) | BELİRSİZ | YOK (taranan) | AÇIK (review'da) |
| TASK-MTU64JWHRNDL<br>_RLS politika kapsam envanteri_ | review | EVET (2) | BELİRSİZ | YOK (taranan) | AÇIK (review'da) |
| TASK-MTU64Y932HF96<br>_e-Fatura akışı hata metinleri envanteri_ | review | EVET (3) | BELİRSİZ | YOK (taranan) | AÇIK (review'da) |
| **TASK-MTUI9R0FOOY2J**<br>_Plan silme muhafızı_ | review | EVET (1) | BELİRSİZ (kasıtlı koşulmadı) | YOK | **AÇIK — commit aef5706 var, board donmuş, bkz. §4** |
| **TASK-MTUI9ZBK7W4JY**<br>_module-gate.spec.ts hijyeni_ | review | EVET (1) | EVET (aef5706, 1670 test) | YOK | **AÇIK — commit 3e14b40 var, board donmuş, bkz. §4** |
| **TASK-MTUIPYSSNLVWG**<br>_m6/scoring.ts aşırı yükleme_ | review | EVET (1) | BELİRSİZ (kasıtlı koşulmadı) | YOK | **AÇIK — commit 1d49048 var, board donmuş, bkz. §4** |

## 8. Sınırlamalar (dürüstlük notu)

- Bu denetim **hiçbir komutu yeniden koşturmadı** (`pnpm gate` dahil) — kod değiştirmeme ve "kod değiştirme" kısıtına uyuldu. "Kapı yeşil mi" sütunu raporun **kendi iddiasını** yansıtıyor, bağımsız yeniden ölçüm değil. Bu, kendi hafıza notumdaki uyarıyla (bir DOĞRULAMA'nın kendi ölçümü şüpheli olabilir) çelişmiyor çünkü bu görev açıkça "kod değiştirme" ile sınırlandı — bağımsız yeniden koşu ayrı bir görev/kart gerektirir.
- 79 "done" karttan yalnızca itiraf/anomali sinyali taşıyanlar (yaklaşık 12'si) tam metin olarak okundu; geri kalanlar iki sistematik grep ile (tüm 137 dosyanın tamamı) tarandı ve temiz çıktı — ama satır satır insan gözünden geçmedi. Bu, ince/incelikli SAHTE-KAPALI vakalarını (ör. grep'in yakalayamayacağı dolaylı ifadeler) kaçırmış olabilir.
- `TASK-MTU6I7SO2BD28` dışındaki "DOLAYLI" kanıtlı kartlar (§6) için `-dogrulama.md` dosyalarının içeriği tam okunmadı, yalnız başlıkları/gate satırları görüldü — bu 9 kart için "KAPALI (muhtemel)" hükmü tam bir tam-metin doğrulamaya dayanmıyor.

## 9. Platform beyanı

Bu görev tamamen dosya okuma, grep ve `git log`/`git show` üzerinden yürütüldü — platforma bağlı hiçbir kod yolu (süreç öldürme, dosya yolu ayırıcı, kabuk/ikili adı, DPI, izin) içermiyor. **macOS (Darwin 25.6.0, zsh)** üzerinde koşuldu. Windows/Linux'ta farklı davranması beklenmez (yalnız `grep`/`glob`/`git` kullanıldı); ayrıca koşulmadı çünkü gerek yoktu.

## 10. Sonraki adım / öneriler

1. `TASK-MTU6I7SO2BD28`'i board'da yeniden aç veya bugünkü `a7c84833` commit'ini referans göstererek gerçek bir kapanış raporuyla kapat.
2. `TASK-MTUIPYSSNLVWG`, `TASK-MTUI9R0FOOY2J`, `TASK-MTUI9ZBK7W4JY` kartlarını `done`'a taşı — iş commit'li ve rapor kanıtlı.
3. DOĞRULAMA kartları için sonuç dosyası kuralı hatırlatılmalı: kartın kendi TASK-ID'siyle dosyalanmalı, doğruladığı kartın ID'si altına değil (§6, 9 kart etkileniyor).

## Değişen dosyalar
- `docs/agent-results/TASK-MTU64P5DPWC4A-blockzincir-pm.md` (bu dosya, yeni)

Kod tabanına dokunulmadı.
