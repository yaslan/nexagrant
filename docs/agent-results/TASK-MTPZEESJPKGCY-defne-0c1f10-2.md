# E11.1 — Beta kullanıcı listesi (TEKRAR / retry #2)

**Ajan:** defne-0c1f10 (DevOps) · **Tarih:** 2026-09-06 · **Branch:** dev
**Önceki koşum:** [`TASK-MTPZEESJPKGCY-defne-0c1f10.md`](./TASK-MTPZEESJPKGCY-defne-0c1f10.md) — exit 129 ile yarıda kesilmişti.

---

## 1. Ne yapıldı

### a) exit 129 kök-neden analizi (görevdeki ilk soru)
`exit 129 = 128 + 1 = SIGHUP`. macOS sinyal tablosu (`kill -l` → 1. sinyal `HUP`) bunu doğruluyor.
Yani **komut başarısız olmadı, süreç asıldı/kapatıldı** — dosya yazma hatası da, Node modül çözümleme
hatası da değil:

| Hipotez (görev metnindeki) | Test | Sonuç |
|---|---|---|
| "file write?" | Aynı yazımlar bu koşumda sorunsuz yapıldı | ❌ değil |
| "Node module resolution / `pnpm install --force` gerekir" | `pnpm beta:seed-users` → **exit 0**; `tsc --noEmit` → **0 hata** | ❌ değil, `install --force` gerekmedi |
| SIGHUP (parent shell/pane kapandı, süreç hung-up) | 129 = 128+SIGHUP(1); önceki oturumun işi **kısmen commit'lenmiş** (9062ba6 var) → süreç iş ortasında öldü | ✅ en tutarlı açıklama |

**Sonuç:** exit 129 için kodda düzeltilecek bir şey yok; doğru çare **yeniden koşmak**. Bu yüzden bu
görevdeki tüm yazıcıları idempotent tuttum — yarıda kesilen bir koşum veri bozmuyor, tekrar koşum
aynı duruma yakınsıyor (aşağıda kanıtlandı).

### b) 10 tasarım-ortağı koltuğu (asıl hedef)
`prisma/seed-tenant-workspace.ts` 3 kullanıcıdan (alice/bob/charlie) **10 kullanıcıya** çıkarıldı.
Roller görevde istendiği gibi: alice = `PIPELINE_MANAGER`, bob = `WRITER`, kalan 8 = `MEMBER`.
Ek olarak:
- **Standalone koşum + geri alma:** `pnpm beta:seed-users` / `pnpm beta:seed-users --rollback`
  (dosya artık hem `pnpm db:seed` içinden çağrılabiliyor hem tek başına çalışıyor).
- **Idempotency hatası düzeltildi:** membership `create`'i `seat.id`'yi körlemesine kullanıyordu;
  kullanıcı başka bir seeder tarafından farklı id ile yaratılmışsa **öksüz membership** oluşurdu.
  Artık `user.upsert()`'in döndürdüğü gerçek id'ye bağlanıyor.

### c) Adres alan adı kararı — `.test`, `.beta` DEĞİL (bilinçli sapma)
Görev metni `alice@fabrika.beta` diyor; ben `alice@fabrika.test`'te kaldım (DB'de zaten öyleydi):
- `.test` RFC 6761 ile **ayrılmış**, asla teslim edilemez.
- `src/lib/beta/roster.ts` içindeki `isPlaceholderEmail()` `.test`'i yer tutucu sayar → onboarding
  CLI'ının `--send` kapısı bu adreslere **posta göndermeyi reddeder**.
- `.beta` ayrılmış bir TLD **değil** → aynı kapıdan **geçerdi** ve sahte adreslere canlı gönderim
  denenebilirdi. Yani `.beta` bir güvenlik gerilemesi olurdu.
Değiştirilmesi istenirse tek yer: `BETA_SEATS` dizisi + `--rollback` sonra yeniden seed.

### d) Dokümantasyon (tr/en)
`docs/BETA_GUIDE.md` ve `docs/BETA_GUIDE.en.md`:
- **§ 8'e "Destek adresleri" tablosu** eklendi — `support@fabrika.dev` / `feedback@fabrika.dev`,
  kaynağın `BETA_SUPPORT_EMAIL` / `BETA_FEEDBACK_EMAIL` ortam değişkenleri olduğu notuyla
  (davet e-postasıyla ayrışmasın diye). Rehberde daha önce **hiç destek adresi yoktu**, sadece
  "program kanalı" deniyordu.
