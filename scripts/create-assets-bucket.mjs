// One-off: provision the public `assets` storage bucket on the hosted project.
// Mirrors supabase/migrations/0015_storage_assets.sql for the live database.
// Uses the Storage REST API directly (no supabase-js) to stay Node-version safe.
// Run: node scripts/create-assets-bucket.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
const body = JSON.stringify({
  id: 'assets',
  name: 'assets',
  public: true,
  file_size_limit: 5 * 1024 * 1024,
  allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
});

let res = await fetch(`${base}/storage/v1/bucket`, { method: 'POST', headers, body });
let text = await res.text();
if (res.status === 409 || /already exists/i.test(text)) {
  res = await fetch(`${base}/storage/v1/bucket/assets`, { method: 'PUT', headers, body });
  text = await res.text();
  console.log(res.ok ? 'assets bucket already existed — updated config' : `update failed: ${text}`);
  process.exit(res.ok ? 0 : 1);
}
console.log(res.ok ? 'assets bucket created' : `create failed (${res.status}): ${text}`);
process.exit(res.ok ? 0 : 1);
