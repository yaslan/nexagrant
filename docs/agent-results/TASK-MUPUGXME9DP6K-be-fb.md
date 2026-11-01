# TASK-MUPUGXME9DP6K — FB PİLOT QA Y-1: davetle katılan MEMBER/WRITER "Erişim Reddedildi" görüyor (be-fb)

**Hüküm: TAMAMLANDI — Y-1 kapandı.** Dal `be-fb/qa-y1-invite-landing` (dev'den), push yok, dev'e merge yok (qae-fb incelemesi bekliyor).

## 1. Ne yapıldı
- **Kök neden:** `continue/actions.ts` `workspacePath()` ve `continue/page.tsx` (zaten-üye yolu) ile giriş varsayılanı (`AuthCard.tsx`) her rol için `/default/dashboard`'a gidiyordu; panel `can(role,'evaluate_gates')` istiyor (PIPELINE_MANAGER+). MEMBER/WRITER her seferinde refüze oluyordu.
- **Karar (ürün sorusu QA §6'da açıktı; kartın "rol-uygun erişilebilir ekran" ifadesine göre en küçük çözüm):** yetki kapısı **gevşetilmedi**; iniş ekranı role göre seçiliyor — tek kural `src/lib/landing.ts` `landingPathFor(role, locale, workspace)`:
  - `evaluate_gates` (OWNER/ADMIN/PIPELINE_MANAGER) → panel (`dashboard`/TR `panel`)
  - `view_proposal` (WRITER, MEMBER) → Fırsat boru hattı (`/firsatlar`, `/pipeline`) — rol kapısı yok
  - diğerleri (GUEST_PARTNER) / rolsüz → bildirimler
- **Kabul akışı:** `acceptInvitation` sonucu artık `role` taşıyor (`membershipRoleOf` — gerçek üyelik rolü; önceden üye olan kişide kendi rolü korunur). `acceptInvitationAction` ve "zaten üye" yolu (`continue/page.tsx`) `landingPathFor` ile yönlendiriyor.
- **Giriş varsayılanı:** `AuthCard` istemci tarafı rolü bilemez ve `/default/dashboard`'a gider; `dashboard/page.tsx` artık bilinen ama `evaluate_gates`'i olmayan rolü "Erişim Reddedildi" yerine `landingPathFor` ile yönlendiriyor (döngü yok: iniş ≠ dashboard). Tabloda olmayan eski rol hâlâ refüze görür. Tenantsız oturum yine `/no-workspace`.

## 2. Kanıt
**Kırmızı→yeşil:** `tests/dashboard-tenantless.test.ts` yeni "member … is sent to the screen their role can open" testi eski `dashboard/page.tsx` ile:
```
× a member whose role is too low is sent to the screen their role can open, not refused (QA Y-1)
Tests  1 failed | 3 passed (4)
```
Düzeltmeyle yeşil. Rol başına iniş testi `tests/landing-by-role.test.ts` (OWNER/ADMIN/PM→panel, WRITER/MEMBER→firsatlar, GUEST→bildirimler, en yolları, rolsüz→bildirimler, MEMBER/WRITER `evaluate_gates` yok).

**tsc:** `npx tsc --noEmit` → çıkış 0.

**Tam test (`npm test`, DB :5433 canlı, worktree):**
```
 Test Files  306 passed | 6 skipped (312)
      Tests  4115 passed | 119 skipped (4234)
```
(6 dosya/119 test atlanan kısmı yerel ortamda bilerek atlanan canlı kapılar — hafıza: fonbridge-test-kapilari-yerel-shared-atlama; dokunduğum `invitation-accept.live.test.ts` ve `auth-jwt-membership-refresh.live.test.ts` ilk koşuda çalışıp değişen sözleşmeyi yakaladı, güncellendi ve yeşil.) Beklenen sözleşme değişikliği nedeniyle güncellenen testler: `accept-invite-rebind-failure` (mock'a `role`, TR panel yolu), `auth-jwt-membership-refresh.live` (WRITER → `/tr/default/firsatlar`), `invitation-accept.live` (sonuçta `role`).

**Gerçek uygulama (next dev :3877, Chrome, DEMO_LOGIN, yerel DB'de geçici kullanıcı+davet; iş sonunda silindi, `u=0 i=0`):**
```
member: davet linki → "Daveti kabul et" tıklandı → LANDED /tr/default/firsatlar | h1 "Fırsat & Teklif Boru Hattı" | Erişim Reddedildi yok
writer: aynı → LANDED /tr/default/firsatlar | denied: false
2. koşu (zaten üye): link → /tr/default/firsatlar ; giriş sonrası /tr/default/dashboard → /tr/default/firsatlar ; denied: false (member ve writer)
alice (PIPELINE_MANAGER): giriş → /tr/default/dashboard, /dashboard açık, denied: false
```
Ekran görüntüleri: `docs/agent-results/TASK-MUPUGXME9DP6K-be-fb-ekler/{member,writer}-1-accept-card.png`, `…-2-landed.png` (2-landed 3. koşudan: zaten-üye yolu; ilk koşunun tıklama sonrası aynı ekrandı). Eski hâl: qae-fb `12-accept-u1-landed.png`.

## 3. Değişen dosyalar
`src/lib/landing.ts` (yeni), `src/lib/invitations/accept.ts`, `src/app/[locale]/accept-invite/continue/{actions,page}.ts(x)`, `src/app/[locale]/(app)/[workspace]/dashboard/page.tsx`, `tests/landing-by-role.test.ts` (yeni), `tests/dashboard-tenantless.test.ts`, `tests/accept-invite-rebind-failure.test.ts`, `tests/auth-jwt-membership-refresh.live.test.ts`, `tests/invitation-accept.live.test.ts`, ekler.

## 4. Riskler
- Giriş sonrası MEMBER/WRITER için `/dashboard` → `/firsatlar` ek bir yönlendirme (bir RSC turu); kapı değişmedi.
- İniş = M5 (pipeline) modül kapısına tabi: M5 kapalı bir kiracıda MEMBER "modül kapalı" 🔒 notunu görür (Erişim Reddedildi değil). Pilot kiracılarda M5 açık.
- Pipeline sayfasında rol kapısı yok (mevcut davranış); MEMBER'ın orada ne yapabildiği ayrı konu, burada değişmedi.

## 5. Açık sorular
- Ürün: MEMBER/WRITER için iniş ekranı olarak Fırsatlar yeterli mi, yoksa Çağrılar tercih edilir mi? Tek satırlık değişiklik (`landing.ts`).

## 6. Sonraki adım
qae-fb incelemesi → dev'e merge. Y-2 (TASK-MUPUH481FBGUP) ayrı dalda.

**Platform beyanı:** mac (Darwin) üzerinde doğrulandı (Chrome kanalı, localhost). Dokunulan kod platformdan bağımsız (saf TS, URL yönlendirme; dosya yolu/kabuk/izin yok); Windows/Linux koşulmadı — kod yolunda platforma bağlı parça yok.
