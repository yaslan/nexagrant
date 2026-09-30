BEGIN;
SELECT enter_system_scope('platform-aggregate') \g /dev/null
SELECT DISTINCT "userId" COLLATE "C" FROM "Membership"
 WHERE "staleDigestOn" >= (now() AT TIME ZONE 'UTC')::date ORDER BY 1;
COMMIT;
