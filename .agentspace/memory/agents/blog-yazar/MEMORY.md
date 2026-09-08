- [Verify before every commit, not just after git add](git-add-verify-before-commit.md) — a scoped `git add` can still get swept by a concurrent agent's stage before commit; check `git diff --cached` right before committing
- [ROADMAP.md section conventions](fabrika-roadmap-section-conventions.md) — where a finding goes: module status line vs "Açık kararlar" vs "Riskler (teknik)" — don't dump everything into one place
- [Shared messages/*.json may already be committed](fabrika-shared-messages-json-may-already-be-committed.md) — a parallel agent's commit can sweep up your unstaged i18n edits before you commit them; empty `git diff` ≠ your edit was lost
- [AgentSpace browser click fallback: Playwright](agentspace-browser-click-fallback-playwright.md) — when the internal browser tool's click keeps failing, drive a throwaway @playwright/test script against the running dev server for real-click evidence

- [fabrika-einvoice-integrator-seam](fabrika-einvoice-integrator-seam.md) — e-Fatura durumu — satıcı env'leri hazır, GİB entegratör arayüzü var ama ADAPTERS bilerek BOŞ; doldurulacak 12 değişkenin tek tablosu docs/EFATURA_SETUP.md

- [fabrika-prisma-namespace-type-not-importable](fabrika-prisma-namespace-type-not-importable.md) — In this repo, `import { Prisma }` / `import type { Prisma }` from '@prisma/client' fails tsc with "has no exported member 'Prisma'" — use a hand-written local interface for WhereInput-shaped types instead
- [fabrika-savedsearch-table-has-no-writer](fabrika-savedsearch-table-has-no-writer.md) — SavedSearch (calls-alert saved searches) has zero writers anywhere in the repo — the /calls "Save search" button is a fake 500ms-sleep-then-toast, so the alerts-daily cron's notify:true query is very likely always empty in production

- [fabrika-blog-content-no-blank-line-heading](fabrika-blog-content-no-blank-line-heading.md) — Fabrika blog gövdesi \n\n ile bölünemez — başlık ile altındaki paragraf arasında çoğu zaman boş satır yok, block-split render'ı başlığın tüm paragrafı (literal **/* dahil) yutmasına yol açar
