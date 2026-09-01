#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?请设置 DATABASE_URL}"
: "${PLATFORM_STORAGE_HOST_ROOT:?请设置 PLATFORM_STORAGE_HOST_ROOT}"

if [[ "${PLATFORM_STORAGE_HOST_ROOT}" != /* || "${PLATFORM_STORAGE_HOST_ROOT}" == "/" ]]; then
  echo "PLATFORM_STORAGE_HOST_ROOT 必须是非根目录的绝对路径" >&2
  exit 2
fi
if [[ ! -d "${PLATFORM_STORAGE_HOST_ROOT}" ]]; then
  echo "平台文件目录不存在：${PLATFORM_STORAGE_HOST_ROOT}" >&2
  exit 2
fi

backup_root="${BACKUP_ROOT:-./backups}"
timestamp="$(date +%Y%m%d-%H%M%S)"
destination="${backup_root}/${timestamp}"
mkdir -p "${destination}"

pg_dump --format=custom --file="${destination}/database.dump" "${DATABASE_URL}"
tar -C "${PLATFORM_STORAGE_HOST_ROOT}" \
  -czf "${destination}/platform-storage.tar.gz" .

sha256sum "${destination}/database.dump" \
  "${destination}/platform-storage.tar.gz" \
  > "${destination}/SHA256SUMS"

echo "备份完成：${destination}"
