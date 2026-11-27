# NG-379 — #342 kuralını güncel dev'e taşıma (worktree, Docker ve log temizliği)

**Ajan:** pm-gnd · **Kart:** TASK-MWXZ5XWWUJXCK · **Tip:** feature (belge) · **Tarih:** 2026-11-26
**Dal:** `task/ng-379` (origin/dev `bc873b76` üzerine) · **Commit:** `1b4dab8c` · **Taban:** `origin/dev` = `bc873b76` (#450 sonrası)

**Hüküm:** Kural metni (#342, `138433975d`) güncel dev'e **birebir** taşındı: `CLAUDE.md` ve `AGENTS.md` içinde eklenen 13 satırın tamamı yeni commit'te; eklenen satırlar #342 commit'indeki eklenen satırlarla bayt bayt aynı (karşılaştırma aşağıda). `pnpm gate` **yeşil** (`GATE_EXIT=0`; vitest 628 dosya / 9057 test geçti; e2e 736 geçti).

## Ne yapıldı

1. `git worktree add -b task/ng-379 /home/aslan/alan/.agentspace/worktrees/nexagrant/ng-379 origin/dev` (izole worktree).
2. `CLAUDE.md`: "E2E postası" paragrafı ile "## Mimari kurallar" arasına `## Worktree, Docker ve log temizliği` bölümü eklendi (4 madde + giriş paragrafı).
3. `AGENTS.md`: `<!-- END:nextjs-agent-rules -->` bloğunun altına aynı başlık ve 4 madde eklendi (bu blok `next dev` tarafından yönetiliyor; blok içine dokunulmadı).
4. Commit: `docs(agent): worktree, Docker ve log temizlik kuralı (NG-379, #342 yerine)` — `git commit -- CLAUDE.md AGENTS.md` ile yalnız iki dosya.
5. İzole DB: `ng379-pg` konteyneri (`pgvector/pgvector:pg16`, `127.0.0.1:5579`, DB `ng379`); `.env` yalnız bu worktree'de; `pnpm install --frozen-lockfile` ve `pnpm db:setup` (7/7 adım) temiz bitti.

## Kanıt

Eklenen satırların karşılaştırması (`git show 138433975d | grep ^+` ↔ `git diff origin/dev..task/ng-379 | grep ^+`): **IDENTICAL_ADDED_LINES** (13 satır, 2 dosya).

```
AGENTS.md | 6 ++++++
CLAUDE.md | 7 +++++++
2 files changed, 13 insertions(+)
```

## #342 ↔ NG-379 farkları (kural metni)

- **Kural metni değiştirilmedi.** Tek bilinçli not: örnek worktree yolu `/Users/macbook/alan/FONBRIDGE-worktrees/<ad>` olduğu gibi kaldı; bu yol mac'e özgü, bu makinedeki gerçek yol `/home/aslan/alan/.agentspace/worktrees/nexagrant/`. Yol düzeltmesi lider kararı olarak bırakıldı.
- **Kart özetindeki "(+12/−4)" rakamı yanlış:** #342 commit'i gerçekte `CLAUDE.md +7`, `AGENTS.md +6`, silme yok (toplam 13 ekleme). Kart metni düzeltilmeli.
- **Çakışma / tekrar taraması:** Güncel `CLAUDE.md`'deki "Worktree'de gate (izole DB)" bölümü ile yeni madde 2'deki `<is>-pg` referansı çelişmiyor; madde onu referans ediyor, yeniden yazmıyor. Yeni bölümle çakışan başka satır yok, birleştirme gerekmedi.

## Gate koşuları (3 deneme)

1. **Başarısız:** `tests/jobs-enqueue-force.live.test.ts` — DB adı `ng379` reddedildi. Kural: test DB'si `fabrika_test` veya `fabrika_test_ng<sayı>` (ya da `fabrika_gate`) olmalı. DB `fabrika_test_ng379` olarak yeniden kuruldu (`pnpm db:setup` 7/7). Bu kural `CLAUDE.md`'de yazılı değil; yalnız test dosyasında. Kart/kural metni güncellenmesi önerisi açık soru olarak aşağıda.
2. **Başarısız:** `eslint` adımı çıktısız `ELIFECYCLE` ile düştü (iki kez: ilk ve ikinci koşu, ikincisi kirli ağaçla). Aynı komutlar gate dışında (`pnpm lint`, `db:generate && lint`, `FONBRIDGE_GATE_RUN=1` ortamıyla, stdin `/dev/null`, untracked rapor yokken) **hepsi exit 0**. Kök neden doğrulanamadı; üçüncü koşuda (temiz ağaç, rapor geçici olarak dışarıda) tekrar etmedi.
3. **Yeşil:** `GATE_EXIT=0`. Kilit 4 dk 30 sn beklendi. Bu koşuda `timeout 3000` (50 dk) kilit beklemesini kesti (ilk kuyruk denemesi, `GATE_EXIT=124`, gate hiç başlamadı); timeout kaldırıldı.

## Riskler

- Madde 4 ("en fazla 5 worktree") ile ofis kuralı "en fazla 4 aktif çalışan" farklı kavramlar (worktree sayısı ↔ aktif ajan sayısı); bu PR ikisini eşitlemiyor. Lider kararı gerekebilir, bu iş için kapsam dışı.
- Gate kuyruğu uzun (tek koşu 30–100 dk bekleyebiliyor); worktree gate'i için test DB adı kuralı `CLAUDE.md` "Worktree'de gate" bölümünde yazılı değil (yalnız `tests/jobs-enqueue-force.live.test.ts` içinde).

## Değişen dosyalar

- `CLAUDE.md` (+7)
- `AGENTS.md` (+6)
- `docs/agent-results/NG-379-pm-gnd.md` (bu rapor)

## Platform beyanı

Yalnız Markdown değişikliği; platforma bağlı kod yolu yok. Doğrulama **Linux (WSL Ubuntu 24.04)** üzerinde yapıldı (worktree, DB ve gate burada). macOS ve Windows'ta da aynı metin geçerli; koşu yapılmadı, koşulamadı diye işaretlemiyorum: içerik düz metin olduğu için platform farkı beklenmiyor.

## Açık sorular

- #342'nin kapatılması: lider kararı; #342 kapatılmadı.
- Worktree gate DB adı kuralı (`fabrika_test_ng<sayı>`) `CLAUDE.md`'ye yazılsın mı? Bu PR'da eklenmedi: kart "yalnız CLAUDE.md ve AGENTS.md, #342 metni" dediği için kapsam dışı.

## Sonraki adım

1. Push + base `dev` draft PR, açıklamada "#342'nin yerini alır" (bu rapor commit'lendikten sonra).
2. PR CI yeşil; merge sonrası `docker rm -f ng379-pg`, worktree ve yerel dal temizliği (kural 1).
