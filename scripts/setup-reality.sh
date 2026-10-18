#!/bin/bash
set -e

echo "🚀 [Selin AI] Развертывание VLESS Reality на порту 443 (защита от ТСПУ)..."

# 1. Установка Xray (если еще не установлен)
if ! command -v xray &> /dev/null; then
  bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
fi

XRAY_BIN=$(command -v xray || echo "/usr/local/bin/xray")

# 2. Генерация пары ключей X25519
KEYS=$($XRAY_BIN x25519)
PRIVATE_KEY=$(echo "$KEYS" | grep -i "Private" | awk '{print $NF}')
PUBLIC_KEY=$(echo "$KEYS" | grep -i "Public" | awk '{print $NF}')
UUID=$($XRAY_BIN uuid)
SHORT_ID=$(openssl rand -hex 8)
SERVER_IP=$(curl -s -4 icanhazip.com || echo "176.108.252.111")
SNI="www.yahoo.com"

echo "🔑 Private Key: $PRIVATE_KEY"
echo "🌐 Public Key: $PUBLIC_KEY"
echo "🆔 UUID: $UUID"

# 3. Запись конфигурации VLESS Reality
mkdir -p /usr/local/etc/xray
cat <<EOF > /usr/local/etc/xray/config.json
{
  "log": {
    "loglevel": "warning"
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
      "protocol": "freedom",
      "tag": "direct"
    }
  ]
}
EOF

# 4. Открытие порта в фаерволе и перезапуск службы
sudo ufw allow 443/tcp || true
systemctl restart xray
systemctl enable xray

# 5. Генерация ссылки для клиента
LINK="vless://${UUID}@${SERVER_IP}:443?security=reality&encryption=none&pbk=${PUBLIC_KEY}&headerType=none&fp=chrome&spx=%2F&type=tcp&flow=xtls-rprx-vision&sni=${SNI}&sid=${SHORT_ID}#SelinAI_Reality"

echo ""
echo "========================================================================="
echo "✅ SELIN AI REALITY УСПЕШНО НАСТРОЕН И ЗАПУЩЕН НА ПОРТУ 443!"
echo "========================================================================="
echo ""
echo "Скопируйте эту ссылку целиком и вставьте в Happ (или v2rayNG / Sing-box):"
echo ""
echo "${LINK}"
echo ""
echo "========================================================================="
