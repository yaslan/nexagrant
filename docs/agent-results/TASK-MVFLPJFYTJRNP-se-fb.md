# TASK-MVFLPJFYTJRNP (FO-102) — PR #94 rebase + KVKK aydınlatma metni eksikleri (se-fb)

**Hüküm: KISMEN TAMAM — push yapılamadı.**
- Metin işi bitti, testleri ve canlı kontrolü geçti.
- Rebase yerelde temiz.
- Push, pre-push kapısındaki (`pnpm gate`) yük kaynaklı zaman aşımları yüzünden 4 kez reddedildi. Bu yüzden PR #94 GitHub'da hâlâ `DIRTY` görünüyor.
- `--no-verify` kullanılmadı. Dal yerelde, push için hazır.
- Metin hukuk onayı gelmeden ve adres/KEP doldurulmadan YAYINA ÇIKMAMALI.

Bağlam: FO-21 raporu `TASK-MVBIYRGLU5EMX-se-fb.md` (B1, B2, O2, O3).

## Ne yapıldı
1. **Rebase.** `se-fb/fo49-kvkk-v2` güncel `origin/dev`'e (`80271979`) rebase edildi. Eski merge commit'i (`20899dc3`) düşürüldü, geçmiş doğrusal oldu.
   - Tek çakışma `docs/DATA_MODEL.md`'deydi. Dev'in FO-45/FO-26 metni aynen alındı, yalnız `consentTextVersion` notu `kvkk-v2` yapıldı.
   - Yerel durum: dal `origin/dev`'in üstünde, ileride 3 commit.
2. **O2 eksikleri, `content/kvkk-uzman-v2.md` ve `.en.md` (commit `b579d873`):**
   - §1: adres ve KEP adresi satırları eklendi. Değerler bilinmediği için **yer tutucu**: `[ADRES — patron]`, `[KEP ADRESİ — patron]`.
   - §4 "Toplama yöntemi ve hukuki sebepler" (m.10/1-d): web formu, elektronik ortam, kısmen otomatik (form, doğrulama bağlantısı, IP özeti).
   - §7: KVKK m.11'in dokuz hakkı madde madde. Önceki metin bunlardan yalnız 5'ini özetliyordu.
   - §7: rıza geri almanın geçmiş işlemleri etkilemediği yazıldı; info@ ile rıza geri alma yolu korundu.
   - §8 (yeni) "Başvuru yöntemi":
     - Başvuru Usul Tebliği kanalları: ıslak imza (şahsen ya da noter), KEP + güvenli e-imza/mobil imza, sistemde kayıtlı e-posta.
     - Başvuruda bulunması gerekenler.
     - 30 gün içinde ve ücretsiz yanıt, ek maliyette Kurul tarifesi.
     - Kurula şikâyet (m.14).
   - Sürüm `kvkk-v2` kaldı. v2 henüz hiç yayınlanmadığı için yeni bir sürüm numarası açılmadı.
3. **Test** (`tests/expert-prereg-form.test.tsx`):
   - İki dil için de 8 başlık ve 9 maddelik hak listesi sabitlendi, m.14 / Art. 14 atfı arandı.
   - Mutant denemesi: en dosyasından bir hak silinince test kırmızıya döndü (`expected [ …(8) ] to have a length of 9 but got 8`). Dosya sonra geri yüklendi.
