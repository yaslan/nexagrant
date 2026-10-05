# TASK-MULRR08Y9YI77 — FB KAMU B3: Bölge raporu (aylık yazdırılabilir rapor + CSV) · se-fb

Sprint FB-KAMU-2 · dal `dev` · commit'ler `d091cf72` (çekirdek) + `8d448fa8` (ajans sayfası "Raporlar" bölümü)

## 1. Ne yapıldı

- **Toplama (kopya sorgu yok).** `getAgencyFunnel` iki parçaya ayrıldı. Ham okuma artık `readAgencyFunnelRaw` içinde, maskeleme `buildAgencyFunnel` içinde. Pano davranışı değişmedi. Rapor (`src/lib/agency/report.ts` → `buildAgencyReport`) aynı ham okumayı yapıyor ve panonun verdiği üç yanıtı **aynen** kopyalıyor: kırılımsız, kurum türüne göre ve sayı gösteren her il için il görünümü. Rapor yeni sayı üretmiyor, il × tür tablosu yok, kişisel veri yok.
- **İki tablonun birlikte yayımlanması** (kart adım 1): saldırgan kapısında (`funnel.attack.test.ts` `publish()`) zaten modelleniyor. Kapı kırılımsız, tür ve her il görünümünü birleştirip saldırıyor. Bu yüzden DUR gerekmedi. leed-fb'ye yazıldı.
- **İl satırları:** yalnız panoda en az bir sayı gösteren iller listeleniyor. Panoda tüm adımları "<5" olan bir il, kurumu hiç olmayan bir ilden ayırt edilemiyor. Böyle bir ili listelemek, "orada 1-4 kurum var" bilgisini verirdi, yani panodan fazlasını. Rapordaki not: "Listelenmeyen illerde tüm adımlar <5."
- **Saklama (leed-fb 29.09 kararı, seçenek A).** Şema kilidi var, rapor tablosu yok. Rapor, ajansın kendi kiracısında `AuditEvent{type:'agency.report.generated', target:'YYYY-MM', data: anlık görüntü}` satırı. `tenantId` her zaman ajans. Anlık görüntü katı bir zod şemasından (`AgencyReportSnapshotSchema`, `.strict()`) geçiyor: yalnız hücre durumu ve 5'in ≥5 katı değerler kabul ediliyor. Ham sayı, id, ad ya da fazladan anahtar reddediliyor. R2 kullanılmadı, yeni bağımlılık eklenmedi.
- **Yazdırılabilir rapor + CSV** (`document-exporter` yeniden kullanıldı: yeni `generateTableReportHtml` + `toCsv`). Rapor, "PDF"i tarayıcının yazdırma penceresinden üreten yazdırılabilir bir HTML sayfası. Arayüzde dürüstçe "Yazdırılabilir rapor (PDF olarak kaydedin)" diye geçiyor. CSV: UTF-8 BOM, CRLF, RFC 4180 tırnaklama, `= + - @` ile başlayan hücreye formül koruması. Metinler `messages/{tr,en}.json` → `agency.reports`.
- **İndirme:** `GET /api/agency/reports/[id]?format=csv|print&locale=`. Oturumun kendi ajans kiracısı, `withTenant` (RLS) ve `tenantId` koşuluyla okunuyor. Başka ajansın id'si 404, oturumsuz istek 401. Başlıklar: `Cache-Control: private, no-store` ve `nosniff`.
- **Aylık Inngest job'u** `agency-monthly-report`: cron `0 6 1 * *` + elle tetikleme için `agency/report.generate` olayı, `concurrency: 1`. Aynı dönem için rapor zaten varsa atlanıyor. E-posta yok.
- **Ajans sayfası:** "Raporlar" bölümü (`reports-panel.tsx`, sunucu bileşeni) ayrı bir küçük commit'te (`8d448fa8`).
- **Belge:** `docs/DATA_MODEL.md` §20: AuditEvent'in rapor deposu olarak kullanılması tasarım ödünü, gerekçesi ve "gerçek PDF + R2 + ayrı tablo = C seçeneği, ayrı onay".

## 2. Kanıt

**Kapılar** (`set -a; source .env; set +a`):

```
npx tsc --noEmit -p .          → tsc exit 0
npm run lint                   → lint exit 0
npm test                       → Test Files 197 passed | 2 skipped (199); Tests 2280 passed | 8 skipped (2288); exit 0
npm run i18n:check             → ✅ i18n check passed: both catalogs agree …
npm run rls:bypass-check       → ✅ SUCCESS: no new tenant bypass.
```

**Yeni testler:**

