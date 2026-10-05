---
name: fabrika-prove-a-red-gate-is-not-yours-by-reverting-only-your-files
description: Paylaşılan ağaçta kırmızı bir kapının senin olmadığını KANITLAMANIN yolu — stash değil, yalnız KENDİ dosyalarını HEAD'e döndürüp aynı testleri tekrar koşmak
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`pnpm gate` kırmızı ve altı ajan aynı worktree'de çalışıyor. `git stash`
komşunun commit'lenmemiş işini alır — yasak. Ama **kendi dosyalarını** güvenle
geri alabilirsin:

```bash
mkdir -p "$SCRATCH/mine"
for f in <yalnız senin dosyaların>; do mkdir -p "$SCRATCH/mine/$(dirname "$f")"; cp "$f" "$SCRATCH/mine/$f"; done
git checkout HEAD -- <yalnız senin TAKİPLİ dosyaların>
mv <senin TAKİPSİZ test dosyan> "$SCRATCH/aside"      # checkout takipsizi geri almaz
npx playwright test <başarısız 2 spec>                 # B ölçümü
for f in <...>; do cp "$SCRATCH/mine/$f" "$f"; done ; mv "$SCRATCH/aside" <geri>
```

A (senin değişikliklerinle) ve B (onlarsız) aynı test-id'lerde aynı hatayı
veriyorsa, hata senin değil — ve bunu **raporda A/B çıktısıyla** göster.

**Why:** [[fabrika-blame-e2e-failure-without-stashing]] "kendi bileşeninin
olmadığı bir sayfada aynı hatayı say" diyordu; bu ondan güçlü, çünkü dolaylı
değil DOĞRUDAN ölçüm ve yalnız senin dosyalarına dokunuyor. Kırmızı kapıyla
teslim eden kartın tek savunması bu çıktıdır; onsuz "bende değildi" bir iddia.

**How to apply:** ucuz teyit önce — başarısız spec dosyalarını `grep`'le, senin
değiştirdiğin sembolleri (fonksiyon adı, env değişkeni, e-posta) hiç anmıyorsa
zaten güçlü bir işarettir; A/B ölçümü onu kanıta çevirir. Fixture'daki
`Unique constraint failed` gibi hatalar kod değil ARTIK DB DURUMU'dur, kimsenin
commit'i değildir — ayrı bir kart olarak adıyla bildir.
