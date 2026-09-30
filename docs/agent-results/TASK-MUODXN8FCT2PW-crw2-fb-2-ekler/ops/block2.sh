psql -Atq "$DATABASE_URL" -f m4-claims.sql > m4-claims-after.txt
LC_ALL=C comm -13 m4-claims-before.txt m4-claims-after.txt     # boş olmalı
