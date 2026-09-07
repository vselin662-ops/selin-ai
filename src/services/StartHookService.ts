import { logger } from "../logger";

export const HOOK_TEXT = `Здравствуйте! Я Селин — ваш голосовой помощник. Буду рад помочь: собрать заказ, почитать Библию по Плану Победы, напомнить о важном или просто поддержать беседу. Подскажите, с чего начнём?`;

// Текст для голосового синтеза с комбинируемым акутом U+0301 на ударных гласных
export const VOICE_HOOK_TEXT = `Здра\u0301вствуйте! Я Сели\u0301н — ваш голосово\u0301й помо\u0301щник. Бу\u0301ду рад помо\u0301чь: собра\u0301ть зака\u0301з, почита\u0301ть Би\u0301блию по Пла\u0301ну Побе\u0301ды, напо\u0301мнить о ва\u0301жном и\u0301ли про\u0301сто поддержа\u0301ть бесе\u0301ду. Подскажи\u0301те, с чего\u0301 начнём?`;

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
 * 3. Синтезирует заново с мужским спокойным голосом (ru-RU-DmitryNeural), rate = 0.85, pitch стандартный ("+0Hz")
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

    // 5. Синтез заново с настройками чёткости: rate = 0.9, голос мужской спокойный ru-RU-DmitryNeural
    const synth = await ttsService.synthesize(VOICE_HOOK_TEXT, {
      voice: "ru-RU-DmitryNeural",
      rate: 0.9,
      speed: 0.9,
      pitch: "+0Hz"
    });

    if (synth && synth.length > 0) {
      START_HOOK_AUDIO = synth;

      // 6. Сохраняем в assets
      await saveCachedStaticAudio(HOOK_TEXT, synth);
      await saveCachedStaticAudio(VOICE_HOOK_TEXT, synth);

      // 7. Сохраняем в Redis при доступности
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
