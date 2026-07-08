import type { Database } from '@/lib/database.types';

/**
 * Pure, client-safe automation metadata: trigger/channel enums, human labels,
 * documented template tokens, default templates and the `{{token}}` renderer.
 *
 * This module deliberately has NO server-only imports (no admin Supabase client,
 * no notifier, no `env`). The admin Automations UI is a client component and
 * imports from here; the server engine (`@/lib/automation`) re-exports these so
 * server code keeps a single import site.
 */

export type AutomationTrigger = Database['public']['Enums']['automation_trigger'];
export type AutomationChannel = Database['public']['Enums']['automation_channel'];

export const AUTOMATION_TRIGGERS: AutomationTrigger[] = [
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
];

export const AUTOMATION_CHANNELS: AutomationChannel[] = ['email', 'whatsapp'];

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  client_signup: 'Client signs up',
  health_form_submitted: 'Health form submitted',
  payment_success: 'Payment succeeded',
  payment_failed: 'Payment failed',
  subscription_renewal_due: 'Subscription renewal due',
  subscription_expired: 'Subscription expired',
  booking_created: 'Consultation booked',
  booking_reminder: 'Consultation reminder',
  class_reminder: 'Class reminder',
  client_churned: 'Client churned',
};

/**
 * The variables a template may reference for a given trigger. Documented here
 * so the admin UI can show the author which `{{tokens}}` are available.
 */
export const TRIGGER_VARIABLES: Record<AutomationTrigger, string[]> = {
  client_signup: ['clientName', 'businessName'],
  health_form_submitted: ['clientName', 'businessName'],
  payment_success: ['clientName', 'businessName', 'amount', 'productName'],
  payment_failed: ['clientName', 'businessName', 'amount', 'productName'],
  subscription_renewal_due: ['clientName', 'businessName', 'productName', 'renewalDate'],
  subscription_expired: ['clientName', 'businessName', 'productName'],
  booking_created: ['clientName', 'businessName', 'coachName', 'startTime'],
  booking_reminder: ['clientName', 'businessName', 'coachName', 'startTime'],
  class_reminder: ['clientName', 'businessName', 'className', 'instructorName', 'startTime'],
  client_churned: ['clientName', 'businessName'],
};

export interface Template {
  subject?: string;
  body: string;
}

/** Sensible starting templates so a new rule is useful before it's edited. */
export const DEFAULT_TEMPLATES: Record<AutomationTrigger, Template> = {
  client_signup: {
    subject: 'Welcome to {{businessName}}!',
    body: 'Hi {{clientName}}, welcome to {{businessName}}. We are excited to have you on board!',
  },
  health_form_submitted: {
    subject: 'Health form received',
    body: 'Hi {{clientName}}, thanks for submitting your health form. Your coach will review it shortly.',
  },
  payment_success: {
    subject: 'Payment received',
    body: 'Hi {{clientName}}, we received your payment of {{amount}} for {{productName}}. Thank you!',
  },
  payment_failed: {
    subject: 'Payment could not be processed',
    body: 'Hi {{clientName}}, your payment of {{amount}} for {{productName}} failed. Please try again.',
  },
  subscription_renewal_due: {
    subject: 'Your plan renews soon',
    body: 'Hi {{clientName}}, your {{productName}} plan renews on {{renewalDate}}. Keep up the great work!',
  },
  subscription_expired: {
    subject: 'Your plan has expired',
    body: 'Hi {{clientName}}, your {{productName}} plan has expired. Renew to keep training with us.',
  },
  booking_created: {
    subject: 'Your consultation is booked',
    body: 'Hi {{clientName}}, your consultation with {{coachName}} is confirmed for {{startTime}}.',
  },
  booking_reminder: {
    subject: 'Reminder: consultation soon',
    body: 'Hi {{clientName}}, this is a reminder for your consultation with {{coachName}} at {{startTime}}.',
  },
  class_reminder: {
    subject: 'Reminder: {{className}} soon',
    body: 'Hi {{clientName}}, your class {{className}} with {{instructorName}} starts at {{startTime}}.',
  },
  client_churned: {
    subject: 'We miss you',
    body: 'Hi {{clientName}}, we noticed you have not been active. We would love to have you back at {{businessName}}.',
  },
};

/** Replace `{{token}}` occurrences with values; unknown tokens become ''. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}
