---
name: fabrika-concurrent-commit-steals-your-stage
description: Fabrika'da başka bir ajanın commit'i senin stage'lediğin VE hiç stage etmediğin dosyaları kendi commit'ine alabilir — "commit etmezsem güvendeyim" yanlış; kaynak değişikliğini doğrulamayı beklemeden erken commit et
metadata:
  type: project
updatedAt: 2026-09-10
---

Paralel ajanlar tek çalışma ağacını **ve tek git index'ini** paylaşıyor. `git add <yollarım>`
ile `git commit <yollarım>` arasındaki saniyelerde başka bir ajan commit alırsa, senin
stage'lediğin dosyalar **onun commit'ine** dahil olur ve senin çağrın
`no changes added to commit` ile döner.

Bu bir hata değil, bir yarış. Yapılacaklar:
1. Panik yapma, `git stash`/`git reset` ile "kurtarmaya" kalkma — iş kaybolmadı.
2. `git log --oneline -3` + `git cat-file -e <sha>:<yol>` ile her dosyanın hangi commit'e
   girdiğini **doğrula**.
3. Paylaşılan `dev` branch'inde geçmişi yeniden yazma (`--amend`, rebase). Bunun yerine
   sonuç raporuna "kodum şu sha'da, mesaj bana ait değil" satırını yaz ki sonra kimse
   kayıp commit aramasın.
4. Aynı şey `messages/tr.json`/`en.json` için de olur: senin anahtarların başkasının
   commit'iyle gidebilir. Commit sonrası `git show HEAD:messages/tr.json` ile kendi
   anahtarlarının durduğunu **doğrula** (görev kuralı zaten bunu istiyor).

Ters yön de olur: **stage'lediğin dosya BAŞKASININ commit edilmemiş işini de taşıyor olabilir.**
`git diff --cached <dosya>` beklediğinden çok satır gösteriyorsa o dosyayı olduğu gibi commit
etme — `git restore --staged <dosya>` ile çıkar, sonra yalnız kendi hunk'ını indekse uygula:

```
git restore --staged <dosya>
git apply --cached /tmp/benim-hunk.patch   # yalnız senin satırların
```

Patch uymazsa (`patch does not apply`) sebebi genelde HEAD'in bu arada kaymış olmasıdır:
`git diff HEAD <dosya>` tekrar bak — çoğu zaman senin satırın zaten karşı tarafın commit'ine
girmiştir ve yapacak bir şey kalmamıştır. "diff yok" = kayboldu DEĞİL;
`git show HEAD:<dosya> | grep '<senin satırın>'` ayırt eder.

Pencereyi daralt: yazdıktan hemen sonra stage'le, doğrulamayı stage'ten sonra yap,
`git add` ile `git commit` arasına uzun komut koyma.

## Yarışı tamamen atlatan yol: kendi geçici index'in (2026-09-07'de kullanıldı)

Paylaşılan index'e hiç dokunmadan commit alınabilir. Başka bir ajanın stage'lediği dev bir
iş dururken (`git diff --cached --stat` 25 dosya gösteriyordu) yalnız kendi 13 dosyamı
commit etmenin yolu:

```bash
export GIT_INDEX_FILE=/tmp/my-index          # paylaşılan .git/index'e DOKUNULMAZ
rm -f "$GIT_INDEX_FILE"
HEAD_SHA=$(git rev-parse HEAD)
git read-tree "$HEAD_SHA"
git add -- <yalnız kendi yollarım>
git diff --cached --stat "$HEAD_SHA"          # DOĞRULA: yalnız senin dosyaların
TREE=$(git write-tree)
COMMIT=$(git commit-tree "$TREE" -p "$HEAD_SHA" -F msg.txt)
git update-ref refs/heads/dev "$COMMIT" "$HEAD_SHA"   # eski değer verilir → yarışta güvenli
unset GIT_INDEX_FILE
git reset -q -- <kendi yolların>              # ŞART: paylaşılan index'i yeni HEAD'e hizala
```

Son `git reset` **atlanamaz**: onsuz paylaşılan index senin dosyaların için hâlâ eski blob'u
tutar, bir sonraki ajanın `git commit`'i onu "değişiklik" sanıp **senin işini geri alır**.

Bir dosya hem seninkini hem başkasınınkini taşıyorsa (ör. `messages/*.json`) çalışma ağacını
hiç bozmadan yalnız kendi sürümünü stage'le:

```bash
git show HEAD:messages/tr.json > base.json
node -e "…base + yalnız senin ad alanın → staged.json…"
SHA=$(git hash-object -w --path messages/tr.json -- staged.json)
git update-index --cacheinfo 100644,$SHA,messages/tr.json
```

İlgili: [[fabrika-agents-share-one-working-tree]] · [[fabrika-parallel-agent-file-race]]

## Ters yön: `git reset --soft` + yeniden commit SENİN commit'ine BAŞKASININ dosyalarını alır (2026-09-08, yaşandı)

Yukarısı "başkasının commit'i benim dosyalarımı yuttu" yönünü anlatıyor. Aynı paylaşılan
index **ters yönde** de ısırıyor ve tetikleyicisi farklı:

`git commit` mesajını düzeltmek / hook'u doğru koşturmak için `git reset --soft HEAD~1`
yapıp yeniden commit ettim. `reset --soft` commit'in içeriğini **index'e** geri koyar;
`git commit` (yol argümanı olmadan) **index'in tamamını** commit eder. Reset ile commit
arasındaki saniyelerde başka bir ajan `git add` yaptıysa, onun dosyaları da senin
commit'ine girer. Ölçüldü: 15 dosya stage'lemiştim, commit **20** dosyayla çıktı — beşi
başka bir ajanın ESR calibration işiydi (`scripts/esr-calibration.ts`,
`tests/esr-calibration.test.ts`, `src/lib/beta/esr-readiness.ts`, iki doküman).

