# E10.1 Dashboard Rota (Tekrar) — exit 129 debug + fix

**Ajan:** derin-0c1f10 (Kod İnceleme Uzmanı) · **Tarih:** 2026-09-06 · **Branch:** dev
**Karar:** ✅ Rota çalışıyor — **bloke eden bulgu yok**. 2 gerçek hata düzeltildi, 3 bulgu rapor edildi (sahibi başkası).

---

## 1. Ne yapıldı

### a) exit 129'un kök nedeni bulundu — "encoding" hipotezi YANLIŞ

Görev metni exit 129'u dosya encoding'ine bağlıyordu. Değil:

- `129 = 128 + 1` → **SIGHUP** ile öldürülmüş süreç. Kabuk kanıtı aşağıda.
- Dashboard dizinindeki üç dosyanın üçü de **geçerli UTF-8** (`iconv` ile doğrulandı).

SIGHUP'ı ne tetikledi (**varsayım — kanıtlanamaz, önceki oturumun logu yok**): bu repoda
`pnpm dev` ön planda hiç çıkmaz ve aynı dizinde ikinci dev sunucusuna izin verilmez
(`.agentspace/memory/shared/fabrika-runtime-verification-recipe.md`). Ön planda `pnpm dev`
çalıştıran bir ajan pane kapanınca/zaman aşımına uğrayınca tüm süreç ağacı SIGHUP alır → 129.
Yani hata **dosya yazımında değil, doğrulama adımındaydı**.

### b) Rota dosyası zaten yazılmıştı — ve çalışıyor

`src/app/[locale]/(app)/[workspace]/dashboard/page.tsx` mevcut, `export default async function DashboardPage`
içeriyor, 6 KPI kartıyla **HTTP 200** dönüyor. Görevdeki "sadece rota file yazılmadı" teşhisi hatalıydı.

⚠️ Görev metnindeki `/dashboard` yolu da yanlış: gerçek yol **`/{locale}/{workspace}/dashboard`**
(örn. `/tr/main/dashboard`). Çıplak `/dashboard` bu rotaya düşmez.

### c) İki gerçek hata düzeltildi (`src/modules/m5/server/queries.ts`)

| # | Hata | Kanıt | Düzeltme |
|---|------|-------|----------|
| 1 | **Kişi-Gün / Teklif kartı toplam kişi-günü gösteriyordu** — etiket "teklif başına" diyor, hesap `sum(hours)/8` idi, teklif sayısına hiç bölünmüyordu. `docs/ROADMAP.md:63` kabul kriteri **"kişi-gün/teklif"**. Demo kiracıda 228 saat / 3 teklif → kart **28,5** yazıyordu, doğrusu **9,5**. Kullanıcıya gösterilen KPI 3× şişmişti (CLAUDE.md kural 7 ihlali). | Aşağıda önce/sonra ekran metni | `totalPersonDays / totalProposals` |
| 2 | `queries.ts:133` `(gd: any)` — CLAUDE.md "Yapma" listesinde `any` açıkça yasak. | `grep -n ": any"` | Açık tipe çevrildi |

Yan düzeltme: `totalOpportunities` bağı aslında **teklif** sayıyordu (`tx.proposal.count`).
Hata #1'i gizleyen isim buydu; `totalProposals` olarak düzeltildi.

### d) Geri alınan değişiklik (şeffaflık)

`KpiCard.tsx:60`'ta tamsayıların `toFixed(1)` ile "5.0 proje" diye basıldığını tespit edip düzelttim.
Aynı anda çalışan paralel bir ajan (i18n) `Dashboard.tsx`'e locale-duyarlı `toLocaleString(locale)`
formatlayıcı ekledi — benimki mükerrer ve daha zayıf kaldı. **`git checkout` ile geri aldım**;
canlı sayfada "5 proje" / "6 modül" doğru basılıyor.

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

### exit 129 = SIGHUP
```
$ bash -c 'sh -c "kill -HUP \$\$"; echo "HUP exit=$?"'
bash: line 1: 14407 Hangup: 1               sh -c "kill -HUP \$\$"
HUP exit=129
$ bash -c 'kill -l 1'
HUP
```

### Encoding hipotezi elendi
```
src/app/[locale]/(app)/[workspace]/dashboard/page.tsx      -> valid UTF-8
src/app/[locale]/(app)/[workspace]/dashboard/client.tsx    -> valid UTF-8
src/app/[locale]/(app)/[workspace]/dashboard/export-csv.ts -> valid UTF-8
```

### Rota gerçekten açılıyor (curl + NextAuth oturumu, sentetik değil)
```
$ curl -s -b ck.txt http://localhost:3000/api/auth/session
{"user":{"name":"Demo Pipeline Manager","email":"manager@demo.fabrika.test",...},
 "tenantId":"demo-tenant","role":"PIPELINE_MANAGER",...}

$ curl -s -o tr.html -w "HTTP=%{http_code}\n" -b ck.txt http://localhost:3000/tr/main/dashboard
HTTP=200
$ curl -s -o en.html -w "HTTP=%{http_code}\n" -b ck.txt http://localhost:3000/en/main/dashboard
HTTP=200
```

### Kişi-Gün hatası — ÖNCE (yanlış)
```
Kişi-Gün / Teklif      Ort. G2 Süresi (gün)
28,5 gün               9,0 gün
Teklif başına toplam efor
```
Veritabanı gerçeği (uygulamanın bağlantısıyla sorgulandı):
```
total hours: 228 -> person-days: 28.5
proposals: 3            # 28.5 / 3 = 9.5
```

