# TASK-MUPA6KH1L0CV8 — cs-fb SSS düzeltme turu

**Hüküm: TAMAM** — crw2-fb'nin Y-1, Y-2, Y-3 bulguları tr+en birlikte düzeltildi; sayılar eşit kaldı.

## 1. Ne yapıldı
- Y-1: `DESTEK-SABLONLARI.md` kural 1 → P-9 çözüldü, adres info@fonbridge.com.
- Y-2: SSS D4 + D5 (tr+EN) ve Ş-7 iç notu: kurum geneli dışa aktarma/silme "ekrandan yok, pilot süresince destek ekibi elle yürütür, yazılı talep"; `docs/adr/ADR-0010-tenant-export-and-deletion.md` bağlantısı (taslak); süre/sonuç sözü yok.
- Y-3: SSS A3 (tr+EN): kurum adresiyle Google hesabı açarken Google'ın gönderdiği doğrulama e-postasını onaylama adımı; hesap açılamazsa destek. Google ekranları canlı denenmedi → [DOĞRULANMADI] (tr) / "not tested live" (EN).

## 2. Kanıt
```
git diff --stat: DESTEK-SABLONLARI.md 8 (+5/-3) · SSS-PILOT.md 22 (+13/-9)
grep -c "^### [A-G][0-9]" SSS-PILOT.md → 38 ; grep -c "^\*\*EN:\*\*" → 38
grep -c "^### Ş-" DESTEK-SABLONLARI.md → 11 ; grep -c "\[SIGNATURE\]" → 11
ADR dosyası dev'de var: docs/adr/ADR-0010-tenant-export-and-deletion.md
```

## 3. Değişen dosyalar
docs/beta/SSS-PILOT.md, docs/beta/DESTEK-SABLONLARI.md

## 4. Riskler
- ADR-0010 taslak/onay bekliyor; metin "elle yürütür" diyor, ADR kararı değişirse D4/D5/Ş-7 güncellenmeli. ADR dosyası bu dalda yok (dev'de) — dal dev'e merge olunca bağlantı çözülür.
- Google doğrulama adımı canlı denenmedi.

## 5. Açık sorular
Ö-1 (crw2-fb): dal dev'de değil, entegrasyon kartı gerekli.

## 6. Sonraki adım
Entegrasyon kartı (leed-fb/qae-fb); P-5 patron+hukuk kararı gelince "elle" notu güncellenir.

**Platform beyanı:** yalnız mac (Darwin) — statik belge/git işi, platforma bağlı yol yok; Linux/Windows koşulmadı (makine yok), fark beklenmez.
