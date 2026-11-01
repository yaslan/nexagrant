BEGIN;
SELECT enter_system_scope('platform-aggregate') \g /dev/null
SELECT DISTINCT m."userId" COLLATE "C" FROM "Membership" m JOIN "User" u ON u.id = m."userId"
 WHERE m."staleDigestOn" >= (now() AT TIME ZONE 'UTC')::date
   AND u."staleDigestOn" >= (now() AT TIME ZONE 'UTC')::date ORDER BY 1;
COMMIT;
