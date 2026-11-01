# TASK-MUO7JSP5FKI8 — FB İNCELEME-91: embedding istek-400 düzeltmesi incelemesi (se-fb)

**Durum: TAMAM**
**Karar: ONAY.** Bloklayan bulgu yok. İki orta (O-1, O-2) ve dört not (N-1..N-4) takip işi olarak önerilir.

İncelenen iş: TASK-MUO4GPRO92N97 (be-fb). Dev `c214f02d`, kod commit'i `bc0ec6a3`. Y-1, Y-2 ve N1'i İNCELEME-85'te ben bulmuştum (TASK-MUO3BNKECJAO8).
Ortam: kendi worktree'm (scratchpad `wt`, detached `c214f02d`) ve kendi izole DB'm (`sefb91-pg`, pgvector:pg16, 127.0.0.1:55991). Hazırlık CI sırasıyla yapıldı: `db push`, `db:rls-role`, `apply-migrations.sh` iki kez ("40 files applied" ×2), `db:rls` (28→112), `db:seed`. Test altındaki kod `fabrika_app` (NOBYPASSRLS) rolüyle koştu. Paylaşılan :5433'e **bağlanılmadı**. Kod değiştirilmedi. Konteyner iş bitince silindi.

## 1. Ne yapıldı

### Y-1: istek reddi ile satır reddinin ayrılması (probe)
`Run.vector` kodu satır satır okundu (`src/lib/scoring/embeddings.ts:327-367`). Bir 400 ya da 413 geldiğinde, uzun metinde önce 8000 baytlık önek deneniyor. Ret sürüyorsa sabit bir probe metni gönderiliyor. Sonuç şöyle yorumlanıyor:
- Probe embed edildi: satır işaretlenir.
- Probe de 400 ya da 413 aldı: `requestRefused` olur, koşu durur, hiçbir satır işaretlenmez.
- Probe 429 ya da 5xx aldı: kesinti sayılır, satır işaretlenmez.

Mantık doğru. Aşağıdaki gerçek OpenAI denemeleriyle de doğrulandı.

### Gerçek OpenAI gövdeleri (hata yanıtları ücretlendirilmez)
| Durum | Gerçek status | Gerçek mesaj (tek satır) | Kodun sınıfı |
|---|---|---|---|
| `dimensions=99999` | 400 | `Invalid value for 'dimensions' = 99999. Must be less than or equal to 3072.` | istek reddi (probe da 400 alır) |
| `dimensions=0` | 400 | `Invalid value for 'dimensions' = 0. Must be greater than 0.` | istek reddi |
| ada-002 ile `dimensions` | 400 | `This model does not support specifying dimensions.` | istek reddi |
| Olmayan model | **404** | `The model … does not exist or you do not have access to it.` (`model_not_found`) | sistem hatası, 3'te durur |
| Sohbet modeli (gpt-4o-mini) | **403** | `You are not allowed to generate embeddings from this model` | sistem hatası, 3'te durur |
| Token sınırı (~9000 token) | 400 | `Invalid 'input': maximum context length is 8192 tokens.` | satır reddi, önce önek denenir |
| Boş girdi | 200 | 0 token | (clean() boş metni zaten atıyor) |

Gerçek bir satır düzeyi 400 aradım: tek başına surrogate, NUL, `<|endoftext|>`, U+FFFE. **Hepsi 200 döndü.** 8 KB altında OpenAI'nin içerik yüzünden reddettiği bir girdi bulamadım. Pratikte tek gerçek satır 400'ü token sınırı ve onu da önek denemesi kurtarıyor. Yani kalıcı işaret nadir olmalı.

### Canlı senaryolar (izole DB, gerçek `runK1Embeddings` + gerçek `embedText`)
Fikstür: 2 kiracı profili ve 11 konu. Konular: 7 uzun İngilizce (3267 B), 2 kısa, 1 base64 (16000 B, tahmin 5315, gerçek 11714 token), 1 "POISON" (sahte sağlayıcının hep reddettiği satır).

