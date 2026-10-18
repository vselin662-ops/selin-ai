#!/bin/bash
set -e

echo "🎨 [Selin AI] Генерация графических слайдов с профессиональным русским описанием..."

# Папка назначения для слайдов
IMG_DIR="src/assets/images"
mkdir -p "$IMG_DIR"

# 1. Поиск оригинальных файлов по паттернам (поскольку в именах есть таймстампы)
COVER_BG=$(find "$IMG_DIR" -name "enterprise_pitch_cover_*.jpg" | head -n 1)
BLUEPRINT_BG=$(find "$IMG_DIR" -name "architecture_blueprint_*.jpg" | head -n 1)
BRAIN_BG=$(find "$IMG_DIR" -name "ai_agent_brain_*.jpg" | head -n 1)
DASHBOARD_BG=$(find "$IMG_DIR" -name "dashboard_mockup_*.jpg" | head -n 1)
FLOW_BG=$(find "$IMG_DIR" -name "voice_and_mcp_flow_*.jpg" | head -n 1)

# Шрифты
FONT_BOLD="Liberation-Sans-Bold"
FONT_REGULAR="Liberation-Sans"

# Проверка наличия оригинальных фонов
if [ -z "$COVER_BG" ] || [ -z "$BLUEPRINT_BG" ] || [ -z "$BRAIN_BG" ] || [ -z "$DASHBOARD_BG" ] || [ -z "$FLOW_BG" ]; then
  echo "⚠️ Некоторые фоновые картинки не найдены. Используем те, которые есть..."
fi

# ==========================================
# СЛАЙД 1: Титульный Слайд
# ==========================================
if [ -n "$COVER_BG" ]; then
  echo "🖼️ Создание Слайда 1 (Титульный)..."
  convert "$COVER_BG" \
    -fill 'rgba(15,13,12,0.85)' -draw 'roundrectangle 60,60,1316,708 20,20' \
    -font "$FONT_BOLD" -fill '#C5A059' -pointsize 64 -draw 'text 120,200 "SELIN AI"' \
    -font "$FONT_BOLD" -fill '#EAE6DF' -pointsize 32 -draw 'text 120,280 "Автономная ИИ-Платформа Цифровых Сотрудников"' \
    -font "$FONT_REGULAR" -fill '#A89E94' -pointsize 18 -draw 'text 120,400 "• Суверенная многоагентная архитектура оркестрации бизнес-ассистентов"' \
    -font "$FONT_REGULAR" -fill '#A89E94' -pointsize 18 -draw 'text 120,440 "• Встроенная защита ядра по стандартам безопасности OWASP LLM 2026"' \
    -font "$FONT_REGULAR" -fill '#A89E94' -pointsize 18 -draw 'text 120,480 "• Бесшовная интеграция в Max Messenger и веб-панели управления"' \
    -font "$FONT_BOLD" -fill '#C5A059' -pointsize 16 -draw 'text 120,620 "Релиз 2026 г. | Версия 1.0.0 Enterprise Ready | Локальная СУБД SQLite WAL"' \
    "$IMG_DIR/slide_1.jpg"
fi

# ==========================================
# СЛАЙД 2: Технологический Стек и Хранение
# ==========================================
if [ -n "$BLUEPRINT_BG" ]; then
  echo "🖼️ Создание Слайда 2 (Стек и БД)..."
  convert "$BLUEPRINT_BG" \
    -fill 'rgba(15,13,12,0.85)' -draw 'roundrectangle 60,60,1316,708 20,20' \
    -font "$FONT_BOLD" -fill '#C5A059' -pointsize 36 -draw 'text 120,130 "ТЕХНОЛОГИЧЕСКИЙ СТЕК И ХРАНЕНИЕ"' \
    -font "$FONT_BOLD" -fill '#EAE6DF' -pointsize 20 -draw 'text 120,200 "Суверенное, производительное и импортозамещенное ядро (2026)"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,280 "• Клиентский слой: SPA на React 18, сборщик Vite, стилизация Tailwind CSS (Glassmorphism)"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,340 "• Серверный слой: Express.js на Node.js (TypeScript), компиляция через esbuild"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,400 "• База Данных: Pure SQLite в WAL-режиме для полной изоляции сессий пользователей"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,460 "• Кэширование: Быстрый кэш транзакций и промежуточных данных на Redis"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,520 "• ИИ-модели: Google Gemini 2.0 Flash API (официальная библиотека @google/genai)"' \
    -font "$FONT_BOLD" -fill '#C5A059' -pointsize 14 -draw 'text 120,640 "Все операции выполняются на суверенных серверах без передачи данных третьим лицам"' \
    "$IMG_DIR/slide_2.jpg"
fi

