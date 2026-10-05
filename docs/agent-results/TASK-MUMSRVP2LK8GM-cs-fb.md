# TASK-MUMSRVP2LK8GM — FB BELGE DÜZELTME (İNCELEME-25 B-1..B-8) — cs-fb

**Sprint:** FB-KAMU-2 · **Dal:** dev · **Kod tabanı:** `e68ea1e2` (son kod değişikliği `e4fb8d71` öncesi; `e4fb8d71..e68ea1e2` yalnız `docs/agent-results`) · **Tarih:** 29.09.2026
**Kaynak:** `docs/agent-results/TASK-MUMO3A8GOMJHY-fe-fb.md` (B-1..B-8 + "Ek — 77f557e7 sonrası").

## 1. Ne yapıldı

| Bulgu | Düzeltme | Dosya |
| --- | --- | --- |
| **B-1** | Pilotta M7/M9/M10/M11 kartlarında düğme yok; kartta "Pilotta kapalı · kurum paketinde açılır" yazar; başlıkta "Planı Değiştir →" bağlantısı durur ve yalnız bilgi sayfasına gider. Kanıt satırı `a50f53ac`'e bağlandı. | `docs/kamu/ILKADIM-PILOT.md:57,59` |
| **B-2** (Sentry) | Envanter §19a PostHog'a indirildi. Sentry sütunu ve "karar çelişkisi" paragrafı çıkarıldı, yerine "Sentry kaldırıldı (`89eab729`)" paragrafı geldi. §21'de Sentry satırı "Alıcı değil" yapıldı. §22 madde 7 güncellendi. Hukuk paketi §5 madde 3'teki Sentry satırı ve kanıt satırı güncellendi. | `processing-register.md` §19a, §21, §22; `HUKUK-SORULARI` §5 |
| **B-2 ek** (kapsam genişletme) | Belediyeye gidecek `docs/kamu/VERI-YERLESIMI.md`'de aynı eski bilgi vardı: "Hata kayıtları … DSN patron onayıyla girilirse … gider" ve "Google / Microsoft ile giriş (yalnız bu yolu seçerseniz)". İkisi de koda göre düzeltildi (`89eab729`, `acc35b07`). | `docs/kamu/VERI-YERLESIMI.md:22,24` |
| **B-3** | §8 madde 6 yeniden yazıldı. **Ölçüt:** değişiklik, kodun `dev` dalına düştüğü commit ile işlenir; kartın pano durumu ölçüt değildir. Microsoft/Outlook/SSO (1.3), Resend (1.4), Sentry (1.5) bu ölçüte göre listelendi. Inngest kodu hâlâ `dev`'de (`src/app/api/inngest/route.ts`); envanter onu bugünkü haliyle anlatmaya devam ediyor. §5'teki "Kod değişikliği sürüyor" cümlesi de buna göre değişti. | `HUKUK-SORULARI` §5, §8 |
| **B-4** | `oauth-registration.ts:236/239` → `:225/:228` (3 yer), İlkadım `:251` → `:248`, `routes.ts:115-116` → `:114-115`. | `HUKUK-SORULARI:92,386,387`; `ILKADIM-PILOT.md:59` |
| **B-5** | §11 şema satırları `1195-1198` / `1195, 1199` → `1328` (`accessToken`), `1332` (`refreshToken`), yorum `1328-1331`. | `processing-register.md:160,162` |
| **B-6** | §1'den "E-posta/parola girişinde üçüncü taraf yok" çıkarıldı. Yerine: parola ile giriş yok, yalnız Google OAuth, `User`'da parola kolonu yok, `Credentials` yalnız yerel demo. Aynı bölümde "parola özeti (argon2)" (veri kategorisi) ve "argon2 parola özeti" (tedbir) da koda uymuyordu; ikisi de çıkarıldı. | `processing-register.md` §1 |
| **B-7** | SSO kanıtı `sso.ts:49-59` → yazma `sso.ts:80` (`prisma.tenant.update`, `9a9aa6ef`). | `HUKUK-SORULARI:54` |
| **B-8** | TASK-MUMLFLB2OPLY3, TASK-MUMMIHYY2F4KB, TASK-MUML0QZAZ5M80 panoda `done`: hukuk paketi, SECURITY_COMPLIANCE:95 ve ROADMAP:44-50'de "inceleme bekliyor" → `done`. Pakette Sentry/Resend satırlarındaki kart durumu ibaresi kaldırıldı (bu kartlar sprint listesinde görünmüyor; ölçüt artık commit). | `HUKUK-SORULARI`, `SECURITY_COMPLIANCE.md`, `ROADMAP.md` |
| **Sürüm** | Hukuk paketi **1.5** + değişiklik notu (a)-(d), başlığa "1.5 eki: TASK-MUMSRVP2LK8GM". | `HUKUK-SORULARI:3,10` |

Ayrıca §2.1 kanıtındaki `Tenant`'ı güncelleyen yerler listesine dosya:satır eklendi (`agency/actions.ts:59`, `agency/cobrand-store.ts:113`), çünkü "SSO alanı" artık yok.

## 2. Kanıt

