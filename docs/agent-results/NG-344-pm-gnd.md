# NG-344 (TASK-MWSXRP9YDF4A) — HUKUK-5 belgesi: ajans raporu saklama ve imha, amaç ve 12 ay süre

**Ajan:** pm-gnd · **Tip:** docs (hukuk paketi) · **Dal:** `task/ng-344` (taban: `origin/task/ng-342`, NG-342 kararı burada) · **Platform:** yalnız belge (kod yok)

> Hüküm: **Tamam (belge düzenlemesi).** Kararın metni veri sorumlusu kararıdır (23.11.2026), hukukçu görüşü değildir ve hukuki onay alınmamıştır. Belgelerde her yerde bu etiket var.

## Ne yapıldı

1. Taban dal: kart `se-fb/fo392-invite-code-limits` diyordu, ama NG-342 kararının metni (`HUKUK-SORULARI` sürüm 1.15 §3.1, "Saklama ve imha (5d, 23.11.2026)") yalnız `origin/task/ng-342` üzerinde var. `fo392` ile `task/ng-342` ayrışmış (2 ve 2 commit). Bu yüzden worktree `origin/task/ng-342` üstünden açıldı. Alt PR'ın base'i `task/ng-342` olmalı (aşağıda "Açık sorular").
2. Saklama ve imha politikası: depoda bu adla ayrı bir belge **yok**. İlgili politika satırları `docs/legal/processing-register.md` §18c'de (satır "Saklama süresi"), ayrıca `docs/SECURITY_COMPLIANCE.md` ve `docs/legal/dpa-tr.md`'de genel saklama bilgisi var. Kart "docs/legal/** dışına dokunma" dediği için `SECURITY_COMPLIANCE.md` değiştirilmedi. Yeni belge açılmadı.
3. `processing-register.md` §18c: "Amaç" satırına "ajanslarla toplu raporlama" eklendi. "Saklama süresi" satırına ajans aylık raporu için 12 ay, 6 ayda bir periyodik imha, silme kaydı en az 3 yıl, dayanak ve "ödeme/komisyon ayrımı" cümlesi eklendi. Ayrıca §18c başındaki "B3 (aylık rapor) kodda yok" cümlesi düzeltildi: NG-341 ile rapor ekranda eklendi (indirme ve e-posta yok); eski cümle artık yanlıştı.
4. `agency-channel-notice-addendum.md` §4 (Amaç): aylık toplu raporun ekranda gösterilmesi (indirilebilir değil) ve yıllık kıyaslama eklendi.
5. `agency-channel-notice-addendum.md` §9 (Saklama süresi): 12 ay, 1 Ocak / 1 Temmuz imha, silme kaydı 3 yıl eklendi. Etiket: `[HUKUK-5: veri sorumlusu kararı 23.11.2026, hukukçu görüşü değil]`.
6. NG-342'nin ek metin önerileri ("anonim", "<5", "indirilebilir rapor" geçen cümleler) **uygulanmadı**. Kart "önce lider onayı al" diyor; onay gelmediği için bu kısım bekliyor.

## Kanıt (ham çıktı)

Kodla çapraz kontrol (`origin/se-fb/fo392-invite-code-limits`, `src/lib/agency/retention.ts`):

```
export const AGENCY_REPORT_RETENTION_MONTHS = 12;
export const AGENCY_REPORT_PURGE_INTERVAL_MONTHS = 6;
export const AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS = 3;
export const AGENCY_REPORT_RETENTION_BASIS = 'retention-12m';
 * How often the expired reports are destroyed together: 1 January and 1 July, UTC.
```

Belge değişikliği (`git diff -U0 -- docs/legal`, satırların kısaltılmış özeti; tam metin için aynı komut çalıştırılabilir):

```
docs/legal/processing-register.md: "Satır yalnız bugünkü kodu anlatır; B3 (aylık rapor) NG-341 ile yalnız ekranda eklendi ..."
docs/legal/processing-register.md: Amaç satırına "; ajanslarla toplu raporlama: ajansın aylık toplu raporunu yalnız ekranda görmesi ve yıllık kıyaslama (NG-341/NG-344; veri sorumlusu kararı 23.11.2026, hukukçu görüşü değil)"
docs/legal/processing-register.md: Saklama süresi satırına "Ajans aylık raporu (...): 12 ay saklanır (`AGENCY_REPORT_RETENTION_MONTHS = 12`). ... 1 Ocak ve 1 Temmuz (UTC) ... `AgencyReportDeletionLog` ... en az 3 yıl ... Dayanak: KVKK md.4/2-d; Silme, Yok Etme veya Anonim Hale Getirme Yönetmeliği md.11. ... Ayrım: ..."
docs/legal/agency-channel-notice-addendum.md §4: "Ayrıca bu sayılardan oluşan aylık toplu raporu ajansa ekranda göstermek (indirilebilir değil) ve yıllık kıyaslama yapılmasını sağlamak. [HUKUK-5: ...]"
docs/legal/agency-channel-notice-addendum.md §9: "Ajansın gördüğü aylık toplu rapor 12 ay saklanır; 12 ayı dolan raporlar 1 Ocak ve 1 Temmuz tarihlerinde toplu olarak silinir. ... en az 3 yıl tutulur. [HUKUK-5: ...]"
```

