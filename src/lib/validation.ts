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

/** Assignable team roles (everything except `owner` — ownership transfer is out
 * of scope). Keep in sync with the `team_role` enum in the DB. */
export const assignableRoleSchema = z.enum(['manager', 'support', 'coach', 'dietician']);
export type AssignableRole = z.infer<typeof assignableRoleSchema>;

/** Invite a team member. No password: the member sets their own via an emailed
 * invite link, so we only collect who they are and their role. */
export const teamInviteSchema = z.object({
  email: emailSchema,
  role: assignableRoleSchema,
  name: z.string().min(1).max(120),
});
export type TeamInviteInput = z.infer<typeof teamInviteSchema>;

/** Display-only profile fields + role/active flag an owner can edit. Every
 * field is optional so the same endpoint serves role changes and profile edits;
 * `role` is bounded to non-owner roles (ownership transfer is out of scope). */
export const specialtyTagSchema = z.string().trim().min(1).max(40);

export const teamMemberUpdateSchema = z
  .object({
    role: assignableRoleSchema.optional(),
    isActive: z.boolean().optional(),
    profilePhotoUrl: z.string().url().max(2048).nullish(),
    specialtyTags: z.array(specialtyTagSchema).max(20).optional(),
    bio: z.string().max(1000).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type TeamMemberUpdateInput = z.infer<typeof teamMemberUpdateSchema>;

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

/** Bulk client import. Rows are validated individually server-side so one bad
 * row doesn't reject the whole file; here we only bound the batch size. */
export const clientImportSchema = z.object({
  clients: z.array(z.unknown()).min(1).max(1000),
});
export type ClientImportInput = z.infer<typeof clientImportSchema>;

export const healthFormSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});
export type HealthFormInput = z.infer<typeof healthFormSchema>;

/** Tenant branding stored in `tenants.branding` (jsonb). All fields optional. */
const hrefSchema = z
  .string()
  .max(2000)
  .refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//.test(v), {
    message: 'Use an in-app path (e.g. /app/shop) or a full https:// URL',
  });

export const MAX_HERO_CARDS = 5;

export const heroCardSchema = z.object({
  imageUrl: z.string().url().max(2000).or(z.literal('')).optional(),
  title: z.string().max(80).optional(),
  subtitle: z.string().max(160).optional(),
  ctaLabel: z.string().max(40).optional(),
  ctaHref: hrefSchema.optional(),
});

export const brandingSchema = z.object({
  logoUrl: z.string().url().max(2000).or(z.literal('')).optional(),
  primaryColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, { message: 'Use a 6-digit hex colour, e.g. #FF5A1F' })
    .optional(),
  tagline: z.string().max(160).optional(),
  heroCards: z.array(heroCardSchema).max(MAX_HERO_CARDS).optional(),
});
export type BrandingInput = z.infer<typeof brandingSchema>;

/** Owner-editable business/branding settings (all fields optional). */
export const settingsUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    subdomain: subdomainSchema.optional(),
    branding: brandingSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.subdomain !== undefined || v.branding !== undefined, {
    message: 'Provide at least one field to update',
  });
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

/**
 * Owner connecting their own Razorpay account. All three values are required so
 * checkout, refunds and webhook verification all work from the same account.
 * The key id is a Razorpay publishable id (rzp_test_… / rzp_live_…).
 */
export const razorpayConnectSchema = z.object({
  keyId: z
    .string()
    .trim()
    .regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, {
      message: 'Key ID must look like rzp_test_… or rzp_live_…',
    }),
  keySecret: z.string().trim().min(8, { message: 'Key secret looks too short' }).max(256),
  webhookSecret: z.string().trim().min(6, { message: 'Webhook secret looks too short' }).max(256),
});
export type RazorpayConnectInput = z.infer<typeof razorpayConnectSchema>;

/** Owner connecting a tenant Resend account for automation emails. */
export const emailProviderConnectSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^re_[A-Za-z0-9_\-]+$/, { message: 'Resend API key must start with re_' })
    .max(256),
  fromEmail: z.string().trim().email().max(320),
  fromName: z.string().trim().max(120).optional(),
});
export type EmailProviderConnectInput = z.infer<typeof emailProviderConnectSchema>;

/** Recipient for the owner-only provider connection test. */
export const emailProviderTestSchema = z.object({
  recipient: z.string().trim().email().max(320),
});
export type EmailProviderTestInput = z.infer<typeof emailProviderTestSchema>;

/** A client editing their own account (PWA profile). */
export const clientProfileUpdateSchema = z
  .object({
    fullName: z.string().min(1).max(120).optional(),
    phone: z.string().max(32).optional(),
  })
  .refine((v) => v.fullName !== undefined || v.phone !== undefined, {
    message: 'Provide at least one field to update',
  });