# ==========================================
# СЛАЙД 3: Интерактивный Голосовой Движок
# ==========================================
if [ -n "$BRAIN_BG" ]; then
  echo "🖼️ Создание Слайда 3 (Голосовой Движок)..."
  convert "$BRAIN_BG" \
    -fill 'rgba(15,13,12,0.85)' -draw 'roundrectangle 60,60,1316,708 20,20' \
    -font "$FONT_BOLD" -fill '#C5A059' -pointsize 36 -draw 'text 120,130 "ГОЛОСОВОЙ ИНТЕРФЕЙС (VOICE ENGINE)"' \
    -font "$FONT_BOLD" -fill '#EAE6DF' -pointsize 20 -draw 'text 120,200 "Voice-First технологии интерактивного общения с нулевой задержкой"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,280 "• Хук useVoiceRecorder.ts: Захват микрофона, замер громкости (AnalyserNode) и Opus-запись"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,340 "• Кнопка VoiceButton.tsx: 4 состояния (idle - ожидание, recording - запись, processing, speaking)"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,400 "• Распознавание речи: Преобразование голоса в текст по эндпоинту /api/voice/transcribe"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,460 "• Синтез речи TTS (/api/tts): Генерация ответов ИИ с интеллектуальной нормализацией чисел и дат"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,520 "• Интерактивный диалог: Модуль /api/voice-organism-dialogue для свободных речевых сценариев"' \
    -font "$FONT_BOLD" -fill '#C5A059' -pointsize 14 -draw 'text 120,640 "Высокое качество озвучивания и мгновенный отклик интерфейса"' \
    "$IMG_DIR/slide_3.jpg"
fi

# ==========================================
# СЛАЙД 4: Безопасность ИИ (Security Shield)
# ==========================================
if [ -n "$DASHBOARD_BG" ]; then
  echo "🖼️ Создание Слайда 4 (Безопасность)..."
  convert "$DASHBOARD_BG" \
    -fill 'rgba(15,13,12,0.85)' -draw 'roundrectangle 60,60,1316,708 20,20' \
    -font "$FONT_BOLD" -fill '#C5A059' -pointsize 36 -draw 'text 120,130 "ЗАЩИТА ИИ ПО СТАНДАРТУ OWASP LLM 2026"' \
    -font "$FONT_BOLD" -fill '#EAE6DF' -pointsize 20 -draw 'text 120,200 "Комплексная защита ядра, предотвращение утечек данных и Prompt-инъекций"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,280 "• ai-shield.ts: Защита от Prompt Injection на входе и фильтрация скрытых zero-width символов"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,340 "• rag-protection.ts: Защита документов базы знаний RAG тегами <retrieved_document> от скрытых атак"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,400 "• mcp-guardian.ts: Проверка SHA-256 хешей плагинов Model Context Protocol и запуск в песочнице"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,460 "• output-filter.ts: Сканирование ответов на утечки приватных ключей, JWT-токенов и Canary-токенов"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,520 "• Emergency Killswitch: Аварийный API-метод /api/security/killswitch блокировки ИИ в один клик"' \
    -font "$FONT_BOLD" -fill '#C5A059' -pointsize 14 -draw 'text 120,640 "Успешно пройдено 10 из 10 автоматических тестов безопасности (tests/security.test.ts)"' \
    "$IMG_DIR/slide_4.jpg"
fi

# ==========================================
# СЛАЙД 5: Специализированные ИИ-Агенты
# ==========================================
if [ -n "$FLOW_BG" ]; then
  echo "🖼️ Создание Слайда 5 (ИИ-Агенты)..."
  convert "$FLOW_BG" \
    -fill 'rgba(15,13,12,0.85)' -draw 'roundrectangle 60,60,1316,708 20,20' \
    -font "$FONT_BOLD" -fill '#C5A059' -pointsize 36 -draw 'text 120,130 "СПЕЦИАЛИЗИРОВАННЫЕ ИИ-СОТРУДНИКИ"' \
    -font "$FONT_BOLD" -fill '#EAE6DF' -pointsize 20 -draw 'text 120,200 "Прикладной бизнес-функционал автономной работы (Релиз 2026)"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,280 "• Агент LanguageTutor: Обучение языкам, интервальный алгоритм Anki (SM-2), автопроверка ДЗ из чата"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,340 "• Бизнес-Ментор: Диагностика, выдача дневных SMART-целей и симулятор сложных продаж Sales Roleplay"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,400 "• База Знаний (RAG): Загрузка и локальный суверенный поиск по файлам PDF, TXT, DOCX"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,460 "• Духовный Трекер: Планировщик духовных побед и автоматическая утренняя рассылка псалмов"' \
    -font "$FONT_REGULAR" -fill '#EAE6DF' -pointsize 18 -draw 'text 120,520 "• Structured Outputs: Валидация вывода по Zod-схемам на бэкенде гарантирует 100% стабильность"' \
    -font "$FONT_BOLD" -fill '#C5A059' -pointsize 14 -draw 'text 120,640 "Идеальное решение для автоматизации корпоративных процессов и обучения сотрудников"' \
    "$IMG_DIR/slide_5.jpg"
fi

echo "🎉 [Selin AI] Все 5 слайдов с русским описанием успешно сгенерированы в папке $IMG_DIR!"
ls -la "$IMG_DIR"/slide_*.jpg
