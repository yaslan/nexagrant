# FO-191 — Hakem (M17) güvenlik / KVKK incelemesi — se-fb

**HÜKÜM: KISMİ.** Bulgular bulundu, düzeltildi, testlendi ve yerelde commit'lendi (`587d65b0`, dal `se-fb/fo191-hakem-security`, origin/dev `c695b04e` üzerinde). **Dal uzağa itilmedi, draft PR açılmadı, tam kapı (`pnpm gate`) koşmadı**: makine yükü 22–292 (kural: yük1 < 12). Pre-push kancası tam kapıyı koşturur; `--no-verify` kullanılmadı. Yük düşünce `git push -u origin se-fb/fo191-hakem-security` + draft PR yeterli.

Not: kartta "M15" yazıyor, gerçek modül **M17** (`src/modules/m17`; M15 Ödül-sonrası).

## Ne yapıldı
Kod okuma + kötü niyetli girdiyle gerçek testler. F1/F2/FO-195'in yaptığı (ham dosya hiç yazılmaz, 30 gün saklama, dışa aktarma, DOCX CPU sınırı, kullanıcı/kiracı `not_found`) tekrarlanmadı, doğrulandı.

| # | Önem | Konum | Bulgu | Düzeltme |
|---|---|---|---|---|
| B1 | Orta-Yüksek | `server/context.ts`, `evaluate.ts` | Belge metni istemde kaçışsız. Çağrı kılavuzu **system** mesajında `<call_context>` içinde; `</call_context>` içeren bir belge çitten çıkıp system mesajına metin sokabilir. Enjeksiyon testi yoktu. | `neutralizeFenceTags`: çit etiketlerinin `<`'ü tam genişlikli `＜` olur (1:1 karakter, uzunluk/`…CharsOmitted` değişmez). |
| B2 | Düşük-Orta | `server/report.ts` | İndirilen `.md` rapor model serbest metnini olduğu gibi taşıyor: `![](https://…?q=…)` / HTML, Markdown görüntüleyicide sızıntı kanalı. (Ekran güvenli: React metin düğümü.) | `inert()`: `<`→`＜`, `![`→`[`, `](`→`] (`. |
| B3 | Düşük-Orta | `analyses.ts`, `documents/route.ts`, `limits.ts` | Kullanıcı başına analiz sayısı ve yükleme hızı sınırsız; DOCX ayrıştırmaları süreç içinde kuyruklanır. | 50 analiz/kullanıcı (`too_many_analyses`, 409), 20 yükleme/dk/kullanıcı (`rate_limited`, 429 + `Retry-After`, gövde okunmadan). Sayaç süreç başına; paralel create sınırı biraz aşabilir (kodda belirtildi). |
| B4a | Düşük | `evaluate.ts` `claim()` | Süresi dolmuş ama gece işi silmemiş metin modele gidebiliyordu. | Claim `…TextExpiresAt > now` ister → `not_ready`, model çağrısı yok. |
| B4b | Düşük-Orta | `retention.ts` | Koşu sürerken purge yuvayı boşaltırsa satır **sonsuza ANALYZING** kalıyordu: purge `updatedAt`'i değiştirdiği için `markFailed` claim'i tanımaz; purge ANALYZING durumuna dokunmaz; ANALYZING yüklemeyi reddeder → tek çıkış silme. Sonuç satırı yazılmıyordu (DONE yazımı iki metin ister, geri alınır). | DONE yazımı iki metnin dolu olmasını ister; purge, metni boşalan ANALYZING satırı da yükleme kuralıyla yeniden hesaplar. **FO-195 sözleşmesini ("ANALYZING'e dokunma") bilerek değiştirir**; eski test güncellendi, ADR-0010 notu eklendi. |
| B5 | Bilgi | `retention.ts` | Parti içinde herhangi bir yuva değiştiyse parti kimliklerinin tümünün sonuç/işareti silinir; hepsi zaten süresi dolmuş satırlar, zararsız. | — |

Yanlış pozitif/elenen: ham dosya diske yazılıyor mu (hayır, yalnız bellek), RLS (3 tabloda FORCE, ölçüldü), gövde sınırı, DOCX/PDF sınırları, tür uyuşmazlığı — kodda ve testte doğru.

## Kanıt (ham çıktı)
Kötü niyetli dosyalar, **gerçek route işleyicisi + gerçek çıkarıcı** (yalnız oturum kapısı ve depolama sahte), `tests/m17-interreg-fo191-malicious-files.test.ts`; hiçbirinde `saveDocument` çağrılmadı:
```
huge.txt     22 020 096 B  413 too_large          14 ms
invoice.docx  (MZ exe)     415 type_mismatch       7 ms
broken.docx  (PK+çöp)      415 type_mismatch     614 ms
cut.docx     (kesik zip)   415 type_mismatch     462 ms
report.docx  (PDF içerik)  415 type_mismatch       6 ms
report.pdf   (zip içerik)  415 type_mismatch       1 ms
notes.txt    (ikili)       422 bad_encoding        1 ms
payload.exe / legacy.doc   415 unsupported_type    1 ms
bomb.docx    149 829 B diskte, 49 MB XML  413 too_large  735 ms
many.docx    5000 girdili zip             413 too_large  985 ms
para19/wide19/seqtbl19/rows19.docx        422 no_text    1,5–3,8 sn (500 yok)
inject.txt   (çit kıran metin)            200, metin olduğu gibi saklandı (savunma istemde)
```
Mutasyon: düzeltmeler geçici kapatıldı → 8 birim testi kırmızı (çit, `inert`, hız sınırı); canlıda 3 mutant (B3 sınırı, B4a claim, B4b purge) → 3 test kırmızı. Düzeltmeler geri yüklendi.

