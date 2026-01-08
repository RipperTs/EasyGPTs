import { POST } from '@/web/common/api/request';
import type { GetTeamDashboardBody, TeamDashboardRes } from '@/pages/api/core/statistics/dashboard';

export const getTeamDashboardStats = (data: GetTeamDashboardBody) =>
  POST<TeamDashboardRes>('/core/statistics/dashboard', data);
