---
name: fabrika-force-server-action-failure-in-browser
description: Bir server action'ın hata dallarını GERÇEK tarayıcıda, action dosyasına dokunmadan tetiklemenin iki yolu — page.route abort (fırlatma) ve elde kurulmuş RSC flight gövdesiyle fulfill (belirli bir dönüş değeri)
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Hata yüzeyi işlerinde kanıt zorunlu ama hata dalını tetiklemek zor: action'ı geçici olarak
kırmak paralel dalgada **başka ajanın dosyasına dokunmak** demek (`src/modules/*/server/actions.ts`
neredeyse her zaman dirty). Kod değiştirmeden, Playwright ile iki yol var. Server action
**çağrıldığı sayfanın URL'ine POST** atar — route eşleşmesi buradan kurulur.

## 1. Action FIRLIYOR (`catch` dalı) — gerçek ağ hatası

```ts
const isActionCall = (url: URL, method: string) =>
  method === 'POST' && url.pathname === SAYFA_YOLU;

let blocking = true;
await page.route(SAYFA_YOLU, async (route, request) => {
  if (blocking && isActionCall(new URL(request.url()), request.method())) {
    await route.abort('failed');   // kopan bağlantı; client'ta await throw eder
    return;
  }
  await route.fallback();          // sayfanın kendi navigasyonunu bozma
});
```

`blocking`'i `false` yapıp "yeniden dene"ye basmak **retry yolunu** aynı testte doğrular.
`route.fallback()` şart: aksi hâlde sayfa yüklenmesi de yakalanır.

## 2. Action DÖNDÜ ama beklenen alan boş (`if (res.x)` dalı) — flight gövdesini kur

Action'ın gerçek yanıtını yakalayıp değiştirmek **pratik değil**: `revalidatePath`
çağrıldığı için gövde tüm ağacı (yüz KB'lar, `1:I[...]` satırları) taşıyor ve dönüş
değeri içinde kaybolur. Bunun yerine minimal gövdeyi elle kur — App Router client'ı
kök nesnenin `a` alanını action dönüşü olarak okur:

```ts
await route.fulfill({
  status: 200,
  headers: { 'content-type': 'text/x-component' },
  body:
    '0:{"a":"$@1","f":"","b":"e2e"}\n' +
    '1:{"success":false,"brief":null,"error":"BRIEF_NOT_PERSISTED"}\n',
});
```

`$@1` → 1. satıra tembel referans; `f` (flight data) boş string, `b` (buildId) serbest.
2026-09-07'de Next 16.3.4 + React 19.2.8'de çalıştı. Dönüş değeri olarak **action'ın
gerçekten döndürdüğü şekli** yaz (kodundan oku, uydurma) — yoksa test gerçek olmayan bir
durumu doğrular.

⚠️ Bu format Next sürümüne bağlı. Sürüm yükseltmesinde bu test kırılırsa **ürün değil test**
eskimiştir; gövdeyi o sürümün formatına göre yenile. Yorumda bunu yaz, sonraki ajan
ürünü aramasın.

## Ne zaman hangisi

- Sadece "hata görünüyor mu" → **1** yeter, en gerçekçisi.
- `if (res.field)` gibi **sessiz bir dal** → **2** gerekir; abort o dala hiç uğramaz.
- İkisi de action dosyasını, DB'yi ve seed'i **hiç** değiştirmez → paralel dalgada güvenli.

İlgili: [[fabrika-runtime-verification-recipe]] · [[fabrika-parallel-agent-file-race]] · [[fabrika-e2e-own-fixture-hides-route-bugs]]
