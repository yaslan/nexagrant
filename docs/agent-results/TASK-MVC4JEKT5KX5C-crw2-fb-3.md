---
kart: TASK-MVC4JEKT5KX5C
kod: FO-39#a11y-rereview
ajan: crw2-fb
tip: review (PR #90 yeniden inceleme)
hüküm: DÜZELTME GEREKLİ — PR #90 head'i hâlâ ea724729; B1/B2 düzeltmesi (6d0a0f49) yalnız fe-fb'nin yerel dalında, push edilmemiş. 6d0a0f49 tüm kontrolleri geçiyor; değişmeden push edilirse merge'e hazır.
platform: mac (darwin) — jsdom (dom-accessibility-api) + Playwright Chromium 1.62.1 headless CDP AX ağacı; Windows/Linux koşulamadı
tarih: 2026-10-17
---

# PR #90 a11y yeniden inceleme (B1/B2) — crw2-fb

Merge etmedim, approve vermedim.

## Hüküm
**PR olarak: DÜZELTME GEREKLİ (push bekleniyor).**
- `gh pr view 90` → head `ea7247298c49…`. Bu, önceki incelememde (`TASK-MVC4JEKT5KX5C-crw2-fb-2.md`) B1/B2 bulduğum commit'in kendisi. `git ls-remote` de aynı sha'yı veriyor.
- Düzeltme `6d0a0f49` ("fix(nav): locked sidebar entry is a disabled link named by its label") yalnız yerel `fe-fb/fo39-modules-page` dalında ve `.claude/worktrees/fo39-modules-page` worktree'sinde duruyor. Kontrol ettiğimde bu dal için çalışan bir `git push` yoktu.
- `6d0a0f49`'i ayrı bir worktree'de inceledim ve ölçtüm. Görevdeki **tüm** kontrolleri geçiyor. fe-fb onu değiştirmeden normal push ederse PR merge'e hazır olur. Ek bir kod düzeltmesi gerekmiyor.

## Kontroller (`6d0a0f49` üzerinde)

| Kontrol | Sonuç |
|---|---|
| Kilitli öğenin erişilebilir ADI etiket | ✅ Chrome: `link name="Onay Merkezi (4-Eyes)"`, `link name="Partner REST API"` |
| Kilit nedeni `aria-describedby` açıklaması | ✅ desc = "M5 … modülü kapalı — bu özellik kullanılamaz" / "M1 …". Gizli (`hidden`) neden AX ağacında ayrıca StaticText olarak çıkmıyor; tarama modunda tekrar yok |
| Devre dışı link kalıbı | ✅ `role="link"` + `aria-disabled` → Chrome `disabled=true`, `focusable=true`; `href` yok, tabIndex 0 |
| Masaüstü + mobil çekmecede id'ler benzersiz | ✅ `React.useId()` ile: `_r_0_-approvals-locked`, `_r_0_-apiKeys-locked`, `_r_1_-…` (her biri 1 kez) |
| Test bunları assert ediyor | ✅ birim testinde `getByRole('link', { name, description })` (approvals **ve** apiKeys, B3 de kapandı), `hidden`, href yok, iki-nav id benzersizlik testi. e2e: `toHaveAccessibleName('Partner REST API')` + `toHaveAccessibleDescription(/^M1 .+ modülü kapalı/)` |
| Açık modülde davranış aynı | ✅ M1+M5 açık: `data-locked` 0, `aria-describedby` 0, `span[hidden]` 0; 7 `<a>`: Panel … Onay Merkezi (4-Eyes) · Partner REST API · Ayarlar. `<Link>` dalı değişmemiş |
| dev ile çakışma | ✅ `git merge-tree --write-tree 6d0a0f49 origin/dev` exit 0 (ea724729 için de 0) |

## Kanıt (ham)
```
$ gh pr view 90 --json headRefOid -q .headRefOid
ea7247298c4947f538fb8acbb5c8b27def027803
$ git ls-remote origin refs/heads/fe-fb/fo39-modules-page
ea7247298c4947f538fb8acbb5c8b27def027803  refs/heads/fe-fb/fo39-modules-page
$ git log --oneline ea724729..6d0a0f49        # yerel dal
6d0a0f49 fix(nav): locked sidebar entry is a disabled link named by its label (FO-39)
 src/components/SidebarNav.tsx | 11 +++-- · tests/e2e/plan-entitlement.spec.ts | 4 + · tests/module-entry-points.test.tsx | 46 ++++--

# 6d0a0f49, ayrı detached worktree
$ npx vitest run tests/module-entry-points.test.tsx tests/zz-pr90-probe.test.tsx
Tests  10 passed (10)        # module-entry-points; probe ayrıca 2/2
LOCKED sidebar-nav-approvals link name= "Onay Merkezi (4-Eyes)" desc= "M5 Teklif Üretim İş Akışı modülü kapalı — bu özellik kullanılamaz" href= false tab= 0
LOCKED sidebar-nav-apiKeys link name= "Partner REST API" desc= "M1 Ortak İstihbarat Veritabanı modülü kapalı — bu özellik kullanılamaz" href= false tab= 0
(iki nav aynı anda: aynı sonuç ×2)
OPEN locked= 0 describedby= 0 hiddenSpans= 0 links= Panel | Çağrılar | Fırsatlar | Ortaklar | Onay Merkezi (4-Eyes) | Partner REST API | Ayarlar
$ grep -o ' id="[^"]*"' (iki nav) | sort | uniq -c
   1 id="_r_0_-apiKeys-locked"  1 id="_r_0_-approvals-locked"  1 id="_r_1_-apiKeys-locked"  1 id="_r_1_-approvals-locked"

# Gerçek Chromium (CDP Accessibility.getFullAXTree), bileşenin render ettiği DOM üzerinde
link | name= "Onay Merkezi (4-Eyes)" | desc= "M5 Teklif Üretim İş Akışı modülü kapalı — bu özellik kullanılamaz" | disabled= true | focusable= true
link | name= "Partner REST API" | desc= "M1 Ortak İstihbarat Veritabanı modülü kapalı — bu özellik kullanılamaz" | disabled= true | focusable= true
(öncesi, ea724729: generic | name = desc = tooltip)

$ npx tsc --noEmit -p .   → çıktı yok (temiz)
$ git merge-tree --write-tree 6d0a0f49 origin/dev → exit 0 ; ea724729 → exit 0
```
Not: Chrome ölçümü, bileşenin jsdom'da ürettiği HTML'in birebir kopyası üzerinde yapıldı. Uygulama sunucusu kaldırılmadı ve e2e (`plan-entitlement.spec.ts`) koşulmadı; onu fe-fb'nin push kapısı koşacak. NVDA/VoiceOver ile dinlenmedi.

## Bulgular
- **P1 — [bloke] Düzeltme PR'da yok.** Merge şu an yapılırsa B1 (ad = tooltip) ve B2 (çift id) dev'e girer. Yapılması gereken: fe-fb `6d0a0f49`'i normal push etsin (`--no-verify` yok). Kod değişikliği gerekmiyor.
- **Ö1 — [öneri] Odak sırası notu.** Kilitli öğe link rolünde ve odaklanabilir olduğu için Tab sırasında kalıyor. Bu, devre dışı link kalıbının beklenen davranışı; sorun değil, yalnız bilgi.
- Kapsam dışı (önceki rapordan, değişmedi): kilit yalnız görünüm; URL ile erişim FO-53'te.

## Değişen dosyalar
Yok. Geçici ölçüm dosyaları ve detached worktree silindi; fe-fb'nin worktree'sine dokunulmadı.

## Riskler
- Push sonrası head `6d0a0f49`'den farklı olursa (rebase/ek commit), bu hüküm o sha için geçerli değil. Tek satırlık yeniden kontrol gerekir.

## Sonraki adım
1. fe-fb `6d0a0f49`'i push etsin.
2. `gh pr view 90` head = `6d0a0f49` ise PR merge'e hazır sayılabilir (bu raporun ölçümleri geçerli). Merge kararı lider/patronda.

## Platform beyanı
- **Doğrulanan:** mac (darwin): jsdom + Playwright Chromium 1.62.1 headless.
- **Windows / Linux:** koşulamadı, bu makine yalnız mac. Değişiklik yalnız DOM/ARIA; platforma bağlı bir kod yolu yok. Erişilebilir ad/açıklama hesabı tarayıcıya ait.
- **Firefox/Safari:** ölçülmedi. `role=link` + içerikten ad + `aria-describedby` standart accname kuralı olduğundan aynı sonuç beklenir.
