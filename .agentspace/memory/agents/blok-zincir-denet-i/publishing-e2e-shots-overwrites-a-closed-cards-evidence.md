---
name: publishing-e2e-shots-overwrites-a-closed-cards-evidence
description: E2E_SHOTS_ROOT=docs/agent-results ile KENDİ spec'inden başkasını koşarsan kapanmış kartların commit'li kanıt karelerini üzerine yazarsın — regresyon paketini bu değişken OLMADAN koştur
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

Fabrika'da e2e kareleri varsayılan olarak git-ignore'lu `test-artifacts/`'a yazılır;
bir kartın klasörüne yayınlamak `E2E_SHOTS_ROOT=docs/agent-results` ile **bilinçli** bir eylemdir
(`tests/e2e/fixtures/shots.ts` bunu uzun uzun anlatıyor).

**Tuzak:** regresyon taraması için birden çok spec'i tek komutta koşarken o değişkeni açık
bıraktım. Kendi karelerim doğru yere düştü, ama `relationship-tenant-isolation.spec.ts`
**kapanmış TASK-MTRKV9JGY7OQY'nin commit'li iki PNG'sini** üzerine yazdı:

```
$ git status --short docs/agent-results/
 M docs/agent-results/TASK-MTRKV9JGY7OQY-screenshots/01-tenant-a-own-relationship.png
 M docs/agent-results/TASK-MTRKV9JGY7OQY-screenshots/02-tenant-b-id-404.png
```

**Kural:** `E2E_SHOTS_ROOT` yalnız **kendi** spec dosyanı koşarken açık olsun. Regresyon
paketini (başkalarının spec'leri) değişken **olmadan** koştur. Her e2e koşusundan sonra
`git status --short docs/agent-results/` bak; yabancı bir kartın klasöründe `M` görürsen
`git checkout --` ile geri al — sonradan değiştirilebilen kanıt kanıt değildir.

İlgili: [[a-long-lived-dev-server-holds-a-stale-prisma-client]]
