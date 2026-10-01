---
sözleşme: 3
görev: TASK-MUPUHBAE811KP
kod: TASK-MUPUHBAE811KP
ajan: qae-fb
motor: claude
tip: ölçüm
okur: ekip
hüküm: Kısmen bitti: cs-fb/y3-belge yerel dev'e birleştirildi (fb91c767; pazartesi-duyuru zaten dev'deydi). tsc, lint, build, migrasyon ×2 ve rls:verify yeşil. vitest 33 kırmızı ile bitti: 24'ü 268500d2'den geliyor (dalın düzeltme commit'i 82d8b63c dev'e alınmamış), 9'u 17841137'den (Y-4, bilinen). Belge merge'i hiçbir kırmızıya katkı yapmıyor. Push yok.
platform: mac (darwin 27, Homebrew PG16 16.15 izole küme :55433, Node/pnpm 11.25). Yalnız belge birleştirildi; platforma bağlı kod yolu yok. Windows/Linux koşulmadı (bu makinede yok). CI ubuntu'da aynı takımı koşar, 82d8b63c alınmadan aynı 33 kırmızıyı vermesi beklenir.
sürüm: 1
tarih: 2026-10-01T20:51:24.789Z
---

# FB entegrasyon merge2 — Y-3 destek belgeleri yerel dev'de + tam test takımı

**Hüküm:** KISMEN — belge merge'i temiz ve yerel dev'de. Tam takım KIRMIZI (33). Kırmızıların hiçbiri bu görevin merge'inden gelmiyor. · **Tip:** FB entegrasyon / merge + regresyon · **Platform:** mac

## 1. Ne yapıldı
- Ana checkout `devop-fb/supabase-golive` dalında, ona dokunulmadı. Ayrı worktree açıldı: `FONBRIDGE-wt-qaefb-merge2`, dev @ 268500d2.
- **Onay doğrulaması:** Ana checkout'taki `docs/agent-results/TASK-MUPUHBAE811KP-crw-fb.md` (izlenmeyen, 22:37) crw-fb'nin incelemesi DEĞİL. İçinde başka bir merge ajanının "İnceleme bekliyor / dosya yok" raporu var, yani üzerine yazılmış. crw-fb'nin gerçek ONAY'ı AgentSpace defterinde duruyor: `.agentspace/reports/TASK-MUPUHBAE811KP-crw-fb/surumler/1.md` (22:31, hüküm "Bitti: ONAY", bloke eden bulgu yok, Ö-1..Ö-3 öneri). Merge bu ONAY'a dayanarak yapıldı.
- `git merge --no-ff cs-fb/y3-belge` → **fb91c767**. Çakışma yok. Yalnız 3 belge değişti: `docs/beta/DESTEK-SABLONLARI.md`, `docs/beta/SSS-PILOT.md`, `docs/destek/RUNBOOK-YANLIS-UYE.md`.
- `cs-fb/pazartesi-duyuru` (9f6b6b18) **zaten dev'de** (ab7987e7 ile girmiş). `git merge` → "Already up to date". Yeni commit yok.
- **Karar uyumu:** Diff, son kararlarla tutarlı. Yetkili kişi ve KVKK/hukuk bildirimi patronda (R-1/R-2). Pazartesi 15:00 ve 30 dk duyuru belgesinde zaten var ("45 dk → **30 dk**" tablosu). Anlam çakışması yok.
- Kapılar temiz bir PG16 kümesinde koşuldu: CI sırası, `.env` yüklenmeden, değişkenler elle export edildi. **Canlı Supabase'e hiçbir şey koşulmadı.** DATABASE_URL=localhost:55433.

## 2. Kanıt
```
prisma db push            → in sync
db:rls-role               → fabrika_app connects as fabrika_app
apply-migrations.sh #1    → exit=0 · 41 files applied as fabrika
apply-migrations.sh #2    → exit=0 · 41 files applied as fabrika   (idempotent)
db:rls / db:seed          → Policies 28 → 112 · seed complete
rls:verify                → exit=0 · ✅ 47 kiracıya özel tabloda politika yerinde, izolasyon fabrika_app ile ölçüldü
npx tsc --noEmit          → exit=0
pnpm lint                 → exit=0 · 0 errors, 8 warnings
pnpm build                → exit=0 · ✓ Compiled successfully · 33/33 static pages
CI=true vitest run        → exit=1
   Test Files  5 failed | 310 passed | 2 skipped (317)
        Tests  33 failed | 4183 passed | 54 skipped (4270)
check-live-skips          → exit=0 · 51 live files, 456 live tests passed, 44 allowed skip(s)
```
**SKIP dökümü (54):**
- 44 izinli canlı atlama: S3 yok (`evidence-confirm-store-faults.live` 22, `evidence-upload-s3.live` 21) ve OpenAI anahtarı yok (`k1-embeddings.live` 1).
- 10 canlı olmayan atlama: adapters 2, k1-daily-calls 4, sedia-adapter 2, user-erasure-object-store 2.
- S3 suite'leri ölçülmedi. Bu merge onlara dokunmuyor.

