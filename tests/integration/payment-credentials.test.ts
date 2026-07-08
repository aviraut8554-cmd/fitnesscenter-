import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createUser, supabaseReachable, uniq, userClient } from '../helpers/supabase';
import { resolveRazorpayConfig } from '@/lib/razorpay';
import { encryptSecret } from '@/lib/crypto';
import { razorpayStatusForTenant } from '@/lib/razorpay-status';

const reachable = await supabaseReachable();

const sub = (p: string) => uniq(p).toLowerCase().replace(/[^a-z0-9-]/g, '');

/**
 * Per-tenant payment credentials are the most sensitive rows in the schema.
 * They must be invisible to every user-scoped (RLS) client — even the tenant's
 * own owner — and reachable only via the service role. `resolveRazorpayConfig`
 * must prefer a tenant's connected account over the deployment env keys.
 */
describe.skipIf(!reachable)('tenant_payment_credentials RLS + resolution', () => {
  const admin = adminClient();
  let tenantId: string;
  let ownerEmail: string;

  beforeAll(async () => {
    ownerEmail = `${uniq('owner')}@example.com`;
    const ownerId = await createUser(ownerEmail);
    const t = await admin.rpc('provision_tenant', {
      p_owner_user_id: ownerId,
      p_name: 'Payments Tenant',
      p_subdomain: sub('pay'),
      p_plan_code: 'growth',
    });
    if (t.error) throw new Error(t.error.message);
    tenantId = t.data!.id;
  });

  it('the owner (RLS client) cannot read or write the credentials table', async () => {
    const supa = await userClient(ownerEmail);

    const read = await supa.from('tenant_payment_credentials').select('*').eq('tenant_id', tenantId);
    // No grant + RLS default-deny → empty result (or an error), never data.
    expect(read.data ?? []).toHaveLength(0);

    const write = await supa.from('tenant_payment_credentials').insert({
      tenant_id: tenantId,
      key_id: 'rzp_test_hacker',
      key_secret_enc: encryptSecret('x'),
      webhook_secret_enc: encryptSecret('y'),
    });
    expect(write.error).not.toBeNull();
  });

  it('the service role can upsert credentials and resolveRazorpayConfig prefers them', async () => {
    const ins = await admin.from('tenant_payment_credentials').upsert(
      {
        tenant_id: tenantId,
        key_id: 'rzp_test_TENANTKEY',
        key_secret_enc: encryptSecret('tenant_secret_value'),
        webhook_secret_enc: encryptSecret('tenant_webhook_value'),
      },
      { onConflict: 'tenant_id' },
    );
    expect(ins.error).toBeNull();

    const cfg = await resolveRazorpayConfig(admin, tenantId);
    expect(cfg.source).toBe('tenant');
    expect(cfg.keyId).toBe('rzp_test_TENANTKEY');
    expect(cfg.keySecret).toBe('tenant_secret_value');
    expect(cfg.webhookSecret).toBe('tenant_webhook_value');

    const status = await razorpayStatusForTenant(admin, tenantId);
    expect(status.configured).toBe(true);
    expect(status.source).toBe('tenant');
    expect(status.mode).toBe('test');
    // Masked key never reveals the full secret-bearing id middle section.
    expect(status.keyIdMasked).toContain('rzp_test_');
    expect(status.keyIdMasked).toContain('••••');
  });

  it('falls back to env keys after the tenant disconnects', async () => {
    const del = await admin.from('tenant_payment_credentials').delete().eq('tenant_id', tenantId);
    expect(del.error).toBeNull();

    const cfg = await resolveRazorpayConfig(admin, tenantId);
    // tests/setup.ts sets dummy env RAZORPAY_* keys, so env is the fallback.
    expect(cfg.source).toBe('env');
  });
});
