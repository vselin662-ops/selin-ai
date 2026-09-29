// src/engines/ImagePipelineEngine.ts
import { logger } from '../logger';
import { SelfCorrectionEngine } from './SelfCorrectionEngine';

export interface ImageGenerationOptions {
  prompt: string;
  width?: number;
  height?: number;
  style?: string;
}

export class ImagePipelineEngine {
  /**
   * Конвейер улучшения промпта (Prompt Enhancement)
   */
  public static enhancePrompt(shortPrompt: string): string {
    const raw = shortPrompt.trim();
    if (!raw) return 'high quality digital art, detailed, 8k resolution';
    // Если запрос короткий, обогащаем деталями стиля, освещения и качества
    if (raw.length < 50 && !raw.includes('photorealistic') && !raw.includes('detailed')) {
      return `${raw}, professional photography, volumetric soft cinematic lighting, highly detailed, photorealistic, 8k resolution`;
    }
    return raw;
  }

  public static async generateImage(options: ImageGenerationOptions): Promise<string> {
    const { prompt, width = 1024, height = 1024, style } = options;
    const enhancedPrompt = this.enhancePrompt(prompt);

    const result = await SelfCorrectionEngine.executeWithCorrection<string>(
      async (attempt: number) => {
        let finalPrompt = enhancedPrompt;
        if (style) {
          finalPrompt += `, ${style}`;
        }
        if (attempt > 1) {
          finalPrompt += ', award-winning masterpiece, sharp focus, 8k';
        }

        const encoded = encodeURIComponent(finalPrompt);
        return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true`;
      },
      (url: string) => {
        const valid = url.startsWith('https://image.pollinations.ai/');
        return {
          valid,
          issues: valid ? [] : ['Некорректный URL генератора']
        };
      }
    );

    if (result.success) {
      logger.info(`[ImagePipelineEngine] Image pipeline completed successfully`);
      return result.data;
    }

    logger.error(`[ImagePipelineEngine] Image pipeline failed after corrections`);
    throw new Error('Image generation pipeline failed');
  }
}
