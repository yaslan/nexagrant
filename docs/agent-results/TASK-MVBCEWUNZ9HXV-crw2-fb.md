---
hüküm: ONAY — PR #71 (head 8777a138) bağımsız olarak doğrulandı. next 16.3.8 kurulu; prod audit yüksek+kritik 21 → 1 (toplam 86 → 1, kalan yalnız yamasız `braces`); frozen install, lint, typecheck, test (4399 geçti / 120 atlandı / 0 kırmızı) ve build temiz. next/image gerçek Google avatarı ve gerçek blog görseliyle canlı çalıştı. sharp 0.35.5 Linux arm64 ve x64'te Docker ile çalıştı. Bloke eden bulgu yok. Rapor doğruluğuyla ilgili 2 düzeltme ve 1 öneri var (pip-audit sonucu Python 3.9'a bağlı; frontmatter'da "21 → 0" yazıyor).
tip: inceleme
platform: mac (darwin arm64) ile doğrulandı. sharp ayrıca Linux arm64 ve Linux x64'te (Docker, node:20.20.2-bookworm-slim) koşuldu. Windows koşulmadı — bu makinede Windows yok; lock'ta `@img/sharp-win32-*` paketleri var.
kart: TASK-MVBCEWUNZ9HXV (FO-8, sprint FB-GAP-2)
ajan: crw2-fb
incelenen: se-fb · PR #71 (se-fb/fo8-dep-upgrade, commit'ler fc593397 + 8777a138), base dev
---

# TASK-MVBCEWUNZ9HXV — FO-8 incelemesi (crw2-fb)

**Yol notu:** Görev metnindeki "KANIT ZORUNLU" satırı repo dışında, başka bir ajanın adını taşıyan bir yol veriyordu (`/Users/macbook/alan/docs/agent-results/TASK-MVBCEWUNZ9HXV-se-fb-2.md`). Görev gövdesindeki sonuç dosyası yolu bu dosyadır. Rapor buraya yazıldı.

## Ne yapıldı

PR #71'in head'i (8777a138) ayrı bir worktree'de (`git worktree add --detach`) açıldı. Yazarın dosyaları ve ortamı kullanılmadı. Env dosyaları kopyalanmadı; ana repodaki dosyalardan `source` edildi. Kod değiştirilmedi.

1. Diff satır satır okundu: `package.json` (2 satır), `pnpm-workspace.yaml` (override bloğu), `pnpm-lock.yaml`.
2. Lock'taki gerçek sürümler, önce (origin/dev) ve sonra karşılaştırıldı.
3. `pnpm audit --prod` iki lockfile üzerinde yeniden koşuldu.
4. Frozen install, db:generate, lint, typecheck, test ve build koşuldu.
5. `next start` ile next/image canlı denendi ve ekran görüntüsü alındı.
6. sharp 0.35.5 Linux'ta Docker ile denendi.
7. `pip-audit` iki Python sürümünde yeniden koşuldu.
8. CI annotation'ı ve dev ile merge durumu kontrol edildi.

## Kanıt (ham çıktı)

### Sürümler (lock: önce → sonra)

```
$ pnpm why next sharp undici hono @hono/node-server mysql2 deepmerge-ts
next@16.3.8 · sharp@0.35.5 · undici@7.29.1, undici@8.10.2 · hono@4.13.7
@hono/node-server@1.19.15 · mysql2@3.23.1 · deepmerge-ts@8.0.0

lock önce → sonra (paket girişleri):
sharp 0.35.4→0.35.5 · undici 7.29.0→7.29.1, 8.10.1→8.10.2 · hono 4.11.4→4.13.7
@hono/node-server 1.19.9→1.19.15 · @modelcontextprotocol/sdk 1.30.0→1.31.0
proxy-addr 2.0.7→2.0.8 · mysql2 3.15.3→3.23.1 · deepmerge-ts 7.1.5→8.0.0
fast-uri 3.1.6→3.1.8 · ip-address 10.7.0→10.7.1 · source-map-js 1.2.1→1.2.2
postcss-selector-parser 7.1.5→7.1.6 · brace-expansion 5.0.9→5.0.12 (1.1.18 kopyası değişmedi)
```

deepmerge-ts dışında hiçbir paket major sürüm atlamadı. `package.json`'da yalnız `next` ve `eslint-config-next` değişti; `scripts` bloğuna dokunulmadı.

