import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

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
 * Single trigger that opens a modal with the two date inputs, emitting bare
 * `YYYY-MM-DD` calendar strings.
 *
 * Grid mapping: the component used to return a fragment of TWO `space-y-1.5`
 * wrappers (two grid cells). It now returns ONE wrapper that spans both former
 * cells: `col-span-full` (`grid-column: 1 / -1`, which clamps to the single
 * explicit column in the mobile 1-col bars without creating implicit tracks,
 * and spans both columns in Validación's base 2-col bar) and `sm:col-span-2`
 * (every filter bar has >= 2 columns from `sm` up). No call site changes.
 *
 * Apply semantics: the modal stages the range in local state. The caller's
 * `onDesdeChange`/`onHastaChange` fire only on `Aplicar` (commit staged
 * values) or `Limpiar` (commit `''`/`''`) — never per keystroke — so picking
 * two dates produces a single refetch instead of one per day picked.
 *
 * Timezone safety: displayed dates are formatted with the shared
 * `formatDate`/`parseCalendarDate` path, which builds a LOCAL date from the
 * bare calendar string. Values never pass through `new Date(str)` +
 * `toISOString()`, so `America/Caracas` cannot shift the day, and an unset
 * bound stays the empty string `''` so `cleanParams` drops it.
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
  const triggerId = `${idPrefix}-range`;

  const [open, setOpen] = useState(false);
  const [draftDesde, setDraftDesde] = useState(desde);
  const [draftHasta, setDraftHasta] = useState(hasta);

  // The trigger summarizes both bounds in one label; when the caller renamed
  // the bounds (e.g. Reportes' movement range) both names are shown so the
  // trigger stays distinguishable from the main date range next to it.
  const triggerLabel =
    desdeLabel === 'Desde' && hastaLabel === 'Hasta'
      ? 'Rango de fechas'
      : `${desdeLabel} – ${hastaLabel}`;

  const summary = desde && hasta
    ? `${formatDate(desde)} → ${formatDate(hasta)}`
    : desde
      ? `Desde ${formatDate(desde)}`
      : hasta
        ? `Hasta ${formatDate(hasta)}`
        : '';

  const openModal = () => {
    // Stage from the applied values so Cancelar discards any previous draft.
    setDraftDesde(desde);
    setDraftHasta(hasta);
    setOpen(true);
  };

  const apply = () => {
    onDesdeChange(draftDesde);
    onHastaChange(draftHasta);
    setOpen(false);
  };

  const clear = () => {
    onDesdeChange('');
    onHastaChange('');
    setOpen(false);
  };

  const cancel = () => setOpen(false);

  return (
    <div className="space-y-1.5 col-span-full sm:col-span-2">
      <Label htmlFor={triggerId}>{triggerLabel}</Label>
      <button
        id={triggerId}
        type="button"
        aria-haspopup="dialog"
        onClick={openModal}
        className={cn(
          'flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        )}
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className={cn('flex-1 truncate', !summary && 'text-muted-foreground')}>
          {summary || 'Todas las fechas'}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Dialog
        open={open}
        onClose={cancel}
        title={triggerLabel}
        className="sm:max-w-md"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={cancel}>
              Cancelar
            </Button>
            <Button type="button" variant="outline" onClick={clear}>
              Limpiar
            </Button>
            <Button type="button" onClick={apply}>
              Aplicar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={desdeFieldId}>{desdeLabel}</Label>
            <Input
              id={desdeFieldId}
              type="date"
              value={draftDesde}
              onChange={(e) => setDraftDesde(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={hastaFieldId}>{hastaLabel}</Label>
            <Input
              id={hastaFieldId}
              type="date"
              value={draftHasta}
              onChange={(e) => setDraftHasta(e.target.value)}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
