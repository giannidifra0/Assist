'use client';

import { ArrowUpDown, Filter, X } from 'lucide-react';

export interface SortHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  onSort: (key: K) => void;
  activeSortKey?: K | null;
  sortDirection?: 'asc' | 'desc';
  filterable?: boolean;
  filterValue?: string;
  isFilterOpen?: boolean;
  onToggleFilter?: (key: K) => void;
  onFilterChange?: (key: K, value: string) => void;
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  onSort,
  activeSortKey,
  sortDirection,
  filterable = false,
  filterValue = '',
  isFilterOpen = false,
  onToggleFilter,
  onFilterChange,
}: SortHeaderProps<K>) {
  const isSorted = activeSortKey === sortKey;

  return (
    <th className="px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/70 whitespace-nowrap align-top">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSort(sortKey)}
            className={`inline-flex items-center text-[11px] font-bold uppercase tracking-widest transition-colors ${
              isSorted
                ? 'text-zinc-900 dark:text-white'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            {label}
            <ArrowUpDown className="ml-1.5 h-3 w-3" />
            {isSorted && (
              <span className="sr-only">
                {sortDirection === 'asc' ? 'ordine crescente' : 'ordine decrescente'}
              </span>
            )}
          </button>

          {filterable && onToggleFilter && (
            <button
              type="button"
              onClick={() => onToggleFilter(sortKey)}
              aria-label={`Filtra per ${label}`}
              className={`p-1 rounded-md transition-colors ${
                filterValue || isFilterOpen
                  ? 'text-zinc-900 dark:text-white bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200 dark:border-zinc-700'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800'
              }`}
              title="Filtra colonna"
            >
              <Filter className="w-3 h-3" />
            </button>
          )}
        </div>

        {filterable && isFilterOpen && onFilterChange && onToggleFilter && (
          <div className="relative mt-1 min-w-[140px]">
            <input
              type="text"
              autoFocus
              placeholder="Filtra..."
              value={filterValue}
              onChange={(e) => onFilterChange(sortKey, e.target.value)}
              className="w-full pl-3 pr-7 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white font-medium"
            />
            <button
              type="button"
              aria-label={`Azzera filtro ${label}`}
              onClick={() => {
                onFilterChange(sortKey, '');
                onToggleFilter(sortKey);
              }}
              className="absolute right-1.5 top-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </th>
  );
}