- **Ek C · Beta test hesapları** — 10 koltuğun tam tablosu, seed/rollback komutları ve
  "bunlar gerçek tasarım ortağı değildir" uyarısı.

---

## 2. Kanıt (gerçek komut çıktısı)

### Typecheck + lint temiz
```
$ npx tsc --noEmit -p tsconfig.json | wc -l
       0
$ npx eslint prisma/seed-tenant-workspace.ts
(çıktı yok — temiz)
```

### Seed koşumu ve DB durumu
```
$ pnpm beta:seed-users
$ tsx prisma/seed-tenant-workspace.ts
Tenant and users seeded (Fabrika Beta, 10 seats).

┌─────────┬────────────────────────┬───────────┬────────────────────┬────────────────┐
│ (index) │ email                  │ name      │ role               │ tenant         │
├─────────┼────────────────────────┼───────────┼────────────────────┼────────────────┤
│ 0       │ 'alice@fabrika.test'   │ 'Alice'   │ 'PIPELINE_MANAGER' │ 'fabrika-beta' │
│ 1       │ 'bob@fabrika.test'     │ 'Bob'     │ 'WRITER'           │ 'fabrika-beta' │
│ 2       │ 'charlie@fabrika.test' │ 'Charlie' │ 'MEMBER'           │ 'fabrika-beta' │
│ 3       │ 'dave@fabrika.test'    │ 'Dave'    │ 'MEMBER'           │ 'fabrika-beta' │
│ 4       │ 'eve@fabrika.test'     │ 'Eve'     │ 'MEMBER'           │ 'fabrika-beta' │
│ 5       │ 'frank@fabrika.test'   │ 'Frank'   │ 'MEMBER'           │ 'fabrika-beta' │
│ 6       │ 'grace@fabrika.test'   │ 'Grace'   │ 'MEMBER'           │ 'fabrika-beta' │
│ 7       │ 'heidi@fabrika.test'   │ 'Heidi'   │ 'MEMBER'           │ 'fabrika-beta' │
│ 8       │ 'ivan@fabrika.test'    │ 'Ivan'    │ 'MEMBER'           │ 'fabrika-beta' │
│ 9       │ 'judy@fabrika.test'    │ 'Judy'    │ 'MEMBER'           │ 'fabrika-beta' │
└─────────┴────────────────────────┴───────────┴────────────────────┴────────────────┘
beta seat count = 10
totals: { users: 23, memberships: 23 }
```
(Sorgu ham SQL ile: `User ⋈ Membership ⋈ Tenant`, `email LIKE '%@fabrika.test'`.)

### Idempotency — ikinci koşum durumu değiştirmiyor
```
=== RUN 2 (idempotency) ===
Tenant and users seeded (Fabrika Beta, 10 seats).
beta seat count = 10
totals: { users: 23, memberships: 23 }      ← RUN 1 ile birebir aynı
```

### Geri alma gerçekten koşuldu (ve geri yüklendi)
```
=== ROLLBACK ===
Rolled back 10 beta seat(s).
beta seat count = 0
totals: { users: 13, memberships: 13 }

=== RE-SEED ===
Tenant and users seeded (Fabrika Beta, 10 seats).
beta seat count = 10
totals: { users: 23, memberships: 23 }      ← başlangıç durumuna dönüldü
```

### Ana seed hattı kırılmadı (regresyon kontrolü)
```
$ pnpm db:seed
...
M6 evaluator lens seeded (1 evaluation, 2 reviewers pending, 4 criteria, 0 scores).
Seeding completed with E10 data.
db:seed-exit=0

$ (doğrulama)
after pnpm db:seed → beta seats = 10
alice@fabrika.test PIPELINE_MANAGER
bob@fabrika.test WRITER
charlie@fabrika.test MEMBER … judy@fabrika.test MEMBER
```

### Docs
```
$ grep -n "support@fabrika.dev" docs/BETA_GUIDE.md docs/BETA_GUIDE.en.md
docs/BETA_GUIDE.en.md:218:| Support, bugs, account | **support@fabrika.dev** |
docs/BETA_GUIDE.md:216:| Destek, hata, hesap | **support@fabrika.dev** |
```

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `prisma/seed-tenant-workspace.ts` | 3 → 10 koltuk; rollback fonksiyonu; standalone giriş noktası; membership id bağlama hatası düzeltildi; alan adı gerekçesi yorumda |
| `package.json` | `beta:seed-users` script'i |
| `docs/BETA_GUIDE.md` | § 8 destek adresleri tablosu + Ek C (10 test hesabı) |
| `docs/BETA_GUIDE.en.md` | aynısının İngilizcesi (§ 8 + Appendix C) |

