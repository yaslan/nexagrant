# TASK-MUM17YBJVAHRR — FB KAMU B2 SIZINTI-3: davet kodu paneli (fe-fb)

Commit: `b11ed48b` (dev, `8f4048db` üstüne; arada be-fb'nin `50d7e8a9`/`7071e451` commit'leri var, onlara dokunulmadı). Push yok.

## 1. Ne yapıldı

Kaynak: `TASK-MUM0M211WDIW5-crw-fb.md` Kart 1 B-1, Ö-1, K-1.

1. **Sayı yok, yalnız durum (karar 1).** Bir kodun sunucudan çıkmasının tek yolu artık `inviteCodeRow` (`src/lib/agency/codes.ts`). Bu fonksiyon `status` döndürür (`active | exhausted | revoked | expired`) ve `usedCount` alanını yanına almaz. `listInviteCodesIn` `usedCount`'u yalnız durumu hesaplamak için okuyor, dönüşe koymuyor. Böylece sayı üç çıkışın hiçbirinden gitmiyor: sayfa props'u (`ajans/page.tsx`), panonun yenileme action'ı (`ajans/actions.ts listInviteCodes`) ve B1'in `listAgencyInviteCodesAction`'ı (`src/lib/agency/actions.ts`). Bu sonuncusu da `'use server'` olduğu için dışarıdan çağrılabiliyordu. `shownUsedCount` / `USED_COUNT_THRESHOLD` silindi. Durumu artık sunucu hesaplıyor, istemcideki `statusOf` kaldırıldı.
2. **Yeni kodlarda üst sınır en az 6 (karar 2).** Kararda "≥ 5" yazıyordu. 6'yı seçtim, çünkü 6 bu şartı sağlıyor ve 5 saldırgan testinden geçmiyor. "Tükendi" gösterebilen bir kod "etkin" görünüyorsa kullanımı en fazla `maxUses − 1`'dir. Sınır 5 olursa bu "≤ 4" demek. İki tane 5 hakkılı etkin kod ve funnel'da "5" (R ≥ 5) varsa, her kodun kullanımı 1..4 çıkıyor. Sunucu doğrulaması `validateInviteCodeInput`'ta (`MIN_MAX_USES`). Arayüzde `min={MIN_MAX_USES}` var, etikette "En az 6" yazıyor, hata metni "6 ile 10.000". Sabitler `src/lib/agency/code-limits.ts`'te, çünkü `codes.ts` `node:crypto` çekiyor ve istemci formu onu içe aktaramaz.
3. **Kuraldan önce üretilmiş kodlar.** Üst sınırı 6'dan küçük olup tükenmiş kodlar "tükendi" göstermiyor, "etkin" görünüyor (`inviteCodeStatus`). Bkz. §4 R-1.
4. **Ö-1: saldırgan kod panelini de okuyor.** `funnel.attack.test.ts`'te `publishCodes` her kodu gerçek `inviteCodeRow` + JSON'dan geçiriyor. Saldırgan yanıtta ne bulursa onu okuyor: sayı, "<5", `exhausted` ya da `status`. Kısıtlar şunlar:
   - Σ used = R + D. Yani R ≤ Σ used; D, sonradan silinen kurumların kullanımları.
   - 0 ≤ used ≤ max.
   - tükendi ⇒ used = max.
   - Tükendi gösterebilen etkin bir kod için used ≤ max − 1.

   Rastgele özellik testi her tabloya 1-3 kod ekliyor. Kodlar, R kurum ve 0-3 silinmiş kullanım arasında paylaştırılıyor. Yaklaşık üçte biri tükenmiş, bir kısmı iptal edilmiş ya da süresi dolmuş. Kod üretimi ayrı bir rastgele akış kullanıyor, bu yüzden tablolar funnel kapısının gördüklerinin aynısı.

5. **K-1: HUKUK-5 notu.** `docs/legal/agency-channel-notice-addendum.md` §3.1'e iki not eklendi: davet kodları ve birikimli sayıların zaman kanalı. Pilot öncesinde kodda değişiklik yok. Ekteki metin de koda uyduruldu: §2.1'deki kod satırında artık "kullanım sayısı yok, durum var" yazıyor. §4 (TR) ve §5 (EN) de "kaç kez kullanıldığını görmez" diyor. Önceki metin sayıyı vaat ediyordu.
6. Canlı test (`tests/agency-invite.live.test.ts`): `makeCode` kodu en az sınırla üretiyor. 1, 2 ve 5 hakkılı kodlar gereken kullanım testleri için `maxUses` sahibin bağlantısıyla sonradan düşürülüyor (`expiresAt` testindeki yöntemin aynısı). Kuraldan önceki kodlar da böyle taklit ediliyor. RLS testine "listede `usedCount` yok" kontrolü eklendi.

## 2. Kanıt

**A/B örneği, önce kırmızı** (düzeltmeden önce; `inviteCodeRow` o sırada eski davranışı taşıyordu):

