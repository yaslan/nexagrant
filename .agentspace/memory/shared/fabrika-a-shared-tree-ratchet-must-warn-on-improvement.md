---
name: fabrika-a-shared-tree-ratchet-must-warn-on-improvement
description: Baseline'lı bir kapıda DÜŞEN sayı kırmızı değil UYARI olmalı — düşüş her zaman birinin düzeltmesidir ve altı ajanın paylaştığı ağaçta yanlış kişiyi bloke eder; listenin çürümesini engelleyen şey kırmızı değil, borcu KAYITLI değil ÖLÇÜLEN sayıyla basmaktır
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

Fabrika'da bir mandal (ratchet) kapısı yazarken — var olan ihlalleri gerekçesiyle kaydeden, yenilerini kıran bir baseline — üç yön vardır ve üçü aynı şey DEĞİLDİR:

- **yeni anahtar** (baseline'da hiç yok) → KIRMIZI. Regresyon.
- **sayı ARTTI** (bilinen dosya yeni çağrı kazandı) → KIRMIZI. Eski gerekçe yeni satırı kapsamaz; kapı bunu açıkça söylemeli ("The recorded reason covers 1 of them: …").
- **sayı DÜŞTÜ** (biri düzeltti, girdi kaldı) → **UYARI, exit 0.**

Üçüncüsünü ilk sürümde kırmızı yapmıştım. TASK-MTVRAZSUVLL9R koşarken gerçekten oldu: komşu kart (TASK-MTVSBEO7VX6Y4) `subscription-sync.ts`'teki iki geri-düşümden birini kaldırdı ve kapı benim baseline'ımı bayat ilan etti. Yani düşüşü kırmızı yapmak, işi DÜZELTEN ajanın push'unu bloke ediyordu.

**Why:** Düşüş **hiçbir zaman** bir regresyon değildir — tanım gereği iyileşmedir. Altı ajanın aynı `dev` ağacında çalıştığı bir yerde, iyileşmede kırmızı gören kişi genellikle sebep olan kişi değildir; ve böyle bir kapı düzeltilmez, SİLİNİR. Ama "uyarı yapalım" demek yeterli değil: uyarıya çevirince asıl korku geri gelir — girdi sonsuza kadar orada kalır ve borç listesi yalan söyler ([[fabrika-deferred-to-another-card-is-not-fixed]]).

Çözüm kırmızıda değil, **raporlamada**: borç özeti KAYITLI sayıyı değil **ÖLÇÜLEN** sayıyı bassın, ve sıfıra düşen girdiyi `fixed — prune me` diye işaretlesin. O zaman liste borcu asla ABARTAMAZ; bayat kalan tek şey gerekçe METNİDİR, o da zararsızdır. Bir de `--prune` alt komutu koy: bayatlığı düzeltmek tek komut olsun, yoksa insanlar girdiyi silmek yerine kapıyı devre dışı bırakır.

**How to apply:** Fabrika'da `pnpm gate` zincirine baseline'lı bir kapı eklerken: (1) asimetriyi uygula — yeni/artan hata, azalan uyarı; (2) borcu ölçülen sayıyla bas ve her koşuda bas, YEŞİLDE DE; (3) `--prune` yaz; (4) baseline'ı satır numarasına değil `(dosya, model.op)` gibi kaymayan bir anahtara bağla — satır numaraları bu depoda bir gün içinde kayıyor (bir kart `export/route.ts:34` diyordu, çağrı ertesi gün `:47`'deydi); (5) baseline'ı JSON tut, TS değil — `--prune` onu güvenle yeniden yazabilsin. Örnek: `scripts/check-tenant-bypass.ts` + `scripts/tenant-bypass-baseline.json`. Kapıyı kanıtlarken paylaşılan ağaca ihlal satırı enjekte etme, izole worktree kullan ([[fabrika-measure-a-committed-tree-with-a-detached-worktree]]).
