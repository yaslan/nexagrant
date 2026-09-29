# TASK-MUM2RMN3YIBGC — FB KAMU B2 SIZINTI-4: "Tükendi" durumu kaldırıldı, D = 0 saldırgan kapısı (fe-fb)

Kaynak: `docs/agent-results/TASK-MUM1OTRM75QS2-crw-fb.md` Kart 1 B-1, Ö-1, Ö-2. Karar: leed-fb 29.09, crw-fb seçenek 1.

## 1. Ne yapıldı

- **"Tükendi" durumu kaldırıldı.** `inviteCodeStatus` (`src/lib/agency/codes.ts`) artık yalnız `revoked` / `expired` / `active` döndürüyor. Kullanım sınırına ulaşan kod "Etkin" görünüyor. `InviteCodeStatus` tipinden `exhausted` çıktı. UI'daki `STATUS_CLASS` girdisi ve i18n anahtarı (`agency.codes.status.exhausted`, tr "Tükendi" / en "Used up") silindi.
- **`usedCount` artık veritabanından okunmuyor.** `listInviteCodesIn` bu alanı `select` etmiyor. Durum hesabı bu alana ihtiyaç duymuyor. `InviteCodeRecord.usedCount` isteğe bağlı hale geldi: testler tam satırı verip alanın dışarı sızmadığını doğrulayabilsin diye.
- **Kayıt tarafı değişmedi.** Tükenen kod `redeem_agency_invite` içinde reddediliyor ve kullanıcı tek tip mesajı görüyor. Ret denetim satırı `reason='exhausted'` olarak kalıyor (Ö-2, aşağıda).
- **Panel açıklaması güncellendi** (tr/en `countsNote`): "kullanım sınırına ulaşan kod da “Etkin” görünür". Ajans kayıt olamayan kurumun şikâyetini anlayabilsin diye bunu açıkça yazdım. Tam sayı vermediği için yeni bir kanal açmıyor.
- **Ö-1: saldırgana D = 0 varyantı eklendi** (`funnel.attack.test.ts`):
  - `attack(..., { noneDeleted: true })` → `hi[DELETED] = 0`, yani Σ used = R.
  - Özellik testi her tohumu **iki modda** (D ≥ 0, D = 0) ve **iki kod deseniyle** koşuyor: rastgele dağıtım ve "6'şar hakla art arda verilen kodlar" (crw-fb'nin org-global-zero-six modeli). Toplam 3 tohum × 4 = 12 × 300 tablo.
  - crw-fb'nin **#17 örneği** kendi testi olarak eklendi.
  - Saldırgan panelin "tükendi" diyip diyemediğini `inviteCodeRow`'un kendisinden okuyor (`PANEL_SAYS_EXHAUSTED` yoklaması). Durum geri gelirse "etkin ⇒ used ≤ max − 1" kuralını da kendisi uyguluyor.
  - Eski "açık" R-2 testi (D ∈ [1,3]) artık `[]` bekliyor. Özellik testindeki `DELETED` filtresi kaldırıldı, yani silinen kurum sayısı da kapıda.
- **Ö-2:** `src/lib/agency/funnel.ts` başına yorum eklendi. `agency.invite.rejected` satırları (`reason`, `codeId`) ajansın kiracısında duruyor. Bunları ya da sayılarını gösteren bir ekran aynı saldırgandan (D ≥ 0 ve D = 0) geçmeden yayına çıkmamalı. Ekran yapılmadı.
- **HUKUK-5** (`docs/legal/agency-channel-notice-addendum.md`):
  - Tablo satırı ve aydınlatma metninden "tükendi" çıkarıldı.
  - Yeni not: "tükendi durumu kaldırıldı". Gerekçesi, #17 örneği, R-2'nin kapanması ve bedeli yazıldı.
  - K-1 notu güncellendi. Kod panosundaki geçiş anı kapandı. Toplamların yuvarlama sınırını geçtiği an (**R-1 zaman kanalı**) hâlâ açık ve **risk kabulü** olarak yazıldı.
- `code-limits.ts` yorumu güncellendi. `MIN_MAX_USES = 6` değişmedi: 5'ten küçük sınır, sınırı bilen ajansa 0..4 aralığını veriyor. 6 marjı korundu.

## 2. Kanıt

**Kırmızı (düzeltmeden önce, yeni testlerle):**

```
× the deleted organisations (R-2) are not read back: nothing gives Σ used a lower bound
× the panel never says "exhausted": a used-up code reads "active" (TASK-MUM2RMN3YIBGC)
× D = 0, crw-fb org-global-zero-six #17: … do not bound the fifth code to 2..3
    + { "hi": 3, "lo": 2, "target": "code#4", "truth": 3 }      ← crw-fb'nin a ∈ [2,3]'ü birebir
× seed 1, D ≥ 0: … "#101 codes|deleted=1 ∈ [1, 4]", "#228 codes|deleted=2 ∈ [1, 3]"
Tests  4 failed | 12 passed (16)
```

**Yeşil (düzeltmeden sonra):**

```
npx vitest run src/lib/agency/funnel.attack.test.ts
Tests  22 passed (22)
```

**Mutasyon (kapının regresyonu yakaladığının kanıtı):** `codes.ts`'e eski `exhausted` dalı geçici olarak geri kondu, sonra dosya yedekten geri yüklendi.

```
× … R-2 …   × … never says "exhausted" …   × … #17 …
× seed 1/7/42, D ≥ 0, random codes            × seed 1/7/42, D ≥ 0, sequential 6-use codes
× seed 1/7/42, D = 0, sequential 6-use codes
Tests  12 failed | 10 passed (22)
```

**Geniş tarama** (geçici dosya, commit'lenmedi). 10 tohum × 300 tablo, art arda 6'lık kodlar, eski ve yeni davranış:

| Model | Eski ("tükendi" var)                          | Yeni          |
| ----- | --------------------------------------------- | ------------- |
| D ≥ 0 | 8 / 3.000 tablo (hepsi `codes\|deleted`, R-2) | **0 / 3.000** |
| D = 0 | 21 / 3.000 tablo (`code#k` ∈ 1..4)            | **0 / 3.000** |

Rastgele kod dağılımıyla D = 0 eski davranışta da 0 veriyordu. Bu yüzden kalıcı kapıya art arda kod deseni de eklendi. Kapı yalnız rastgele dağılımla bu hatayı görmüyordu.

**Kapılar:**

```
npm run typecheck                         → tsc --noEmit, exit 0
npm run lint                              → eslint, exit 0
set -a; source .env; set +a; npm test     → Test Files 191 passed | 2 skipped; Tests 2213 passed | 8 skipped; exit 0
npx vitest run tests/agency-invite.live.test.ts (.env yüklü) → 16 passed (kayıt reddi + ret denetimi canlı DB'de)
npm run i18n:check                        → ✅ both catalogs agree … no file gained hard-coded text (325/325 baseline)
```

**Canlı :3000 (leed-fb'nin sunucusu).** Geçici fikstürde 1 ajans, 10 kurum ve 6 kod vardı. Kodlar: A 7/25, B 3/25, **C 6/6 (tükenmiş)**, D eski 1/1, E iptal, F süresi dolmuş. Demo girişi curl ile yapıldı (`login 302`, `ajans 200`). SSR HTML'den okunan satırlar:

```
Tükendi yok: True   ("Tükendi" in html → False, "exhausted" sayısı → 0)
••••-••••- 8YE8 F — süresi doldu      En çok 25 kurum  Süresi doldu
••••-••••- N922 E — iptal             En çok 25 kurum  İptal edildi
••••-••••- WSKY D — eski 1 hakkı (1/1) En çok 1 kurum  Etkin
••••-••••- VEK9 C — küçük grup (6/6)  En çok 6 kurum   Etkin      ← tükenmiş kod
••••-••••- S5XC B — Tokat günü (3/25) En çok 25 kurum  Etkin
••••-••••- VNK7 A — Samsun günü (7/25) En çok 25 kurum Etkin
```

Kare: `docs/agent-results/TASK-MUM2RMN3YIBGC-screenshots/kod-paneli-tukenmis-kod-etkin.png`. C (6/6) satırı "Etkin" görünüyor. Panel açıklamasındaki yeni cümle de karede.

- Kare yöntemi önceki kartlarla aynı: :3000'in SSR HTML'i, CSS satır içine alındı, script'ler kaldırıldı. Sayfa `127.0.0.1:3999`'dan sunuldu ve dahili tarayıcıyla çekildi. Kod tablosu görünsün diye form ve funnel bölümü HTML'den kesildi.
- Dahili tarayıcıdaki kullanıcı oturumuna dokunulmadı.
- Fikstür silindi (`cleaned 11 tenants, 1 users`). :3999 kapatıldı.

## 3. Değişen dosyalar

- `src/lib/agency/codes.ts`: `exhausted` durumu ve `usedCount` select'i kaldırıldı, yorumlar güncellendi.
- `src/lib/agency/codes.test.ts`: durum testleri güncellendi. Yeni test hiçbir sınırda "exhausted" çıkmadığını doğruluyor. Bir başka test de `select`'te `usedCount` olmadığını kontrol ediyor.
- `src/lib/agency/funnel.attack.test.ts`: D = 0 modu, `PANEL_SAYS_EXHAUSTED` yoklaması, #17 örneği, R-2 testi `[]`, özellik testi 2 D modu × 2 kod deseni.
- `src/lib/agency/funnel.ts`: Ö-2 yorumu (yalnız yorum).
- `src/lib/agency/code-limits.ts`: yalnız yorum.
- `src/app/[locale]/(app)/ajans/invite-codes-panel.tsx`: `STATUS_CLASS.exhausted` kaldırıldı.
- `src/app/[locale]/(app)/ajans/actions.test.ts`: CCCC (25/25) artık `active` bekleniyor.
- `messages/tr.json`, `messages/en.json`: `status.exhausted` silindi, `countsNote` cümlesi eklendi.
- `docs/legal/agency-channel-notice-addendum.md`: HUKUK-5 notları güncellendi. Prettier, satır genişliği değiştiği için §2 tablosunun hizalamasını yeniden yaptı. İçerikte değişen tek hücre durum listesi.
- `docs/agent-results/TASK-MUM2RMN3YIBGC-screenshots/kod-paneli-tukenmis-kod-etkin.png`, bu rapor.

## 4. Riskler

- **R-1 zaman kanalı açık** (risk kabulü, HUKUK-5 K-1 notu). Toplamın yuvarlama sınırını geçtiği anı yakalayan ajans kendi kod dağıtımıyla eşleştirme yapabilir. Pilot öncesinde yapılmıyor.
- **Bant dışı kanal:** Kayıt olamayan kurum ajansa "kod çalışmadı" diyebilir. Bu tam sayı vermez ve karar metninde kabul edilmiş durumda.
- **Ö-2 bekleyen koşul:** Ret satırlarını gösteren bir ekran `reason='exhausted'` ile "tükendi" bilgisini geri getirir. Şu an yalnız kod yorumu bunu koruyor, teknik bir engel yok.
- **Eski kodlar (maxUses < 5):** Ajans sınırı bildiği için 1..4 kalıntısı sürüyor (`known residual` testi). Pilottan önce iptal önerisi geçerli.
- Kalıcı kapı saldırganın yayılım (interval propagation) modelidir, MILP değildir. crw-fb'nin MILP'i aynı D = 0 verisinde 1.100 tablonun 0'ında sızıntı buldu. Benim geniş taramam da 6.000 tablonun 0'ında buldu. İki yöntem aynı sonucu veriyor ama bu bir ispat değil.

## 5. Açık sorular

- `MIN_MAX_USES` 6'da kaldı. "Tükendi" gittiği için 5 de yeterli olabilir: 5 hakkı bilinen bir kod 0..5 aralığı verir. Değiştirmedim, karar leed-fb'nin. Değişiklik hem UI metnini ("En az 6") hem `invalidMaxUses` mesajını etkiler.

## 6. Sonraki adım

- leed-fb: pilot kapısının son maddesi. crw-fb'nin yeniden doğrulaması (D = 0 MILP, yeni kodla).
- Ret denetimi ekranı planlanırsa kartına bu saldırgan kapısı DoD maddesi olarak konmalı.

## Platform beyanı

Doğrulama **mac**'te yapıldı (Darwin 27, yerel `fabrika-postgres`, leed-fb'nin :3000 dev sunucusu). Değişiklikler saf TypeScript mantığı, i18n JSON ve belge. Süreç, dosya yolu, kabuk ya da ekran/DPI bağımlılığı yok, bu yüzden Windows ve Linux'ta davranış aynı. Windows ve Linux'ta koşulmadı çünkü bu makinede o ortamlar yok. CI (Linux) aynı vitest kapılarını koşuyor. Kare statik bir SSR anlık görüntüsü, etkileşimli tıklama testi değil. Bu kartta etkileşimli akış değişmedi, yalnız rozet metni değişti.
