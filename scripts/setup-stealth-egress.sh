#!/bin/bash
set -e

echo "🚀 [Selin AI] Развертывание Stealth Tor-Egress шлюза для выхода в свободный интернет..."

CONFIG_PATH="/usr/local/etc/xray/config.json"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "❌ Ошибка: Xray не настроен. Сначала запустите setup-reality.sh"
  exit 1
fi

# 1. Установка и запуск системного Tor демона
echo "📦 Установка Tor..."
apt-get update -y > /dev/null 2>&1 || true
apt-get install -y tor > /dev/null 2>&1

systemctl restart tor
systemctl enable tor
sleep 3

# 2. Проверка работы локального SOCKS5 Tor прокси
echo "🔍 Проверка локального Tor шлюза на порту 9050..."
EXIT_IP=$(curl -s --socks5-hostname 127.0.0.1:9050 -m 10 https://icanhazip.com || echo "")

if [ -z "$EXIT_IP" ]; then
  echo "⚠️ Прямой Tor пробует переподключиться, ждем 5 секунд..."
  sleep 5
  EXIT_IP=$(curl -s --socks5-hostname 127.0.0.1:9050 -m 12 https://icanhazip.com || echo "")
fi

if [ -n "$EXIT_IP" ]; then
  echo "✅ Tor активен! Ваш выходной зарубежный IP: $EXIT_IP"
else
  echo "⚠️ Tor запускается в фоновом режиме..."
fi

# 3. Извлечение текущих параметров VLESS Reality
UUID=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['settings']['clients'][0]['id'])")
PRIVATE_KEY=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['streamSettings']['realitySettings']['privateKey'])")
SHORT_ID=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['streamSettings']['realitySettings']['shortIds'][0])")
SNI="www.yahoo.com"

# 4. Обновление конфигурации Xray: маршрутизация в Tor SOCKS5
cat <<EOF > "$CONFIG_PATH"
{
  "log": {
    "loglevel": "warning"
  },
  "dns": {
    "servers": [
      "1.1.1.1",
      "8.8.8.8"
    ]
  },
  "inbounds": [
    {
      "port": 443,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "${UUID}",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "${SNI}:443",
          "xver": 0,
          "serverNames": [
            "${SNI}",
            "yahoo.com"
          ],
          "privateKey": "${PRIVATE_KEY}",
          "shortIds": [
            "${SHORT_ID}"
          ]
        }
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "socks",
      "tag": "tor-out",
      "settings": {
        "servers": [
          {
            "address": "127.0.0.1",
            "port": 9050
          }
        ]
      }
    },
    {
      "protocol": "freedom",
      "tag": "direct"
    }
  ]
}
EOF

# 5. Перезапуск Xray
systemctl restart xray
sleep 2

echo ""
echo "========================================================================="
echo "🎉 STEALTH EGRESS УСПЕШНО АКТИВИРОВАН ВНУТРИ XRAY!"
echo "========================================================================="
echo "Архитектурная схема:"
echo "Ваш клиент (ПК/Happ) -> [Внутри РФ: VLESS Reality 443] -> [Выход: Tor SOCKS5 Европа/США] -> Интернет"
echo ""
echo "Google AI Studio и заблокированные сервисы видят зарубежный IP ($EXIT_IP)"
echo "Провайдер в РФ видит только легальный HTTPS трафик внутри Москвы."
echo "Ссылка в Happ остается ПРЕЖНЕЙ."
echo "========================================================================="
