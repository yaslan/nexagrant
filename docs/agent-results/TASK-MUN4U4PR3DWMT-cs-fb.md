# TASK-MUN4U4PR3DWMT — FB BELGE: SMTP Seçenek A kararı (cs-fb)

Sprint FB-GAP-1 · dal `dev` · yalnız belge, kod dosyasına dokunulmadı.

## 1. Ne yapıldı
Patron kararı (29.09.2026): SMTP için `docs/SMTP-SUNUCU.md`'deki **Seçenek A** — Vulut cPanel/Exim, sunucu
`mail.fonbridge.com`, gönderici `info@fonbridge.com`, bakım ve güncellemeler Vulut'ta, PTR `srv.iyisunucu.com.tr` kalır.
B (kendi MTA / docker-mailserver) seçilmedi. Canlı kurulum ve uygulama sunucusuna Caddy şimdilik yapılmıyor.

1. **`docs/SMTP-SUNUCU.md`** (devop-fb runbook'u, TASK-MUN2PKA5AG2IV):
   - Başlık ve üst karar bloğu: "Karar: A (patron 29.09)", B/C seçilmedi, "canlı kurulum ve Caddy şimdilik yapılmıyor".
   - §1.1: karar A ile "olasılık 1" (fonbridge.com `srv.iyisunucu` cPanel'ine eklenir, NS değişmez, `<MAIL_IP>` = `77.92.144.187`).
   - §2 tablo: A "✅ seçildi", B ve C "_(seçilmedi)_"; tablo altında karar satırı; eski "Öneri: A" metni "karardan önce yazıldı" diye korundu.
   - §3.1 "(seçilen)", §3.2 "seçilmedi, yalnız ileride geçiş için".
   - §8: karar maddesi kaldırıldı; **1. madde artık "İLK ADIM: fonbridge.com'u `srv.iyisunucu.com.tr` cPanel'ine alan adı olarak ekle"**.
     Eski 0. madde (IP bilgisi) 2. maddeye indi ve yalnız uygulama IP'sine daraldı (posta IP'si A ile belli). 7d (B/C: TCP 25 + PTR bileti)
     "A seçildi → gerekmez" diye üstü çizildi. 7b (Caddy) ve §10.1 "şimdilik yapılmıyor (patron 29.09)".
2. **`docs/legal/processing-register.md`**: §2, §17, §18 alıcı satırları ("kendi SMTP sunucumuz … sunucu kurulumu ve DNS sürüyor") →
   "SMTP Seçenek A: Vulut'un cPanel e-posta hizmeti, paylaşımlı cPanel/Exim, bakımı Vulut'ta; ayrı e-posta işleyeni yok; canlı kurulum
   henüz yapılmadı". §14 özet e-postası satırı aynı dile. §21 SMTP satırı yeniden yazıldı (model A, paylaşımlı sunucu notu, Vulut DPA
   sorusuna bağlandı). Vulut satırında "kendi SMTP sunucumuz" → "cPanel e-posta hizmeti". md.15 ve md.17'ye güncelleme eklendi.
   **Ek düzeltme (bayat satır):** §21 "koddaki varsayılan `noreply@usfinbridge.com` (`src/lib/env.ts:98`)" diyordu; kod `1b8598d1`'den beri
   `info@fonbridge.com` (`src/lib/env.ts:99`) — düzeltildi.
3. **`docs/kamu/VERI-YERLESIMI.md`** → sürüm **1.3**: e-posta satırı ve açık madde 3 "Vulut'un cPanel e-posta hizmeti, Seçenek A; B seçilmedi; canlı kurulum yapılmadı".
4. **`docs/SECURITY_COMPLIANCE.md`**: alt işleyici listesi (Vulut kapsamı) ve hesap silme akışındaki e-posta satırı.
5. **Hukuk paketi `docs/legal/HUKUK-SORULARI-2026-09.md`** → sürüm **1.12**: sürüm notu (güncelleme ölçütü: karar belgesi — patron kararı
   ve `SMTP-SUNUCU.md` §2/§8; kod değişmedi). Vulut, Resend ve "E-posta" ek-görüş maddeleri A'ya göre yazıldı; 1.9–1.11'deki
   "kendi kurduğumuz sunucu" ifadesinin geçersiz olduğu belirtildi. Hukukçuya soru değişmedi (ayrı e-posta işleyeni gerekmediğinin teyidi),
   yalnız olgu düzeltildi: sunucuyu Vulut işletir ve başka müşterilerle paylaşılır.