- `src/lib/agency/report.test.ts` (10 test): 300 rastgele tabloda raporun her hücresi == panonun hücresi; listelenmeyen her ilin pano görünümünde sayı yok. Ayrıca maskeleme ve 5'e yuvarlama, boş ay (tüm hücreler "<5", il satırı yok, dosyalar yine üretiliyor), tek il, 1-4 kurumlu ilin listelenmemesi. Şema; ham sayıyı (13), `tenantId` anahtarını ve il × tür hücresini reddediyor. CSV'de BOM, CRLF ve satır sayısı kontrol ediliyor; HTML'de ajans adı kaçışlanıyor.
- `tests/agency-report.live.test.ts` (5 test, **fabrika_app / NOBYPASSRLS** üzerinde, atlanmadan koştu):

```
✓ the run writes one snapshot per agency, in its own tenant, for the month that closed
✓ the stored numbers are the dashboard's: none, by type and each province, cell for cell
✓ the stored row carries no organisation id or name, and no raw count
✓ a second run for the same month adds nothing
✓ agency B cannot read A's report, not even by id, and lists only its own
```

- **Mutasyon kontrolü:** `if (shows(...))` → `if (true || shows(...))` (tüm-<5 illeri de listele) yapılınca 2 test kırıldı: live testteki "stored numbers are the dashboard's" ve unit testteki "a province of 1..4 organisations is not listed". Kod geri alındı.

**Job'un elle tetiklenmesi (gerçek Inngest):** Seed: 1 ajans ("Orta Karadeniz Test Ajansı (B3 doğrulama)") + ajans kullanıcısı (TENANT_OWNER) + **6 kurum** (KOBİ, Samsun, her birinde 1 kayıtlı arama). `/api/inngest` route handler'ı izole bir süreçte `INNGEST_DEV=1` ile `127.0.0.1:3999`'da sunuldu. Yanında `inngest-cli dev` (`:8288`) çalıştı ve `agency/report.generate` olayı gönderildi:

```
POST /e/dev {"name":"agency/report.generate"} → {"ids":["01M3NP5PMPWRSHSD7N6AXFE9C1"],"status":200}
run 01M3NP5PSYTXHG3KY6B6NRVN5H → "status":"Completed"
AuditEvent agency.report.generated: 3 satır (yerel DB'deki 3 ajansın her biri), target "2026-09"
ikinci olay → run 01M3NP6FSWGJAD9BYH3RZ3ZFST Completed, satır sayısı yine 3 (tekrar eklemiyor)
```

