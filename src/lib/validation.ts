import { z } from 'zod';

/** Matches the DB CHECK constraint on `tenants.subdomain`. */
export const subdomainSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/, {
    message: 'Subdomain may contain lowercase letters, digits and hyphens',
  });

export const emailSchema = z.string().email().max(320);
export const passwordSchema = z.string().min(8).max(128);

export const influencerSignupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(120),
  tenantName: z.string().min(1).max(120),
  subdomain: subdomainSchema,
  branding: z.record(z.string(), z.unknown()).optional(),
  planCode: z.string().min(1).max(40).optional(),
});
export type InfluencerSignupInput = z.infer<typeof influencerSignupSchema>;

export const clientSignupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().min(1).max(120),
  subdomain: subdomainSchema,
  phone: z.string().max(32).optional(),
});
export type ClientSignupInput = z.infer<typeof clientSignupSchema>;

export const teamInviteSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['manager', 'support']),
  name: z.string().min(1).max(120).optional(),
});
export type TeamInviteInput = z.infer<typeof teamInviteSchema>;

export const clientCreateSchema = z.object({
  fullName: z.string().min(1).max(120),
  email: emailSchema,
  phone: z.string().max(32).optional(),
  status: z.enum(['trial', 'active', 'renewal_due', 'expired', 'churned']).optional(),
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;

export const clientUpdateSchema = clientCreateSchema.partial();
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;

export const healthFormSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});
export type HealthFormInput = z.infer<typeof healthFormSchema>;
