import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getDefinitions, getState, postCommand, postSeal } from './client';
import { setFixtureModeOverride } from './fixtures';

describe('api client contract', () => {
  afterEach(() => {
    setFixtureModeOverride(null);
    vi.unstubAllGlobals();
  });

  it('parses valid definitions, state, command, and seal payloads via fetch', async () => {
    setFixtureModeOverride(false);

    const mockFetch = vi.fn(async (url: string) => {
      if (url === '/api/definitions') {
        return new Response(
          JSON.stringify({ ok: true, areas: [], goals: [], trackables: [] }),
          { status: 200 },
        );
      }
      if (url.startsWith('/api/state')) {
        return new Response(
          JSON.stringify({
            ok: true,
            range: { from: '2026-11-01', to: '2026-11-25' },
            definitions: { areas: [], goals: [], trackables: [] },
            entries: [],
            days: [],
          }),
          { status: 200 },
        );
      }
      if (url === '/api/commands') {
        return new Response(
          JSON.stringify({
            ok: true,
            events: [
              {
                type: 'entry_logged',
                at: '2026-11-25T15:00:00.000Z',
                day: '2026-11-25',
                key: 'k',
                version: 1,
                value: true,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          events: [
            {
              type: 'day_sealed',
              at: '2026-11-25T16:00:00.000Z',
              day: '2026-11-25',
              score: 100,
              results: [],
              streak: 1,
            },
          ],
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('fetch', mockFetch);

    const defs = await getDefinitions();
    expect(defs.ok).toBe(true);

    const state = await getState({ from: '2026-11-01', to: '2026-11-25' });
    expect(state.range.to).toBe('2026-11-25');

    const cmd = await postCommand({ type: 'log_entry', day: '2026-11-25', key: 'k', value: true });
    expect(cmd.events[0].type).toBe('entry_logged');

    const seal = await postSeal({ day: '2026-11-25', reflection: 'done' });
    expect(seal.events[0].type).toBe('day_sealed');
  });

  it('maps 422, 400, 500, and network failures to typed ApiError', async () => {
    setFixtureModeOverride(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: 'day_sealed', message: '2026-11-25 is sealed and final' },
          }),
          { status: 422 },
        ),
      ),
    );
    await expect(postSeal({ day: '2026-11-25' })).rejects.toMatchObject({
      status: 422,
      code: 'day_sealed',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: 'invalid_request',
              message: 'bad',
              issues: [{ path: ['day'], message: 'required' }],
            },
          }),
          { status: 400 },
        ),
      ),
    );
    await expect(
      postCommand({ type: 'log_entry', day: 'bad', key: 'k', value: 1 }),
    ).rejects.toBeInstanceOf(ApiError);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(getDefinitions()).rejects.toMatchObject({ code: 'network_error', status: 0 });
  });
});
