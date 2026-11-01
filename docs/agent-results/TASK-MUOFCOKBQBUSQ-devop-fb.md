# TASK-MUOFCOKBQBUSQ — FB DEV ENTEGRATÖRÜ — devop-fb

**Sonuç: DURDURULDU (ön koşul sağlanmadı). Hiçbir merge yapılmadı, hiçbir commit atılmadı, test DB'si açılmadı.**

## 1. Ne yapıldı
- Ön koşul kontrolü koşuldu (`ekler/00-status.txt`): dal `dev` (HEAD bb855b31) ✔.
- Ana checkout'ta bilinen untracked dosyaların DIŞINDA **TRACKED değişiklik** bulundu → görev kuralı gereği DURDUM:
  - ` M src/lib/tenant.ts` (+7: `assertTenantActionWritable` içinde pool "timeout exceeded when trying to connect" → `SERVICE_BUSY` hatası; G-1 pool-timeout işine benziyor). mtime 21:14:16 — kontrolümden ~30 sn önce yazılmış.
  - 20 sn sonra ikinci kontrolde yeni bir tracked değişiklik daha çıktı: ` M tests/evidence-confirm-store-faults.live.test.ts`.
  - → Başka bir ajan ŞU AN ana checkout'ta tracked dosyalara yazıyor. Bu durumda `merge --no-ff` ya o işi merge commit'ine karıştırır ya da çakışmada yarım kalır; ayrıca kapı sonuçları (tsc/vitest/build) merge'ü değil o yarım işi ölçer.
- Dokunmadım: o dosyaları stash/checkout/commit ETMEDİM (sahiplik bende değil).
- Dalların varlığı doğrulandı: `devop-fb/merge-hsts` = c6fad2ac ✔, `se-fb/i1-owner-chain-merge` = af2e7be7 ✔.
- I-1 ön şartı da şu an SAĞLANMIYOR: `docs/agent-results/TASK-MUOEGWSV8I7H0-se-fb.md` ana checkout'ta yok (se-fb dalında ayrıca bakılmadı, çünkü zaten durduruldu).

## 2. Kanıt
- `TASK-MUOFCOKBQBUSQ-devop-fb-ekler/00-status.txt` — status/branch/log/worktree list (ham).
- `TASK-MUOFCOKBQBUSQ-devop-fb-ekler/01-stop-tracked-change.txt` — `git diff` tam metni, mtime, dal SHA'ları, 20 sn sonraki yeniden kontrol (ikinci dosya belirdi).
- Not: `wt-muodys/` artık yok (crw-fb silmiş). Beklenmeyen fakat untracked: `docs/agent-results/TASK-MUODXBIM9H1PP-cs-fb-ekler/` (21:14'te yazılmış; tracked değil, engel değil).

## 3. Değişen dosyalar
- Yalnız bu rapor + ekler dizini (untracked; commit edilmedi — ana checkout'ta başkası yazarken commit atmadım).

## 4. Riskler
- Ana checkout'ta commit'lenmemiş tracked iş var; bir ajan "ana checkout'a dokunma" kuralını ihlal ediyor olabilir. Kim olduğu bilinmiyor (G-1 pool timeout işi — be-fb? — tahmin, doğrulanmadı).
- HSTS (c6fad2ac) ve I-1 (af2e7be7) dev'de DEĞİL: `git merge-base --is-ancestor` koşulmadı çünkü merge yapılmadı.

## 5. Açık sorular (lider)
1. `src/lib/tenant.ts` + `tests/evidence-confirm-store-faults.live.test.ts` değişikliklerinin sahibi kim? O ajan işini kendi dalına taşıyıp ana checkout'u temizlemeli (`git diff > patch` → kendi worktree'sinde uygula → ana checkout'ta `git checkout -- <yollar>`), ya da lider bunun dev'e girmesini onaylamalı.
2. I-1 için se-fb raporu (TAMAM/ONAY) ne zaman gelecek?

## 6. Sonraki adım
- Ana checkout temizlendiğinde bu görev aynen yeniden koşulabilir (idempotent: hiçbir şey değişmedi). Sıra: HSTS raporunu commit → `merge --no-ff devop-fb/merge-hsts` → kapılar → I-1 (rapor varsa).
- "DEV ENTEGRASYON PROSEDÜRÜ" ve RELEASE_CHECKLIST.md eki merge'lerle birlikte yazılacak — şimdi commit edilmedi (ana checkout kirli). Taslak:
  > **DEV ENTEGRASYON PROSEDÜRÜ** — (1) Worker kendi worktree + dalında çalışır, ana checkout'a ve `update-ref`'e dokunmaz. (2) Dal onaylanınca (inceleme raporu TAMAM/ONAY) entegratör (devop-fb) ana checkout'ta `git status` temiz mi bakar; tracked değişiklik varsa DURUR. (3) `git merge --no-ff <dal>`; çakışmada durur, çözmez, raporlar. (4) Kapılar: tsc + lint + `npx vitest run` (izole DB, :5433 yasak) + `next build`. (5) Ham çıktılar `docs/agent-results/<TASK>-devop-fb-ekler/`'e. (6) Sonraki dala geçiş yalnız kapılar 0 ise. (7) Push yalnız ayrı onayla.

## Platform beyanı
mac (Darwin 27.0, zsh) üzerinde yalnız git okuma komutları koşuldu. Kod değişikliği yok; platforma bağlı yol yok. Windows/Linux: koşulmadı — gerek yok (değişiklik yapılmadı).

## DoD
- [x] ön koşul çıktısı
- [ ] HSTS dev'de — YAPILMADI (ön koşul ihlali nedeniyle durduruldu)
- [x] I-1 gerekçeli atlandı (durdurma + se-fb raporu yok)
- [ ] her merge sonrası kapılar — merge yok
- [ ] ana checkout temiz — DEĞİL (başkasının tracked değişikliği)
- [~] prosedür taslak olarak raporda; RELEASE_CHECKLIST.md'ye commit bekliyor
- [x] platform beyanı

Not: Görev metnindeki ikinci kanıt yolu (`/Users/macbook/alan/docs/agent-results/TASK-MUOEUYV0GMU12-devop-fb.md`) bu kartın ID'si ve reposu ile uyuşmuyor (HSTS kartının ID'si; FONBRIDGE dışında). Oraya yalnız bu dosyaya işaret eden bir yönlendirme notu yazdım.
