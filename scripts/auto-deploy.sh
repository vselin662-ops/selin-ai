#!/usr/bin/env bash
# ==============================================================================
# Selin AI — Скрипт автоматического обновления (Auto-Deploy via Git & Docker)
# Соответствует регламенту Cloud.ru (cron git pull & docker compose rebuild)
# ==============================================================================

set -euo pipefail

PROJECT_DIR="/services/selin-ai"
LOG_FILE="/var/log/selin-ai-autodeploy.log"

# Проверяем права и директорию
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
else
    echo "Директория $PROJECT_DIR не найдена! Проверьте путь."
    exit 1
fi

# Направляем вывод в лог-файл и консоль
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=========================================================="
echo "🕒 [$(date '+%Y-%m-%d %H:%M:%S')] Проверка обновлений Git..."
echo "=========================================================="

# Получаем информацию об изменениях из удаленного репозитория
git fetch origin main

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo "✅ [Selin AI] Код актуален, обновление не требуется (Commit: ${LOCAL_COMMIT:0:7})."
    exit 0
fi

echo "🚀 [Selin AI] Обнаружены новые коммиты! Запуск автодеплоя..."
echo "  Локальный:  $LOCAL_COMMIT"
echo "  Удаленный:  $REMOTE_COMMIT"

# Сбрасываем возможные локальные изменения и подтягиваем свежий код
git reset --hard HEAD
git pull origin main

# Пересобираем и перезапускаем Docker-контейнеры
echo "🔨 [Selin AI] Пересборка Docker контейнеров..."
docker compose down
docker compose build --no-cache selin-ai
docker compose up -d

echo "🧹 [Selin AI] Очистка временных образов..."
docker image prune -f

echo "🎉 [$(date '+%Y-%m-%d %H:%M:%S')] Деплой успешно завершен! Контейнеры запущены."
docker ps --filter "name=selin-ai"
