---
sözleşme: 3
kod: FB-GAP-2
ajan: leed-fb
motor: claude
tip: araştırma
okur: kullanıcı
hüküm: Kısmen bitti: dört gap raporu birleştirildi ve iki çapraz hata düzeltildi; ürün yayına hazır değil — kalite kapısı ve CI kırmızı, 4 ücretli modüle arayüzden girilemiyor, canlıda RLS kapalı.
platform: mac (darwin) — yalnız raporlar okundu ve iki çelişki git ile origin/dev'de ölçüldü; kod koşulmadı. Windows/Linux: koşulmadı, bu birleşik rapor kod çalıştırmıyor.
sürüm: 1
tarih: 2026-10-16T19:02:48.727Z
---

# FB-GAP-2 · Birleşik gap raporu (leed-fb)

## Kararlar

```karar
kimlik: karar-1
soru: Dalga 1 düzeltmelerini başlatayım mı? fe-fb: modül giriş noktaları + menü; devop-fb: gate yeşil + CI kapsamı + yedekleme; se-fb: next ve bağımlılık yükseltmeleri. Tahmini 1 gün, paralel.
seçenek: A | Başla
seçenek: B | Değiştir (kapsam/kişi)
seçenek: C | Önce patron kararlarını (RLS, KVKK, CI limiti) bekle
öneri: A
```

Kaynaklar: `TASK-MVBB458UIILWZ-be-fb.md` (FO-1) · `TASK-MVBB4FCX2Q24T-fe-fb.md` (FO-2) · `TASK-MVBB4PJ636WZH-se-fb.md` (FO-3) · `TASK-MVBB4Z4PSKN08-devop-fb.md` (FO-4). Dört raporun hepsi salt okuma denetimidir.

## Ne yapıldı
- Dört rapor okundu, bulgular tek bir önem listesinde birleştirildi, tekrarlar teke indirildi.
- Raporların çeliştiği iki nokta `origin/dev` üzerinde git ile ölçüldü (aşağıda "Çapraz düzeltmeler").
- Kod, şema ve doküman değiştirilmedi.

## Kanıt — çapraz düzeltmeler (ham)
```
$ git cat-file -e origin/dev:src/lib/jobs/tasks/k1-topic-match.ts && echo VAR
VAR
$ git show origin/dev:src/lib/jobs/schedule.ts | grep -n -A3 "id: 'k1-topic-match'"
91:    id: 'k1-topic-match',
92:    cron: '30 2 * * *',
$ ls workers/cordis/
main.py  requirements.txt
$ git show origin/dev:package.json | grep -n '"next"'
67:    "next": "16.3.4",
```
- **TopicMatch gece işi kodda VAR.** devop-fb'nin "EKSİK" satırı, ROADMAP:184'teki 29.09 tarihli bayat notun kopyası (`src/lib/inngest/jobs/` dizini artık yok). Doğru olan be-fb'nin "DOC-ESKİ (kod VAR)" tespiti. Çalışıp satır ürettiği ölçülmedi.
- **`workers/cordis/requirements.txt` VAR.** se-fb'nin "pip-audit koşulamadı, requirements yok" gerekçesi yanlış. Tarama yapılabilir; araç kurulu değil.
- **`rls:verify`:** se-fb denetiminde veritabanı kapalıydı (atlandı, exit 0); devop-fb denetiminde açıktı (48 tabloda ölçüldü, geçti). Çelişki değil, iki ayrı an. Ama se-fb'nin B4 bulgusu (DB yokken exit 0) geçerli.

