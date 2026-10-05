export PATH=/opt/homebrew/opt/libpq/bin:$PATH
SP=/private/tmp/claude-501/-Users-macbook-alan/6b4bf0a8-11ea-4f02-841f-49270074e445/scratchpad
WT=$SP/wt
export DATABASE_URL=postgresql://fabrika:crw2pw@127.0.0.1:55110/f
S=$DATABASE_URL
mask() { printf '%s\n' "$1" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#'; }
showurl() { echo "DATABASE_URL=$(mask "$DATABASE_URL")"; }
q() { psql -X -Atq "$S" "$@"; }
