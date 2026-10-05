---
name: a-gate-run-belongs-to-a-tree-not-a-commit
description: Paylaşılan ağaçta "kapı X commit'inde yeşil" cümlesi yanlıştır — kapı ağacı ölçer, commit'i değil; kartı kapatan commit'in kendisi hiç ölçülmemiş olabilir
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Kural

Bir raporda "kapı `<hash>` üzerinde yeşil" görünce ÜÇ ayrı şeyi ayır:
1. Kapının koştuğu **saat**,
2. O anki **HEAD**,
3. Kartı **kapatan** commit'in saati.

Paylaşılan çalışma ağacında bunlar neredeyse hiç aynı olmaz. Kapı `HEAD + commit'lenmemiş
çalışma ağacı`nı ölçer. Yani "yeşil kapı" hiçbir commit'e ait değildir.

## Neden

TASK-MTV50DQCQDB7B (2026-09-10) ölçümü: tek kapı koşusu 09-09 23:00:27'de yapılmıştı;
kapattığı iddia edilen iki commit ertesi sabah 09:04 ve 09:05'te indi — **10 saat sonra**.
İçerik yine de ölçülmüştü (dosyalar o an ağaçta commit'siz duruyordu), ama commit kimliği
ölçülmemişti.

Asıl tuzak şuydu: kapanış denetimi için ben **commit'ten sonra** taze kapı koştum ve yine de
o commit'i ölçemedim — çünkü `tests/e2e/module-gate.spec.ts` benim snapshot'ımdan **6 saniye
sonra** bir sonraki kartın ajanı tarafından yeniden yazıldı. Commit'in ağacı ne öncesinde ne
sonrasında ölçüldü.

## Nasıl uygulanır

- Kapı koşmadan ÖNCE künye al: `date`, `git rev-parse HEAD`, `git status --short`,
  `git diff --stat HEAD`. Raporda "ölçülen ağaç" olarak **bunu** yaz, çıplak hash'i değil.
- Koşu BİTİNCE künyeyi tekrar al ve farkı yaz: HEAD ilerlemiş olabilir, dosyalar koşu
  sırasında değişmiş olabilir. Fark yalnız `docs/` + memory ise sonucu etkilemez — bunu
  `git log --name-only <eski>..HEAD` ile göster.
- Bir dosyanın **commit'li hâlinin** ölçüldüğünü iddia edeceksen önce
  `git status --porcelain -- <dosya>` ile temiz olduğunu kanıtla.
- Zamanlamayı ölçerken: `git log --date=iso-local --pretty=format:'%h | %ad | %s'`.

## İlgili

[[a-record-is-not-a-document]] · [[a-conformance-check-cannot-see-absence]] ·
[[fabrika-shared-tree-gate-red-from-a-foreign-dev-server]]