## Yayını engelleyenler (P0)
| # | Bulgu | Kaynak | Sahip önerisi |
|---|---|---|---|
| P0-1 | `pnpm gate` kırmızı: yerelde `fabrika_app` parolası DB ile eşleşmiyor (28P01), 31 test düşüyor; e2e gate içinde hiç koşmadı | FO-4 | devop-fb |
| P0-2 | GitHub CI son 5 dev koşusunda adımsız düşüyor (0 ms faturalanabilir); kullanım limiti şüphesi, kanıtlanmadı | FO-4 | **patron** (GitHub hesabı) |
| P0-3 | Yedekleme / geri yükleme betiği yok | FO-4 | devop-fb |
| P0-4 | M2, M6, M8 (matching), M9, M10, M11, M1 leaders, M5 person-days sayfalarına arayüzden bağlantı yok; ücretli modüller bulunamıyor | FO-2 K-1 | fe-fb |
| P0-5 | API anahtarları ekranı boş kiracıda sahte `fp_live_…` anahtarlar gösteriyor (kanıt disiplini ihlali) | FO-2 K-2 | be-fb |
| P0-6 | `next` 16.3.4: Image Optimization SSRF (≥16.3.8 gerekli); aynı yükseltme `next/og` RCE'yi de kapatır (bu kodda erişilemez) | FO-3 B2 | se-fb |
| P0-7 | Canlıda RLS kapalı (uygulama rolü BYPASSRLS, Açık karar #16) | FO-1, FO-3 B1 | **patron kararı** K-489304 |
| P0-8 | Açığa çıkmış OpenAI anahtarı yenilenmedi | FO-4 | **patron** |

## Yüksek (pilot öncesi)
- `rls:verify` DB yokken exit 0; gate'te `--require-db` yok (FO-3 B4).
- `alerts:check` ve `rls:bypass-check` hiçbir CI iş akışında yok; yerel git kancası olmayan bir dizini gösteriyor (`core.hooksPath`) (FO-4).
- KVKK md.11 muhatap silme formu dokümanda var, kodda yok (FO-3 B3) — **patron kararı** K-489303.
- Kenar menüsü manifest `nav[]` ve modül durumunu okumuyor; kapalı M7 menüde görünüyor (FO-2 Y-1).
- i18n: EN'de Türkçe / TR'de İngilizce kalan ekranlar; kapı `isTr ?` üçlülerini (49 dosyada 320) ve `src/components`'i görmüyor (FO-2 Y-2, Y-3).
- Erişilebilirlik: 58 sayfanın 57'sinde kontrast ihlali, etiketsiz `select`/`input`; a11y kapısı yalnız 4 pazarlama sayfasını ölçüyor (FO-2 Y-4).
- 3 tenant-scoped tablo (Invitation, TenantProfile, Notification) + 11 platform tablosu `DATA_MODEL.md`'de yok (FO-1).
- Yerel `dev` `origin/dev`'in 62 commit gerisinde (FO-4).
- 21 yüksek/kritik bağımlılık uyarısı; `sharp`, `undici`, `hono` öncelikli (FO-3 B8).

## Orta
- API rotalarında modül/plan kapısı yok; `requireModule` ölü kod (FO-3 B5).
- AI uçlarında oran sınırlama yok (FO-3 B6); logger PII maskelemiyor (FO-3 B7).
- `process.env` doğrudan okuma 23 dosyada; `any` 10 satır (plan-repository.ts); para aritmetiği PricingClient'ta (FO-1).
- TR rotası 404: `ayarlar/takvim`; kalıntı `ayarlar/sso` rewrite'ı (FO-2 O-2).
- Üç demo koltuğundan ikisi giriş yapamıyor; girişten sonra yanlış `default` slug'ı (FO-2 O-3, O-4).
- Yerel seed tekrar koşulamıyor (P2003) (FO-2 O-6); 4 e2e testi `localhost:3000`'e sabit (O-7).
- e2e mutlu yol eksik: M2 yok, M3 ve M11 kısmi (FO-2 O-1).
- ROADMAP birçok satırda koddan geride (TopicMatch, 60 gün hatırlatma, G0, PDF ekranı, dashboard) (FO-1).
- `CLAUDE.md` gate listesi `package.json` ile uyumsuz (FO-4).

## Olumlu (doğrulandı)
- Statik RLS: 48/48 kiracı modelinde politika; yeni tenant bypass yok (39 gerekçeli kaçış).
- LLM tekilliği korunuyor (tek `llm.ts`, tek `creditsForUsage`); modüller arası import 0.
- Sırlar git'te yok; API anahtarı SHA-256 ile aranıyor; CSP sıkı.
- M6 "iç ön değerlendirme" etiketi her yüzeyde, iki dilde.
- e2e: 326 testten 306 geçti; kalan 11 kırmızının ürün kaynaklısı 0.
- CORDIS K2 aktarımı 23.613 projede 272 sn'de başarılı (29.09 ölçümü).

## Önerilen düzeltme planı
**Dalga 1 (paralel, dosyalar ayrık):**
1. **fe-fb** — P0-4 + Y-1: fırsat detayına modül sekmeleri (`useModuleEnabled` ile), kenar menüsünü manifest `nav[]` + ModuleState'ten türet; her modül için "tıklayarak gir" e2e adımı.
2. **devop-fb** — P0-1 + P0-3 + B4 + CI kapsamı: yerel `fabrika_app` parola tarifi ve gate yeşil kanıtı, `rls:verify --require-db`, `alerts:check`/`rls:bypass-check` CI'a, `pg_dump` yedek + geri yükleme betiği ve provası. (`package.json` yalnız `scripts` bölümü.)
3. **se-fb** — P0-6 + B8: `next` ≥ 16.3.8, `sharp`/`undici`/`hono` yükseltmesi, `pnpm audit --prod` ve `pip-audit` (workers/cordis/requirements.txt) yeniden koşusu. (`package.json` yalnız `dependencies`, `pnpm-lock.yaml`.)

**Dalga 2 (be-fb FO-5'i bitirince ve dalga 1 merge olunca):** P0-5 sahte API anahtarları (be-fb) · i18n kapısı genişletme + ekran çevirileri (fe-fb) · a11y kontrast token + etiketler · DATA_MODEL eksik 14 tablo · ROADMAP tazeleme (doküman kartı) · O-2/O-3/O-6 küçük düzeltmeler · B5/B6/B7.

## Riskler
- Bulgular 16.10 `origin/dev` (ffb9c79f) anına ait; merge bekleyen dallar (#69 M7 i18n) bazı satırları değiştirebilir.
- Dalga 1'de devop-fb ve se-fb aynı `package.json`'a farklı bölümlerden dokunuyor; çakışma riski düşük, merge sırası se-fb → devop-fb.
- CI kullanım limiti çözülmeden hiçbir PR için yeşil CI kanıtı alınamaz; elle merge'lerde tam `CI=true vitest run` zorunlu.

## Sonraki adım
Dalga 1 için patron onayı (aşağıdaki karar). Onay gelince üç kart açılır ve tek çağrıda paralel delege edilir.

## Ek (sürüm 1.1) — bağımsız denetim sonrası düzeltmeler
Kaynak: `docs/agent-results/TASK-MVBB458UIILWZ-crw2-fb.md` (crw2-fb, origin/dev @ ffb9c79f üzerinde iddia denetimi).

- **Kart hükümleri:** FO-2 ONAY. FO-1, FO-3, FO-4 "DÜZELTME GEREKLİ" — düzeltmeler rapor düzeyinde (sayılar, satır atıfları, ölçülen ağaç); hiçbir P0'ın yönünü değiştirmiyor. Kaynak raporlar yeniden yazdırılmadı; doğru değerler crw2-fb raporunda ve bu ekte.
- **Ölçülen ağaç:** be-fb ve se-fb yerel HEAD'i (origin/dev'den ayrışmış) ölçtü. origin/dev'de 50 tenantId modeli (nullable 4: Document, Chunk, ConceptTemplate, AuditEvent), strict 47.
- **DATA_MODEL eksiği 15 tablo** (14 değil; Session da yok).
- **P0-8 OpenAI anahtarı** yalnız 29.09 RELEASE_CHECKLIST kaynaklı; güncel durum ölçülmedi.
- **"Olumlu" bölümündeki CORDIS 272 sn** 29.09 ölçümüdür, bu turda yeniden ölçülmedi. (FO-5'te ayrı DB'de yeni içe aktarma 246,7 sn, 23.954 proje — `TASK-MVBBPXU1ZW0F5-be-fb.md`.)
- **next.config izinli görsel hostları** iki değil: ayrıca `R2_PUBLIC_HOST` kalıbı ve `dangerouslyAllowLocalIP` var (B2 yine geçerli).
- **B4 daha geniş:** `ci.yml:143` de `rls:verify`'ı `--require-db` olmadan koşuyor (FO-7 kapsamına giriyor).
- **PostHog stub değil** (anahtar yokken no-op); T-6 için statik UI var, kalıcı model yok; M7/M9/M10 ekranları `src/app` altında var.
- **YENİ YÜKSEK — gizlilik metni yanlış güvence veriyor:** `messages/tr.json:836` / `en.json:836` `securityBody`: "Verileriniz … PostgreSQL Row-Level Security (RLS) ile diğer kiracılardan yalıtılmış". Canlıda RLS uygulanmıyor (Açık karar #16 = HAYIR) ve ROADMAP:159 bu iddianın yazılmamasını söylüyor. Kullanıcıya dönük, hukuki bağlayıcılığı olan metin. Çözümü K-489304 kararına bağlı: B seçilirse geçiş sonrası doğru olur; A seçilirse metin düzeltilmeli.
