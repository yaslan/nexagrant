DROP TRIGGER IF EXISTS zz_probe ON "SystemAlert"; DROP TRIGGER IF EXISTS zz_probe ON "AuditEvent";
BEGIN;
INSERT INTO "AgencyInviteCode"(id,"tenantId","codeHash","codeHint","maxUses","expiresAt","revokedAt","createdBy")
 SELECT 'zz-c',(SELECT id FROM "Tenant" ORDER BY id LIMIT 1),repeat('e',64),'eeee',5,now()+interval '1 day',now(),'x';
\echo --- gercek kod, bilinen (revoked) kod, fabrika_app, onceki deger 'off'
SET LOCAL ROLE fabrika_app;
SELECT set_config('app.system_scope','off',true);
SELECT note_agency_invite_rejection(repeat('e',64));
SELECT 'REAL after note(known)' k, current_setting('app.system_scope',true) v;
RESET ROLE;
\echo --- M1 mutant (agency dali restore silindi)
\i m1-note.sql
SET LOCAL ROLE fabrika_app;
SELECT set_config('app.system_scope','off',true);
SELECT note_agency_invite_rejection(repeat('e',64));
SELECT 'M1 after note(known)' k, current_setting('app.system_scope',true) v;
SELECT enter_system_scope('platform-aggregate') IS NOT NULL AS sealed;
SELECT set_config('app.system_scope','off',true);
SELECT note_agency_invite_rejection(repeat('e',64));
SELECT 'M1 sealed+off -> Membership rows visible' k, count(*)::text v FROM "Membership";
ROLLBACK;
