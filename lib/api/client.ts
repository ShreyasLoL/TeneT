import type { Command } from '@/lib/domain/events';
import type { DayKey } from '@/lib/domain/types';
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

type SchemaMap = {
  definitionsResponseSchema: DefinitionsResponse;
  stateResponseSchema: StateResponse;
  commandSuccessResponseSchema: CommandSuccessResponse;
};

async function parseWithSchema<K extends keyof SchemaMap>(
  schemaName: K,
  data: unknown,
): Promise<SchemaMap[K]> {
  if (process.env.NODE_ENV !== 'production') {
    const schemas = await import('./schemas');
    const parsed = schemas[schemaName].safeParse(data);
    if (!parsed.success) {
      throw new ApiError(500, 'invalid_response', 'Response shape failed validation.');
    }
    return parsed.data as SchemaMap[K];
  }
  return data as SchemaMap[K];
}

function extractApiError(json: unknown): ApiErrorResponse['error'] | null {
  if (!json || typeof json !== 'object' || !('error' in json)) return null;
  const err = (json as { error?: unknown }).error;
  if (!err || typeof err !== 'object') return null;
  const rec = err as { code?: unknown; message?: unknown; issues?: unknown };
  if (typeof rec.code !== 'string' || typeof rec.message !== 'string') return null;
  return {
    code: rec.code as ApiErrorResponse['error']['code'],
    message: rec.message,
    issues: Array.isArray(rec.issues) ? (rec.issues as ApiIssue[]) : undefined,
  };
}

async function requestJson<K extends keyof SchemaMap>(
  input: string,
  init: RequestInit | undefined,
  schemaName: K,
): Promise<SchemaMap[K]> {
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
    const apiErr = extractApiError(json);
    if (apiErr) {
      throw new ApiError(response.status, apiErr.code, apiErr.message, apiErr.issues);
    }
    throw new ApiError(
      response.status,
      response.status >= 500 ? 'database_error' : 'invalid_request',
      "the record didn't answer. try again.",
    );
  }

  return parseWithSchema(schemaName, json);
}

export async function getDefinitions(): Promise<DefinitionsResponse> {
  if (process.env.NODE_ENV !== 'production') {
    const fx = await import('./fixtures');
    if (fx.isFixtureMode()) {
      return fx.fixtureGetDefinitions();
    }
  }
  return requestJson('/api/definitions', { cache: 'no-store' }, 'definitionsResponseSchema');
}

export async function getState(params?: { from?: DayKey; to?: DayKey }): Promise<StateResponse> {
  if (process.env.NODE_ENV !== 'production') {
    const fx = await import('./fixtures');
    if (fx.isFixtureMode()) {
      return fx.fixtureGetState(params?.from, params?.to);
    }
  }
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  const qs = search.toString();
  const url = qs ? `/api/state?${qs}` : '/api/state';
  return requestJson(url, { cache: 'no-store' }, 'stateResponseSchema');
}

export async function postCommand(command: Command): Promise<CommandSuccessResponse> {
  if (process.env.NODE_ENV !== 'production') {
    const fx = await import('./fixtures');
    if (fx.isFixtureMode()) {
      const res = fx.fixtureExecuteCommand(command);
      if (res.status !== 200) {
        throw new ApiError(
          res.status,
          res.body.error.code as ApiErrorCode,
          res.body.error.message,
        );
      }
      return res.body;
    }
  }

  return requestJson(
    '/api/commands',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    },
    'commandSuccessResponseSchema',
  );
}

export async function postSeal(input: {
  day: DayKey;
  reflection?: string;
}): Promise<CommandSuccessResponse> {
  if (process.env.NODE_ENV !== 'production') {
    const fx = await import('./fixtures');
    if (fx.isFixtureMode()) {
      const res = fx.fixtureExecuteCommand({
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
  }

  return requestJson(
    '/api/seal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'commandSuccessResponseSchema',
  );
}
