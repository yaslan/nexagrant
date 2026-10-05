# TASK-MUM743H8P5QFK — FB İNCELEME-12 TAKİP (fe-fb)

Repo: `/Users/macbook/alan/FONBRIDGE`, dal `dev`, commit **`6f07ce7b`**. Kaynak bulgular: `FONBRIDGE/docs/agent-results/TASK-MUM5YQCBNF5QW-crw-fb.md` (K-1, K-2, Ö-2, K-7).
`auth.ts` ve kayıt çerezlerine dokunulmadı (be-fb'nin commit'lenmemiş işi ağaçta duruyor, commit'e girmedi).

## 1. Ne yapıldı

| Bulgu                 | Değişiklik                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **K-1** yorum         | `src/lib/readiness/share.ts` ve `account.ts`: "hand-edited code imports nothing" → "bozuk kod hiçbir şey aktarmaz; elle düzenlenmiş ama biçimi geçerli kod kabul edilir, puan kurumun kendi beyanıdır". Davranış değişmedi.                                                                                                                                                                           |
| **K-2** huni başlığı  | `agency.funnel.steps.readiness.title`: TR "Karne tamamlandı" → **"Karne sonucu eklendi"**, EN "Readiness card completed" → **"Scorecard result added"**. İpucu satırı aynı.                                                                                                                                                                                                                           |
| **Ö-2** koşullu ipucu | `AuthCard.tsx`: davet koduyla kayıtta (`agencyRegistration`) eski metin (ajans toplu sayıyı görür), kodsuz kayıtta yeni `Auth.readinessImportHintNoCode` (ajanstan söz etmez). TR + EN.                                                                                                                                                                                                               |
| **K-7** tarih sınırı  | `codes.ts`'e iki saf yardımcı: `expiryFromDay(day)` (gün → o günün 23:59:59Z'si, eylemdeki dönüşüm buraya taşındı) ve `lastExpiryDay(now)` (sonu hâlâ `now + MAX_VALIDITY_DAYS` içinde kalan son gün). `page.tsx` bunu `maxExpiresOn` prop'uyla panele veriyor; panelde sabit `365` kalktı. Eylem de `expiryFromDay` kullanıyor, yani tarih alanı, gün→tarih dönüşümü ve doğrulama aynı sabite bağlı. |

K-7 notu: kod seçilen günün **sonuna** kadar geçerli olduğu için sunucunun 366 günlük sınırına sığan son gün normalde **bugün + 365**'tir (bugün+366'nın sonu, 366 günü ~bir günlük farkla aşar). Eski `365` değeri tesadüfen doğruydu ama sabitten bağımsızdı; artık sabitten türetiliyor ve UTC gününün son saniyesinde doğru biçimde +366'ya geçiyor. Yardımcı istemciye değil sunucu sayfasına alındı: `codes.ts` `node:crypto` içeren `invite-code.ts`'i çektiği için istemci bileşeni onu değer olarak içe aktarmamalı.

## 2. Kanıt

### Birim testi + mutasyon (`src/lib/agency/codes.test.ts`, 3 yeni test)

```
npx vitest run src/lib/agency/codes.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

- Günün 7 farklı anında (00:00, +1 ms, 12:00, 23:59:58.999, 23:59:59, 23:59:59.999 …): `lastExpiryDay` günü doğrulamadan geçiyor, ertesi gün `AgencyInviteError` ile reddediliyor.
- Mutasyon (yardımcıyı "now + 366 gün" yapınca, sed ile geri alındı): `× the offered last day is accepted…` ve `× usually today + 365…` → **2 kırmızı**. Geri alındıktan sonra 10/10.

### Kapılar (paylaşımlı ağaç, be-fb'nin commit'lenmemiş işi de ağaçtayken)

```
pnpm typecheck        → tsc --noEmit, hata yok
pnpm i18n:check       → ✅ both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
eslint (dokunulan 8 dosya/dizin) → rc=0
vitest src/lib/agency src/lib/readiness src/app/[locale]/(app)/ajans → Test Files 10 passed · Tests 116 passed
```

### Gerçek tarayıcı (Playwright + Chrome, `http://localhost:3000` next dev, gerçek klavye Space ile kutu işaretleme, gerçek form gönderimi)

```
[kodsuz/masaustu] checked=true hint="Karne puanınız: 50 / 100. İşaretlerseniz yanıtlarınız kurum hesabınıza kaydedilir ve panonuzda görünür. İşaretlemezseniz hiçbir yanıt kaydedilmez." banner=0 scroll=1366,1366
[kodsuz/mobil]    checked=true hint="… (aynı, ajans yok)" banner=0 scroll=390,390
[kodlu/masaustu]  checked=true hint="… panonuzda görünür; davet eden kalkınma ajansı bunu yalnızca toplu sayı olarak görür. …" banner=1 scroll=1366,1366
[kodlu/mobil]     checked=true hint="… (aynı, ajanslı)" banner=1 scroll=390,390
ajans status 200
funnel step title: "Karne sonucu eklendi"
date min/max: 2026-09-30 2027-09-29
created with max day 2027-09-29 → DB: K-7 son gün | 2027-09-29 23:59:59   (sunucu kabul etti)
```