| # | Senaryo | Sonuç | Çağrılar | İşaret |
|---|---|---|---|---|
| L1 | Gerçek 400, `dimensions=99999` | requestRefused ✓, aborted ✓, failed 2 | profil, PROBE | **0** |
| L2 | Gerçek 400, ada-002 ile `dimensions` | requestRefused ✓, aborted ✓ | profil, PROBE | **0** |
| L3 | Gerçek 404, olmayan model | aborted ✓, requestRefused ✗ (doğru), failed 3 | 3 çağrı, probe yok | **0** |
| L4 | Gerçek 403, sohbet modeli | aborted ✓, failed 3 | 3 çağrı, probe yok | **0** |
| L7 | 429 ×3 (gerçekçi rate-limit gövdesi) | aborted ✓, failed 3 | 3 çağrı, probe yok | **0** |
| L7b | Satır 400, probe 429, sonra 429 ×2 | aborted ✓, rejected 0 | 4 çağrı | **0** |
| L5 | Gerçek token sınırı 400 (base64 satırı) | shortened 1, embed edildi | 16000 B, 8000 B, probe yok | 0 |
| S5 | 400, ardından önek 429 alıyor | failed 1, rejected 0 | 2 çağrı | **0** (doğru, bkz. O-1) |
| L6 | **Yanlış sınıflandırma:** 2 KB'lık ağ geçidi 413 veriyor, probe geçiyor | rejected **5**, aborted | 13 çağrı | **5 satır yanlış kilitlendi** (N-1) |
| L8 | Sağlayıcı düzeldi | 5 kilit duruyor, 5 satır embed edildi, POISON işaretlendi | 7 | 6 |
| — | Kilit açma: kuru koşu, `--apply` iki kez | aşağıda | — | 6 → 0 |
| L9 | Açmadan sonraki gece (gerçek OpenAI) | 5 embed (b64 önekle), POISON yeniden işaretlendi | 8 | 1 (POISON) |
| L10 | İkinci gece | 0 çağrı, previouslyRejected 1 | 0 | 1 |

### Kilit açma komutu (`scripts/k1-embeddings-unlock-rejected.ts`, `fabrika_app` rolüyle)
- **Kuru koşu:** 6 işaretli konu listelendi, hiçbir şey değişmedi.
- **`--apply`:** Önce yedek yazıldı, sonra yalnız `rejected:` ile başlayan 6 satır NULL yapıldı. Gömülü 5 satırın hash'i ve vektörü **birebir aynı kaldı** (psql ile okundu).
- **İkinci `--apply`:** "Nothing to clear."
- **`--restore`:** Arada yeniden gömülen ya da yeniden işaretlenen satırları ezmedi: `topics 0/6`.
- **Profil yolu:** RLS altında (`withTenant`) açıldı. Soft-delete edilmiş kiracının işaretli profili listelenmedi (N-3).
- **Yedek dosyası:** yalnız `id` ve `embeddingHash` alanlarını içeriyor. Profil metni ya da kişisel veri yok.
- **"Yalnız yanlış kilitlenenleri mi açıyor?"** Hayır, işaretli **tüm** satırları açıyor. İkisini ayırt edecek bilgi yok. Tasarım gereği sonraki gece her satır probe ile yeniden yargılanıyor. Gerçek ret (POISON) aynı gece bir çağrı ve bir probe bedeliyle yeniden işaretlendi. Ertesi gece ise hiç çağrı yapılmadı (L9 ve L10). Beklenen davranış bu, doğrulandı.

### Y-2: büyük harfli EL/RU tahmini (gerçek cl100k, `gpt-tokenizer` 2.x yalnız scratch'e kuruldu)
Fikstürden **bağımsız** örneklerle ölçtüm: kendi yazdığım metinler, 20 000 karakter, `clean()` ile kesildi. Ölçülen kaynak dosyanın kendi `tokenWeight` fonksiyonu.

