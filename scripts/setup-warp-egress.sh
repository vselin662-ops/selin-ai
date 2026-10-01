#!/bin/bash
set -e

echo "🚀 [Selin AI] Активация нативного европейского шлюза Cloudflare WARP внутри Xray..."

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

echo "🔑 Сохранены текущие ключи Reality: UUID=$UUID"

# 2. Перезаписываем config.json с нативным WireGuard-шлюзом Cloudflare в Европу
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
      "tag": "warp-europe",
      "settings": {
        "kernelMode": false,
        "secretKey": "iJYh94p+RHyJ7qz5K9jMpQac5o5Xek4ABnk4pEyC5lQ=",
        "address": [
          "172.16.0.2/32"
        ],
        "peers": [
          {
            "publicKey": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
            "endpoint": "162.159.192.1:2408"
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

# 3. Перезапускаем службу Xray
systemctl restart xray
sleep 2

if systemctl is-active --quiet xray; then
  echo ""
  echo "========================================================================="
  echo "🎉 НАСТОЯЩИЙ ЕВРОПЕЙСКИЙ ШЛЮЗ АКТИВИРОВАН ВНУТРИ XRAY!"
  echo "========================================================================="
  echo "Маршрут:"
  echo "Ваш ПК/телефон -> (VLESS Reality 443 в Москву) -> (WARP Wireguard в Европу) -> Интернет"
  echo ""
  echo "Ключи и ссылка в Happ остаются ПРЕЖНИМИ (ничего перенастраивать не нужно)."
  echo "Просто включите тумблер в Happ и откройте Google AI Studio и Instagram!"
  echo "========================================================================="
else
  echo "❌ Ошибка запуска Xray. Проверьте: journalctl -u xray -n 20"
  exit 1
fi