### pnpm audit --prod (kendim koştum)

```
önce  (origin/dev lock, ffb9c79f): {"low":10,"moderate":55,"high":19,"critical":2}
  critical: next, proxy-addr
  high: undici×5, hono×2, fast-uri×2, brace-expansion×2, @hono/node-server, deepmerge-ts,
        mysql2, braces, source-map-js, sharp, @modelcontextprotocol/sdk, next
sonra (PR #71 lock):              {"low":0,"moderate":0,"high":1,"critical":0}
  high braces <=3.0.3 GHSA-vfj7-8cjw-p6xm patched: null
```

Yazarın tablosu (86 → 1; yüksek+kritik 21 → 1) **birebir tuttu**. deepmerge-ts 7→8 geçişinin gerekçesi audit'te var: `GHSA-ggr8-5vv4-36mx`, "stack exhaustion when merging recursive object graphs", vulnerable `<8.0.0`.

### Kurulum ve kapılar

```
$ CI=true pnpm install --frozen-lockfile                → exit 0 (Done in 5.8s)
$ pnpm db:generate                                      → exit 0
$ pnpm lint                                             → exit 0 · 0 error, 4 warning (değişmeyen dosyalar)
$ pnpm typecheck                                        → exit 0
$ perl -e 'alarm 900;exec @ARGV' pnpm test (.env + .env.test source, EVIDENCE_S3_TEST_* unset)
    → exit 0 · 4399 passed · 120 skipped · 0 failed
$ pnpm build (NODE_ENV unset)                           → exit 0 · 39/39 static page, 144 route satırı
```

**Atlanan testler: 120.** Tamamı atlanan 10 dosya şunlar:
- `RUN_LIVE_ADAPTER_TESTS` gerektirenler: k1-daily-calls, sedia-adapter
- S3 değişkenleri bilerek unset edildiği için atlananlar (CI eşdeğeri): evidence-upload-s3, evidence-confirm-store-faults, user-erasure-object-store
- Ortam koşuluna bağlı atlananlar: invitation-retention, notification-retention, public-lead, k1-embeddings, topic-match-nightly

Bu sayı yazarın sayısıyla aynı.

**Tuzak (kodla ilgisiz):** İlk test koşusunda `.env` yüklenmemişti. Bu yüzden `.live` testleri `DATABASE_URL_RLS_TEST`'i bulamadı ve 442 test atlandı. `.env` source edilince sonuç 120 atlanan oldu. İlk build ise `/_global-error` prerender hatasıyla (`useContext` null) düştü. Sebep: `.env`'deki `NODE_ENV=development` export edilmişti. `NODE_ENV` unset edilince build geçti. Bu bir ortam hatası, PR'dan kaynaklanmıyor.

### next/image — canlı (`next start -p 3217`, prod build)

```
/_next/image?url=/logo.png&w=128                                        → 200 image/webp
/_next/image?url=https://lh3.googleusercontent.com/a/default-user=s96-c → 200 image/webp 96x96   (gerçek Google avatar URL'si)
/_next/image?url=https://images.unsplash.com/photo-1506744038136-…      → 200 image/webp 128x85
/tr/blog sayfasındaki gerçek kart görseli (photo-1522071820081…, w=640)  → 200 image/webp 640x427
/_next/image?url=https://evil.example.com/x.png                         → 400 (allowlist)
/_next/image?url=https://lh3.googleusercontent.com:8443/…               → 400 (port kısıtı korunuyor)
/tr → 200 · /tr/blog → 200
```