```
 × A = 7, B = "<5", funnel total "10" (R 8..12): B is not read back as 1..4
+   { "hi": 4, "lo": 1, "target": "code#1", "truth": 3 }
 × seed 1: 300 random small tables, every view and the code panel joined   (45/300 tables leak)
 × seed 7 …  × seed 42: 42/300 tables leak ('#15 code#0=4 ∈ [4, 4]', '#28 code#0=4 ∈ [1, 4]', …)
Tests  5 failed | 5 passed (10)
```

Saldırgan, crw-fb'nin bulduğu aralığı birebir buldu: B ∈ [1, 4].

**Sonra yeşil:** `npx vitest run src/lib/agency/` → `Test Files 4 passed (4) · Tests 41 passed (41)`.

**Mutasyonlar** (yedek dosyadan geri alındı, `git checkout` kullanılmadı):

- `MIN_MAX_USES = 5` → 5 test kırmızı oldu. Rastgele tablolar da yakaladı: `seed 1: '#177 code#0=4 ∈ [1, 4]'`, `seed 7: '#5 code#1=4 ∈ [1, 4]'`. Sınırın 6 olması bu kanıta dayanıyor.
- `inviteCodeRow`'a `usedCount: c.usedCount` eklendi → 9 test kırmızı oldu. Aralarında iki action yanıt testi ve saldırganın A/B testi var.

**Sunucu yanıtında `usedCount` olmadığını gösteren testler:**

- `src/app/[locale]/(app)/ajans/actions.test.ts`: DB satırında 7, 3 ve 25 var. `listInviteCodes` ve `listAgencyInviteCodesAction` yanıtı yalnız `id, hint, label, maxUses, status, expiresAt, revokedAt, createdAt` anahtarlarını taşıyor. 7 ve 3 değer olarak hiçbir yerde geçmiyor.
- `codes.test.ts`: `inviteCodeRow` ve `listInviteCodesIn` için.
- Canlı DB testi: 16/16 geçti.

