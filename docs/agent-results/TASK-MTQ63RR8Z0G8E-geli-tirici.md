# TASK-MTQ63RR8Z0G8E — Kapanış ölçümü: "G0 puanı hiç hesaplanmıyor"

**Ajan:** geli-tirici (Backend Mühendisi) · **Tarih:** 2026-09-08 · **Dal:** dev

**Karar: KART KAPANMIYOR.** Kartın *özgün iddiası* çürütüldü, ama panodaki sayı hâlâ o fırsatın puanı olmayabiliyor.

---

## 1. Ne yapıldı

Kartın iddiası: *"G0 puanı HİÇ hesaplanmıyor — `g0Score` seed/mock'tan geliyor, kanonik skorlayıcı hiç çağrılmıyor."*

Bu iddiayı **onaylamaya değil çürütmeye** çalıştım. Üç ölçüm yapıldı, üçü de gerçek tarayıcı + gerçek Postgres ile:

1. **İddianın kendisi** — gerçek tarayıcıda G0 hesaplanıyor mu, `TopicMatch.g0Score` satırı gerçekten yazılıyor mu?
2. **Kontrol (sertleştirilmiş)** — kaydı olmayan fırsat gerçekten boş mu gösteriliyor, sütundaki uydurma 92 sızıyor mu?
3. **Çürütme denemesi** — panodaki sayı gerçekten *o fırsatın* satırı mı?

Ölçüm 1 ve 2 kartı çürüttü. **Ölçüm 3 yeni ve aynı sınıftan bir kusur buldu**, bu yüzden kart kapanmıyor.

---

## 2. Kanıt

### 2.1 `pnpm test` — temiz

```
 Test Files  100 passed | 2 skipped (102)
      Tests  1172 passed | 8 skipped (1180)
   Duration  3.91s
[exited with code 0]
```

### 2.2 Ölçüm 1 — Skorlayıcı GERÇEKTEN çağrılıyor (kart iddiası ÇÜRÜTÜLDÜ)

`tests/e2e/g0-computed-score.spec.ts`, gerçek Chromium, gerçek giriş + gerçek tıklama:

```
[seed-g0-e2e] ready — tenant=g0-e2e-tenant scored=g0-e2e-opportunity-scored (g0Score=null) unscored=g0-e2e-opportunity-unscored (g0Score=92)
  ✓  1 [chromium] › G0 score comes from the canonical scorer › the screen shows the computed score, and says so when it cannot be computed (3.5s)
  1 passed (4.3s)
```

Fixture `g0Score = null` ile başlıyor. Tarayıcı oturumundan **sonra** DB (Prisma `$queryRawUnsafe`, gerçek SQL):

```json
[{ "id": "g0-e2e-opportunity-scored",
   "topicId": "g0-e2e-topic",
   "opp_col": 44.9,          // Opportunity.g0Score — null'dan yazıldı
   "tm_topic": "g0-e2e-topic",
   "tm_g0": 44.9 },          // TopicMatch.g0Score — persistG0'ın yazdığı kayıt
 { "id": "g0-e2e-opportunity-unscored",
   "topicId": null, "opp_col": 92, "tm_topic": null, "tm_g0": null }]
```

Breakdown gerçekten dolu (uydurma değil, izli):

```json
{ "cov": "0.63", "ver": "2.0", "assessment": "internal-pre-assessment" }
```

Detay ekranı (gerçek tarayıcıdan okunan metin):

```
DETAIL A >>> G0 PUANI | 44.9/100 | Eşik: 70/100 · Kanıt: 6/9 ölçüt ölçüldü
             | Ön değerlendirme: GEÇME (NO_GO) | İç ön değerlendirme — resmî puan değildir.
```

→ Sayı `null`'dan üretildi, `TopicMatch` satırı **gerçekten yazıldı**, panodaki `⭐ 44.9` o satırla **aynı**.
Ekran görüntüsü: `TASK-MTQ63RR8Z0G8E-qa-screenshots/03-board-computed-badge.png`

**Kartın "kanonik skorlayıcı hiç çağrılmıyor" iddiası YANLIŞ.** Çağrı zinciri ağaçta mevcut ve çalışıyor:
`pipeline/actions.ts:241` · `pipeline/[id]/page.tsx:114` · `lib/gates/evaluate.ts:107-112` · `prisma/seed.ts:153`.

