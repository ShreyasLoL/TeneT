import { z } from 'zod';
import { invalidBody, readJsonBody, respondToCommand } from '@/lib/db/http';

const sealSchema = z.object({ day: z.string(), reflection: z.string().optional() }).strict();

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const parsed = sealSchema.safeParse(body);
  if (!parsed.success) return invalidBody(parsed.error.issues);

  return respondToCommand({ type: 'seal_day', ...parsed.data });
}
