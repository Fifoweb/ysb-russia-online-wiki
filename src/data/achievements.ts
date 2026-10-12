export { achievementDepartments, achievementGoals, getAchievementGoalsForWeek, achievementWeekStart, addAchievementDays, moscowDate,
  parseAchievementEvidence, validateAchievementSubmission, type AchievementId, type AchievementDepartment }
  from '../../supabase/functions/_shared/achievements';

export const achievementPublicationRules = [
  'На скриншоте или видео должны быть видны HUD сервера, дата и время.',
  'Повторное использование скриншотов и видео запрещено.',
  'В ветках отчётов запрещено ставить реакции.',
  'Работа и доказательства должны относиться к текущей неделе, до воскресенья 23:59 по Москве.',
  'Дашборд обнуляется в понедельник в 00:00 МСК. Новые данные учитываются с 00:01.',
];
