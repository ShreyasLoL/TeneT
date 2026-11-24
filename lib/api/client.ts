import { z } from 'zod';
import type { Command } from '@/lib/domain/events';
import type { DayKey } from '@/lib/domain/types';
import {
  fixtureExecuteCommand,
  fixtureGetDefinitions,
  fixtureGetState,
  isFixtureMode,
} from './fixtures';
import {
  apiErrorResponseSchema,
  commandSuccessResponseSchema,
  definitionsResponseSchema,
  stateResponseSchema,
} from './schemas';
import type {
  ApiErrorResponse,
  ApiIssue,
  CommandSuccessResponse,
  DefinitionsResponse,
  StateResponse,
} from './types';

export type ApiErrorCode = ApiErrorResponse['error']['code'] | 'network_error' | 'invalid_response';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: ApiIssue[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function parseWithSchema<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  if (process.env.NODE_ENV !== 'production') {
    throw new ApiError(500, 'invalid_response', 'Response shape failed validation.');
  }
  return data as T;
}

async function requestJson<T>(
  input: string,
  init: RequestInit | undefined,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiError(0, 'network_error', 'no signal. nothing was lost.');
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError(response.status, 'invalid_response', "the record didn't answer. try again.");
  }

  if (!response.ok) {
    const parsedErr = apiErrorResponseSchema.safeParse(json);
    if (parsedErr.success) {
      throw new ApiError(
        response.status,
        parsedErr.data.error.code,
        parsedErr.data.error.message,
        parsedErr.data.error.issues,
      );
    }
    throw new ApiError(
      response.status,
      response.status >= 500 ? 'database_error' : 'invalid_request',
      "the record didn't answer. try again.",
    );
  }

  return parseWithSchema(schema, json);
}

export async function getDefinitions(): Promise<DefinitionsResponse> {
  if (isFixtureMode()) {
    return fixtureGetDefinitions();
  }
  return requestJson('/api/definitions', { cache: 'no-store' }, definitionsResponseSchema);
}

export async function getState(params?: { from?: DayKey; to?: DayKey }): Promise<StateResponse> {
  if (isFixtureMode()) {
    return fixtureGetState(params?.from, params?.to);
  }
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  const qs = search.toString();
  const url = qs ? `/api/state?${qs}` : '/api/state';
  return requestJson(url, { cache: 'no-store' }, stateResponseSchema);
}

export async function postCommand(command: Command): Promise<CommandSuccessResponse> {
  if (isFixtureMode()) {
    const res = fixtureExecuteCommand(command);
    if (res.status !== 200) {
      throw new ApiError(
        res.status,
        res.body.error.code as ApiErrorCode,
        res.body.error.message,
      );
    }
    return res.body;
  }

  return requestJson(
    '/api/commands',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    },
    commandSuccessResponseSchema,
  );
}

export async function postSeal(input: {
  day: DayKey;
  reflection?: string;
}): Promise<CommandSuccessResponse> {
  if (isFixtureMode()) {
    const res = fixtureExecuteCommand({
      type: 'seal_day',
      day: input.day,
      reflection: input.reflection,
    });
    if (res.status !== 200) {
      throw new ApiError(
        res.status,
        res.body.error.code as ApiErrorCode,
        res.body.error.message,
      );
    }
    return res.body;
  }

  return requestJson(
    '/api/seal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    commandSuccessResponseSchema,
  );
}
