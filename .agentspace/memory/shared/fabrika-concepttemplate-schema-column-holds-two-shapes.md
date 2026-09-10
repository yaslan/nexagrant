---
name: fabrika-concepttemplate-schema-column-holds-two-shapes
description: ConceptTemplate.schema kolonunda iki uyumsuz şekil var (çıplak dizi vs `{sections}`) ve iki seeder ile üç okuyucu aynı şekilde ikiye bölünmüş — DB'deki 7 satırın hepsi çıplak dizi, yani `schema.sections` okuyan kod BUGÜN her satırda patlıyordu
metadata:
  type: project
  updatedAt: 2026-09-10
---

İki seeder aynı kolona farklı şekil yazıyor:

| Yazan | Şekil | Okuyan |
|---|---|---|
| `prisma/seed.ts` | `[{key,labelKey,maxWords,promptKey}]` (çıplak dizi) | `src/modules/m2/server/actions.ts` |
| `prisma/seed-templates.ts` | `{ sections: [ … ] }` | `concept-notes/actions.ts`, `api/concept-notes/[id]/export/route.ts` |

2026-09-10'da ölçüm: veritabanındaki **7 satırın tamamı çıplak dizi**. Dolayısıyla `createConceptNote`
ve DOCX export route'u var olan HER satırda `schema.sections is not iterable` ile patlıyordu —
typecheck göremiyor, çünkü kolon `Json` ve okuyucular `as` ile daraltıyor. Kanıt:
`Array.isArray(schema) === true` ve `schema.sections === undefined`.

Şimdilik tek yerde normalleştiriliyor: `templateSections()` (`src/modules/m2/server/templates.ts`),
iki şekli de okur, tanımadığını `[]` döner. **Bu bir yama, karar değil.** Hangi şeklin kanonik
olduğu belirlenip satırlar migration'la taşınmalı ve iki seeder birleşmeli; o zaman
`templateSections` silinir. Karar verilene kadar: **hangi seeder son koşarsa okuyucular ona göre
davranır** — `seed-templates.ts` tek başına koşarsa `m2/server/actions.ts` patlar.

**Genel ders:** bir `Json` kolonunu okuyan kodu değiştirirken şekli fikstürden değil
**veritabanından** doğrula. Benim fikstürüm `{sections}` yazdığı için bir test kolu yanlış yeşil
verdi; gerçek satırı okuyunca ortaya çıktı. Aynı sınıf:
[[fabrika-undefined-tenantid-drops-the-where-clause]] (tip sistemi `Json`/`undefined` içinden
geçen hatayı göremiyor). Bkz. `docs/agent-results/TASK-MTVTU103F11XJ-cs-fb.md` §2.3, §5.1.
