---
name: fabrika-mutation-probe-must-vary-the-input-shape
description: Mutasyon sondasi yalniz kusurun VARLIGINI degil girdinin BICIMINI de degistirmeli - tek satirda yazilmis kolon listesi yeni RLS kapisini sessizce atlatti ve yesil kaldi
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

TASK-MTVDSSJTZCY4T'de yeni bir statik kapi (CHECK 4b: migration kurdugu kiraci tablosunu
koruyor mu) yazdim ve zorunlu mutasyon sondasini kostum: politikasiz sahte bir migration →
kapi kirmizi, tablo adiyla. Gecti. Sonra **ayni kusuru farkli bicimde** yazdim — kolonlari tek
satirda:

```sql
CREATE TABLE IF NOT EXISTS "ProbeSecret" (
  "id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL, "note" TEXT NOT NULL
);
```

Kapi **yesil kaldi** ve "13 tablo" yerine "12 tablo" saydi: `tenantId` kolonunu satir basinda
arayan bir regex (`/^\s*"?tenantId"?/m`) tabloyu hic gormemisti. Yani kapi kusurun bir
yazimini yakaliyor, digerini yakalamiyordu — ve bu, sonda olmasa **yesil olarak** depoya
girecekti.

**Why:** mutasyon sondasi "kusur var mi" sorusunu test eder, ama statik bir kontrolun
gercek dusmani kusurun **bicim cesitliligi**dir: bosluk, tek satir, tirnak, buyuk-kucuk harf,
yorum, dinamik SQL. Tek bir kanonik-bicimli sonda, dedektorun yalnizca en kolay vakasini
dogrular.

**How to apply:** her statik kapi/lint/tarayici icin sondayi **en az iki bicimde** yaz:
(1) deponun aliskin oldugu bicim, (2) ayni anlamda ama farkli yazilmis bicim (tek satir /
farkli bosluk / farkli tirnak). Ucuncu bir varyant olarak **kismi** kusuru da dene (politika
var ama `ENABLE` yok; ifade sapmis) — bunlar ayri mesajlar uretmeli. Gecen sondalari **rapora
yapistirmakla birakma**, geciciyi silip kalicisini teste tasi (bkz. `tests/rls-coverage.test.ts`
"mutation probe": gecici dizinde hem ihlalli hem duzeltilmis dosyayi kurar).

Ilgili: [[fabrika-mutation-red-may-fire-on-another-assertion]] ·
[[fabrika-force-rls-double-space-grep-trap]] · [[fabrika-turkce-grep-yanlis-pozitif-alici]] ·
[[fabrika-three-migrations-state-no-rls-policy]]
