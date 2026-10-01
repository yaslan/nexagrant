# TASK-MUPIQY1GFTRE2 — FB DPA patron bilgileri turu (se-fb-3)

**Hüküm:** TAMAM (2 patron kararı işlendi; kalan alanlar bilinçli boş).
**Platform:** mac (Darwin) — yalnız Markdown metin değişikliği, platforma bağlı kod yolu yok; Windows/Linux'ta fark yok.

## 1. Ne yapıldı
- dpa-tr.md 13.3 → "Samsun Mahkemeleri ve İcra Daireleri"; dpa-en.md 13.3 → "The Samsun Courts and Enforcement Offices".
- İşleyen sütunu ticari unvan (tr "Ticari unvan", en "Registered legal name") → "Fonbridge Ltd. Şti."; müşteri sütunu boş.

## 2. Kanıt
`git diff -U0 docs/legal`: 4 satır değişti (tr:21, tr:116, en:21, en:116) — yukarıdaki iki değişiklik, başka değişiklik yok.
`grep -c -i "İstanbul\|Istanbul" docs/legal/dpa-*.md` → tr 0, en 0.

## 3. Değişen dosyalar
docs/legal/dpa-tr.md, docs/legal/dpa-en.md, bu rapor.

## 4. Riskler
Unvan patronun yazdığı haliyle girildi; sicildeki tam unvan farklıysa (ör. "Fonbridge Limited Şirketi") imzalanabilir sözleşmede hatalı unvan olur.

## 5. Açık sorular / hâlâ boş alanlar (UYDURULMADI)
- Ticaret sicilindeki tam unvan "Fonbridge Ltd. Şti." ile birebir mi? (patron doğrulamalı)
- İşleyen: Adres, Vergi dairesi/VKN, MERSİS no.
- R2 bölgesi.

## 6. Sonraki adım
Patron yukarıdaki bilgileri verince aynı iki dosyada eşleşik doldur; sonra imzaya hazır.