Çapraz kontrol sonucu: süre (12 ay), periyot (6 ayda bir, 1 Ocak ve 1 Temmuz UTC), silme kaydı (3 yıl) ve dayanak metinde kodla birebir aynı.

Biçim kontrolü: `git diff --check` temiz (`CHECK_OK`). Tablo satırlarında yeni `|` karakteri yok (sütun sayısı 4).

## Değişen dosyalar

- `docs/legal/processing-register.md` (§18c: Amaç, Saklama süresi, giriş cümlesi)
- `docs/legal/agency-channel-notice-addendum.md` (§4 Amaç, §9 Saklama süresi)
- `docs/agent-results/NG-344-pm-gnd.md` (bu dosya)

Çalışma ağacında 77 dosya için yalnız dosya modu farkı görünüyor (`0` satır, çalıştırma biti). Bunlar commit'e alınmadı; yalnız yukarıdaki üç yol commit'lendi.

## Riskler

- **Kaynak yanlışlığı**: NG-342 kararı, PR #420 birleşmeden `dev`'e girmediği için yalnız `task/ng-342` dalında. NG-342 kabul edilmezse bu PR'ın dayanağı değişir.
- **Ek metnindeki eski ifadeler**: §6'daki "anonim", "<5" ve "10'un katına yuvarlama" ifadeleri NG-342'nin önerdiği değişikliklere göre hâlâ eski. Lider onayı olmadan değiştirilmedi. Yeni eklenen §4 cümlesi "indirilebilir değil" diyor; kodla uyumlu (NG-341 "report on screen only"), ama §6 ile birlikte okunduğunda hukukçunun bunu ayrıca teyit etmesi gerekir.
- **Süre hukuki onaylı değil**: 12 ay ve 6 aylık periyot veri sorumlusu kararı; KVKK/Yönetmelik gerekçesi hukukçu tarafından teyit edilmedi.

## Açık sorular

1. Alt PR'ın base'i: kart `se-fb/fo392-invite-code-limits` diyor, ama kararın metni `task/ng-342`'de. Ben `task/ng-342` üstünden açtım. Lider `fo392` istiyorsa kararı ayrıca kopyalamak gerekir.
2. Result dosyasının yolu: kart `~/alan/FONBRIDGE-dev/docs/agent-results/NG-344-pm-gnd.md` diyor. Bu dosya ana checkout'ta (dev-wsl, çok sayıda kirli dosya) yazılmadı, işlem `task/ng-344` worktree'sinde yapıldı ve commit'lendi.
3. NG-342 ek metin önerileri (§6 "anonim/<5/indirilebilir" ifadeleri): lider onayı bekleniyor.
4. `SECURITY_COMPLIANCE.md` tablosunda (satır 110-119) ajans raporu için saklama satırı yok. Kart yalnız `docs/legal/**` dediği için dokunulmadı.

## Gate, push ve PR (son durum)

- Push: `task/ng-344` uzak depoya çıktı (WSL'den). Pre-push kancası çalıştırılabilir izinle gelmediği için git onu atladı; gate otomatik koşmadı.
- Elle `pnpm gate` (izole DB `pmgndng344`, WSL): **kırmızı**. Vitest: 64 dosya / 264 test hatalı (billing `plan-repository`, `rls-coverage`, alerts). Hatalar çoğunlukla DB ile ilgili (`DATABASE_URL_RLS_TEST is not set`, P2011/P2039, `ECONNREFUSED`). Log: `/home/aslan/ng344-gate.clean.log` (WSL). Bu değişiklik yalnız docs; kodla ilişkisi kurulmadı, temel dal (`task/ng-342`) üzerinde aynı sonuç verip vermediği doğrulanmadı.
- Draft PR: #424 (base `task/ng-342`), CI sonucu bekleniyor.
- Not: `pnpm gate` çıkış kodunu 0 gösterdi ama vitest `exit 1` verdi; sarmalayıcının çıkış kodu güvenilir değil.

Sonuç: NG-344 belge işi tamam, ama gate ve CI yeşil değil; kart `review`'a alınmadı.

## Platform beyanı

Yalnız belge; kod yolu yok. Platform bağımlı bir davranış değişmedi. Koşulamadığım bir platform yok.

## Definition of Done

- [x] Saklama ve imha politikasında ajans raporu satırı var (`processing-register.md` §18c, "Saklama süresi")
- [x] İşleme envanteri §18c güncel (Amaç ve Saklama süresi satırları; giriş cümlesi düzeltildi)
- [x] Aydınlatma metninde amaç ve 12 ay süre var (`agency-channel-notice-addendum.md` §4 ve §9)
- [x] Kodla çapraz kontrol yapıldı (`retention.ts`: 12 / 6 / 3 yıl, 1 Ocak ve 1 Temmuz UTC)
- [x] Platform beyanı: yalnız belge
