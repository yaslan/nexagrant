---
name: fabrika-unused-var-sweep-is-a-bug-hunt
description: no-unused-vars borcunu `_` ön ekiyle susturma — Fabrika'da bulguların önemli kısmı gerçek hatanın parmak izi (kullanılmayan `t` = sabit metin, kullanılmayan loading flag = kredi yakan çift tık); ayrıca satır-N bulgusunu tam-dosya replace ile düzeltme
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

## Kök neden

TASK-MTREJ27YUPSY7'de 80 lint uyarısının 79'u `@typescript-eslint/no-unused-vars`'tı.
Hepsini `_` ön ekiyle susturmak ya da silmek 10 dakikalık iş olurdu. Okuyunca çıkan:
**bulguların bir kısmı çöp değil, gerçek bir hatanın tek görünür belirtisiydi.** Silmek
o hatanın son izini de yok ederdi.

Gerçekten bulunanlar (hepsi kanıtlı):

- `const t = await getTranslations()` **kullanılmıyor** → sayfa çeviriciyi yükleyip
  sonra **sabit İngilizce** basıyordu ("Fund Calls"). CLAUDE.md §8 ihlali. `t`'yi silmek
  ihlali kalıcılaştırırdı; doğrusu anahtarları ekleyip `t`'yi KULLANMAKTI.
- `isGeneratingChecklist` **değeri** okunmuyor, setter iki yerde çağrılıyor → AI çağrısı
  sırasında buton boşta görünüyor, tekrar tıklanabiliyor. Her tık **kredi düşürür**
  (CLAUDE.md §5). Doğrusu `disabled` + busy label.
- `hasSubscription` prop'u okunmuyor → aboneliği olmayana "Manage Subscription".
- `pageNumber` parse edilip atılıyor → route `?page=` kabul ediyor ama adapter sayfa
  argümanı almıyor; API sayfalama varmış gibi görünüyordu.
- `tenantId`/`userId` client component'e geçilip okunmuyor → client'ın kiracı taşıması
  bir footgun; prop'u tamamen kaldırmak doğrusu.
- `adminNavItems` okunmuyor → nav'ı `<AdminSidebarNav />` render ediyor, bu ikinci
  ölü kopyaydı.

## How to apply

1. Bulguyu üçe ayır: **ölü kod** (sil) · **kasıtlı yutma** (`catch (e)` → `catch {`,
   yorum/fallback varsa) · **belirti** (asıl hatayı düzelt, susturma).
2. "Belirti" şüphesi için sor: *bu değer okunsaydı ekranda/API'de ne değişirdi?*
   Cevap "bir şey değişirdi" ise bu bir bug'dır.
3. Ölü kodu silerken **bilgi kaybını yorumla telafi et**. Ör. `pageNumber` silinirken
   "bu route sayfalamıyor, adapter sayfa argümanı almıyor" yorumu kaldı; yoksa bir
   sonraki okuyucu aynı yanılgıya düşer.
4. Kapsam dışı çıkan gerçek hataları **raporla ve ayrı kart öner**, sessizce düzeltme.

## Ayrı bir tuzak: satır-N bulgusunu tam-dosya replace ile düzeltme

`s.replace(old, new, 1)` **dosyadaki İLK eşleşmeyi** değiştirir; lint bulgusu ise
satır N'i işaret eder. `tests/e2e/rls.spec.ts`'te `const wsA = await prisma...` iki kez
geçiyordu — lint 97. satırdakini şikayet ediyordu, benim replace'im **64. satırdaki
KULLANILAN tanımı** sıyırdı ve RLS izolasyon testini bozacaktı. `npx eslint` "hâlâ 2
uyarı var" deyince yakalandı.

**Kural:** düzeltmeyi satır numarasına ya da **benzersiz bağlama** (yalnız o bloğa özgü
komşu satırlarla birlikte) demirle; sonra `git diff <dosya>` ile tam olarak beklediğin
satırların değiştiğini gör, ve testi koş.

İlgili: [[fabrika-fabrication-audit-must-cover-defaults]] ·
[[fabrika-stage-only-your-hunks-from-shared-json]]
