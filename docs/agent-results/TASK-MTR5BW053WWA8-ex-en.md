# TASK-MTR5BW053WWA8 — Konsorsiyum rozeti: ham enum + sabit İngilizce

## 1. Ne yapıldı

`src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager.tsx` içindeki koltuk
kartında dört sorun giderildi:

1. **`seat.status` artık çevriliyor.** `Consortium.status.<ENUM>` çeviri haritası
   (`OPEN|CANDIDATE|INVITED|CONFIRMED|DECLINED`) eklendi; rozet artık `t()` ile
   basılan metni gösteriyor, DB enum değerini doğrudan değil.
2. **Rol anahtarı da çevriliyor.** `Consortium.role.<key>` haritası (`coordinator`,
   `research`, `industry`, `end_user`, `widening`, `dissemination`) eklendi. Haritada
   olmayan bir rol anahtarı (serbest metin — `roleKey` Prisma şemasında enum değil,
   `String`, ve yorum satırı `"... | custom"` diyor) `replace(/_/g,' ')` ile nötr bir
   biçime düşüyor; hiçbir zaman ham alt-çizgili anahtar ekrana çıkmıyor.
3. **`Required` metni `t('required')`'a taşındı** (tr: "Zorunlu", en: "Required").
4. **Rozetteki `uppercase` CSS sınıfı kaldırıldı.** Metin artık çeviri
   kataloğunda zaten büyük harfle yazılı geliyor (`"AÇIK"`, `"DAVET EDİLDİ"`, ...).
   Bu, aynı dosyada geçen turda başlıkta yaşanan `i→İ` bozulmasının (bkz.
   `.agentspace/memory/shared/fabrika-css-uppercase-turkish-dotted-i.md`) aynı
   kalıbının rozette de tekrarlanmasını önlüyor.
5. **Bilinmeyen `status` değeri için güvenli yol:** `statusColors[seat.status]`
   haritada yoksa ham değer basılmıyor, `t('status.unknown')` ("BİLİNMİYOR" /
   "UNKNOWN") gösteriliyor ve stil nötr bir gri rozete (`UNKNOWN_STATUS_STYLE`)
   düşüyor. `SeatStatus` gerçek bir Postgres enum'u olduğu için üründe bu dal
   normal akışta tetiklenmez (bkz. §2, canlı ortamda test edilemedi — kod
   incelemesiyle doğrulandı), ama şemaya yeni bir enum değeri eklenip henüz bu
   dosyaya yansımadığı ara dönemde veya eski/bozuk bir satırda devreye girer.

Kapsam dışı bırakılan, bilerek dokunulmayan: `ROLE_OPTIONS` dizisindeki "add role"
buton etiketleri (`+ Coordinator`, `+ Research Partner`, ...) hâlâ sabit İngilizce —
bunlar görev tanımındaki 4 maddenin kapsamında değildi ve "koltuk mantığına/rol
matrisine girme" talimatı bu diziyi de kapsıyor gibi yorumlandı. Ayrı bir görev
adayı olarak not düşülüyor.

## 2. Kanıt

### i18n parite (commit sonrası)
```
tr leaf count 726
en leaf count 726
tr-en diff set()
en-tr diff set()
```
(Not: 615→631 benim eklediğim 16 anahtardı; 631→726 arası fark aynı commit
penceresinde paralel bir ajanın `messages/*.json`'a eş zamanlı yazdığı başka
anahtarlardan geliyor — bkz. §6 "Riskler".)

### `pnpm typecheck`
```
$ tsc --noEmit
(0 hata)
```

### `pnpm lint`
```
✖ 194 problems (0 errors, 194 warnings)
```
(Tümü önceden var olan, dokunmadığım dosyalardaki uyarılar; `manager.tsx` içinde
sıfır uyarı/hata.)

### `pnpm rls:check`
```
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.
```