Ekran görüntüsü: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/dcecc3b8-4c30-4d2d-8afc-cfad96b52f26/scratchpad/fo8-blog-tr.png`. Blog kartlarının görselleri sharp ile işlenip render oluyor.

Yazarın açık bıraktığı "gerçek Google avatarı / gerçek blog görseli" boşluğu böylece **kapandı**. Gerçek lh3 default-avatar URL'si optimizer'dan geçti. Doğrulanmayan tek şey, oturum açmış kullanıcı menüsünün kendisinin render'ı. Avatar aynı `/_next/image` yolunu kullandığı için ek risk görmüyorum.

### sharp 0.35.5 — Linux (Docker)

```
linux/arm64: linux arm64 sharp 0.35.5 vips 8.18.7 webp 128x128
linux/amd64: linux x64   sharp 0.35.5 vips 8.18.7 webp 128x128
```

Lock'ta `@img/sharp-linux-{x64,arm64,…}@0.35.5`, `linuxmusl-{x64,arm64}` ve `libvips 1.3.4` var. Deneme npm ile kurulan aynı sürüm üzerinde yapıldı (glibc/bookworm), PR lockfile'ıyla tam bir Docker build yapılmadı.

### deepmerge-ts 7→8 ve Prisma uyumu

- `@prisma/config@7.10.0` `deepmerge-ts` sürümünü **tam olarak** `7.1.5`'e sabitliyor. Override bu sabitlemeyi bir major sürümle aşıyor.
- Kullanım yeri tek: `@prisma/config/dist/index.js:621` `const { deepmerge } = await import("deepmerge-ts")`. v8 de `deepmerge`'ü export ediyor (`dist/index.mjs` export listesi).
- Uygulamada: `pnpm db:generate` config yükleme yolundan geçti ve exit 0 verdi. DB'li 4399 test de geçti.
- `mysql2`'nin kullanıcısı da tam `3.15.3` sabitliyor (`prisma@7.10.0`). 3.23.1 aynı major içinde ve yalnız `prisma dev` / yerel sunucu yolunda kullanılıyor.

### pip-audit — workers/cordis/requirements.txt (Docker, repoya bir şey eklenmedi)

```
== python:3.9-slim  (pip-audit 2.9.0)
Found 7 known vulnerabilities in 2 packages
starlette 0.49.3  PYSEC-2026-161/-249/-248/-2281/-2280
anyio     4.12.1  PYSEC-2026-4025/-4024
== python:3.12-slim (pip-audit 2.10.1)
No known vulnerabilities found
```

### CI ve merge

- `gh pr checks 71`: üç iş 1–2 saniyede düşüyor. Annotation: *"The job was not started because recent account payments have failed or your spending limit needs to be increased."* Yazarın teşhisi doğru; sorun kodda değil.
- dev 8777a138'in base'inden (ffb9c79f) bu yana `package.json`, lock ve workspace dosyalarına dokunmadı. `git merge-tree origin/dev origin/se-fb/fo8-dep-upgrade` temiz.
- PR durumu: OPEN, base=dev, merge edilmedi.

## Bulgular (ciddiyet sırasıyla)

**Bloke eden bulgu: yok.**

1. **[Düzeltme · rapor doğruluğu] pip-audit sonucu yorumlayıcıya bağlı. "7 açık" belgelenen runtime için geçerli değil.** Kaynak: `docs/agent-results/TASK-MVBCEWUNZ9HXV-se-fb.md:105`.
   - Senaryo: `requirements.txt` sürüm sabitlemiyor. Python 3.9'da pip, 3.9'u hâlâ destekleyen eski fastapi/starlette/anyio sürümlerini çözüyor ve 7 açık çıkıyor. `workers/README.md:62` runtime'ı "Python 3.12" olarak tanımlıyor; 3.12'de açık sayısı 0.
   - Sonuç: Rapordaki "7 açık duruyor, fastapi/starlette 1.x yükseltmesi ayrı karar" tespiti riski olduğundan büyük gösteriyor. Ayrıca asıl kök sorunu, yani sürümsüz requirements ve tanımsız Python sürümünü gizliyor.
   - Öneri: Takip kartı "starlette yükselt" yerine şu olsun: "workers/cordis için Python sürümünü (3.12) ve requirements'ı sabitle (lock/constraints), pip-audit'i o yorumlayıcıyla CI'a koy".

2. **[Düzeltme · rapor tutarsızlığı] Frontmatter `hüküm` satırı "yüksek/kritik 21 → 0" diyor.** Gövdedeki tablo ve DoD "21 → 1" diyor (kalan `braces` yüksek). Kaynak: `TASK-MVBCEWUNZ9HXV-se-fb.md:2`. Board'da hüküm satırını okuyan biri yanlış sayıyı görür. Doğrusu 21 → 1.

3. **[Düzeltme · rapor doğruluğu] "Bu makinede Docker yok" ifadesi yanlış.** Kaynak: `TASK-MVBCEWUNZ9HXV-se-fb.md:4` ve `:100`. Docker bu makinede çalışıyor (`fabrika-postgres` vb. konteynerler ayakta). Linux sharp doğrulaması bu incelemede Docker ile yapıldı (yukarıda). Platform satırı buna göre güncellenebilir. Kod etkisi yok.

4. **[Öneri · düşük] Override aralıklarının alt sınırı açık.** Kaynak: `pnpm-workspace.yaml:29-30,32-41`; örnekler `'postcss-selector-parser@<7.1.6'`, `'ip-address@<10.7.1'`, `'fast-uri@<3.1.8'`, `'undici@<7.29.1'`, `'sharp@<0.35.5'`.
   - Şu an zararsız: her paketin lock'ta tek hattı var ve deepmerge-ts dışında major atlama yok (yukarıdaki tablo).
   - Senaryo: İleride bir bağımlılık `postcss-selector-parser@6.x`, `undici@6.x` ya da `fast-uri@2.x` çekerse, override onu sessizce bir sonraki major'a taşır. Kırılma `pnpm install` sırasında görünmez.
   - Yazar bu sorunu `undici@>=8.0.0 <8.10.2` (satır 31) ve `brace-expansion@>=4.0.0 <5.0.12` (satır 44) için zaten aynı majörle sınırlamış. Diğer satırlar bu biçimde değil. Yorumdaki "only installs matching the range move" ifadesi doğru ama aralığın kendisi geniş.
   - Öneri: Aynı biçimi (`>=X.0.0 <X.Y.Z`) tüm satırlara uygula. deepmerge-ts bilinçli bir major geçişi olduğu için istisna kalır. Merge'i bloke etmez.

5. **[Bilgi] deepmerge-ts 7→8, `@prisma/config`'in tam sürüm sabitlemesini aşıyor.** Yazar bunu risklerde belirtmiş. Kullanılan tek API (`deepmerge`) v8'de var; generate ve DB testleri geçti. Prisma yükseltilirken bu override ilk gözden geçirilecek satır olmalı (bağımlılık güncellemesi yapan kişi için not).

6. **[Bilgi] `braces` (yamasız) kabul edilen risk olarak bırakılmış.** Yol yalnız `shadcn` CLI'ı. `src/`, `scripts/` ve `workers/` içinde shadcn import'u yok (`git grep "from 'shadcn"` PR head'inde 0 sonuç verdi). Ayrı bir öneri: `shadcn` bir CLI olarak `devDependencies`'e taşınırsa prod audit'ten de çıkar. Bu, kartın kapsamı dışında.

## DoD kontrolü (kartın maddeleri)

- [x] next ≥ 16.3.8: `pnpm why` → 16.3.8, tek sürüm
- [x] sharp, undici, hono ve mysql2 yükseltildi (override; geçişli oldukları için gerekçeli)
- [x] pnpm audit --prod önce → sonra: 21 → 1 yüksek+kritik (kendim yeniden koştum)
- [x] pip-audit rapora girdi. Not: sonucun yorumu düzeltilmeli (Bulgu 1)
- [x] build, lint, typecheck ve test temiz. next/image canlı denendi (gerçek avatar ve blog görseli bu incelemede doğrulandı)
- [x] PR `--base dev` açık, merge edilmedi
- [x] Platform: mac + Linux (sharp, Docker). Windows koşulmadı
- [ ] CI yeşil: GitHub faturalandırması yüzünden işler başlamıyor (annotation ile doğrulandı). Kod dışı bir engel

## Değişen dosyalar

- `docs/agent-results/TASK-MVBCEWUNZ9HXV-crw2-fb.md` (bu rapor). Kod değişikliği yok.

## Riskler

- CI hiç koşmadığı için e2e (`pnpm test:e2e`) ve CI Linux build kanıtı yok. Bu incelemede de e2e koşulmadı; kart istemiyordu. Faturalandırma sorunu çözülünce CI yeniden koşulmalı.
- deepmerge-ts major override'ı, Prisma yükseltmelerinde kırılabilir.

## Açık sorular

1. GitHub faturalandırması kim tarafından düzeltilecek? (yazarla aynı soru)
2. workers/cordis'in Python sürümü 3.12 olarak sabitlensin mi? (Bulgu 1)

## Sonraki adım

- Lider merge edebilir. Bulgu 2 ve 3, yazarın raporunda tek satırlık düzeltmeler. Bulgu 1 ve 4 takip kartı ya da küçük bir ek commit olabilir.
- Merge sırası (kartta yazan): PR #71 önce, devop-fb'nin `scripts` değişikliği sonra.
