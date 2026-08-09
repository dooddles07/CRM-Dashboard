"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type Table as TanTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "./states";
import { cn } from "@/lib/utils";

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Filter bar, search, saved views - rendered above the table. */
  toolbar?: (table: TanTable<T>) => React.ReactNode;
  /** Shown in place of the rows when nothing matches. */
  empty: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode };
  /** Rendered when rows are selected, replacing the footer count. */
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  pageSize?: number;
  getRowId?: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Compact drops the row height from 44px to 34px. */
  density?: "comfortable" | "compact";
  /** Minimum table width before horizontal scrolling starts, e.g. "68rem". */
  minWidth?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  toolbar,
  empty,
  bulkActions,
  pageSize = 12,
  getRowId,
  onRowClick,
  density = "comfortable",
  minWidth,
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: getRowId as ((row: T, index: number) => string) | undefined,
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const cellPad = density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";

  return (
    <div className={cn("rounded-lg border border-line bg-surface shadow-card", className)}>
      {toolbar && (
        <div className="border-b border-line px-3 py-2.5">{toolbar(table)}</div>
      )}

      {rows.length === 0 ? (
        <EmptyState {...empty} compact />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth }}>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="border-b border-line bg-surface-2">
                  {group.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          !canSort
                            ? undefined
                            : sorted === "asc"
                              ? "ascending"
                              : sorted === "desc"
                                ? "descending"
                                : "none"
                        }
                        className={cn(
                          "whitespace-nowrap text-left text-label text-ink-3",
                          density === "compact" ? "px-3 py-1.5" : "px-3 py-2",
                        )}
                        style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 rounded-sm text-label text-ink-3 transition-colors duration-150 hover:text-ink cursor-pointer"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === "asc" ? (
                              <ArrowUp aria-hidden className="size-3" strokeWidth={2.5} />
                            ) : sorted === "desc" ? (
                              <ArrowDown aria-hidden className="size-3" strokeWidth={2.5} />
                            ) : (
                              <ChevronsUpDown
                                aria-hidden
                                className="size-3 opacity-40"
                                strokeWidth={2.5}
                              />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    "border-b border-line transition-colors duration-150 last:border-0",
                    "hover:bg-surface-2 data-[state=selected]:bg-primary-soft/45",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn("text-body-sm text-ink-2 align-middle", cellPad)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2">
        {selected.length > 0 && bulkActions ? (
          <>
            <p className="text-body-sm text-ink" aria-live="polite">
              <span className="font-medium tabular-nums">{selected.length}</span> selected
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {bulkActions(selected, () => setRowSelection({}))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => setRowSelection({})}
              >
                Clear
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-body-sm text-ink-3 tabular-nums">
              {table.getFilteredRowModel().rows.length === data.length
                ? `${data.length} records`
                : `${table.getFilteredRowModel().rows.length} of ${data.length} records`}
            </p>
            {table.getPageCount() > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-body-sm text-ink-3 tabular-nums">
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" strokeWidth={2} />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Row-selection column, shared by every table that supports bulk actions. */
export function selectionColumn<T>(label: string): ColumnDef<T, unknown> {
  return {
    id: "select",
    size: 36,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
        aria-label={`Select all ${label} on this page`}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(Boolean(v))}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select this ${label.replace(/s$/, "")}`}
      />
    ),
  };
}
