# TASK-MUN4H2RL79D8B — FB readOnly bekçisi (se-fb Ö-4) · be-fb

**Karar/Durum:** BİTTİ. TASK-MUN80UOUPB2A4 (Y-3) Adım B içinde kapandı. Tam rapor, kanıt ve mutantlar: `docs/agent-results/TASK-MUN80UOUPB2A4-be-fb.md`.

- **Bekçi:** `tests/server-action-rbac-guard.test.ts`. `readOnly: true` işaretli bir action Prisma create/update/upsert/delete ya da `$executeRaw` çağırırsa kırmızı olur; aynı dosyadaki yardımcılara geçişli bakar (ör. `via savePartContent`). Rol kontrolü olmayan yazma action'ı da kırmızı olur.
- **Mutant kanıtı:**
  - `getEvidenceItemsAction` içine `tx.evidence.updateMany` eklendi → 2 failed.
  - Heartbeat'i yeniden `readOnly` yapan kendi-mutant → kırmızı (`via savePartContent`).
- **Düzeltme (N-2):** m11 `updatePresenceHeartbeat` artık `readOnly` değil. Düzenleyici, pilot ya da rol reddinde nabzı durduruyor. Commit dev'de `a3ed5630`.
- **Platform beyanı:** mac'te doğrulandı. Statik TS AST taraması, platforma bağlı değil. Windows ve Linux koşulamadı (tek makine mac).
