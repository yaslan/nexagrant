---
kart: TASK-MVBE4DG89QJMS
kod: FO-11
ajan: fe-fb
sprint: FB-GAP-2
hüküm: BAŞARILI (PR #112 açık, merge edilmedi)
platform: mac (macOS, Chrome); Windows/Linux koşulmadı, platforma bağlı kod yolu yok
dal: fe-fb/fo11-m2-m4-m11-i18n (worktree /Users/macbook/alan/FONBRIDGE-fo11, origin/dev tabanlı)
pr: https://github.com/yaslan/fonbridge/pull/112
commit: cda13acc
---

# FO-11: M4 başlığındaki "(M3)" düzeltildi, M2 ve M11 metinleri i18n'e taşındı

## Ne yapıldı
1. **M4 İlişkiler** (`src/app/[locale]/(app)/[workspace]/relationships/page.tsx`)
   - Üç `isTr ?` üçlüsü `getTranslations({ locale, namespace: 'Relationships.page' })` ile değiştirildi.
   - Başlık iki dilde de aynı modül kodunu taşıyor: **"Odak Noktası CRM (M4)" / "Focal Point CRM (M4)"**. "(M3)" kalmadı.
   - Aynı dosyadaki sabit `{days}d stale`, `{days}d ago` ve boş durum metni de taşındı. TR'de "90 gündür bayat" ve "5 gün önce" görünüyor.
2. **M2 ConceptNoteEditor** (`src/modules/m2/ui/ConceptNoteEditor.tsx`)
   - Başlık, düğmeler, bölüm etiketinin çerçevesi ("(en fazla N kelime)"), placeholder ve kelime sayacı `ConceptNote.editor.*` altına taşındı.
   - Üç `alert()` (taslak üret, kaydet, dışa aktar) kaldırıldı. Yerine sayfa içi bant geldi: başarıda `role="status"` (zümrüt), hatada `role="alert"` (gül). Desen pipeline detay bantlarıyla aynı. `data-testid`: `concept-note-result` / `concept-note-error`.
3. **M2 sayfası** (`opportunities/[id]/m2/page.tsx`)
   - "Concept Note Modülü Kapalı" bloğu **silindi, çünkü ölü kod**. Gerekçe: `moduleGate('M2')` → `checkModuleAccessForTenant` satır yoksa `state?.status ?? 'OFF'` alıyor. Ardından `canAccessStatus('OFF')` → `MODULE_OFF` ile sayfa zaten kilit ekranını döndürüyor. Bu yüzden `!m2State || status==='OFF'` dalına hiçbir zaman girilmiyordu. Fazladan yapılan `moduleState` sorgusu da kalktı.
   - "No template found…" metni `t('noTemplate')` oldu.
4. **M11 Başvuru** (`opportunities/[id]/application/client.tsx`)
   - 38 sabit metnin hepsi mevcut `applicationPartA` namespace'ine taşındı: başlık bandı, özet kartları, 4 sekme, portal kartı, bütçe formu ve tablosu, Gantt, kontrol listesi.
   - EN başlık: "Part A & Part B Application Production Panel". `<strong>` içeren iki cümlede `t.rich` kullanıldı.
5. **Ratchet** (`i18n-baseline.json`): üç kayıt silindi: application/client 38 → 0, m2/page 3 → 0, ConceptNoteEditor 1 → 0. Büyüyen sayaç yok. `--update-baseline` kullanılmadı. `admin/blog/client.tsx 21 → 19` düşüşü dev'den geliyor, bana ait değil; dokunulmadı.
6. **Testler**
   - Yeni dosya: `tests/concept-note-editor-notice.test.tsx` (4 test). TR çerçeve metnini, üret→status bandını, hata→alert bandını ve kaydet→status bandını sınıyor; `alert` hiç çağrılmamalı. **Mutant:** HEAD'deki eski editörle 4/4 kırmızı.
   - `tests/e2e/module-entry-points.spec.ts` başlık regex'leri gevşetilmedi, **sıkılaştırıldı**: M4 `/Odak Noktası CRM \(M4\)/`, M2 `/Konsept Notu Editörü/` (TR oturum; eski `/Concept Note/` artık TR'de görünmüyor), M11 `/Part A & Part B Başvuru Üretim Paneli/`.
