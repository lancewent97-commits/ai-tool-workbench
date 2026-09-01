#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?请设置 DATABASE_URL}"
: "${PLATFORM_STORAGE_HOST_ROOT:?请设置 PLATFORM_STORAGE_HOST_ROOT}"

if [[ "${PLATFORM_STORAGE_HOST_ROOT}" != /* || "${PLATFORM_STORAGE_HOST_ROOT}" == "/" ]]; then
  echo "PLATFORM_STORAGE_HOST_ROOT 必须是非根目录的绝对路径" >&2
  exit 2
fi

backup_directory="${1:-}"
confirmation="${2:-}"
if [[ -z "${backup_directory}" || "${confirmation}" != "--confirm" ]]; then
  echo "用法：$0 <备份目录> --confirm"
  echo "恢复会覆盖同名数据库对象和平台文件，必须先停止 API 服务。"
  exit 2
fi

sha256sum -c "${backup_directory}/SHA256SUMS"
pg_restore --clean --if-exists --no-owner --dbname="${DATABASE_URL}" \
  "${backup_directory}/database.dump"
rm -rf "${PLATFORM_STORAGE_HOST_ROOT}"
mkdir -p "${PLATFORM_STORAGE_HOST_ROOT}"
tar -C "${PLATFORM_STORAGE_HOST_ROOT}" \
  -xzf "${backup_directory}/platform-storage.tar.gz"

echo "恢复完成，请执行迁移并启动服务后检查 /ready。"
