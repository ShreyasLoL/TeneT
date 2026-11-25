'use client';

import { Button } from '@/components/ui/button';
import type { FieldDef, Trackable } from '@/lib/domain/types';
import { validateTrackableValue } from '@/lib/domain/validateValue';

type RowValue = Record<string, string | number | boolean | undefined>;

type WorkoutLensProps = {
  trackable: Pick<Trackable, 'key' | 'version' | 'kind' | 'label' | 'config' | 'schedule' | 'rule' | 'weight' | 'scored' | 'effectiveFrom'>;
  value: unknown;
  disabled?: boolean;
  onChange: (rows: RowValue[]) => void;
};

function defaultCellValue(f: FieldDef): string | number | boolean | undefined {
  if (f.optional) return undefined;
  if (f.type === 'number') return 0;
  if (f.type === 'bool') return false;
  return '';
}

function emptyRow(fields: ReadonlyArray<FieldDef>): RowValue {
  const row: RowValue = {};
  for (const f of fields) {
    const val = defaultCellValue(f);
    if (val !== undefined) row[f.key] = val;
  }
  return row;
}

export function WorkoutLens({ trackable, value, disabled = false, onChange }: WorkoutLensProps) {
  const fields = trackable.config.fields ?? [];
  const rows: RowValue[] = Array.isArray(value) ? (value as RowValue[]) : [];

  const updateCell = (rowIdx: number, field: FieldDef, nextVal: unknown) => {
    const nextRows = rows.map((r, i) => {
      if (i !== rowIdx) return r;
      const updated = { ...r };
      if (nextVal === undefined) {
        delete updated[field.key];
      } else {
        updated[field.key] = nextVal as string | number | boolean;
      }
      return updated;
    });
    onChange(nextRows);
  };

  const addRow = () => {
    if (rows.length >= 200) return;
    onChange([...rows, emptyRow(fields)]);
  };

  const duplicateRow = (idx: number) => {
    if (rows.length >= 200) return;
    const copy = { ...rows[idx] };
    onChange([...rows.slice(0, idx + 1), copy, ...rows.slice(idx + 1)]);
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  const fullValidation = validateTrackableValue(trackable as Trackable, rows);

  return (
    <div className="w-full space-y-3">
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-line bg-bg">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
                {fields.map((f) => (
                  <th key={f.key} className="px-2.5 py-2 font-normal">
                    {f.key}
                    {f.optional ? ' (opt)' : ''}
                  </th>
                ))}
                <th className="px-2.5 py-2 text-right font-normal">row</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-line/60 last:border-b-0">
                  {fields.map((field) => {
                    const cell = row[field.key];
                    return (
                      <td key={field.key} className="px-2 py-1.5">
                        {field.type === 'bool' ? (
                          <input
                            type="checkbox"
                            disabled={disabled}
                            aria-label={`${field.key} row ${rowIdx + 1}`}
                            checked={Boolean(cell)}
                            onChange={(e) => updateCell(rowIdx, field, e.target.checked)}
                            className="size-4 accent-[var(--accent)]"
                          />
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            step="any"
                            disabled={disabled}
                            aria-label={`${field.key} row ${rowIdx + 1}`}
                            value={typeof cell === 'number' ? cell : ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '' && field.optional) {
                                updateCell(rowIdx, field, undefined);
                                return;
                              }
                              const num = Number(raw);
                              if (Number.isFinite(num)) updateCell(rowIdx, field, num);
                            }}
                            className="h-9 w-20 rounded border border-line bg-surface px-2 font-mono text-xs text-text tabular-nums outline-none focus:border-accent"
                          />
                        ) : (
                          <input
                            type="text"
                            maxLength={500}
                            disabled={disabled}
                            aria-label={`${field.key} row ${rowIdx + 1}`}
                            value={typeof cell === 'string' ? cell : ''}
                            onChange={(e) => updateCell(rowIdx, field, e.target.value)}
                            className="h-9 w-28 rounded border border-line bg-surface px-2 text-xs text-text outline-none focus:border-accent"
                          />
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={disabled || rows.length >= 200}
                        onClick={() => duplicateRow(rowIdx)}
                        aria-label={`Duplicate row ${rowIdx + 1}`}
                        className="rounded border border-line px-2 py-1 font-mono text-[10px] text-text-dim hover:text-text disabled:opacity-40"
                      >
                        dup
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => removeRow(rowIdx)}
                        aria-label={`Remove row ${rowIdx + 1}`}
                        className="rounded border border-line px-2 py-1 font-mono text-[10px] text-text-faint hover:text-status-danger disabled:opacity-40"
                      >
                        del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || rows.length >= 200}
          onClick={addRow}
          className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em]"
        >
          add row
        </Button>
        <span className="font-mono text-[11px] text-text-faint tabular-nums">
          {rows.length}/200
        </span>
      </div>

      {!fullValidation.ok ? (
        <p role="alert" className="font-mono text-xs text-status-danger">
          {fullValidation.message}
        </p>
      ) : null}
    </div>
  );
}
