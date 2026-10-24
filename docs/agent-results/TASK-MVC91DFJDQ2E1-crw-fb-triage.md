---
sözleşme: 3
görev: TASK-MVC91DFJDQ2E1
kod: TASK-MVC91DFJDQ2E1
ajan: crw-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: Üç PR'ın üçü de EKSİK (hepsi dev ile çakışıyor). #94 ve #92 yazarın dev merge'ünden sonra merge'e hazır (kod temiz, deneme merge'te testler yeşil). #95 FO-45 üstüne yeniden yazılmalı. Yayın sırası #92 → #95 → #94 olmalı, yoksa KVKK metni koddan önde kalır.
platform: mac (Darwin 27, zsh, yerel Postgres; tek kullanımlık kopya DB fabrika_crwfb_st1, iş sonunda silindi). Değişiklikler metin + TS + SQL; platforma bağlı kod yolu yok (süreç/kabuk/dosya yolu ayrımı yok; kvkk-text.server.ts path.join kullanıyor). Windows/Linux koşulmadı, gerek de yok: davranış Node + Postgres'te aynı.
sürüm: 1
tarih: 2026-10-18T15:51:05.396Z
---

# PR kuyruğu triyajı: #94 (FO-49), #92 (FO-50 + FO-71), #95 (FO-26)

## Ne yapıldı
Kod değiştirmedim, merge yapmadım, canlı DB'ye dokunmadım. Kendi worktree'mi açtım (`FONBRIDGE-crw-triage-st1`, dev'den detached) ve iş bitince kaldırdım. Her PR için şunları yaptım:
- kartı okudum,
- son inceleme raporunu aradım,
- head'i karşılaştırdım,
- yazar worktree'sinde push edilmemiş commit var mı baktım,
- `git merge-tree` ile çakışmayı ölçtüm,
- deneme merge'ü (yalnız kendi worktree'mde) ve hedefli testleri koştum.

Canlı testleri `fabrika_fo50_be`'nin TEMPLATE kopyası olan `fabrika_crwfb_st1`'de koştum. Önce `select current_database()` ile hedefi doğruladım. `db:rls-role` koşmadım, çünkü `ALTER ROLE` küme geneline etki eder. DB kopyası iş sonunda silindi.

## Özet tablo
| PR | Kart | Head | Son inceleme | Push edilmemiş | dev çakışması | Testler | Hüküm |
|---|---|---|---|---|---|---|---|
| #94 | FO-49 TASK-MVC91DFJDQ2E1 | `ba30809a` | **yok**, bu triyajda tam inceleme | yok (`.claude-fo49` = origin, temiz) | `docs/DATA_MODEL.md`, 1 satır | deneme merge: vitest 84/84, tsc 0, i18n ✅ | **EKSİK: dev merge (se-fb) + yayın sırası** |
| #92 | FO-50 TASK-MVC91K7JYOWQC (+FO-71) | `d1c4876f` | `TASK-MVC91K7JYOWQC-crw-fb-2.md` @ `d1c4876f`, **head değişmedi** | yok (`FONBRIDGE-fo50` = origin, temiz) | `DATA_MODEL.md` + `apply-order.txt` (iki taraf da sona eklemiş) | deneme merge: vitest 144/144, tsc 0, rls:check ✅, canlı 14/14 | **EKSİK: dev merge (be-fb)** |
| #95 | FO-26 TASK-MVBLYRLP9ID93 | `c7f745a5` | **yok**, bu triyajda head incelendi | yok (`fo26-attempt-counter` = origin, temiz) | `register.ts`, `register.test.ts`, `schema.prisma`, `rls.sql`, `DATA_MODEL.md` | kendi head'inde: vitest 102/102, tsc 0 | **EKSİK: FO-45 üstüne rebase (be-fb) + yeniden inceleme** |

