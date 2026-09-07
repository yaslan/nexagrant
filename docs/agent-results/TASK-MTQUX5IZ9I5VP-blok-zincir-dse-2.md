# TASK-MTQUX5IZ9I5VP — M9 brief kalıcılığı ve var olmayan fırsat

**Ajan:** blok-zincir-dse (Tasarımcı) · **Tip:** bug (P0) · **Branch:** dev
**Dosyalar:** `src/modules/m9/**`, `src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/**`, `tests/m9-*`, `tests/e2e/m9-*`
**Dokunulmayan:** `src/modules/m9/server/calendar-actions.ts` (7. kart), M11/document-exporter (blockzincir-pm)

---

## 1. Ne yapıldı

### Önce ÖLÇTÜM — kartın iki iddiası da BAYAT çıktı, üçüncü bir kusur çıktı

| Kart iddiası | Ölçüm | Sonuç |
|---|---|---|
| "Brief hiç kaydedilmiyor" | Gerçek tıklama → `MeetingBrief` satırı canlı Postgres'te oluştu, sayfa yenilendikten sonra hâlâ ekranda | **Kod doğru** (`fa0d5fd`, `605863e` ile düzeltilmiş); kanıtı ve regresyon testi yoktu — şimdi var |
| "Var olmayan fırsatta uydurma veri" | Bilinmeyen id → 404 ekranı, brief üreteci yok, uydurma ortak yok | **Kod doğru** (`eda71f8`); HTTP durum kodu hâlâ 200 (aşağıda, başka kartın kusuru) |
| — (ölçüm sırasında çıktı) | LLM 401 verince eylem, ortak hakkında **ölçülmemiş iddialar** içeren sabit bir metni brief diye kaydedip 1 AI kredisi düşüyordu | **Gerçek kusur — düzeltildi** |

Üçüncü satır kartın ikinci yarısının ta kendisi: "uydurma veri". Bu makinede model her çağrıda `401 invalid x-api-key` döndüğü için **kullanıcının gördüğü her brief o uydurma metindi** — ve "1 AI Kredi / Brief" rozetine rağmen kredi de düşülüyordu.

### Yapılan değişiklikler

1. **`src/modules/m9/brief-template.ts` (yeni).** LLM'e ulaşılamadığında yazılan metin artık **iddia değil boş çalışma belgesi**: aynı 5 bölüm, ama her satır doldurulacak bir soru. Kaldırılan uydurma iddialar: "Recognized participant in EU Framework Programmes with strong technical capacity", "High synergy between partner core capabilities…", "Effort Recommendation: 12 - 18 Person-Months", "Work Package Leader". İçeriğin ilk satırında makine işareti (`<!-- fabrika:template-draft -->`) var — yeniden yükleme, yazdırma ve `.ics` sonrası da taslak olduğu bilinsin diye.
2. **`src/modules/m9/server/actions.ts`.** `aiGenerated` bayrağı: model yanıt vermediyse **kredi düşülmüyor** ve içerik taslak olarak yazılıyor. Eylem `aiGenerated`'ı da döndürüyor.
3. **Brief ekranı (`briefs/client.tsx`).** Taslak için yeni durum: brief kartının **en üstünde** (belgenin tamamını nitelediği için gövdenin altında olamaz) `role="status"` amber bant + listede `TASLAK` rozeti. Hata değil uyarı olduğu için `role="alert"` değil ve kapatma düğmesi yok — belgenin kalıcı bir özelliği. Makine işareti gösterimden, `.ics` gövdesinden ve liste önizlemesinden temizleniyor.
4. **i18n.** `m9.brief.draftBadge/draftTitle/draftNotice` iki dile de eklendi (anahtar paritesi 1202 = 1202, boşluk 0).
5. **Kırmızı olan mevcut M9 e2e'si düzeltildi.** `tests/e2e/m9-briefs-form.spec.ts` `demo-tenant` + `owner@demo.fabrika.test` ödünç alıyordu; ikisi de altından kaydı (owner artık başka bir kiracıda, `demo-tenant` planı M9 vermiyor) → her iddia modül-kilidi ekranında patlıyordu. Ortak fikstür `tests/e2e/fixtures/m9-tenant.ts` ile kendi kiracısına taşındı.

### Tasarım gerekçesi (kullanıcı ihtiyacı)

