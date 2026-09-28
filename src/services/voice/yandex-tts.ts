export async function synthesizeWithYandex(text: string, isMale: boolean = false): Promise<Buffer | null> {
  const apiKey = process.env.YANDEX_API_KEY || process.env.YANDEX_TTS_API_KEY;
  if (!apiKey) {
    return null;
  }
  
  const voice = isMale ? 'filipp' : 'alena';
  const formData = new URLSearchParams({
    text, lang: 'ru-RU', voice, format: 'mp3', speed: '1.0'
  });
  
  try {
    const response = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
      method: 'POST',
      headers: { 'Authorization': `Api-Key ${apiKey.trim()}` },
      body: formData,
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      const errBody = await response.text();
      console.warn(`[YandexTTS] API Error HTTP ${response.status}: ${errBody}`);
      return null;
    }
    const buf = Buffer.from(await response.arrayBuffer());
    return buf;
  } catch (err: any) {
    console.warn(`[YandexTTS] Network error: ${err?.message || err}`);
    return null;
  }
}
