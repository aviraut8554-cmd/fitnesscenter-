-- Public storage bucket for admin-uploaded images (logos, hero banners,
-- product/offering images, team photos). Uploads are performed server-side
-- through the service role (see /api/uploads), which bypasses storage RLS, so
-- no per-object policies are required. The bucket is public-read so the URLs
-- returned to the dashboard render directly in <img> tags.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assets',
  'assets',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
