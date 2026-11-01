# Shared by pg-restore.sh and pg-restore-drill.sh. Sourced, never run.
#
# The dumps GRANT to the application role fabrika_app. pg_restore runs with
# --exit-on-error, so a cluster without that role stops on the first GRANT with
# a bare "role does not exist". Roles are cluster-wide, so any database of the
# target cluster answers this question.
#
# pg_app_role_exists CONN PASS
#   returns 0 when fabrika_app exists, 1 when it does not, 2 when the query fails.
#   CONN is a connection string without password; PASS goes to PGPASSWORD only.

pg_app_role_exists() {
  local out
  out="$(PGPASSWORD="$2" psql "$1" -X -At -v ON_ERROR_STOP=1 -c \
    "select count(*) from pg_roles where rolname = 'fabrika_app'")" || return 2
  [ "$out" = 1 ]
}
