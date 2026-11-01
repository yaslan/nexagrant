---
sözleşme: 3
görev: TASK-MUODYIZIF6FLZ
kod: TASK-MUODYIZIF6FLZ
ajan: crw2-fb
motor: claude
tip: ölçüm
okur: ekip
hüküm: Bitti: Ö-1..Ö-6'nın hepsinin testi dev'de (0779e8f8) var ve kendi izole DB'mde koşulan 21 mutantın 21'i öldü; Ö-2'de üretim hatası yok, kod değişikliği gerekmedi.
platform: Yalnız macOS'ta doğrulandı (Darwin 27, Node 26.5, pnpm 11.25, Docker'da pgvector/pgvector:pg16). Linux ve Windows koşulamadı çünkü bu makinede yalnız macOS var. Kod değişikliği yok; testler saf JS ve pg16.
sürüm: 1
tarih: 2026-09-30T20:19:21.926Z
---

# FB test borcu İNCELEME-108 Ö-1..Ö-6: dev'deki testler kendi mutantlarımla doğrulandı (21/21 ölü), Ö-1 mutantındaki Perl hatası düzeltildi

## 1. Ne yapıldı
- Kartın önceki üç be-fb teslimi okundu. Testler `a89fdef6` ile dev'e girmiş. `-3` raporundaki mutant tablosu ise başka dosyaları (docx-safe-html/content-disposition sabitleri) ölçüyor ve Ö-1..Ö-6 mutantlarını koşmamış. Dev'de ayrıca cs-fb İNCELEME-113 (`cfedd305`) eklemeleri var: `tests/k1-embeddings-unlock.ismain.test.ts` ve D19 count testleri.
- İzole DB kuruldu: `crw2fb-muodyi-pg`, 127.0.0.1:55136. CI sırasıyla: db push → db:rls-role → apply-migrations ×2 (41/41 iki kez) → db:rls (28→112) → seed. Paylaşılan :5433'e bağlanılmadı. Worktree: `crw2-fb/muodyi-test-debt`, dev `0779e8f8` üzerinde.
- İNCELEME-108'deki sağ kalan mutantların hepsi yeniden kuruldu, 5 varyant eklendi (U12e, R6b, R1b, R1c, O1ab) ve dev testlerine karşı koşuldu.
- **Mutant hatası bulundu ve düzeltildi:** cs-fb'nin S16d mutantında ve benim ilk koşumda Perl ikamesinde `${p.tenantId}` / `${topicIds}` kaçışsızdı. Bu yüzden Perl değişkeni olarak açılıyor ve SQL `42601 syntax error` üretiyordu. Yani "öldü" sonucu korumayı değil sözdizimi hatasını ölçüyordu. Tam dosyada 4 test düşüyordu, bunlardan 3'ü korumayla ilgisizdi. Mutant `\${…}` ile düzeltildi. Anlamsal mutant yalnız yarış testini düşürüyor (aşağıda).

## 2. Kanıt
### Ö-1: yarış testi, geçerli mutantla (`…-ekler/o1-race.log`)
```
=== O1a  -WHERE "tenantId" = ${p.tenantId} AND "embeddingHash" LIKE ${LIKE}  +WHERE "tenantId" = ${p.tenantId}
     × a row re-embedded between the listing and the clear keeps its new hash (validates the LIKE guard, Ö-1)
-     "clearedProfiles": 0,  +     "clearedProfiles": 1,        Tests  1 failed | 5 passed (6)
=== O1b  Topic apply LIKE koruması yok
-     "clearedTopics": 0,    +     "clearedTopics": 1,          Tests  1 failed | 5 passed (6)
=== O1ab ikisi birden yok
      clearedProfiles 0→1, clearedTopics 0→1                    Tests  1 failed | 5 passed (6)
```
Kararlılık (`race-stability.log`): unlock live + ismain, 5 koşunun 5'i `Tests 8 passed (8)`.

