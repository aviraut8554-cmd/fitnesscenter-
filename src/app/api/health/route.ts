import { jsonOk } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return jsonOk({ status: 'ok', service: 'fitness-creator-os', time: new Date().toISOString() });
}
