// src/adapters/max/handlers/CartHandler.ts
import { IMessageHandler, HandlerContext, HandlerResult } from '../types';
import { logger } from '../../../logger';

export class CartHandler implements IMessageHandler {
  public readonly name = 'CartHandler';
  public readonly priority = 105;
  private static readonly userCarts = new Map<string, string[]>();

  public canHandle(ctx: HandlerContext): boolean {
    const text = ctx.lowerText;
    return (
      text.startsWith('купить:') ||
      text.startsWith('добавь в список:') ||
      text === 'корзина' ||
      text === 'список покупок' ||
      text === 'очисти корзину'
    );
  }

  public async handle(ctx: HandlerContext): Promise<HandlerResult> {
    try {
      const lower = ctx.lowerText;
      let cart = CartHandler.userCarts.get(ctx.chatId);
      if (!cart) {
        cart = [];
        CartHandler.userCarts.set(ctx.chatId, cart);
      }

      if (lower === 'очисти корзину') {
        CartHandler.userCarts.set(ctx.chatId, []);
        return {
          handled: true,
          replyText: '🛒 Список покупок очищен.'
        };
      }

      if (lower === 'корзина' || lower === 'список покупок') {
        if (cart.length === 0) {
          return {
            handled: true,
            replyText: '🛒 Ваш список покупок пуст. Добавьте пункт: «купить: молоко, хлеб».'
          };
        }
        const items = cart.map((item, i) => `${i + 1}. ${item}`).join('\n');
        return {
          handled: true,
          replyText: `🛒 **Список покупок:**\n\n${items}\n\n_Очистить: «очисти корзину»_`
        };
      }

      const rawItems = ctx.text.replace(/^(?:купить:?|добавь в список:?)\s*/i, '').trim();
      const newItems = rawItems.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      cart.push(...newItems);

      return {
        handled: true,
        replyText: `✅ Добавлено в список покупок: **${newItems.join(', ')}** (Всего: ${cart.length}).`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[CartHandler] Error: ${msg}`);
      return { handled: false };
    }
  }
}