- İpucu, kutunun `aria-describedby`'ı üzerinden okundu (ekran okuyucunun okuduğu metin). Mobil 390 px'te yatay taşma yok.
- Uçtan uca K-7: tarih alanına `max` değeri yazıldı, "Kod üret" tıklandı, kod üretildi, DB'de `expiresAt = 2027-09-29 23:59:59`. Test kodu kare içinde açık göründüğü için yerel DB'de hemen iptal edildi (`revokedAt` set).
- Ajans kullanıcısı: B4'ten kalan yerel test hesabı `b4-mum6fb9d-ajans@example.org` (demo credentials, yalnız dev).

Kareler (`FONBRIDGE/docs/agent-results/TASK-MUM743H8P5QFK-screenshots/`):

| Kare                                             | Ne gösteriyor                                         |
| ------------------------------------------------ | ----------------------------------------------------- |
| `sonra-kayit-kodsuz-masaustu.png` / `-mobil.png` | Kodsuz kayıt: ipucu ajanstan söz etmiyor (Ö-2)        |
| `sonra-kayit-kodlu-masaustu.png` / `-mobil.png`  | Kodlu kayıt: ajans bandı + ajanslı ipucu              |
| `sonra-ajans-huni.png`                           | Adım 2 "Karne sonucu eklendi" (K-2)                   |
| `sonra-ajans-kod-paneli.png`                     | Kod paneli, varsayılan 30 gün                         |
| `sonra-ajans-son-gun-kabul.png`                  | Alanın `max` günü (29.09.2027) ile kod üretildi (K-7) |

"Önce" karesi: ağaç be-fb'nin commit'lenmemiş işini taşıdığı için eski sürüm ayrı sunucuda koşulmadı. Önceki durumun kanıtı: crw-fb raporu (canlı :3000 HTTP) ve B6 kareleri `TASK-MULRR8P7HIII4-screenshots/` (eski ipucu metni, "Karne tamamlandı").

## 3. Değişen dosyalar (commit `6f07ce7b`)

- `messages/tr.json`, `messages/en.json`
- `src/app/[locale]/login/AuthCard.tsx`
- `src/app/[locale]/(app)/ajans/page.tsx`, `invite-codes-panel.tsx`, `actions.ts`
- `src/lib/agency/codes.ts`, `codes.test.ts`
- `src/lib/readiness/share.ts`, `account.ts`
- (commit dışı) `docs/agent-results/TASK-MUM743H8P5QFK-screenshots/` + bu rapor

## 4. Riskler

- Panel `now`'ı sunucu render zamanından alıyor. Sayfa UTC gece yarısını geçecek kadar açık kalırsa `max` bir gün eski kalır; en kötü durumda sunucu `invalidExpiry` ile reddeder ve mesaj gösterilir (veri bozulmaz). Bu davranış önceden de vardı.
- Ö-2 ipucu, kodun geçerli olup olmadığını bilmeden (yalnız URL'de `kod=` varlığına göre) ajanslı metni gösteriyor. Geçersiz kodla kayıt zaten reddedildiği için ajanssız bir kurum ajanslı metinle kayıt olamaz.

## 5. Açık sorular

- cs-fb için: `docs/legal/agency-channel-notice-addendum.md:145` "İki sınırı tek sabite bağlama işi açık (fe-fb, TASK-MUM743H8P5QFK)" diyor. İş kapandı; sayılar hâlâ doğru ("sunucu 366, alan normalde bugün+365" — alan artık sabitten türetiliyor). Cümlenin son kısmı güncellenmeli. Hukuk dosyasına dokunmadım.

## 6. Sonraki adım

- crw-fb: yeniden inceleme (K-1, K-2, Ö-2, K-7).
- cs-fb: yukarıdaki tek cümle.
- Auth sahibi (be-fb): Ö-1 (çerez silme) kendi kartında.

## Platform beyanı

Doğrulama **macOS'ta** yapıldı (Darwin 27, Chrome via Playwright, Node, next dev :3000, Docker `fabrika-postgres`). Dokunulan kod platformdan bağımsız: JSON çeviri metinleri, React bileşeni, UTC tabanlı tarih hesabı (`Date`/`toISOString`, yerel saat dilimine bağlı değil). Tarih alanının görünümü tarayıcıya göre değişir ama `min`/`max` HTML standardı. Windows ve Linux'ta koşulamadı (bu makinede yalnız macOS var); koddan bakınca davranış farkı beklenmez, CI (Linux) aynı vitest testlerini koşar.
