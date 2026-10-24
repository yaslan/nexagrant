---
sözleşme: 3
görev: TASK-MVFM9GFCWOHS1
kod: TASK-MVFM9GFCWOHS1
ajan: devop-fb
motor: claude
tip: yayın
okur: ekip
hüküm: Kısmen bitti: B-1, B-2 ve B-3 uygulandı (onay talebi yeniden yazıldı, KURULUM §2 düzeltildi ve yerelde 3be88098 olarak commit edildi), ama pre-push gate'i src/ tarafındaki 6 testte (önceki turla aynı aile) düştüğü için push yapılamadı; --no-verify kullanılmadı.
platform: mac (darwin 27): git/gh incelemesi, apply-order sayımı, dig ve pre-push gate burada koşuldu. cPanel/Linux ve linux/amd64 paket derlemesi koşulmadı: bu tur yalnız belge düzeltmesi, yeni paket yok, kart sunucuya dokunmayı yasaklıyor. KURULUM'a eklenen psql/PGOPTIONS komutları operatörün Linux konteynerinde koşacağı komutlar; bu turda hiçbir DB'ye karşı koşulmadı. PGOPTIONS libpq ortam değişkeni olduğu için platformdan bağımsızdır.
sürüm: 1
tarih: 2026-10-19T21:48:15.372Z
---

# FO-104 · crw-fb B-1/B-2/B-3 düzeltmesi: prod onay talebi + KURULUM §2

## Ne yapıldı
crw-fb incelemesindeki (`docs/agent-results/TASK-MVFM9GFCWOHS1-crw-fb.md`) üç bloke eden bulguyu uyguladım:

- **B-1:** Hedef commit "#92 ve #94 dev'e girdikten sonraki dev commit'i (henüz yok)" olarak değiştirildi. f310642d açıkça "çıkış adayı DEĞİL" diye yazıldı. Üç seçenekli ön koşulun yerine "K-570153=A" yazıldı.
- **B-2:** Talepte artık iki ayrı liste var: e0ccbfa9'dan hedefe kadar uygulanacak 7 migration ve beklenen `N files applied` değeri. KURULUM §2 adım 5'teki sabit "43" kaldırıldı; N artık `apply-order.txt`'ten türetiliyor. `drop-evidence-reminder` için satır sayısı kontrolü ve `app.allow_evidence_reminder_drop` opt-in notu eklendi. Yedek yönteminin açık karar olduğu (KURULUM:52 🟥) ön koşul olarak yazıldı.
- **B-3:** FO-21 engel listesi se-fb raporuyla eşitlendi (F1 RLS YÜKSEK, F2 unvan, F3 saklama süresi ve yurt dışı aktarım). CSV maddesi küçük not (F10) olarak geçiyor.

Canlıya, sunucuya ve DB'ye dokunmadım. Merge yok. PR gövdesini değiştirmedim, çünkü push başarısız oldu.

## Prod onay talebi — yeniden yazılmış (tek blok)

