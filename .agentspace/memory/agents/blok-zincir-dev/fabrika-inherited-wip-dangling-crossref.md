---
name: fabrika-inherited-wip-dangling-crossref
description: Devralınan yarım işte eksik parçayı bulmanın en ucuz yolu — "bkz. X" diyen çapraz referansları izle; hedefte gerekçe yoksa yarım kalan yer orasıdır
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Bir pane çökünce (exit 129 / SIGHUP — bkz. [[agent-exit-129-sighup]]) geride kalan
commit'siz kod genelde **çalışır ve testleri geçer**; typecheck temiz, testler yeşil
olduğu için "bitmiş" görünür. Eksik olan şey çoğunlukla kodun kendisi değil,
yazarın yazmaya sıra gelmeden düştüğü **gerekçedir**.

Bunu bulmanın ucuz yolu: diff'teki her "bkz. / see X for Y" çapraz referansını izle ve
hedefte Y'nin gerçekten yazılı olup olmadığına bak.

Ölçülen örnek (TASK-MTVFJTNW6OW11): `src/lib/inngest/events.ts`
"see alerts-sweep.ts for the age-threshold reasoning" diyordu; `alerts-sweep.ts`'te ise
yalnız `Age threshold: MIN_AGE_MS below.` ve çıplak sabit vardı — gerekçe hiç
yazılmamıştı. Kod doğruydu, testler o eşiği doğruluyordu bile; yazılmamış olan
**neden 1 saat** olduğuydu. (Cevap: `pnpm alerts:check` `pnpm gate`'in en sonunda koşar
ve o koşunun sızdırdığı alarmı yakalar; yaş tabanı bir gate koşusundan geniş olmasaydı
süpürücü tam da kapının yakalaması gereken sızıntıyı kapatırdı.)

**Nasıl uygulanır:** yarım işi devralırken `grep -n "see \|bkz\." <değişen dosyalar>` ile
çapraz referansları çıkar, her birini hedefte doğrula. Testin yeşil olması gerekçenin
yazıldığı anlamına gelmez; bir sabitin *değeri* test edilebilir ama *seçilme nedeni*
test edilemez — o yalnız yorumda yaşar ve kaybolursa bir daha geri gelmez.

İlgili: [[fabrika-stale-board-status-check-git-first]]
