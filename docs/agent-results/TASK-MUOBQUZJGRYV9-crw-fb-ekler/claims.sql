-- Bugünün (UTC) Membership claim'lerini yazan kullanıcılar. FORCE RLS altında sahip rolü
-- kiracısız 0 satır okur; enter_system_scope transaction'a özel okuma açar.
BEGIN;
SELECT enter_system_scope('platform-aggregate') \g /dev/null
SELECT DISTINCT "userId" FROM "Membership"
 WHERE "staleDigestOn" >= (now() AT TIME ZONE 'UTC')::date ORDER BY 1;
COMMIT;