> **Talep: FO-67 cPanel paketinin canlıya alınması (K-568981) — 2026-10-20 düzeltmesi**
>
> **Hedef commit:** #92 ve #94 dev'e girdikten sonraki dev commit'i (**henüz yok**; 2026-10-20 itibarıyla #92 ve #94 OPEN). **`f310642d` paketi çıkış adayı DEĞİLDİR.** Bu paketin içinde `ExpertPreRegistration` için RLS kapalı (se-fb F1).
> **Çıkış ön koşulu:** **K-570153=A.** Paket, #92 ve #94 dev'e girdikten sonraki commit'ten derlenir. Talep o zaman commit, zip sha256 ve `BUILD-INFO.txt` ile yeniden verilir. sha256 o derlemenin kimliğidir; aynı commit'ten yeniden derleme farklı sha verir.
>
> **Migration — liste 1: e0ccbfa9 (canlıdaki) → hedef arası uygulanacak 7 dosya** (bugünkü `origin/dev` 80271979'a göre; hedef commit kesinleşince yeniden sayılır):
> 1. `add-expert-pre-registration`
> 2. `add-expert-pre-reg-attempt`
> 3. `add-notification`
> 4. `drop-evidence-reminder` ⚠ yıkıcı, aşağıya bkz.
> 5. `add-expert-pre-registration-organization`
> 6. `expert-prereg-rls-mail-quota`
> 7. `blog-read-minutes`
> Hepsinin `.down.sql` dosyası var.
>
> **Migration — liste 2: beklenen çıktı.** `apply-migrations: N files applied`; N = hedef commit'teki `apply-order.txt`'in yorum dışı satır sayısı. Bugünkü dev için **N = 50** (e0ccbfa9 = 43, f310642d = 47). Betik idempotenttir; ikinci koşu da N verir. Yükseltme provası hedef paketle yapılacak; bu turda yapılmadı.
>
> **⚠ `drop-evidence-reminder`:** `EvidenceReminder` tablosunda satır varsa migration hata verip durur. O noktaya kadarki dosyalar uygulanmış kalır (idempotent, yeniden koşmak güvenli). Önce satır sayısı kontrol edilir (KURULUM §2 adım 5). 0 ise devam edilir. 0'dan büyükse satırlar kalıcı silinir: ayrı patron onayıyla `PGOPTIONS='-c app.allow_evidence_reminder_drop=on'` verilir. Canlıdaki satır sayısı bilinmiyor.
>
> **⚠ FO-21 YAYIN ENGELİ (se-fb, TASK-MVBIYRGLU5EMX):** Paket `/tr/uzman`, `/en/experts` ve `POST /api/expert-preregistration` uçlarını herkese açar. Engeller:
> - **F1:** `ExpertPreRegistration` RLS'siz okunuyor (kişisel veri, **YÜKSEK**). dev'de düzeltildi, f310642d'de yok.
> - **F2:** KVKK metninde `[FonBridge tüzel kişi unvanı]` yer tutucusu duruyor.
> - **F3:** Saklama süresi ve yurt dışı aktarım belirsiz (#92/#94).
> - Küçük not, **F10** (DÜŞÜK, varsayım): CSV formül kaçışı yalnız ilk karaktere bakıyor. Kaçış zaten var (`csv.ts:10`).
>
> **Ön koşullar:**
> - **Yedek:** Migration'dan önce DB yedeği alınır. **Yedek yöntemi hâlâ açık karar** (KURULUM:52 🟥: repoda yedek betiği yok; Supabase paneli mi, `pg_dump` mı). Karar verilmeden çıkış yapılmaz.
> - `files.fonbridge.com` DNS: **kayıt yok** (`dig +short` boş, 2026-10-20 00:43 +03). Sahibi Cloudflare (K-568980 A).
> - `fonbridge-public` bucket'ı açılmalı.
> - cPanel env (değerler bu talepte yazılmaz):
>   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_HOST`
>   - isteğe bağlı: `R2_ENDPOINT`, `R2_REGION` (varsayılan `auto`)
>   - Canlı durum CSP başlığından yapılmış bir çıkarımdır.
> - Paket, PR #120'deki birleşmiş araçla derlenir.
>
> **Geri alma:** önceki paket (`fonbridge-app-e0ccbfa9.zip`) + DB yedeği (KURULUM §9). `drop-evidence-reminder` veri açısından geri alınamaz; `.down.sql` yalnız boş tabloyu geri kurar.
>
> **Son ayrı onay:** Bu talep çıkış için yeterli değildir. Çıkış, patronun ayrı son onayıyla yapılır.

## Kanıt (ham çıktı)
```
$ apply-order yorum-dışı satır: e0ccbfa9 43 · f310642d 47 · origin/dev 50
$ diff e0ccbfa9 origin/dev apply-order (yalnız eklenenler):
> add-expert-pre-registration.sql
> add-expert-pre-reg-attempt.sql
> add-notification.sql
> drop-evidence-reminder.sql
> add-expert-pre-registration-organization.sql
> expert-prereg-rls-mail-quota.sql
> blog-read-minutes.sql
$ origin/dev:drop-evidence-reminder.sql
  SELECT count(*) INTO n FROM "EvidenceReminder";
  IF n > 0 AND current_setting('app.allow_evidence_reminder_drop', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'EvidenceReminder holds % row(s); refusing to drop without app.allow_evidence_reminder_drop=on'
$ gh pr view 92 / 94 → OPEN / OPEN
$ date; dig +short files.fonbridge.com → 2026-10-20 00:43 +0300 ; (boş) exit 0
$ git commit → 3be88098 docs(cpanel): derive the migration count from apply-order, guard drop-evidence-reminder (FO-104)
  deploy/cpanel/KURULUM.md
$ git diff --stat f310642d 3be88098 -- . ':!deploy/cpanel'  → (boş: uygulama koduna dokunulmadı)
$ git diff --stat fc33172b 3be88098
 deploy/cpanel/ENV-LISTESI.md | 1 +
 deploy/cpanel/KURULUM.md     | 5 ++++-
```
**Pre-push gate (`.env` push kabuğuna aktarıldı, `--no-verify` YOK) — kırmızı:**
```
lint: ✖ 4 problems (0 errors, 4 warnings)
FAIL tests/expert-prereg-form.test.tsx (3)  — valid form posts…, no organisation…, a picked language…
FAIL tests/rag-pdf-worker-isolation.test.ts (2) — 128 MB inflate / 1.3 GB LZW bomb "fast"
FAIL tests/api/api-error-body-guard.test.ts (1) — server action error returns
 Test Files  3 failed | 347 passed | 7 skipped (357)
      Tests  6 failed | 4562 passed | 120 skipped (4688)
error: failed to push some refs to 'https://github.com/yaslan/fonbridge.git'
```
Düşen testlerin hepsi `src/` ve uzman ön kayıt alanında. expert-prereg-form ve rag-pdf düşüşleri 78a1e748'deki önceki turda da vardı. Bu commit'in diff'i yalnız `deploy/cpanel/KURULUM.md`. Dal tabanı f310642d, dev'in 103 commit gerisinde. Uzak dal hâlâ `fc33172b`; `78a1e748` ve `3be88098` yalnız yerelde.

## Değişen dosyalar
- `deploy/cpanel/KURULUM.md` (worktree `…/scratchpad/wt-fo67`, dal `devop-fb/fo67-cpanel-dev-package`, yerel commit `3be88098`, push edilmedi).
- Bu rapor.

## Riskler
- PR #120 hâlâ eski (`fc33172b`) belgeyi gösteriyor; KURULUM düzeltmesi uzak dalda yok.
- Gate, eski tabanın `src/` testlerinde kırmızı. Dal dev'e rebase edilmeden yeşil olması beklenmiyor. Rebase bu kartın kapsamında değildi.
- Canlıda `EvidenceReminder` satır sayısı bilinmiyor.

## Açık sorular
- Görev metnindeki "KANIT ZORUNLU" satırı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MVBIYRGLU5EMX-crw-fb.md` dosyasına yazmamı istiyordu. Bu yol başka bir kartın (FO-21) başka bir ajana (crw-fb) ait dosyası ve görevin kendi verdiği yolla çelişiyor. Oraya yazmadım; rapor görevin açık yolunda: `TASK-MVFM9GFCWOHS1-devop-fb-2.md`. Aynı şekilde B-3'te anılan `TASK-MVBIYRGLU5EMX-crw-fb.md` dosyası yok; eşitleme se-fb raporuna (`/Users/macbook/alan/docs/agent-results/TASK-MVBIYRGLU5EMX-se-fb.md`) göre yapıldı.

## Sonraki adım
1. Lider: dal dev'e rebase edilsin mi kararı verilsin (ayrı iş). Rebase sonrası tam `pnpm gate` ve push.
2. #92 ve #94 merge edildikten sonra hedef commit'ten paket derlenir; talep sha256, BUILD-INFO ve prova günlüğüyle yeniden verilir.
3. crw yeniden inceleme.
