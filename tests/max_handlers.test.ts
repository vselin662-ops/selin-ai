// tests/max_handlers.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateChatId, parseNumericId } from '../src/adapters/max/utils/idSanitizer';
import { cleanForMax, splitTextSmart, prepareVoiceText } from '../src/adapters/max/utils/textNormalizer';
import { parseAttachments } from '../src/adapters/max/utils/attachmentParser';
import { StartHandler } from '../src/adapters/max/handlers/StartHandler';
import { BibleHandler } from '../src/adapters/max/handlers/BibleHandler';
import { VoiceHandler } from '../src/adapters/max/handlers/VoiceHandler';
import { TenantHandler } from '../src/adapters/max/handlers/TenantHandler';
import { SmartPlannerHandler } from '../src/adapters/max/handlers/SmartPlannerHandler';
import { RAGHandler } from '../src/adapters/max/handlers/RAGHandler';
import { SubscriptionHandler } from '../src/adapters/max/handlers/SubscriptionHandler';
import { NavigationHandler } from '../src/adapters/max/handlers/NavigationHandler';
import { ImageGenHandler } from '../src/adapters/max/handlers/ImageGenHandler';
import { OwnerCommandHandler } from '../src/adapters/max/handlers/OwnerCommandHandler';
import { HandlerContext } from '../src/adapters/max/types';

function createMockContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  const text = overrides.text || '';
  return {
    raw: {},
    chatId: '12345678',
    numericId: 12345678,
    text,
    lowerText: text.toLowerCase(),
    isVoiceInput: false,
    isOwner: false,
    hasImage: false,
    hasLocation: false,
    isCallbackUpdate: false,
    ...overrides
  };
}

test('idSanitizer: validates and parses IDs', () => {
  assert.equal(validateChatId('12345'), '12345');
  assert.equal(validateChatId('user_abc-123'), 'user_abc-123');
  assert.throws(() => validateChatId('bad id with spaces'), /Недопустимый формат chatId/);
  assert.equal(validateChatId(999), '999');
  assert.equal(parseNumericId('12345'), 12345);
});

test('textNormalizer: cleans markdown and splits smart', () => {
  const raw = 'Hello **world**! [link](http://test.com)';
  const cleaned = cleanForMax(raw);
  assert.ok(!cleaned.includes('[link]'));

  const voice = prepareVoiceText('Задача № 5: выполнена!');
  assert.ok(voice.includes('номер 5'));

  const chunks = splitTextSmart('a'.repeat(5000), 3000);
  assert.equal(chunks.length, 2);
});

test('attachmentParser: extracts audio, image and location', () => {
  const parsed = parseAttachments({
    body: {
      attachments: [
        { type: 'image', payload: { url: 'https://img.com/test.jpg' } },
        { type: 'audio', payload: { url: 'https://audio.com/voice.mp3' } },
        { type: 'location', payload: { latitude: 55.75, longitude: 37.61 } }
      ]
    }
  });

  assert.equal(parsed.hasImage, true);
  assert.equal(parsed.imageUrl, 'https://img.com/test.jpg');
  assert.equal(parsed.hasAudio, true);
  assert.equal(parsed.hasLocation, true);
  assert.equal(parsed.latitude, 55.75);
});

test('StartHandler: triggers on /start and provides buttons', async () => {
  const handler = new StartHandler();
  const ctx = createMockContext({ text: '/start', lowerText: '/start' });
  assert.equal(handler.canHandle(ctx), true);

  const res = await handler.handle(ctx);
  assert.equal(res.handled, true);
  assert.ok(res.replyText?.includes('Здравствуйте! Я Селин'));
});

test('VoiceHandler: toggles voice mode', async () => {
  const handler = new VoiceHandler();
  const ctx = createMockContext({ text: 'голос вкл', lowerText: 'голос вкл' });
  assert.equal(handler.canHandle(ctx), true);

  const res = await handler.handle(ctx);
  assert.equal(res.handled, true);
  assert.ok(res.replyText?.includes('включены'));
});

test('TenantHandler: switches tenant', async () => {
  const handler = new TenantHandler();
  const ctx = createMockContext({ text: '/tenant enterprise_corp', lowerText: '/tenant enterprise_corp' });
  assert.equal(handler.canHandle(ctx), true);

  const res = await handler.handle(ctx);
  assert.equal(res.handled, true);
  assert.ok(res.replyText?.includes('enterprise_corp'));
});

test('BibleHandler: matches scripture commands', async () => {
  const handler = new BibleHandler();
  const ctx = createMockContext({ text: 'прочитай Иоанна 3:16', lowerText: 'прочитай иоанна 3:16' });
  assert.equal(handler.canHandle(ctx), true);
});

test('SmartPlannerHandler: matches goal and briefing commands', async () => {
  const handler = new SmartPlannerHandler();
  const ctx = createMockContext({ text: 'мои задачи', lowerText: 'мои задачи' });
  assert.equal(handler.canHandle(ctx), true);

  const briefingCtx = createMockContext({ text: 'смарт брифинг', lowerText: 'смарт брифинг' });
  assert.equal(handler.canHandle(briefingCtx), true);
});

test('RAGHandler: matches document query commands', async () => {
  const handler = new RAGHandler();
  const ctx = createMockContext({ text: 'найди: отчет за квартал', lowerText: 'найди: отчет за квартал' });
  assert.equal(handler.canHandle(ctx), true);
});

test('SubscriptionHandler: matches subscription commands', async () => {
  const handler = new SubscriptionHandler();
  const ctx = createMockContext({ text: '/sub', lowerText: '/sub' });
  assert.equal(handler.canHandle(ctx), true);

  const res = await handler.handle(ctx);
  assert.equal(res.handled, true);
  assert.ok(res.replyText?.includes('подписка'));
});

test('NavigationHandler: handles routes and coordinates', async () => {
  const handler = new NavigationHandler();
  const ctx = createMockContext({ text: 'маршрут Красная Площадь', lowerText: 'маршрут красная площадь' });
  assert.equal(handler.canHandle(ctx), true);

  const res = await handler.handle(ctx);
  assert.equal(res.handled, true);
  assert.ok(res.replyText?.includes('Маршрут'));
});

test('ImageGenHandler: parses prompt and returns URL', async () => {
  const handler = new ImageGenHandler();
  const ctx = createMockContext({ text: 'нарисуй космос', lowerText: 'нарисуй космос' });
  assert.equal(handler.canHandle(ctx), true);

  const res = await handler.handle(ctx);
  assert.equal(res.handled, true);
  assert.ok(res.replyText?.includes('pollinations.ai'));
});

test('OwnerCommandHandler: restricts non-owner access', async () => {
  const handler = new OwnerCommandHandler();
  const nonOwnerCtx = createMockContext({ text: '/status', lowerText: '/status', isOwner: false });
  assert.equal(handler.canHandle(nonOwnerCtx), false);

  const ownerCtx = createMockContext({ text: '/status', lowerText: '/status', isOwner: true });
  assert.equal(handler.canHandle(ownerCtx), true);

  const res = await handler.handle(ownerCtx);
  assert.equal(res.handled, true);
  assert.ok(res.replyText?.includes('Панель владельца'));
});