origin/dev ölçüm sırasında `a59c7479`'dan `b252f168`'e ilerledi (#90 FO-39, yalnız nav). Çakışma kümesini yeni dev'e göre yeniden ölçtüm, aynı çıktı.

## Kanıt (ham çıktı)
```
gh pr view: 94 ba30809a CONFLICTING · 92 d1c4876f CONFLICTING · 95 c7f745a5 CONFLICTING
local vs origin (ahead/behind): fo49 0 0 · fo50 0 0 · fo26 0 0 ; git status --short: üçü de boş
dev'e göre (ahead behind): fo49 2 67 · fo50 6 47 · fo26 2 64

merge-tree origin/dev (b252f168):
 fo49: CONFLICT docs/DATA_MODEL.md
 fo50: CONFLICT docs/DATA_MODEL.md, prisma/migrations/apply-order.txt
 fo26: CONFLICT docs/DATA_MODEL.md, prisma/rls.sql, prisma/schema.prisma,
       src/lib/expert-prereg/server/register.test.ts, src/lib/expert-prereg/server/register.ts

#94 deneme merge (DATA_MODEL: dev satırı + kvkk-v2):
 vitest tests/expert-prereg-form.test.tsx src/lib/expert-prereg tests/expert-prereg-admin-route.test.ts
   Test Files 7 passed (7) · Tests 84 passed (84)
 tsc --noEmit → exit 0 · pnpm i18n:check → ✅ passed
 grep "tüzel kişi unvanı]|FonBridge Ltd" content src messages docs .env.example (agent-results ve v1 arşivi hariç) → boş
 kalan kvkk-v1: yalnız prisma/schema.prisma:716 @default("kvkk-v1") (kayıt akışı her zaman sabiti yazar; bilgi)

#92 deneme merge (apply-order: blog-read-minutes.sql + add-expert-founder-counter.sql; DATA_MODEL: §22a sonra §23):
 vitest src/lib/expert-prereg tests/expert-prereg-form.test.tsx tests/rls-coverage.test.ts tests/jobs
   Test Files 10 passed (10) · Tests 144 passed (144)
 tsc → 0 · rls:check → ✅ SUCCESS
 apply-migrations (kopya): 50 files applied ; db:rls: Policies 114 → 114
 vitest tests/expert-prereg-retention.live.test.ts tests/expert-prereg.live.test.ts tests/expert-prereg-app-role.live.test.ts
   Test Files 3 passed (3) · Tests 14 passed (14)

#95 kendi head'inde:
 vitest src/lib/expert-prereg tests/rls-coverage.test.ts tests/expert-prereg-admin-route.test.ts
   Test Files 7 passed (7) · Tests 102 passed (102) ; tsc → 0
```

## PR #94 — FO-49 KVKK uzman metni v2
**Hüküm: EKSİK.** Bunlar kod hatası değil, yazarın dev merge'ü ve yayın sırası eksik.
1. **Çakışma (se-fb):** `docs/DATA_MODEL.md` §22'de alan listesi satırı çakışıyor. Dev bu satıra FO-45 alanlarını ekledi. Çözüm: dev satırını alıp yalnız `kvkk-v1` → `kvkk-v2, eski satırlar kvkk-v1` yapmak. Bunu deneme merge'te yaptım, testler yeşil.
2. **Yayın sırası (lider) — metin koddan önde kalmasın:**
   - §6 "1 yıl sonra silinir" cümlesi yalnız #92'nin silme işi dev'deyken doğru. se-fb'nin Risk-1'i ("silme job'u yok") #92 ile kapanıyor.
   - §6 "formu **ilk** gönderdiğiniz tarihten" cümlesi yalnız #95 ile doğru. Bugün dev'de (FO-45 F6) bekleyen bir kayıt yeniden gönderilince `createdAt: now` yazılıyor (`register.ts` yeniden kayıt güncellemesi). #92 de `createdAt < cutoff` ile siliyor. Yani #95 olmadan yeniden gönderim saklama süresini uzatır ve metinde söylenenden uzun saklanır.
   - Sıra **#92 → #95 → #94** olmalı, ya da üçü aynı dağıtıma girmeli.
3. Kodda başka bulgu yok. Yükleyici v2'ye bağlı, sabit `kvkk-v2`, v1 dosyaları denetim izi için duruyor. Yurt dışı alt işleyen kontrolüne baktım: prereg sayfa ve bileşenlerinde PostHog/gtag/sentry yok (`grep posthog src/app src/components` boş). E-posta kendi SMTP'den gidiyor. Bu, se-fb'nin bulgusuyla uyumlu.
4. **NIT:** `docs/legal/privacy-notice-gap-analysis.md` tablosunda ve §1'de yeni unvanın yanında hâlâ "patron kararı, 2026-09-08" yazıyor. Doğru tarih 2026-10-17. `EFATURA_SETUP.md` bunu düzeltmiş, bu dosya düzeltmemiş.
5. **Bilgi:** FO-45 F6 kuralına göre bekleyen bir kayıt yeniden gönderilirse ilk rıza korunuyor. Yani v1 ile kayıt olup v2'yi görerek yeniden gönderen kişinin satırı `kvkk-v1` olarak kalır. Bu kayıt doğru (kişi v1'i kabul etti), sadece bilinsin.

