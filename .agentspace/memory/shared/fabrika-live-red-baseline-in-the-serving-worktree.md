---
name: fabrika-live-red-baseline-in-the-serving-worktree
description: Bir rotanın kusurunu CANLI HTTP ile kırmızı göstermenin güvenli yolu — dosyayı paylaşılan ağaçta değil, dev sunucusunu servis eden KENDİ worktree'nde `git show HEAD:` sürümüyle geçici takas et
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

[[fabrika-ab-baseline-without-git-stash]] "kendi dosyanı `git show HEAD:` sürümüyle takas et"
diyor, ama takası **paylaşılan ağaçta** yapıyor. Bir güvenlik/rota kusurunu `curl` ile kırmızı
göstereceksen bu gereksiz risktir: o saniyelerde başka bir ajanın dev sunucusu hot-reload ile
eski kodu derler, onun ölçümü kirlenir.

Zaten [[fabrika-parallel-dev-server-needs-a-worktree]] gereği kendi `git worktree`'nde bir dev
sunucusu koşuyorsun. Takası ORADA yap — paylaşılan ağaca hiç dokunma:

```bash
cp "$WT/src/.../route.ts" "$SC/route-fixed.ts"                 # düzeltilmiş sürümü yedekle
git show HEAD:src/.../route.ts > "$WT/src/.../route.ts"        # KIRMIZI: worktree eski kodu servis eder
sleep 5 && curl -s -o red.bin -w "HTTP %{http_code}\n" "http://localhost:$PORT/..."
grep -c '<sızması-yasak-markör>' red.bin                       # 1 = kusur canlı
cp "$SC/route-fixed.ts" "$WT/src/.../route.ts"                 # YEŞİL: geri koy
sleep 5 && curl -s -o green.bin -w "HTTP %{http_code}\n" "http://localhost:$PORT/..."
```

2026-09-08, TASK-MTS9VGEKE8N3B: `/api/documents/export` böyle ölçüldü — kırmızıda oturumsuz
`curl` **HTTP 200** ve inen dosyada başka kiracının Part B metni (`grep -c` → 1); yeşilde
**HTTP 401**, aynı grep → 0. Kod okumak bunun yerine geçmez: "auth çağrısı yok" bir gözlem,
"oturumsuz istek 200 döndü ve şu baytlar indi" bir ölçümdür.

**Why:** P0 güvenlik kartlarında rapor okuyucusunun sorduğu ilk şey "gerçekten sızıyor muydu"dur.
Fikstür markörü (`KIRACI-B-GIZLI-…`) inen baytların içinde görünmeden bu soru kapanmaz.

**How to apply:** Bir rota düzelttiysen ve kart "önce açıktı" diyorsa, düzeltmeden SONRA kırmızıyı
bir kez geri getirip ölç; iki curl çıktısını da rapora yapıştır. Takası yalnız kendi worktree'nde
yap, bitince orijinal dosyayı geri koyduğunu `head -3` ile doğrula.

İlgili: [[fabrika-ab-baseline-without-git-stash]] · [[fabrika-parallel-dev-server-needs-a-worktree]] ·
[[fabrika-agents-share-one-working-tree]]
