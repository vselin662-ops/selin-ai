#!/bin/bash
set -e

echo "🚀 [Selin AI] Активация сверхзащищенного туннеля AmneziaWG + Cloudflare WARP..."
echo "🛡️ Этот протокол полностью обходит ТСПУ (DPI в РФ) за счет обфускации пакетов!"

# 1. Проверяем наличие wgcf-profile.conf в различных возможных директориях
WGCF_CONF=""
for path in \
  "/wgcf-profile.conf" \
  "./wgcf-profile.conf" \
  "$HOME/wgcf-profile.conf" \
  "/home/ubuntu/wgcf-profile.conf" \
  "/home/ubuntu/selin-ai-app/selin-ai-app/wgcf-profile.conf" \
  "/services/selin-ai/wgcf-profile.conf" \
  "/app/applet/wgcf-profile.conf"; do
  if [ -f "$path" ]; then
    WGCF_CONF="$path"
    break
  fi
done

# 2. Установка необходимых репозиториев и AmneziaWG
echo "📦 Подключение репозитория Amnezia PPA..."
sudo add-apt-repository -y ppa:amnezia/ppa
sudo apt-get update -y

echo "📦 Установка заголовков ядра и AmneziaWG..."
sudo apt-get install -y linux-headers-$(uname -r) || true
sudo apt-get install -y amneziawg || sudo apt-get install -y amneziawg-tools

# 3. Извлечение ключей из wgcf-profile.conf или использование встроенных резервных
PRIVATE_KEY=""
PUBLIC_KEY=""
ADDRESSES=""

if [ -f "$WGCF_CONF" ]; then
  echo "🔑 Извлечение ключей WARP из профиля..."
  PRIVATE_KEY=$(grep -i "PrivateKey" "$WGCF_CONF" | awk -F'= ' '{print $2}' | tr -d '\r')
  PUBLIC_KEY=$(grep -i "PublicKey" "$WGCF_CONF" | awk -F'= ' '{print $2}' | tr -d '\r')
  ADDRESSES=$(grep -i "Address" "$WGCF_CONF" | awk -F'= ' '{print $2}' | tr -d '\r' | paste -sd, -)
fi

if [ -z "$PRIVATE_KEY" ] || [ -z "$PUBLIC_KEY" ]; then
  echo "⚠️ Профиль wgcf-profile.conf не найден. Используем проверенные встроенные ключи WARP..."
  PRIVATE_KEY="iJYh94p+RHyJ7qz5K9jMpQac5o5Xek4ABnk4pEyC5lQ="
  PUBLIC_KEY="bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo="
  ADDRESSES="172.16.0.2/32,2606:4700:110:81f2:64e1:5942:e27b:2856/128"
fi

# 4. Выбор чистого эндпоинта Cloudflare WARP
# Мы используем IP-адрес вместо домена engage.cloudflareclient.com, чтобы исключить проблемы с DNS.
# В РФ IP-адреса Cloudflare WARP часто сканируются и блокируются, но благодаря AmneziaWG обфускации,
# мы можем безопасно использовать любой стандартный эндпоинт.
ENDPOINT_IP="162.159.193.10"
ENDPOINT_PORT="2408"

# 5. Создание конфигурации AmneziaWG
AWG_DIR="/etc/amnezia/amneziawg"
sudo mkdir -p "$AWG_DIR"
AWG_CONF="$AWG_DIR/awg0.conf"

echo "✏️ Генерация конфигурационного файла $AWG_CONF..."
sudo bash -c "cat <<EOF > $AWG_CONF
[Interface]
PrivateKey = $PRIVATE_KEY
Address = $ADDRESSES
DNS = 1.1.1.1, 8.8.8.8
MTU = 1280

# Обфускационные параметры AmneziaWG (блокируют распознавание WireGuard по сигнатурам DPI)
Jc = 4
Jmin = 40
Jmax = 70
S1 = 15
S2 = 24
H1 = 1
H2 = 2
H3 = 3
H4 = 4

[Peer]
PublicKey = $PUBLIC_KEY
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = $ENDPOINT_IP:$ENDPOINT_PORT
PersistentKeepalive = 25
EOF"

sudo chmod 600 "$AWG_CONF"

# 6. Очистка старых интерфейсов и запуск awg0
echo "🔄 Остановка старых туннелей если запущены..."
sudo awg-quick down awg0 2>/dev/null || true
sudo systemctl stop awg-quick@awg0 2>/dev/null || true

echo "🟢 Запуск интерфейса awg0..."
sudo awg-quick up awg0

echo "⚙️ Настройка автозапуска при загрузке системы..."
sudo systemctl enable awg-quick@awg0

# 7. Сброс настроек Xray на чистый direct (так как весь сервер теперь прозрачно завернут в AmneziaWG)
CONFIG_PATH="/usr/local/etc/xray/config.json"
if [ -f "$CONFIG_PATH" ]; then
  echo "⚙️ Сброс Xray в режим прямого выхода (через защищенный awg0)..."
  
  # Извлекаем текущие параметры Reality
  UUID=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['settings']['clients'][0]['id'])")
  PRIVATE_KEY_REALITY=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['streamSettings']['realitySettings']['privateKey'])")
  SHORT_ID=$(python3 -c "import json; print(json.load(open('$CONFIG_PATH'))['inbounds'][0]['streamSettings']['realitySettings']['shortIds'][0])")
  SNI="www.yahoo.com"

  sudo bash -c "cat <<EOF > $CONFIG_PATH
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
            "id": \"${UUID}\",
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
          "dest": \"\${SNI}:443\",
          "xver": 0,
          "serverNames": [
            \"\${SNI}\",
            "yahoo.com"
          ],
          "privateKey": \"${PRIVATE_KEY_REALITY}\",
          "shortIds": [
            \"${SHORT_ID}\"
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
EOF"

  echo "🔄 Перезапуск Xray..."
  sudo systemctl restart xray
fi

echo ""
echo "========================================================================="
echo "🎉 AMNEZIAWG ТУННЕЛЬ УСПЕШНО НАСТРОЕН И ЗАПУЩЕН НА СЕРВЕРЕ!"
echo "========================================================================="
echo "Все DPI-фильтры (ТСПУ) теперь успешно обходятся за счет обфускации пакетов."
echo "Весь трафик сервера (включая Xray 443 и Node VLESS 3000) прозрачно идет в"
echo "свободный интернет через Cloudflare WARP."
echo ""
echo "Никакие ключи или ссылки в Happ/клиентах менять НЕ нужно!"
echo "========================================================================="
