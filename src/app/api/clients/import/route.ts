import type { Json } from '@/lib/database.types';
import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { clientCreateSchema, clientImportSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type ImportRow = {
  tenant_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: 'trial' | 'active' | 'renewal_due' | 'expired' | 'churned';
  notes: string | null;
  metadata: Json;
};

/**
 * Bulk-create clients from a parsed CSV (or any array of rows). Each row is
 * validated independently; invalid rows and in-file duplicate emails are
 * reported without aborting the batch. Valid rows are inserted in a single
 * `INSERT … ON CONFLICT DO NOTHING`, so emails that already exist for the
 * tenant are skipped rather than erroring. Returns a summary.
 */
export const POST = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request);
  const { clients: rawRows } = await parseJson(request, clientImportSchema);

  const invalid: { row: number; error: string }[] = [];
  const seen = new Set<string>();
  const rows: ImportRow[] = [];

  rawRows.forEach((raw, idx) => {
    const parsed = clientCreateSchema.safeParse(raw);
    if (!parsed.success) {
      invalid.push({ row: idx + 1, error: parsed.error.issues[0]?.message ?? 'Invalid row' });
      return;
    }
    const emailKey = parsed.data.email.toLowerCase();
    if (seen.has(emailKey)) {
      invalid.push({ row: idx + 1, error: 'Duplicate email within the file' });
      return;
    }
    seen.add(emailKey);
    rows.push({
      tenant_id: tenantId,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      status: parsed.data.status ?? 'trial',
      notes: parsed.data.notes ?? null,
      metadata: (parsed.data.metadata ?? {}) as Json,
    });
  });

  let created = 0;
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('clients')
      .upsert(rows, { onConflict: 'tenant_id,email', ignoreDuplicates: true })
      .select('id');
    if (error) throw ApiError.unprocessable(error.message);
    created = data?.length ?? 0;
  }

  return jsonOk(
    {
      created,
      skippedExisting: rows.length - created,
      invalid,
      total: rawRows.length,
    },
    201,
  );
});