### Ö-2..Ö-6 (`…-ekler/mutants-dev.log`, HEAD 0779e8f8)
| Ö | Mutant | Sonuç / öldüren test |
|---|---|---|
| 2 | E4: tam metin 429 önekle yeniden denenir | ÖLDÜ: `a 429 on a long text is not retried on the prefix (Ö-2)` |
| 3a | U12c: profil satırı nesne olarak `console.log` | ÖLDÜ: `--apply clears only rejected: rows…` |
| 3a | U12d/U12e: profil metni `console.warn` / `console.error` ile | ÖLDÜ / ÖLDÜ (aynı test) |
| 3b | R6/R6b: log'a `session.user.email` / `name` | ÖLDÜ / ÖLDÜ: `…no sensitive data (Ö-3b/c)` |
| 3c | R1 kesim yok · R1b yalnız ilk satır · R1c yalnız 200 | ÖLDÜ (2) / ÖLDÜ / ÖLDÜ |
| 4 | D19d count kontrolü yok · D19e `<8→<7` · D19f LE sayım BE okunur | ÖLDÜ (6) / ÖLDÜ (7 bayt LE) / ÖLDÜ (8 bayt LE) |
| 5 | C1 yalnız harf · C2 `\w` · C3 başta harf-rakam | ÖLDÜ / ÖLDÜ / ÖLDÜ |
| 6 | U6 `deletedAt` filtresi yok · U10 `isMain` hep true | ÖLDÜ / ÖLDÜ (`…ismain.test.ts`) |

Toplam: **21 mutant, 21 ölü, 0 sağ.** Bunlara O1a/b/ab'nin düzeltilmiş hâli dahil; bozuk ilk koşu logda işaretlendi.
Temel koşu: 6 ilgili küme (embeddings, k1 job, k1 live ×2, export route, docx-safe-html, content-disposition) → `Test Files 11 passed · Tests 227 passed | 1 skipped (228)`. Her koşudan önce `DATABASE_URL=…55136…` basıldı. Her mutanttan sonra bayt kopyası geri yüklendi ve `git status` temiz kaldı.

### Ö-2: üretim hatası var mı?
Yok. Uzun metinli 429 testi dev kodunda yeşil. E4 mutantı (hatayı yeniden sokan değişiklik) testi kırmızıya çeviriyor. Kod düzeltmesi gerekmedi.

## 3. Değişen dosyalar
- Yalnız bu rapor ve `docs/agent-results/TASK-MUODYIZIF6FLZ-crw2-fb-ekler/` (mut.sh düzeltilmiş hâli, loglar). Kod ve test değişikliği yok: gereken testlerin hepsi dev'de zaten var. Yazdığım `isMain` taslağı dev'deki `…ismain.test.ts` ile aynı işi gördüğü için atıldı.

## 4. Riskler
- İNCELEME-108 raporundaki (`TASK-MUOC2KUFCQGH0-cs-fb-ekler/race-s16d.log`) "S16d profil/Topic ÖLÜ" satırları aynı kaçışsız Perl ifadesini kullanıyor. Bu satırlar bir SQL sözdizimi hatasını ölçmüş olabilir. Sonuç doğru çıktı (koruma gerçekten gerekli, düzeltilmiş mutantla gösterildi), ama o log tek başına kanıt değil.
- Yarış testi 500 ms bekleme ve satır kilidiyle çalışıyor. Yük altında süre sınırı (30 s) aşılmadıkça kararlı; 5/5 geçti.
- be-fb `-3` raporundaki "13 mutant, 6 KILLED" tablosu bu kartın Ö maddelerini ölçmüyor. Kanıt olarak bu rapor esas alınmalı.

## 5. Açık sorular
- Yok.

## 6. Sonraki adım
- Kart `review`/`done` olabilir. Mutant betiklerinde ikame tarafındaki `${…}` için `\$` kaçışı kural olarak yazılmalı (hafızaya işlendi).
- Temizlik: `crw2fb-muodyi-pg` kabı ve worktree commit'ten sonra kaldırıldı.
