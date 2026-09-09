import { logger } from "../logger";

export interface Criterion {
  id: number;
  name: string;
  description: string;
}

export const CRITERIA_LIST: Criterion[] = [
  { id: 1, name: "Награды", description: "Наличие национальных или международных наград за выдающиеся результаты." },
  { id: 2, name: "Членство", description: "Членство в престижных ассоциациях, требующих достижений для вступления." },
  { id: 3, name: "СМИ о вас", description: "Публикации о вашей профессиональной деятельности в крупных изданиях." },
  { id: 4, name: "Судейство", description: "Опыт оценки работы коллег (членство в жюри, рецензирование, экспертиза)." },
  { id: 5, name: "Вклад", description: "Оригинальный вклад высокой значимости в развитие вашей сферы." },
  { id: 6, name: "Статьи", description: "Наличие авторских статей или научных публикаций в профильных медиа." },
  { id: 7, name: "Лидерство", description: "Ключевая или руководящая роль в организациях с высокой репутацией." },
  { id: 8, name: "Высокий доход", description: "Заработная плата или вознаграждение существенно выше среднего уровня." },
  { id: 9, name: "Коммерческий успех", description: "Подтвержденный коммерческий или финансовый успех ваших проектов." }
];

export interface ScoreQuestion {
  id: number;
  text: string;
  associatedCriteria: number[];
}

export const SCORING_QUESTIONS: ScoreQuestion[] = [
  { id: 1, text: "Получали ли вы профессиональные награды, премии или призы за выдающиеся достижения?", associatedCriteria: [1] },
  { id: 2, text: "Состоите ли вы в профессиональных ассоциациях или сообществах, куда принимают на основе высоких достижений?", associatedCriteria: [2] },
  { id: 3, text: "Писали ли о вас, вашей работе или ваших проектах в СМИ, профессиональных журналах или крупных блогах?", associatedCriteria: [3] },
  { id: 4, text: "Приглашали ли вас оценивать работу других экспертов в качестве судьи, рецензента, эксперта или члена жюри?", associatedCriteria: [4] },
  { id: 5, text: "Есть ли у вас авторские патенты, статьи, научные публикации или оригинальный вклад высокой важности в вашей сфере?", associatedCriteria: [5, 6] },
  { id: 6, text: "Занимаете ли вы ключевую/лидирующую роль в вашей компании, имеете ли высокий доход или коммерческий успех проектов?", associatedCriteria: [7, 8, 9] }
];

export interface ScoringResult {
  score: number;
  metCriteriaIds: number[];
  missingCriteriaIds: number[];
  recommendedProgram: string;
  report: string;
}

export function evaluateAnswers(answers: Record<number, boolean>): ScoringResult {
  const metCriteriaIds: number[] = [];

  for (const question of SCORING_QUESTIONS) {
    const answeredYes = !!answers[question.id];
    if (answeredYes) {
      metCriteriaIds.push(...question.associatedCriteria);
    }
  }

  // Remove duplicates
  const uniqueMet = Array.from(new Set(metCriteriaIds)).sort((a, b) => a - b);
  const score = uniqueMet.length; // Score from 0 to 9

  const missingCriteriaIds = CRITERIA_LIST.map(c => c.id).filter(id => !uniqueMet.includes(id));

  let recommendedProgram = "";
  if (score >= 6) {
    recommendedProgram = "EB-1A (Виза экстраординарных способностей)";
  } else if (score >= 3) {
    recommendedProgram = "EB-2 NIW (National Interest Waiver) / O-1 (Виза талантов)";
  } else {
    recommendedProgram = "O-1 (Подготовка профиля / Менторство)";
  }

  // Build a nice text report
  const metText = uniqueMet.length > 0 
    ? uniqueMet.map(id => `- ${CRITERIA_LIST.find(c => c.id === id)?.name}`).join("\n")
    : "Критерии не соответствуют";

  const missingText = missingCriteriaIds.length > 0
    ? missingCriteriaIds.map(id => `- ${CRITERIA_LIST.find(c => c.id === id)?.name} (${CRITERIA_LIST.find(c => c.id === id)?.description})`).join("\n")
    : "Нет пропущенных критериев, отличный результат!";

  const report = `📊 **Ваш отчет по оценке профиля**
Итоговый балл: **${score} из 9**

⭐ **Соответствующие критерии:**
${metText}

⚠️ **Рекомендуется доработать (пропущенные критерии):**
${missingText}

🎯 **Рекомендованная программа:** **${recommendedProgram}**
Каждый кейс индивидуален. Запишитесь на подробный разбор с Катериной для составления дорожной карты.`;

  logger.info(`[Scoring] Score calculated: ${score}/9. Recommendation: ${recommendedProgram}`);

  return {
    score,
    metCriteriaIds: uniqueMet,
    missingCriteriaIds,
    recommendedProgram,
    report
  };
}
