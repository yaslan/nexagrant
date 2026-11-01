# TASK-MTU64VO8UILP2 — SPRINT-S12 sürüm notları

## 1. Ne yapıldı

`docs/RELEASE-NOTES-S12.md` zaten bir önceki turdan bir taslak barındırıyordu (kapı kırmızı,
`git log --oneline dev -40` temelli, `c0caeaf`'e kadar). Bu turda:

1. `git log` ile taslaktan sonra `dev` dalına eklenen commit'ler tarandı: HEAD (`3e14b40`)
   ile taslağın kapsadığı son commit (`c0caeaf`) arası, `docs(memory)` ve tek satırlık
   `docs(agent-results)` kart-kapanışları hariç tutularak 14 gerçek ürün commit'i bulundu.
2. Her commit'in tam gövdesi okundu (`git show -s --format="%s%n%n%b" <hash>`) ve ilgili
   `docs/agent-results/TASK-*.md` dosyalarıyla çapraz kontrol edildi (gate durumu, hangi
   commit'in hangi tam `pnpm gate` koşusunu kapsadığı).
3. Taslağın "Bilinen sorun — kapı kırmızı" bölümü, kök nedenin gerçekten düzeltildiği
   bulunduğu için "çözüldü" olarak güncellendi (`2a83253`, kanıt: `TASK-MTUI9ZBK7W4JY`
   raporundaki `pnpm gate` YEŞİL sonucu — 8/8 aşama, e2e 146/1).
4. 6 yeni bölüm eklendi: Faturalama & ödeme güvenliği, Çok kiracılılık (RLS)
   sertleştirmeleri, YZ/RAG katmanı, Admin konsolu, i18n; E-Fatura ve Kalite kapısı/CI
   bölümlerine de yeni maddeler eklendi.
5. Her madde bir commit hash'ine bağlandı; commit'i olmayan hiçbir özellik yazılmadı.
6. Metin `humanizer` skill'inden geçirildi (kalıp taraması yapıldı — zorlama üçlü, boş
   kapanış, "sonuç olarak" zinciri gibi izler bulunmadı, orijinal taslağın tonu zaten
   yoğun/kanıt-ağırlıklı teknik dildeydi); kanıt satırlarına (hash, sayı, komut çıktısı)
   dokunulmadı.
7. Rapor sonunda dürüstlük notu eklendi: `1d49048` ve `3e14b40`, ölçülen son tam yeşil
   `pnpm gate` koşusundan (`aef5706` üzerinde) SONRA commit'lendi; ikisi de kendi
   raporlarında ayrı ayrı doğrulanmış (typecheck/lint/birim test + hedefli e2e/mutasyon)
   ama HEAD'de yeni bir tam `pnpm gate` koşusu bu raporun kanıt tabanında yok — bunu
   olduğu gibi yazdım, "kapı HEAD'de yeşil" diye abartmadım.

## 2. Kanıt

Commit taraması (yalnızca ürün commit'leri, memory/agent-results hariç):
```
$ git log --oneline
3e14b40 test(e2e): make the module gate spec measure something, and stop borrowing demo-tenant
1d49048 fix(m6): make a tenant-less scoring call impossible to compile
aef5706 test(billing): lock the plan-delete guard against planId/planVersionId drift
290cc8c fix(billing): gate checkout behind a session, and send a signed-out cart to login
72dd16f fix(billing): stop leaking raw export errors to invoice downloads
fd49ba4 fix(admin): remove unevidenced RLS/status badges from console
d27d8f4 refactor(k6): finish the RAG merge — one module, one search, no src/lib/ai
2a83253 fix(core): remove the loading.tsx boundaries that duplicated every page
45580ed fix(k6): stop the RAG layer inventing evidence, and lock both fabrications out
d1de9d4 fix(core): stop the tenant filter from vanishing on three screens
af75623 fix(core): close two RLS blind spots — tenant link tables and null-tenant audit
a7c8483 feat(m8): move marketplace client hardcoded strings to next-intl
374709f fix(m-calendar): align CalendarConnection RLS policy with reference pattern
ce14101 test(m5): add line-level withholding tax XML tests and validate invalid rates
```
(0c09ef1, fbab391, 2f692ab, 5db2baa, f587649, 42a7507, 71621c2, c0caeaf — `docs(memory)`/
`docs(agent-results)` — bilerek dışlandı.)

Gate durumu doğrulaması (`docs/agent-results/TASK-MTUI9ZBK7W4JY-blok-zincir-dev.md`'den
alıntı):
```
## Kapı durumu
**YEŞİL.**
- Komut: pnpm gate (= db:generate && lint && typecheck && test && i18n:check && rls:check && rls:verify && test:e2e)
- Commit: aef5706 (+ o andaki paylaşılan çalışma ağacı, benim 4 dosyam dahil)
- Sonuç: 8 aşamanın 8'i geçti — lint 0 hata (2 uyarı), tsc temiz, vitest 1670 passed / 8 skipped,
  i18n iki katalog da 1436 anahtar ve eşit, RLS 44/44 tablo canlı ölçümle doğrulandı, e2e 146 passed / 1 skipped.
```

Yayınlanan dosya:
```
$ wc -l docs/RELEASE-NOTES-S12.md
```

## 3. Değişen dosyalar
- `docs/RELEASE-NOTES-S12.md` — 14 yeni commit'e karşılık gelen içerikle güncellendi,
  "kapı kırmızı" durumu "kapı yeşil" olarak düzeltildi, TR+EN paralel.
- `docs/agent-results/TASK-MTU64VO8UILP2-blog-yazar.md` — bu dosya.

## 4. Riskler
- `TASK-MTUI9ZBK7W4JY`'nin raporunda geçen "Commit: aef5706 (+ o andaki paylaşılan çalışma
  ağacı, benim 4 dosyam dahil)" ifadesi, gate koşusunun `module-gate.spec.ts` /
  `plan-entitlement.spec.ts` değişikliklerini de (henüz commit edilmemiş haliyle)
  kapsadığını gösteriyor — ama bu bir working-tree kanıtı, `3e14b40` hash'i üzerinde
  yeniden koşulmuş bir gate değil. Release notunda bunu "son ölçülen tam koşu, bu
  düzeltmeleri içeren ağaçta" diye ayrı bir cümleyle işaretledim; "HEAD'de gate yeşil"
  diye tek cümleye indirmedim.
- Bu bir sürüm notu derleme görevi; kod değişikliği yapmadım, dolayısıyla `pnpm gate`
  benim tarafımdan yeniden koşulmadı (gerek de yoktu — üstteki raporlardan alıntı yeterli
  kanıt).

## 5. Açık sorular
Yok.

## 6. Sonraki adım
- Sonraki bir S12 sürüm notu güncellemesi gerekirse, bu raporun kapsadığı son commit
  (`3e14b40`) sonrasından devam edilmeli; taze bir `pnpm gate` koşusu varsa footer'daki
  dürüstlük notu güncellenmeli/kaldırılmalı.

## Platform beyanı

**mac** (darwin 25.6.0) üzerinde doğrulandı. Bu görev yalnızca `git log`/`git show` okuma
komutları ve iki markdown dosyası yazımından ibaret — platforma bağlı hiçbir yol (süreç
öldürme, kabuk/ikili adı, mutlak dosya yolu, DPI/ekran, mikrofon-kamera izni) içermiyor.
Windows/Linux'ta aynı `git` komutları ve markdown yazımı aynı şekilde çalışır; ayrıca
doğrulama gerektirmiyor.