**Kural:** `git commit` çağırmadan **hemen önce** `git diff --cached --name-only` koş ve
listeyi gözünle doğrula — `reset --soft` sonrası dahil, özellikle o zaman. Liste
şişmişse `git restore --staged <onların-yolları>` ile ayıkla, kendi commit'ini al, sonra
onların dosyalarını `git add` ile **buldğun hâle** geri koy (onların çalışması silinmez,
yalnız index'e geri konur).

**Düzeltmesi:** `git reset --soft HEAD~1` → `git restore --staged <onların>` →
`git commit` → `git add <onların>`. Çalışma ağacındaki içerikleri hiç değişmez.

## Stage ETMEMEK de korumaz (2026-09-09, TASK-MTU27KSLSJZ9I)

Yukarısı *stage'lediğin* dosyaların kapılmasını anlatıyor. Daha kötüsü de oluyor:
**hiç stage etmediğin** çalışma-ağacı değişikliklerin de başkasının commit'ine girebilir.

`src/lib/money.ts`, `src/lib/efatura.ts`, `src/lib/billing/invoice-list.ts` dosyalarını
düzenledim, sonra ~10 dakika test yazıp `pnpm test`/`typecheck`/`lint` koştum — hiçbirini
`git add` etmemiştim. O sırada başka bir worker (blok-zincir-dev) commit aldı ve
`cfe54af test(billing): fail the invoice export gate…` benim üç dosyamı da (+85 satır)
kendi içine aldı. `git status` bana temiz göründü; fark ancak `git diff --stat`'ın yalnız
test dosyalarımı göstermesiyle anlaşıldı.

Sonuç: "commit etmezsem güvendeyim" YANLIŞ. Paylaşılan ağaçta tek koruma **erken commit**:
kaynak değişikliği tutarlı hale gelir gelmez, doğrulama fazını BEKLEMEDEN
`git commit <yol> -F -` ile kendi mesajınla al. Doğrulama kırmızı çıkarsa üstüne ikinci bir
commit atarsın; alternatifi işinin yanlış mesajla tarihe geçmesi.

Kapıldıysa: `git show --stat <sha>` ile hangi dosyaların nereye gittiğini doğrula, paylaşılan
`dev`'de `--amend`/rebase DENEME, sonuç raporunun "Riskler" bölümüne "kodum şu sha'da, mesaj
bana ait değil" satırını yaz.

## En kötü kombinasyon: senin mesajın BAŞKASININ diff'ini taşıdı, senin diff'in HİÇ commit'lenmedi (2026-09-10, TASK-MTSY7HZRYWWEL ↔ TASK-MTVFKK8UZS5BF, commit `14c04f3`)

Yukarıdaki vakalar hep "commit ALDIM ama beklediğimden fazla/az dosya içeriyor" şeklinde —
en azından bir commit var, doğrulanabilir. Bu daha sinsi bir varyant: **commit'in mesajı
senin işini anlatıyor, ama `git show <sha>`'nın gerçek diff'i tamamen başka bir ajanın işi.**
Senin gerçek değişikliğin ise index'e hiç girmemiş, çalışma ağacında commit'lenmemiş (`M`)
olarak kalmış — `git commit -m "..."` çağrısı o an index'te DURAN (başkasının stage'lediği)
içeriği aldı, senin mesajınla etiketledi.

Ölçülen durum: `14c04f3` mesajı *"require buyer identity from TenantBillingIdentity for
iyzico"* (TASK-MTSY7HZRYWWEL, iyzico'nun uydurma VKN göndermesini engelleme), gövdesi de bunu
ayrıntılı anlatıyor ("createIyzicoCheckout now throws...", "All 1804 tests pass"). Ama
`git show 14c04f3`'ün gerçek diff'i `messages/{tr,en}.json` + `admin/alerts/{client,page}.tsx`
— **başka bir görevin** (TASK-MTVFKK8UZS5BF, alarm konsolu 300 satır kırpma düzeltmesi, bkz.
[[fabrika-alert-console-row-limit]]) işi. `src/lib/iyzico.ts`'e bu commit hiç dokunmuyor
(`git log -- src/lib/iyzico.ts` bu sha'yı listelemiyor). Gerçek iyzico değişikliği
(`identityNumber: buyer.identityNumber ?? '11111111111'` → zorunlu hale getirme) ölçüldüğü anda
hâlâ çalışma ağacında `M` olarak duruyordu — hiçbir commit'te değil.

Sonuç: board'da TASK-MTSY7HZRYWWEL `[done]` görünüyordu ama dayandığı commit o işi YAPMIYOR.
Kod doğru ve çalışıyordu (çalışma ağacında), fakat commit'lenmemiş bir güvenlik/doğruluk
düzeltmesi bir `git clean`/`git checkout --`/stash kaybıyla **sessizce** geri dönebilirdi —
üstelik testi de (`iyzico.test.ts`) aynı commit'lenmemiş diff'in içindeydi, yani regresyonu
yakalayacak test de kayboluyor.

**Kural — commit attıktan HEMEN sonra, mesaja değil `git show --stat HEAD`'in dosya
listesine güven:** mesajın anlattığı dosya o listede yoksa, o commit SENİN işini taşımıyor
demektir — mesaj yanlış etiketlenmiş, kodun hâlâ çalışma ağacında aranmalı
(`git status --short -- <beklediğin dosyalar>`). Bu, "bir görevin doğrulama talimatı sana
belirli bir sha gösteriyorsa, o sha'nın mesajını değil **diff'ini** oku" kuralının kaynağı —
bkz. [[fabrika-verification-recipe-mutation-and-counterfactual]].