**Tutarlılık kontrolü sonucu:** önceki satırlar "ayrı üçüncü taraf e-posta işleyeni yok, barındırma sağlayıcısı kapsamında (Vulut)"
diyordu — A ile **tutarlı**, hukuki sonuç değişmedi. Değişen olgu: "kendi kurduğumuz/kendi SMTP sunucumuz" ifadesi A ile yanlış
anlama yol açıyordu (sunucu bizim değil, Vulut'un paylaşımlı cPanel/Exim'i) ve "kurulum sürüyor" artık doğru değil (patron durdurdu).

## 2. Kanıt
```
$ git diff --stat -- docs/   (commit öncesi)
 docs/SECURITY_COMPLIANCE.md          |  4 +--
 docs/SMTP-SUNUCU.md                  | 49 ++++++++++++++++++++++++------------
 docs/kamu/VERI-YERLESIMI.md          |  6 ++---
 docs/legal/HUKUK-SORULARI-2026-09.md |  8 +++---
 docs/legal/processing-register.md    | 16 ++++++------

$ grep -n "noreply@usfinbridge\|sürüyor, TASK-MUN2PKA5AG2IV" docs/legal/processing-register.md
(yalnız md.17'nin üstü çizili/tarihî kısmında; güncel satırlarda yok)

$ grep -n "NEXT_PUBLIC_SMTP_FROM_ADDRESS" src/lib/env.ts
99:  NEXT_PUBLIC_SMTP_FROM_ADDRESS: z.string().default('info@fonbridge.com'),
```
- Tablo bütünlüğü: değişen tablo satırlarının `|` sayısı başlık satırıyla karşılaştırıldı (python) → üç dosyada da uyumsuzluk 0.
- Commit hash ve `git show --name-only` çıktısı aşağıda §6'da.

## 3. Değişen dosyalar
- `docs/SMTP-SUNUCU.md`
- `docs/legal/processing-register.md`
- `docs/legal/HUKUK-SORULARI-2026-09.md`
- `docs/kamu/VERI-YERLESIMI.md`
- `docs/SECURITY_COMPLIANCE.md`
- `docs/agent-results/TASK-MUN4U4PR3DWMT-cs-fb.md` (bu dosya)

Çalışma ağacındaki başkalarının dosyalarına (src/modules/m7,m10,m11, src/lib/llm*.ts, messages/*.json, diğer rapor taslakları) dokunulmadı; commit `git commit -- <yollar>` ile yalnız yukarıdakiler.

## 4. Riskler
- **DPA şablonu (`docs/legal/dpa-tr.md` / `dpa-en.md` §52)** alt işleyenleri kategori olarak sayıyor ("e-posta gönderimi"). A ile e-posta
  "barındırma" kategorisindeki Vulut'tadır; kategori listesi yanlış değil ama yürürlükteki (1.0) bir metin olduğu için dokunmadım.
  Hukukçu "ayrı e-posta işleyeni gerekmez" derse bu kategori sadeleştirilebilir.
- Paylaşımlı sunucu: aynı Exim'de başka Vulut müşterileri var; SPF `include:_spf.vulut.com` bütün Vulut bloklarını kapsar (runbook §6.4).
  Bu bir alıcı değil; teslim edilebilirlik ve Vulut sözleşmesi konusu.

## 5. Açık sorular
- Uygulamanın koşacağı sunucu ve IP'si (runbook §8 madde 2) — kök `A` kaydı için hâlâ gerekli.
- Vulut ile DPA gerekliliği (HUKUK-SORULARI 1.10) — değişmedi, e-posta da artık açıkça bu sorunun kapsamında.

## 6. Sonraki adım
- Patron canlı kurulumu başlatınca: runbook §8 madde 1 (cPanel'e alan adı ekleme) → devop-fb §7 ölçümleri → envanterdeki
  "canlı kurulum henüz yapılmadı" ifadeleri o zaman "kuruldu (tarih, ölçüm)" olarak güncellenir.
- `npm run results:index` bu repoda yok — atlandı.

Platform beyanı: **yalnız belge** (macOS'ta düzenlendi; kod yolu yok, platforma bağlı davranış yok — Windows/Linux için koşulacak bir şey yok).
