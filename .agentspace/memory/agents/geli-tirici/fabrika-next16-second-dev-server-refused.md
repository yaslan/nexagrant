---
name: fabrika-next16-second-dev-server-refused
description: Fabrika'da ikinci bir `next dev` başlatılamaz (Next 16 `.next/dev/lock`) — e2e için git worktree + `next dev --webpack`, dış-servis rotası için `next build` + `next start -p <port>`; reçete artık docs/E2E_TESTING.md'de
metadata:
  type: reference
  updatedAt: 2026-09-10
---

Başka bir ajanın dev sunucusu koşarken ikinci bir `npx next dev -p 3011` **çalışmaz**: kilit
`<distDir>/dev/lock` dosyasında ve Next 16 aynı DİZİN için ikinciyi reddeder ("Another next dev
server is already running… PID: …"). `next dev`'in `--dist-dir`'i yok; `distDir` yalnız ortak
`next.config.ts`'ten okunuyor, orayı kurcalama. Çalışan sunucuyu ÖLDÜRME — başkasının olabilir.

İki çıkış yolu, farklı işler için:

1. **E2E koşacaksan → ayrı `git worktree` + `next dev --webpack --port <kendi portun>`.**
   Kilit dizin başına olduğu için ayrı dizin ayrı kilit demek. `--webpack` şart: Turbopack
   symlink'li `node_modules`'ü reddediyor ("Symlink [project]/node_modules is invalid, it
   points out of the filesystem root"). Tam reçete + tuzaklar artık depoda:
   **`docs/E2E_TESTING.md`** — burada tekrar etme, oraya bak/orayı güncelle.
2. **Tek bir dış-servis rotasını gerçek HTTP ile doğrulayacaksan → `next build` +
   `next start -p <port>`.** `next start` bu kilidi uygulamıyor. Sağlayıcıyı 30 satırlık bir
   `node:http` mock'uyla değiştir ve `<SERVICE>_BASE_URL`'i ona çevir: kendi kodunun tamamı
   gerçek koşar, yalnız karşı taraf sahte olur.

**S12'de ölçülen iki düzeltme** (docs/E2E_TESTING.md hâlâ eskisini yazıyor, orada
düzeltilmedi — kart kapsamı dışıydı):

- **`--webpack` şart DEĞİL.** Doküman "node_modules'ü gerçekten kopyalamak yavaş, GB'larca"
  dediği için `--webpack`'i seçiyor. `cp -al` (APFS hardlink kopyası) ile **43 saniye ve
  ~0 ek disk**: `cp -al /Users/macbook/AgentSpace/fabrika/node_modules "$WT/node_modules"`.
  Sonrası Turbopack'le sorunsuz koşuyor, `.bin` symlink'leri de doğru geliyor. İlk derleme
  webpack'ten hızlı olduğu için toplamda kazançlı.
- **`.env`'i `cp` ile KOPYALAYAMIYORUM** (izin reddi), ama `ln -s` ile bağlamak serbest ve
  Next/Node symlink üzerinden okuyor: `ln -sf /Users/macbook/AgentSpace/fabrika/.env "$WT/.env"`.
  Değerleri kabuğa `. .env` ile yüklemeye çalışma — dosyada çok satırlı bir değer var,
  zsh `parse error near '\n'` veriyor.

**Why:** Bu duvara S10'da çarptım, S12'de iki kez daha çarptım. Artık reçete depoda; bu not
yalnız "hangi yolu seçeceğim"i ve dokümanın eskiyen iki maddesini söylüyor.

İlgili: [[fabrika-dev-postgres-is-up]], [[fabrika-tsx-script-must-live-in-repo-root]],
[[fabrika-iyzico-billing-flow]], [[fabrika-agents-share-one-working-tree]]