### Kişi-Gün hatası — SONRA (doğru), 6 kart tam
```
Toplam Teklif        5     proje    Bu dönemdeki aktif fırsatlar
İsabet Oranı         0,0   %        Fonlanan veya eşik üstü teklifler
Ortalama Puan        0,0   /100     Ortalama değerlendirme puanı (iç ön değerlendirme)
Kişi-Gün / Teklif    9,5   gün      Teklif başına toplam efor
Ort. G2 Süresi       9,0  gün       Ortalama kapı ilerleme süresi
Açık Modüller        6     modül    Açık platform modülleri
```
İngilizce locale de doğrulandı (`/en/main/dashboard`): `Total Proposals / Hit Rate / Average Score /
Person-Days / Proposal / ...` — sabit metin kalmadı.

### Kenar durumlar
```
GET /tr/main/dashboard?from=abc&to=%3B%20DROP  -> HTTP=200, KPI kartları basıldı (varsayılan aralığa düşüyor)
```
(Not: bu düzeltme paralel i18n ajanına ait; benim ilk taramamda bu istek "Veri Yüklenemedi" + ham
Prisma hata gövdesi sızdırıyordu, artık sızdırmıyor.)

### Statik kapılar
```
$ pnpm typecheck
$ tsc --noEmit                       # çıktı yok = temiz

$ pnpm lint src/modules/m5
/Users/macbook/AgentSpace/fabrika/src/modules/m5/server/queries.ts
  1:10  warning  'prisma' is defined but never used
  2:15  warning  'PrismaClient' is defined but never used
✖ 2 problems (0 errors, 2 warnings)     # ikisi de ÖNCEDEN vardı, import satırlarına dokunmadım
```

---

## 3. Değişen dosyalar

- `src/modules/m5/server/queries.ts` — kişi-gün/teklif hesabı, `totalProposals` adlandırması, `any` → açık tip.

Bu dosya aynı anda başka bir ajan tarafından da düzenlendi (`createdAt` filtresinin `opportunity`
ilişkisine taşınması onların). `git diff` bu iki değişikliği birlikte gösterir; yukarıdaki üç madde benim.

Rota dosyası `page.tsx`'e **dokunmadım** — paralel ajan i18n refactor'ünü bitirdiği için gerek kalmadı.

---

## 4. Riskler

- **Orta — G0→G2 süresi eksik ölçüyor.** `queries.ts` G0 ve G2 kararlarının **ikisinin de** tarih
  aralığına düşmesini şart koşuyor. Tipik senaryoda G0 kararı 30 günlük pencereden önce alınır →
  çift eşleşmez, metrik sessizce düşük çıkar. Metrik semantiği kararı gerektiriyor (M5 sahibi), dokunmadım.
- **Orta — `[workspace]` segmenti okunup atılıyor** (`page.tsx:43` `await params;`).
  `/tr/zzz-not-a-workspace/dashboard` → **HTTP 200 + kiracının tüm KPI'ları**. Kiracı sınırı korunuyor
  (RLS + `withTenant`), workspace sınırı **korunmuyor**. Kardeş rotaların çoğu da böyle; tekil sayfa
  düzeltmesi değil, ortak bir karar/middleware işi.
- **Düşük — seed KPI'ları egzersiz etmiyor.** `demo-tenant`'ta 5 fırsatın 5'i `ACTIVE` (hiç
  `FUNDED`/`ABOVE_THRESHOLD` yok) ve tek `Evaluation`'ın `excellence/impact/implementation` alanları 0.
  Bu yüzden İsabet Oranı ve Ortalama Puan gerçekten **0,0**. Kod doğru, veri yetersiz.
  ⚠️ `docs/agent-results/E10.1-KPI-Dashboard-cora-0c1f10.md` bu kartlar için **%72,5** ve **78,3**
  raporluyor — bu sayılar canlı sayfada üretilemiyor. Rapor doğrulanmamış.
- **Düşük** — `page.tsx:47` `(await auth()) as unknown` çift cast'i tip güvenliğini kapatıyor;
  session şekli değişirse `tenantId` sessizce `undefined` olur ve sayfa "Oturum Bulunamadı"ya düşer.
- KPI hesapları için birim test yok (DB gerektiriyor); regresyonu şu an sadece canlı sayfa yakalar.

## 5. Açık sorular

1. G0→G2 süresi hangi tanım olmalı — "G2 kararı aralıkta olan fırsatlar" (G0 ne zaman olursa olsun) mı,
   yoksa şu anki "ikisi de aralıkta" mı?
2. `[workspace]` segmenti KPI'ları filtrelemeli mi, yoksa panel bilinçli olarak kiracı geneli mi?
   Filtreleyecekse geçersiz slug 404 vermeli.
3. Seed'e `FUNDED` / `ABOVE_THRESHOLD` fırsat + puanlı `Evaluation` eklensin mi? (E10.1 kabul kriteri
   "6 KPI görünür" karşılandı; "anlamlı değer üretir" karşılanmadı.)

## 6. Sonraki adım

- Yukarıdaki 3 soru M5 sahibine gidiyor; cevaplar gelmeden G0→G2 ve workspace kapsamına dokunulmamalı.
- Seed zenginleştirmesi ayrı bir görev olarak açılmalı (E10.1'i gerçekten anlamlı kılan iş bu).
- **Görev 2 (E11.1 Beta User Listesi) bu raporun kapsamında DEĞİL** — `defne-0c1f10`'a atanmış.
  Not: `beta:onboard` / `beta:rollback` CLI'ı `9062ba6` commit'iyle zaten inmiş görünüyor; defne
  başlamadan önce bunu kontrol etmeli, sıfırdan yazmamalı.
