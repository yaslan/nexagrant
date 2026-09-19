---
name: a-suggested-fix-can-encode-the-same-bug-it-targets
description: A handed-down fix hypothesis for a money/plan bug ("probably switch to column Y") can itself be the inverted-behavior bug — measure every write path before implementing, especially when the "more specific"-sounding field is the less reliable one
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

## Kural

Bir görev "gözlenen sonuç TERS, muhtemel doğru cevap şu sütuna geçmek" diye bir
hipotezle gelirse, o hipotezi kod DEĞİŞTİRMEDEN önce **her yazma yolunu** çıkar
ve ölç. [[a-handed-down-root-cause-is-a-hypothesis]]'in bir adım ötesi: orada
devralınan TEŞHİS hipotezdi, burada devralınan **DÜZELTMENİN KENDİSİ** hipotez —
ve tam da hedeflediği ters-davranışı yeniden üretebilir.

## Neden (TASK-MTUI9R0FOOY2J)

Kart: plan silme muhafızı (`countLiveSubscriptions`, `Subscription.planId`
sayıyor) TERS davranıyordu (canlı planı sil, boşu engelle); "muhtemel doğru
cevap `planVersionId → planVersion.planId` üzerinden saymak" deniyordu.

Her yazma yolu çıkarıldı (`subscription-sync.ts`, `iyzico.ts`,
`publishVersion`'ın abonelik taşıma adımı, seed'ler): `planId` HER
create/update'te koşulsuz yazılıyor — "bu abonelik hangi plana ait" sorusunun
tek kaynağı. `planVersionId` ayrı bir kavram (hangi *sürümün şartlarından*
yararlanıyor), nullable, ve hedef planın yayınlanmış sürümü yoksa **bilerek**
eskide bırakılıyor. Hipotezi uygulamak — guard'ı `planVersionId`'ye bağımlı
kılmak — TERS sonucu birebir yeniden üretirdi: nullable/gecikmeli bir alan bir
plan değişince hemen güncellenmeyebilir, tam da gözlenen ters davranışı
doğurur. Gerçek kök neden guard'da değil, paylaşılan `demo-tenant`'a binen bir
e2e test yardımcısının yalnız `planId` yazıp `planVersionId`'yi sürüklemesiydi
([[fabrika-a-restore-to-original-cements-a-leaked-fixture]]) — ayrı bir kartta
(TASK-MTUI9ZBK7W4JY) eşzamanlı düzeltiliyordu.

## Nasıl uygulanır

- "Muhtemel doğru cevap X" diye gelen bir öneriyi **doğrulanmamış** say. Önce
  `grep -rn` ile o tabloya/alana yazan HER yeri çıkar, her birinde alanın ne
  zaman/nasıl dolduğunu oku.
- İki alan aynı satırda anlamlı bir kavramı temsil ediyor gibi görünse de
  ("hangi plan" vs "hangi sürüm") birbirinin YERİNE geçmez — biri nullable/
  gecikmeli ise para kuralında güvenilir kaynak DEĞİLDİR, ne kadar "daha
  spesifik" görünürse görünsün.
- Hipotez ölçümle çürüyorsa kodu DEĞİŞTİRME; bunun yerine (a) mevcut
  davranışın zaten doğru olduğunu kanıtlayan **adversarial** bir regresyon
  testi ekle — gerçek bozuk-veri şeklini (iki sütun kasıtlı çelişecek şekilde)
  üretip mevcut/değişmemiş koda karşı koş — ve (b) kararı `docs/ROADMAP.md`
  "Açık kararlar"a, gerekçesiyle birlikte yaz.
- Veri bozulması bir kod şüphesi doğurduysa, kanıtı "kod değişmeden veri
  düzelince yeşile döndü" diye rapor etmek yetmez — bir sonraki kişi aynı
  yanlış hipotezi tekrar önerebilir; regresyon testi bunu kalıcı olarak kapatır.

[[a-handed-down-root-cause-is-a-hypothesis]] ·
[[fabrika-a-restore-to-original-cements-a-leaked-fixture]] ·
[[fabrika-e2e-seed-riding-specs-go-red-on-plan-drift]]
