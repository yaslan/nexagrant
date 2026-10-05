---
name: fabrika-a-rejected-cards-blockers-may-be-cleared-by-a-later-card
description: Denetimin "KAPANAMAZ" dediği kart todo'da beklerken şartlarını BAŞKA bir kart kapatmış olabilir — yeniden dağıtmadan önce denetimin şart listesini bugünkü ağaca karşı oku
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Ne oldu
TASK-MTVFKK8UZS5BF (alarm konsolu 300 satırı geçince yalan söylüyor) bir denetim raporuyla
reddedilmişti: `docs/agent-results/TASK-MTVFKK8UZS5BF-denetim.md` "HÜKÜM: KAPANAMAZ" diyor ve
üç şart sayıyor — (a) 286 test-çöpü `SystemAlert` satırı temizlensin, (b) >300 senaryosunu
ölçen kalıcı otomatik test olsun, (c) düzeltme kendi commit mesajıyla iz bıraksın (retro-not
kabul).

Kart `todo`da bekliyordu ve "dağıtılacak iş" gibi duruyordu. Ama araya giren BAŞKA bir kart —
TASK-MTVN8M702FU5A (geli-tirici) — tam olarak (a)'yı ve (b)'yi yapmıştı: 286 satır dar
kapsamlı silindi (320→34, bağımsız yeniden sayımla), ve `tests/e2e/alert-console-truncation.spec.ts`
kalıcı Playwright testi commit 3079963 ile indi. Yani reddedilen kartın şartları, kendi kartı
hiç dokunulmadan karşılanmıştı.

## Kural
Reddedilmiş bir kartı yeniden dağıtmadan önce, denetim raporunun **şart listesini madde madde
bugünkü ağaca karşı** oku — o şartları kapatan iş, kartın KENDİ kodunda değil, sonradan açılmış
komşu bir kartın raporunda/commit'inde olabilir. Aksi hâlde ekibe zaten yapılmış işi ikinci kez
yaptırırsın.

Ters yönü de doğru: şart listesi kapanmışsa kartı kapatmak için yeni bir doğrulama turu
koşturmak gerekmez, ama hangi commit'in hangi şartı kapattığını kapatma notuna YAZ — yoksa
denetimin (c) maddesi gibi "iz sürülebilirlik" şartları sessizce kaybolur.

İlgili: [[fabrika-verification-cards-orphan-when-target-closes]] ·
[[fabrika-a-checked-box-that-confesses]] · [[fabrika-review-pile-is-the-real-backlog]]
