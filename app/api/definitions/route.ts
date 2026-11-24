import { getDefinitions } from '@/lib/db/queries';

export async function GET() {
  try {
    return Response.json({ ok: true, ...(await getDefinitions()) });
  } catch {
    return Response.json(
      { ok: false, error: { code: 'database_error', message: 'The database request failed.' } },
      { status: 500 },
    );
  }
}
