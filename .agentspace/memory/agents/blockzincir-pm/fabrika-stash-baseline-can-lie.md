---
name: fabrika-stash-baseline-can-lie
description: Stash ile "benden mi?" ölçerken baseline iki şekilde YALAN söyler — stash hiç olmamıştır (tırnaksız pathspec) ya da dev server yarım derlenmiştir; ikisini de doğrula
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

[[fabrika-blame-the-e2e-failure-with-a-stash]] tekniği doğru, ama 2026-09-08'de iki kez
**yanlış baseline** ölçtüm. İkisi de sessiz.

**1. Stash hiç olmadı.** Dosya listesini shell değişkeninde tutup tırnaksız geçmek
(`git stash push -- $MINE`) tüm listeyi **tek bir pathspec** yapar; Fabrika'da yollarda
`[locale]` ve boşluk olduğu için bu kesin. Git `pathspec ... did not match any file(s)`
der ve **hiçbir şey stash'lenmez**. Sonra testi koşarsın, "baseline" diye kendi kodunu
ölçersin. O koşuda `notifications-read-store` düştü ve neredeyse kendi değişikliğime
yazacaktım — gerçekte flaky bir testti.

Kural: her yolu **ayrı ayrı ve tırnaklı** geç, ve `push` çıktısında
`Saved working directory` satırını gör:
```bash
git stash push -m probe -- "messages/en.json" "src/app/[locale]/(app)/layout.tsx" ...
```
Takip edilmeyen (untracked) yeni dosyalarını stash almaz — onları elle `mv /tmp/...`
edip sonra geri koy.

**2. Dev server yarım derlenmiş.** Dosyaları stash'leyip hemen Playwright koşarsan
`next dev` hâlâ recompile ediyordur; ilk baseline denemem 1 yerine **3 hata** gösterdi,
üstelik farklı hatalar. Ayrıca `reuseExistingServer` o anda sağlık kontrolünü
kaçırıp `EADDRINUSE` ile patlayabiliyor.

Kural: dosya takasından sonra **ısıt ve bekle**, sonra ölç:
```bash
curl -s -o /dev/null http://localhost:3000/tr/giris; sleep 6
```

**Baseline ancak şu ikisi sağlanınca geçerlidir:** stash gerçekten oldu VE hata mesajı
(sadece "1 failed" değil, **aynı locator/aynı satır**) birebir aynı. Benim kanıtım buydu:
`m10-audit-identity` hem benimle hem bensiz `getByText('Çift Onaylı Kurumsal Yetki Akışı')`
→ `element(s) not found` verdi. Bkz. [[fabrika-stash-pop-can-silently-fail]].