Kullanıcı "Yapay Zeka Brief Oluştur" düğmesine, **toplantıya girmeden önce ortağı tanımak** için basıyor. Model yanıt vermediğinde ona ortak hakkında doğrulanmamış cümleler vermek, ihtiyacını karşılamaz — yanlış güven verir ve toplantıda yanlış cümle kurdurur (CLAUDE.md md. 7). İki dürüst seçenek vardı: (a) hiç kaydetme, hata bandını göster; (b) taslağı ver ama **taslak olduğunu söyle**. (b) seçildi: kullanıcının girdiği tarih/ortak korunuyor, belge yapısı elde kalıyor, "yeniden dene" zaten tasarlanmış hata bandında duruyor ve hiçbir cümle ortak hakkında iddia içermiyor. Renk/boşluk/ikon bu ekranın mevcut token'ları (amber-50/200/900, `AlertTriangle`, `rounded-lg p-3 text-xs`); yeni bir dil icat edilmedi.

---

## 2. Kanıt (kopyalanmış çıktı)

### 2.1 Canlı DB — tablo ve RLS gerçek

```
MeetingBrief columns:
 id | tenantId | interactionId | partnerName | content | meetingScheduledAt | meetingScheduledTz | createdAt
rows: 0          (işe başlarken tabloda hiç satır yoktu)

pg_policies: tenant_isolation | ALL | ("tenantId" = current_setting('app.tenant_id', true))
pg_class:    relrowsecurity=true, relforcerowsecurity=true
```

### 2.2 Gerçek tıklama e2e — 4/4 yeşil (öncesinde 2 kırmızı)

```
$ E2E_BASE_URL=http://localhost:3000/api/auth/csrf npx playwright test tests/e2e/m9-brief-persistence.spec.ts tests/e2e/m9-briefs-form.spec.ts --reporter=list

Running 4 tests using 1 worker
  ✓  1 m9-brief-persistence.spec.ts › a generated brief reaches the database and survives a reload (2.9s)
  ✓  2 m9-brief-persistence.spec.ts › an opportunity that does not exist gets the not-found screen, not a brief (1.8s)
  ✓  3 m9-briefs-form.spec.ts › a half-filled meeting time is reported inline, and no alert() is ever raised (2.1s)
  ✓  4 m9-briefs-form.spec.ts › the calendar button explains itself instead of raising alert() (1.4s)
  4 passed (9.0s)
```

Bu koşumdan ÖNCE aynı iki `m9-briefs-form` testi kırmızıydı:

```
  2 failed
    › a half-filled meeting time is reported inline, and no alert() is ever raised
    › the calendar button explains itself instead of raising alert()
   (ekran görüntüsü: modül kilidi — "Meeting Briefs modülü aboneliğinizin kapsamı dışında")
```