| örnek | ÖNCE (`47c96594`): gerçek token (tahmin/gerçek) | SONRA: gerçek token (tahmin/gerçek) |
|---|---|---|
| ru_caps | 10374 (0,77) **OVER** | 5660 (1,41) ✓ |
| uk_caps (Є І Ї) | 11774 (0,68) **OVER** | 6440 (1,24) ✓ |
| el_caps_tonos | 12785 (0,63) **OVER** | 7781 (1,03) ✓ |
| el_title / ru_title | 7306 (1,09) / 5240 (1,53) | 6671 (1,20) / 4712 (1,70) |
| uk / sr / be / mk / bg küçük harf | 7457 / 6814 / 7221 / 6253 / 4941 (≥1,07) | değişmedi |
| el diyaliktika (ϊ ΐ) | 7926 (1,01) | 7577 (1,06) |
| ka / hy / he / ar / hi / th | — | 5602 / 5530 / 3154 / 2123 / 3357 / 2409, hepsi ≥1,43 |
| hex / base64 / CJK ext-A | — | 15001 / 11714 / 15999 **OVER** (bilinen istisna, bayt öneki kurtarıyor; L5'te canlı görüldü) |

Sonuç: Y-2 kapandı. Doğal dillerde tahmin gerçek sayının altına düşmüyor. Kalan istisnalar zaten biliniyordu ve etkisi yalnız maliyet tavanında.

### Kendi mutantlarım (17): 10 öldü, 7 sağ kaldı
Koşulan testler: `embeddings.test.ts`, iş testi ve `tests/k1-embeddings.live.test.ts` (izole DB'de). Başlangıç `114 passed | 1 skipped`. Her mutanttan sonra kaynak geri kondu (`git status` temiz).
```
KILLED   S2 probe = satırın kendi metni                         (14 failed)
KILLED   S4 istek reddinde probe hatası sayılmaz                (1)
KILLED   S6 konu ret işaretinde updatedAt koruması yok          (5)
KILLED   S7 profil ret işaretinde updatedAt koruması yok        (1)
KILLED   S8 Kiril büyük harf 1.5→1.1                            (4)
KILLED   S9 Kiril 0x400-0x40F (Є І Ї Ђ Ј) küçük harf sayılır    (1)
KILLED   S11 politonik Yunanca 1.2                              (1)
KILLED   S12 ret serisi eşiği 5→50                              (1)
KILLED   S13 probe amacı konu amacıyla kaydedilir               (2)
KILLED   S14 iş: requestRefused uyarı üretmez                   (1)
SURVIVED S5  önek denemesi 429 alırsa ilk 400 ile yargıla       → O-1
SURVIVED S15 betik: restore IS NULL korumasız                   → O-2
SURVIVED S16 betik: apply tüm hash'leri siler                   → O-2
SURVIVED S17 betik: yedek yazılmadan temizler                   → O-2
SURVIVED S1  404 girdi reddi sayılır                            → N-2 (sonucu aynı: 0 işaret)
SURVIVED S3  probe başarısı sistem serisini sıfırlar            → N-2
SURVIVED S10 Yunanca küçük harf aralığı 0x3FF'e kadar           → N-2 (nadir Kıpti/sembol)
```

## Bulgular

### O-1 (orta): önek denemesinde 429 alınırsa satırın işaretlenmemesi hiçbir testle korunmuyor
- **Konum:** `src/lib/scoring/embeddings.ts:335`. Satır: `if (retry === 'cap' || 'vec' in retry || !isInputRejection(retry.error)) r = retry;`
- **Kanıt:** S5 mutantı, yani `!isInputRejection(retry.error)` koşulunun silinmesi, 114 testin hepsinden sağ çıkıyor. Mevcut kodun doğru davrandığı canlıda görüldü: 400, ardından önek 429 → 0 işaret.
- **Etki:** Bu koşul bir gün düşerse şöyle olur: uzun ama sağlam bir satır tam metinde token sınırı 400'ü alır, önek denemesi o anda 429'a denk gelir, probe geçer ve satır **kalıcı** olarak işaretlenir. Yani Y-1'in bir benzeri geri gelir. Probe'dan sonra bu yol daha önemli hale geldi, çünkü artık ilk 400'ün sonucunu probe belirliyor.
- **Düzeltme:** `embeddings.test.ts` dosyasına bir test eklenmeli. Sıra: uzun metin 400, önek 429, probe 200. Beklenen: `rejected 0`, `failed 1`, satır işaretsiz, sonraki koşuda yeniden deneniyor.

### O-2 (orta): kilit açma betiğinin otomatik testi yok
- **Konum:** `scripts/k1-embeddings-unlock-rejected.ts`. Hiçbir test dosyası bu betiğe başvurmuyor (`grep` ile arandı).
- **Kanıt:** S15, S16 ve S17 mutantları tam hedefli test kümesinden sağ çıkıyor.
- **Etki:** Betik elle ve canlıda çalıştırılacak tek seferlik bir operasyon aracı. Bugünkü hali doğru, be-fb'nin ve benim canlı denemelerim bunu gösteriyor. Ama bir gerileme olursa şunlar olabilir:
  - S16: bütün kataloğun hash'leri silinir ve ~1300 konu yeniden embed edilir. Maliyet tavanlı ama birkaç gece sürer.
  - S15: `--restore` yeniden gömülmüş satırları kilitler.
  - S17: yedek alınmadan temizlik yapılır.
- **Düzeltme:** Betik `main()` fonksiyonunu import anında çalıştırıyor. Dry-run, apply ve restore fonksiyonları dışa aktarılmalı ve `tests/` altına izole DB'de koşan bir live test eklenmeli. Test şunları doğrulamalı: yalnız `rejected:` satırları açılıyor, restore yeniden gömülmüş satırı ezmiyor, yedek temizlikten önce yazılıyor. İkinci seçenek: betik canlıda bir kez çalışıp silinecekse bu kabul edilebilir bir risk, bunu patron seçmeli.

### N-1 (not): probe'un geçtiği ama isteğin hatalı olduğu durumlarda yanlış kilit hâlâ mümkün
- **Kanıt:** L6'da 2 KB üstü gövdeleri 413 ile reddeden bir ağ geçidi simüle edildi. Önek (8 KB) de reddedildi, 36 baytlık probe geçti. Sonuç: gecede 5 satır yanlış kilitlendi ve koşu durdu. Açma komutu bunları kurtardı (L9).
- **Etki ve olasılık:** `embedText` doğrudan `https://api.openai.com/v1/embeddings` adresini çağırıyor, ağ geçidi ya da temel URL ayarı yok. Bu yüzden bugünkü kodda bu senaryoya ulaşılamıyor (**varsayım**: araya bir proxy konursa ortaya çıkar). Probe'un geçip satırın 400 aldığı aralıklı bir 400 da aynı sonucu verir. OpenAI'de böyle bir 400 gözlemlemedim.
- **Düzeltme:** Şimdilik gerekmiyor. Bir proxy eklenirse probe'un satırla aynı boyutta olması düşünülebilir. Bir diğer seçenek, bir koşuda ≥3 satır reddi olduğunda uyarı üretmek.

### N-2 (not): eşdeğere yakın sağ mutantlar
- **S1:** 404 girdi reddi sayılırsa probe da 404 alır ve `requestRefused` olur. İki durumda da 0 işaret var. Etkisi yalnız uyarı metninde.
- **S3:** Probe başarılıysa sağlayıcı ayaktadır, seriyi sıfırlamak savunulabilir. Ama testin adı ("does not reset their streak") bu durumu korumuyor, çünkü o testte probe 503 alıyor.
- **S10:** U+03CF–03FF arası nadir karakterler (Kıpti, ϐ ϑ ϕ). Pratik etkisi yok.

### N-3 (not): açma betiği soft-delete edilmiş kiracının profilini listelemiyor
Tasarım gereği: iş bu kiracılara hiç uğramıyor. Kiracı geri alınırsa işaret metin değişene kadar kalır. Betiği yeniden çalıştırmak bunu çözer.

### N-4 (not): tanı bilgisi
Gerçek OpenAI gövdesi çok satırlı JSON. Bu yüzden `errors[0]` her zaman `OpenAI embeddings error 400: {` oluyor (L1-L7 çıktıları). Uyarı `meta` alanı da `errors` taşımıyor. `requestRefused` uyarısında operatör sebebin `dimensions` mı model mi olduğunu göremiyor. be-fb bunu bilinen eksik olarak yazmıştı. Öneri: ilk satırı almadan önce boşlukları tek satıra indirmek. Güvenlik notu, **varsayım (401 denemedim)**: OpenAI 401 gövdesi anahtarın maskeli halini (son 4 hane) içerir. Gövde tek satıra indirilecekse `sk-…` deseni maskelenmeli.

## 2. Kanıt (kapılar)
```
npx vitest run (izole DB, CI=true, CI AUTH_SECRET fikstürü)
  Test Files  294 passed | 2 skipped (296)
       Tests  3661 passed | 36 skipped (3697)      vitest exit 0
scripts/check-live-skips.ts → exit 0 (yalnız izinli atlamalar; REAL OpenAI testi dahil)
pnpm typecheck → tsc exit 0
pnpm lint      → lint exit 0
env -u NODE_ENV pnpm build → ✓ Compiled successfully in 14.2s · build exit 0
```
**Gerçek OpenAI harcaması:** İzole DB'deki `AiUsageLog` K1 satırlarının toplamı 10 059 token: probe 42, profil 28, konu 9 989. Doğrudan gövde denemelerinde başarılı 4 çağrı ~19 token tuttu. Toplam ≈ 10 078 token × 0,13 USD/M ≈ **0,0013 USD** (bütçe ≤ 0,05). Anahtar `.env` dosyasından sürece okundu ve hiçbir çıktıya basılmadı. Gövdelerde `sk-` deseni maskelendi.

Denemelerin betikleri scratch'te kaldı, repoya girmedi: `live.mts`, `mut.py`, `bodies.mjs`, `rowlevel.mjs`, `tok/y2.mjs`.

## 3. Değişen dosyalar
- Yalnız bu rapor: `docs/agent-results/TASK-MUO7JSP5FKI8-se-fb.md`. Kod değiştirilmedi.

## 4. Riskler
- **O-1 ve O-2 test boşlukları:** Bugünkü davranış doğru, ama gerilemeye karşı korunmuyor.
- **Kilit açma canlıda henüz çalıştırılmadı:** be-fb'nin açık sorusu duruyor. Kuru koşu salt okunur. `--apply` kararı patronda. Yedek JSON repo kökünde oluşur ve `.gitignore` içinde yok. İçinde yalnız kimlikler ve hash'ler var, kişisel veri yok. Yine de betik repo dışında bir dizinden çalıştırılmalı ya da `k1-unlock-backup-*.json` ignore listesine eklenmeli.

## 5. Açık sorular
- O-2 için ne yapılacak: betiğe live test mi yazılsın, yoksa canlıda tek kullanımdan sonra betik silinsin mi? Karar patronun.

## 6. Sonraki adım
- be-fb için takip kartı: O-1 testi ekle, O-2 için karara göre betik testi, N-4 için hata gövdesini tek satıra indir ve `sk-` desenini maskele.
- Patron onayıyla canlıda kuru koşu çalıştırılsın. İşaret sayısı sıfırdan büyükse `--apply` repo dışında bir dizinden yapılsın.

**Platform beyanı:** Doğrulama **macOS**'ta yapıldı: Darwin 27, Node 26.5, Docker'da Postgres 16 + pgvector, gerçek OpenAI API. İncelenen kod platformdan bağımsız: saf TS (kod noktası gezme), SQL ve `fetch`. Süreç, kabuk ya da ikili adı kullanmıyor. Açma betiği yedeği cwd'ye yazıyor ve dosya adında `:` ile `.` karakterleri `-` ile değiştiriliyor (`scripts/k1-embeddings-unlock-rejected.ts:92`). Bu yüzden ad Windows'ta da geçerli. **Linux** (CI ubuntu ve worker) ile **Windows'ta koşulamadı**, çünkü bu makinede o ortamlar yok. Koddan bakınca aynı davranması beklenir.
