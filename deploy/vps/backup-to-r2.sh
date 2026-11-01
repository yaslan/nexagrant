#!/usr/bin/env bash
# Günlük Postgres yedeği → R2 (RELEASE_CHECKLIST §4.1). Cron: 01:30 UTC.
#
#   deploy/vps/backup-to-r2.sh
#
# Sıra: scripts/backup/pg-backup.sh (pg_dump custom + pg_restore --list + SHA-256)
# → en yeni dökümü ve .sha256 dosyasını R2 yedek kovasına kopyala → uzak boyutu yerel
# boyutla karşılaştır. Herhangi bir adım başarısızsa exit ≠ 0 (cron günlüğüne düşer;
# dış kalp atışı RELEASE_CHECKLIST §5.3).
#
# Sırlar /etc/fonbridge/backup.env içinde (chmod 600, git'te yok). Gerekli adlar:
#   BACKUP_DATABASE_URL   süper kullanıcı (fabrika) — RLS'i atlayabilen rol; fabrika_app ile yedek BOŞ çıkar
#   BACKUP_AGE_RECIPIENT  age açık anahtarı (özel anahtar sunucuda OLMAZ; patron kasasında)
#   R2_ACCOUNT_ID, R2_BACKUP_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#                         yalnız yedek kovasına YAZMA yetkili ayrı R2 token'ı (uygulama anahtarı DEĞİL)
#   BACKUP_DIR            yerel çıktı dizini (varsayılan /var/backups/fonbridge)
#   FONBRIDGE_REPO        depo kökü (varsayılan /opt/fonbridge)
#
# Saklama: yerelde 7 gün (pg-backup.sh). R2'de yaşam döngüsü kuralı kovada tanımlanır
# (RELEASE_CHECKLIST §4.1: 4 hafta / 12 ay katmanları bu betikte YOK).
#
# Gereken araçlar: pg_dump/pg_restore/psql 16 (PGDG paketi), age, aws (AWS CLI v2), perl (shasum).
set -euo pipefail

log() { printf '%s [backup-to-r2] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "FAIL: $*"; exit 1; }

ENV_FILE="${BACKUP_ENV_FILE:-/etc/fonbridge/backup.env}"
[ -f "$ENV_FILE" ] || fail "$ENV_FILE yok"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

: "${R2_ACCOUNT_ID:?backup.env: R2_ACCOUNT_ID}"
: "${R2_BACKUP_BUCKET:?backup.env: R2_BACKUP_BUCKET}"
# Şifreleme zorunlu: boşsa pg-backup.sh düz döküm bırakır ve R2'ye şifresiz yedek gider (FO-250 Ö-1).
: "${BACKUP_AGE_RECIPIENT:?backup.env: BACKUP_AGE_RECIPIENT (age açık anahtarı; yedek şifresiz gitmez)}"
command -v aws >/dev/null 2>&1 || fail "aws (AWS CLI v2) yok"

REPO="${FONBRIDGE_REPO:-/opt/fonbridge}"
export BACKUP_DIR="${BACKUP_DIR:-/var/backups/fonbridge}"
export BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# 1) Yerel yedek (şifreleme ve doğrulama pg-backup.sh içinde).
bash "$REPO/scripts/backup/pg-backup.sh"

# 2) En yeni döküm. Yalnız şifreli (.age) kabul edilir; .sha256 dosyaları hariç.
latest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'fonbridge-*.dump.age' -print0 \
  | xargs -0 ls -1t 2>/dev/null | head -n 1 || true)"
[ -n "$latest" ] && [ -s "$latest" ] || fail "yerelde şifreli (.age) yeni döküm bulunamadı ($BACKUP_DIR)"
case "$latest" in
  *.age) ;;
  *) fail "şifresiz döküm reddedildi: $latest" ;;
esac
name="$(basename "$latest")"
local_size="$(wc -c < "$latest" | tr -d ' ')"

# 3) R2'ye kopyala: döküm + checksum. Anahtar ön eki ayrı tutulur (db/).
export AWS_DEFAULT_REGION=auto
aws s3 cp "$latest" "s3://${R2_BACKUP_BUCKET}/db/${name}" --endpoint-url "$ENDPOINT" --only-show-errors
aws s3 cp "$latest.sha256" "s3://${R2_BACKUP_BUCKET}/db/${name}.sha256" --endpoint-url "$ENDPOINT" --only-show-errors

# 4) Uzak boyut yerelle aynı mı? Değilse yedek kopyası yok sayılır.
remote_size="$(aws s3api head-object --bucket "$R2_BACKUP_BUCKET" --key "db/${name}" \
  --endpoint-url "$ENDPOINT" --query ContentLength --output text)"
[ "$remote_size" = "$local_size" ] || fail "R2 boyutu ($remote_size) yerelle ($local_size) uyuşmuyor: $name"

log "ok: $name ${local_size} bayt R2'de doğrulandı"
