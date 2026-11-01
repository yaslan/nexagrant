# FO-250 (TASK-MVUPDK0P6ZT0N) — PR #218 düzeltmeleri: durum raporu — devop-fb

**Ajan:** devop-fb · **Dal:** `devop-fb/fo244-vps-deploy` · **Worktree:** `FONBRIDGE-worktrees/devop-fb-fo250` · **Head (bu rapor öncesi):** `619db789` · **PR:** #218 (draft, açık, head uzakta hâlâ `407b6394`)
**Platform kapsamı:** mac (darwin) — yerel Docker Desktop + geçici pgvector:pg16. Linux sunucu ve Hostinger'a ERİŞİLMEDİ, dokunulmadı.
**Hüküm:** Kısmi. Kod düzeltmeleri commit'li ve yerel olarak doğrulandı; push BLOKE: (1) lider kararı gereği FO-254 (TASK-MVV72UUJXVN1) kapanana kadar push bekletiliyor, FO-254 hâlâ "IN PROGRESS"; (2) makine yükü load1 ≈ 200 (eşik < 12), bu yüzden `scripts/gate-isolated.sh git push` şu an başlatılmadı.

## Ne yapıldı

1. **FO-260 borcu (ön adım).** `/Users/macbook/alan/docs/agent-results/FO-260-devop-fb.md` dosyasının 6. satırında `**Hüküm:**` satırı zaten var (`Kısmen bitti: …`). Ek bir değişiklik yapılmadı. Dosya bir git deposu değil (`/Users/macbook/alan` altında `.git` yok), bu yüzden commit de yok.
2. **FO-250 kod düzeltmeleri (önceki oturum, dal üzerinde).** Kart maddeleri (B-1…B-3, Y-1…Y-4, Ö-1…Ö-5, D-1, D-6, ACME e-postası, ROADMAP M1) branch'te commit'li. Ayrıntı: `docs/agent-results/TASK-MVUPDK0P6ZT0N-devop-fb.md` (dal üzerinde, `444d466d` raporu).
   - `ops.sh` artık `run --rm --no-deps worker` ile compose ağında koşuyor (`--network host` kaldırıldı).
   - `db push --skip-generate` kaldırıldı; sahip rol `fabrika_owner`, jobs rolü `fabrika_jobs`, `ensure_rls` tetikleyicisi yok.
   - `.dockerignore` `**/.env*` + `!**/.env*.example`.
   - Compose bellek limitleri: postgres 2g, web 1536m + `NODE_OPTIONS`, worker 1g, caddy 128m.
   - `check-rls-live` beklenti düzeltmesi (`99056cce`): satır beklentisi BYPASSRLS sahip bağlantıdan ölçülüyor (lider kararı (a)).
   - `scripts/apply-rls.ts`, `scripts/setup-rls-role.ts`: yerel-DB guard'ı `new URL().hostname` tam eşleşmesine çevrildi (fail-closed).
   - `BACKUP_AGE_RECIPIENT` zorunlu, yalnız `*.dump.age` gönderiliyor.
   - Sonraki commit'ler: FO-254 test düzeltmesi `70007c62` (yalnız `tests/expert-prereg.live.test.ts`) ve FO-254 kısmi raporu `619db789`.
3. **Bu turda (kod değişikliği YOK).** Worktree oluşturuldu (kendi worktree'm, ana checkout'a dokunulmadı), `git status` temiz, head `619db789`. Yük ölçümü: `load averages: 199.97 165.04 136.14`. Gate başlatılmadı.

## Kanıt

- Hüküm satırı kontrolü: `grep -n "Hüküm" docs/agent-results/FO-260-devop-fb.md` → `6:**Hüküm:** Kısmen bitti: …`
- Dal durumu: `git log --oneline 407b6394..devop-fb/fo244-vps-deploy` → 8 commit (`43803aba` … `619db789`); PR #218 `headRefOid` = `407b6394` (uzak dal eski).
- FO-254 durumu: `docs/agent-results/TASK-MVV72UUJXVN1-devop-fb.md` başlığı → `Durum: IN PROGRESS (tamamlanmadı)`.
- Yük: `uptime` → `load averages: 199.97 165.04 136.14` (12 CPU; eşik 12).
- Önceki doğrulama (dal üzerinde, `99056cce`'ye kadar): geçici pgvector:pg16, `ops.sh verify` benzeri kontrol YEŞİL (`ExpertFounderCounter 1/1`, 51 kiracı tablosu ölçüldü, exit 0); negatif testler (owner URL yok / owner URL RLS'e tabi) beklendiği gibi exit 1. Geçici konteyner silindi.
- Bu turda yeniden koşulan test YOK: kod değişmedi; `70007c62` (FO-254 test değişikliği) bu raporda doğrulanmadı.

## Değişen dosyalar (bu tur)

- `docs/agent-results/FO-250-devop-fb.md` (yeni, bu rapor)

## Riskler

- Push hâlâ uzakta değil; PR #218 head'i `407b6394`. Push olmadan canlıya geçiş ve PR incelemesi ilerlemez.
- Gate kararsızlığı: önceki 4 denemenin tamamı, yük altında zamanlama eşiklerini aşan testlerle (`m17-interreg-extract`, `rag-pdf-worker-isolation`, `expert-prereg.live`) kırıldı. Bu testler FO-254 kapsamında; eşik gevşetme yasak.
- `seed` kapısı FO-251 birleşene kadar kapalı (fail-closed); canlı seed yapılamaz.
- `ops.sh verify` canlıda yalnız `check-rls-live` düzeltmesi birleşirse yeşil olur.

## Açık sorular

1. FO-254 kapanış kriteri lider tarafından onaylanacak mı (kalan iki zamanlama dosyası için ayrı düzeltme mi, yoksa kapıda geçici mi)?
2. Push yükü azaldığında (load1 < 12) hangi koşumla yapılacak: `bash scripts/gate-isolated.sh git push origin devop-fb/fo244-vps-deploy` (öneri, lider kararı (a)).
3. FO-260 KANIT satırında yazılan yol (`FO-260-devop-fb.md` yazımı) bu kartla ilgili değil gibi görünüyor; onaylanırsa FO-260 için ayrı bir kanıt satırı gerekmez (Hüküm zaten mevcut).

## Sonraki adım

- FO-254 kapanınca (ya da lider push'u FO-254'ten bağımsız onaylayınca) ve load1 < 12 olduğunda: worktree'de `bash scripts/gate-isolated.sh git push origin devop-fb/fo244-vps-deploy`; PR #218 head'inin yeni SHA olduğu doğrulanacak; bu rapora yeni SHA eklenecek.
- Sunucu/Hostinger: açık onay olmadan dokunulmayacak.
- Merge: yok.
