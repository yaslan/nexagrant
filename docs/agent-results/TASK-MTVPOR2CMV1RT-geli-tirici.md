# TASK-MTVPOR2CMV1RT — `noUncheckedIndexedAccess` Dilim 2: UI katmanı

**Platform beyanı: macOS (Darwin 25.6.0, zsh, arm64).** Doğrulama burada yapıldı: `pnpm typecheck`,
`pnpm lint`, `npx vitest run` ve gerçek Chromium'da Playwright. Windows/Linux'ta **koşulmadı**.
Dokunulan kodun hiçbir yolu platforma bağlı değil — süreç öldürme, dosya yolu ayracı, kabuk/ikili
adı, kısayol metni, ekran/DPI veya cihaz izni içeren tek satır yok; değişenler yalnızca dizi/kayıt
index okuması, regex capture grubu ve React state şekli. `tsc` ve `vitest` platformdan bağımsız
çalışır, dolayısıyla diğer platformlarda aynı sonuç beklenir (beklenti, ölçüm değil).

---

## 1) Ne yapıldı

8 dosyadaki **16 ölçülen hata → 0**. `tsconfig.json`'a dokunulmadı; ölçüm kardeş probe config ile
yapıldı ve probe silindi.

| Dosya | Hata (önce) | Nasıl kapatıldı |
|---|---|---|
| `evidence/EvidenceForm.tsx` | 1 (TS2345) | `firstFileOrNull()` — boş `FileList` guard'ı |
| `pipeline/board.tsx` | 1 (TS2345) | `clearNoteText()` — state şekli **total** tutuldu |
| `components/SidebarNav.tsx` | 1 | `segments[1]` yerele alındı |
| `components/UserMenu.tsx` | 5 | `segments[1]` + `cleanWords` iki ucu yerele alındı |
| `(marketing)/blog/[slug]/page.tsx` | 5 | regex capture grubu `?? ''` |
| `admin/modules/page.tsx` | 1 | kova yerele alındı, geri yazıldı |
| `pipeline/[id]/consortium/manager.tsx` | 1 | aynı desen |
| `evidence/evidence-client.tsx` | 1 (TS18048) | `as const` → 8 elemanlı tuple, index 2 kanıtlı |

Hiçbir yerde `!` (non-null assertion) kullanılmadı — gerek kalmadı. Yeni kullanıcıya görünen metin
eklenmedi, dolayısıyla yeni `t()` anahtarı yok. Eklenen tek yeni öznitelik `data-testid` (i18n dışı).

### Kartın teşhisinde iki düzeltme

Kart "her hatayı kendi gözünle oku" dedi; iki nokta gerçekten farklı çıktı:

1. **`UserMenu.tsx` ~103 `cleanWords[0][0]` değil.** 103. satır `segments[1]` — `SidebarNav.tsx:20`
   ile birebir aynı desen. `cleanWords[0][0]` yalnız 144'te. (144 probe çıktısında 4 kez görünüyor:
   2 pozisyon × 2, dosya iki program kökünden derlendiği için.)
2. **`EvidenceForm.tsx` canlı üründe hiçbir yerden render edilmiyor** — aşağıda ayrı başlık.

---

## 2) İki "gerçek bug": bulduğum durum

Kart bunları gerçek bug diye işaretledi. İkisi de **derleyiciyle kanıtlanabilir sözleşme ihlali**;
ama ikisi de bugün **kullanıcıya ulaşan bir çökme değil**. Bulguyu olduğu gibi yazıyorum.

### Bug 1 — `EvidenceForm.tsx:95` — düzeltildi, ama bileşenin çağrı yeri YOK

`e.target.files && setFile(e.target.files[0])`. `FileList` bir nesne, dolayısıyla **boş olanı da
truthy** — guard geçiyor, index okuması `undefined` veriyor ve bu `undefined`,
`useState<File | null>(null)` ile tanımlı state'e yazılıyor. Sözleşme ihlali gerçek.

**Ancak** bu bileşen üründe hiçbir yerden render edilmiyor:

```
$ grep -rn "EvidenceForm" --include='*.ts' --include='*.tsx' src
src/app/[locale]/(app)/[workspace]/evidence/EvidenceForm.tsx:28:export function EvidenceForm(...)
```

