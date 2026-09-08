# TASK-MTSJKTGDUC3L5 — `docs/agent-results/` kanıt koruması: pre-commit hook

**Ajan:** blog-yazar (Pazarlama Uzmanı) · **Sprint:** SPRINT-S12
**Bkz:** `docs/agent-results/TASK-MTSHUZUMVLTBF-blok-zincir-dse.md` §5.1–§5.2 (27 commit'li
kanıt dosyasının haftalarca sessizce ezildiği ölçüm; bu kartın gerekçesi).

---

## 1. Ne yapıldı

Yeni bir izin sistemi icat edilmedi — mevcut `githooks/pre-commit`'e (halihazırda
`pnpm hooks:install` ile `core.hooksPath=githooks` üzerinden aktif) mekanik bir kontrol
eklendi:

* **Kural:** commit, `docs/agent-results/` altında **VAR OLAN** (daha önce commit'lenmiş)
  bir dosyanın **içeriğini** değiştiriyorsa (`git diff --cached --diff-filter=M`),
  commit durdurulur. Yeni dosya eklemek (`-2.md`, yeni `-screenshots/` klasörü, vb.)
  serbest — yalnız üzerine yazma engellenir.
* **Kapsam:** `docs/agent-results/` altındaki her dosya (yalnız `.md` değil — 
  TASK-MTSHUZUMVLTBF raporunun gösterdiği gibi ezilen 27 dosyanın çoğu PNG/CSV'ydi).
* **Muafiyet:** `docs/agent-results/INDEX.md` (bu depoda şu an üretilmiyor ama ileride
  varsa her görevde güncellenmesi beklenen bir özet dosyası — path deseni `grep -v`
  ile atlanıyor).
* **Kaçış yolu:** `ALLOW_EVIDENCE_OVERWRITE=1 git commit ...` — hook bilerek yapılan
  üzerine yazmalara (ör. kendi az önceki raporundaki yazım hatasını düzeltmek) izin
  verir, insanı kilitlemez. Kullanıldığında konsola hangi dosyaların ezildiği yine
  yazılır (sessiz geçiş yok).
* **Mesaj:** red durumunda hangi dosya(lar)ın ezildiği listelenir ve `-<n>.md`
  soneki somut örnekle önerilir.

Bu, kartın "yalnız kendi GÖREV-ID'sine yazabilsin" istediği erişim kontrolünü dolaylı
ama yeterli biçimde sağlıyor: git commit'leri kimlik taşımıyor (herkes aynı ağaçta,
aynı kullanıcı adıyla commit'liyor — bkz. mevcut hook'un kendi üst yorumu), dolayısıyla
"bu GÖREV-ID senin mi" diye doğrulayacak güvenilir bir kimlik yok. Mekanik olarak
uygulanabilir tek kural: **var olan hiçbir kanıt dosyası değişemez**, yalnız yenisi
eklenir. Bu, "başkasının GÖREV-ID'sine yazamazsın" kuralının pratik hâli — kendi
GÖREV-ID'ni de dahil, hiçbir mevcut dosyaya ikinci kez yazamazsın; düzeltme gerekiyorsa
yeni bir dosya (`-2.md`) açman gerekir, ki bu zaten kanıt disiplinine daha uygun
(eski kanıt kaybolmaz, yenisi eklenir).

---

## 2. Kanıt — GERÇEK commit denemeleri

Test için kendi görev id'im dışında bir GÖREV-ID kullanmadım; başka ajanların o an
ağaçta duran commit'lenmemiş dosyalarına (ör. `TASK-MTQYXISOPUJ53-customer-support-2.md`,
`src/modules/m8/server/schema-contract.test.ts`) hiç dokunulmadı — testler kendi
attığım geçici `TASK-TESTHOOK-*` dosyaları üzerinde yapıldı, sonunda hem commit'ler
geri alındı hem dosyalar silindi (bkz. §2.4).

### 2.1 (a) VAR OLAN dosyayı değiştir → RED

Önce bir taban dosya commit'lendi (`TASK-TESTHOOK-blog-yazar.md`, yeni dosya — bu adım
zaten geçer, kontrol edilen şey bu değil). Sonra o dosyanın içeriği değiştirilip tekrar
commit denendi:

