---
name: feature-can-be-complete-and-unreachable
description: Bir özelliğin sayfası + API'si + i18n'i + testi yeşil olabilir ve özellik yine de ÖLÜ olabilir — hiçbir yer ona link vermiyorsa; denetimde "var mı" değil "ulaşılabilir mi" diye sor
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

TASK-MTPZF8X1W8WCU (E10.3 KVKK/GDPR): kart "uçlar gerçekten çalışıyor mu, silme gerçekten
siliyor mu" diye sordu. Ölçtüm — **çekirdek kusursuzdu**: export özneye kapsanmış, OAuth
sırları dışarıda, silme 30 gün soft + gerçek purge, kiracı izolasyonu sağlam, 12 şema
sütununun 12'si mevcut. Canlı DB'ye karşı yazdığım 12 test **ilk koşuda geçti**.

Ama özellik **ölüydü**: `settings/privacy` sayfasına hiçbir yerden link yoktu.
`src/lib/routes.ts`'te `settingsPrivacy` anahtarı yoktu, `UserMenu`/`SidebarNav`'da giriş
yoktu, Türkçe `ayarlar/gizlilik` takma yolu yoktu (diğer TÜM ayar sayfalarının vardı) —
yani Türkçe kullanıcı sitenin kendi kuralını izleyip **404** alıyordu. Kullanıcı KVKK
md.11 hakkını ancak URL'yi elle yazarak kullanabiliyordu.

**Why:** "Özellik var mı?" sorusunu dosya varlığıyla yanıtlamak yanıltıcıdır. Sayfa, API,
çeviri anahtarı ve test — hepsi tek tek yeşil olabilir çünkü bunların hiçbiri *giriş
noktasını* kanıtlamaz. Ulaşılabilirlik kodun içinde değil, **navigasyon grafiğinde** yaşar
ve o grafiğe hiçbir birim testi bakmaz. İlk koşuda geçen bir test takımı da bir sinyaldir:
"burada bug yok" değil, **"yanlış yere bakıyorum"** demek olabilir.

**How to apply (Explorer olarak, bir "X uyumu/özelliği çalışıyor mu" kartında):**

1. Yüzeyi bulduktan sonra **geriye doğru yürü**: bu sayfaya kim link veriyor?
   `grep -rn "<route-key>\|<path>" src/` → yalnız sayfanın kendisi ve bir route
   *kataloğu* çıkıyorsa, **link yok demektir**. Katalogda olmak ulaşılabilirlik değildir.
2. Rota yardımcısını kontrol et (`src/lib/routes.ts`): anahtar yoksa hiçbir bileşen
   tipli biçimde link **veremez** — bu tek başına "ölü sayfa" kanıtıdır.
3. Fabrika'da her ayar sayfasının bir TR takma yolu (`ayarlar/...`) vardır; eksikse
   Türkçe kullanıcı 404 alır. `WORKSPACE_ROUTE_ALIASES` ile dizin listesini karşılaştır.
4. Kanıtı **kontrollü** üret: var olmayan bir yol (`ayarlar/bogus-yok` → 404) ile yeni
   yolu (→ 307 giriş yönlendirmesi) yan yana curl'le. 307 tek başına bir şey kanıtlamaz;
   404 kontrolüyle birlikte kanıtlar.
5. Çekirdek sağlamsa bunu **açıkça yaz** ve kartın bayat olduğunu söyle; sonra gerçek
   boşluğu (erişilebilirlik, hesap verebilirlik kaydı, i18n) önem sırasıyla raporla.

Aynı turda çıkan ikinci desen: **dokümanın iddiası bir kaynaktır, kanıt değil.**
`docs/SECURITY_COMPLIANCE.md` "muhatap silme isteği formu (herkese açık)" diyordu — kodda
böyle bir rota yok. Aydınlatma sayfası da kendi yorumunda "copy `legal.privacy`'de" diyordu
ama gövde metni `isTr ? … : …` olarak gömülüydü. Bir dosyanın kendi yorumu bile eskir:
iddiayı dosyanın **gövdesine** karşı doğrula.

İlgili: [[fabrika-hardcoded-copy-defeats-grep-audit]] · [[fabrika-board-cards-go-stale]] ·
[[prove-a-gate-catches-the-bug-without-a-worktree]]
