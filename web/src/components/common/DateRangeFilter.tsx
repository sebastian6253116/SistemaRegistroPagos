import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface DateRangeFilterProps {
  /** Lower bound as a bare `YYYY-MM-DD` calendar string ('' when unset). */
  desde: string;
  /** Upper bound as a bare `YYYY-MM-DD` calendar string ('' when unset). */
  hasta: string;
  onDesdeChange: (value: string) => void;
  onHastaChange: (value: string) => void;
  /** Base used to derive ids as `${idPrefix}-desde` / `${idPrefix}-hasta`. */
  idPrefix?: string;
  /** Explicit id overrides for callers whose ids do not follow the prefix rule. */
  desdeId?: string;
  hastaId?: string;
  /** Visible label for the lower bound. Defaults to `Desde`. */
  desdeLabel?: string;
  /** Visible label for the upper bound. Defaults to `Hasta`. */
  hastaLabel?: string;
}

/**
 * Two sibling date inputs that emit bare `YYYY-MM-DD` calendar strings.
 *
 * Returns a fragment of the two grid-cell wrappers used across the filter bars,
 * so the caller's CSS grid keeps owning the layout. Values flow straight from
 * the native input to the caller's state: they never pass through `Date` or
 * `toISOString`, which keeps `America/Caracas` from shifting the day, and an
 * unset bound stays the empty string `''` so `cleanParams` drops it.
 */
export function DateRangeFilter({
  desde,
  hasta,
  onDesdeChange,
  onHastaChange,
  idPrefix = 'date',
  desdeId,
  hastaId,
  desdeLabel = 'Desde',
  hastaLabel = 'Hasta',
}: DateRangeFilterProps) {
  const desdeFieldId = desdeId ?? `${idPrefix}-desde`;
  const hastaFieldId = hastaId ?? `${idPrefix}-hasta`;

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={desdeFieldId}>{desdeLabel}</Label>
        <Input
          id={desdeFieldId}
          type="date"
          value={desde}
          onChange={(e) => onDesdeChange(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={hastaFieldId}>{hastaLabel}</Label>
        <Input
          id={hastaFieldId}
          type="date"
          value={hasta}
          onChange={(e) => onHastaChange(e.target.value)}
        />
      </div>
    </>
  );
}
