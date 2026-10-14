import { supabase } from './supabase';
import type { AchievementId, AchievementDepartment } from '../data/achievements';

export interface AchievementProgress {
  id: AchievementId;
  target: number;
  value: number;
  reports: number;
  closed?: boolean;
  remaining?: number | null;
  pendingReports?: number;
  departments: Record<AchievementDepartment, { value: number; reports: number }>;
}
export interface AchievementDashboardData {
  weekStart: string;
  currentWeekStart: string;
  availableWeeks?: string[];
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
export function achievementAvailability(progress: AchievementProgress | undefined, metric: string) {
  const closed = Boolean(progress && (progress.closed || progress.value >= progress.target));
  const remaining = metric === 'average' ? null : progress
    ? Math.max(0, Math.floor(progress.remaining ?? progress.target - progress.value)) : null;
  const pending = !closed && Boolean((progress?.pendingReports ?? 0) > 0) && (metric === 'average' || remaining === 0);
  return { closed, pending, remaining };
}
export function formatAchievementValue(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}
