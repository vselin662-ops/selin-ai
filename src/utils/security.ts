/**
 * Recursively masks PII (Personally Identifiable Information) fields in an object
 * to prevent leaking sensitive user data (names, phones, locations, emails) in system logs.
 */
export function maskPII(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => maskPII(item));
  }

  if (typeof obj === "object") {
    const masked: any = {};
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      const value = obj[key];
      if (
        lowerKey === "name" ||
        lowerKey === "phone" ||
        lowerKey === "location" ||
        lowerKey === "lat" ||
        lowerKey === "lon" ||
        lowerKey === "email" ||
        lowerKey === "username" ||
        lowerKey === "user_name" ||
        lowerKey === "phonenumber" ||
        lowerKey === "phone_number" ||
        (lowerKey === "chat_id" && typeof value === "string" && isNaN(Number(value)))
      ) {
        masked[key] = "***";
      } else {
        masked[key] = maskPII(value);
      }
    }
    return masked;
  }

  return obj;
}

/**
 * Маскирует чувствительные данные (152-ФЗ): телефоны, номера карт, email
 */
export function scrubTextPII(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    // Банковские карты (16 цифр)
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[КАРТА СМЫТА]')
    // Российские телефоны (+7 / 8 ...)
    .replace(/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, '[ТЕЛЕФОН СМЫТ]')
    // Email адреса
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL СМЫТ]');
}
