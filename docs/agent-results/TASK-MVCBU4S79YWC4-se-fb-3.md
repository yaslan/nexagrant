# TASK-MVCBU4S79YWC4 (FO-56) — PR yeniden açıldı, push kapısı yeşil

**Hüküm:** Metin düzeltmesi tamam; yeni dal `se-fb/fo56-auditevent-claim` origin/dev üstünde, push kapısı yeşil. PR #81 zaten dev'de (`a99db474`), bu yüzden yeni PR bu push'tan sonra açılıyor (URL aşağıda).

## Ne yapıldı
1. Güncel `origin/dev` (9cbc5761) üstünde yeni worktree: `.claude/worktrees/fo56-auditevent-claim`, dal `se-fb/fo56-auditevent-claim`.
2. Cherry-pick: `77e84822` → `626cdc2a` (AuditEvent iddiası kaldırıldı: messages tr/en `securityBody`, DPA tr/en:61, BETA_GUIDE tr/en) — temiz uygulandı.
3. Cherry-pick: `b666e57d` → `ae54403f` (önceki sonuç raporu).
4. Ayrı commit `92f35d19`: `docs/legal/HUKUK-SORULARI-2026-09.md` — eski AuditEvent cümlesi ve "yalnız platform yönetimi" öncülü yeni metinle hizalandı.
5. `.env`, `.env.local`, `.env.test` ana ağaçtan kopyalandı (içerikleri okunmadı; git-ignored). `pnpm install --frozen-lockfile` temiz.

## Kanıt (ham özet)
- `git grep AuditEvent -- messages docs/legal/dpa-*.md docs/BETA_GUIDE*.md` → yalnız `dpa-tr.md:64` / `dpa-en.md:64` (tablo tanımı; leader kararıyla kaldı).
- `pnpm gate` ilk koşu: lint/typecheck/test (4618 passed), i18n, rls:check, rls:bypass-check, rls:verify --require-db, db:rls-role geçti; **e2e düştü**: `http://localhost:3000 is already used`. Port 3000'i kullanan süreç (PID 96015) `dev-preview` worktree'sinden; ona dokunulmadı.
- İkinci koşu `E2E_PORT=3100 pnpm gate` (`playwright.config.ts:18` E2E_PORT okur): e2e **351 passed, 9 skipped (12.4m)**; `check-orphan-alerts` → "Öksüz alarm yok". Gate exit 0.
- Blog e2e 500 vermedi; R2 env override gerekmedi.
- Push koşusunda (`git push`, E2E_PORT=3100) e2e 343 passed, 4 failed: admin-blog-persistence, admin-blog-rich-editor, admin-plan-editor, m7-tto-accelerator ("element(s) not found", sunucu log'unda tekrarlayan instrumentation çıkışı). Aynı 4 spec tek başına yeniden koşuldu: **35 passed (52.5s)**. Bu PR'ın değiştirmediği alanlar; yük/zamanlama kaynaklı görünüyor, kök neden doğrulanmadı.

## Değişen dosyalar
- `docs/legal/HUKUK-SORULARI-2026-09.md` (92f35d19)
- `messages/tr.json`, `messages/en.json`, `docs/legal/dpa-tr.md`, `docs/legal/dpa-en.md`, `docs/BETA_GUIDE.md`, `docs/BETA_GUIDE.en.md` (626cdc2a)
- `docs/agent-results/TASK-MVCBU4S79YWC4-se-fb.md`, `…-shots/privacy-{tr,en}-security.png`, `…-se-fb-2.md` (ae54403f + bu rapor)

## Riskler
- **Gizlilik metni artık AuditEvent'i hiçbir işlem için anmıyor**, oysa kod birçok işlemde `AuditEvent` yazıyor (plan/modül yönetimi, üye/davet, blog, hesap silme, veri dışa aktarma). Bu bilgi kullanıcıya eksik veriliyor; hukuk sorusu olarak HUKUK 1.13'e işlendi. Metne eklenip eklenmeyeceği karar bekliyor.
- Push kapısı ilk koşuda 3000 portu yüzünden düştü; bu PR'ın push'u `E2E_PORT=3100` ile yapıldı (aynı kapı, farklı port). Başka bir ajan/patron sunucusu 3000'de kaldığı sürece yeni push'larda aynı ayar gerekir.
- Ekran görüntüleri (`privacy-{tr,en}-security.png`) yeni metni göstermiyor olabilir; bu kart `docs/agent-results/TASK-MVBDA0HX20X2C-shots` yenilemesini de istiyordu. Bu koşuda yenilenmedi (tarayıcı doğrulaması yapılmadı).

## Platform
mac (darwin). Yalnız metin ve test; platforma bağlı kod yolu yok.

## Açık sorular
- AuditEvent'in gizlilik metnine geri konulup konulmayacağı (hukuk/ürün kararı).

## Sonraki adım
PR `se-fb/fo56-auditevent-claim` → `dev` açılır; merge edilmez.
