'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Edit,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { hasPermission } from '@/lib/auth/roles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { SortHeader } from '@/components/ui/SortHeader';
import { useToast } from '@/components/ui/ToastProvider';
import type {
  KnowledgeEmbeddingFilter,
  KnowledgeFormPayload,
  KnowledgeItem,
  UserRole,
} from '@/lib/types/domain';

type KnowledgeSortKey = keyof KnowledgeItem;

const INITIAL_FORM: KnowledgeFormPayload = {
  numero_originale: '',
  riferimento: '',
  data_pubblicazione: '',
  classe: '',
  tipologia: '',
  argomento: '',
  prodotto_1: '',
  prodotto_2: '',
  prodotto_3: '',
  prodotto_4: '',
  prodotto_5: '',
  prodotto_6: '',
  oggetto: '',
  contenuto: '',
};

const PRODUCT_SLOTS = [1, 2, 3, 4, 5, 6] as const;

export function KnowledgeClient({ userRole }: { userRole: UserRole }) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [isLoadingList, setIsLoadingList] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [embeddingStatus, setEmbeddingStatus] = useState<KnowledgeEmbeddingFilter>('all');

  const [columnFilters, setColumnFilters] = useState<Partial<Record<KnowledgeSortKey, string>>>({});
  const [debouncedFilters, setDebouncedFilters] = useState<Partial<Record<KnowledgeSortKey, string>>>(
    {}
  );
  const [activeFilterCol, setActiveFilterCol] = useState<KnowledgeSortKey | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: KnowledgeSortKey;
    direction: 'asc' | 'desc';
  } | null>(null);

  const [reloadTick, setReloadTick] = useState(0);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<KnowledgeItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<KnowledgeItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [formData, setFormData] = useState<KnowledgeFormPayload>(INITIAL_FORM);

  const { showToast } = useToast();

  const canWrite = hasPermission(userRole, 'kb:write');
  const canDelete = hasPermission(userRole, 'kb:delete');
  const canSync = hasPermission(userRole, 'ai:sync_embeddings');

  // Debounce ricerca globale e filtri colonna
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(columnFilters);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [columnFilters]);

  // Fetch server-side paginato e filtrato
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          embeddingStatus,
        });

        if (debouncedSearch.trim()) {
          params.set('search', debouncedSearch.trim());
        }
        if (sortConfig) {
          params.set('sortBy', sortConfig.key);
          params.set('sortDir', sortConfig.direction);
        }

        const activeFilters = Object.fromEntries(
          Object.entries(debouncedFilters).filter(([, val]) => Boolean(val && val.trim()))
        );
        if (Object.keys(activeFilters).length > 0) {
          params.set('filters', JSON.stringify(activeFilters));
        }

        const res = await fetch(`/api/knowledge?${params.toString()}`);
        const data = (await res.json()) as {
          success?: boolean;
          items?: KnowledgeItem[];
          total?: number;
          totalPages?: number;
          error?: string;
        };

        if (!active) return;
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Errore lettura Knowledge Base.');
        }

        setItems(data.items ?? []);
        setTotalItems(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Errore caricamento dati.';
          showToast(msg, 'error');
        }
      } finally {
        if (active) setIsLoadingList(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    page,
    pageSize,
    debouncedSearch,
    debouncedFilters,
    sortConfig,
    embeddingStatus,
    reloadTick,
    showToast,
  ]);

  const triggerReload = () => {
    setIsLoadingList(true);
    setReloadTick((prev) => prev + 1);
  };

  const handleSyncEmbeddings = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/embeddings', { method: 'POST' });
      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Errore sincronizzazione vettori.');
      }
      showToast(data.message || 'Sincronizzazione IA completata.', 'success');
      triggerReload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore di connessione.';
      showToast(msg, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const requestSort = (key: KnowledgeSortKey) => {
    setIsLoadingList(true);
    setPage(1);
    setSortConfig((prev) =>
      prev && prev.key === key && prev.direction === 'asc'
        ? { key, direction: 'desc' }
        : { key, direction: 'asc' }
    );
  };

  const handleToggleFilter = (key: KnowledgeSortKey) => {
    setActiveFilterCol((prev) => (prev === key ? null : key));
  };

  const handleFilterChange = (key: KnowledgeSortKey, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const openForm = (item?: KnowledgeItem) => {
    setViewingItem(null);
    if (item) {
      setFormData({
        numero_originale: item.numero_originale || '',
        riferimento: item.riferimento || '',
        data_pubblicazione: item.data_pubblicazione || '',
        classe: item.classe || '',
        tipologia: item.tipologia || '',
        argomento: item.argomento || '',
        prodotto_1: item.prodotto_1 || '',
        prodotto_2: item.prodotto_2 || '',
        prodotto_3: item.prodotto_3 || '',
        prodotto_4: item.prodotto_4 || '',
        prodotto_5: item.prodotto_5 || '',
        prodotto_6: item.prodotto_6 || '',
        oggetto: item.oggetto || '',
        contenuto: item.contenuto || '',
      });
      setEditingId(item.id);
    } else {
      setFormData(INITIAL_FORM);
      setEditingId(null);
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/knowledge', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...formData, id: editingId } : formData),
      });
      const data = (await res.json()) as {
        success?: boolean;
        embedded?: boolean;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Errore durante il salvataggio.');
      }

      setIsFormOpen(false);
      if (data.embedded) {
        showToast(
          editingId
            ? 'Scheda aggiornata e indicizzata automaticamente per la chat IA!'
            : 'Nuova scheda salvata e indicizzata automaticamente per la chat IA!',
          'success'
        );
      } else {
        showToast(
          'Scheda salvata. Esegui "Sincronizza IA" per generare il vettore.',
          'info'
        );
      }
      triggerReload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore salvataggio.';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/knowledge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingItem.id }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Errore eliminazione scheda.');
      }
      setDeletingItem(null);
      showToast('Scheda eliminata con successo.', 'success');
      triggerReload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore eliminazione.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const getProductValue = (
    item: KnowledgeFormPayload | KnowledgeItem,
    slot: 1 | 2 | 3 | 4 | 5 | 6
  ) => {
    switch (slot) {
      case 1:
        return item.prodotto_1;
      case 2:
        return item.prodotto_2;
      case 3:
        return item.prodotto_3;
      case 4:
        return item.prodotto_4;
      case 5:
        return item.prodotto_5;
      case 6:
        return item.prodotto_6;
    }
  };

  const setProductValue = (slot: 1 | 2 | 3 | 4 | 5 | 6, value: string) => {
    setFormData((prev) => ({ ...prev, [`prodotto_${slot}`]: value }));
  };

  return (
    <div className="space-y-6 md:space-y-8 w-full pb-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Knowledge Base
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 font-medium">
            Archivio schede tecniche e soluzioni con indicizzazione automatica al salvataggio.
          </p>
        </div>

        {(canSync || canWrite) && (
          <div className="flex flex-col sm:flex-row gap-3">
            {canSync && (
              <button
                type="button"
                onClick={handleSyncEmbeddings}
                disabled={isSyncing}
                className="flex items-center justify-center px-5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                Sincronizza IA
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => openForm()}
                className="flex items-center justify-center px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-md"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuova Scheda
              </button>
            )}
          </div>
        )}
      </div>

      {/* TABELLA KB PAGINATA SERVER-SIDE */}
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-[2rem] shadow-sm border border-zinc-200/70 dark:border-zinc-800 flex flex-col overflow-hidden w-full">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <search className="relative w-full max-w-md">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-zinc-400" strokeWidth={2} />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca in tutto il database (oggetto, codice, testo)..."
              className="w-full pl-11 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 dark:text-white outline-none transition-all"
            />
          </search>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
            <div
              className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800"
              role="group"
              aria-label="Filtra per stato indicizzazione IA"
            >
              {(
                [
                  { id: 'all', label: 'Tutte' },
                  { id: 'synced', label: 'Indicizzate' },
                  { id: 'pending', label: 'Da indicizzare' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setIsLoadingList(true);
                    setEmbeddingStatus(tab.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    embeddingStatus === tab.id
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <label
                htmlFor="kb-pagesize"
                className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest"
              >
                Righe:
              </label>
              <select
                id="kb-pagesize"
                value={pageSize}
                onChange={(e) => {
                  setIsLoadingList(true);
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-transparent text-xs font-bold text-zinc-900 dark:text-white outline-none"
              >
                {[15, 25, 50, 100].map((size) => (
                  <option key={size} value={size} className="dark:bg-zinc-900">
                    {size}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest">
                / {totalItems.toLocaleString('it-IT')}
              </span>
            </div>
          </div>
        </div>

        <div className="w-full overflow-x-auto custom-scrollbar relative">
          <table className="w-full text-xs text-left min-w-[2200px] dark:text-zinc-300">
            <thead className="bg-zinc-50/70 dark:bg-zinc-900/70 border-b border-zinc-100 dark:border-zinc-800">
              <tr>
                <th className="px-3.5 py-3.5 align-top text-left text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest sticky left-0 bg-zinc-50/95 dark:bg-zinc-900/95 z-20 border-r border-zinc-100 dark:border-zinc-800">
                  Azioni
                </th>
                {(
                  [
                    ['numero_originale', 'Codice'],
                    ['riferimento', 'Riferimento'],
                    ['classe', 'Classe'],
                    ['oggetto', 'Oggetto'],
                    ['tipologia', 'Tipologia'],
                    ['argomento', 'Argomento'],
                    ['contenuto', 'Contenuto'],
                    ['prodotto_1', 'Prod. 1'],
                    ['prodotto_2', 'Prod. 2'],
                    ['prodotto_3', 'Prod. 3'],
                    ['prodotto_4', 'Prod. 4'],
                    ['prodotto_5', 'Prod. 5'],
                    ['prodotto_6', 'Prod. 6'],
                    ['data_pubblicazione', 'Data Pub.'],
                  ] as const
                ).map(([key, label]) => (
                  <SortHeader
                    key={key}
                    label={label}
                    sortKey={key}
                    onSort={requestSort}
                    activeSortKey={sortConfig?.key}
                    sortDirection={sortConfig?.direction}
                    filterable
                    filterValue={columnFilters[key] ?? ''}
                    isFilterOpen={activeFilterCol === key}
                    onToggleFilter={handleToggleFilter}
                    onFilterChange={handleFilterChange}
                  />
                ))}
                <th className="px-3.5 py-3.5 align-top text-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest bg-zinc-50/70 dark:bg-zinc-900/70">
                  Stato IA
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {isLoadingList ? (
                <tr>
                  <td colSpan={16} className="px-4 py-14 text-center bg-white dark:bg-zinc-900">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={16}
                    className="px-4 py-12 text-center font-medium text-zinc-500 dark:text-zinc-400 text-sm bg-white dark:bg-zinc-900"
                  >
                    Nessuna scheda trovata.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors bg-white dark:bg-zinc-900 text-xs"
                  >
                    <td className="px-3.5 py-3 text-left sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingItem(item)}
                          aria-label={`Visualizza ${item.oggetto}`}
                          className="p-1.5 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-zinc-900 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
                          title="Visualizza scheda"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={() => openForm(item)}
                            aria-label={`Modifica ${item.oggetto}`}
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
                            title="Modifica"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeletingItem(item)}
                            aria-label={`Elimina ${item.oggetto}`}
                            className="p-1.5 text-zinc-500 hover:text-white bg-white dark:bg-zinc-900 hover:bg-red-600 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-red-600 transition-colors"
                            title="Elimina"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-zinc-900 dark:text-white font-mono text-[11px] font-bold whitespace-nowrap">
                      {item.numero_originale || '-'}
                    </td>
                    <td className="px-3.5 py-3 text-zinc-500 dark:text-zinc-400 font-mono text-[11px] whitespace-nowrap">
                      {item.riferimento || '-'}
                    </td>
                    <td className="px-3.5 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                      {item.classe || '-'}
                    </td>
                    <td
                      className="px-3.5 py-3 font-bold text-zinc-900 dark:text-white max-w-[260px] truncate"
                      title={item.oggetto}
                    >
                      {item.oggetto}
                    </td>
                    <td className="px-3.5 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                      {item.tipologia || '-'}
                    </td>
                    <td
                      className="px-3.5 py-3 text-zinc-600 dark:text-zinc-300 max-w-[150px] truncate"
                      title={item.argomento}
                    >
                      {item.argomento || '-'}
                    </td>
                    <td
                      className="px-3.5 py-3 text-zinc-500 dark:text-zinc-400 max-w-[280px] truncate"
                      title={item.contenuto}
                    >
                      {item.contenuto || '-'}
                    </td>
                    {PRODUCT_SLOTS.map((slot) => (
                      <td
                        key={slot}
                        className="px-3.5 py-3 text-zinc-500 dark:text-zinc-400 text-[11px] max-w-[110px] truncate"
                      >
                        {getProductValue(item, slot) || '-'}
                      </td>
                    ))}
                    <td className="px-3.5 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                      {item.data_pubblicazione || '-'}
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <span
                        className="inline-flex justify-center"
                        title={
                          item.ha_embedding
                            ? "Scheda indicizzata nell'IA"
                            : 'In attesa di sincronizzazione vettori'
                        }
                      >
                        {item.ha_embedding ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" strokeWidth={2.5} />
                        ) : (
                          <CircleDashed
                            className="w-4 h-4 text-zinc-300 dark:text-zinc-600"
                            strokeWidth={2.5}
                          />
                        )}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* BARRA PAGINAZIONE */}
        <div className="px-5 py-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/60 flex items-center justify-between gap-4 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400 font-medium">
            Pagina <strong className="text-zinc-900 dark:text-white">{page}</strong> di{' '}
            <strong className="text-zinc-900 dark:text-white">{totalPages}</strong> (
            {totalItems.toLocaleString('it-IT')} schede)
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoadingList}
              onClick={() => {
                setIsLoadingList(true);
                setPage((p) => Math.max(1, p - 1));
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Precedente
            </button>
            <button
              type="button"
              disabled={page >= totalPages || isLoadingList}
              onClick={() => {
                setIsLoadingList(true);
                setPage((p) => Math.min(totalPages, p + 1));
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none"
            >
              Successiva
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL CREAZIONE / MODIFICA */}
      <ModalDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? 'Modifica Scheda KB' : 'Nuova Scheda KB'}
        size="xl"
        dismissible={!isSaving}
        footer={
          <>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setIsFormOpen(false)}
              className="px-5 py-2.5 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Annulla
            </button>
            <button
              type="submit"
              form="kb-form"
              disabled={isSaving}
              className="px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50"
            >
              {isSaving ? 'Salvataggio e indicizzazione...' : 'Conferma e Salva'}
            </button>
          </>
        }
      >
        <form id="kb-form" onSubmit={handleSubmit} className="space-y-6">
          <div>
            <h3 className="text-[11px] font-bold text-zinc-900 dark:text-white mb-3 uppercase tracking-widest flex items-center">
              <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" /> Dati Identificativi
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Codice Origine
                </label>
                <input
                  type="text"
                  value={formData.numero_originale}
                  onChange={(e) => setFormData({ ...formData, numero_originale: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Riferimento
                </label>
                <input
                  type="text"
                  value={formData.riferimento}
                  onChange={(e) => setFormData({ ...formData, riferimento: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Data Pubblicazione
                </label>
                <input
                  type="date"
                  value={formData.data_pubblicazione}
                  onChange={(e) => setFormData({ ...formData, data_pubblicazione: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-bold text-zinc-900 dark:text-white mb-3 uppercase tracking-widest flex items-center">
              <span className="w-2 h-2 rounded-full bg-purple-500 mr-2" /> Classificazione
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Classe
                </label>
                <input
                  type="text"
                  value={formData.classe}
                  onChange={(e) => setFormData({ ...formData, classe: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Tipologia
                </label>
                <input
                  type="text"
                  value={formData.tipologia}
                  onChange={(e) => setFormData({ ...formData, tipologia: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Argomento
                </label>
                <input
                  type="text"
                  value={formData.argomento}
                  onChange={(e) => setFormData({ ...formData, argomento: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-bold text-zinc-900 dark:text-white mb-3 uppercase tracking-widest flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" /> Prodotti Coinvolti
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {PRODUCT_SLOTS.map((slot) => (
                <div key={slot} className="space-y-1">
                  <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                    Slot {slot}
                  </label>
                  <input
                    type="text"
                    value={getProductValue(formData, slot)}
                    onChange={(e) => setProductValue(slot, e.target.value)}
                    className="w-full px-2.5 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-medium dark:text-white outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-bold text-zinc-900 dark:text-white mb-3 uppercase tracking-widest flex items-center">
              <span className="w-2 h-2 rounded-full bg-orange-500 mr-2" /> Contenuto Tecnico
            </h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Oggetto (Titolo) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.oggetto}
                  onChange={(e) => setFormData({ ...formData, oggetto: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold dark:text-white outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Contenuto / Soluzione *
                </label>
                <textarea
                  required
                  value={formData.contenuto}
                  onChange={(e) => setFormData({ ...formData, contenuto: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs min-h-[160px] leading-relaxed dark:text-white font-medium outline-none"
                />
              </div>
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* MODAL DETTAGLIO */}
      <ModalDialog
        open={Boolean(viewingItem)}
        onClose={() => setViewingItem(null)}
        title="Dettaglio Scheda KB"
        subtitle={viewingItem?.numero_originale || 'Nessun codice origine'}
        size="xl"
        headerActions={
          canWrite && viewingItem ? (
            <button
              type="button"
              onClick={() => openForm(viewingItem)}
              className="px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-xs font-bold rounded-xl transition-colors"
            >
              Modifica
            </button>
          ) : undefined
        }
      >
        {viewingItem && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/70 dark:border-zinc-800">
              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                  Codice Origine
                </span>
                <span className="text-xs font-semibold">{viewingItem.numero_originale || '-'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                  Riferimento
                </span>
                <span className="text-xs font-semibold">{viewingItem.riferimento || '-'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                  Data Pubblicazione
                </span>
                <span className="text-xs font-semibold">{viewingItem.data_pubblicazione || '-'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/70 dark:border-zinc-800">
              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                  Classe
                </span>
                <span className="text-xs font-semibold">{viewingItem.classe || '-'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                  Tipologia
                </span>
                <span className="text-xs font-semibold">{viewingItem.tipologia || '-'}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                  Argomento
                </span>
                <span className="text-xs font-semibold">{viewingItem.argomento || '-'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/70 dark:border-zinc-800">
              {PRODUCT_SLOTS.map((slot) => (
                <div key={slot}>
                  <span className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                    Slot {slot}
                  </span>
                  <span className="text-xs font-semibold">
                    {getProductValue(viewingItem, slot) || '-'}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 space-y-4">
              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                  Oggetto (Titolo)
                </span>
                <p className="text-sm font-bold text-zinc-900 dark:text-white">
                  {viewingItem.oggetto}
                </p>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                  Contenuto Tecnico
                </span>
                <div className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-medium bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200/60 dark:border-zinc-800">
                  {viewingItem.contenuto}
                </div>
              </div>
            </div>
          </div>
        )}
      </ModalDialog>

      <ConfirmDialog
        open={Boolean(deletingItem)}
        onClose={() => setDeletingItem(null)}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
        title="Elimina scheda Knowledge Base?"
        description={`Sei sicuro di voler eliminare la scheda "${deletingItem?.oggetto || ''}"? L'operazione non è reversibile.`}
        confirmLabel="Elimina scheda"
      />
    </div>
  );
}
