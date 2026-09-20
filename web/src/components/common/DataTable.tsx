import { useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  getRowId?: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /**
   * Render opcional de una fila como tarjeta apilada para pantallas angostas
   * (< `sm`). Si se provee, la tabla se reemplaza por tarjetas en móvil; si se
   * omite, se conserva la tabla con desplazamiento horizontal en todos los
   * tamaños. Las acciones de fila deben incluirse en el propio render.
   */
  mobileCard?: (row: T) => ReactNode;
  /** Paginación del servidor. */
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyTitle = 'Sin resultados',
  emptyDescription = 'No hay registros que coincidan con los filtros aplicados.',
  emptyAction,
  getRowId,
  onRowClick,
  rowClassName,
  enableRowSelection,
  rowSelection,
  onRowSelectionChange,
  mobileCard,
  pagination,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const allColumns: ColumnDef<T, unknown>[] = enableRowSelection
    ? [
        {
          id: '__select__',
          header: ({ table }) => (
            <Checkbox
              checked={table.getIsAllRowsSelected()}
              ref={(el) => {
                if (el) el.indeterminate = table.getIsSomeRowsSelected();
              }}
              onChange={table.getToggleAllRowsSelectedHandler()}
              aria-label="Seleccionar todo"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onChange={row.getToggleSelectedHandler()}
              aria-label="Seleccionar fila"
            />
          ),
          enableSorting: false,
          size: 40,
        },
        ...columns,
      ]
    : columns;

  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      sorting,
      ...(enableRowSelection ? { rowSelection: rowSelection ?? {} } : {}),
    },
    onSortingChange: setSorting,
    ...(enableRowSelection && onRowSelectionChange
      ? { onRowSelectionChange, enableRowSelection: true }
      : {}),
    getRowId: getRowId as ((row: T) => string) | undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card">
        <TableSkeleton cols={Math.min(columns.length + 1, 7)} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {data.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <>
          {mobileCard && (
            <ul className="divide-y sm:hidden">
              {table.getRowModel().rows.map((row) => (
                <li
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'p-3',
                    onRowClick && 'cursor-pointer active:bg-muted/40',
                    row.getIsSelected() && 'bg-primary/5',
                    rowClassName?.(row.original),
                  )}
                >
                  {enableRowSelection && (
                    <div
                      className="mb-2 flex items-center gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        checked={row.getIsSelected()}
                        disabled={!row.getCanSelect()}
                        onChange={row.getToggleSelectedHandler()}
                        aria-label="Seleccionar fila"
                      />
                      <span className="text-xs text-muted-foreground">Seleccionar</span>
                    </div>
                  )}
                  {mobileCard(row.original)}
                </li>
              ))}
            </ul>
          )}

          <div className={cn(mobileCard && 'hidden sm:block')}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <TableHead key={header.id} style={{ width: header.getSize() }}>
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    onRowClick && 'cursor-pointer',
                    row.getIsSelected() && 'bg-primary/5',
                    rowClassName?.(row.original),
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>

          {pagination && (
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              total={pagination.total}
              totalPages={pagination.totalPages}
              onPageChange={pagination.onPageChange}
            />
          )}
        </>
      )}
    </div>
  );
}
