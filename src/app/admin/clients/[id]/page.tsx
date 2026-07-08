import { ClientProfile } from '@/components/admin/client-profile';

export const dynamic = 'force-dynamic';

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientProfile clientId={id} />;
}
