---
name: fabrika-inherited-code-cites-numbers-nobody-measured
description: Devralınan koddaki gerekçe yorumları ölçülmemiş rakam taşıyabilir — kartın kanıt dosyasıyla karşılaştır; ayrıca kartın "devraldığın dosyalar" listesine güvenme, alanı git status ile tara
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Ölü bir pane'den TASK-MTSY71BUMBLWM'i devraldım. Kod mantık olarak sağlamdı ve gerekçe yorumları
ikna edici yazılmıştı — ama iki yerde gerçekle örtüşmüyordu:

1. `identity-actions.ts` başlığı *"217 of the 250 open operator alerts were that one gap"* diyordu.
   Kartın işaret ettiği ölçüm dosyası (`TASK-MTTUUGKNDGBXK-evidence/01-alert-pile-before.txt`)
   **106 satır, 82'si (%77.4)** diyordu. 217/250 diye bir ölçüm hiçbir yerde yoktu.
2. Kart "devraldığın dosyalar" diye **üç** dosya sayıyordu. Ağaçta **sekiz** vardı: asıl yazıcı olan
   server action, iki birim test dosyası, bir çapa bağlantısı ve 31 i18n anahtarı da oradaydı.
   Sadece kartın saydıklarına baksaydım, var olan action'ı yeniden yazardım.

**Neden:** Ölü pane'in bıraktığı prose, kodun kendisinden daha az denetlenmiştir — kimse onu
koşmadı. İkna edici bir yorum, ölçülmüş bir yorum değildir. Kart metni de bir anlık görüntüdür;
ölen worker karttan sonra dosya eklemiş olabilir.

**Nasıl uygularım:**
- Devralınan koddaki HER sayısal iddiayı kaynağına götür: yorumda kanıt dosyası adı varsa `grep`'le,
  yoksa iddia dayanaksızdır — düzelt ya da kaldır, sessizce taşıma. (CLAUDE.md §7'nin ruhu yorumlara
  da işler.)
- Devralınan iş listesini karttan değil ağaçtan çıkar:
  `git status --porcelain -- <ilgili dizinler>` + `ls -la`. Kartın listesi alt kümedir.
- İlk komut `pnpm typecheck` olsun: benim durumumda kapıyı kırmızı tutan 4 hatanın **hepsi** devralınan
  tek bir test dosyasındaydı ve kimse görmemişti — kod yazılmıştı, bir kez bile koşulmamıştı.
- Raporda "devraldığım" ile "değiştirdiğim"i AYRI başlıklarda yaz; yoksa selefin işi senin kanıtın
  gibi görünür.

Bkz. [[fabrika-prove-a-gate-failure-is-not-yours]] — orada kırmızının sahibini bulma; burada
kırmızının sahibi sensin çünkü işi devraldın.
