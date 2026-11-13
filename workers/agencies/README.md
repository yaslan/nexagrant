# workers/agencies — TR çağrı toplayıcıları (NG-144)

Kalkınma ajansları ve Ulusal Ajans'ın açık çağrı sayfalarını okur. Ham yanıt
(`RawFetch` payload) saklanır, ayrıştırma ayrı adımdır; sayfa yapısı değişirse
`SystemAlert` payload'ı üretilir ve koşu kırılmaz.

## Kaynaklar

Her kaynağın robots/şart kararı `agencies/sources.py` içindedir. Yalnız
`status="open"` kaynaklar çekilir; `fetch.polite_get` devre dışı kaynağı reddeder.
Açık: `istka`, `ua`. Devre dışı (belirsiz ya da yasaklı): oka, baka, bebka, izka,
ankaraka, marka, karacadag, worldbank. Gerekçe: `docs/agent-results/NG-144-devop-fb-2.md`.

## Kurallar

- Tek istek/URL/koşu; istekler arası en az 5 sn (`fetch.MIN_GAP_S`).
- Sabit, kişisel veri içermeyen User-Agent (`fetch.USER_AGENT`).
- Host dışı istek reddedilir; yanıt 3 MB ile sınırlı.
- Sertifika doğrulaması açık kalır. `ua.gov.tr` ara sertifikayı göndermediği için
  `truststore` (işletim sistemi kök deposu) kullanılır.
- Stdlib + `truststore`. YZ çağrısı yok.

## Çalıştırma

    cd workers/agencies
    python3.12 -m venv .venv && .venv/bin/pip install --require-hashes -r requirements.lock
    .venv/bin/python -m pytest                                     # ağ kapalı (pytest-socket)
    .venv/bin/python -m agencies --source istka --out run.json     # canlı çekim, DB yazmaz

## Henüz yapılmayanlar

- `RawFetch`, `SystemAlert` ve `Call` yazımı yok. `Call` için FO-266 (F1) merge'ü
  beklenir (`origin/dev`'de henüz görünmüyor). `normalize.to_call` alan eşlemesini hazır tutar.
- Graphile job bağlantısı (`src/lib/jobs/tasks/`) bu dalda yok.