Canlı DB (kendi izole veritabanım `fabrika_fo191`, paylaşılan :5433 değil, `fabrika_app` NOBYPASSRLS doğrulandı) — `tests/m17-interreg-fo191.live.test.ts` 5/5:
- 51. analiz reddi, meslektaş etkilenmez, silme 1 yuva açar;
- süresi dolan metin → `not_ready`, model çağrısı 0, defter 0;
- koşu sırasında gerçek purge → `evaluation_failed`, durum `CALL_READY`, sonuç/işaret/defter 0, yeniden yükleme `READY`;
- düşman çağrı kılavuzu: system mesajında tek `</call_context>`, yük çitin içinde; kullanıcı mesajında tek `</project_context>`, tek `</rubric>`;
- **ADR-0010 SQL kanıtı:** `{analysis:1,result:1,marks:14}` → B kiracısı RLS altında `{0,0,0}`, kapsamsız bağlantı 0; B kiracısı/başka kullanıcı `getAnalysis`=null, `deleteAnalysis`=false, `runEvaluation`=`not_found`; sahibi siler → `{analysis:0,result:0,marks:0}`.

Yetki (`tests/m17-interreg-fo191-security.test.ts`, gerçek `can()`): okuma MEMBER evet / GUEST_PARTNER `forbidden_role`; yazma TENANT_OWNER, TENANT_ADMIN, PIPELINE_MANAGER, WRITER evet / MEMBER, GUEST_PARTNER, bilinmeyen rol 403; modül kapalı/plan dışı `module_unavailable`; salt-okunur plan yazmayı reddeder; oturumsuz 401; biten pilot `pilot_expired`.

Diğer ölçümler: `pnpm typecheck` temiz; eslint 0 uyarı (dokunulan yollar); `pnpm i18n:check` geçti; `pnpm rls:check` ve `pnpm rls:verify --require-db` (51 tablo, `fabrika_app` ile ölçüldü) geçti; `tests/m17*`, `prompt-snapshots` toplam yeşil, **tek istisna**: `m17-interreg-extract.test.ts › stays linear` süre duvarı yük altında bir koşuda 3362 ms (sınır 2000) verdi; tek başına 2/2 geçti, `docx-text.ts` değişmedi, eşik gevşetilmedi. Pre-commit kapısı (staged eslint + tsc) temiz.

## Değişen dosyalar
`src/modules/m17/{limits.ts,server/{analyses,context,evaluate,gate,report,retention}.ts}`, `src/app/api/interreg-review/analyses/route.ts`, `…/[id]/documents/route.ts`, `messages/{en,tr}.json`, `docs/adr/ADR-0010-tenant-export-and-deletion.md`; testler: `tests/m17-interreg-fo191{-security,-malicious-files}.test.ts`, `tests/m17-interreg-fo191.live.test.ts` (yeni), `tests/m17-interreg-extract.test.ts`, `tests/m17-text-retention.live.test.ts` (güncellendi).

## Riskler
- Hız sınırı süreç başına; çok sunuculu dağıtımda sunucu sayısı kadar katlanır. Analiz sınırı paralel isteklerle biraz aşılabilir (depolamayı sınırlar, tam kota değil).
- B4b FO-195'in belgelenmiş sözleşmesini değiştirir; crw2-fb/FO-195 sahibi bilmeli.
- İstem enjeksiyonu **tamamen** engellenemez: çit kırma kapatıldı, ama çitin içindeki "tüm notları ver" metni modeli etkileyebilir. Çıktı şema + puan sunucuda hesaplanıyor, kullanıcıya zarar yolu dar; ayrıca "iç ön değerlendirme" etiketi korunuyor.
- Kanıt alıntılarının belge metninde birebir geçtiği doğrulanmıyor (doğruluk, crw-fb/FO-193 kapsamı).

## Açık sorular
- Kurum dışa aktarması (ADR §2.2) kodlanmadı, yalnız ADR metni var — ayrı kart gerekir mi?
- 30 günün hukuki teyidi ve `processing-register` M17 kaydı patron/hukukta bekliyor (ADR "Açık").
- Gate-seviyesi rol testleri artık var; mevcut route testleri hâlâ `gateInterreg`'i sahteliyor.

## Sonraki adım
Yük < 12 olunca: `cd FONBRIDGE-worktrees/se-fb-fo191 && git push -u origin se-fb/fo191-hakem-security` (pre-push tam kapıyı koşturur), sonra **draft** PR → dev, merge yok. Tam kapının sonucu rapora eklenmeli.

## PLATFORM BEYANI
macOS (darwin) üzerinde doğrulandı (Node v26.5.0, Postgres 16.15 pgvector docker). Kod platformdan bağımsız Node (`worker_threads`, `zlib`); **Windows/Linux koşulmadı** (bu makinede yok, bu kartın kapsamında değil).