Koddan doğrulama (hepsi `git show HEAD:` / `git grep … HEAD`, çalışma ağacı değil):
```
# B-1
client.tsx:314-318  <Link href=…/settings/billing> … Planı Değiştir →
client.tsx:574-576  {isPlanLocked && !isActive && plan?.pilot ? … {t('pilotLocked')}
messages/tr.json:603 "pilotLocked": "Pilotta kapalı · kurum paketinde açılır"
git log -1 a50f53ac → fix(modules): a pilot's locked module cards say "Pilotta kapalı …"; header "Planı Değiştir" stays (TASK-MUMJ9M19CZY56)
# B-2
git grep -il sentry HEAD -- src .env.example package.json prisma
  → yalnız prisma/migrations/{add-feedback.sql, rename-feedback-alert-columns*.sql} (eski kolon adı); src/.env.example/package.json boş
git log -1 89eab729 → feat(observability): remove the Sentry forwarder — errors are tracked in SystemAlert only (TASK-MUMLEUIQWSI59)
git grep -l -i inngest HEAD -- src → src/app/api/inngest/route.ts, src/instrumentation.ts, … (Inngest hâlâ kodda)
# B-4
oauth-registration.ts: 225 name: `${…} Organization` · 228 orgType: 'SME' · 248 role: 'TENANT_OWNER'
routes.ts: 114 case 'settingsModules': · 115 return … /ayarlar/moduller
# B-5
schema.prisma: 1326 provider // 'google' | 'outlook' | 'ics' · 1328 accessToken · 1332 refreshToken
# B-6
schema.prisma model User: password/argon kolonu yok; git grep -l -i argon HEAD -- src package.json → boş
auth.ts:309-312 "this provider checks no password, so it is only registered when demo sign-in is on"
# B-7
git show 9a9aa6ef:src/lib/sso.ts | sed -n 80p → await prisma.tenant.update({
# B-8
list_tasks FB-KAMU-2: MUMLFLB2OPLY3 done · MUMMIHYY2F4KB done · MUML0QZAZ5M80 done
```

Düzeltme sonrası grep (çalışma ağacı):
```
grep -c "Planı Yükselt" docs/kamu/ILKADIM-PILOT.md                      → 0
grep -n "SENTRY_DSN\|bugün kapalı" processing-register.md VERI-YERLESIMI.md
  → yalnız :340 (kaldırma paragrafındaki geçmiş anlatımı) ve :402 PostHog "bugün kapalı" (doğru)
grep -on "oauth-registration.ts:[0-9]*" HUKUK ILKADIM → 225, 228, 225, 248
grep -on "satır 13…" processing-register.md → 160: satır 1328 · 162: satır 1328-1331
grep -c "parola özeti\|E-posta/parola" processing-register.md → 0
grep -c "inceleme bekliyor" HUKUK-SORULARI-2026-09.md          → 0
§19a tablo satırları: 12 satırın hepsi 2 sütun (awk -F'|' NF=4)
git diff -w --stat → 6 dosya, 46+/46−
```

## 3. Değişen dosyalar
- `docs/kamu/ILKADIM-PILOT.md`
- `docs/kamu/VERI-YERLESIMI.md`
- `docs/legal/HUKUK-SORULARI-2026-09.md` (sürüm 1.5)
- `docs/legal/processing-register.md`
- `docs/SECURITY_COMPLIANCE.md`
- `docs/ROADMAP.md`
- `docs/agent-results/TASK-MUMSRVP2LK8GM-cs-fb.md` (bu rapor)

Kod dosyasına dokunulmadı. `prisma/schema.prisma:1326-1327`'deki `'outlook'` yorumu ayrı iş (fe-fb/be-fb).

## 4. Riskler
- **Kapsam genişletme:** `VERI-YERLESIMI.md` (kamu) ve envanter §1'deki argon2 satırları kartta adıyla geçmiyordu. İkisi de belediyeye/hukukçuya gidecek metinde koda aykırı bilgi taşıyordu, bu yüzden düzeltildi. İnceleyen bunu ayrıca kontrol etmeli.
- §19a'dan Sentry sütunu (maskeleme ayrıntısı, `scrubErrorText`) çıkarıldı. Bu bilgi git geçmişinde kalıyor (`89eab729` öncesi sürüm). Sentry yeniden gündeme gelirse yeni bir madde gerekir (§19 notu zaten bunu söylüyor).
- `ILKADIM-PILOT.md:157` R3 satırı yurt dışı aktarım için Resend'i hâlâ anıyor ama "kaldırıldı, `fe9fd31c`" diyor; doğru, dokunulmadı.
- Sentry (TASK-MUMLEUIQWSI59), Resend (TASK-MUMLF57HOYFSB) ve Inngest (TASK-MUMLFDTNQ53VJ) kartları FB-KAMU-2 listesinde yok; pano durumları görülemedi. Yeni ölçüte göre bu önemli değil.

## 5. Açık sorular
- Yok. B-3 ölçütü lider kararıyla verildi ve §8 madde 6'ya yazıldı.

## 6. Sonraki adım
- İnceleme (crw-fb / fe-fb): 6 belge dosyası, özellikle §19a yeniden yapısı ve `VERI-YERLESIMI.md` iki satırı.
- fe-fb/be-fb: `prisma/schema.prisma:1326-1327` `'outlook'` yorumu (kod).
- Inngest kodu `dev`'den düştüğünde: envanter §6/§17/§18 dosya yolları (`src/lib/inngest/jobs/...`) ve hukuk paketi §5 Inngest satırı aynı ölçütle güncellenir.

**Platform beyanı:** yalnız belge. macOS'ta (darwin, zsh) `git show`/`git grep` ve `/usr/bin/grep` ile doğrulandı. Çalıştırılan ya da değiştirilen kod yolu yok; iddialar (OAuth sağlayıcı listesi, modül kartı metni, şema satırları) platforma bağlı değil. Windows/Linux'ta koşulmadı çünkü koşulacak bir şey yok.