**Arayüz ve indirme (gerçek tarayıcı, Playwright + Chromium, leed-fb'nin :3000 dev sunucusu):** Akış: giriş formu → `/tr/ajans` → "CSV indir" tıklaması → "Yazdırılabilir rapor (PDF olarak kaydedin)" tıklaması (yeni sekme) → tarayıcıdan PDF'e kaydetme.

```
section text: Raporlar | Bölge raporu her ayın 1'inde hazırlanır. … | Dönem: 2026-09 | Hazırlandı: 29.09.2026 | Yazdırılabilir rapor (PDF olarak kaydedin) | CSV indir
csv saved: bolge-raporu-2026-09.csv
print url: http://localhost:3000/api/agency/reports/cmum629sv0002y7xkbaxptayy?format=print&locale=tr
pdf saved   (file: "PDF document, version 1.4, 2 pages")
```

CSV'den alıntı (ilk 3 bayt `ef bb bf` = BOM; 89 satır = başlık + 8 adım × (1 toplam + 9 tür + 1 il)):

```
2026-09,Tüm kurumlar,Tüm kurumlar,Davet koduyla kayıt,5
2026-09,Tüm kurumlar,Tüm kurumlar,Radar'da kayıtlı arama,5
2026-09,Tüm kurumlar,Tüm kurumlar,Çağrı G0'a alındı,<5
2026-09,Kurum türüne göre (tüm iller),KOBİ,Davet koduyla kayıt,5
2026-09,İle göre (tüm kurum türleri),Samsun,Davet koduyla kayıt,5
```

6 kurum "5" olarak görünüyor (5'e yuvarlama). Karne, G0 ve başvuru adımları "<5".

**Rapor == pano (aynı ajansın canlı yanıtıyla):**

```
all == pano(none).all: true
byOrgType == pano(orgType): true
Samsun == pano(province Samsun): true
stored keys: version,period,generatedAt,all,byOrgType,byProvince
```

**HTTP erişim:** `anonymous own-id: 401` · `own 200 text/csv; charset=utf-8 private, no-store` · `other agency 404` · `made-up 404`.

**Kareler ve dosyalar** (`docs/agent-results/TASK-MULRR08Y9YI77-screenshots/`): `raporlar-bolumu.png` (ajans panosundaki Raporlar bölümü), `yazdirilabilir-rapor.png` (üç tablo, notlar, maskeleme), `bolge-raporu-2026-09.pdf`, `bolge-raporu-2026-09.csv`.

**Temizlik:** fikstür silindi (`cleaned 7 tenants, 1 users, 1 audit rows`). Job'un yerel DB'deki diğer 2 ajansa (başka görevlerin fikstürleri) yazdığı 2 rapor satırı da silindi. Son durum: `agencies: 2, reports: []`. :3999 ve :8288'deki süreçleri ben başlattım ve ben durdurdum. :3000'e dokunulmadı.

## 3. Değişen dosyalar

- `src/lib/agency/funnel.ts`: `readAgencyFunnelRaw` ayrıldı; `getAgencyFunnel` = oku + maskele (davranış aynı)
- `src/lib/agency/report.ts` (yeni) · `src/lib/agency/report.test.ts` (yeni)
- `src/lib/document-exporter.ts`: `generateTableReportHtml`, `toCsv`
- `src/lib/inngest/events.ts`, `src/lib/inngest/jobs/agency-monthly-report.ts` (yeni), `src/lib/inngest/jobs/index.ts`, `src/app/api/inngest/route.ts`
- `src/app/api/agency/reports/[id]/route.ts` (yeni)
- `tests/agency-report.live.test.ts` (yeni)
- `docs/DATA_MODEL.md` §20
- `src/app/[locale]/(app)/ajans/reports-panel.tsx` (yeni), `src/app/[locale]/(app)/ajans/page.tsx`: ayrı commit `8d448fa8`
- `messages/tr.json`, `messages/en.json` → `agency.reports`: **benim commit'imde değil.** Paylaşımlı ağaçta fe-fb'nin B4 commit'i `0dde7031` dosyanın tamamını commit ettiği için bu anahtarlar oraya girdi. İçerik doğru, yalnız izi o commit'te.

## 4. Riskler

- **AuditEvent'in rapor deposu olarak kullanılması** bir tasarım ödünü (DATA_MODEL §20). "AuditEvent 12 ay anonimleştirilmiş saklanır" kuralı için bugün budama kodu yok. İleride yazılırsa rapor satırlarını dışarıda bırakmalı.
- **Tekrar koruması uygulama düzeyinde** (önce var mı diye bakıp sonra yazıyor, tekil indeks yok, çünkü şema kilidi var). `concurrency: 1` eşzamanlı iki koşuyu engelliyor. Elle eşzamanlı tetiklemeyle çift satır teorik olarak mümkün, ama zararsız: aynı sayılar, listede iki satır.
- **Dönem etiketi, kümülatif anlık görüntü:** rapor o güne kadarki kümülatif kohortu gösteriyor. "2026-09" etiketi hazırlanma ayını değil, kapanan ayı söylüyor; not bunu açıkça yazıyor. Elle tetikleme ay içinde yapılırsa o ayın etiketiyle yazılır ve ayın 1'indeki cron o dönemi atlar. Kabul edilebilir, ama bilinsin.
- **Mevcut yapılandırma (benim değişikliğim değil):** `.env`'de `INNGEST_SIGNING_KEY` boş, `INNGEST_DEV` tanımlı değil. Bu yüzden `:3000/api/inngest` 500 dönüyor ("In cloud mode but no signing key found"). Bu, tüm cron işlerini yerelde etkiliyor. Doğrulama bu yüzden izole host + `INNGEST_DEV=1` ile yapıldı.
- 1280 px genişlikte sitenin genelindeki "Geri bildirim" yüzen düğmesi, satırın sağ ucundaki "CSV indir" bağlantısının üstüne biniyor (`raporlar-bolumu.png`). Tıklama çalıştı. Bu widget'ın tüm sayfalardaki davranışı, bu kartın kapsamı dışında.

## 5. Açık sorular

- Gerçek PDF dosyası, R2'de saklama ve ayrı `AgencyReport` tablosu (C seçeneği) ne zaman? Ayrı onay gerekiyor.
- OKA bölge filtresi (yalnız TR83 illeri) istenir mi? Şu an sayı gösteren her il listeleniyor.

## 6. Sonraki adım

- crw-fb incelemesi: özellikle "il listesi = yalnız sayı gösteren iller" kuralı ve anlık görüntü şeması.
- Ortamda `INNGEST_DEV=1` (yerel) ya da imza anahtarı ayarlanırsa job'lar `:3000` üzerinden de tetiklenebilir.

## Platform beyanı

Doğrulama **mac**'te yapıldı (Darwin 27, yerel Postgres, Chromium 1243, inngest-cli dev). Değişen kod saf TypeScript: sorgu, maskeleme, metin üretimi, Next route ve Inngest işlevi. Süreç öldürme, dosya yolu, kabuk ya da ekran/DPI bağımlılığı yok. CSV satır sonu sabit `\r\n`, tarih biçimi `Europe/Istanbul` saat dilimiyle üretiliyor. Bu yüzden Windows ve Linux'ta davranış aynı. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede o ortamlar yok. CI (Linux) aynı vitest kapılarını koşuyor. "PDF olarak kaydet" tarayıcının kendi yazdırma penceresi; her platformun tarayıcısında bulunuyor.
