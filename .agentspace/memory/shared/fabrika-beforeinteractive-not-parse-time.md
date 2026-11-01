---
name: fabrika-beforeinteractive-not-parse-time
description: next/script strategy="beforeInteractive" App Router'da paint oncesi CALISMAZ — __next_s kuyruguna girip ana paket indikten sonra body'ye eklenir, tema/FOUC script'i icin yanlis aractir
metadata:
  type: project
  updatedAt: 2026-09-09
---

Next 16.3.4 App Router'da `<Script strategy="beforeInteractive">` adinin ima ettigi seyi YAPMAZ.
Sunucu HTML'inde script'in govdesi dogrudan calisan bir `<script>` olarak degil, su kuyruga JSON olarak itilir:

    <script>(self.__next_s=self.__next_s||[]).push([0,{"children":"..."}])</script>

Kuyrugun akibeti `next/dist/client/script.js` (satir 100-165) icinde acik:
`initScriptLoader()` → `handleClientScriptLoad()` → `loadScript()` → `el.innerHTML = ...` → **`document.body.appendChild(el)`**.
Yani script (a) ana istemci paketi inip calistiktan SONRA, (b) `<head>` degil `<body>` sonunda calisir.

SONUC: ilk boyamadan once calismasi GEREKEN script'ler (tema/FOUC init, `documentElement`'e `dark` sinifi atama)
`beforeInteractive` ile TASINAMAZ — tasirsan React'in "Encountered a script tag while rendering React component"
uyarisi susar ama karanlik temada beyaz flas geri gelir. Bu tam olarak Fabrika'da 2026-09-09'da yasandi
(commit 53d9c22, TASK-MTTXQKBWYSS4K → duzeltme karti TASK-MTTY5MGLS2TXX).

OLCME REÇETESİ (iddiaya guvenme, bunu kos):
- `curl -s http://localhost:3000/tr | grep -c 'fabrika-theme'` → eslesme `__next_s` push'unun ICINDE mi, disinda mi bak.
- Deterministik davranis testi: Playwright'ta `localStorage['fabrika-theme']='dark'` kur,
  `page.route('**/_next/static/chunks/**', ...)` ile chunk'lari ~2sn geciktir, chunk'lar inmemisken
  `document.documentElement.classList.contains('dark')` oku. Ayristirma aninda calisiyorsa **true**,
  `__next_s` kuyrugundaysa **false**.

Ilgili: [[fabrika-runtime-verification-recipe]]
