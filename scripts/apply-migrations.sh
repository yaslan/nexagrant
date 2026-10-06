#!/usr/bin/env bash
# Apply every forward migration in prisma/migrations, in the order listed in
# prisma/migrations/apply-order.txt, with psql -v ON_ERROR_STOP=1.
#
# TASK-MULU7SAA4EPP8. `prisma migrate deploy` does not see the flat .sql files
# (docs/RELEASE_CHECKLIST.md §1) and `prisma db push` builds only what
# schema.prisma describes, so SECURITY DEFINER functions, CHECK constraints and
# the per-file policies exist only here. The files do not create the base
# tables (Tenant, User, ...), so on an empty database run `prisma db push`
# first; the files are idempotent and are written to run on top of it.
#
# Usage:
#   DATABASE_URL=postgresql://... scripts/apply-migrations.sh
#   scripts/apply-migrations.sh --list    # print the order, touch nothing
#   DATABASE_URL=postgresql://... scripts/apply-migrations.sh --down <name>.down.sql
#
# Exits non-zero on the first failing statement, or when apply-order.txt and
# the files on disk disagree. Running it twice must also exit 0: that is the
# idempotency contract CI checks.
#
# Env: DATABASE_URL (required), PSQL (psql binary, default `psql`).
# Rollback: each file has a .down.sql (flat) or down.sql (folder) beside it;
# apply those in reverse order, one `--down <file>` per call. `--down` runs the
# file with the same checks and the same session as a forward file. Plain psql
# is refused by the file itself (prisma/migration-down-guard.sql): without the
# system_scope session a rollback sees no tenant rows under FORCE RLS, and
# rename-feedback-alert-columns.down.sql then deleted its archive without
# replaying it (TASK-MUOGMUUAWFEQX, İNCELEME-115 Ö-2).
set -euo pipefail

cd "$(dirname "$0")/.."
dir=prisma/migrations
order_file=$dir/apply-order.txt

listed=()
while IFS= read -r line; do
  line=${line%%#*}
  line=$(printf '%s' "$line" | tr -d '[:space:]')
  [ -n "$line" ] && listed+=("$line")
done < "$order_file"

# The list and the tree must agree, or a new migration would silently never run.
on_disk=$(cd "$dir" && { ls -1 *.sql | grep -v '\.down\.sql$'; ls -1 */migration.sql; } | sort)
in_list=$(printf '%s\n' "${listed[@]}" | sort)
if [ "$on_disk" != "$in_list" ]; then
  echo "apply-migrations: $order_file does not match the files in $dir" >&2
  diff <(printf '%s\n' "$in_list") <(printf '%s\n' "$on_disk") \
    | sed -n 's/^< /  listed, not on disk: /p; s/^> /  on disk, not listed: /p' >&2
  exit 1
fi
dupes=$(printf '%s\n' "$in_list" | uniq -d)
if [ -n "$dupes" ]; then
  echo "apply-migrations: listed more than once: $dupes" >&2
  exit 1
fi

down=
case "${1:-}" in
  "") ;;
  --list)
    printf '%s\n' "${listed[@]}"
    exit 0 ;;
  --down)
    down=${2:-}
    down=${down#./}
    down=${down#"$dir"/}
    case "$down" in
      *..*|/*) down= ;;
      *.down.sql|*/down.sql) ;;
      *) down= ;;
    esac
    if [ -z "$down" ] || [ ! -f "$dir/$down" ]; then
      echo "apply-migrations: --down takes one rollback file in $dir (<name>.down.sql or <folder>/down.sql), got \"${2:-}\"" >&2
      exit 1
    fi ;;
  *)
    echo "apply-migrations: unknown argument \"$1\" (use no argument, --list or --down <file>)" >&2
    exit 1 ;;
esac

: "${DATABASE_URL:?DATABASE_URL is not set}"
# Prisma's `?schema=` parameter is not a libpq option; psql rejects the URL with it.
url=$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')
psql_bin=${PSQL:-psql}

