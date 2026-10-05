# TASK-MUMABULM5KZX2 — FB ADR-0007: İlkadım pilotu ücretsiz deneme (cs-fb)

## 1. Ne yapıldı

Patronun 29.09.2026 kararı kayda geçti. Commit: `c132327c` (dev).

- **ADR-0007** yazıldı (`docs/adr/ADR-0007-ilkadim-free-pilot.md`, durum KABUL). İlkadım pilotu ücretsiz deneme: 90 gün, Ekip planı, 6 koltuk. Kapsam: davet kodu (B1), Fon Hazırlık Karnesi, belediye çağrı radarı. Ücretli satış ve e-Fatura pilot sonrası. e-Fatura artık pilot kapısı değil, ücretli satış kapısı.
- **ROADMAP.md:**
  - Başa patron kararı notu eklendi (ADR-0007). Aynı nota "GitHub push 1 Ekim 2026'ya ertelendi, GitHub kullanım limiti doldu" satırı eklendi, kart TASK-MUMACETT8NSI4.
  - "Pilot kapıları" (b) **Kapandı** yapıldı. Kanıt: İNCELEME-15 ONAY, `5b28908c`; TASK-MUM676F010E9G panoda `done`.
  - (e) satırı tablodan çıktı ve yeni **"Ücretli satış kapısı"** bölümüne taşındı. Harf "e" korundu, böylece eski "(pilot kapısı e)" referansları kopmuyor.
  - Pilot atama satırı eklendi: **(f)** TASK-MUMABL78X5JLX (be-fb, in_progress).
  - Faz C'deki ve "Patrona öneri" bölümündeki "(pilot kapısı e)" referansları "ücretli satış kapısı e" olarak güncellendi.
  - Aynı İNCELEME-15'in eskimiş "sürüyor" ifadeleri ONAY olarak güncellendi. Etkilenenler: (c) satırı, B3 ve B4 maddeleri (B3/B4 kutuları `[x]` oldu, tek açık işleri kapanmıştı), B12 maddesi ve Açık karar #21.
- **ILKADIM-PILOT.md:** Başlığa ADR-0007 bağlantısı ve karar özeti eklendi. "Bir bakışta" tablosunda "Bloke eden dış" satırı "Ücretli geçiş" oldu: e-Fatura pilotu bloke etmiyor. R4 ve Kaynaklar satırı ADR-0007'yi gösteriyor. Ayrıca iki bölüm referansı düzeltildi: R4 §6'da değil §7'de, fiyat da §5'te değil §6'da.

## 2. Kanıt

```
$ npx prettier --check docs/ROADMAP.md docs/kamu/ILKADIM-PILOT.md docs/adr/ADR-0007-ilkadim-free-pilot.md
Checking formatting...
All matched files use Prettier code style!

$ git show --name-only --oneline HEAD
c132327c docs(adr,roadmap,kamu): ADR-0007 İlkadım free pilot (90 days, Ekip plan, 6 seats); paid sale + e-Fatura after pilot
docs/ROADMAP.md
docs/adr/ADR-0007-ilkadim-free-pilot.md
docs/kamu/ILKADIM-PILOT.md
```

- (b) kapanışının dayanağı `docs/agent-results/TASK-MUM9RP3R6S13K-crw-fb.md:13`: "Bloke eden bulgu yok. Pilot kapısı (b) açılabilir." Panoda TASK-MUM676F010E9G, TASK-MUM9RP3R6S13K, TASK-MUM97IPC2QSGC ve TASK-MUM97PKOEUQBA `done`.
- "Ekip = 6 koltuk" dayanağı: `docs/BUSINESS_MODEL.md:45`.
- `grep "pilot kapısı e"` sonucu yalnız "eski pilot kapısı e" açıklamaları kaldı. Tablo dışı başıboş referans yok.

## 3. Değişen dosyalar

- `docs/adr/ADR-0007-ilkadim-free-pilot.md` (yeni)
- `docs/ROADMAP.md`
- `docs/kamu/ILKADIM-PILOT.md`
- `docs/agent-results/TASK-MUMABULM5KZX2-cs-fb.md` (bu rapor, ayrı commit)

Çalışma ağacında başka ajanların commit'siz dosyaları var: `messages/*.json`, `AuthCard.tsx`, `src/lib/tenant.ts`, `FON_BRIDGE.md`. Bunlara dokunulmadı. Commit `git commit -- <yollar>` ile yalnız bu dosyaları aldı.

## 4. Riskler

- **Kart açıklaması okunamadı.** `list_tasks` yalnız başlık döndürüyor ve bu kart için kaynak planlama dokümanı repoda yok. Spec, görev metninden ve kart başlığından kuruldu. Açıklamada başka bir madde varsa (ör. belirli bir satır metni) bu rapora göre eksik kalmış olabilir.
- ADR'de "süre dolunca salt-okunur" davranışı TASK-MUMABL78X5JLX başlığından alındı. Kod henüz yok, bu yüzden davranış doğrulanmadı.
- dev dalı origin'in 23 commit önünde. Push 1 Ekim'e ertelendi (TASK-MUMACETT8NSI4). Bu commit de o push'a kadar yalnız yerelde.

## 5. Açık sorular

- "Kapsam davet kodu, karne, radar" ifadesini, pilotta öne çıkan üç yüzey olarak yazdım. Ekip planının diğer modülleri de (ILKADIM-PILOT §2.2: M2, M4, M5, M8…) açık kalıyor. Patronun kastı "yalnız bu üçü açık" ise §2.2 ve ADR'nin 2. maddesi daraltılmalı. **Patrona sorulmalı.**
- ADR'deki "e-Fatura kartı pilotun ilk haftalarında başlasın" satırı bir öneri, karar değil. ADR'de de böyle işaretli.

## 6. Sonraki adım

- Lider/inceleme: ADR-0007 metnini ve ROADMAP tablosunu onaylasın.
- be-fb (TASK-MUMABL78X5JLX) bitince (f) satırı "Kapandı" yapılsın.
- devop-fb, 1 Ekim push'unda (TASK-MUMACETT8NSI4) `c132327c`'nin origin'de olduğunu doğrulasın.

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, prettier 3.9.9, git). Yalnız Markdown değişti, kod yolu yok. Platforma bağlı bir davranış olmadığı için Windows ve Linux'ta koşulmadı; fark beklenmiyor.
