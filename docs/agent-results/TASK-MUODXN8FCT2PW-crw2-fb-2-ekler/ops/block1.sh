cat > m4-claims.sql <<'SQL'
BEGIN;
SELECT enter_system_scope('platform-aggregate') \g /dev/null
SELECT DISTINCT "userId" COLLATE "C" FROM "Membership"
 WHERE "staleDigestOn" >= (now() AT TIME ZONE 'UTC')::date ORDER BY 1;
COMMIT;
SQL
psql -Atq "$DATABASE_URL" -f m4-claims.sql > m4-claims-before.txt   # DATABASE_URL = sahip rol
wc -l < m4-claims-before.txt                                         # sayıyı not edin (N0)
