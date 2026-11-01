---
gorev: TASK-MUPE21TEA2UB0
ajan: prm-fb
hukum: TAMAM
tip: belge
platform: mac (yalnız belge değişikliği; platforma bağlı kod yolu yok)
dal: prm-fb/checklist-r2-deadlock @ 7a6fc351 (dev @ d57e2bb5 üstüne 1 commit, push/merge yok)
---

# TASK-MUPE21TEA2UB0 — RELEASE_CHECKLIST §3.1: m4 zinciri deadlock notu (R-2 Ö-1)

## 1. Ne yapıldı
- `docs/RELEASE_CHECKLIST.md` §3.1'de, 3. adımın (`scripts/apply-migrations.sh`) alt maddelerine bir madde eklendi. Yeri: "Doğrulama sorgusu"ndan sonra, "Down dosyaları"ndan önce. Madde şunu söylüyor: zincir `m4-stale-digest-user-claim.sql`'de `deadlock detected` ile durursa (psql exit 3, son satır `41 files applied` çıkmaz) sorun yoktur ve aynı komut yeniden koşulur.
- Maddenin içeriği: neden olduğu (kilitlerin ters sırada istenmesi), neden güvenli olduğu (DO geri alınır, FORCE `true` kalır, dosya ve zincir idempotent), olasılığın düşük olduğu, beklenen son satır.
- Ayrım: madde açıkça **yalnız** `deadlock detected` içindir. Aynı bölümdeki (ii) maddesi bir durum için "yalnızca yeniden koşmayın" diyor: `these FORCE RLS tables hold rows but have no system_scope policy`, exit 1. Yeni madde o durumu (ii)'ye geri yönlendiriyor. Operatör iki talimatı karıştırmasın diye bu ayrım eklendi.
- SQL'e dokunulmadı. Kilit sırasını sabitleyen öneri (`LOCK TABLE "User" …`) ayrı bir kart konusu olarak bırakıldı.

## 2. Kanıt
- Kaynak, `/Users/macbook/alan/docs/agent-results/TASK-MUPBP1QYZ9993-crw-fb.md` §3 Ö-1: "psql `exit=3` veriyor ve zincir `ON_ERROR_STOP` ile duruyor. DO bütünüyle geri alınıyor, FORCE `true` kalıyor, veri kaybı yok. Dosya idempotent olduğu için yeniden koşu yeterli." Ham satır §2: `[prod C] … psql: exit=3 (deadlock detected, DO $$…) | R: ok | FORCE after: true ×3`.
- Notun iddiaları koddan doğrulandı (dev @ d57e2bb5):
  - `scripts/apply-migrations.sh:29` `set -euo pipefail`, `:126` her dosya için `psql … -v ON_ERROR_STOP=1`, `:199` `echo "apply-migrations: $n files applied as $role"`. Yani psql exit 3 verince betik exit 3 ile çıkar ve son satır yazılmaz.
  - `prisma/migrations/m4-stale-digest-user-claim.sql`: önce `ADD COLUMN IF NOT EXISTS` ve `CREATE INDEX IF NOT EXISTS`. Ardından DO bloğu gelir: önce `ALTER TABLE "Membership" NO FORCE` (AE), sonra `UPDATE "User"`, yalnız NULL ya da daha eski günü yükseltir. Hepsi idempotent.
- Commit:
  ```
  $ git rev-list --count dev..prm-fb/checklist-r2-deadlock
  1
  $ git diff dev prm-fb/checklist-r2-deadlock --stat
   docs/RELEASE_CHECKLIST.md | 1 +
   1 file changed, 1 insertion(+)
  $ git log --oneline -1 prm-fb/checklist-r2-deadlock
  7a6fc351 docs(release-checklist): TASK-MUPE21TEA2UB0 prm-fb — §3.1: m4-stale-digest-user-claim zinciri deadlock ile durursa aynı komutu yeniden koş (R-2 Ö-1)
  ```
- Worktree silindi (`git worktree list | grep -c wt-r2` → `0`). Ana checkout'un dalı değişmedi (`cs-fb/g1-pool-timeout`).

## 3. Değişen dosyalar
- `docs/RELEASE_CHECKLIST.md` (+1 satır, `prm-fb/checklist-r2-deadlock` dalında).
- Bu rapor: ana checkout'ta, commit'lenmemiş. Talimat tek commit istiyordu ve ana checkout başka bir ajanın dalında (`cs-fb/g1-pool-timeout`).

## 4. Riskler
- Deadlock'ta Postgres kurbanı kendisi seçer. Kurban uygulama işlemi olursa (ör. hesap silme) migration geçer, uygulama tarafında tek bir işlem hata alır. Bu not o durumu kapsamıyor. Ö-1 ölçümünde de kurban psql oldu.
- Not betiğin tamamını yeniden koşturuyor. Bu, §3.1'in mevcut "iki kez koşmak güvenli" iddiasına dayanıyor; bu kartta yeniden ölçülmedi.

## 5. Açık sorular
- Kilit sırasını DO içinde sabitlemek (`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`) ayrı kart olarak açılsın mı? Karar devop-fb/patronda. Not, bu yapılmasa da yeterli.

## 6. Sonraki adım
- Dalı dev'e almak için bir inceleme ya da entegrasyon kartı. Push ve merge bu kartta yapılmadı.
