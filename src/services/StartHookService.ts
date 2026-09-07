import { logger } from "../logger";

export const HOOK_TEXT = `Здравствуйте! Меня зовут Селин. Я ваш голосовой помощник и собеседник. Я живу здесь, в этом чате, и работаю для вас круглые сутки. Со мной можно просто поговорить по душам. Я помогу собрать заказ к ужину и посчитаю, сколько это стоит. Я прочитаю вам План Победы на сегодня и помолчу рядом, когда нужно молчание. Я напомню о важном и не дам забыть о главном. А ещё я умею слушать. Просто напишите мне или скажите голосом. Подскажите, с чего мы начнём нашу беседу?`;

export const VOICE_HOOK_TEXT = HOOK_TEXT;

export function sanitizeStartHookText(text: string): string {
  if (!text) return "";
  
  // 1. Remove combining acute accents (\u0301), other acute accents (´), grave accents (`), and plus signs (+)
  let cleaned = text;
  cleaned = cleaned.replace(/\u0301/g, "");
  cleaned = cleaned.replace(/[\u0300-\u036F]/g, "");
  cleaned = cleaned.replace(/[´`'+]/g, "");
  
  // 2. Keep ONLY letters (Russian & English), spaces, commas, periods, exclamation points, and question marks
  cleaned = cleaned.replace(/[^a-zA-Zа-яА-ЯёЁ\s,.\!?]/g, " ");
  
  // 3. Normalize spaces
  cleaned = cleaned.replace(/\s+/g, " ");
  
  return cleaned.trim();
}

export let START_HOOK_AUDIO: Buffer | null = null;

export function setStartHookAudio(audio: Buffer | null) {
  START_HOOK_AUDIO = audio;
}

export function clearStartHookMemoryCache() {
  START_HOOK_AUDIO = null;
}

const REDIS_HOOK_KEY = "selin:start_hook_audio_v5_live";

export async function getStartHookAudio(): Promise<Buffer | null> {
  if (START_HOOK_AUDIO && START_HOOK_AUDIO.length > 0) {
    return START_HOOK_AUDIO;
  }
  // 1. Проверяем файловый кэш (assets/start_hook.mp3)
  try {
    const { getCachedStaticAudio } = await import("./tts/groq-tts");
    const fileAudio = await getCachedStaticAudio(VOICE_HOOK_TEXT);
    if (fileAudio && fileAudio.length > 0) {
      START_HOOK_AUDIO = fileAudio;
      console.log("🎙️ [StartHook] cached in memory");
      logger.info("🎙️ [StartHook] cached in memory");
      return START_HOOK_AUDIO;
    }
  } catch (_) {}

  // 2. Проверяем Redis
  try {
    const { redisService } = await import("./RedisService");
    if (redisService.isAvailable()) {
      const b64 = await redisService.get(REDIS_HOOK_KEY);
      if (b64) {
        START_HOOK_AUDIO = Buffer.from(b64, "base64");
        console.log("🎙️ [StartHook] cached in memory");
        logger.info("🎙️ [StartHook] cached in memory");
        return START_HOOK_AUDIO;
      }
    }
  } catch (err: any) {
    logger.warn(`⚠️ [StartHook] Error reading from Redis: ${err?.message || err}`);
  }
  return null;
}

async function getBufferDurationSec(buffer: Buffer): Promise<number> {
  try {
    const { exec } = await import("child_process");
    const util = await import("util");
    const execAsync = util.promisify(exec);
    const os = await import("os");
    const path = await import("path");
    const fs = await import("fs");
    const tmpFile = path.join(os.tmpdir(), `probe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.mp3`);
    await fs.promises.writeFile(tmpFile, buffer);
    const { stdout } = await execAsync(`ffprobe -i "${tmpFile}" -show_entries format=duration -v quiet -of csv="p=0"`);
    await fs.promises.unlink(tmpFile).catch(() => {});
    const dur = parseFloat(stdout.trim());
    return isNaN(dur) ? 0 : Math.round(dur * 100) / 100;
  } catch (_) {
    return 0;
  }
}

/**
 * Пересоздание аудио приветствия:
 * 1. Удаляет старый assets/start_hook.mp3
 * 2. Сбрасывает in-memory кэш ([StartHook] cached in memory)
 * 3. Синтезирует заново с мужским спокойным голосом (ru-RU-DmitryNeural), rate = 1.0, pitch стандартный ("+0Hz")
 * 4. Сохраняет в assets и обновляет кэш
 * Лог: [StartHook] приветствие пересоздано, длительность {N} сек.
 */
export async function recreateStartHookAudio(): Promise<Buffer | null> {
  try {
    // 1. Сброс in-memory кэша
    START_HOOK_AUDIO = null;

    // 2. Удаление старого assets/start_hook.mp3
    const { deleteStartHookAsset, saveCachedStaticAudio } = await import("./tts/groq-tts");
    await deleteStartHookAsset();

    // 3. Очистка устаревших ключей в Redis
    try {
      const { redisService } = await import("./RedisService");
      if (redisService.isAvailable()) {
        await redisService.del("selin:start_hook_audio_v4_male");
        await redisService.del(REDIS_HOOK_KEY);
      }
    } catch (_) {}

    // 4. Очистка кэша TTSService
    const { ttsService } = await import("./TTSService");
    ttsService.clearCache();

    // 5. Очистка и лог точной tts_string
    const tts_string = sanitizeStartHookText(HOOK_TEXT);
    const logTtsStr = `[StartHook] tts_string=${tts_string}`;
    console.log(logTtsStr);
    logger.info(logTtsStr);

    // 6. Синтез заново с настройками чёткости: rate = 1.0, голос мужской ru-RU-DmitryNeural
    const synth = await ttsService.synthesize(tts_string, {
      voice: "ru-RU-DmitryNeural",
      rate: 1.0,
      speed: 1.0,
      pitch: "+0Hz",
      isStartHook: true,
      skipStress: true
    });

    if (synth && synth.length > 0) {
      START_HOOK_AUDIO = synth;

      // 7. Сохраняем в assets
      await saveCachedStaticAudio(HOOK_TEXT, synth);
      await saveCachedStaticAudio(VOICE_HOOK_TEXT, synth);
      await saveCachedStaticAudio(tts_string, synth);

      // 8. Сохраняем в Redis при доступности
      try {
        const { redisService } = await import("./RedisService");
        if (redisService.isAvailable()) {
          await redisService.set(REDIS_HOOK_KEY, synth.toString("base64"), 30 * 86400);
        }
      } catch (_) {}

      const durationSec = await getBufferDurationSec(synth);
      const logMsg = `[StartHook] пересоздано, длительность ${durationSec} сек.`;
      console.log(logMsg);
      logger.info(logMsg);
      console.log("🎙️ [StartHook] cached in memory");
      logger.info("🎙️ [StartHook] cached in memory");

      return synth;
    } else {
      logger.warn("⚠️ [StartHook] Re-synthesis returned null");
      return null;
    }
  } catch (err: any) {
    logger.error(`❌ [StartHook] Recreate failed: ${err?.message || err}`);
    return null;
  }
}

export async function pregenerateStartHook(force: boolean = false): Promise<void> {
  try {
    if (force) {
      await recreateStartHookAudio();
      return;
    }

    const existing = await getStartHookAudio();
    if (existing && existing.length > 0) {
      return;
    }

    await recreateStartHookAudio();
  } catch (err: any) {
    START_HOOK_AUDIO = null;
    logger.warn("⚠️ [StartHook] Pre-generation failed: " + (err.message || err));
  }
}