### 2.3 Ölçüm 2 — Sertleştirilmiş kontrol: uydurma sütun değeri sızmıyor

Fixture'ın kendi kontrolü zayıf: `topicId = null` olduğu için pano aramayı hiç yapmadan kısa devre yapıyor
(`pipeline/page.tsx:34`). Daha zor vakayı kurdum — **`topicId` DOLU, `TopicMatch` satırı YOK, sütunda uydurma 92**:

```
setup: [{"id":"g0-e2e-collision-partner","topicId":"g0-e2e-topic","g0Score":92},
        {"id":"g0-e2e-opportunity-scored","topicId":"g0-e2e-topic","g0Score":92},
        {"id":"g0-e2e-opportunity-unscored","topicId":null,"g0Score":92}]
TopicMatch rows: 0
```

Gerçek tarayıcıda pano metni:

```
BOARD TEXT >>> ... | 👑 Koordinatör | 👤 Atanmadı | ▼ | G0 E2E — opportunity with real evidence
               | 🤝 Ortak | 👤 Atanmadı | ▼ | G0 COLLISION — same topic, partner role
               | 🤝 Ortak | 👤 Atanmadı | ▼ | G0 E2E — opportunity with no evidence | G1 | 0 | ...
CONTAINS "92"? >>> false
  ✓ 1 passed
```

→ Üç fırsatın da sütununda 92 var, **hiçbirinde rozet yok**, ekranda "92" geçmiyor. Uydurma sütun değeri
sızmıyor. Ekran görüntüsü: `TASK-MTQ63RR8Z0G8E-screenshots/07-control-no-evidence-row.png`

### 2.4 Ölçüm 3 — ÇÜRÜTME BAŞARILI: pano, yanlış fırsatın puanını gösteriyor

Şema asimetrisi:

```prisma
model TopicMatch {              // prisma/schema.prisma:498
  @@unique([tenantId, topicId]) // ← KONU başına TEK satır
}
model Opportunity {
  topicId String?               // ← unique DEĞİL: aynı konuda N fırsat serbest
}
```

Ama G0 puanı **fırsat başına** değişir — `budgetRoleEconomy` (ağırlık 10) `Opportunity.intendedRole`'e,
`researchAndEndUser` (ağırlık 12) o fırsatın `ConsortiumSeat` satırlarına bakar.

Aynı konuda iki canlı fırsat kurdum (A = coordinator, B = partner) ve kanonik skorlayıcıyı çağırdım:

```
canonical score  A (coordinator) = 44.9
canonical score  B (partner)     = 48.23
budgetRoleEconomy A = 50   B = 83.33333333333334

TopicMatch rows for this tenant: [{"topicId":"g0-e2e-topic","g0Score":48.23}]   ← TEK satır, son yazan kazandı
Opportunity.g0Score column     : [{"id":"g0-e2e-collision-partner","g0Score":48.23},
                                  {"id":"g0-e2e-opportunity-scored","g0Score":44.9}]
```

Gerçek tarayıcıda pano:

```
BOARD TEXT >>> ... | 🤝 Ortak | ⭐ 48.23 | ▼ | G0 COLLISION — same topic, partner role
               | 👑 Koordinatör | ⭐ 48.23 | ▼ | G0 E2E — opportunity with real evidence
```

Aynı fırsatın kendi detay sayfası:

```
DETAIL A >>> G0 PUANI | 44.9/100 | ... Kanıt: 6/9 ölçüt ölçüldü
```

**Panoda `⭐ 48.23`, kendi detay sayfasında `44.9/100` — aynı fırsat, iki ekran, iki farklı sayı.**
Panodaki 48.23 *başka bir fırsatın* puanı. Ekran görüntüleri:
`TASK-MTQ63RR8Z0G8E-screenshots/05-shared-topic-collision-board.png` (pano) ve
`06-detail-A-coordinator.png` (detay).

Bu, kartın şikâyet ettiği kusurun ta kendisi ("iki ekran, iki sayı") — sadece kaynağı değişmiş:
artık uydurma sütun değil, **yanlış anahtarlanmış kanıt satırı**.

---

## 3. Değişen dosyalar

**Ürün kodunda değişiklik YOK.** Bu bir ölçüm görevi; bulunan kusur tasarım kararı gerektiriyor (bkz. §6),
ve dispatch "ilgisiz kusurları düzeltme, adıyla bildir" diyor.

