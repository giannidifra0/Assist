'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Download,
  Edit,
  Eye,
  FileText,
  Layers,
  Loader2,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { hasPermission } from '@/lib/auth/roles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { SortHeader } from '@/components/ui/SortHeader';
import { useToast } from '@/components/ui/ToastProvider';
import type { ManualChunk, ManualDocument, UserRole } from '@/lib/types/domain';

type ManualSortKey = keyof ManualDocument;

export function ManualsClient({ userRole }: { userRole: UserRole }) {
  const [documenti, setDocumenti] = useState<ManualDocument[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deletingDoc, setDeletingDoc] = useState<ManualDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [editingDoc, setEditingDoc] = useState<ManualDocument | null>(null);
  const [editForm, setEditForm] = useState({ titolo: '', prodotto: '', versione: '' });
  const [isSavingDoc, setIsSavingDoc] = useState(false);

  const [chunksDoc, setChunksDoc] = useState<ManualDocument | null>(null);
  const [chunks, setChunks] = useState<ManualChunk[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [chunkSearch, setChunkSearch] = useState('');
  const [savingChunkId, setSavingChunkId] = useState<string | null>(null);
  const [deletingChunk, setDeletingChunk] = useState<ManualChunk | null>(null);
  const [isDeletingChunk, setIsDeletingChunk] = useState(false);

  const [sortConfig, setSortConfig] = useState<{
    key: ManualSortKey;
    direction: 'asc' | 'desc';
  } | null>({ key: 'created_at', direction: 'desc' });
  const [rowLimit, setRowLimit] = useState<string>('15');
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ManualSortKey, string>>>({});
  const [activeFilterCol, setActiveFilterCol] = useState<ManualSortKey | null>(null);

  const { showToast } = useToast();
  const canManage = hasPermission(userRole, 'manuals:manage');

  const fetchDocumenti = useCallback(
    async (withSpinner = true) => {
      if (withSpinner) setIsLoading(true);
      try {
        const res = await fetch('/api/manuals');
        const data = (await res.json()) as {
          success?: boolean;
          manuals?: ManualDocument[];
          error?: string;
        };
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Errore caricamento manuali.');
        }
        setDocumenti(data.manuals ?? []);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Errore caricamento manuali.';
        showToast(msg, 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/manuals');
        const data = (await res.json()) as {
          success?: boolean;
          manuals?: ManualDocument[];
          error?: string;
        };
        if (!active) return;
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Errore caricamento manuali.');
        }
        setDocumenti(data.manuals ?? []);
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Errore caricamento manuali.';
          showToast(msg, 'error');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showToast]);

  const processedItems = useMemo(() => {
    let result = [...documenti];

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter(
        (item) =>
          (item.titolo ?? '').toLowerCase().includes(q) ||
          (item.prodotto ?? '').toLowerCase().includes(q)
      );
    }

    result = result.filter((item) =>
      Object.entries(columnFilters).every(([key, filterValue]) => {
        if (!filterValue) return true;
        const val = item[key as ManualSortKey];
        return String(val ?? '').toLowerCase().includes(filterValue.toLowerCase());
      })
    );

    if (sortConfig !== null) {
      result.sort((a, b) => {
        const aVal = String(a[sortConfig.key] ?? '').toLowerCase();
        const bVal = String(b[sortConfig.key] ?? '').toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    const numericLimit = Number(rowLimit);
    if (rowLimit.trim() !== '' && Number.isFinite(numericLimit) && numericLimit > 0) {
      return result.slice(0, numericLimit);
    }

    return result;
  }, [documenti, searchTerm, sortConfig, columnFilters, rowLimit]);

  const filteredChunks = useMemo(() => {
    const q = chunkSearch.trim().toLowerCase();
    if (!q) return chunks;
    return chunks.filter(
      (c) =>
        c.capitolo.toLowerCase().includes(q) || c.testo.toLowerCase().includes(q)
    );
  }, [chunks, chunkSearch]);

  const requestSort = (key: ManualSortKey) => {
    setSortConfig((prev) =>
      prev && prev.key === key && prev.direction === 'asc'
        ? { key, direction: 'desc' }
        : { key, direction: 'asc' }
    );
  };

  const handleToggleFilter = (key: ManualSortKey) => {
    setActiveFilterCol((prev) => (prev === key ? null : key));
  };

  const handleFilterChange = (key: ManualSortKey, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const openEditMetadata = (doc: ManualDocument) => {
    setEditingDoc(doc);
    setEditForm({
      titolo: doc.titolo || '',
      prodotto: doc.prodotto || '',
      versione: doc.versione || '1.0',
    });
  };

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    setIsSavingDoc(true);
    try {
      const res = await fetch('/api/manuals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingDoc.id,
          titolo: editForm.titolo.trim(),
          prodotto: editForm.prodotto.trim(),
          versione: editForm.versione.trim() || '1.0',
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Impossibile aggiornare i metadati.');
      }
      setEditingDoc(null);
      showToast('Metadati del manuale aggiornati.', 'success');
      await fetchDocumenti(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Errore salvataggio.', 'error');
    } finally {
      setIsSavingDoc(false);
    }
  };

  const openChunksDrawer = async (doc: ManualDocument) => {
    setChunksDoc(doc);
    setChunkSearch('');
    setIsLoadingChunks(true);
    setChunks([]);

    try {
      const res = await fetch(`/api/manuals/${encodeURIComponent(doc.id)}/chunks`);
      const data = (await res.json()) as {
        success?: boolean;
        chunks?: ManualChunk[];
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Impossibile caricare le sezioni.');
      }
      setChunks(data.chunks ?? []);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Errore caricamento sezioni.', 'error');
    } finally {
      setIsLoadingChunks(false);
    }
  };

  const handleSaveChunk = async (chunk: ManualChunk) => {
    if (!chunksDoc) return;
    setSavingChunkId(chunk.id);
    try {
      const res = await fetch(`/api/manuals/${encodeURIComponent(chunksDoc.id)}/chunks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunkId: chunk.id,
          capitolo: chunk.capitolo,
          pagina: chunk.pagina,
          testo: chunk.testo,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Impossibile aggiornare la sezione.');
      }
      showToast("Sezione aggiornata e ri-indicizzata dall'IA.", 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Errore aggiornamento sezione.', 'error');
    } finally {
      setSavingChunkId(null);
    }
  };

  const handleConfirmDeleteChunk = async () => {
    if (!chunksDoc || !deletingChunk) return;
    setIsDeletingChunk(true);
    try {
      const res = await fetch(
        `/api/manuals/${encodeURIComponent(chunksDoc.id)}/chunks?chunkId=${encodeURIComponent(deletingChunk.id)}`,
        { method: 'DELETE' }
      );
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Impossibile eliminare la sezione.');
      }
      setChunks((prev) => prev.filter((c) => c.id !== deletingChunk.id));
      setDeletingChunk(null);
      showToast('Sezione eliminata dal database IA.', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Errore eliminazione sezione.', 'error');
    } finally {
      setIsDeletingChunk(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingDoc) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/delete-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingDoc.id }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; message?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Errore durante l'eliminazione.");
      }

      setDeletingDoc(null);
      showToast(data.message || 'Manuale eliminato con successo.', 'success');
      await fetchDocumenti();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore durante l'eliminazione.";
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="space-y-6 md:space-y-8 w-full pb-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Archivio Manuali PDF
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 font-medium">
            Consulta, apri, modifica metadati e gestisci le sezioni indicizzate dall&apos;IA.
          </p>
        </div>

        {canManage && (
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-md group self-start lg:self-auto"
          >
            Carica nuovo PDF
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Link>
        )}
      </div>

      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-[2rem] shadow-sm border border-zinc-200/70 dark:border-zinc-800 flex flex-col overflow-hidden w-full">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <search className="relative w-full max-w-md">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-zinc-400" strokeWidth={2} />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca manuale per titolo o prodotto..."
              className="w-full pl-11 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 dark:text-white outline-none transition-all"
            />
          </search>

          <div className="flex items-center gap-3 w-full sm:w-auto bg-zinc-50 dark:bg-zinc-950 px-4 py-2 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <label
              htmlFor="manuals-limit"
              className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest"
            >
              Mostra:
            </label>
            <input
              id="manuals-limit"
              type="number"
              min={1}
              value={rowLimit}
              onChange={(e) => setRowLimit(e.target.value)}
              placeholder="Tutti"
              className="w-16 px-2 py-1 text-sm font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none dark:text-white text-center"
            />
            <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest">
              / {documenti.length}
            </span>
          </div>
        </div>

        <div className="w-full overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs text-left min-w-[820px] dark:text-zinc-300">
            <thead className="bg-zinc-50/70 dark:bg-zinc-900/70 border-b border-zinc-100 dark:border-zinc-800">
              <tr>
                <th className="px-3.5 py-3.5 align-top text-left text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest sticky left-0 bg-zinc-50/95 dark:bg-zinc-900/95 z-20 border-r border-zinc-100 dark:border-zinc-800">
                  Azioni
                </th>
                {(
                  [
                    ['titolo', 'Titolo Manuale'],
                    ['prodotto', 'Prodotto'],
                    ['versione', 'Versione'],
                    ['created_at', 'Caricato il'],
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
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center bg-white dark:bg-zinc-900">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" />
                  </td>
                </tr>
              ) : processedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center font-medium text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 text-sm"
                  >
                    Nessun manuale archiviato.
                  </td>
                </tr>
              ) : (
                processedItems.map((doc) => {
                  const hasPdf = Boolean(doc.pdf_url && doc.pdf_url !== 'NESSUNO');
                  const encodedFile = doc.pdf_url ? encodeURIComponent(doc.pdf_url) : '';

                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors bg-white dark:bg-zinc-900 text-xs"
                    >
                      <td className="px-3.5 py-3 text-left sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-1.5">
                          {hasPdf && (
                            <>
                              <a
                                href={`/api/download?file=${encodedFile}&inline=1`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Anteprima PDF nel browser"
                                aria-label={`Anteprima ${doc.titolo}`}
                                className="p-1.5 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-zinc-900 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </a>
                              <a
                                href={`/api/download?file=${encodedFile}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Scarica PDF originale"
                                aria-label={`Scarica ${doc.titolo}`}
                                className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => void openChunksDrawer(doc)}
                            title="Visualizza o modifica sezioni estratte"
                            aria-label={`Sezioni di ${doc.titolo}`}
                            className="p-1.5 text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
                          >
                            <Layers className="w-3.5 h-3.5" />
                          </button>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditMetadata(doc)}
                                title="Modifica titolo, prodotto o versione"
                                aria-label={`Modifica metadati ${doc.titolo}`}
                                className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingDoc(doc)}
                                aria-label={`Elimina ${doc.titolo}`}
                                className="p-1.5 text-zinc-500 hover:text-white bg-white dark:bg-zinc-900 hover:bg-red-600 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-red-600 transition-colors"
                                title="Elimina manuale"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-3.5 py-3">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center mr-2.5 border border-blue-100 dark:border-blue-800/40 shrink-0">
                            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <span className="font-bold text-zinc-900 dark:text-white text-xs">
                            {doc.titolo || 'Senza Titolo'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-zinc-600 dark:text-zinc-300 font-semibold">
                        {doc.prodotto || '-'}
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded text-[11px] font-bold font-mono border border-zinc-200 dark:border-zinc-700">
                          v {doc.versione || '1.0'}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-zinc-500 dark:text-zinc-400 text-[11px] font-medium">
                        {formatDate(doc.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL MODIFICA METADATI */}
      <ModalDialog
        open={Boolean(editingDoc)}
        onClose={() => setEditingDoc(null)}
        title="Modifica Metadati Manuale"
        subtitle={editingDoc?.titolo}
        size="md"
        dismissible={!isSavingDoc}
        footer={
          <>
            <button
              type="button"
              disabled={isSavingDoc}
              onClick={() => setEditingDoc(null)}
              className="px-4 py-2 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-800"
            >
              Annulla
            </button>
            <button
              type="submit"
              form="manual-meta-form"
              disabled={isSavingDoc}
              className="px-5 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSavingDoc && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salva Metadati
            </button>
          </>
        }
      >
        <form id="manual-meta-form" onSubmit={handleSaveMetadata} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="edit-manual-title"
              className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest"
            >
              Titolo Manuale *
            </label>
            <input
              id="edit-manual-title"
              type="text"
              required
              value={editForm.titolo}
              onChange={(e) => setEditForm({ ...editForm, titolo: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label
                htmlFor="edit-manual-product"
                className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest"
              >
                Prodotto
              </label>
              <input
                id="edit-manual-product"
                type="text"
                value={editForm.prodotto}
                onChange={(e) => setEditForm({ ...editForm, prodotto: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="edit-manual-version"
                className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest"
              >
                Versione
              </label>
              <input
                id="edit-manual-version"
                type="text"
                value={editForm.versione}
                onChange={(e) => setEditForm({ ...editForm, versione: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
              />
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* DRAWER GESTIONE CHUNK MANUALE */}
      <ModalDialog
        open={Boolean(chunksDoc)}
        onClose={() => setChunksDoc(null)}
        title="Sezioni Indicizzate (Chunk)"
        subtitle={chunksDoc?.titolo}
        variant="drawer"
        size="xl"
        icon={<Layers className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />}
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <search className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="search"
                value={chunkSearch}
                onChange={(e) => setChunkSearch(e.target.value)}
                placeholder="Cerca dentro le sezioni del manuale..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs dark:text-white outline-none"
              />
            </search>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 shrink-0">
              {filteredChunks.length} / {chunks.length} sezioni
            </span>
          </div>

          {isLoadingChunks ? (
            <div className="py-16 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" />
            </div>
          ) : filteredChunks.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-10">
              Nessuna sezione trovata per questo manuale.
            </p>
          ) : (
            <div className="space-y-4">
              {filteredChunks.map((chunk) => (
                <div
                  key={chunk.id}
                  className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                        Capitolo / Sezione
                      </label>
                      <input
                        type="text"
                        disabled={!canManage}
                        value={chunk.capitolo}
                        onChange={(e) =>
                          setChunks((prev) =>
                            prev.map((c) =>
                              c.id === chunk.id ? { ...c, capitolo: e.target.value } : c
                            )
                          )
                        }
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl dark:text-white outline-none disabled:opacity-75"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                        Pagina
                      </label>
                      <input
                        type="number"
                        min={1}
                        disabled={!canManage}
                        value={chunk.pagina}
                        onChange={(e) =>
                          setChunks((prev) =>
                            prev.map((c) =>
                              c.id === chunk.id
                                ? { ...c, pagina: Number(e.target.value) || 1 }
                                : c
                            )
                          )
                        }
                        className="w-full px-3 py-1.5 text-xs font-semibold bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl dark:text-white outline-none disabled:opacity-75"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                      Contenuto Markdown
                    </label>
                    <textarea
                      disabled={!canManage}
                      value={chunk.testo}
                      onChange={(e) =>
                        setChunks((prev) =>
                          prev.map((c) =>
                            c.id === chunk.id ? { ...c, testo: e.target.value } : c
                          )
                        )
                      }
                      className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl min-h-[110px] dark:text-white outline-none leading-relaxed disabled:opacity-80"
                    />
                  </div>

                  {canManage && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setDeletingChunk(chunk)}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Elimina
                      </button>
                      <button
                        type="button"
                        disabled={savingChunkId === chunk.id}
                        onClick={() => void handleSaveChunk(chunk)}
                        className="px-3.5 py-1.5 text-xs font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {savingChunkId === chunk.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Salva &amp; Ri-indicizza
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalDialog>

      <ConfirmDialog
        open={Boolean(deletingDoc)}
        onClose={() => setDeletingDoc(null)}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
        title="Elimina manuale PDF?"
        description={`Sei sicuro di voler eliminare "${deletingDoc?.titolo || ''}" e tutte le sue sezioni vettoriali? L'assistente IA non potrà più consultarlo.`}
        confirmLabel="Elimina manuale"
      />

      <ConfirmDialog
        open={Boolean(deletingChunk)}
        onClose={() => setDeletingChunk(null)}
        onConfirm={handleConfirmDeleteChunk}
        isLoading={isDeletingChunk}
        title="Elimina sezione del manuale?"
        description={`Vuoi rimuovere la sezione "${deletingChunk?.capitolo || ''}" (pag. ${deletingChunk?.pagina ?? 1}) dal database vettoriale IA?`}
        confirmLabel="Elimina sezione"
      />
    </div>
  );
}
