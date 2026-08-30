#!/bin/sh
set -eu

backup_root=/backups
database_dir="$backup_root/database"
uploads_dir="$backup_root/uploads"
retention_days="${EPITO_BACKUP_RETENTION_DAYS:-14}"
interval_seconds="${EPITO_BACKUP_INTERVAL_SECONDS:-86400}"

case "$retention_days:$interval_seconds" in
  *[!0-9:]*|:*|*:) echo "Invalid backup retention or interval" >&2; exit 1 ;;
esac

mkdir -p "$database_dir" "$uploads_dir"
export PGPASSWORD="$(cat /run/secrets/postgres_admin_password)"
test -n "$PGPASSWORD"
test -s /run/secrets/backup_encryption_password

while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  database_tmp="$database_dir/.epito-$stamp.dump.enc.tmp"
  database_final="$database_dir/epito-$stamp.dump.enc"
  uploads_tmp="$uploads_dir/.epito-uploads-$stamp.tar.gz.enc.tmp"
  uploads_final="$uploads_dir/epito-uploads-$stamp.tar.gz.enc"
  restore_probe="/tmp/epito-$stamp.dump"
  trap 'rm -f "$database_tmp" "$uploads_tmp" "$restore_probe"' EXIT INT TERM

  pg_dump \
    --host="${DATABASE_HOST:-postgres}" \
    --port="${DATABASE_PORT:-5432}" \
    --username="${DATABASE_ADMIN_USER:-epito_admin}" \
    --dbname="${DATABASE_NAME:-epito_prod}" \
    --format=custom \
    --no-owner \
    --no-privileges \
    | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
        -pass file:/run/secrets/backup_encryption_password \
        -out "$database_tmp"

  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -pass file:/run/secrets/backup_encryption_password \
    -in "$database_tmp" -out "$restore_probe"
  pg_restore --list "$restore_probe" >/dev/null
  rm -f "$restore_probe"
  mv "$database_tmp" "$database_final"
  sha256sum "$database_final" > "$database_final.sha256"

  tar -C /uploads -czf - . \
    | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
        -pass file:/run/secrets/backup_encryption_password \
        -out "$uploads_tmp"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -pass file:/run/secrets/backup_encryption_password \
    -in "$uploads_tmp" | tar -tzf - >/dev/null
  mv "$uploads_tmp" "$uploads_final"
  sha256sum "$uploads_final" > "$uploads_final.sha256"

  date -u +%FT%TZ > "$backup_root/.last-success"
  find "$database_dir" "$uploads_dir" -type f -mtime "+$retention_days" -delete
  trap - EXIT INT TERM
  sleep "$interval_seconds"
done
