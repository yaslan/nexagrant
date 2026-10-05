---
name: fabrika-i18n-messages-cannot-hold-arrays
description: messages/tr.json ve en.json'da dizi kullanma — tests/i18n.test.ts her yaprağın boş olmayan STRING olmasını şart koşuyor; özellik listelerini f1..fN anahtarlarına aç
metadata:
  type: reference
  updatedAt: 2026-09-07
---

`t.raw('plans.pro.features')` ile bir dizi döndürmek cazip geliyor ama `tests/i18n.test.ts`
katalogları düzleştirirken diziyi **yaprak** sayıyor ve sonra `typeof val === 'string' &&
val.length > 0` kontrolünden geçiriyor → dizi olan her anahtar testi kırar.

Bu repodaki kalıp: `starter_f1…f5`, `plans.pro.f1…f6`. Bileşende sabit bir anahtar listesiyle dön:

```tsx
{['f1','f2','f3','f4','f5','f6'].map((k) => <li key={k}>{t(`plans.${entry.planId}.${k}`)}</li>)}
```

Aynı test dosyasının iki kuralı daha:
- TR ve EN **anahtar kümeleri birebir aynı** olmalı.
- TR değeri EN değeriyle aynı olan anahtar sayısı toplam anahtarların **%10'unu geçemez**
  (2026-09-07'de 726 anahtarda 17 aynı — bolca pay var, ama "Basic/Pro/Ultra" gibi ortak sözcükleri
  anahtar yapmak yerine katalogdaki `entry.name`'den okumak daha temiz).

**Why:** şablon değişkenli anahtarlar (`t(\`plans.${id}.f1\`)`) grep'le bulunmadığı için eksik
çeviri yalnız çalışma anında patlar; bu üç kural gate'te yakalanan tek güvenlik ağı.

İlgili: [[fabrika-usetranslations-breaks-existing-tests]] · [[fabrika-i18n-dead-catalog-trap]]
