#!/bin/bash
set -e

echo "🔄 [Selin AI] Выполнение безопасного отката к стабильной конфигурации VLESS Reality..."

CONFIG_PATH="/usr/local/etc/xray/config.json"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "❌ Ошибка: Файл конфигурации Xray не найден по пути $CONFIG_PATH"
  exit 1
fi

# 1. Извлекаем текущие рабочие параметры (чтобы не сбросить ключи в клиентах!)
echo "🔑 Сохранение текущих ключей авторизации..."
UUID=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['settings']['clients'][0]['id'])")
PRIVATE_KEY=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['streamSettings']['realitySettings']['privateKey'])")
SHORT_ID=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['streamSettings']['realitySettings']['shortIds'][0])")
SNI="www.yahoo.com"

if [ -z "$UUID" ] || [ -z "$PRIVATE_KEY" ] || [ -z "$SHORT_ID" ]; then
  echo "❌ Ошибка: Не удалось извлечь существующие ключи из конфигурации Xray."
  exit 1
fi

# 2. Перезаписываем конфигурацию в базовый режим VLESS Reality 443 с прямым выходом (freedom)
echo "✏️ Запись чистой конфигурации Reality на порт 443 с прямым выходом..."
sudo bash -c "cat <<EOF > $CONFIG_PATH
{
  \"log\": {
    \"loglevel\": \"warning\"
  },
  \"dns\": {
    \"servers\": [
      \"1.1.1.1\",
      \"8.8.8.8\"
    ]
  },
  \"inbounds\": [
    {
      \"port\": 443,
      \"protocol\": \"vless\",
      \"settings\": {
        \"clients\": [
          {
            \"id\": \"${UUID}\",
            \"flow\": \"xtls-rprx-vision\"
          }
        ],
        \"decryption\": \"none\"
      },
      \"streamSettings\": {
        \"network\": \"tcp\",
        \"security\": \"reality\",
        \"realitySettings\": {
          \"show\": false,
          \"dest\": \"\${SNI}:443\",
          \"xver\": 0,
          \"serverNames\": [
            \"\${SNI}\",
            \"yahoo.com\"
          ],
          \"privateKey\": \"${PRIVATE_KEY}\",
          \"shortIds\": [
            \"${SHORT_ID}\"
          ]
        }
      }
    }
  ],
  \"outbounds\": [
    {
      \"protocol\": \"freedom\",
      \"tag\": \"direct\"
    }
  ]
}
EOF"

# 3. Отключаем дополнительные туннели, если они были запущены на уровне ОС
echo "🛑 Отключение и деактивация туннелей AmneziaWG..."
sudo awg-quick down awg0 2>/dev/null || true
sudo systemctl stop awg-quick@awg0 2>/dev/null || true
sudo systemctl disable awg-quick@awg0 2>/dev/null || true

# 4. Перезапускаем Xray
echo "🔄 Перезапуск службы Xray..."
sudo systemctl restart xray

echo ""
echo "========================================================================="
echo "✅ ОТКАТ УСПЕШНО ЗАВЕРШЕН!"
echo "========================================================================="
echo "Xray возвращен к стандартному, стабильному VLESS Reality на порту 443."
echo "Все экспериментальные туннели отключены."
echo ""
echo "Ваши ключи и ссылка в Happ/клиентах остались ПРЕЖНИМИ и полностью активны."
echo "========================================================================="
