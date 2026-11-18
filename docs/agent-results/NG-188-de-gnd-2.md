# NG-188 — ortam düzeltme turu (de-gnd) — KISMEN, BLOKE

## Hüküm
KISMİ. Hipotez DOĞRULANAMADI (ne doğru ne yanlış kanıtlandı). Adım 1 ve 2 yapılamadı: bu oturumda ajanın `.env` dosyalarını okuması izinle reddedildi (`Permission to use Bash ... has been denied`). Ortam dosyalarına hiç dokunulmadı; ağaçta değişiklik yok (`git status --porcelain` boş, commit yok).

## Adım 1 — 5571 nerede? (yapılamadı; kısmi bulgular)
- Worktree'de `grep -rIl "5571"` (node_modules/.git hariç): tek eşleşme `docs/agent-results/TASK-MUNUT64LZHQY7-fe-fb.md` (dokümantasyon, ortam değil). `.env` ve `.env.example` bu aramada eşleşmedi.
- `.env.local` bir sembolik bağ: `FONBRIDGE/.env.local` (ana depo). Bu dosyanın içeriği ayrı bir `grep -l` ile denenmedi (aynı izin kalıbı); bağlı dosya kontrol edilmedi.
- `.env` denetimi (`awk` ile değişken adı) reddedildi; bu nedenle `.env`'de 5571'in OLUP OLMADIĞI bu turda kesin değil.
- Sonuç: 5571 adresi ağaç içindeki kaynak/test dosyalarında yok; kalıntı, ortam dosyası ya da kabuk ortamında olabilir. Hangisi olduğu, ajanın `.env` okumasına izin verilmeden kesinleşmez.

## Adım 2 — ortam geri yükleme (yapılmadı)
- Ortam dosyalarına yazılmadı; önce/sonra farkı yok. Paylaşılan 5433 veritabanına bağlanılmadı.

## Adım 3 — süre duvarlı `npm test` (ortam değişmeden, DATABASE_URL* kabuktan kaldırılarak)
Komut: `env -u DATABASE_URL -u DATABASE_URL_RLS_TEST perl -e '…alarm 900…' npm test` · ham log: `/private/tmp/claude-501/-Users-macbook-alan--agentspace-worktrees-nexagrant-task-mwgknytyxiz8t/09308928-e5db-4f88-958b-4ac7b6a24cc2/scratchpad/npm-test-ng188.log`
Ham son satırlar:
```
 Test Files  33 failed | 475 passed | 71 skipped (579)
      Tests  9 failed | 6864 passed | 1239 skipped (8112)
EXIT=1
```
Düşen dosyalar (örnek): action-missing-id, agency-funnel, agency-invite, agency-report, auditevent-immutable, consortium-find-candidates-pilot, cordis-coordinator-leaders, decision-log, deleted-tenant-sessionless, email-opt-out, evidence-dev-store, evidence-object-key, g1-gate, invitation-mail-limit, invitation-seat-race …
Hata metni: `Can't reach database server at 127.0.0.1:5571` (≈50 tekrar) ve `ECONNREFUSED 127.0.0.1:5571`. Tek farklı tip: `expected [Function] to throw … /different scoring/` (2 yerde, DB'ye bağlı görünüyor; ayrı incelenmedi).
Kırmızının tamamı canlı-DB testleri; dalın dokunduğu iki yeni dosya kırmızı değil (aşağıda). Dal değişikliği ile ilişki: düşen dosyalar bu commit'in dokunmadığı dosyalar — ama 5571 adresinin kaynağı bulunmadığı için "ortam kaynaklı" demek de henüz kanıtlı değil.

## Adım 4 — yeni canlı testler, DB yokken davranış (kod okuma + koşu)
- `tests/system-scope.live.test.ts`: `beforeAll` erişilemeyen DB'de `skipOrFailInCi` ile `ready=false` yapar; her test `ctx.skip(skipReason)`. Koşuda: `WARNING system-scope live test skipped: database unavailable`. Yani ATLIYOR (CI dışında). CI'da hata fırlatır. DDL yok; yalnız `admin` üzerinden fixture (2 tenant, 2 user, 2 membership) yazıp `afterAll`'da siler — DML, paylaşılan DB'de koşulursa geçici satır yazar.
- `tests/rls-verify-system-scope-policy-set.live.test.ts`: üst düzeyde erişim kontrolü; `HAS_DB = REACHABLE && LOCAL`; `describe.skipIf(!HAS_DB)` → atlanır. DDL'si var: ExpertDirectoryEntry görünümünü DEĞİŞTİREBİLİR (mutasyon) ve `finally`'de `prisma/rls.sql` bloğundan geri kurar; NG-183 bloğunu uygular/kaldırır. Yani erişilebilir YEREL bir veritabanında (paylaşılan olan dahil, dosya başlığına göre) şema/politika DDL'i koşar. Erişilemez DB'de hiçbir DDL çalışmaz.
- Görünüm yokken (erişilebilir DB, görünüm silinmiş) bu test görünümü kendisi kurar; düşmez, ama her koşuda DDL uygular. Bu DDL'i yeniden okunabilir hale getirmek için kod değişikliği gerekebilir — bu turda kod değiştirilmedi, bu yüzden commit yok.

## Değişen dosyalar
Yok (yalnız bu sonuç dosyası yazıldı).

## Riskler / açık sorular
1. Hipotezi doğrulamak için `.env` ve `.env.local` okuma izni gerekiyor (ya da kullanıcının `grep -l 5571 <dosya>` komutunu kendisinin çalıştırması). Hangi dosyada olduğu ancak bu sayede kesinleşir.
2. `rls-verify-system-scope-policy-set` testi paylaşılan yerel DB'de DDL koşturuyor; bunun paylaşılan DB için kabul edilebilir olup olmadığı karar gerektiriyor.
3. Kırmızı otomatik kontrol (11 hata) ile bu koşudaki 9 hata sayısı farklı; kontrolün düşen test adları görünmüyor.

## Sonraki adım
Kullanıcı `.env`/`.env.local`'de `5571` içeren değişken ADINI (değer değil) raporlarsa ya da okuma izni verirse: değişkeni geri al, `npm test`'i yeniden koş.

## Platform beyanı
Platform: darwin (macOS). Koşulan: `npm test` (DB'siz). Koşulamayan: canlı veritabanı testleri (DB ayakta değil) — neden: 5571 adresi ulaşılamıyor, ortam düzeltilemedi.
