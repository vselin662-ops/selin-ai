import dotenv from 'dotenv';
dotenv.config();

import { llmService } from '../src/core/LLMService';

async function runSelfTest() {
  console.log('=== STARTING 10-REQUEST STABILITY SELFTEST ===');
  const testChatId = `selftest_${Date.now()}`;
  const questions = [
    "Привет, как дела?",
    "Какой сегодня год?",
    "Сколько будет 7 умножить на 8?",
    "Что такое гравитация в двух словах?",
    "Назови столицу Франции",
    "Кто написал роман Война и мир?",
    "В чем разница между синхронным и асинхронным кодом?",
    "Какое расстояние до Луны?",
    "Назови три основных цвета",
    "Спасибо, ты отлично справился!"
  ];

  let successCount = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\n--- [Test ${i + 1}/10] Query: "${q}" ---`);
    const start = Date.now();
    try {
      const answer = await llmService.smartCall(testChatId, q);
      const elapsed = Date.now() - start;
      console.log(`[Result ${i + 1}/10] Latency: ${elapsed}ms`);
      console.log(`[Response ${i + 1}/10]: ${answer}`);
      if (answer && answer.length > 0) {
        successCount++;
      }
    } catch (err: any) {
      console.error(`[Error ${i + 1}/10]:`, err.message);
    }
  }

  console.log(`\n=== SELFTEST COMPLETED: ${successCount}/10 SUCCESSFUL ===`);
  if (successCount === 10) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSelfTest().catch(err => {
  console.error("Selftest fatal error:", err);
  process.exit(1);
});