Kalıcılık testi mock değil, **canlı Postgres okur**: `prisma.meetingBrief.findMany({where:{tenantId}})` → 1 satır, `partnerName`, `content.length > 50`, `meetingScheduledAt` dolu, `meetingScheduledTz = Europe/Brussels`; ardından **sayfa yeniden yüklenip** brief hâlâ ekranda (yani liste sunucudan, DB'den geliyor).

### 2.3 Ekran görüntüleri — `docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/`

| Dosya | Ne gösteriyor |
|---|---|
| `persist-01-form-filled.png` | Form dolu, üretim öncesi |
| `persist-02-brief-on-screen.png` | Brief üretildi, hata bandı yok |
| `persist-03-after-reload.png` | **Yenilemeden sonra brief hâlâ ekranda** (DB'den) + listede `TASLAK` rozeti |
| `persist-04-unknown-opportunity.png` | **Var olmayan fırsat → 404 "Sayfa Bulunamadı"**, uydurma brief yok |
| `persist-05-template-draft-notice.png` | Taslak bandı en üstte; gövde iddia değil doldurulacak sorular; makine işareti ekranda yok |

### 2.4 Birim testler — ve bozuk kodda gerçekten kırmızıya dönüyorlar

```
$ npx vitest run tests/m9-brief-persistence.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Mutasyon kanıtı (testin gerçekten koruduğunu göstermek için `actions.ts` geçici olarak bozuldu, sonra geri alındı):

```
# mutasyon A: DB hatasında  return { success: true, brief: null }
# mutasyon B: where: { interactionId }   (tenantId olmadan)
     × a failed write is reported as a failure, never as a saved brief
     × an existing brief is matched on interactionId *and* tenantId
      Tests  2 failed | 2 passed (4)
# geri alındıktan sonra: git diff --stat src/modules/m9/server/actions.ts → (boş)
```

### 2.5 Kapılar

```
$ npx tsc --noEmit           → 4 hata, HEPSİ scripts/_probe-cordis*.ts (benim değil, §4)
$ npx eslint <benim dosyalarım> → 0 error, 1 warning (client.tsx:119 'opportunityId' kullanılmıyor — ÖNCEDEN vardı)
$ npx vitest run tests/m9-*.test* tests/fabricated-fallbacks.test.ts src/lib/calendar/__tests__/sync.test.ts
 Test Files  5 passed (5)   Tests  51 passed (51)
$ i18n paritesi: tr 1202 / en 1202, m9 dahil eksik anahtar 0
```

---

## 3. Değişen dosyalar

**Yeni**
- `src/modules/m9/brief-template.ts`
- `tests/m9-brief-persistence.test.ts`
- `tests/e2e/m9-brief-persistence.spec.ts`
- `tests/e2e/fixtures/m9-tenant.ts`
- `docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/persist-0{1..5}-*.png`

**Değişen**
- `src/modules/m9/server/actions.ts` — taslak yolu + koşullu kredi + `aiGenerated`
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/client.tsx` — taslak bandı, rozet, işaret temizleme
- `messages/tr.json`, `messages/en.json` — `m9.brief.draftBadge/draftTitle/draftNotice` (yalnız bu 3 anahtar; dosyanın geri kalanındaki değişiklikler başka ajanların uçuşta işi, commit'e alınmadı — §4)
- `tests/e2e/m9-briefs-form.spec.ts` — ortak fikstüre taşındı

**Veri:** e2e fikstürü kendi kiracısını (`m9-e2e-tenant`) `beforeAll`'da kurup `afterAll`'da siliyor. Ölçüm sırasında elle eklediğim `ms-demo-m9` satırı geri silindi; `MeetingBrief` tablosu işin sonunda yine 0 satır.

---

## 4. Riskler ve BENİM DEĞİL diye işaretlediklerim

1. **`notFound()` HTTP 200 dönüyor — ve TASK-MTQYY136Q3CGG bunu "bayat kart" diye KAPATMIŞ.**
   O kart panoda `done`: *"BAYAT KART — notFound() rotaları zaten HTTP 404 dönüyor (ölçümle
   kapatıldı, kod değişmedi)"*. Benim ölçümüm bunu **doğrulamıyor**; fark oturumdan geliyor —
   oturumsuz ölçüm `notFound()` yoluna hiç ulaşmıyor, login'e 307 atıyor:

   ```
   # oturumlu (alice@fabrika.test, demo-tenant)
   /tr/main/opportunities/nope-abc/briefs      200   ← gövde doğru 404 ekranı, kod yanlış
   /tr/main/opportunities/nope-abc/documents   200
   /tr/main/pipeline/nope-abc                  200
   /tr/main/partners/nope-abc                  200

   # oturumsuz
   /tr/main/opportunities/nope-abc/briefs      307   ← login'e yönlendirme; notFound() hiç çalışmıyor
   /tr/completely-unknown-xyz                  404   ← rota hiç eşleşmiyor; bu yol zaten doğruydu
   ```

   Yani kart muhtemelen **oturumsuz** ya da **hiç eşleşmeyen rota** üzerinden ölçülüp kapatılmış.
   Kapsam notu: ölçüm `next dev` sunucusuna karşı; production build'de tekrarlamadım.
   Öneri: TASK-MTQYY136Q3CGG yeniden açılsın, kabul kriteri "oturumlu istekte `(app)` altındaki
   `notFound()` 404 döner" olsun. Kendi spec'imde `expect` etmedim, `testInfo.annotations`'a
   yazdım — başka kartın kusuru yüzünden bu spec kırmızı olmamalı.
2. **`npx tsc` 4 hata: `scripts/_probe-cordis.ts:14,15` ve `scripts/_probe-cordis2.ts:3,6`** (`TS2347`, `TS7006`). Benim dosyalarım değil, dokunmadım.
3. **Anasayfa `/tr` 500 veriyor** — `next/image` `images.unsplash.com` host'u `next.config` içinde tanımlı değil. Playwright'ın `webServer.url` sağlık kontrolü bu yüzden çalışan sunucuyu "hazır değil" sayıp `EADDRINUSE` ile düşüyor; `E2E_BASE_URL=http://localhost:3000/api/auth/csrf` ile aştım. Kalıcı çözüm o kartın sahibinde.
4. **`messages/*.json` ortak dosya.** Benim 3 anahtarım dışında dosyada başka ajanların commit edilmemiş anahtarları var (takvim hataları, evaluations `notMeasured`). Commit'e yalnız benim satırlarım alındı (HEAD + kendi anahtarlarım ile blob üretilip index'e yazıldı); çalışma ağacındaki diğer anahtarlara dokunulmadı.
5. **`demo-tenant` planı koşum sırasında `ultra` → `pro` değişti** (başka ajanın faturalama testi). M9 e2e'sini bu yüzden kendi kiracısına taşıdım; ödünç kiracıyla çalışan her modül-kapılı spec aynı riski taşıyor.

---

## 5. Açık sorular

1. Model erişilemezken **taslak vermek mi, hiç vermemek mi** doğru? Ben (b) taslağı seçtim (kullanıcının girdisi ve belge yapısı korunuyor, hiçbir iddia yok). Ürün "hiç brief üretilmesin, sadece hata gösterilsin" derse değişiklik küçük: `catch` bloğunda `templateBrief` yerine hata döndürmek yeterli.
2. Taslak/AI ayrımı şu an içeriğin ilk satırındaki işaretle taşınıyor. Kalıcı olarak `MeetingBrief.source` gibi bir sütun daha temiz olur — ama migration + RLS + `docs/DATA_MODEL.md` gerektiriyor ve bu kartın kapsamı değildi.
3. `demo-tenant` için M9 hiç açık değil (`ModuleState` satırı yok, plan da vermiyor). Demo verisinde M9 açılacak mı, yoksa modül gerçekten satılana kadar kapalı mı kalacak?

## 5b. Commit sırasında olan şey (takım için önemli)

Kod değişikliklerimi `git add <kendi yollarım>` ile sahneledikten saniyeler sonra, M6 üzerinde
çalışan başka bir ajan **pathspec'siz `git commit`** çalıştırdı ve benim sahnelenmiş dosyalarımın
tamamı onun commit'ine girdi:

```
47d8a5c feat(m6): a panel score that cannot be computed says so instead of reading 0
  ├─ src/modules/m9/brief-template.ts            (benim)
  ├─ src/modules/m9/server/actions.ts            (benim)
  ├─ .../opportunities/[id]/briefs/client.tsx    (benim)
  ├─ tests/m9-brief-persistence.test.ts          (benim)
  ├─ tests/e2e/m9-brief-persistence.spec.ts      (benim)
  ├─ tests/e2e/fixtures/m9-tenant.ts             (benim)
  ├─ tests/e2e/m9-briefs-form.spec.ts            (benim)
  ├─ messages/{tr,en}.json                       (benim 3 anahtarım)
  └─ src/modules/m6/**                           (onun)
```

Hiçbir şey kaybolmadı, kod `dev`'de — ama commit mesajı içeriğini anlatmıyor. Geçmişi
yeniden yazmadım (paylaşılan ağaçta başka ajanlar çalışıyor). İkinci bir zarar daha oldu ve
onarıldı: `Write` aracıyla rapor dosyasını aynı ada yazdığım için bu kartın **önceki** raporunu
(P2-9/P3-14, `f169b0f`) üzerine yazmıştım; o dosya `47d8a5c^`'ten geri getirildi ve benim raporum
kural gereği `-2.md` olarak duruyor.

**Kural (hafızaya da yazıldı):** bu ağaçta sahneleme ile commit arasındaki saniyeler güvenli
değil — `git add` + `git commit -- <yollar>` tek adımda yapılmalı, ve rapor dosyası yazmadan önce
`git log -- <yol>` ile o adın zaten kullanılıp kullanılmadığına bakılmalı.

## 6. Sonraki adım

- Kart durumu `review`'a alındı; kanıtlar bu dosyada.
- **TASK-MTQYY136Q3CGG yeniden açılmalı** — `done` işaretli ama oturumlu istekte iddiası tutmuyor (§4.1'de dört rotada ölçüm + oturumsuz/oturumlu farkı).
- Kart 9 (`set-state-in-effect`, TASK-MTREW28BU7STD + TASK-MTQVFP0LV3YV7) hâlâ açık ve 8. karta bağımlı — bu iş kapsamında ele alınmadı.