# Which role runs the chain (TASK-MUOEGWSV8I7H0, İNCELEME-106 I-1). In CI and
# locally it is a superuser; in production it is the schema owner, which is
# neither superuser nor BYPASSRLS. Two things differ for that owner:
#
#  1. A function-level `SET app.system_scope = 'on'` clause needs SET privilege
#     on that placeholder parameter, which only a superuser can grant. Supabase
#     has no superuser for us, so no file carries the clause any more: the
#     functions set and restore the flag in their body (TASK-MUOG51GJ3PUOG).
#     A file that brings the clause back is refused here, before any file
#     runs, unless this role may write it anyway; the chain used to stop
#     half applied at file 23.
#  2. The tenant tables are FORCE ROW LEVEL SECURITY, so the owner reads and
#     updates ZERO rows of them without a tenant: every backfill silently
#     did nothing. Each file therefore runs with `app.system_scope = 'on'` for
#     its session, which opens the existing `system_scope` policy
#     (prisma/rls.sql) exactly as enter_system_scope() does for the app; no
#     policy changes and no role gains BYPASSRLS. That door exists only on
#     tables `pnpm db:rls` has covered, so a FORCE table without it stops the
#     run instead of being skipped quietly.
#
# Session-level on purpose: `SET LOCAL` would end at the first COMMIT inside a
# file. It dies with the psql process, one per file.
system_scope_defaults() {
  "$psql_bin" "$url" -X -Atq -v ON_ERROR_STOP=1 -c "
    SELECT coalesce(string_agg(coalesce(d.datname, '*') || '/' || coalesce(r.rolname, '*'), ', '), '')
      FROM pg_db_role_setting s
      LEFT JOIN pg_database d ON d.oid = s.setdatabase
      LEFT JOIN pg_roles r ON r.oid = s.setrole
     WHERE EXISTS (SELECT 1 FROM unnest(s.setconfig) c WHERE c LIKE 'app.system\_scope=%')"
}