export type ClientProfileUpdateInput = z.infer<typeof clientProfileUpdateSchema>;

// --- Phase 2: commerce ---

const amountMinorSchema = z.number().int().min(0);
const currencySchema = z.string().length(3).toUpperCase().default('INR');

/** Admin-authored social proof shown on the client-facing product card. */
export const testimonialSchema = z.string().trim().min(1).max(280);

export const productCreateSchema = z.object({
  type: z.enum(['course', 'live_class', 'consultation', 'merch']),
  name: z.string().min(1).max(160),
  description: z.string().max(4000).optional(),
  amountMinor: amountMinorSchema,
  currency: currencySchema,
  billingCycle: z
    .enum(['one_time', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .default('one_time'),
  capacity: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
  // Client-facing merchandising (display only).
  imageUrl: z.string().url().max(2048).nullish(),
  testimonials: z.array(testimonialSchema).max(2).optional(),
  isBestseller: z.boolean().optional(),
  hasTrial: z.boolean().optional(),
  trialPriceMinor: amountMinorSchema.nullish(),
  trialDurationDays: z.number().int().positive().max(3650).nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = productCreateSchema.partial();
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const orderCreateSchema = z.object({
  productId: z.string().uuid(),
  // Optional: team members may create an order on behalf of a client. When a
  // client checks out, this is ignored and their own client row is used.
  clientId: z.string().uuid().optional(),
});
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

export const refundSchema = z.object({
  // Omit for a full refund; supply an amount (minor units) for a partial one.
  amountMinor: amountMinorSchema.optional(),
});
export type RefundInput = z.infer<typeof refundSchema>;

// --- Phase 3a: consultation booking ---

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
  message: 'Time must be HH:MM or HH:MM:SS (24h)',
});

export const bookingSettingsSchema = z.object({
  timezone: z.string().min(1).max(64).optional(),
  slotMinutes: z.number().int().min(5).max(480).optional(),
  bufferMinutes: z.number().int().min(0).max(240).optional(),
  minNoticeMinutes: z.number().int().min(0).optional(),
  cancelCutoffMinutes: z.number().int().min(0).optional(),
});
export type BookingSettingsInput = z.infer<typeof bookingSettingsSchema>;

export const availabilityCreateSchema = z
  .object({
    teamMemberId: z.string().uuid(),
    weekday: z.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
export type AvailabilityCreateInput = z.infer<typeof availabilityCreateSchema>;

export const bookingCreateSchema = z.object({
  teamMemberId: z.string().uuid(),
  slotStart: z.string().datetime({ offset: true }),
  productId: z.string().uuid().optional(),
  // Team members may book on behalf of a client; clients book for themselves.
  clientId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

export const bookingUpdateSchema = z
  .object({
    slotStart: z.string().datetime({ offset: true }).optional(),
    status: z.enum(['cancelled', 'completed', 'no_show']).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => v.slotStart !== undefined || v.status !== undefined || v.notes !== undefined, {
    message: 'Provide slotStart, status or notes',
  });
export type BookingUpdateInput = z.infer<typeof bookingUpdateSchema>;

// --- Phase 3b: class management ---

export const classCreateSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(4000).optional(),
  instructorId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  capacity: z.number().int().positive().optional(),
  isRecorded: z.boolean().default(false),
});
export type ClassCreateInput = z.infer<typeof classCreateSchema>;

export const classUpdateSchema = z
  .object({
    title: z.string().min(1).max(160).optional(),
    description: z.string().max(4000).nullable().optional(),
    instructorId: z.string().uuid().nullable().optional(),
    productId: z.string().uuid().nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
    isRecorded: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });
export type ClassUpdateInput = z.infer<typeof classUpdateSchema>;

export const classSessionCreateSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    liveLink: z.string().url().max(2000).optional(),
    recordingUrl: z.string().url().max(2000).optional(),
    capacity: z.number().int().positive().optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
export type ClassSessionCreateInput = z.infer<typeof classSessionCreateSchema>;

export const classSessionUpdateSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
    liveLink: z.string().url().max(2000).nullable().optional(),
    recordingUrl: z.string().url().max(2000).nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' })
  .refine(
    (v) => v.startsAt === undefined || v.endsAt === undefined || new Date(v.endsAt) > new Date(v.startsAt),
    { message: 'endsAt must be after startsAt', path: ['endsAt'] },
  );
export type ClassSessionUpdateInput = z.infer<typeof classSessionUpdateSchema>;

// --- Unified offering (product + linked class/batch in one form) ---

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const weekdaySchema = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof weekdaySchema>;

/** "HH:MM" 24-hour local time (the recurring class time, not a dated session). */
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

/** Recurring weekly schedule stored on the class row's `schedule` jsonb. */
export const classScheduleSchema = z.object({
  days: z.array(weekdaySchema).max(7).optional(),
  startTime: timeOfDaySchema.optional(),
  endTime: timeOfDaySchema.optional(),
  accessLink: z.string().url().max(2000).optional(),
});
export type ClassScheduleInput = z.infer<typeof classScheduleSchema>;

/**
 * One batch (class) under an offering: its own instructor, live/recorded flag,
 * recurring schedule and capacity. `id` is present when editing an existing
 * batch; `isDefault` marks the batch clients are auto-assigned to after 24h.
 */
export const offeringBatchSchema = z
  .object({
    id: z.string().uuid().optional(),
    classType: z.enum(['live', 'recorded']).default('live'),
    instructorId: z.string().uuid().optional(),
    capacity: z.number().int().positive().optional(),
    schedule: classScheduleSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine(
    (v) =>
      !v.schedule?.startTime ||
      !v.schedule?.endTime ||
      v.schedule.endTime > v.schedule.startTime,
    { message: 'End time must be after start time.', path: ['schedule', 'endTime'] },
  );
export type OfferingBatchInput = z.infer<typeof offeringBatchSchema>;

/**
 * One comprehensive form that provisions the sellable product (shown in the
 * store, with merchandising) and one or more linked batches (classes). When a
 * product has multiple batches, the buyer picks one after payment. Free
 * offerings carry a zero price.
 */
export const offeringCreateSchema = z
  .object({
    name: z.string().min(1).max(160),
    description: z.string().max(4000).optional(),
    pricingType: z.enum(['paid', 'free']).default('paid'),
    amountMinor: amountMinorSchema.optional(),
    currency: currencySchema,
    billingCycle: z
      .enum(['one_time', 'weekly', 'monthly', 'quarterly', 'yearly'])
      .default('one_time'),
    isActive: z.boolean().default(true),
    batches: z.array(offeringBatchSchema).min(1).max(20),
    // Client-facing merchandising (mirrors productCreateSchema).
    imageUrl: z.string().url().max(2048).nullish(),
    testimonials: z.array(testimonialSchema).max(2).optional(),
    isBestseller: z.boolean().optional(),
    hasTrial: z.boolean().optional(),
    trialPriceMinor: amountMinorSchema.nullish(),
    trialDurationDays: z.number().int().positive().max(3650).nullish(),
  })
  .refine((v) => v.pricingType === 'free' || (v.amountMinor ?? 0) > 0, {
    message: 'Enter a price, or mark the offering as free.',
    path: ['amountMinor'],
  })
  .refine((v) => v.batches.filter((b) => b.isDefault).length <= 1, {
    message: 'Only one batch can be the default.',
    path: ['batches'],
  });
export type OfferingCreateInput = z.infer<typeof offeringCreateSchema>;

export const offeringUpdateSchema = offeringCreateSchema;
export type OfferingUpdateInput = z.infer<typeof offeringUpdateSchema>;

/** Client picks a batch for a product they've paid for. */
export const batchSelectionSchema = z.object({
  productId: z.string().uuid(),
  classId: z.string().uuid(),
});
export type BatchSelectionInput = z.infer<typeof batchSelectionSchema>;

export const enrollmentCreateSchema = z.object({
  clientId: z.string().uuid(),
  status: z.enum(['active', 'cancelled', 'completed']).optional(),
});
export type EnrollmentCreateInput = z.infer<typeof enrollmentCreateSchema>;

export const enrollmentUpdateSchema = z.object({
  status: z.enum(['active', 'cancelled', 'completed']),
});
export type EnrollmentUpdateInput = z.infer<typeof enrollmentUpdateSchema>;

export const attendanceMarkSchema = z.object({
  clientId: z.string().uuid(),
  status: z.enum(['registered', 'present', 'absent', 'late', 'excused']),
});
export type AttendanceMarkInput = z.infer<typeof attendanceMarkSchema>;

// --- Phase 4: automation ---

export const AUTOMATION_TRIGGER_VALUES = [
  'client_signup',
  'health_form_submitted',
  'payment_success',
  'payment_failed',
  'subscription_renewal_due',
  'subscription_expired',
  'booking_created',
  'booking_reminder',
  'class_reminder',
  'client_churned',
] as const;

const automationTemplateSchema = z.object({
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
});

/** Upsert one automation rule (unique per tenant/trigger/channel). */
export const automationRuleUpsertSchema = z.object({
  triggerType: z.enum(AUTOMATION_TRIGGER_VALUES),
  channel: z.enum(['whatsapp', 'email']),
  enabled: z.boolean().default(true),
  template: automationTemplateSchema,
});
export type AutomationRuleUpsertInput = z.infer<typeof automationRuleUpsertSchema>;