### Bisect (tam takım, aynı DB, her commit'te)
| dev commit | vitest kırmızı |
|---|---|
| 35ea7ce7 (Y-3 sonrası) | **0** (4200 geçti) |
| 17841137 Merge fe-fb/qa-y4-org-profile | **9** ← ilk kırmızı |
| ab7987e7 / ff177df7 / 1d2c54f3 / 5a1e3db4 | 9 (değişmedi) |
| 268500d2 Merge be-fb/auth-membership-scope | **33** ← +24 |
| fb91c767 (bu merge, yalnız belge) | 33 (değişmedi) |
| be-fb/auth-membership-scope ucu **82d8b63c** | **9** (auth kaynaklı 24 kırmızı bu commit'te gidiyor) |

**B-1 (YÜKSEK, CI'ı kırar): dev'e auth dalının yarım hali alınmış.**
- 268500d2 merge'i dalın `ece17afe` noktasını birleştirmiş. Dalda ondan sonra bir düzeltme commit'i var ve dev'de yok: `82d8b63c test(auth): … auth-callbacks birim testi withSystemScope'u mock'lar … (23 kırmızı giderildi); yeni live testte teardown where requireId ile`.
- Kırmızılar:
  - `src/lib/auth-callbacks.test.ts`: 23 test (ör. `expected "vi.fn()" to be called 1 times, but got 0 times`, satır 108).
  - `tests/teardown-where-guard.test.ts`: 1 test, `tests/auth-jwt-membership-app-role.live.test.ts:159 userId: ids.userU` filtresiz where olarak yakalanıyor.
- Tekrar üretme: dev @ 268500d2'de `CI=true pnpm exec vitest run` koş.
- Önerilen düzeltme (YAPILMADI): `git merge --no-ff be-fb/auth-membership-scope` ile 82d8b63c'yi dev'e al. Dal ucunda takım 9 kırmızıya iniyor; kalan 9'un hepsi Y-4 kaynaklı.
- `origin/dev` = d18c0ac1. 268500d2 henüz push edilmemiş. Push'tan önce bu düzeltilmeli.

**B-2 (ORTA, bilinen): Y-4 (17841137) 9 kırmızı getiriyor.**
- `tests/settings-profile-update.test.ts` 8/8 kırmızı: `{ ok:false, error:'failed' }` dönüyor, `{ ok:true }` bekleniyor.
- `tests/server-action-rbac-guard.test.ts` G6 kırmızı: guard artık `updateTenantProvince` yerine `updateTenantProfile`'ı buluyor. Rapor ettiği sorun: "writes before any role check covers them: tx.tenantProfile.update (line 62)…". Bu yalnız test hedefleme hatası olmayabilir. Rol kontrolünün yazmadan sonra yapılıp yapılmadığı incelenmeli.
- `tests/e2e-profile-save.spec.ts`: Playwright spec'i `tests/` altında duruyor, vitest exclude'u yalnız `tests/e2e/**` olduğu için vitest onu topluyor ("did not expect test.describe() to be called here").
- Önceki entegrasyon raporu (TASK-MUPUHIIKSQAPN-qae-fb) ile aynı tablo. Hâlâ açık.

## 3. Değişen dosyalar
- dev'e merge fb91c767: yukarıdaki 3 belge.
- Bu rapor. Kod değiştirilmedi, test gevşetilmedi.

## 4. Riskler
- dev şu an CI'da kırmızı (33). B-1 düzeltilmeden push edilirse `origin/dev` CI'ı kırılır.
- crw-fb onay dosyası ana checkout'ta başka bir raporla ezilmiş durumda. "Dosya ONAY mı?" diye bakan otomatik bir kapı yanlış karar verir. Doğru içerik defterde (sürüm 1).
- Ana checkout'ta bu raporun izlenmeyen bir kopyası kalıyor, çünkü görev bu yolu istiyor. Aynı rapor dev'de commit'li. Ana checkout'un dalı dev'i çektiğinde bu kopya merge'i bloklayabilir. O durumda izlenmeyen kopya silinmeli.
- Ortam notu: worktree'de symlink'li `node_modules` ile `next build` Turbopack panic veriyor ("Symlink … points out of the filesystem root"). Build için `pnpm install --offline` ve `db:generate` yapıldı. Kod sorunu değil.

## 5. Açık sorular
- 82d8b63c'yi dev'e kim alacak: lider mi, be-fb mi?
- G6 bulgusu (B-2) gerçek bir RBAC sırası sorunu mu? `settings/profile/actions.ts#updateTenantProfile` için be-fb veya crw incelemesi gerekiyor.

## 6. Sonraki adım
1. dev'e `be-fb/auth-membership-scope` (82d8b63c) merge edilsin, takım yeniden koşulsun. Beklenen sonuç 9 kırmızı.
2. Y-4'ün 9 kırmızısı için ayrı kart açılsın: settings-profile test ortamı, G6 RBAC, spec'in `tests/e2e/` altına taşınması.
3. crw-fb.md dosyası defterdeki ONAY sürümüyle geri yüklensin.
4. Bunlardan sonra push.

Merge SHA: **fb91c767**. Worktree raporun commit'inden sonra kaldırılır.
