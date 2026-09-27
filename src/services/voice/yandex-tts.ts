export async function synthesizeWithYandex(text: string, isMale: boolean = false): Promise<Buffer | null> {
  const apiKey = process.env.YANDEX_API_KEY;
  if (!apiKey) return null;
  
  const voice = isMale ? 'filipp' : 'alena';
  const formData = new URLSearchParams({
    text, lang: 'ru-RU', voice, format: 'mp3', speed: '1.0'
  });
  
  try {
    const response = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
      method: 'POST',
      headers: { 'Authorization': `Api-Key ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch { return null; }
}
