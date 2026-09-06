---
name: fabrika-parallel-agent-collisions
description: Fabrika'da paralel ajanlar aynı görev id'sine atanabiliyor ve aynı dosyayı/DB'yi eziyor — işe başlamadan ve bitirmeden önce git log kontrolü
metadata:
  type: feedback
  updatedAt: 2026-09-06
---

Fabrika ofisinde epik'ler paralel başlatılınca **aynı TASK-… id'si iki ajana birden
atanabiliyor**. 2026-09-06'da TASK-MTPZEESJPKGCY (E11.1 Beta Onboarding) hem bana hem
`sora-0c1f10`'a verildi. Sora doküman ayağını benden önce bitirip commit'ledi
(`c5efc03`); ben çalışırken o commit henüz yoktu, kendi `docs/BETA_GUIDE.md` sürümümü
yazdım ve **onların commit'li dosyasını ezdim**.

**Neden önemli:** Ezme sessiz oluyor — `git status` dosyayı sadece "modified" gösterir,
"başka birinin bitmiş işini sildin" demez. Fark etmezsem takım çıktısı kaybolurdu.

**Nasıl uygulanır:**
1. Göreve başlarken `git log --oneline -5` ve `ls docs/agent-results/<GÖREV-ID>-*.md` —
   aynı görev id'siyle başka bir rapor varsa o ajanın kapsamını OKU, üstüne bindirme.
2. Kendi dosyalarını yazmadan önce hedef yol zaten var mı bak; varsa `git log -1 -- <yol>`.
3. Bitirmeden önce `git log --oneline -3` TEKRAR — sen çalışırken commit gelmiş olabilir.
4. Çakışma bulursan: karşı tarafın commit'li sürümünü `git checkout <sha> -- <yol>` ile
   geri getir, kendi katkını **çakışmayan** bir eksene taşı (bende: doküman yerine
   çalıştırılabilir otomasyon), ve çelişkiyi rapora "KARAR GEREKİYOR" olarak yaz —
   hangi tasarımın kazandığına ajan karar vermez.
5. İki tasarım çelişiyorsa (bende: tüm-modül vs MVP, Pazartesi-Brüksel vs Perşembe-İstanbul)
   **ikisini de bayrağa bağla**; seçimi ucuzlaştır, kendin seçme.

Aynı risk veritabanında da var: paralel ajanlar aynı `localhost:5432/fabrika`'ya yazıyor.
Şema değişikliği (`prisma db push`) yapmadan önce başkasının uygulamış olabileceğini varsay.

İlgili: [[fabrika-workspace]], [[fabrika-beta-onboarding-cli]]
