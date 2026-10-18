# TASK-MVC6JTIRAVCWF (FO-46) — dev'de `pnpm build` /_global-error prerender düşüyor

**Ajan:** devop-fb · **Base:** origin/dev `ea3037f4` (temiz worktree `.claude/worktrees/fo46-build`, `pnpm install --frozen-lockfile` + `prisma generate`)

## Ne yapıldı

1. **Yeniden üretim.** Temiz origin/dev üzerinde `pnpm build`, üç `NODE_ENV` varyasyonu:
   - `NODE_ENV` tanımsız (`env -u NODE_ENV`, `.env` yok): **exit 0**
   - `NODE_ENV=production`: **exit 0**
   - `NODE_ENV=development`: **exit 1** — `Cannot read properties of null (reading 'useContext')` (`/_global-error`)
   - `.env` kaynaklı kabukta `NODE_ENV=development` gelir (`.env` bu değeri taşıyor); bu durumda build **exit 1**.
2. **Kök neden.** `build` betiği düz `next build` idi. Next, `NODE_ENV`'i kabuktan devralır; geliştirici `.env`'i yüklediğinde `NODE_ENV=development` `next build`'e geçer ve Next prerender'ı production dışı modda yapar. Bu modda `/_global-error` prerender'ı düşer. Hata global-error gövdesinden bağımsız: sayfayı en küçük `'use client'` haline indirdiğimde de (`<html><body>{error.message}</body></html>`) aynı `useContext` hatası çıktı.
3. **Bisect (yapıldı, sonuç: regresyon commit'i bulunamadı).** Hata bir kod regresyonu değil, ortam kaynaklı ve geçmişte de var:
   - `fc593397^` (`ffb9c79f`, FO-8 Next 16.3.4 bump'ından önce): dev-mode build **kırık** (rc=1).
   - `origin/dev`'den 120. ve 200. geriye commit (`b689ba7e`, `9c5690fe`): dev-mode build **kırık** (rc=1).
   - Bu nedenle FO-8 next yükseltmesi suçlu değil; `NODE_ENV=development` ile build hep kırıktı. Kartta "girdiği commit" diye bir nokta yok.
4. **Düzeltme.** `package.json` `build` betiği `NODE_ENV=production next build` oldu. Build her zaman production modunda koşar; kabuktaki `NODE_ENV` artık devralınmaz.
5. **Doğrulama (düzeltme sonrası):**
   - `.env` yüklü kabuk (`NODE_ENV=development`) + `pnpm build` → **EXIT=0**
   - `NODE_ENV=development` kabukta `pnpm build` → **EXIT=0**
   - `pnpm start -p 3117` (`.env` yüklü): `GET /` → 307 (`/tr`'ye yönlendirme), `GET /tr` → **200**. Sunucu kendi başlattığım PID ile durduruldu.

## Kanıt (ham çıktı, kısaltılmış)

Kırık (düzeltme öncesi, `NODE_ENV=development`):
```
Error occurred prerendering page "/_global-error". Read more: https://nextjs.org/docs/messages/prerender-error
TypeError: Cannot read properties of null (reading 'useContext')
Export encountered an error on /_global-error/page: /_global-error, exiting the build.
⨯ Next.js build worker exited with code: 1 and signal: null
```
Düzeltme sonrası `NODE_ENV=development pnpm build`:
```
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
EXIT=0
```
Log dosyaları (scratchpad): `build-development.log`, `build-fixed-dev.log`, `build-fixed-env.log`, `start.log`.

## Değişen dosyalar

- `package.json` — `build`: `next build` → `NODE_ENV=production next build`
- `docs/agent-results/TASK-MVC6JTIRAVCWF-devop-fb.md` (bu rapor)

## Riskler

- `NODE_ENV=production` betikte sabit. `pnpm build` artık `.env`'deki `NODE_ENV` değerini yok sayar. `env.ts` production'da `JOBS_CRON_ENABLED` gibi değişkenleri açıkça ister; `.env` yüklüyken build geçti, CI/cPanel ortamında da aynı değişkenlerin olması gerekir (FO-44 için kontrol edilmeli).
- Betik POSIX ortam atamasıdır (`VAR=val cmd`); Windows `cmd`'de çalışmaz. Kart platformu mac + Linux olarak tanımlıyor.
- Next'in dev-mode prerender hatasının iç nedeni (hangi React/Next iç çağrısı null dispatcher'a düşüyor) çözülmedi; Next'in hata stack'i `ignore-listed frames` ile gizleniyor. Düzeltme, Next'in desteklemediği bir ortamda build'i koşmamayı sağlıyor; Next tarafında bir upstream issue olabilir.
- Dev sunucu (`pnpm dev`) etkilenmedi; yalnızca `build` betiği değişti.

## Platform

- Doğrulama: **mac** (Darwin 27.0, Node v26.5.0, pnpm 11.25.0).
- Linux: koşulamadı (bu makinede Linux yok). Betik değişikliği POSIX-uyumlu; Linux'ta aynı davranışı beklerim ama koşmadım.
- Windows: kapsam dışı (kart mac + Linux).

## Açık sorular

- Kartın "NODE_ENV unset" ölçümü (se-fb) bizim temiz worktree'de tekrarlanamadı: `NODE_ENV` tanımsızken build geçti (exit 0). se-fb'nin ortamında kabukta `NODE_ENV=development` olması olası; onların ortamını doğrulamak gerekir.
- Sonuç dosya yolu çelişkisi: kart ve delegasyonun "Sonuç dosyası" satırı `TASK-MVC6JTIRAVCWF-devop-fb.md` diyor; KANIT bloğu `TASK-MVBIVTBC7F317-se-fb-2.md` diyor. Kartın yolu kullanıldı.

## Sonraki adım

- PR `devop-fb/fo46-build-global-error` → `dev` (merge yok). FO-44 (cPanel paket build) bu düzeltmeye bağlı.
- FO-44 öncesi: cPanel/CI ortamında `NODE_ENV=production` için gerekli değişkenlerin (`JOBS_CRON_ENABLED` vb.) tanımlı olduğu kontrol edilmeli.
- `themeColor` metadata uyarısı (`/[locale]`, `/_not-found`) build'i kırmıyor; ayrı iş olarak `viewport` export'una taşınmalı.