Eklenen (yalnız kanıt):
- `docs/agent-results/TASK-MTQ63RR8Z0G8E-geli-tirici.md` (bu dosya)
- `docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/05-shared-topic-collision-board.png`
- `docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/06-detail-A-coordinator.png`
- `docs/agent-results/TASK-MTQ63RR8Z0G8E-screenshots/07-control-no-evidence-row.png`

Ölçüm sırasında kurulan tüm fixture'lar **geri alındı**:

```
deleted collision opportunity rows: 1
[seed-g0-e2e] rolled back
g0-e2e opportunities left : 0
g0-e2e tenants left       : 0
demo-tenant g0Score       : [12, 0, 6, 0, 6]        ← ölçüm öncesiyle aynı
demo-tenant TopicMatch    : [12, 0, 0, 6, 6]        ← ölçüm öncesiyle aynı
```

Geçici script ve spec dosyaları silindi. `scripts/_tmp-cs/` içindeki `q.cjs` / `fresh-probe.cjs` ve
`.tmp-verify/` **başka paralel ajanlara ait**, ellenmedi.

---

## 4. Riskler

- **Çakışma bugünkü demo veride tetiklenmiyor**: `demo-tenant`'ın 5 fırsatı 5 ayrı konuda. Yani kusur
  bugün ekranda görünmüyor; bir kiracı aynı konuya ikinci fırsat açtığı an görünür hâle gelir
  (ör. "aynı çağrıya hem koordinatör hem ortak olarak bakalım" — gerçekçi bir senaryo).
- Ölçüm paylaşılan dev DB'de yapıldı ve o sırada başka ajanlar da çalışıyordu. İzolasyon için ayrı bir
  kiracı (`g0-e2e-tenant`) kullanıldı ve tamamen geri alındı; `demo-tenant` okundu, yazılmadı.

## 5. Açık sorular (adıyla bildiriliyor, DÜZELTİLMEDİ)

1. **`TopicMatch` yanlış anahtar — kartın kapanmasını engelleyen madde.** Puan fırsat başına, kayıt konu
   başına. Panonun okuduğu satır (`pipeline/page.tsx:53-63`) o fırsata ait olmayabilir. Bunun tasarım
   kararı gerekiyor, tek satırlık düzeltme değil: ya kanıt kaydı fırsat başına anahtarlanmalı, ya da pano
   `Opportunity.g0Score`'u okumalı **ama yalnız kanıt satırı varken** (sütun tek başına güvenilmez, kartın
   özgün şikâyeti tam olarak buydu). Bu kararı vermek benim yetkimde değil.
2. **`demo-tenant`'ta iki fırsat `g0Score = 0`** (`demo-opp-2`, `demo-opp-4`), `breakdown.coverage = 0.08`.
   Yani 9 ölçütten neredeyse hiçbiri ölçülmemiş ama pano bunu `⭐ 0` rozeti olarak, 12 ve 6'nın yanında
   *gerçek bir triyaj puanı* gibi çiziyor. `computeG0FromSnapshot` yalnız `coverage === 0` iken `null`
   veriyor; %8 kapsama bu eşiği geçiyor. "Yokluk sıfır değildir" kuralının ruhuna aykırı görünüyor —
   ayrı bir kart konusu, bu görevde dokunmadım.
3. Fixture'ın kendi "kanıtsız" kontrolü (`topicId = null`) zayıf; asıl riskli vakayı (topicId dolu,
   kayıt yok) test etmiyor. §2.3'te elle ölçtüm ve **geçti**, ama spec'te kalıcı bir nöbetçisi yok.

## 6. Sonraki adım

- Kart `in_progress` kalsın (kapatılmadı). Yukarıdaki **Açık soru 1** karara bağlanmalı; karar sonrası
  düzeltme + §2.4'ün regresyon nöbetçisi olarak spec'e eklenmesi ayrı bir iş.
- Kartın başlığı artık yanıltıcı: "G0 puanı HİÇ hesaplanmıyor" ölçümle yanlışlandı. Başlık
  "pano rozeti yanlış fırsatın puanını gösterebiliyor (TopicMatch konu başına anahtarlı)" olarak
  güncellenmeli ki sonraki ajan eski iddiayı yeniden kovalamasın.
