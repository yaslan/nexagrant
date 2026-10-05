Hüküm: **TAMAM — K-1…K-6 belgelere işlendi; doğrulama komutları temiz (3 olumsuz "otomatik uzatma yoktur" cümlesi hariç, bkz. §2). Kod (45 dk sabiti) kapsam dışı, kart önerilir (§4).**

# TASK-MUPV41M8BYQXF — FB PİLOT SSS + BETA_GUIDE: patron kararlarını işle (cs-fb)

Dal: `cs-fb/pilot-kararlar` (taban `cs-fb/p7-monday-1500` @ `caec8d78`). Push yok. P-7 worktree'sine (`FONBRIDGE-wt-csfb-p7`) dokunulmadı.

## 1. Ne yapıldı

| Karar | İşlendiği yer |
| ----- | ------------- |
| K-1 pilot + beta birlikte | BETA_GUIDE tr/en (ritim satırı, "Sync takvimi" altı), .ics hafta 5-8 açıklaması, SSS G4, Ek-P-7 |
| K-2 Europe/Istanbul | SSS G4 (UTC+03:00, yıl boyu aynı), BETA_GUIDE başlıkları (zaten İstanbul) |
| K-3 30 dk Google Meet | .ics hafta 5-8 `DTEND` 15:30 + `LOCATION` Meet bağlantısı + `SEQUENCE:2`; BETA_GUIDE tr/en gündem şablonu 30 dk (5/10/5/5/5); `weekly-sync-template.md` başlık süreleri; SSS G4 |
| K-4 elle çıkarma | SSS B7 (müşteri metni, runbook ayrıntısı yok); Ş-3 TR/EN + yükseltme notu (yanlış kişi = P0, çıkarmayı yalnız yetkili kişi yapar); `DESTEK-SABLONLARI` §4 Y-3 satırı; **yeni iç belge `docs/destek/RUNBOOK-YANLIS-UYE.md`** |
| K-5 yanıt süreleri | BETA_GUIDE tr/en §5: "pilot + beta, iş saatleri içinde, nöbet yok, takip PM" notu (P0/P1/P2/P3 tablosu zaten K-5 ile aynı, değişmedi); SSS G3 tablo (tr/en); `DESTEK-SABLONLARI` kural 3, form alan 9, Ş-6 notu |
| K-6 vaka bazlı uzatma | SSS C4 (tr/en; uzatma sözü yok; "1 hafta önce yazın"; Ş-5'e doğru yönlendirme — eski "Ş-4" hatası düzeldi); Ş-5 TR/EN "uzatma sözü veremem" + iç not (platform yöneticisi akışı) |
| Ek tablo | SSS Ek: P-2, P-3, P-7, P-10 "karar verildi" |

Runbook: davet satırı da silinir (adım 4), audit kaydı (adım 5), KVKK değerlendirmesi çıkarmadan önce (adım 3), talep edenin kimlik doğrulaması (adım 2), tek yetkili kişi (§2). **Yetkili kişinin ve hukuk sahibinin adı kartta verilmedi; uydurmadım, `[PATRON ADLANDIRIR]` bıraktım (R-1, R-2).** Müşteri SSS'ine yalnız "ekibimiz elle çıkarır, kimliğinizi doğrularız, geçici yöntem" yazıldı.

Geçmiş beta olayları (kickoff + hafta 1-4, Perş. 14:00–14:45) **değiştirilmedi**: gerçekleşmiş toplantılardır (prm-fb §3).

## 2. Kanıt

**Sayılar (öncesi → sonrası, `git show HEAD:` ile ölçüldü):**

| Dosya | EN öncesi → sonrası | `###` başlık öncesi → sonrası | TR |
| ----- | ------------------- | ------------------------------ | -- |
| `SSS-PILOT.md` | 38 → 38 | 38 → 38 | tr gövde (etiketsiz) her madde başında; EN = madde sayısı |
| `DESTEK-SABLONLARI.md` | 11 → 11 | 11 → 11 | `**TR`: 11 → 11 |

**Yasak terim taraması** (`git grep -n -i -E '45 ?dk|45 ?min|zoom|jira|otomatik uzat' -- docs/BETA_GUIDE.md docs/BETA_GUIDE.en.md docs/beta docs/destek`): `45 dk/45 min/zoom/jira` = **0**. "otomatik uzat" **3 satır**, üçü de olumsuz ve istenen metin:
```
docs/beta/DESTEK-SABLONLARI.md:275  ...sayısal kriter yoktur, otomatik uzatma yoktur...  (iç not)
docs/beta/SSS-PILOT.md:239          Otomatik uzatma yoktur ve kendi başınıza uzatamazsınız.
docs/beta/SSS-PILOT.md:562          ...vaka bazlı, yayımlanmış kriter yok, otomatik uzatma yok  (Ek tablo)
```
Uzatmayı *vadeden* cümle yok. (Önceki durumda `docs/ROADMAP.md`, `ADR-0007`, `docs/kamu/ILKADIM-PILOT.md` de eşleşir; bunlar ADR kaydı/kamu belgesi, kart kapsamı dışı ve doğru.)

**.ics ayrıştırma** (python, `zoneinfo`, CRLF korundu, 9 olay):
```
kickoff  Mon 2026-09-07 10:00 -> 11:00 +0300  60 dk   (geçmiş, değişmedi)
week01-04 Thu 09-10..10-01 14:00 -> 14:45     45 dk   (geçmiş, değişmedi)
week05   Mon 2026-10-05 15:00 -> 15:30 +0300  30 dk
week06   Mon 2026-10-12 15:00 -> 15:30 +0300  30 dk
week07   Mon 2026-10-19 15:00 -> 15:30 +0300  30 dk
week08   Mon 2026-10-26 15:00 -> 15:30 +0300  30 dk
```
"İlk olay Pazartesi 15:00–15:30 +03:00" şartı **ilk gelecek olay** (hafta 5, 05.10) için sağlanıyor; dosyadaki ilk VEVENT geçmiş kickoff'tur (Pzt 10:00–11:00) ve bilerek dokunulmadı.

Platform: **mac (Darwin)**. Yalnız Markdown/.ics metni; platforma bağlı kod yolu yok. Windows/Linux'ta farkı yoktur (dosya satır sonu: .ics CRLF korundu, .md LF).

## 3. Değişen dosyalar
`docs/BETA_GUIDE.md`, `docs/BETA_GUIDE.en.md`, `docs/beta/beta-weekly-sync.ics`, `docs/beta/weekly-sync-template.md`, `docs/beta/SSS-PILOT.md`, `docs/beta/DESTEK-SABLONLARI.md`, yeni `docs/destek/RUNBOOK-YANLIS-UYE.md`, bu rapor.

## 4. Riskler
- **Kodda hâlâ 45 dk:** `src/lib/beta/constants.ts:46` (`BETA_CHECKIN_DURATION_MIN = 45`), `src/lib/beta/invite-email.ts:48,79` ("45 dakikalık" / "45-minute" — ortaklara giden davet e-postası), `tests/beta/checkin-schedule.test.ts:96,106-108`. Kart kapsamı belgelerdi; dokunmadım. Belge 30 dk, davet e-postası 45 dk diyor → **ayrı bir küçük kod kartı gerekir** (sabit + e-posta + test; `scripts/beta-onboarding.ts` ile üretilen .ics 45 dk üretir).
- **Meet bağlantısı:** prm-fb'ye göre `BETA_MEETING_URL` `fe-fb/rebrand-leftovers` dalında; dev'e merge edildi mi doğrulamadım. .ics hafta 5-8 `LOCATION`'ına bağlantıyı doğrudan yazdım (kart K-3 verdi); SSS metnine URL yazılmadı.
- **Runbook R-1…R-5 açık:** yetkili kişi, hukuk sahibi, kayıtlı adres doğrulama yöntemi, elle `AuditEvent` biçimi, çıkarılanın oturum davranışı (kodla doğrulanmadı). R-1/R-2 boşken runbook yürütülemez.
- SSS B7'ye "ürüne eklenince kendiniz yapabileceksiniz" cümlesi yazdım (Y-3 kartı sürüyor); tarih vaadi yok. Y-3 teslimi yetersiz kalırsa kaldırılmalı.
- İstemci davranışı denenmedi: aynı `UID` + `SEQUENCE:2` ile gönderilen .ics'in Google/Outlook'ta eski olayı güncellemesi [VARSAYIM].
- Birleşik belge: tek posta kutusu, nöbet yok; P0 "2 saat iş saatleri içinde" ekip kapasitesiyle doğrulanmadı (prm-fb'de de açıktı).

## 5. Açık sorular
1. Runbook yetkili kişisi ve hukuk/KVKK bildirim sahibi kim (R-1, R-2)?
2. 45 → 30 dk kod kartı açılsın mı (constants + davet e-postası + test)?
3. Görev metnindeki "KANIT ZORUNLU" satırı `…/docs/agent-results/TASK-MUPA7F7HPV3OX-crw-fb.md` yoluna yazmamı istiyor. Bu, **crw-fb'nin başka bir göreve ait inceleme raporu** (benim kaynağım); üzerine yazmadım. Rapor kartın yoluna yazıldı. Başka yol isteniyorsa söyleyin.

## 6. Sonraki adım
Patron R-1/R-2'yi adlandırır → runbook §2 doldurulur. İnceleme (crw-fb) bu dalı okur. 45 dk kod kartı açılırsa belgelerle birlikte merge edilir.
