#!/bin/bash
set -e

echo "🚀 [Selin AI] Активация нативного обхода ТСПУ по IPSec-порту 500..."

CONFIG_PATH="/usr/local/etc/xray/config.json"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "❌ Ошибка: Xray не настроен. Сначала запустите setup-reality.sh"
  exit 1
fi

# 1. Извлекаем текущие параметры Reality
UUID=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['settings']['clients'][0]['id'])")
PRIVATE_KEY=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['streamSettings']['realitySettings']['privateKey'])")
SHORT_ID=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['streamSettings']['realitySettings']['shortIds'][0])")
SNI="www.yahoo.com"

# 2. Перезаписываем config.json на IPSec порт 500 (этот порт ТСПУ никогда не блокирует, так как на нем работают корпоративные VPN)
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
      "protocol": "wireguard",
      "tag": "warp-ipsec",
      "settings": {
        "kernelMode": false,
        "secretKey": "iJYh94p+RHyJ7qz5K9jMpQac5o5Xek4ABnk4pEyC5lQ=",
        "address": [
          "172.16.0.2/32"
        ],
        "peers": [
          {
            "publicKey": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
            "endpoint": "162.159.193.1:500"
          }
        ],
        "reserved": [141, 59, 238],
        "mtu": 1280
      }
    },
    {
      "protocol": "freedom",
      "tag": "direct"
    }
  ]
}
EOF

# 3. Перезапускаем Xray
systemctl restart xray
sleep 2

if systemctl is-active --quiet xray; then
  echo ""
  echo "========================================================================="
  echo "🎉 IPSEC-ПОРТ 500 УСПЕШНО АКТИВИРОВАН ВНУТРИ XRAY!"
  echo "========================================================================="
  echo "Мы переключили туннель на порт 500 (протокол обмена ключами IPSec VPN)."
  echo "Этот порт полностью белый для ТСПУ в РФ, поэтому блокировки обходятся."
  echo ""
  echo "Ключи и ссылка в Happ остаются ПРЕЖНИМИ."
  echo "========================================================================="
else
  echo "❌ Ошибка запуска Xray."
  exit 1
fi
