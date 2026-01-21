import { POST } from '@/web/common/api/request';
import type { GetTeamDashboardBody, TeamDashboardRes } from '@/pages/api/core/statistics/dashboard';
import type { AppTrendRes, GetAppTrendBody } from '@/pages/api/core/statistics/appTrend';

export const getTeamDashboardStats = (data: GetTeamDashboardBody) =>
  POST<TeamDashboardRes>('/core/statistics/dashboard', data);

export const getAppTrend = (data: GetAppTrendBody) =>
  POST<AppTrendRes>('/core/statistics/appTrend', data);