4. **PR açıklaması** hazır: `TASK-MVFLPJFYTJRNP-se-fb-ekler/pr94-body.md`. İçeriği:
   - yayın engelleri (adres/KEP, hukuk onayı, #92 ile birlikte birleşme),
   - O3 seçenekleri (a) m.5/2-c ve (b) kutuyu isteğe bağlı yapmak,
   - hukuka açık sorular.

   Açıklama GitHub'a **yazılmadı**. Push olmadan yazılırsa PR'daki koddan farklı bir şeyi anlatır. Push'tan sonra `gh pr edit 94 --body-file …/pr94-body.md` ile yazılacak.
5. Şema ve kod değişmedi (O3 kararı patron/hukukta). #92'ye dokunulmadı.

## Kanıt (ham çıktı, `TASK-MVFLPJFYTJRNP-se-fb-ekler/`)
**Birim** (rebase sonrası, worktree):
```
tests/expert-prereg-form.test.tsx + src/lib/expert-prereg → Test Files 6 passed (6) · Tests 85 passed (85)
```

**Canlı tarayıcı.** Ortam:
- izole `pgvector:pg16` (:5461), Mailpit (:55462/55463), `next dev :3122`,
- şema: `prisma db push`, ardından migration'lar, `prisma/rls.sql` ve migration'lar yeniden,
- Playwright, gerçek modal açılarak (`live.txt`, `live_tr_uzman.png`, `live_en_experts.png`).

```
== /tr/uzman dialog chars=4357
OK   Toplama yöntemi ve hukuki sebepler
OK   zararın giderilmesini talep etme
OK   Başvuru yöntemi
OK   KEP adresi: [KEP ADRESİ — patron]
OK   Adres: [ADRES — patron]
OK   KVKK m.14
OK   Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.
rights list items=9
== /en/experts dialog chars=4496
OK   Collection method and legal bases
OK   claim compensation
OK   How to apply
OK   Address: [ADDRESS — owner]
OK   KVKK Art. 14
rights list items=9
```

**Gerçek kayıt + DB** (`register.txt`):
```
POST /api/expert-preregistration (tr) → {"ok":true} HTTP 201
POST (en)                             → {"ok":true} HTTP 201
psql: fo102-en@example.test|en|kvkk-v2|t|t|pending
      fo102-tr@example.test|tr|kvkk-v2|t|t|pending
mailpit: fo102-en@… | Confirm your expert pre-registration · FonBridge
         fo102-tr@… | Uzman ön kaydınızı doğrulayın · FonBridge
```
Not: bu canlı kontrolde uygulama süper kullanıcıyla bağlandı. Amaç metni ve sürüm damgasını görmekti. RLS ölçümü aşağıdaki kapının `rls:verify` adımında yapıldı.

**Push kapısı** (`pnpm gate`, 4 deneme; tam çıktılar scratchpad'de, özetler eklerde):

| # | Sonuç | Neden |
|---|---|---|
| 1 | e2e başlamadı | :3000'de başka bir ajanın dev sunucusu vardı. Sonraki denemelerde `E2E_PORT=3123` verildi. |
| 2 | e2e sunucusu 180 sn'de hazır olmadı | Paylaşılan DB'deki bir blog görseli `localhost:9000`'de, `.env`'de ise `R2_PUBLIC_HOST` boş. `next/image` hata verdi, ana sayfa 500 döndü. Sonraki denemelerde yalnız push kabuğunda `R2_PUBLIC_HOST=http://localhost:9000/fabrika-public` verildi; `.env`'e dokunulmadı. |
| 3 | lint, typecheck, vitest **4798/4798**, i18n, rls:check, bypass-check, **rls:verify** ✅. e2e **370 geçti / 2 kırmızı** | `billing-identity-form:99` ve `relationship-owner-assign:152` (ECONNRESET). İkisi tek başına yeniden koşulunca **8/8 geçti** (`e2e-rerun-ozet.txt`). Dal bu dosyalara dokunmuyor. |
| 4 | vitest 3 kırmızı | `expert-prereg-form`'da 30 sn zaman aşımı. Yük ortalaması 58–74 idi. |
| 5 | vitest 5 kırmızı | Kırmızılar ilgisiz dosyalarda da: `api-error-body-guard`, `rag-pdf-worker-isolation` ve form testleri; hepsi zaman aşımı. |

**Kırmızıların yükten geldiğinin kanıtı** (`ab-form.txt`): aynı yük altında art arda koşuldu.
```
bu dal  expert-prereg-form   → 1 failed | 18 passed (132 sn)
origin/dev kopyası (aynı dosya) → 2 failed | 17 passed (165 sn)
bu dal  expert-prereg-form   → 19 passed (60 sn)
```
Dev'deki değişmemiş dosya da düşüyor ve kırmızı testler her koşuda değişiyor. Değişikliğin zaman aşımlarıyla ilgisi yok.

## Değişen dosyalar
- `content/kvkk-uzman-v2.md`, `content/kvkk-uzman-v2.en.md`, `tests/expert-prereg-form.test.tsx` (commit `b579d873`).
- `docs/DATA_MODEL.md`: rebase çakışma çözümü (`a31d0e44` içinde).
- Bu rapor ve `TASK-MVFLPJFYTJRNP-se-fb-ekler/`.

## Riskler
- **Yayın engeli:** metinde adres ve KEP yer tutucu. Gerçek değerler girilmeden yayına çıkarsa aydınlatma eksik kalır (m.10/1-a; Tebliğ m.5).
- **#92 ile birlikte birleşmeli.** Yalnız #94 girerse metin "1 yıl sonra silinir" der ama silen iş yoktur.
- §8'de "Türkçe ve yazılı" ifadesi (Tebliğ m.5) İngilizce metinde de duruyor. Yabancı uzmanlar için uygulama kararı hukuka sorulmalı.
- Ortak makinedeki yük, push kapısını belirleyici olmaktan çıkarıyor. Bu yalnız bu dalı değil, tüm ajanların push'unu etkiler.

## Açık sorular (patron / hukuk)
1. Veri sorumlusunun adresi, KEP adresi ve isteniyorsa MERSİS no nedir?
2. O3: (a) m.5/2-c ve bilgilendirme kutusu mu, (b) kutu isteğe bağlı ve rıza vermeyen rehberde görünmez mi?
3. SMTP ve barındırma sağlayıcısı gerçekten yurt içinde mi? Değilse m.9 metni gerekir.
4. `kvkk-v1` metniyle alınmış kayıtlara yeniden aydınlatma gerekir mi?
5. IP özeti için ayrı bir saklama süresi yazılmalı mı?

## Sonraki adım
1. Makine yükü düşünce (ya da DevOps'un e2e/vitest için ayrılmış koşu penceresinde) push'u yeniden dene. Komut, `.claude-fo49` worktree'sinde, `.env` yüklü kabukta:
   ```
   E2E_PORT=<boş port> R2_PUBLIC_HOST=http://localhost:9000/fabrika-public git push --force-with-lease=se-fb/fo49-kvkk-v2:20899dc3 origin se-fb/fo49-kvkk-v2
   ```
2. Push'tan sonra: `gh pr edit 94 --body-file docs/agent-results/TASK-MVFLPJFYTJRNP-se-fb-ekler/pr94-body.md`, ardından `gh pr view 94 --json mergeStateStatus` ile CLEAN/MERGEABLE kontrolü.
3. Lider ya da DevOps için: paylaşılan `.env`'de `R2_PUBLIC_HOST` boş, ama DB'de MinIO görselli blog yazısı var. Bu yüzden herkesin e2e kapısında ana sayfa 500 veriyor.

## Definition of Done
- [ ] #94 MERGEABLE: yerelde rebase temiz, ama push yapılamadı, GitHub'da hâlâ DIRTY.
- [x] O2 eksikleri tr+en eklendi.
- [ ] O3 ve açık sorular PR'da: metin hazır (`pr94-body.md`), GitHub'a push'tan sonra yazılacak.
- [x] Canlı kanıt ve test ham çıktısı.
- [x] Platform beyanı: aşağıda.

## Platform beyanı
- **mac yerel**'de doğrulandı (Darwin, izole Postgres/Mailpit konteynerleri, `next dev`, Playwright Chromium). Prod koşulmadı.
- Değişiklik yalnız Markdown içerik ve testten ibaret. Dosya `path.join(process.cwd(), …)` ile okunuyor (`kvkk-text.server.ts`, değişmedi). Satır sonları `\r?\n` ile ayrıştırıldığı için Windows ve Linux'ta da aynı çalışır.
- Windows ve Linux koşulmadı: ofiste bu makineler yok ve dokunulan kod yolu platforma bağlı değil.