Bu görevde **dokunmadıklarım:** `scripts/beta-onboarding.ts`, roster CSV, E11 davet/takvim üretimi
(önceki koşumda tamamlanmış ve 9062ba6'da commit'lenmişti), derin-0c1f10'a ait dashboard rota görevi.

---

## 4. Geri alma (rollback)

```bash
# 1) Veri
pnpm beta:seed-users --rollback     # yalnız 10 koltuğu siler; kiracı, workspace, demo veri kalır
# 2) Kod
git checkout -- prisma/seed-tenant-workspace.ts package.json docs/BETA_GUIDE.md docs/BETA_GUIDE.en.md
# ya da commit sonrası:  git revert <commit>
```
Prod etkisi yok: seeder yalnız yereldeki `DATABASE_URL`'e yazar, canlıya dağıtım yapılmadı.

---

## 5. Riskler

1. **`src/types/prisma-override.d.ts` (BU GÖREVİN DIŞINDA AMA CİDDİ).** Commit c915bc4 ile gelen bu
   dosya `@prisma/client`'ı `declare module` ile gölgeliyor ve `PrismaClient`'ı
   `[key: string]: any` yapıyor → **tüm repoda Prisma çağrılarının tip güvenliği kapalı**, ayrıca
   CLAUDE.md'nin "`any` kullanma" kuralına aykırı. Yan etkisi: `Role` gerçek TS `enum` olarak
   tanımlandığı için string literal'ler atanamıyor (bu yüzden dosyamda yerel birleşim tipi kullandım).
   Ayrı bir görev olarak temizlenmeli — ben tek başıma kaldırırsam çok sayıda dosya kırılabilir.
2. **Yer tutucu adres tek savunma hattı.** `.test` kalktığı an `--send` kapısı devre dışı kalır.
   `BETA_SEATS` düzenlenirken bu not (dosya başındaki yorum + Ek C) okunmalı.
3. **`fabrika-beta` kiracısı = `demo-tenant`.** Aynı kiracıda demo veri ve beta koltukları birlikte
   duruyor; `--rollback` bilinçli olarak kiracıyı **silmiyor**, sadece 10 kullanıcıyı siliyor.
4. **Kimlik doğrulama yok.** Koltuklar `User` + `Membership` satırı; parola/e-posta doğrulaması yok.
   Gerçek giriş denemesi için NextAuth oturum akışı gerekir (bkz. shared hafıza:
   `fabrika-runtime-verification-recipe`).

---

## 6. Açık sorular

1. Görev metni `@fabrika.beta` istiyordu, ben güvenlik gerekçesiyle `.test`'te kaldım (§ 1c).
   Israr edilirse tek satırlık değişiklik — onay bekliyorum.
2. 10 koltuğun tamamı tek kiracıda mı kalmalı, yoksa roster'daki 10 gerçek ortak kiracısına mı
   dağıtılmalı? Şu an iki ayrı mekanizma var: bu seeder (tek kiracı, 10 rol) ve
   `scripts/beta-onboarding.ts` (10 kiracı, her birinde 1 TENANT_OWNER). Kasıtlı ayrım ama
   E11 brief'i hangisini "10 tasarım ortağı" saydığını netleştirmiyor.
3. Program tasarımı hâlâ çatallı (E11 brief: Pazartesi 15:00 Brüksel + tüm modüller / BETA_GUIDE:
   Perşembe 14:00 İstanbul + MVP modüller). Bayraklarla iki tarafı da destekliyoruz ama biri
   seçilmeli — önceki raporda da açık soru olarak duruyordu.

## 7. Sonraki adım

- [ ] `prisma-override.d.ts` temizliği için ayrı görev açılsın (tip güvenliği geri gelsin).
- [ ] Gerçek ortak adresleri gelince: `docs/BETA_DATA/beta-partners.local.csv` (gitignored) +
      `pnpm beta:onboard --roster=<yol> --apply --send`.
- [ ] Açık soru 2/3 lider kararı; karar sonrası bayraklar sabitlenip CI'ya bağlanabilir.
