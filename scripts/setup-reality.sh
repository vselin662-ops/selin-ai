#!/bin/bash
set -e

echo "🚀 [Selin AI] Установка легковесного Xray Reality (порт 443, защита от ТСПУ)..."

# 1. Установка официального ядра Xray (без веб-панелей, чистый бинарник)
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

# 2. Генерация ключей X25519 и UUID
KEYS=$(/usr/local/bin/xray x25519)
PRIVATE_KEY=$(echo "$KEYS" | awk '/Private key:/ {print $3}')
PUBLIC_KEY=$(echo "$KEYS" | awk '/Public key:/ {print $3}')
UUID=$(/usr/local/bin/xray uuid)
SHORT_ID=$(openssl rand -hex 8)
SERVER_IP=$(curl -s -4 icanhazip.com || echo "176.108.252.111")
SNI="www.yahoo.com"

# 3. Запись конфигурации VLESS Reality (xtls-rprx-vision)
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

# 4. Открытие портов в фаерволе и перезапуск
sudo ufw allow 443/tcp || true
systemctl restart xray
systemctl enable xray

# 5. Формирование ссылки для Happ / v2rayNG / Sing-box
LINK="vless://${UUID}@${SERVER_IP}:443?security=reality&encryption=none&pbk=${PUBLIC_KEY}&headerType=none&fp=chrome&spx=%2F&type=tcp&flow=xtls-rprx-vision&sni=${SNI}&sid=${SHORT_ID}#SelinAI_Reality"

echo ""
echo "========================================================================="
echo "✅ SELIN AI REALITY УСПЕШНО ЗАПУЩЕН НА ПОРТУ 443!"
echo "========================================================================="
echo ""
echo "Скопируйте эту ссылку целиком и вставьте в Happ (или v2rayNG):"
echo ""
echo "${LINK}"
echo ""
echo "========================================================================="
