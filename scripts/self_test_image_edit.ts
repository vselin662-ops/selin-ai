import { edit, isImageEditEnabled, setImageEditSetting, isImageEditRequest } from "../src/services/ImageEdit";
import { sqliteDb } from "../db";
import { logger } from "../src/logger";

async function runSelfTest() {
  console.log("=== STARTING SELF-TEST: 4 CASES FOR IMAGE EDITING ===");

  // Ensure IMAGE_EDIT is enabled for test
  setImageEditSetting('1');
  console.log(`[Config] IMAGE_EDIT enabled: ${isImageEditEnabled()}`);

  // Dummy 100KB JPEG image buffer
  const samplePhoto = Buffer.alloc(100 * 1024, 0xff);
  // 8MB image buffer for size limit test
  const large8MBPhoto = Buffer.alloc(8 * 1024 * 1024, 0xaa);

  // CASE 1: photo + "замени фон на ночной город"
  console.log("\n--- CASE 1: photo + 'замени фон на ночной город' ---");
  try {
    const res1 = await edit(samplePhoto, "image/jpeg", "замени фон на ночной город");
    console.log(`[Case 1 Result] ok=${res1.ok}, provider=${res1.provider}, error=${res1.error}, bufferLen=${res1.buffer?.length}`);
  } catch (err: any) {
    console.error(`[Case 1 Error] ${err?.message || err}`);
  }

  // CASE 2: photo + "сделай в стиле нуар"
  console.log("\n--- CASE 2: photo + 'сделай в стиле нуар' ---");
  try {
    const res2 = await edit(samplePhoto, "image/jpeg", "сделай в стиле нуар");
    console.log(`[Case 2 Result] ok=${res2.ok}, provider=${res2.provider}, error=${res2.error}, bufferLen=${res2.buffer?.length}`);
  } catch (err: any) {
    console.error(`[Case 2 Error] ${err?.message || err}`);
  }

  // CASE 3: photo 8MB
  console.log("\n--- CASE 3: photo 8MB ---");
  try {
    const res3 = await edit(large8MBPhoto, "image/jpeg", "замени фон на ночной город");
    console.log(`[Case 3 Result] ok=${res3.ok}, error=${res3.error}, message="${res3.message}"`);
  } catch (err: any) {
    console.error(`[Case 3 Error] ${err?.message || err}`);
  }

  // CASE 4: text-only "замени фон"
  console.log("\n--- CASE 4: text-only 'замени фон' ---");
  try {
    const textQuery = "замени фон";
    const isEditReq = isImageEditRequest(textQuery);
    console.log(`[Case 4 Match] isImageEditRequest("${textQuery}") = ${isEditReq}`);
    if (isEditReq) {
      const askPhotoMsg = "Чтобы изменить фон или отредактировать картинку, пожалуйста, пришлите само фото и напишите, что именно нужно изменить!";
      console.log(`[Case 4 Response] Brand-tone request for photo: "${askPhotoMsg}"`);
    }
  } catch (err: any) {
    console.error(`[Case 4 Error] ${err?.message || err}`);
  }

  console.log("\n=== SELF-TEST COMPLETE ===");
  process.exit(0);
}

runSelfTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