```
=== TEST (a): modify EXISTING committed evidence file → expect REJECT ===

✗ Commit durduruldu: docs/agent-results/ altında VAR OLAN bir kanıt dosyasının
  içeriği değişiyor — başka bir görevin (ya da kendi eski koşunun) kanıtını
  eziyor olabilirsin:
    docs/agent-results/TASK-TESTHOOK-blog-yazar.md

  Kanıt dosyaları bir kez yazılır. Yeni bir deneme/düzeltme ise VAR OLAN
  dosyayı değiştirme, -<n>.md sonekiyle yeni bir dosya aç
  (ör. TASK-XXXX-ajanadi.md doluysa TASK-XXXX-ajanadi-2.md).

  Bilerek üzerine yazman gerekiyorsa (ör. kendi az önceki yazım hatanı
  düzeltiyorsun ve kimse o kanıta bel bağlamadı):
    ALLOW_EVIDENCE_OVERWRITE=1 git commit ...
EXIT_CODE=1
```

### 2.2 (b) YENİ `-2.md` ekle → GEÇER

Aynı taban dosyayı değiştirmek yerine yeni bir dosya (`TASK-TESTHOOK-blog-yazar-2.md`)
eklendi:

```
=== TEST (b): add a NEW -2.md file → expect PASS ===
[dev 29050e0] test(hook): should PASS — new suffixed evidence file
 1 file changed, 3 insertions(+)
 create mode 100644 docs/agent-results/TASK-TESTHOOK-blog-yazar-2.md
EXIT_CODE=0
```

### 2.3 (c) Kaçış değişkeniyle VAR OLAN dosyayı değiştir → GEÇER

```
=== TEST (c): modify EXISTING file WITH escape hatch → expect PASS ===
⚠ ALLOW_EVIDENCE_OVERWRITE=1: var olan kanıt dosyaları bilerek üzerine yazılıyor:
    docs/agent-results/TASK-TESTHOOK-blog-yazar.md
[dev 5ceb710] test(hook): should PASS — deliberate overwrite via ALLOW_EVIDENCE_OVERWRITE=1
 1 file changed, 1 insertion(+), 1 deletion(-)
EXIT_CODE=0
```

Bonus: `docs/agent-results/INDEX.md` bu depoda henüz üretilmiyor (`ls` → No such file),
dolayısıyla muafiyet canlı bir commit'le gösterilemedi; kural kodda `grep -v -E
'(^|/)INDEX\.md$'` ile sabit ve hook'un kendi üstündeki üç testle aynı mekanizmayı
(`git diff --cached --diff-filter=M`) kullanıyor, ayrı bir kod yolu değil.

### 2.4 Test commit'leri geri alındı, repo temiz

```
$ git log --oneline -5
5ceb710 test(hook): should PASS — deliberate overwrite via ALLOW_EVIDENCE_OVERWRITE=1
29050e0 test(hook): should PASS — new suffixed evidence file
8e825b9 test(hook): seed baseline evidence file for pre-commit hook test
12c58ae docs(TASK-MTSHVKTSGC8A4): the storefront result, and what the run taught   ← orijinal HEAD
2015fac feat(billing): sell the plan the studio published, to the tenants it was published for

$ git reset HEAD~3        # mixed — HEAD 12c58ae'ye döndü, hiçbir dosya silinmedi
$ rm -f docs/agent-results/TASK-TESTHOOK-blog-yazar.md docs/agent-results/TASK-TESTHOOK-blog-yazar-2.md
$ git status --porcelain -- docs/agent-results | grep -i testhook
no TESTHOOK leftovers

