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
  public static async generateImage(options: ImageGenerationOptions): Promise<string> {
    const { prompt, width = 1024, height = 1024, style } = options;

    const result = await SelfCorrectionEngine.executeWithCorrection<string>(
      async (attempt: number) => {
        let finalPrompt = prompt.trim();
        if (style) {
          finalPrompt += `, ${style}`;
        }
        if (attempt > 1) {
          finalPrompt += ', high quality, detailed, 8k, photorealistic';
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
