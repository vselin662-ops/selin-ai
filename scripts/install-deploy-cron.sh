#!/usr/bin/env bash
# Установка периодической проверки обновлений (cron) каждые 2 минуты
# Согласно инструкции поддержки Cloud.ru

SCRIPT_PATH="/services/selin-ai/scripts/auto-deploy.sh"
chmod +x "$SCRIPT_PATH"

CRON_JOB="*/2 * * * * /bin/bash $SCRIPT_PATH >/dev/null 2>&1"

# Проверяем, есть ли уже такая запись в crontab
(crontab -l 2>/dev/null | grep -v -F "$SCRIPT_PATH" ; echo "$CRON_JOB") | crontab -

echo "✅ Автодеплой успешно установлен в crontab!"
echo "Каждые 2 минуты сервер будет проверять новые коммиты в main и автоматически обновлять контейнер."
crontab -l | grep auto-deploy.sh