## PR #92 — FO-50 1 yıl saklama (+ FO-71)
**Hüküm: EKSİK: yalnız dev merge (be-fb).** Kod tarafı hazır.
- Son inceleme (`TASK-MVC91K7JYOWQC-crw-fb-2.md`) `d1c4876f`'i inceledi ve PR head'i hâlâ o. Delta yok, yeniden kod incelemesi gerekmedi.
- O raporda "merge-tree temiz" yazıyordu. Dev sonra ilerledi (FO-84 blog-read-minutes) ve şimdi iki append çakışması var:
  - `apply-order.txt`: iki satırı da tut.
  - `DATA_MODEL.md`: §22a'yı §23 BlogPost'un önüne koy.
  Bu çözümle 144 birim, rls:check ve 14/14 canlı test yeşil.
- **FO-71 bağı:** FO-71'in Ö-1 ve Ö-2 işi #92'nin `f3e1fbfe` commit'inde: trigger, REVOKE DELETE/TRUNCATE, yalnız artıran upsert. Ayrı bir PR ya da dal yok (`gh pr list --search FO-71` boş). Kart ayrı bir `harden-…sql` istiyordu. Uygulama ise henüz dev'de olmayan `add-expert-founder-counter.sql`'i genişletiyor. Migration dev'de olmadığı için bu kabul edilebilir. FO-71 kartı #92 merge olunca "done"a alınabilir.
- Bilgi (#95 ile birlikte): `ExpertPreRegAttempt` satırları (ipHash) yalnız yeni bir gönderimde siliniyor. Trafik durursa 24 saatten eski satırlar kalır. İstenirse #92'nin gece işine tek bir `deleteMany` eklenebilir (öneri).

## PR #95 — FO-26 deneme sayacı + lastSubmittedAt
**Hüküm: EKSİK: be-fb FO-45 üstüne rebase etmeli, sonra crw yeniden incelemeli.**
Head'in kendi mantığında hata bulmadım:
- 409 ve yeniden kayıt denemeleri sayılıyor,
- IP 429'u sayılmıyor (kilitlenme uzamıyor),
- mail hatasında `lastSubmittedAt` geri yükleniyor,
- cooldown eski satırlar için `verifyTokenExpiresAt`'e düşüyor.

Ama dev'deki FO-45 aynı yolu yeniden yazdı. Rebase'te dikkat edilecekler:
1. **F6 güncellemesi** (yeniden kayıtta yalnız link, IP ve mail sayaçları değişiyor): oradaki `createdAt: now` kaldırılmalı, `lastSubmittedAt: now` eklenmeli. `ReissueState`'e `lastSubmittedAt` eklenmeli ama `createdAt` artık geri yüklenmemeli. FO-50 silme kuralının ve KVKK v2 §6'nın doğru olması buna bağlı.
2. **Cooldown:** dev'deki günlük mail kotası (`verifyMailCount`) korunmalı. Cooldown'u `lastSubmittedAt`'e taşırken kota kontrolü kaybolmamalı.
3. **`prisma/rls.sql` DISABLE listesi:** dev bu listeden `ExpertPreRegistration`'ı çıkardı (artık RLS açık + `system_scope`). `ExpertPreRegAttempt` doğru yere eklenmeli.
4. **Tasarım sorusu (öneri, be-fb/lider):** K-562266 = A ile kişisel veri taşıyan prereg tablosu `SYSTEM_SCOPE_POLICY`'ye alındı. `ExpertPreRegAttempt` ipHash taşıyor (KVKK'da takma adlı kişisel veri), ama RLS kapalı tasarlanmış. Bu haliyle her kiracı oturumu bu satırları okuyabilir. Aynı politikayla korunması daha tutarlı olur. Erişim zaten `withSystemScopeOn` içinde olduğu için kod değişikliği küçük.
5. **Öneri:** `apply-order.txt`'de yeni migration listenin ortasına (`add-expert-pre-registration.sql` sonrasına) eklenmiş. Sona eklemek dev'deki desene uyar.
6. Kart FO-26 board'da hâlâ `backlog`; PR açık olduğuna göre `review` olmalı.

## Değişen dosyalar
Yalnız bu rapor. Kod değişmedi.

## Riskler
- #94, #92'den önce merge edilirse metin silme işi olmadan "1 yıl sonra silinir" der.
- #92 ve #94, #95 olmadan yayına girerse "ilk gönderim" ifadesi bekleyen yeniden gönderimlerde yanlış olur.
- GitHub Actions çalışmıyor; kanıtın tamamı yerel. Tam `pnpm gate` koşmadım, yalnız hedefli testleri koştum.

## Sonraki adım
- se-fb: #94'te dev merge (DATA_MODEL tek satır) + NIT tarih.
- be-fb: #92'de dev merge (iki append). #95'te FO-45 üstüne rebase (madde 1–5).
- crw: #95 rebase sonrası yeniden inceleme. #92 ve #94 dev merge sonrası kısa delta kontrolü (yalnız merge commit'i).
- Lider: merge sırası #92 → #95 → #94. FO-71 #92 ile kapanır.
