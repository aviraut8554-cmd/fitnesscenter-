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

// --- Commerce (products, orders, payments, invoices) ---

export type Product = Database['public']['Tables']['products_services']['Row'];
export type ProductType = Database['public']['Enums']['product_type'];
export type BillingCycle = Database['public']['Enums']['billing_cycle'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderStatus = Database['public']['Enums']['order_status'];
export type Invoice = Database['public']['Tables']['invoices']['Row'];

/** `GET /api/orders` enriches each order with its client, product and invoices. */
export type OrderWithRelations = Order & {
  client: { full_name: string; email: string | null } | null;
  product: { name: string; type: ProductType } | null;
  invoices: Pick<Invoice, 'number' | 'status' | 'issued_at'>[];
};

/** `GET /api/orders` returns the Razorpay checkout payload alongside the order. */
export type OrderCheckout = {
  razorpayOrderId: string;
  keyId: string;
  amountMinor: number;
  currency: string;
};

/** Shape of `GET /api/revenue` → `{ revenue }`. */
export type RevenueSummary = {
  currency: string;
  grossMinor: number;
  refundedMinor: number;
  netMinor: number;
  capturedCount: number;
  refundedCount: number;
  failedCount: number;
};

// --- Bookings (consultations) ---

export type Booking = Database['public']['Tables']['bookings']['Row'];
export type BookingStatus = Database['public']['Enums']['booking_status'];
export type AvailabilityRule = Database['public']['Tables']['availability_rules']['Row'];
export type BookingSettingsRow = Database['public']['Tables']['booking_settings']['Row'];

/** `GET /api/bookings` enriches each booking with client, product and coach. */
export type BookingWithRelations = Booking & {
  client: { full_name: string; email: string | null } | null;
  product: { name: string; type: ProductType } | null;
  team_member: { role: TeamRole } | null;
};

/** `GET /api/bookings/slots` → `{ slots }`. */
export type Slot = { start: string; end: string };

/** `GET /api/coaches` → minimal bookable-coach subset (no PII). */
export type Coach = { id: string; name: string; role: TeamRole };

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const PRODUCT_TYPES: ProductType[] = ['course', 'live_class', 'consultation', 'merch'];

export const BILLING_CYCLES: BillingCycle[] = [
  'one_time',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  course: 'Course',
  live_class: 'Live class',
  consultation: 'Consultation',
  merch: 'Merch',
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};
