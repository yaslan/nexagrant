---
name: focus-restore-must-wait-for-enabled
description: Kapanan bir hata bandının odağını geri verirken tıklama anında focus() çağırmak işe yaramaz — hedef düğme o anda disabled olur; odak, düğme yeniden etkinleştikten sonra bir efektle verilmeli
metadata:
  type: project
  updatedAt: 2026-09-07
---

Kapatılabilir bir hata bandı (veya herhangi bir koşullu render edilen kontrol) DOM'dan
kalktığında, içindeki düğmeye basmış klavye kullanıcısının odağı `<body>`'ye düşer ve
sayfadaki yerini kaybeder (WCAG 2.4.3). Odağı bandın ait olduğu kontrole geri vermek
doğru çözüm — **ama tıklama handler'ında `ref.current?.focus()` çağırmak çalışmaz.**

2026-09-07, TASK-MTQURC2H4E0WF: banttaki "Yeniden dene"ye basınca odağı submit
düğmesine verdim. Sıra şuydu: tıklama → `focus()` → `setIsGenerating(true)` → düğme
**disabled** → tarayıcı odağı bırakır → `<body>`. Yani düzeltme hiçbir şey düzeltmiyordu.
Ve **unit test bunu yakalamadı** — yalnız gerçek tarayıcıdaki
`await expect(generate).toBeFocused()` "Received: inactive" diye kırıldı.

Çalışan desen: niyeti bir ref bayrağında tut, odağı hedef **tekrar etkinleştikten sonra**
bir efektle ver, ve odağı başkası kaptıysa dokunma:

```tsx
const targetRef = useRef<HTMLButtonElement>(null);
const focusOrphanedRef = useRef(false);

useEffect(() => {
  if (isBusy || !focusOrphanedRef.current) return;   // disabled'ken focus() no-op
  focusOrphanedRef.current = false;
  if (document.activeElement === document.body) targetRef.current?.focus();
}, [isBusy, errorState]);

// bandın kapat / yeniden dene handler'larında:
focusOrphanedRef.current = true;
```

Üç ayrıntı önemli:
- **`isBusy` bağımlılığı**: yalnız hedef etkinken odaklanır.
- **`activeElement === body` kontrolü**: kullanıcı başka bir alana geçtiyse odağı çalmaz.
- **Ref bayrağı**: ilk hata gösteriminde odak ÇALINMAZ. `role="alert"` zaten okutur;
  odağı zorla taşımak kullanıcının yazdığı yerden koparır. Odak yalnız **gerçekten
  öksüz kaldığında** geri verilir.

DoD'a not: bu sınıf hata **yalnız gerçek tarayıcıda** görünür. Odak davranışı iddia
ediyorsan e2e'de `toBeFocused()` ile ölç.

İlgili: [[ui-guard-behind-hidden-control-is-dead-code]] · [[fabrika-force-server-action-failure-in-browser]]