**:3000 (leed-fb'nin sunucusu, HMR).** Geçici fikstür: 1 ajans, 10 kurum ve 6 kod. Kodlar: 7/25, 3/25, 6/6 (tükenmiş), eski 1/1, iptal, süresi dolmuş. Demo girişi curl ile yapıldı (302). Action'lar `Next-Action` başlığıyla gerçek sunucuya çağrıldı:

```
createInviteCode maxUses=5 → 1:{"ok":false,"error":"invalidMaxUses"}
createInviteCode maxUses=6 → ok (kod yanıtta, rapora alınmadı)
listInviteCodes            → …{"hint":"PHY3","label":"Eski kod (sınırdan önce)","maxUses":1,"status":"active",…},
                             {"hint":"EFZM",…,"maxUses":6,"status":"exhausted",…},{"hint":"MR6G",…,"maxUses":25,"status":"active",…}
list.rsc   bytes=1563   usedCount=0 "used=0 status=7
ajans.html bytes=168475 usedCount=0 "used=0   (tek "exhausted": eşleşmesi i18n anahtarı "Tükendi")
```

Beklendiği gibi, 7/25 ve 3/25 kodlarının ikisi de yalnız "Etkin" görünüyor. Tükenmiş 1/1 eski kod "Etkin", 6/6 kod "Tükendi" gösteriyor.

Kareler `docs/agent-results/TASK-MUM17YBJVAHRR-screenshots/`:

- `01-davet-kodlari-durum.png`: açıklama notu, "Kullanım sınırı · En az 6", "Kullanım sınırı" sütunu ("En çok N kurum"), Etkin / Süresi doldu / İptal edildi durumları.
- `02-davet-kodlari-tukendi-satiri.png`: "Tükendi" satırı ve tablonun yatay kaydırılmış hali.

Kare yöntemi önceki kartlarla aynı: :3000'in SSR HTML'i, CSS satır içi, script yok, kendi `127.0.0.1:3999` sunucumdan, dahili tarayıcıyla. Dahili tarayıcıdaki kullanıcı oturumunu değiştirmemek için bu yolu seçtim. Kareler **etkileşimsiz**. Form gönderimi ve reddi kare yerine yukarıdaki gerçek action çağrılarıyla doğrulandı. Fikstür silindi (`cleaned 11 tenants, 1 users`), :3999 kapatıldı.

**Kapılar:**

| Komut                                                                        | Sonuç                                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run typecheck`                                                          | rc=0                                                                    |
| `npx eslint src/lib/agency src/app/…/ajans tests/agency-invite.live.test.ts` | rc=0, çıktı yok                                                         |
| `set -a; source .env; set +a; npx vitest run`                                | `Test Files 191 passed \| 2 skipped` · `Tests 2202 passed \| 8 skipped` |
| `npx vitest run tests/agency-invite.live.test.ts`                            | `Tests 16 passed (16)`                                                  |
| `npm run i18n:check`                                                         | "✅ i18n check passed … no file gained hard-coded text" (0)             |

## 3. Değişen dosyalar

- `src/lib/agency/codes.ts`: `InviteCodeStatus`, `InviteCodeRecord`, `inviteCodeStatus`, `inviteCodeRow`, sayısız `InviteCodeSummary`, `listInviteCodesIn(tx, tenantId, now)`, `MIN_MAX_USES` doğrulaması. `shownUsedCount` silindi.
- `src/lib/agency/code-limits.ts` (yeni): `MIN_MAX_USES = 6`, `MAX_USES_LIMIT`.
- `src/app/[locale]/(app)/ajans/page.tsx`, `actions.ts`, `invite-codes-panel.tsx`
- `src/app/[locale]/(app)/ajans/actions.test.ts` (yeni), `src/lib/agency/codes.test.ts`, `src/lib/agency/funnel.attack.test.ts`, `tests/agency-invite.live.test.ts`
- `messages/tr.json`, `messages/en.json`: `colUsage/usage/usageSmall/usageSmallSr` silindi. Yerine `colLimit`, `limit`, `maxUsesHint`, `countsNote` geldi. `invalidMaxUses` metni 6'ya göre güncellendi.
- `docs/legal/agency-channel-notice-addendum.md`: §2.1 satırı, §3.1'e iki HUKUK-5 notu, §4/§5 cümleleri.

`src/lib/agency/actions.ts` (B1) değişmedi. Dönüş tipi `InviteCodeSummary`'den geldiği için yanıtında artık sayı yok.

## 4. Riskler

- **R-1: kuraldan önce üretilmiş kodlar (maxUses < 5).** Bu kodlar "tükendi" göstermiyor. Yine de ajans kodun üst sınırını kendisi bildiği için 1-4 aralığı çıkabiliyor. Örnek: iki tane 4 hakkılı kod ve funnel'da "5" varsa, her kod ≥ 1 çıkıyor. Bu durum testte belgelendi (`known residual …` testi, beklenen `['code#0','code#1']`). Panelden kapatılamaz. **Pilottan önce bu kodların iptali önerilir.** Karar 2 tek başına yetmiyor. Yerel DB'de fikstür dışında böyle kod yok. Prod'u kontrol edemedim.
- **R-2 (açık soru, bkz. §5): silinen kurumların sayısı.** Bütün kodlar tükendiyse Σ used kesin biliniyor. Funnel "5" (5..7) gösteriyorsa, koddan sonra silinen kurum sayısı D = Σ max − R, 1..3 aralığına düşebiliyor. Örnek: tek bir 8 hakkılı kod tükenmiş, 2 kurum silinmiş → D ∈ [1, 3]. Bu kanal yalnız "tükendi" durumundan doğuyor ve kart bu durumu açıkça istiyor. Bu yüzden düzeltmedim. `open (leed-fb / HUKUK-5)` testinde belgeli. Özellik kapısı yalnız bu değişkeni dışarıda bırakıyor; bütün funnel grupları ve kod kullanımları kapıda. Filtre öncesi ölçüm: 900 tablonun 2'sinde (seed 1: #101, #228).
- **R-3: zaman kanalı (K-1).** "Etkin"den "Tükendi"ye geçiş ve yuvarlama sınırının geçilmesi, o anki sayıyı söylüyor. HUKUK-5 notuna yazıldı. Pilot öncesi değişiklik yok.
- Saldırgan, kodların gruplara (il ya da tür) göre dağıtıldığını varsaymıyor. Kodlar ajans geneli modelleniyor, crw-fb'nin Ö-1 önerisi de böyleydi. Ajans il başına kod verirse, "tükendi" o grubun kayıt sayısını kesin verir (≥ 6). Bu, bir funnel hücresiyle birleşince farkı daraltabilir. Modellenmedi.
- Etkileşimli tarayıcı testi (form tıklama, klavye) koşulamadı. Kareler SSR anlık görüntüsü. Form reddi, gerçek sunucu action çağrısıyla doğrulandı.

## 5. Açık sorular

1. **leed-fb / HUKUK-5:** R-2'deki kanal kabul edilebilir mi? Kapatmak için tek yol "tükendi" durumunu kaldırmak. O zaman ajans tükenen bir kodu, kayıt olamayan kurumdan öğrenir.
2. **leed-fb:** Sınır kararda "≥ 5" idi, 6 yapıldı (§1.2'deki gerekçe ve mutasyon kanıtıyla). Onay?
3. **Ops:** Prod'da `maxUses < 5` olan kod var mı? Varsa pilottan önce iptal edilsin mi (R-1)?

## 6. Sonraki adım

- crw-fb'nin yeniden incelemesi (Kart 1 B-1 kapanışı).
- Açık soru 1 ve 3 için leed-fb kararı.
- se-fb'nin `tests/e2e`'si panelde "Kullanım" sütununa ya da "kullanıldı" metnine bakıyorsa güncellenmeli. Dal içinde `invite-codes-table` / "kullanıldı" arayan bir e2e bulamadım.

**Platform beyanı:** Doğrulama macOS'ta yapıldı (Darwin 27, :3000 dev sunucusu, yerel Postgres). Değişiklik saf TypeScript/React ve JSON. Dosya yolu, süreç, kabuk ya da ekran/DPI'a bağlı kod yolu yok. Bu yüzden Windows ve Linux'ta aynı davranışı bekliyorum. Windows ve Linux'ta koşulmadı, çünkü bu ortamda o platformlar yok.
