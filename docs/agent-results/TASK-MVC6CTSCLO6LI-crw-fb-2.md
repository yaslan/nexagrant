---
sözleşme: 3
görev: TASK-MVC6CTSCLO6LI
kod: TASK-MVC6CTSCLO6LI
ajan: crw-fb
motor: claude
tip: ölçüm
okur: ekip
hüküm: Kısmen bitti: Düzeltme gerekli, ama kod değil: yerel head bc05c016 merge'e hazır (Ö-1, N-1 ve rebase kapandı, mutantlarla doğrulandı). PR #87 ise uzakta hâlâ 69ed2dfc'de ve CONFLICTING, çünkü düzeltmeler push edilmedi. be-fb normal push yapınca merge'e hazır olur; bunu bloke eden tek şey push.
platform: macOS (darwin 27), Node + pnpm, yerel Postgres :5433 (paylaşılan `fabrika`; down/migration koşulmadı, gerek olmadı). Windows/Linux koşulmadı: değişiklik yalnız sunucu, SQL ve test tarafında, platforma bağlı yol yok. GitHub CI koşulamadı: işler hesap faturalaması nedeniyle başlatılmıyor (dev dahil).
sürüm: 1
tarih: 2026-10-17T19:30:27.506Z
---

# FO-45 · PR #87 yeniden inceleme (crw-fb, 2. tur)

## Ne yapıldı
- İlk incelememdeki bulguları (Ö-1, Ö-2, Ö-3, N-1…N-6) be-fb'nin 2. tur raporuyla (`/Users/macbook/alan/docs/agent-results/TASK-MVC6CTSCLO6LI-be-fb-2.md`) eşledim ve kodda doğruladım.
- Yerel head `bc05c016` için scratchpad'de ayrı bir detached worktree açtım. be-fb worktree'sine yazmadım; yalnız `node_modules`'unu symlink ile kullandım. Bu worktree'de:
  - canlı expert testlerini koştum,
  - 5 kapsam mutantı denedim,
  - rls kapılarını ve typecheck'i koştum,
  - origin/dev ve #92 ile deneme birleşimi yaptım.
- Her şey geri alındı: worktree silindi, `git status` temiz.
- Paylaşılan DB'de down ya da migration koşmadım; gerek olmadı.

## Kanıt (ham çıktı)

### PR durumu (asıl engel)
```
gh pr view 87      → mergeable: CONFLICTING, mergeStateStatus: DIRTY, headRefOid 69ed2dfc
git ls-remote      → refs/heads/be-fb/fo45-prereg-rls = 69ed2dfc   (5c6dba99 ve bc05c016 uzakta YOK)
df -h /            → 142Gi boş, %9   (be-fb'yi bloke eden disk sorunu artık yok)
```

### Bulgu eşlemesi
| Bulgu | Durum | Kanıt |
|---|---|---|
| Rebase/çakışma | KAPANDI (yerelde) | `5c6dba99`: apply-order `…-organization.sql` → `expert-prereg-rls-mail-quota.sql` (doğru sıra). §22 Alanlar #86'nın hali, F6 cümlesine "kurum" eklendi (N-3b). Yerel head + güncel origin/dev (5 yeni commit, #89/#96) → `Automatic merge went well`. |
| Ö-1 app rolüyle canlı test | KAPANDI | `tests/expert-prereg-app-role.live.test.ts`: `--reporter=verbose` ile 2/2 ✓, gerçekten koşuyor. `assertRlsSubjectRole` BYPASSRLS rolünü reddediyor. CI'da `DATABASE_URL_RLS_TEST` tanımlı (`ci.yml:31`), `skipOrFailInCi` sayesinde CI'da sessizce atlanmaz. |
| N-1 rollback kapsamı | KAPANDI | `register.ts:288-291` dış `.catch`: log + `mail_failed`. İç `.catch` ile birlikte tx abort olursa commit hatası da buraya düşer; doğru. |
| N-3a "Erişim bu yüzden kodda kapatılır" | AÇIK (kozmetik) | §22 "RLS kararı" paragrafı aynen duruyor. Yeni "DB seviyesi" maddesi bunu fiilen düzeltiyor. Bloke etmez. |
| N-2 CHECK 4c "policy-less" mesajı | AÇIK (kozmetik) | `rls:check` hâlâ `ExpertPreRegistration`'ı sayıyor. Bloke etmez. |
| Ö-2 public-intake geniş kapsam | AYRI KART (lider) | Kapsam dışı. Dokunulmamış, doğru. |
| Ö-3 üretim rolü | LİDER KARARI | Dokunulmamış. |
| N-4, N-5, N-6 | Bilgi/öneri | Değişiklik yok, kabul. |

### Mutantlar (yeni app-rol testine karşı, `withSystemScopeOn(...)` → `db.$transaction(`)
```
M1 verify.ts:35       → KIRMIZI  expected { ok: false, error: 'invalid' } to match { ok: true, locale: 'en' }
M2 admin.ts:74        → KIRMIZI  expected [] to have a length of 1 but got +0
M3 register.ts:151    → KIRMIZI  expected {kind,error} to deeply equal { kind: 'created' }
M4 seats.ts:14        → YEŞİL (hayatta)   ← Y-1
M5 register.ts:278    → YEŞİL (hayatta)   ← Y-2
```

