import type { Database } from '@/lib/database.types';

/** Row/response shapes shared between admin client components and the API. */

export type Client = Database['public']['Tables']['clients']['Row'];
export type ClientStatus = Database['public']['Enums']['client_status'];
export type HealthForm = Database['public']['Tables']['health_forms']['Row'];
export type TeamRole = Database['public']['Enums']['team_role'];

/** `GET /api/team` enriches each membership with the auth user's email/name. */
export type TeamMember = Database['public']['Tables']['team_members']['Row'] & {
  email: string | null;
  name: string | null;
  isSelf: boolean;
};

export const CLIENT_STATUSES: ClientStatus[] = [
  'trial',
  'active',
  'renewal_due',
  'expired',
  'churned',
];
