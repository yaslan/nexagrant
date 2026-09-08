---
name: fabrika-shared-worktree-git-add-is-not-atomic
description: Fabrika'da paralel kartlar aynı worktree'yi paylaşıyor — `git add <yol>` + `git commit` atomik değil, başka bir ajanın commit'i senin stage'ini kendi mesajının altına süpürebilir
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08, SPRINT-S12/E10 üç paralel kart aynı çalışma kopyasında koştu. Yalnız kendi
dosyalarımı `git add <yol>` ile stage'leyip `git commit` çağırdım; arada başka bir ajan commit
attı ve benim 25 dosyam ONUN commit'ine girdi:

```
$ git log --oneline --all -- src/lib/brand.ts
aa4341f docs(memory): a cross-session send can report success and still never arrive
```

İçerik kaybı yok, commit MESAJI yanıltıcı — gerekçe git geçmişinden silinmiş oldu.

**Ne YAPMADIM:** `reset`/`rebase` ile düzeltmedim. `dev` paylaşılan ve diğer ajanlar o anda
yazıyordu; geçmişi yeniden yazmak onların işini yok edebilirdi.

**How to apply:**
1. Paralel kartta commit'ten HEMEN sonra `git log --oneline -1` ile kendi mesajını DOĞRULA —
   "commit çalıştı" yetmez.
2. Süpürülmüşsen içerik bütünlüğünü `git show HEAD:<dosya>` ile doğrula ve sonuç raporuna yaz;
   paylaşılan dalda geçmişi DÜZELTME.
3. Gerekçeyi yalnız commit mesajına emanet etme — sonuç raporu tek güvenilir kayıt.
