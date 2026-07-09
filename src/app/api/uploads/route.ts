import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk } from '@/lib/http';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'assets';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/**
 * Upload an image to the public `assets` bucket and return its public URL.
 * Team-member only; the file is stored under the caller's tenant. The dashboard
 * image fields (logo, hero, product image, team photo) post a file here and use
 * the returned URL, so admins never have to host images elsewhere.
 */
export const POST = handleRoute(async (request) => {
  const { tenantId } = await requireTeamMember(request);

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    throw ApiError.badRequest('No file provided');
  }

  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    throw ApiError.badRequest('Unsupported image type (use PNG, JPEG, WebP, GIF or SVG)');
  }
  if (file.size === 0) {
    throw ApiError.badRequest('File is empty');
  }
  if (file.size > MAX_BYTES) {
    throw ApiError.badRequest('Image must be 5 MB or smaller');
  }

  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const admin = createAdminSupabase();
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    throw ApiError.unprocessable(`Upload failed: ${error.message}`);
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return jsonOk({ url: data.publicUrl });
});
