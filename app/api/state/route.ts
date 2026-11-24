import { addDays, dayKey, isDayKey } from '@/lib/domain/day';
import { getStateRange } from '@/lib/db/queries';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const today = dayKey(new Date());
  const from = url.searchParams.get('from') ?? addDays(today, -399);
  const to = url.searchParams.get('to') ?? today;

  if (!isDayKey(from) || !isDayKey(to) || from > to) {
    return Response.json(
      {
        ok: false,
        error: {
          code: 'invalid_range',
          message: 'from and to must be valid YYYY-MM-DD days, with from no later than to.',
        },
      },
      { status: 400 },
    );
  }

  try {
    return Response.json({ ok: true, range: { from, to }, ...(await getStateRange(from, to)) });
  } catch {
    return Response.json(
      { ok: false, error: { code: 'database_error', message: 'The database request failed.' } },
      { status: 500 },
    );
  }
}
