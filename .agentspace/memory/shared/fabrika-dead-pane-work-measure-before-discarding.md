---
name: fabrika-dead-pane-work-measure-before-discarding
description: Pane ölünce ağaçta kalan yarım işi atma — önce typecheck+test ile ölç, çoğu kez derleniyor ve testleri geçiyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

AgentSpace yeniden başlayınca pane'ler ölüyor ve delegasyon "BAŞARISIZ · kanıt yok" olarak
raporlanıyor. Bu, **işin çöp olduğu anlamına gelmiyor**: 2026-09-07'de 5 pane öldüğünde çalışma
ağacında kalan kod `pnpm typecheck` temiz geçti ve `pnpm test` 765/773 verdi (ölümden önceki taban
725'ti — yani ölü ajanların yazdığı yeni testler de yeşildi).

**2026-09-08 ek — ölçüm dosya dosya yapılmalı, ve "erken commit et" göreve yazılmalı.**
Yedi pane 26 dakikalık bir dalganın ortasında öldü. Ölçüm: dördünün işi ağaçtaydı
(`documents/client.tsx`, `system-alert.ts` + yeni `__tests__/`, `schema-contract.test.ts`
stage'lenmemiş; blog-yazar'ınki `A`/`MM` ile INDEX'te), birinin (Python worker) hiçbir izi
yoktu, birinin doğrulama raporu hiç yazılmamıştı. Yani "hepsi gitti" de yanlış, "hepsi duruyor"
da. Yeniden dağıtırken her ajana KENDİ dosya listesini ve "önce `git diff`/`git diff --cached`
ile ne kaldığını ölç, üstüne devam et" cümlesini ver — "baştan yap" 26 dakikayı iki kez ödetir.
Ayrıca göreve "işin bitince HEMEN kendi yollarınla commit et" yaz: bu dalgada yalnız commit'li
iş (geli-tirici, `eb71306`) yeniden başlatmadan sağ çıktı.

Kural: "kanıt yok" raporunu gördüğünde `git diff --stat` + `pnpm typecheck` + `pnpm test` KOŞ.
Eksik olan genelde kod değil; eksik olan **doğrulama, migration'ın uygulanması, tarayıcı kanıtı ve
commit**. Ajanı "baştan yap" diye değil, "bitir ve indir" diye geri gönder.

**2026-09-08 ek — ölçümü ÇALIŞMA AĞACIYLA SINIRLAMA: işin HEAD'de olabilir.**
Yeniden başlatmadan sonra `git diff -- messages/` boş çıktı, ilk okuma "i18n anahtarlarım
uçmuş" oldu. Gerçek ölçüm (`git show HEAD:messages/tr.json | grep <anahtar>`) tersini
söyledi: anahtarlar HEAD'deydi — başka bir ajanın pathspec'siz commit'i (`37202a5`,
m11 lint temizliği) onları kendi commit'ine süpürmüştü. Boş `git diff` iki AYRI şey
demek olabilir: "iş kayboldu" ya da "iş başkasının commit'inde". Körlemesine yeniden
uygulasaydım `messages/tr.json` içinde ÇİFT anahtar üretirdim (JSON hâlâ parse eder,
son değer kazanır — sessiz bozulma).

Kural: yarım işi tamamlamadan önce paylaşılan dosya için `git show HEAD:<dosya> | grep
<kendi anahtarın>` koş. Varsa dokunma, raporda "başkasının commit'i taşıdı" diye yaz.

`git reset --hard` / `git checkout .` bu durumda saatlerce işi siler — ajanlara açıkça yasakla ve
`git add -A` yerine dosya dosya `git add <yol>` iste (ağaçta başka ajanların işi de duruyor).

İlgili: [[fabrika-parallel-agent-file-race]]
