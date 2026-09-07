import { getVoiceGender, setVoiceGender, isVoiceGenderFixed } from "../../db";
import { logger } from "../logger";

export function detectGenderAndSet(chatId: string | number, text: string): 'female' | 'male' | 'none' {
  if (!chatId || !text) return 'none';
  
  const cleanId = String(chatId).replace(/^[a-z_]+/, '').trim() || String(chatId).trim();
  
  // Если голос зафиксирован, детектор его не переключает
  if (isVoiceGenderFixed(cleanId)) {
    return 'none';
  }
  
  const lowerText = text.toLowerCase();
  
  // Женские маркеры
  const femaleMarkers = [
    'красивая', 'умная', 'моя', 'помощница', 'сказала', 'смогла', 'сделала',
    'ты же женщина', 'обращайся как к женщине', 'селин, ты какая'
  ];
  
  // Мужские маркеры
  const maleMarkers = [
    'красивый', 'умный', 'мой', 'помощник', 'сказал', 'смог', 'сделал',
    'брат', 'друг', 'ты же мужчина'
  ];
  
  let detected: 'female' | 'male' | 'none' = 'none';
  
  // Функция проверки наличия маркера как отдельного слова или точной фразы
  const hasMarker = (marker: string): boolean => {
    if (marker.includes(' ')) {
      return lowerText.includes(marker);
    }
    // Разбиваем текст на отдельные слова, убирая пунктуацию
    const words = lowerText.split(/[^a-zа-яё0-9]+/i);
    return words.includes(marker);
  };
  
  const hasFemale = femaleMarkers.some(hasMarker);
  const hasMale = maleMarkers.some(hasMarker);
  
  if (hasFemale && !hasMale) {
    detected = 'female';
  } else if (hasMale && !hasFemale) {
    detected = 'male';
  }
  
  if (detected !== 'none') {
    setVoiceGender(cleanId, detected, 0); // 0 значит не зафиксирован принудительно
    const voiceName = detected === 'female' ? 'Svetlana' : 'Dmitry';
    const logMsg = `[VoiceGender] chat=${cleanId} detected=${detected} voice=${voiceName}`;
    console.log(logMsg);
    logger.info(logMsg);
  }
  
  return detected;
}
