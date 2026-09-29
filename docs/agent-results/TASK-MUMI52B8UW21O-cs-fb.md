# TASK-MUMI52B8UW21O — ADR-0007 karar işleme (cs-fb)

**Kart:** TASK-MUMI52B8UW21O (FB-KAMU-2) · **Tarih:** 29.09.2026 · **Dal:** dev (push yok, 1 Ekim)
**Kaynak:** patron kararları 29.09 · İNCELEME-17 K-1, K-2, K-3 (`docs/agent-results/TASK-MUMH7665CD7DQ-crw-fb.md` §3)

## 1. Ne yapıldı

| Karar                                                                                                                            | Nereye yazıldı                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K-1 → süre dolunca **salt-okunur** (seçenek A); B (otomatik uzatma) ve C (Keşif'e düşme) reddedildi                              | ADR-0007 **madde 5** (yeni) + "Sonuçlar/Ürün" koddaki karşılıklarıyla · ILKADIM-PILOT.md §0 tablosuna "Süre dolunca" satırı + §2.2 paragrafı · ROADMAP Açık karar **#24** + pilot kapısı (f) |
| K-2 → **M6 pilotta açık**; BUSINESS_MODEL ile farkı kamu paketi için not edildi                                                  | ADR-0007 **madde 6** (yeni) · ILKADIM-PILOT.md §2.2 (M6 notu) ve §6.2 (Belediye Ekip "M6 dahil") · ROADMAP #24                                                                               |
| K-3 → madde 2 "yalnız üç yüzey" değil; pilot Ekip'in **bütün modüllerini** açar; davet kodu, karne, radar **öncelikli yüzeyler** | ADR-0007 **madde 2** yeniden yazıldı · ILKADIM-PILOT.md §2.2 · ROADMAP üst not + #24                                                                                                         |

Ek: ROADMAP pilot kapısı (f) durumu "Kodlanıyor" → kod dev'de + İNCELEME-17 DÜZELTME GEREKLİ (B-1). Board'da "belge kısmı cs-fb kartına taşındı" denen be-fb pilot test kiracısı temizliği (TASK-MUMHVNJLRYQU9) (f) satırına bağlandı.

BUSINESS_MODEL notu: kart metni "§5.1'de M6 Ekip için eklenti" diyor. Belgede M6 §5.1 tablosunda **İşletme** satırında, Ekip için eklenti ise **§5.2**'de (€99/ay). Belgelere bu doğru bölüm numaralarıyla yazıldı. BUSINESS_MODEL.md'nin kendisi değiştirilmedi: özel sektör Ekip planı aynı kalıyor, fark yalnız kamu paketinde.

## 2. Kanıt (her iddia koddan)

```
src/lib/billing/pilot.ts:42      export const PILOT_PLAN_ID = 'public-team';
src/lib/billing/pilot.ts:45      export const PILOT_DAYS = 90;
src/lib/billing/catalog.ts:505-508  planId: 'public-team', name: 'Belediye Ekip', basePlanId: 'pro', seats: 6
src/lib/billing/catalog.ts:436   (pro) moduleIds: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M8']
src/lib/billing/catalog.ts:417   (free/Discover) moduleIds: ['M3', 'M5']   → C seçeneğinde M2 kapanır
docs/BUSINESS_MODEL.md §5.1      Ekip "+ M1, M4, M8"; İşletme "+ M6, M9, M10, M11"
docs/BUSINESS_MODEL.md §5.2      "| M6 Evaluator Lens | €99 | Ekip |"
```

- **Salt-okunur:** `requireTenantAction` → `PilotExpiredError`; `assertTenantWritable` şurada kullanılıyor: `src/lib/tenant.ts`, `(app)/[workspace]/pipeline/actions.ts`, `src/lib/billing/pilot.ts` (grep).
- **Bant:** `src/components/PilotBanner.tsx` süresi dolunca `border-amber-300 bg-amber-50` + `messages/tr.json:2411` "Verileriniz korunuyor ve görüntülenebilir; yeni kayıt ve düzenleme kapalı." Patronun "turuncu" dediği bant, kodda Tailwind **amber**. Belgeye "turuncu (amber)" yazıldı, kod değiştirilmedi.
- **Satın alma kapalı:** `src/app/api/billing/checkout/route.ts:101` `getPilotState(tenantId).kind !== 'none'` → 403 `PILOT_CHECKOUT_CLOSED`. Pilot sürerken de bittikten sonra da geçerli.
- **Uzatma 90'ar gün:** `pilot.ts:198-202` `from = max(now, endsAt)`; `endsAt = pilotEndsAt(from, PILOT_DAYS)`; audit `billing.pilot.extended`; panel kutusu `admin/billing/plans/pilot-panel.tsx` `data-testid="pilot-extend"`.
- **Üç yüzey modül kapısına bağlı değil:** `grep -rln "moduleGate\|assertModuleAccess"` → `src/app/[locale]/fon-hazirlik`, `src/app/[locale]/belediye-cagrilari`, `src/lib/agency`, `src/app/[locale]/(app)/ajans`: **0 eşleşme**.
- **B-1 açık:** `assertTenantWritable` / `PilotExpired` M11 portal yolunda yok (grep 0). Commit'lenmiş düzeltme yok (`git log --grep=B-1` yalnız İNCELEME-17 raporunu buluyor). Not: rapor yazılırken çalışma ağacında be-fb'nin commit'lenmemiş değişiklikleri vardı (`src/modules/m11/server/actions.ts`, `pilot.ts` advisory lock / `stale`). Onlar commit'lenince ADR ve ROADMAP'teki "B-1 açık" satırı güncellenmeli. Bu değişiklikler uzatma kuralını (+90 gün) değiştirmiyor.
- `npx prettier --write` üç belgede temiz.

## 3. Değişen dosyalar

- `docs/adr/ADR-0007-ilkadim-free-pilot.md`
- `docs/kamu/ILKADIM-PILOT.md`
- `docs/ROADMAP.md`
- `docs/agent-results/TASK-MUMI52B8UW21O-cs-fb.md` (bu rapor)

Kaynak kod değişmedi.

## 4. Riskler

- ADR madde 5 "yazma sunucuda reddedilir" diyor. Bir yolda (M11 portalı, B-1) bu kural henüz uygulanmıyor. ADR'de ve ROADMAP (f)'de açıkça yazıldı. İlk pilot en erken 27.12.2026'da bitiyor.
- Kamu Belediye Ekip = pro modülleri (M6 dahil). Özel sektör Ekip ≠ pro'nun M6'sı. Bu fark belgede bilerek yazıldı. Biri BUSINESS_MODEL'i "tek gerçek" sanarsa teklifte M6'yı düşürebilir. ILKADIM-PILOT §6.2 satırı bunu önlüyor.

## 5. Açık sorular

- Yok (üç karar patron tarafından verildi). be-fb raporundaki açık soru §6-1 ve §6-2 bu kararlarla kapandı.

## 6. Sonraki adım

- be-fb: B-1 düzeltmesi commit'lenince ADR-0007 "Açık iş" satırı ve ROADMAP (f) durum hücresi güncellenir (küçük belge işi).
- be-fb: TASK-MUMHVNJLRYQU9 test kiracısı temizliği.

**Platform beyanı:** Doğrulama mac (darwin) üzerinde yapıldı. İş yalnız belge; platforma bağlı bir kod yolu yok. Windows ve Linux'ta koşulacak bir şey yok. Pilot bitiş hesabı `Intl` ile Europe/Istanbul okuyor, işletim sistemi saat dilimine bağlı değil (`pilot.ts` `istanbulOffsetMinutes`).
