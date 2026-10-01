# TASK-MUOGR5FDKLH22 — FB ENTEGRASYON: service_busy dalı dev'e alındı (qae-fb)

**HÜKÜM: ENTEGRE EDİLDİ — kapılar yeşil. Push YAPILMADI (patron kararı).**

## 1. Ne yapıldı
- `git merge-base --is-ancestor 149d4313 dev` → çıkış 1 (NOT_ANCESTOR; crw-fb Ö-1 doğrulandı).
- `be-fb/g1-confirm-service-busy` (149d4313'ü içeren tek dal) `--no-ff` ile dev'e alındı: **a35633a8**. Çakışma YOK (otomatik birleşim).
- `devop-fb/muoibd-gates` ALINMADI (Ö-4).
- be-fb raporları TASK-MUPL2D9B8QWAB-be-fb.md ve TASK-MUPA77EIENLPH-be-fb.md repoya kopyalanıp commit'lendi: **99337d06**.
- Not: ana checkout (`/Users/macbook/alan/FONBRIDGE`) görev anında dev'de DEĞİLDİ — `se-fb/p6-dpa-signable` dalındaydı (başka ajanın işi). Dalı değiştirip onu bozmamak için dev'i ayrı worktree'de (`/Users/macbook/alan/FONBRIDGE-wt-qaefb-merge`) birleştirdim; dev ref'i ortak olduğu için sonuç dev dalında.

## 2. Kanıt
```
$ npx tsc --noEmit            → TSC_EXIT=0
$ npm test  (DB :5433 ayakta) → EXIT=0
 Test Files  304 passed | 6 skipped (310)
      Tests  4058 passed | 117 skipped (4175)
$ npm run lint                → eslint, çıkış 0, çıktı yok
$ vitest run tests/service-busy-pool.live.test.ts tests/confirm-service-busy.test.tsx tests/service-busy-action.test.tsx
 Test Files  3 passed (3)  /  Tests  21 passed (21)   (canlı havuz testi atlanmadı)
$ git log --graph: a35633a8 Merge branch 'be-fb/g1-confirm-service-busy' into dev
$ git show --name-only 99337d06: iki be-fb raporu, başka dosya yok
```
(Atlanan 6 dosya/117 test: tam koşu öncesi de mevcut skip'ler; service_busy testleri bunlara dahil değil.)

## 3. Değişen dosyalar
Merge: 49 dosya (+4592/−2) — actions.ts (evidence), use-action-error-text.ts, service-busy.ts, tenant.ts, messages/{tr,en}.json, 3 test dosyası, be-fb raporları + ekler. Ek commit: 2 rapor dosyası.

## 4. Riskler
- Worktree'ye `node_modules` symlink'i ve `.env`/`.env.test` kopyası kondu (ikisi de gitignore'lu, commit'e girmedi, `git status` temiz).
- Bu rapor dosyası görev gereği ana checkout yolunda (`se-fb/p6-dpa-signable` çalışma ağacı, izlenmeyen) duruyor; aynı dosya dev'de de commit'li → o dalda `git merge dev` öncesi izlenmeyen kopya silinmeli.
- Worktree `/Users/macbook/alan/FONBRIDGE-wt-qaefb-merge` bırakıldı (dev'i tutuyor; ana checkout'ta `git checkout dev` çakışır) — işi bitince `git worktree remove` edilmeli.

## 5. Açık sorular
Push/CI: GitHub Actions ödeme limiti sürdüğü için CI koşmuyor; push patron kararı.

## 6. Sonraki adım
Patron onayıyla `git push origin dev`; ardından worktree'yi kaldır.

**Platform beyanı:** mac (Darwin) üzerinde doğrulandı. Git/vitest/tsc/eslint kodu platformdan bağımsız; Windows/Linux'ta koşulamadı (yalnız mac makine).