7. **Prompt:** taslak üretim prompt'una dokunulmadı (`src/lib/ai/prompts/**` değişmedi). Bu yüzden `tests/prompt-snapshots.test.ts` güncellenmedi; süitte yeşil.

### M2 bölüm etiketlerinin kaynağı ve karar
"Executive Summary", "Objectives" gibi bölüm adları **şablon verisinden** geliyor: `ConceptTemplate.schema.sections[].labelKey`, seed'de `prisma/seed.ts:375`. Aynı `labelKey` `concept-notes/[id]/editor.tsx`'te ve DOCX dışa aktarımında (`api/concept-notes/[id]/export/route.ts:93`) da kullanılıyor.

Karar `karar_sor` ile soruldu: **K-569545**, `varsayilanla`, öneri ve varsayılan **A**. Bu PR'da veri olduğu gibi gösteriliyor; çeviri kararı ayrı kartta, labelKey'i kullanan bütün yerlerle birlikte ele alınacak. Şemaya ve seed'e dokunulmadı. Yalnız etiketin çevresindeki çerçeve metni çevrildi. Kullanıcı B'yi (`ConceptNote.sections.<key>` + fallback) ya da C'yi (locale'li şablon verisi) seçerse dönülecek.

## Kanıt (ham çıktı)

**Gerçek tarayıcı turu.** Chrome (Playwright `channel:'chrome'`), izole DB `fo11`, kendi `next dev` sunucum :3016'da, `DEMO_LOGIN_ENABLED=true`. LLM anahtarları sunucu ortamından silindi. Giriş demo admin `admin@yasinaslan.com.tr` ile yapıldı. Ultra plan, M2/M11 açık. Panelden başlandı, M4'e kenar menüsünden, M2 ve M11'e fırsat detayındaki modül sekmelerinden **tıklanarak** girildi. Ham `walk-log.txt`:
```
signin status 200
[tr] M4 url http://localhost:3016/tr/main/iliskiler | h1: Odak Noktası CRM (M4)
[tr] M2 url http://localhost:3016/tr/main/opportunities/demo-opp-1/m2 | h2: Konsept Notu Editörü
[tr] M2 label: Executive Summary (en fazla 500 kelime) | placeholder: Executive Summary bölümünü yazın... | counter: Kelime: 0 / 500
[tr] M2 generate band role=alert: İşlem başarısız: Insufficient AI credits. Please purchase more credits or upgrade your plan.
[tr] M2 save band role=status: Taslak kaydedildi. | counter: Kelime: 1 / 500
[tr] M11 url http://localhost:3016/tr/main/opportunities/demo-opp-1/application | h1: Part A & Part B Başvuru Üretim Paneli
[tr] M11 tabs: Part B (Çoklu Yazar İşbirlikçi Metin Editörü) | Part A (İdari & Lump-Sum Bütçe) | Part B (Gantt Şeması & İş Paketleri) | Gönderim Kontrol Listesi
[en] M4 url http://localhost:3016/en/main/relationships | h1: Focal Point CRM (M4)
[en] M2 url http://localhost:3016/en/main/opportunities/demo-opp-1/m2 | h2: Concept Note Editor
[en] M2 label: Executive Summary (max 500 words) | placeholder: Write the Executive Summary section... | counter: Words: 0 / 500
[en] M2 generate band role=alert: Action failed: Insufficient AI credits. Please purchase more credits or upgrade your plan.
[en] M2 save band role=status: Draft saved. | counter: Words: 1 / 500
[en] M11 url http://localhost:3016/en/main/opportunities/demo-opp-1/application | h1: Part A & Part B Application Production Panel
[en] M11 tabs: Part B (Multi-Author Collaborative Editor) | Part A (Administrative & Lump-Sum Budget) | Part B (Gantt Chart & Work Packages) | Submission Checklist
dialogs opened: 0
```
- `page.on('dialog')` sayacı **0**: hiçbir `alert()` diyaloğu açılmadı.
- Hata yolu gerçek: "YZ ile Taslak Üret"e tıklandı, sunucu eylemi reddetti, `role=alert` bandı göründü.
- Başarı yolu gerçek: demo-opp-2'deki not üzerinde "Taslağı Kaydet"e tıklandı, `role=status` bandı göründü.
- `en-m11-text.txt` içinde Türkçe harf geçen tek satır veri: "Proposal: District renovation pilot — İzmir".

