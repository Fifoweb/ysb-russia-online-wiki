import { supabase } from './supabase';
import type { AchievementId, AchievementDepartment } from '../data/achievements';

export interface AchievementProgress {
  id: AchievementId;
  target: number;
  value: number;
  reports: number;
  departments: Record<AchievementDepartment, { value: number; reports: number }>;
}
export interface AchievementDashboardData {
  weekStart: string;
  currentWeekStart: string;
  weekEndsAt: string;
  generatedAt: string;
  reports: number;
  contributors: number;
  departments: number;
  lastReportAt: string | null;
  items: AchievementProgress[];
  days: { date: string; reports: number }[];
}
export async function fetchAchievementDashboard(weekStart: string, signal: AbortSignal): Promise<AchievementDashboardData> {
  if (!supabase) throw new Error('Сервис ачивок не настроен.');
  const { data, error } = await supabase.rpc('get_achievement_dashboard', { p_week_start: weekStart }).abortSignal(signal);
  if (error || !data || !Array.isArray(data.items)) throw new Error('Не удалось загрузить прогресс ачивок.');
  return data as AchievementDashboardData;
}
export function achievementCompletion(value: number, target: number): number {
  return Math.max(0, Math.min(100, value / target * 100));
}
export function formatAchievementValue(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}