preflight=$("$psql_bin" "$url" -X -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  SELECT current_user,
         r.rolsuper OR r.rolbypassrls,
         r.rolsuper OR has_parameter_privilege('app.system_scope', 'SET'),
         coalesce((SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
                     FROM pg_class c
                    WHERE c.relnamespace = current_schema()::regnamespace
                      AND c.relkind = 'r'
                      AND c.relforcerowsecurity
                      AND NOT EXISTS (SELECT 1 FROM pg_policy p
                                       WHERE p.polrelid = c.oid AND p.polname = 'system_scope')), '')
    FROM pg_roles r WHERE r.rolname = current_user")
IFS='|' read -r role exempt can_set uncovered <<< "$preflight"

# A function header line `SET app.system_scope = ...` (no semicolon: a clause,
# not a statement). Session or LOCAL statements need no privilege. Any case,
# the name quoted or not, and a `--` comment stripped first, so a `;` in a
# trailing comment does not make a clause look like a statement (crw2-fb Ö-4).
if [ "$can_set" != t ]; then
  clause_files=$(cd "$dir" && for f in "${listed[@]}" ${down:+"$down"}; do
    sed 's/--.*$//' "$f" \
      | grep -qiE '^[[:space:]]*SET[[:space:]]+"?app\.system_scope"?[[:space:]]*(=|TO)[^;]*$' && echo "$f"
  done || true)
  if [ -n "$clause_files" ]; then
    echo "apply-migrations: role \"$role\" may not create functions with SET app.system_scope, and these files do:" >&2
    printf '  %s\n' $clause_files >&2
    echo "  Set and restore the flag in the function body instead (add-agency-invite-code.sql). No file was applied." >&2
    exit 1
  fi
fi
if [ "$exempt" != t ] && [ -n "$uncovered" ]; then
  echo "apply-migrations: role \"$role\" is subject to row security, and these FORCE RLS tables have no system_scope policy:" >&2
  echo "  $uncovered" >&2
  echo "  A backfill would read and update zero of their rows. Run \`pnpm db:rls\` first, then this script again." >&2
  echo "  No file was applied." >&2
  exit 1
fi
leaked=$(system_scope_defaults)
if [ -n "$leaked" ]; then
  echo "apply-migrations: app.system_scope has a stored default ($leaked); every new session, fabrika_app's included, would skip tenant isolation." >&2
  echo "  Remove it (ALTER DATABASE/ROLE ... RESET app.system_scope). No file was applied." >&2
  exit 1
fi

# After the files. A stored default would outlive the run. A FORCE table that
# a file created (add-feedback.sql and others) has no system_scope policy until
# `pnpm db:rls`; if it already held rows, the backfills after it saw none of
# them (İNCELEME-115 Ö-4, measured: exit 0 with Feedback left unconverted).
# n_live_tup is a statistic and not subject to RLS, so the owner can read it.
# It lags a moment behind writes and is reset by a crash; either only hides a
# table from this check, it never flags an empty one.
postflight() {
  leaked=$(system_scope_defaults)
  if [ -n "$leaked" ]; then
    echo "apply-migrations: a file stored a default for app.system_scope ($leaked). RESET it before starting the app." >&2
    exit 1
  fi
  # RLS on with zero policies is deny-all for fabrika_app: 0 rows read, every
  # INSERT refused (TASK-MUWDA86A7U4LK). Supabase's `ensure_rls` event trigger
  # ENABLEs RLS on every table created in public, and BlogPost reached live in
  # that state (TASK-MUTP1R1C13GE3). Checked for every role, superuser included:
  # it is fabrika_app that cannot read, not the role running this script.
  # A table without a tenantId column is policy-less by design (SYSTEM_WIDE,
  # scripts/rls-models.ts; tests/rls-coverage.test.ts pins that no SYSTEM_WIDE
  # model has one), so it fails here: its migration lacks the DISABLE line.
  # A tenant table only gets its policy from `pnpm db:rls`, which runs after
  # this script, so it is a reminder, not a failure. Classified from the
  # catalogue rather than a copy of the SYSTEM_WIDE list: no second list to
  # drift, and no node/tsx needed on the deploy host.
  deny=$("$psql_bin" "$url" -X -Atq -F '|' -v ON_ERROR_STOP=1 -c "
    SELECT coalesce(string_agg(c.relname, ', ' ORDER BY c.relname) FILTER (WHERE NOT x.tenant), ''),
           coalesce(string_agg(c.relname, ', ' ORDER BY c.relname) FILTER (WHERE x.tenant), '')
      FROM pg_class c
      CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM pg_attribute a
                                          WHERE a.attrelid = c.oid AND a.attname = 'tenantId'
                                            AND a.attnum > 0 AND NOT a.attisdropped) AS tenant) x
     WHERE c.relnamespace = current_schema()::regnamespace
       AND c.relkind = 'r'
       AND c.relrowsecurity
       AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)")
  IFS='|' read -r deny_system deny_tenant <<< "$deny"
  if [ -n "$deny_tenant" ]; then
    echo "apply-migrations: note: these tenant tables have RLS on and no policy yet, so fabrika_app sees none of their rows: $deny_tenant" >&2
    echo "  Run \`pnpm db:rls\` before starting the app (docs/RELEASE_CHECKLIST.md §3.1 step 4)." >&2
  fi
  if [ -n "$deny_system" ]; then
    echo "apply-migrations: these tables have no tenantId, RLS on and no policy, so fabrika_app reads none of their rows and every INSERT fails:" >&2
    echo "  $deny_system" >&2
    echo "  Supabase's ensure_rls trigger turns RLS on for every new table. Do not start the app. In the migration that creates it," >&2
    echo "  right after CREATE TABLE add: ALTER TABLE \"<T>\" DISABLE ROW LEVEL SECURITY;  and list it in SYSTEM_WIDE" >&2
    echo "  (scripts/rls-models.ts) and the DISABLE loop of prisma/rls.sql. \`pnpm db:rls\` repairs a table already listed there." >&2
    exit 1
  fi
  [ "$exempt" = t ] && return 0
  unseen=$("$psql_bin" "$url" -X -Atq -v ON_ERROR_STOP=1 -c "
    SELECT coalesce(string_agg(c.relname || ' (~' || s.n_live_tup || ' rows)', ', ' ORDER BY c.relname), '')
      FROM pg_class c
      JOIN pg_stat_user_tables s ON s.relid = c.oid
     WHERE c.relnamespace = current_schema()::regnamespace
       AND c.relkind = 'r'
       AND c.relforcerowsecurity
       AND s.n_live_tup > 0
       AND NOT EXISTS (SELECT 1 FROM pg_policy p
                        WHERE p.polrelid = c.oid AND p.polname = 'system_scope')")
  if [ -n "$unseen" ]; then
    echo "apply-migrations: these FORCE RLS tables hold rows but have no system_scope policy, so role \"$role\" saw none of them:" >&2
    echo "  $unseen" >&2
    echo "  Their backfills in this run updated zero rows. Do not start the app, and do not simply run this script again:" >&2
    echo "  a rerun does not redo every skipped step. Restore the backup taken before this run, run \`pnpm db:rls\`," >&2
    echo "  then this script. docs/RELEASE_CHECKLIST.md §3.1." >&2
    exit 1
  fi
}

if [ -n "$down" ]; then
  echo "==> [down] $down"
  # fabrika.migration_down is what prisma/migration-down-guard.sql looks for.
  "$psql_bin" "$url" -X -q -v ON_ERROR_STOP=1 -c "SET app.system_scope = 'on'" -c "SET fabrika.migration_down = 'on'" \
    -f "$dir/$down"
  postflight
  echo "apply-migrations: rolled back with $down as $role"
  exit 0
fi

n=0
for f in "${listed[@]}"; do
  n=$((n + 1))
  echo "==> [$n/${#listed[@]}] $f"
  "$psql_bin" "$url" -X -q -v ON_ERROR_STOP=1 -c "SET app.system_scope = 'on'" -f "$dir/$f"
done

postflight
echo "apply-migrations: $n files applied as $role"
