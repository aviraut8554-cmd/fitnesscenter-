// Dummy env defaults so modules that validate `@/lib/env` at import time can be
// unit-tested in isolation. Only set when not already provided, so real config
// (CI, local .env) always wins. These never reach a real service.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET ||= 'rzp_test_secret';
process.env.RAZORPAY_WEBHOOK_SECRET ||= 'whsec_test';
process.env.SETTINGS_ENCRYPTION_KEY ||=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
