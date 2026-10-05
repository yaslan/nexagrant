# TASK-MUMJ9M19CZY56 — The pilot no longer sees "Planı Yükselt" (İNCELEME-18 K-4b) · fe-fb

## 1) Ne yapıldı
- **Kartın işi (a50f53ac):** Pilot kiracıda (süresi süren ya da bitmiş) plana dahil olmayan modül kartlarında (M7, M9, M10, M11) amber "Planı Yükselt" bağlantısı artık yok. Yerine bağlantısız düz metin geliyor: **"Pilotta kapalı · kurum paketinde açılır"** (EN: "Off during the pilot · available with an institution plan"). Ödeyen kiracıda bağlantı olduğu gibi kaldı; metni `settings.modules.upgradeCta` anahtarına taşındı. Başlıktaki **"Planı Değiştir →"** ve plan dışında açık kalmış modülün **"Kapat"** düğmesi değişmedi (patron kararı).
- **Build düzeltmesi, B-5 (4627049d, ayrı commit):** Dev dalında `pnpm build` bu işten önce de kırmızıydı. Sebep: 587a50e0 (TASK-MULQLL2T8ZJX4) `application/client.tsx` dosyasına gömülü bir metin ekledi ve i18n ratchet'i 38 → 39 oldu (İNCELEME-19 B-5). Bu metni kimin eklediğini literal listelerinin farkından buldum: "Bağlantı oluşturulamadı. Sayfayı yenileyip tekrar deneyin." Onu `applicationPartA.portalLinkFailed` (tr/en) anahtarına taşıdım. Davranış aynı kaldı, **baseline yükseltilmedi**. Board'da B-5 için ayrı bir kart yoktu. Sahibi başka bir düzeltme yazarsa bu commit tek başına geri alınabilir.

## 2) Kanıt
**Test:** `tests/modules-pilot-upgrade-cta.test.tsx`, jsdom + gerçek tr/en katalogları, 4/4:
```
✓ pilot: no "Planı Yükselt" anywhere, locked cards say "Pilotta kapalı", header link stays
✓ expired pilot: still no upgrade offer
✓ paying tenant: locked cards keep the "Planı Yükselt" link to billing
✓ English catalog carries both strings
```
**Mutasyon:** `plan?.pilot` koşulu `false` yapıldı → `Tests 3 failed | 1 passed`. Dosya yedekten geri yüklendi (git checkout/stash kullanılmadı).
**Kapılar:**
```
pnpm typecheck            → exit 0
eslint (değişen 3 dosya)  → exit 0
pnpm vitest run           → Test Files 215 passed | 2 skipped (217); Tests 2483 passed | 8 skipped (2491)
pnpm i18n:check           → Literals found: 325 in 37 file(s) / Baseline allows: 325 → ✅ i18n check passed
pnpm build (temiz worktree @4627049d, env -u NODE_ENV) → ✅ i18n check passed · ✓ Compiled successfully · BUILD_EXIT=0
```
(Build'de tek bir uyarı var: `src/instrumentation.ts:20` `process.exit` Edge uyarısı. Önceden vardı, bu işle ilgisi yok.)

**Gerçek tarayıcı:** Headless Chromium, :3000'deki `next dev` bu ağaçtan çalışıyor. Hook onayı istedi, kullanıcı onay verdi (`MURAT_LIVE_OK=1`). Her kiracı için `/tr/kayit` formu gerçekten dolduruldu. Plan satırını gerçek fonksiyon kurdu: `grantPilot` ya da Stripe ACTIVE pro satırı. Sonra `/tr/<ws>/ayarlar/moduller` açıldı ve gerçek tıklamalar yapıldı. Koşu bitince iki test kiracısı ve kullanıcısı DB'den silindi (`tenantLeft:0, userLeft:0`).

| | Pilot (`public-team`, TRIALING, pilot) | Ödeyen Pro |
|---|---|---|
| Başlık | `Belediye Ekip \| PİLOT \| Son gün: 27 Aralık 2026 · yenilenmez` | `Pro` |
| Sayfadaki "Planı Yükselt" bağlantısı | **0** | 4 |
| "Pilotta kapalı…" metni | **4** (M7/M9/M10/M11, kartta bağlantı 0) | 0 |
| Kart tıklaması | Metne tıklandı → URL değişmedi (`true`) | M7 "Planı Yükselt" → `/tr/default/settings/billing` |
| Başlıktaki "Planı Değiştir" (1 adet) | tıklandı → `/tr/default/settings/billing` | tıklandı → `/tr/default/settings/billing` |
| 390 px yatay taşma | 0 px | 0 px |

Kareler (`docs/agent-results/TASK-MUMJ9M19CZY56-screenshots/`): `sonra-{pilot,pro}-ust.png` (başlık), `sonra-{pilot,pro}-kartlar.png` (M7–M10 kartları), `sonra-{pilot,pro}-mobil.png` (390 px), `sonra-{pilot,pro}-planidegistir-click.png` (tıklamadan sonra açılan fatura sayfası).
**Önce:** Pilot kartlarının eski hâli `docs/agent-results/TASK-MUMH6W5I1W9WC-screenshots/sonra-pilot.png` karesinde görülüyor (kilitli kartta amber "Planı Yükselt").

**Erişilebilirlik:** Yeni metin odaklanamayan bir `<span>`. Tıklanabilir görünen ama iş yapmayan bir öğe kalmadı. Rengi `text-muted`, bu sayfadaki öteki yardımcı metinlerle aynı token.

## 3) Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/settings/modules/client.tsx` (a50f53ac)
- `messages/tr.json`, `messages/en.json` (`settings.modules.pilotLocked`, `settings.modules.upgradeCta`, `applicationPartA.portalLinkFailed`)
- `tests/modules-pilot-upgrade-cta.test.tsx` (yeni)
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx` (4627049d, B-5)

## 4) Riskler
- B-5 düzeltmesi devop-fb'nin dosyasında (TASK-MULQLL2T8ZJX4, review'da). Onlar aynı satırı başka biçimde düzeltirse çakışabilir. Commit ayrı ve 5 satır.
- Paylaşılan ağaç: be-fb aynı anda `admin/*/actions.ts` üzerinde çalışıyordu. Bir kez `git stash` / `pop` yaptım, onların dosyaları da çıkıp geri geldi, pop temiz uygulandı. Sonrasında stash kullanmadım. Commit'ler yalnız `git commit -- <yollar>` ile yapıldı.

## 5) Açık sorular
- Kartın solunda kırmızı "Plan yükseltmesi gerektirir" yazısı hâlâ duruyor. Pilotta yanında "Pilotta kapalı · kurum paketinde açılır" da çıkıyor. İkisi çelişmiyor, ama pilotta soldaki metin de "kurum paketinde açılır" anlamına çekilebilir. Kapsam dışı bıraktım, karar lider/patronda.

## 6) Sonraki adım
- crw-fb incelemesi: K-4b ve B-5 birlikte. Push 1 Ekim'de (bu işte push yok).

**Platform beyanı:** Yalnız **macOS**'ta doğrulandı (Darwin 27, headless Chromium 1243, Node 26). Değişen kod platforma bağlı değil: süreç, dosya yolu, kabuk ya da kısayol yok. Değişiklik yalnız React render dalı ve JSON kataloglarında. Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız mac var. Kodda platforma bağlı bir dal olmadığı için farklı bir davranış beklenmiyor.
