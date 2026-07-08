import { z } from 'zod';

/**
 * Environment configuration, validated once at module load. Import `env` for
 * server-side secrets and `publicEnv` for values safe to expose to the client.
 * No secret is ever hard-coded; everything comes from the environment.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SENTRY_DSN: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Razorpay (Phase 2). Optional at load so the app boots without payments
  // configured; payment routes fail loudly via requireRazorpayConfig() when a
  // value is missing.
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Phase 4 automation. All optional: when a channel's provider is not
  // configured the dispatcher runs in dry-run/log mode instead of sending.
  // Email (Resend-compatible HTTP API).
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  // WhatsApp (Meta Cloud API).
  WHATSAPP_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_ID: z.string().min(1).optional(),
  // Shared secret guarding the reminders cron endpoint. When set, callers must
  // send `Authorization: Bearer <CRON_SECRET>`.
  CRON_SECRET: z.string().min(1).optional(),
  // Symmetric key (32 bytes, hex or base64) used to encrypt per-tenant payment
  // provider secrets at rest (AES-256-GCM). Optional at load so the app boots
  // without it; saving/reading tenant Razorpay keys fails loudly when unset.
  SETTINGS_ENCRYPTION_KEY: z.string().min(1).optional(),
});

const publicSchema = serverSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
});

function parse<T extends z.ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}

export const env = parse(serverSchema, process.env);

export const publicEnv = parse(publicSchema, process.env);
