import { commandSchema, invalidBody, readJsonBody, respondToCommand } from '@/lib/db/http';

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) return invalidBody(parsed.error.issues);
  return respondToCommand(parsed.data);
}
