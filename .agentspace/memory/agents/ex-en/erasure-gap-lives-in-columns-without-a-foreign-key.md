---
name: erasure-gap-lives-in-columns-without-a-foreign-key
description: "Bir imha/purge işini denetlerken kodu değil ŞEMAYI sorgula — FK'sı olmayan userId kolonları hiçbir cascade'e yakalanmaz ve her tamamlanmış silmeden sağ çıkar; Fabrika'da 10 kolondan 8'i böyleydi"
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

TASK-MTPZF8X1W8WCU 2. tur. Purge işi (`users-scheduled-deletion.ts`) okununca **kusursuz
görünüyor**: R2 dosyaları siliniyor, `AiUsageLog` anonimleşiyor, `Effort` siliniyor, sonra
`user.delete()` ve yorumu "cascades clear accounts, sessions, memberships" diyor. Kodu okuyarak
buradan bir açık çıkaramazsın — çünkü açık **kodda değil, şemada**.

Doğru soru: *"cascade gerçekten neyi kapsıyor?"* Canlı `information_schema` sorgusu:

```sql
-- 1) User'a işaret eden FK'lar ve delete_rule'ları
SELECT tc.table_name, kcu.column_name, rc.delete_rule FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name=rc.constraint_name
WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='User';

-- 2) userId TAŞIYAN ama FK'sı OLMAYAN kolonlar  ← asıl bulgu burada
SELECT c.table_name, c.column_name FROM information_schema.columns c
WHERE c.table_schema='public'
  AND (c.column_name ILIKE '%userid%' OR c.column_name IN ('actorId','ownerId','approverId'))
  AND NOT EXISTS (SELECT 1 FROM information_schema.key_column_usage k
    JOIN information_schema.table_constraints t ON t.constraint_name=k.constraint_name
    WHERE t.constraint_type='FOREIGN KEY' AND k.table_name=c.table_name AND k.column_name=c.column_name);
```

Sonuç: FK'lı 7 kolon (cascade/set null) — ama **FK'sız 10 kolon**. Purge bunlardan yalnız 2'sini
adıyla ele alıyordu. Kalan 8'i her "başarılı" imhadan sağ çıkıyordu. En ağırı `CalendarConnection`:
Google/Outlook `accessToken`+`refreshToken`'ı **açık metin** tutuyor → unutulma hakkını kullanmış
kişinin **çalışır üçüncü-taraf kimlik bilgisi** DB'de kalıyordu.

**Why:** ORM'in `onDelete: Cascade`'i güven verir ama yalnız **ilişki tanımlanmışsa** çalışır.
Prisma'da `userId String` yazıp `@relation` yazmamak tamamen geçerlidir ve sessizdir — kolon
"kullanıcıya ait" görünür, veritabanı için ise anlamsız bir string'dir. Hızla büyüyen bir şemada
her yeni tablo bu borcu bir kolon daha artırır: Fabrika'da `SavedSearch` ve `DualApprovalStep`
aynı sprint'te eklenmişti, ikisi de FK'sız. Yani **imha yüzeyi, kimse dokunmadan büyür** —
bir kez "GDPR silme tamam" demek kalıcı bir cevap değildir.

**How to apply (bir imha/anonimleştirme/"silme gerçekten siliyor mu" kartında):**

1. Purge kodunu okumadan ÖNCE yukarıdaki 2 numaralı sorguyu koş. Çıkan liste, işin **elle
   adlandırması gereken** kolonların tam listesidir; kodda geçmeyen her satır bir açıktır.
2. Kolonu üçe ayır: **öznenin kendi verisi** → DELETE (kendi OAuth jetonu, kendi kayıtlı
   araması) · **kiracının verisi** → NULL'la (fırsat, hata kaydı, denetim izi — kayıt kalsın,
   kişi bağı kopsun) · **`NOT NULL` olan** → migration + hukuk kararı gerekir, purge içinde
   kendiliğinden çözme, AÇIK MADDE olarak bildir.
3. Kanıtı canlı DB'de RED→GREEN olarak üret; şema analizi tek başına kanıt değildir. Fixture'a
   özne İLE BİRLİKTE bir "komşu" ek; komşunun satırlarının durduğunu da iddia et.
4. **Yıkıcı işlerde mutasyon denemesi zorunlu:** `deleteMany({where:{userId}})` → `deleteMany({})`
   yap ve komşu testinin kırmızıya döndüğünü gör. Dönmüyorsa testin aşırı-silmeye karşı koruması
   yok demektir. Bende döndü, geri aldım.
5. Mock'lu birim testi de kırılacaktır (yeni modeller mock'ta yok). Testi GEVŞETME — mock'u
   genişlet ve üstüne *kapsam* testi ekle: her çağrının tek özneye kapsandığını iddia et.

İlgili: [[feature-can-be-complete-and-unreachable]] · [[fabrika-board-cards-go-stale]]
