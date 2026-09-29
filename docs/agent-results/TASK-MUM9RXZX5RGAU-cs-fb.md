# TASK-MUM9RXZX5RGAU — FB ROADMAP 29.09 akşam güncellemesi + KVKK eki küçük metinler (cs-fb)

Kart açıklamasını board aracından okuyamadım (`list_tasks` yalnız başlık döndürüyor). Kapsamı üç kaynaktan çıkardım: görev metni, kart başlığı ("İNCELEME-14 K-2, K-4") ve İNCELEME-14 raporu (`docs/agent-results/TASK-MUM97YNXRH61-crw-fb.md` §3, §7).

## 1. Ne yapıldı

**`docs/ROADMAP.md`** (board `list_tasks sprint=FB-KAMU-2` ve `git log --grep=<TASK-ID>` ile, dev @ `03377c94`):

- Başa "Akşam güncellemesi — 29.09.2026" notu eklendi.
- **FB-KAMU-2 listesi** yeniden yazıldı. Sayım: 35 `done` · 3 `review` · 2 `in_progress` · 1 `backlog` (41 kart, incelemeler dahil).
  - B2 kapandı: `b11ed48b`, `fb133d28`, `62a2715e`; İNCELEME-11 ONAY.
  - B3 ve B4 kodu dev'de. Takipleri `review`'da: TASK-MUM97IPC2QSGC ve TASK-MUM97PKOEUQBA.
  - B6 kapandı: `897d3608`, `6f07ce7b`.
  - B12 metni güncel. Kayıt ekranı + Consent işi TASK-MUM676F010E9G'de (`review`).
  - Yeni satırlar: TASK-MUM74FUB1DRCM (tek kullanımlık çerezler) ve inceleme kartlarının listesi.
  - İNCELEME-14'ten kart açılmadan kalan işler de yazıldı: Ö-1, K-1, K-3.
- **Pilot kapıları tablosu:**
  - (a) **kapandı**.
  - (b) kodda var, İNCELEME-15'te (TASK-MUM9RP3R6S13K).
  - (c) **karar verildi** (ADR-0006, `44d558ee` + `10d39f0a`). Kod `review`'da. Callback'e gerçek Google hesabıyla dönüş doğrulanmadı. İzin ekranında "cevreportal" adı görünüyor.
  - (d) değişmedi.
  - (e) kart yeniden `todo`'da, ama başlığındaki "[KAPATILDI 27.09 …]" notu hâlâ duruyor.
- **Açık karar #21 → KAPANDI**: ADR-0006 kararı, ilk aşamada yalnız Google, uygulama kartı ve kalan insan/patron işleri yazıldı.
- E1 satırındaki "patron kararı bekliyor" ifadesi de #21'e uyacak şekilde güncellendi. Aynı eski bilgi orada da vardı.

**KVKK eki ve envanter** (İNCELEME-14 K-4, K-2):

- `docs/legal/agency-channel-notice-addendum.md`
  - :145 — "tek sabite bağlama işi açık" cümlesi kaldırıldı. Yerine şu yazıldı: tarih alanının üst sınırı aynı sabitten türetilir (`lastExpiryDay`, `6f07ce7b`), bu normalde bugün + 365 gündür.
  - §2.3 il çerezi (:82) ve §2.4 karne çerezi (:97) — "okunduktan hemen sonra, kayıt reddedilse de silinir (tek kullanım, `15f70b0d`)" eklendi.
- `docs/legal/processing-register.md` §18c
  - (c) — K-4'teki cümlenin aynısı.
  - (g) — "onay yoksa silinir" yerine: onay yoksa çerez yazılmaz, yazılan çerez okununca silinir (tek kullanım).
  - (e) — il çerezi için aynı "tek kullanım" notu. K-2 yalnız (g)'yi söylüyordu. Kod iki çerezi aynı fonksiyonla sildiği için (e)'yi de ekledim; yoksa (e) ile (g) birbirini tutmazdı.

## 2. Kanıt

Metindeki iddiaları kodun davranışına göre doğruladım, yorumlara göre değil:

```
src/lib/auth.ts:133  async function clearRegistrationChoiceCookies() { clearRegistrationProvinceCookie(); clearRegistrationReadinessCookie(); }
  çağrılar: auth.ts:150 (ek onayı yok → ret), :155 (okuduktan hemen sonra, işlemden önce), :591, :705, :718
src/lib/agency/codes.ts:23   export const MAX_VALIDITY_DAYS = 366;
src/lib/agency/codes.ts:44-45 lastExpiryDay(now) = now + MAX_VALIDITY_DAYS*DAY_MS - END_OF_DAY_MS
src/app/[locale]/(app)/ajans/page.tsx:83  maxExpiresOn={lastExpiryDay(renderedAt)}
```

Board (list_tasks, sprint FB-KAMU-2): 41 kart. `in_progress`: MUM9RXZX5RGAU, MUM9RP3R6S13K. `review`: MUM97IPC2QSGC, MUM676F010E9G, MUM97PKOEUQBA. `backlog`: MULRSKF51ZLTW. Geri kalan 35 kart `done`. TASK-MTRJSOWFH6B45 `todo` (SPRINT-S12), başlığında hâlâ "[KAPATILDI 27.09 …]" yazıyor.

Commit'ler: yeni atıf yapılan her hash `git cat-file -e` ile doğrulandı (eksik yok). Kart→commit eşlemesi `git log --oneline --grep=<TASK-ID>` ile yapıldı.

Biçim:

```
$ npx prettier --check docs/ROADMAP.md docs/legal/agency-channel-notice-addendum.md docs/legal/processing-register.md
All matched files use Prettier code style!
$ git diff -w --stat -- docs/legal/processing-register.md
 1 file changed, 2 insertions(+), 2 deletions(-)   # geri kalan satırlar prettier'in tablo dolgusu
```

## 3. Değişen dosyalar

- `docs/ROADMAP.md`
- `docs/legal/agency-channel-notice-addendum.md`
- `docs/legal/processing-register.md`
- `docs/agent-results/TASK-MUM9RXZX5RGAU-cs-fb.md` (bu rapor)

**Kapsam notu:** Görev metninde "yalnız iki belge dosyası" yazıyordu. Ama istenen "envanter (c)/(g)" `processing-register.md` §18c'de, ekte değil (ek :11 bunu söylüyor). Bu yüzden üç belge dosyası değişti. Paylaşılan ağaçtaki başkasına ait değişikliklere dokunmadım: `.env.example`, `README.md` (devop-fb) ve `FON_BRIDGE.md`.

## 4. Riskler

- ROADMAP'teki board sayıları 29.09 akşamının anlık görüntüsü. İNCELEME-15 bitince (b), (c), B3, B4 ve B12 yeniden değişecek.
- Kullanıcıya gösterilen ek metnine (§4 TR, §5 EN) dokunulmadı. Değişen cümleler yalnız iç/hukuk bölümlerinde. Consent sürümü (`agency-channel-addendum@2026-09-29.1`) değişmez.

## 5. Açık sorular

- ROADMAP "FB-GAP-1'de hâlâ açık" listesinde TASK-MULQLQIE3ES6G (prompt'lar + M9) duruyor. Kart `done`, yani liste eskimiş. Bu kartın kapsamı dışında kaldığı için dokunmadım. Bir sonraki ROADMAP geçişinde düzeltilmeli.
- TASK-MTRJSOWFH6B45 başlığındaki "[KAPATILDI …]" notu yanıltıcı. Başlığı patron mu değiştirsin, lider mi?

## 6. Sonraki adım

- İNCELEME-15 (TASK-MUM9RP3R6S13K) bitince pilot kapıları (b)/(c) ve B3/B4 satırları güncellenmeli.
- Bir insan, gerçek bir Google test hesabıyla callback'e dönüşü doğrulamalı. Patron da izin ekranı adını düzeltmeli (TASK-MULQM3LFB4KRA).
- Metin değişiklikleri küçük. Bir sonraki incelemede kontrol edilebilir.

## Platform beyanı

Doğrulama **macOS'ta** yapıldı (Darwin 27, prettier, git). Yalnız Markdown değişti; kod yolu yok. Platforma bağlı bir davranış olmadığı için Windows ve Linux'ta ayrıca koşulmadı; beklenen fark yok.