### Kapılar (yerel head, env aynı kabukta yüklü)
```
vitest: app-role + 2 expert live + src/lib/expert-prereg → Test Files 8 passed, Tests 69 passed
pnpm rls:check                → ✅ SUCCESS (47 model)
pnpm rls:bypass-check         → ✅ 0 new tenant bypass, 44 sanctioned
pnpm rls:verify --require-db  → ✅ ExpertPreRegistration: dışarıda 0 (tabloda 5), INSERT reddi, içeride 5/5
pnpm typecheck                → rc=0
```
Not: `rls:verify` ilk döngüde bir kez rc=1 verdi. Çıktısı grep filtresiyle kayboldu. Hemen ardından 3 koşu rc=0 ve tam ✅ verdi. Aynı DB'yi kullanan eşzamanlı başka bir ajan testinden kaynaklandığını tahmin ediyorum; doğrulanmadı.
Tam `pnpm test` ve e2e'yi ben koşmadım. be-fb'nin raporunda tam test 0 başarısız; e2e push gate'inde koşulmadı.

### CI
```
gh pr checks 87 → 4 kontrol fail, süre 1-2 sn, steps=0
annotation: "The job was not started because recent account payments have failed or your spending limit needs to be increased."
dev'in son 3 CI koşusu da failure (aynı neden)
```
Bu durumda CI kırmızısı koddan kaynaklanmıyor. Ama GitHub'da fiilen hiçbir kapı koşmuyor; tek kapı yerel pre-push.

### #92 (FO-50) ilişkisi
- #92, #87'nin eski head'i 69ed2dfc'nin üstüne kurulu (8 commit, ilk 3'ü #87).
- Yerel #87 head + #92 deneme birleşimi: tek çakışma `docs/DATA_MODEL.md`. #87 dev'i merge ederken §22'yi değiştirdi, #92 de aynı bölümü değiştiriyor.
- **#87'nin önce merge edilmesine engel yok.** #87 merge olunca #92 dev'i merge edip yalnız DATA_MODEL §22'yi elle çözmeli (Alanlar satırında `organization` + FO-50 saklama metni). Kod dosyaları otomatik birleşti (schema.prisma, constants.ts, 2 live test).

## Yeni bulgular (öneri, bloke etmez)

### Y-1 · DÜŞÜK · seats kapsamı düşerse test yakalamıyor
- **Yer:** `tests/expert-prereg-app-role.live.test.ts`, `expect(Number.isInteger(seats)).toBe(true)`.
- **Senaryo:** `seats.ts`'den kapsam düşerse RLS altında `max(founderNumber)` = NULL olur ve koltuk sayısı 100 görünür. Herkese açık sayfa yanlış "100 boş koltuk" gösterir, test yine yeşil kalır.
- **Öneri:** Doğrulamadan dönen `founderNumber` ile `expect(seats).toBe(Math.max(0, 100 - founderNumber))`. Ya da `≤ 100 − founderNumber`, çünkü testler paralel koşabilir; kilit zaten var.

### Y-2 · DÜŞÜK · posta hatası rollback'i app rolüyle test edilmiyor
- **Senaryo:** `register.ts:278` kapsamı düşerse `delete`/`update` RLS altında hata verir, iç `.catch` loglar, yetim bir pending satır kalır. 5 dk cooldown + günlük kota bozulur. Test yeşil kalır.
- **Öneri:** Aynı dosyaya `mailer` atan ikinci bir senaryo eklensin: sonra sahip ile `count` → 0 (yeni kayıt) ya da önceki token geri gelmiş olmalı.

İkisi de bugünkü kodda hata değil (kapsam yerinde); regresyon koruması boşluğu. Takip kartına ya da push'tan önce ek commit'e uygun, yaklaşık 15 satır.

## Değişen dosyalar
Kod değişikliği yok. Yalnız bu rapor.

## Riskler
- Push yapılmazsa PR CONFLICTING kalır. Push'ta pre-push gate e2e'yi koşar; port 3000 doluysa `E2E_PORT=3100` gerekir (be-fb raporu).
- be-fb'nin raporunda disk dolu iken Postgres'in `fsync … Input/output error` verdiği yazıyor. Bugünkü ölçümlerim (rls:verify, live testler) DB'nin sağlıklı yanıt verdiğini gösteriyor; tam bütünlük kontrolü yapmadım.
- GitHub CI faturalama yüzünden ölü; merge kararı yalnız yerel kanıta dayanıyor.

## Açık sorular
- CI faturalaması (ofis sahibi/lider): GitHub Actions işleri başlamıyor.
- Ö-2 ayrı kart ve Ö-3 kararı lider tarafında bekliyor.
- Görev metnindeki KANIT yolu be-fb'nin raporunu (`…-be-fb-2.md`) gösteriyordu. O dosyanın üzerine yazmadım; iş metninin verdiği SONUÇ DOSYASI yoluna (bu dosya) yazdım.

## Sonraki adım
1. be-fb: `set -a; . /Users/macbook/alan/FONBRIDGE/.env; set +a; E2E_PORT=3100 git push origin be-fb/fo45-prereg-rls` (normal push). İsterse önce Y-1/Y-2.
2. Push sonrası `gh pr view 87 --json mergeable` MERGEABLE dönmeli. Yerel deneme bunu destekliyor.
3. se-fb yeniden doğrulaması (kart gereği), ardından merge. Merge'ü #92'den önce yapın.
4. #92: #87 merge olduktan sonra dev'i merge edip DATA_MODEL §22'yi çözsün.
