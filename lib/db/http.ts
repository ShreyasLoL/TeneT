import { z } from 'zod';
import type { Command } from '@/lib/domain/events';
import { getUserId } from './config';
import { runCommand } from './repository';

const logEntrySchema = z
  .object({
    type: z.literal('log_entry'),
    day: z.string(),
    key: z.string(),
    value: z.unknown().refine((value) => value !== undefined, 'value is required'),
  })
  .strict();

const sealDaySchema = z
  .object({
    type: z.literal('seal_day'),
    day: z.string(),
    reflection: z.string().optional(),
  })
  .strict();

export const commandSchema = z.discriminatedUnion('type', [logEntrySchema, sealDaySchema]);

export async function readJsonBody(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: 'invalid_json', message: 'Request body must be valid JSON.' } },
      { status: 400 },
    );
  }
}

export async function respondToCommand(command: Command): Promise<Response> {
  try {
    const result = await runCommand(getUserId(), command);
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 422 });
    }
    return Response.json({ ok: true, events: result.events });
  } catch {
    return Response.json(
      { ok: false, error: { code: 'database_error', message: 'The database request failed.' } },
      { status: 500 },
    );
  }
}

export function invalidBody(issues: z.ZodIssue[]): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'Request body does not match the command shape.',
        issues: issues.map((issue) => ({ path: issue.path, message: issue.message })),
      },
    },
    { status: 400 },
  );
}
