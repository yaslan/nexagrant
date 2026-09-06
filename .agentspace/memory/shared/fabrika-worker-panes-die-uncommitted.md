---
name: fabrika-worker-panes-die-uncommitted
description: Fabrika'da worker pane'ler ~30 dakikada code 129 ile ölüyor ve commit edilmemiş işi ağaçta bırakıyor — lider kurtarmak zorunda
metadata:
  type: feedback
  updatedAt: 2026-09-06
---

Bu depoda worker pane'ler işi bitirmeden **code 129 ile ölüyor** ve ürettikleri kod
`git`'e girmeden çalışma ağacında kalıyor. 2026-09-06 oturumunda bu **dört kez** oldu
(geli-tirici ×3, blok-zincir-dse ×1); her seferinde ölçülen ömür ~30 dakika civarıydı.

Kaybedilen iş her seferinde GERÇEKTİ ve bir kısmı sessiz güvenlik açığı bırakıyordu.
En pahalı örnek: `src/lib/tenant.ts` commit'liydi ve `/<locale>/no-workspace`'e
yönlendiriyordu ama **sayfanın kendisi untracked'di** → HEAD çalışma anında 404 veriyordu.

**Why:** "delegasyon bitti" bildirimi işin commit'lendiği anlamına GELMİYOR. Kanıt dosyası
yazılmış olabilir ama kod ağaçta durur ve bir sonraki ajan/uygulama yeniden başlatması
onu silebilir.

**How to apply:**
1. Her delegasyon bittiğinde ÖNCE `git status --porcelain` bak — rapora değil ağaca güven.
2. İş metnine şunu YAZ: "her parçayı bitirir bitirmez AYRI commit at, tek büyük commit için
   sona saklama". Görevi küçük ve commit'lenebilir parçalara böl (~30 dk'lık pane ömrüne göre).
3. Kalan işi kurtarırken önce `pnpm typecheck` + `pnpm test` koş, YEŞİLSE commit et;
   yolları tek tek sahnele, `git add -A` kullanma (bkz. [[fabrika-parallel-agent-file-race]]).
4. Ölmüş pane'in işi commit'lenmiş de olabilir — `git log` ile kontrol et, "kayıp" diye
   panikleme: ajanlar bazen kendileri commit'liyor.

İlgili: [[fabrika-board-cards-go-stale]], [[agent-exit-129-sighup]]