### `pnpm rls:verify`
```
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

### `pnpm test` (tam `pnpm gate` zinciri)
`pnpm gate` = lint && typecheck && test && rls:check && rls:verify. `pnpm test`
adımında **benim değişikliğimle ilgisi olmayan** 7 test kırmızı:
`tests/gates.test.ts` → `No "withTenant" export is defined on the "../src/lib/db"
mock`. Kök neden: aynı paylaşılan çalışma ağacında başka bir ajan
`src/lib/gates/evaluate.ts` ve `tests/gates.test.ts`'i commit'lenmemiş olarak
değiştiriyordu (`git status` bunu commit anında `M src/lib/gates/evaluate.ts` /
`M tests/gates.test.ts` olarak gösterdi — ikisi de benim dokunmadığım dosyalar,
G0/G2 kapı motoruyla ilgili, konsorsiyum rozetiyle alakasız). Bu yüzden `pnpm
gate`'i tek komut olarak çalıştıramadım; `lint` + `typecheck` + `rls:check` +
`rls:verify` adımlarını ayrı ayrı çalıştırıp temiz olduklarını yukarıda gösterdim.
`test` adımının kendisi benim dosyalarımda 0 başarısız test veriyor (yalnızca
`tests/gates.test.ts` kırmızı, o da başka bir ajanın WIP'i yüzünden).

### Gerçek tarayıcı doğrulaması (Playwright, gerçek DB + gerçek login)
`demo-tenant` / `demo-opp-1` üzerinde `ConsortiumSeat` tablosuna 8 satır geçici
olarak eklendi (5 gerçek enum durumu: `OPEN/CANDIDATE/INVITED/CONFIRMED/DECLINED`,
6 bilinen rol anahtarı + 2 bilinmeyen rol anahtarı `custom` ve `made_up_role` —
bilinmeyen-rol dalını gerçek DB'de tetiklemek için). `alice@fabrika.test` ile
`tr` ve `en` locale'de giriş yapılıp `/{locale}/main/pipeline/demo-opp-1/consortium`
sayfası tam sayfa ekran görüntüsü alındı, sonra test satırları
`consortiumSeat.deleteMany({opportunityId:'demo-opp-1', tenantId:'demo-tenant'})`
ile temizlendi (8 satır silindi, doğrulandı).

- `docs/agent-results/TASK-MTR5BW053WWA8-screenshots/tr-consortium.png` — Türkçe:
  rozetler `AÇIK / ADAY / DAVET EDİLDİ / ONAYLANDI / REDDEDİLDİ`, hiçbir yerde ham
  İngilizce enum yok, `İ` bozulması yok (`DAVET EDİLDİ`, `REDDEDİLDİ` doğru
  yazılmış), "Zorunlu" etiketi görünüyor, bilinmeyen rol anahtarları (`custom`,
  `made_up_role`) "Custom" / "Made Up Role" olarak nötr biçimde düşüyor (ham
  alt çizgili anahtar yok).
- `docs/agent-results/TASK-MTR5BW053WWA8-screenshots/en-consortium.png` — İngilizce:
  rozetler `OPEN / CANDIDATE / INVITED / CONFIRMED / DECLINED`, "Required" etiketi
  çeviriden geliyor.

**`status.unknown` / gerçek olmayan bir `SeatStatus` değeri canlıda test edilemedi**
— `SeatStatus` gerçek bir Postgres enum'u (`OPEN|CANDIDATE|INVITED|CONFIRMED|
DECLINED`), şema seviyesinde başka değer kabul etmiyor; bunu DB'ye yazmak
`ALTER TYPE` gerektirir ve şemaya dokunmak görev kapsamı dışında/riskli
sayıldığından yapılmadı. Bu dal kod incelemesiyle doğrulandı: `statusColors[seat
.status]` haritada yoksa `t('status.unknown')` + `UNKNOWN_STATUS_STYLE` devreye
giriyor (bkz. diff, §1 madde 5).

## 3. Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager.tsx`
- `messages/tr.json` (yalnız `Consortium.*` ad alanı — `required`, `status.*`, `role.*`)
- `messages/en.json` (aynı)

Commit: `af28b7b` — `fix(m8): translate consortium seat status/role badges, drop raw-enum leak`

## 4. Riskler

**Paylaşılan `messages/*.json` dosyasına eş zamanlı yazma — commit'ime yabancı
içerik karıştı.** `git add messages/tr.json messages/en.json` ile YALNIZCA bu iki
dosyayı (kendi ad alanımdaki değişikliklerle birlikte) stage ettim — `git add .`
/ `-A` / `commit -a` kullanmadım, talimata uydum. Ama commit anında bu iki dosya
*aynı anda* başka bir paralel ajan tarafından da (commit'lenmemiş olarak)
düzenleniyormuş: `Pipeline.detail.archive.*`, `Pipeline.detail.effortTab.*`,
`UserIdentity.*`, `callDetails.*`, `callsPage.*` gibi bana ait olmayan ~95 yeni
anahtar benim commit'imin içine girdi (615→631 benim eklediklerim, 631→726 onların).
Dosya bütünlüğü sağlam (JSON geçerli, tr/en parite 726/726, `git status` artık bu
dosyalarda bekleyen değişiklik göstermiyor) — veri kaybı YOK, ama o ajanın işi
kendi commit mesajı yerine benimkinin altında tarihe geçti. Bu, "yalnız kendi
yollarını commit'le" kuralının ötesinde bir durum: dosya YOLU tekildi ama dosya
İÇERİĞİ paylaşılıyordu. Kalıcı hafızaya not düştüm (`fabrika-shared-json-file-
concurrent-write-risk`).

**`tests/gates.test.ts` kırmızı** — benim değişikliğimle ilgisi yok, başka bir
ajanın WIP'i (`src/lib/gates/evaluate.ts` + `tests/gates.test.ts`, ikisi de
commit anında `M` olarak görünüyordu). Dokunmadım; onların işi bitince kendi
kapısı temiz çıkmalı.

## 5. Açık sorular
- `ROLE_OPTIONS` (add-seat buton etiketleri, satır 43-50) hâlâ sabit İngilizce —
  ayrı bir görev adayı mı, yoksa bu görevin doğal uzantısı olarak mı ele alınmalı?
  Talimat "koltuk mantığına/rol matrisine girme" dediği için dokunmadım.

## 6. Sonraki adım
- Yukarıdaki `ROLE_OPTIONS` bulgusu istenirse ayrı bir görev olarak açılabilir.
- `tests/gates.test.ts` kırmızısı, o dosyayı sahiplenen ajan işini bitirip
  commit'leyince kendiliğinden düzelmeli; bu görev onu beklemedi (kapsam dışı).
