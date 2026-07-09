import type { Database } from '@/lib/database.types';

/** Row/response shapes shared between admin client components and the API. */

export type Client = Database['public']['Tables']['clients']['Row'];
export type ClientStatus = Database['public']['Enums']['client_status'];
export type HealthForm = Database['public']['Tables']['health_forms']['Row'];
export type TeamRole = Database['public']['Enums']['team_role'];

export type TeamMemberStatus = 'active' | 'invited' | 'inactive';

/** `GET /api/team` enriches each membership with the auth user's email/name,
 * a derived status badge, and how many classes they instruct. */
export type TeamMember = Database['public']['Tables']['team_members']['Row'] & {
  email: string | null;
  name: string | null;
  isSelf: boolean;
  status: TeamMemberStatus;
  classCount: number;
};

/** A class summary shown on a team member's detail page. */
export type TeamMemberClass = Pick<
  Database['public']['Tables']['classes']['Row'],
  'id' | 'title' | 'is_recorded' | 'created_at'
>;

/** `GET /api/team/[id]` → the member (with email/name/status) + their classes. */
export type TeamMemberDetail = {
  teamMember: Omit<TeamMember, 'classCount'>;
  classes: TeamMemberClass[];
};

// --- Settings (branding, plan, connections) ---

export type Tenant = Database['public']['Tables']['tenants']['Row'];
export type Plan = Database['public']['Tables']['plans']['Row'];

/** Branding blob stored in `tenants.branding` (jsonb). */
export type Branding = {
  logoUrl?: string;
  primaryColor?: string;
  tagline?: string;
};

/** Razorpay connection status for Settings (never includes secrets). */
export type RazorpayStatus = {
  /** True when checkout can run: a tenant account or deployment env keys. */
  configured: boolean;
  /** Where the active config comes from, or null when unconfigured. */
  source: 'tenant' | 'env' | null;
  /** Masked publishable key id, e.g. "rzp_test_••••C0dE", or null. */
  keyIdMasked: string | null;
  /** 'test' | 'live' inferred from the key id prefix, or null. */
  mode: 'test' | 'live' | null;
  /** False when SETTINGS_ENCRYPTION_KEY is missing (can't store tenant keys). */
  encryptionReady: boolean;
};

/** `GET /api/settings` → business profile, plan, usage and connection status. */
export type SettingsResponse = {
  tenant: Pick<Tenant, 'id' | 'name' | 'subdomain'> & { branding: Branding };
  plan: Plan | null;
  usage: { clientCount: number; teamCount: number };
  razorpay: RazorpayStatus;
};

/** `GET /api/me` → the signed-in client's own account. */
export type MeResponse = {
  client: { id: string; full_name: string; email: string | null; phone: string | null };
  tenant: { name: string } | null;
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

// --- Classes (Phase 3b) ---

export type ClassRow = Database['public']['Tables']['classes']['Row'];
export type ClassSession = Database['public']['Tables']['class_sessions']['Row'];
export type Enrollment = Database['public']['Tables']['enrollments']['Row'];
export type EnrollmentStatus = Database['public']['Enums']['enrollment_status'];
export type AttendanceRow = Database['public']['Tables']['attendance']['Row'];
export type AttendanceStatus = Database['public']['Enums']['attendance_status'];

/** `GET /api/classes` enriches each class for the admin view. */
export type ClassWithRelations = ClassRow & {
  instructor: { id: string; name: string } | null;
  product: Product | null;
  sessions: ClassSession[];
  enrollmentCount: number;
};

/** Recurring weekly schedule persisted in `classes.schedule` (jsonb). */
export type OfferingSchedule = {
  days?: string[];
  startTime?: string | null;
  endTime?: string | null;
  accessLink?: string | null;
};

/** A batch (class) within an offering, enriched for the admin view. */
export type OfferingBatch = ClassRow & {
  instructor: { id: string; name: string } | null;
  sessions?: ClassSession[];
  enrollments?: { count: number }[];
};

/** `GET /api/offerings` → a store product with its batches (classes). */
export type Offering = Product & { batches: OfferingBatch[] };

/** `GET /api/classes/[id]/enrollments` → each enrollment with its client. */
export type EnrollmentWithClient = Enrollment & {
  client: { full_name: string; email: string | null } | null;
};

/** `GET /api/class-sessions/[id]/attendance` → one row per enrolled client. */
export type AttendanceEntry = {
  clientId: string;
  fullName: string;
  status: AttendanceStatus;
  attendanceId: string | null;
  markedAt: string | null;
};

/** A time-gated session for the client PWA (live link hidden until live). */
export type ClientSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  isLive: boolean;
  liveLink: string | null;
  recordingUrl: string | null;
};

/** `GET /api/my-classes` → a client's enrolled classes with gated sessions. */
export type ClientClass = {
  id: string;
  title: string;
  description: string | null;
  isRecorded: boolean;
  instructorName: string | null;
  enrollmentStatus: EnrollmentStatus;
  sessions: ClientSession[];
};

// --- Automation (Phase 4) ---

export type AutomationRule = Database['public']['Tables']['automation_rules']['Row'];
export type AutomationTrigger = Database['public']['Enums']['automation_trigger'];
export type AutomationChannel = Database['public']['Enums']['automation_channel'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type NotificationStatus = Database['public']['Enums']['notification_status'];

export const ENROLLMENT_STATUSES: EnrollmentStatus[] = ['active', 'cancelled', 'completed'];

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'registered',
  'present',
  'absent',
  'late',
  'excused',
];

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