M4 listesi, iki ilişki eklenerek tekrar çekildi:
```
tr Odak Noktası CRM (M4) | … | FO-11 Stale Org | partner | ⚠ 90 gündür bayat | WARM | FO-11 Fresh Org | partner | HOT | 5 gün önce
en Focal Point CRM (M4) | … | FO-11 Stale Org | partner | ⚠ 90d stale | WARM | FO-11 Fresh Org | partner | HOT | 5d ago
```

**Ekran görüntüleri:** `FONBRIDGE/docs/agent-results/TASK-MVBE4DG89QJMS-evidence/` (PR'da da var) ve bu dosyanın yanındaki `TASK-MVBE4DG89QJMS-evidence/`:
- `{tr,en}-m4-relationships.png`, `{tr,en}-m4-relationships-list.png`
- `{tr,en}-m2-editor.png`, `{tr,en}-m2-generate-band.png`, `{tr,en}-m2-save-band.png`
- `{tr,en}-m11-application.png`, `{tr,en}-m11-tab0..3.png`, `{tr,en}-m11-text.txt`, `walk-log.txt`

**Kapılar:**
```
pnpm lint            → 0 error (4 warning, değişmeyen dosyalarda: invitations/accept.ts, e2e/fixtures/concept-template-tenant.ts, settings-profile-update.test.ts)
pnpm typecheck       → tsc --noEmit temiz
pnpm i18n:check      → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
vitest (yeni test)   → Test Files 1 passed · Tests 4 passed   |  eski editörle: Tests 4 failed (4)
perl -e 'alarm 900;exec @ARGV' pnpm test (izole fo11)
                     → Test Files 366 passed | 2 skipped (368) · Tests 4839 passed | 54 skipped · EXIT=0
e2e module-entry-points + mobile-main-overflow (E2E_PORT=3017)
                     → 16 passed (1.2m), EXIT=0
pre-push tam gate (pnpm gate, izole fo11, E2E_PORT=3018) → push başarılı:
  vitest  366 passed | 2 skipped
  rls:check / rls:bypass-check / rls:verify  ✅ (47 tablo, fabrika_app ile ölçüldü)
  e2e     378 passed, 9 skipped, 0 failed (10.5m)
  alerts:check ✅ Öksüz alarm yok
  * [new branch] fe-fb/fo11-m2-m4-m11-i18n -> fe-fb/fo11-m2-m4-m11-i18n
```

## Değişen dosyalar
- `src/app/[locale]/(app)/[workspace]/relationships/page.tsx`
- `src/modules/m2/ui/ConceptNoteEditor.tsx`
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/m2/page.tsx`
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx`
- `messages/tr.json`, `messages/en.json`: `Relationships.page.*`, `ConceptNote.editor.*` ve `applicationPartA.*` (yeni anahtarlar; mevcut anahtar değişmedi)
- `i18n-baseline.json` (yalnız 3 kayıt silindi)
- `tests/concept-note-editor-notice.test.tsx` (yeni), `tests/e2e/module-entry-points.spec.ts` (regex'ler sıkılaştı)
- `docs/agent-results/TASK-MVBE4DG89QJMS-evidence/**` (kanıt)

Dokunulmayanlar: `package.json`, `.github/`, `scripts/`, `prisma/schema.prisma`, seed, `partners/leaders/page.tsx`.

## Riskler
- **Ortam olayı, benim hatam, geri alındı.** İzole DB'ye GRANT vermek için `prisma/rls-app-role.sql`'i `fabrika_app_ci` parolasıyla paylaşılan `fabrika-postgres` container'ında koştum. Rol küme genelinde olduğu için **`fabrika_app` parolası herkes için değişti** ve ilk tam süitte 36 RLS/live testi `28P01` ile düştü. Parolayı `.env`'deki `DATABASE_URL_RLS_TEST` değerine geri yükledim; `.env` URL'siyle giriş doğrulandı (`current_user = fabrika_app`). Kırmızı 37 dosya tekrar koşuldu: hepsi yeşil. Yaklaşık 15 dakika boyunca o container'ı kullanan başka ajanların RLS canlı testleri de düşmüş olabilir; o aralıkta kırmızı gören varsa sebep budur. Geri yükleme sırasında `set_config` çıktısı bu yerel docker test parolasını kendi terminal çıktıma yazdı. Değer yalnız yerel geliştirme DB'sinde geçerli; istenirse döndürülebilir. Tekrarlanmaması için takım hafızasına not düşüldü.
- Pre-push `rls:verify` bir kez daha kırmızı yandı: "rls_auto_enable() → anon, authenticated". Sebep ortam farkı: paylaşılan container'da `anon`/`authenticated` rolleri var, CI'da yok. Yalnız throwaway `fo11`'de `revoke all on function public.rls_auto_enable() from public` ile CI'daki durum kuruldu. Repoda değişiklik yok.
- İkinci push denemesinde `admin-plan-editor.spec.ts:161` kırmızı yandı. Tarayıcı turu için `fo11`'de demo-tenant'ı ultra'ya almıştım; test `pro` bekliyor. Seed durumuna geri alındı; spec 13/13 geçti, üçüncü push yeşil.
- **Kapsam dışı, mevcut kusurlar (dokunulmadı, takip önerisi):**
  - `ConceptNoteEditor` kelime sayacı `split(/\\s+/)` kullanıyor. Bu regex ters bölü + "s" arıyor, boşlukta bölmüyor; 4 kelimelik metin "Kelime: 1" sayılıyor (kanıt: save band satırı). Tek karakterlik düzeltme ama davranış değişikliği, bu yüzden bu kartın kapsamında değil.
  - Taslak üretildikten sonra içerik editöre yüklenmiyor (kullanıcıya "sayfayı yenileyin" deniyor). O anda "Kaydet" boş içerikle üretilen taslağın üzerine yazabilir. Eski `alert` metni de aynı şeyi söylüyordu. Davranış korunduğu için dokunulmadı.
  - Hata bandındaki gerekçe sunucunun ham İngilizce mesajı ("Insufficient AI credits…"). `useActionErrorText` kodlu hataları çeviriyor, kredi yetersizliği için ayrı kod yok.
  - EN M11 sayfasında alttaki `PartBCollaborativeEditor` (`src/modules/m11/ui/`, baseline 16) Türkçe kalıyor. Ayrı dosya, kapsam dışı.
  - İlişki listesinde ve detayda `rel.kind` / `rel.warmth` ham enum değerleri gösteriliyor (WARM, HOT, partner). `Relationships.cold/warm/hot` anahtarları var ama detay sayfası da aynı ham değeri kullandığı için tutarlılık adına dokunulmadı.
  - M11 kontrol listesindeki 5 maddenin hepsi sabit `status: true` (ör. "~38 Sayfa"). Bu bir kanıt disiplini konusu (CLAUDE.md §7); metin taşındı, mantığa dokunulmadı.
- `messages/*.json`'da PR #72 (FO-6) ile metin çakışması olabilir. #72 zaten dev'deyse çakışma yok; bu dal `origin/dev`'den (afe3120a) açıldı.

## Açık sorular
- Yok. Şablon etiketi kararı K-569545 ile soruldu, varsayılan A uygulandı.

## Sonraki adım
- PR #112 incelemesi (crw). Merge benim tarafımdan yapılmayacak.
- Önerilen takip kartları: (1) labelKey çevirisi, K-569545'in sonucuna göre; (2) kelime sayacı regex'i ve üretim sonrası içeriğin yüklenmesi; (3) `PartBCollaborativeEditor` i18n; (4) M11 kontrol listesinin gerçek veriye bağlanması.

## Platform beyanı
- **mac (macOS / Darwin, Google Chrome):** gerçek tarayıcıda tr + en tıklama turu, vitest tam süit, e2e ve pre-push gate burada koşuldu.
- **Windows / Linux:** koşulmadı; elimde bu makineler yok. Değişen kod yalnız React/next-intl metin katmanı ve bir sayfa içi bant. Süreç, dosya yolu, kabuk, kısayol ya da DPI'ya bağlı kod yolu yok, bu yüzden davranış platformdan bağımsız. CI'daki ubuntu koşusu da GitHub Actions billing yüzünden başlamıyor; yerel gate kanıtı esas alındı.
