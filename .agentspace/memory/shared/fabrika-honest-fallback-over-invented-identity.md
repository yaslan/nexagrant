---
name: fabrika-honest-fallback-over-invented-identity
description: Fabrika'da bir `||` fallback'i eksik veriyi UYDURUYORSA bu bir bug'dır — kimlik/rol için doğru cevap gerçek veriden türetmek ya da "bilinmiyor" demek, en yüksek/en tanıdık değeri varsaymak değil
metadata:
  type: project
  updatedAt: 2026-09-07
---

S10-S11'de tekrar tekrar aynı desen çıktı: eksik bir alan için yazılan `x || <sabit>` fallback'i,
kullanıcıya olmayan bir gerçeği anlatıyor. TASK-MTR5BGKNELCO2'de uygulama çerçevesi
`user.name || (email.includes('ayse') ? 'Prof. Dr. Ayşe Kaya' : 'Dr. Mehmet Yılmaz')` diyordu:
adsız her oturum BAŞKA BİR KİŞİNİN adını ve unvanını görüyordu.

Kural: fallback yalnızca oturumun/kaydın GERÇEKTEN taşıdığı veriye düşebilir, yoksa çevrilmiş bir
"bilinmiyor" etiketine. Ad için sıra: gerçek ad → e-postanın yerel kısmı → `t('UserIdentity.unnamedUser')`.
Tek kaynak `src/lib/user-display.ts` (`displayUserName`, `emailLocalPart`).

Bir rol/yetki fallback'i gördüğünde ÖNCE ölç, sonra sınıflandır — ikisi çok farklı iş:
- Değer karar veriyorsa (authz'a giriyorsa) → güvenlik kusuru, ayrı P0.
- Yalnız render ediliyorsa → yanlış bilgilendirme; yine düzelt ama P0 açma.
Fabrika'da ölçümün cevabı: yetki kararları prop'u değil sunucudaki `session.role`'ü okur
(`src/lib/tenant.ts`, `src/lib/rbac.ts`) ve tenant.ts eksik rolü `'MEMBER'`e düşürür — EN DÜŞÜĞE,
en yükseğe değil. Layout'un `|| 'TENANT_OWNER'`'ı bu yüzden kapı açmıyordu, sadece yalan söylüyordu.

Aynı sınıfın en ağır hâli görüntüleme değil KAYIT: `src/lib/dual-approval.ts` çift onay denetim
kaydına `actorName` olarak varsayılan bir kişi adı yazıyor (TASK-MTR60M5ESB5PZ). Bu sınıfı tararken
"gösteriliyor mu, kaydediliyor mu" ayrımını yap; kaydedilen her zaman daha yüksek öncelikli.

Tarama komutu: `grep -rn "|| 'Dr\.\|includes('ayse')\|@fabrika.app'\|TENANT_OWNER'" src/`
`login/**` altındaki demo hesap listesi ve `src/lib/auth.ts` DEMO_PROFILES MEŞRU, dokunma.

İlgili: [[fabrika-mint-a-session-cookie-to-test-unreachable-states]] · [[fabrika-agents-share-one-working-tree]]
