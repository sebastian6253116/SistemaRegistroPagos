import { useMemo } from 'react';
import { Button } from '@/components/ui/button';

type FilterValues = Record<string, unknown>;

/**
 * Builds a stable, key-order-independent signature for a filter map so the
 * "dirty" check never depends on object identity (inline objects recreated on
 * every keystroke still produce the same string).
 */
function filterSignature(values: FilterValues): string {
  return JSON.stringify(
    Object.keys(values)
      .sort()
      .map((key) => [key, values[key] ?? null]),
  );
}

/**
 * Returns `true` when any current filter value differs from its initial value.
 * Pass plain objects built inline at the call site; comparison is by value.
 */
export function useActiveFilters(current: FilterValues, initial: FilterValues): boolean {
  const currentKey = filterSignature(current);
  const initialKey = filterSignature(initial);
  return useMemo(() => currentKey !== initialKey, [currentKey, initialKey]);
}

export interface ClearFiltersButtonProps {
  current: FilterValues;
  initial: FilterValues;
  onClear: () => void;
  className?: string;
}

export function ClearFiltersButton({ current, initial, onClear, className }: ClearFiltersButtonProps) {
  const active = useActiveFilters(current, initial);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!active}
      onClick={onClear}
      className={className}
    >
      Limpiar filtros
    </Button>
  );
}