Tek eşleşme kendi tanımı. Canlı kanıt yükleme arayüzü `evidence-client.tsx`'teki modal (satır ~533)
ve o modal zaten doğru yazılmış: `const file = e.target.files?.[0]; if (file) {...}`.

Sonuç: **kartın istediği "gerçek tarayıcıda dosya-iptal senaryosu" bu bileşen için koşulamaz —
bileşene giden bir rota yok.** Bu yüzden jsdom + RTL tavanı burada; kırmızı→yeşil kanıtı bölüm 3'te.
Dosyayı **silmedim** (kapsam dışı, yıkıcı); ölü kod olarak bölüm 5'te raporluyorum.

Ayrıca `files === null` halinin davranışı bilinçli olarak değişti: eskiden `setFile` hiç
çağrılmıyordu (eski dosya state'te kalıyordu), şimdi `null` yazılıyor. "Seçili dosya yok" demek
olan tek doğru okuma bu.

### Bug 2 — `pipeline/board.tsx:213` — düzeltildi, state şekli kararı gerekçesiyle

`setNoteInputs((prev) => ({ ...prev, [oppId]: { ...prev[oppId], text: '' } }))`.
`prev[oppId]` → `NoteInput | undefined`; `undefined` spread'i `{ text: '' }` üretiyor, yani
**`authorId` alanı olmayan** bir kayıt, `Record<string, { text: string; authorId: string }>` tipli
state'e geri yazılıyor (TS2345 — tip uyuşmazlığı, düz index okuması değil; kart bunu doğru demiş).

**Karar: `authorId` OPSİYONEL YAPILMADI, zorunlu kaldı.** Gerekçe:

- Not yazarı `<select value={cardNoteInput.authorId}>` **kontrollü** bir bileşen. `authorId`
  opsiyonel olsaydı `value={undefined}` yasallaşırdı ve React kontrollü select'i kontrolsüze
  düşürürdü — hatayı çözmek yerine tipe imzalatmış olurduk.
- Dosyanın geri kalanı zaten her kaydın tam olduğunu varsayıyor:
  `noteInputs[opp.id] || { text: '', authorId: members[0]?.id ?? '' }` (satır ~436) eksiksiz bir
  fallback veriyor. Şekli daraltmak değil, **yazan tarafı** düzeltmek doğru olan.
- Yükü yazana bırakmak: `clearNoteText(prev, oppId, fallbackAuthorId)` artık `authorId`'yi ya
  korur ya fallback'ten doldurur; eksik alan **kurgusal olarak imkânsız**.

**Erişilebilirlik (dürüst değerlendirme):** bugünkü akışta `prev[oppId]` 213'e ulaştığında hep
tanımlı — kullanıcı ya select'i değiştirir ya metin yazar, ikisi de kaydı eksiksiz oluşturur ve
kayıt hiç silinmez. Yani bugün canlıda tetiklenen bir çökme değil. Tetiklenseydi görünen zarar
şuydu: `{ text: '' }` truthy olduğu için 436'daki onarım fallback'i **devreye girmez**,
`value={undefined}` select'i kontrolsüze düşürür ve `handleAddNote` içindeki
`members.find((m) => m.id === cardInput.authorId) || members[0]` sonraki notu **ilk üyeye** yazar.
Testler tam olarak bunu kilitliyor.

---

## 3) Kanıt

### 3.1 Regresyon testleri — ÖNCE KIRMIZI

Kırmızıyı dürüst üretmek için önce HEAD'deki ifadeler **birebir** (bug dahil) adlandırılmış
fonksiyonlara çıkarıldı, sonra test koşuldu — böylece hata "export yok" değil, **gerçek değer
uyuşmazlığı** olarak düşüyor:

```
 FAIL  tests/evidence-form-file-clear.test.tsx > firstFileOrNull > returns null — never undefined — for an empty FileList
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
 ❯ tests/evidence-form-file-clear.test.tsx:51:37

 FAIL  tests/pipeline-note-input-shape.test.ts > clearNoteText > fills authorId from the fallback when no entry exists yet
AssertionError: expected { text: '' } to deeply equal { text: '', authorId: 'user-fallback' }
- Expected
+ Received
  {
-   "authorId": "user-fallback",
    "text": "",
  }
 ❯ tests/pipeline-note-input-shape.test.ts:56:27

 Test Files  2 failed (2)
      Tests  2 failed | 5 passed (7)
```

`{ text: '' }` — `authorId` **yok**. Bug tam olarak bu.

### 3.2 Aynı testler — SONRA YEŞİL

```
$ npx vitest run tests/evidence-form-file-clear.test.tsx tests/pipeline-note-input-shape.test.ts
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

### 3.3 Gerçek tarayıcı (Chromium) — not yazma senaryosu

```
$ E2E_PORT=3123 E2E_SHOTS_ROOT=docs/agent-results \
  npx playwright test tests/e2e/pipeline-note-author.spec.ts --project=chromium
Running 1 test using 1 worker
  ✓  1 [chromium] › tests/e2e/pipeline-note-author.spec.ts:114:5 › posting a note keeps the chosen author and clears only the text (2.4s)
  1 passed (6.0s)
exit=0
```

Gerçek Postgres + gerçek oturum. Fixture'da **iki** üye var: oturum `Ada Birinci` ile açılıyor ama
not yazarı olarak **`Bora İkinci`** seçiliyor — böylece "yazar korundu" ile "sessizce `members[0]`'a
düştü" birbirinden ayırt edilebiliyor. Spec, not gönderildikten sonra şunları doğruluyor:
notun ekrandaki yazarı `Bora İkinci` (ve `Ada Birinci` **değil**), taslak kutusu boş, kontrollü
select hâlâ `Bora İkinci`'de, ve React'in kontrollü→kontrolsüz uyarısı konsola **hiç** düşmüyor.

Kareler: `docs/agent-results/TASK-MTVPOR2CMV1RT-screenshots/`
- `01-note-drafted.png` — yazar `Bora İkinci` seçili, not yazılmış
- `02-note-posted-author-kept.png` — not `Bora İkinci` adına düşmüş, "Not Yazan" select hâlâ
  `Bora İkinci`, metin kutusu temizlenmiş, toast: "Bora İkinci kullanıcısının notu eklendi!"

Bu koşu, düzeltilen `clearNoteText` satırının **canlı yolda** olduğunu ve not akışını bozmadığını
kanıtlar (regresyon kilidi). Bug'ın kırmızı→yeşil kanıtı 3.1/3.2'deki birim testtir — 2. bölümde
yazdığım gibi, eksik-kayıt hali bugünkü UI akışıyla üretilemiyor.

**`EvidenceForm` için tarayıcı koşusu YOK — koşulamaz, çünkü bileşenin rotası yok** (bölüm 2).

### 3.4 Probe ölçümü (`tsconfig.json`'a dokunulmadan)

```bash
# tsconfig.nuia-ui-probe.json  (geçici, bana özel ad)
{ "extends": "./tsconfig.json",
  "compilerOptions": { "noUncheckedIndexedAccess": true, "incremental": false } }

$ npx tsc -p tsconfig.nuia-ui-probe.json --noEmit
```

`grep -c "error TS"` — 8 dosya, önce → sonra:

| Dosya | Önce | Sonra |
|---|---|---|
| `evidence/EvidenceForm.tsx` | 1 | **0** |
| `pipeline/board.tsx` | 1 | **0** |
| `components/SidebarNav.tsx` | 1 | **0** |
| `components/UserMenu.tsx` | 5 | **0** |
| `(marketing)/blog/[slug]/page.tsx` | 5 | **0** |
| `admin/modules/page.tsx` | 1 | **0** |
| `consortium/manager.tsx` | 1 | **0** |
| `evidence/evidence-client.tsx` | 1 | **0** |
| **Toplam** | **16** | **0** |

Yeni yazdığım üç test dosyası da bayrak altında **0** hata veriyor.

Probe toplamı 148 → 105 düştü (−43). Bunun 16'sı benim; kalan **27'si Dilim 1** dosyaları
(`prisma/seed-m6-evaluations.ts`, `scripts/compare-production-backup.ts`, `scripts/cordis-import.ts`,
`scripts/verify-deployed-bytecode.ts`) — customer-support paylaşımlı ağaçta eşzamanlı kapatmış.
Dosya bazında diff alındı: **hiçbir dosya hata kazanmadı**, yalnız bu 12 dosya listeden düştü.

### 3.5 Probe silindi

```
$ rm -f tsconfig.nuia-ui-probe.json
$ git status --porcelain | grep -i "nuia-ui-probe"
OK: no probe file in git status

$ git diff --stat -- tsconfig.json
(boş — tsconfig.json'a hiç dokunulmadı)
```

### 3.6 Bayraksız kapılar

```
$ pnpm typecheck  → exit 0
$ pnpm lint       → exit 0
$ npx vitest run  → exit 0
 Test Files  154 passed | 2 skipped (156)
      Tests  1841 passed | 8 skipped (1849)
```

---

## 4) Değişen dosyalar

**Kaynak (8 — kartın verdiği kapsam, dışına çıkılmadı):**
- `src/app/[locale]/(app)/[workspace]/evidence/EvidenceForm.tsx`
- `src/app/[locale]/(app)/[workspace]/evidence/evidence-client.tsx`
- `src/app/[locale]/(app)/[workspace]/pipeline/board.tsx`
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager.tsx`
- `src/app/[locale]/(marketing)/blog/[slug]/page.tsx`
- `src/app/[locale]/admin/modules/page.tsx`
- `src/components/SidebarNav.tsx`
- `src/components/UserMenu.tsx`

**Yeni testler (3):**
- `tests/evidence-form-file-clear.test.tsx`
- `tests/pipeline-note-input-shape.test.ts`
- `tests/e2e/pipeline-note-author.spec.ts`

**Kanıt:** `docs/agent-results/TASK-MTVPOR2CMV1RT-screenshots/` (2 kare)

`tsconfig.json` commit'e **girmedi**. `src/modules/m9/**`, `src/lib/inngest/**`, `scripts/`,
`prisma/seed*`, `src/modules/m6/**` — hiçbirine dokunulmadı.

---

## 5) Riskler

- **`EvidenceForm.tsx` ölü kod.** Çağrı yeri yok; canlı yükleme akışı `evidence-client.tsx`'teki
  modal. Guard'ı yine de eklendi (dosya durduğu sürece doğru olmalı) ama **silme kararı benim
  değil** — kapsam dışı ve yıkıcı. Ayrı kart konusu.
- **`clearNoteText` fallback'i `author.id`.** `handleAddNote` içinde `author` guard'dan sonra
  garanti non-null, yani fallback her zaman gerçek bir üye. Ancak `members` henüz yüklenmemişken
  436'daki fallback `authorId: ''` üretiyor — bu **önceden var olan** ayrı bir davranış, bu kartın
  kapsamı değil, dokunmadım.
- **`as const` (evidence-client)** diziyi readonly yapar. Bugün üç kullanım da salt-okunur
  (`.map`, `.find`, index) ve `pnpm typecheck` yeşil; ileride bu diziye yazmak isteyen olursa
  derleyici durdurur (istenen davranış).
- **e2e gate'in tamamı koşulmadı** — yalnız kendi spec'im. Ağaçta dört ajan daha aktif ve tam
  `pnpm test:e2e` paylaşılan fixture'ları (tenant/plan satırları) yeniden yazıyor; komşuların
  koşan işini bozmamak için tam gate'i tetiklemedim. Bu bir **atlama değil, bilinçli sıra kararı**:
  tam gate birleştirme anında koşulmalı.
- Dev sunucusu loglarında `FORMATTING_ERROR: ... variable "brand" was not provided`
  (`src/app/[locale]/page.tsx:19`, landing metadata) görüldü. **Benim değişikliğimle ilgisi yok**,
  HEAD'de zaten var; kapsam dışı olduğu için dokunmadım, not düşüyorum.

## 6) Açık sorular

1. `EvidenceForm.tsx` silinsin mi, yoksa `evidence-client.tsx` modalının yerine geçmesi mi
   planlanıyordu? (Ölü kod kartı açılmalı.)
2. Bayrak ne zaman kalıcı açılacak? Dilim 1 ve 3 kapandı, Dilim 2 bu kartla kapandı; probe'a göre
   geriye **105 hata** kaldı ve tamamı Dilim 4 (test dosyaları). Bayrak yalnız o dilimden sonra
   açılmalı — planın kuralı bu.

## 7) Sonraki adım

- **Dilim 4** (14 test dosyası, 105 hata, mekanik) — son dilim.
- Dilim 4 birleşince ayrı ve tek commit'te `tsconfig.json`'a `"noUncheckedIndexedAccess": true`
  eklenip `pnpm typecheck` 0 hata ile doğrulanmalı.
