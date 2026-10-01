#!/bin/bash
set -e

echo "🚀 [Selin AI] Установка зарубежного шлюза Cloudflare WARP для выхода в Европу/США..."

# 1. Добавление официального репозитория Cloudflare
curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ jammy main" | tee /etc/apt/sources.list.d/cloudflare-client.list

# 2. Установка cloudflare-warp
apt-get update -y
apt-get install -y cloudflare-warp

# 3. Регистрация и настройка в режиме локального SOCKS5 прокси на порту 40000
warp-cli --accept-tos registration new || warp-cli --accept-tos register || true
warp-cli --accept-tos mode proxy
warp-cli --accept-tos proxy port 40000
warp-cli --accept-tos connect

# 4. Модификация Xray: маршрутизация исходящего трафика (Egress) через WARP
cat << 'EOF' > /tmp/update_xray.py
import json

try:
    with open('/usr/local/etc/xray/config.json', 'r') as f:
        config = json.load(f)

    config['outbounds'] = [
        {
            "protocol": "socks",
            "tag": "warp-out",
            "settings": {
                "servers": [
                    {
                        "address": "127.0.0.1",
                        "port": 40000
                    }
                ]
            }
        },
        {
            "protocol": "freedom",
            "tag": "direct"
        }
    ]

    with open('/usr/local/etc/xray/config.json', 'w') as f:
        json.dump(config, f, indent=2)
    print("Xray config updated with WARP outbound successfully.")
except Exception as e:
    print(f"Error updating config: {e}")
    exit(1)
EOF

python3 /tmp/update_xray.py
systemctl restart xray

echo ""
echo "========================================================================="
echo "✅ ЕВРОПЕЙСКИЙ ШЛЮЗ WARP УСПЕШНО ИНТЕГРИРОВАН В XRAY!"
echo "========================================================================="
echo "Трафик: Клиент (Happ/PC) -> Сервер (Москва 443) -> Cloudflare (Европа/США) -> Интернет"
echo "Теперь ваш исходящий IP определяется как Cloudflare (не РФ), и Google AI Studio открывается."
echo "========================================================================="
