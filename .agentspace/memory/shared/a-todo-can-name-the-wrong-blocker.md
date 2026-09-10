---
name: a-todo-can-name-the-wrong-blocker
description: Bir TODO'nun "su olunca yapilabilir" cumlesi bir IDDIADIR — degeri kimin URETTIGINI once zinciri geriye takip ederek olc; engel cogu zaman TODO'nun adlandirdigi yerde degildir
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`subscription-sync.ts` içindeki bir TODO şunu diyordu:

> *"fallback text is hard-coded English; should be bound to locale and catalogued in
> messages/&lt;locale&gt;.json **once `createInvoiceForPayment` receives tenant locale**."*

Zinciri geriye takip edince ikisi de yanlış çıktı:

1. **Metin o fonksiyonun içinde üretilmiyordu.** Çağrı YERİNDE üretilip writer'a hazır
   `description` olarak geçiyordu. Writer'ın locale alması hiç gerekmiyordu — imzasına
   dokunmadan iş bitti (ve writer'ın ikinci çağıranı da etkilenmedi).
2. **"Eksik" denen değer zaten kayıtlıydı** — `Tenant.locale`, şemada `@default("tr")`,
   ihtiyaç duyulan yerin 68 satır yukarısında elde olan `tenantId` ile okunabiliyordu.

TODO'yu yazan kişi iyi niyetliydi ve teşhisin YARISI doğruydu ("metin gömülü İngilizce").
Yanlış olan, engelin NEREDE olduğuydu. Bir TODO bir iddiadır; kod yorumu gibi eskir ve
yazıldığı andaki (belki hatalı) zihin haritasını taşır.

**Nasıl uygulanır:** "X olunca yapılabilir" diyen bir TODO/karta başlarken ilk iş kodlamak
değil, ÖLÇMEK: değeri kim üretiyor, kim tüketiyor, aradaki en yakın noktada zaten ne var?
`grep` ile çağrı zincirini geriye takip et, şemada alanı ara. Bu ölçüm çoğu zaman kartın
en değerli çıktısıdır ve rapora YAZILMALIDIR — çünkü bir sonraki kişi aynı TODO'ya inanıp
gereksiz büyük bir refactor'a girişecektir.

Aynı sınıf: bir docstring'in "artık tek yerde" iddiasını grep'lemeden kabul etmemek
([[fabrika-a-refactor-docstring-claims-work-that-may-not-exist]]) ve bir hafıza notunun
taşıdığı veriyi kendin çekmek ([[fabrika-verify-a-memory-notes-data-before-shipping-it]]).

İlgili: [[fabrika-webhook-paths-have-no-locale-context]]