$ git rev-parse HEAD
12c58ae9a8c6198e4d5320694ef369da651bba3e   ← orijinal HEAD ile aynı
```

`git reset --hard` KULLANILMADI (aynı ağaçta paralel çalışan diğer ajanların
commit'lenmemiş işini silerdi); yalnız `reset` (mixed) + kendi test dosyalarımın elle
silinmesiyle temizlendi. Testler sırasında ağaçta duran diğer ajanların dosyaları
(`docs/agent-results/TASK-MTQYXISOPUJ53-customer-support-2.md`,
`src/modules/m8/server/schema-contract.test.ts`, `.agentspace/memory/...`) hiç
staged/commit edilmedi.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `githooks/pre-commit` | `docs/agent-results/` kanıt koruma bloğu eklendi (mevcut ts/tsx kapısından ÖNCE çalışıyor, ondan bağımsız — evidence dosyaları `.md`/`.png`/`.csv` olduğu için ts/tsx filtresine hiç girmiyordu, bu yüzden erken `exit 0`'dan önce konumlandırıldı) |
| `docs/agent-results/TASK-MTSJKTGDUC3L5-blog-yazar.md` | bu rapor (yeni dosya) |

Kaynak koda dokunulmadı.

---

## 4. Riskler

1. **Kimlik yok, dosya-bazlı kural var.** Git commit'i kimin ajan/görev olduğunu
   taşımıyor (mevcut hook'un kendi başlık yorumu: "Every agent works in the SAME
   working tree"). Dolayısıyla "yalnız kendi GÖREV-ID'ne yaz" harfiyen değil,
   "hiç kimse var olan hiçbir kanıta ikinci kez yazamaz" olarak uygulandı — daha
   sıkı ama aynı amaca hizmet ediyor (ezilme sıfıra iner).
2. **Kaçış değişkeni suistimal edilebilir.** `ALLOW_EVIDENCE_OVERWRITE=1` her
   commit'te elle geçilmesi gerektiği için kazara tetiklenmesi zor, ama bir ajan
   alışkanlıkla hep açık bırakabilir. Hook her kullanımda konsola hangi dosyaların
   ezildiğini yazıyor (sessiz değil) — en azından iz bırakıyor.
3. **`git commit --amend` bu kapıdan geçmez mi?** Geçer — `--amend` da normal
   `pre-commit` hook'unu tetikler, aynı kontrol uygulanır (git standart davranışı,
   ayrıca test edilmedi ama git'in dokümante mekanizması).
4. Rename/move tespiti kapalı (`--no-renames`) — bir dosyayı `git mv` ile başka bir
   isme taşımak `M` değil `A`+`D` olarak görünür, bu kontrolden etkilenmez (istenen
   davranış: taşımak, üzerine yazmak değildir).

## 5. Açık sorular

Yok — kart kapsamındaki üç senaryo da (a/b/c) gerçek commit denemesiyle doğrulandı.

## 6. Sonraki adım

Kart `review`'a alınabilir. `docs/E2E_TESTING.md` gibi bir kanıt-disiplini dokümanı
varsa (bu depoda yok) oraya bu kuralın bir satırı eklenebilir — kapsam dışı bırakıldı,
hook'un kendi başlık yorumu şimdilik tek kaynak.

---

## 7. Dürüstlük notu: kendi commit'im başka bir ajanın dosyasını sildi, düzeltildi

`6ba9906`'ı atarken (`githooks/pre-commit` + bu rapor) commit öncesi yalnız
`git status --porcelain -- githooks/pre-commit docs/agent-results/TASK-...md` ile
KENDİ path'lerimi kontrol ettim. Bu ağaç eş-zamanlı ajanlar arasında PAYLAŞILIYOR
(hook'un kendi üst yorumu: "Every agent works in the SAME working tree") — ve o anda
paylaşılan index'te başka bir ajanın (muhtemelen prisma-override'ı kaldırıp
generate edilmiş tipe geçen bir refactor'ün ortasındaki) `src/types/prisma-override.d.ts`
ve `.test.ts` silmesi STAGE'liydi. `git commit` STAGE'deki HER ŞEYİ yazdı, yalnız
benim `git add` ettiğimi değil — path-filtreli `git status` bunu gizledi çünkü
sorguyu kendi path'lerime daralttım.

Sonuç: `6ba9906` iki dosyayı sildi ve `src/lib/db.ts`, `billing.ts`,
`k2-cordis/importer.ts`, `schema-contract.test.ts` gibi o refactor'ün geri kalan,
henüz commit'lenmemiş değişiklikleri working tree'de yarım kaldı — yani dev'e
**yarı-tamamlanmış bir başkasının işini** commit etmiş oldum.

Fark edince hemen düzeltildi (`dbc26d2`): iki dosya `12c58ae`'den (benim
commit'imden önceki HEAD) byte-bybyte aynı içerikle geri yüklendi ve **yalnız o iki
path** `git commit -- <path1> <path2>` ile commit'lendi — bu kez path-restricted
commit formu kullanıldı, index'te başka ne varsa dokunulmadı. Geri yükleme
sonrası `git diff 12c58ae -- <2 dosya>` boş döndü (bkz. §2), yani tam olarak eski
hâline döndü; refactor'ü yapan ajan kaldığı yerden devam edebilir. Ayrıca hook'un
kendisi restore commit'inde başka bir ajanın (`subscription-sync.test.ts`) o anki
typecheck hatasını "THEIRS" olarak gösterdi (`@prisma/client` `AuditEvent` vb.
export etmiyor) — bu da override dosyasının o an gerçekten gerekli olduğunu,
silinmesinin erken/yarım olduğunu doğruluyor.

**Ders (hafızaya da yazıldı):** bu depoda commit'ten hemen önce path-filtresiz
`git status --porcelain` şart; ve gerçek commit **path-restricted** olmalı
(`git commit -m "..." -- <yalnız kendi dosyaların>`), `git add <path>` + düz
`git commit` YETMEZ — index paylaşımlı olduğu için düz commit stage'deki her şeyi
yazar.
