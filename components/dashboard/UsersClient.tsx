'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit, Eye, Loader2, Plus, Search, Shield, Trash2, User } from 'lucide-react';
import { ROLE_META } from '@/lib/auth/roles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { SortHeader } from '@/components/ui/SortHeader';
import { useToast } from '@/components/ui/ToastProvider';
import type { UserProfile, UserRole } from '@/lib/types/domain';

type UserSortKey = 'attivo' | 'nominativo' | 'email' | 'ruolo';

const ROLE_OPTIONS: UserRole[] = ['utente', 'editor', 'admin'];

export function UsersClient({ currentUserId }: { currentUserId: string }) {
  const [utenti, setUtenti] = useState<UserProfile[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<UserProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [sortConfig, setSortConfig] = useState<{
    key: UserSortKey;
    direction: 'asc' | 'desc';
  } | null>(null);

  const [formData, setFormData] = useState<{
    email: string;
    username: string;
    ruolo: UserRole;
    attivo: boolean;
    password: string;
    nominativo: string;
  }>({
    email: '',
    username: '',
    ruolo: 'utente',
    attivo: true,
    password: '',
    nominativo: '',
  });

  const { showToast } = useToast();

  const fetchUtenti = useCallback(
    async (withSpinner = true) => {
      if (withSpinner) setIsLoadingList(true);
      try {
        const res = await fetch('/api/admin/users');
        const data = (await res.json()) as {
          success?: boolean;
          users?: UserProfile[];
          error?: string;
        };
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Errore caricamento utenti.');
        }
        setUtenti(data.users ?? []);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Errore caricamento utenti.';
        showToast(msg, 'error');
      } finally {
        setIsLoadingList(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/admin/users');
        const data = (await res.json()) as {
          success?: boolean;
          users?: UserProfile[];
          error?: string;
        };
        if (!active) return;
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Errore caricamento utenti.');
        }
        setUtenti(data.users ?? []);
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : 'Errore caricamento utenti.';
          showToast(msg, 'error');
        }
      } finally {
        if (active) setIsLoadingList(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showToast]);

  const sortedAndFilteredUtenti = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const filtered = utenti.filter(
      (u) =>
        (u.nominativo ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.username ?? '').toLowerCase().includes(q)
    );

    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        const aVal = String(a[sortConfig.key] ?? '').toLowerCase();
        const bVal = String(b[sortConfig.key] ?? '').toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [utenti, searchTerm, sortConfig]);

  const requestSort = (key: UserSortKey) => {
    setSortConfig((prev) =>
      prev && prev.key === key && prev.direction === 'asc'
        ? { key, direction: 'desc' }
        : { key, direction: 'asc' }
    );
  };

  const openForm = (u?: UserProfile) => {
    setViewingUser(null);
    if (u) {
      setFormData({
        email: u.email,
        username: u.username,
        ruolo: u.ruolo,
        attivo: u.attivo,
        password: '',
        nominativo: u.nominativo,
      });
      setEditingId(u.id);
    } else {
      setFormData({
        email: '',
        username: '',
        ruolo: 'utente',
        attivo: true,
        password: '',
        nominativo: '',
      });
      setEditingId(null);
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        action: editingId ? 'UPDATE' : 'CREATE',
        id: editingId,
      };
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Errore salvataggio utente.');
      }

      setIsFormOpen(false);
      showToast(
        editingId ? 'Account utente aggiornato.' : 'Nuovo utente creato con successo.',
        'success'
      );
      await fetchUtenti();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore salvataggio.';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE', id: deletingUser.id }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Errore eliminazione utente.');
      }
      setDeletingUser(null);
      showToast('Account eliminato definitivamente.', 'success');
      await fetchUtenti();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore eliminazione.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const isEditingSelf = editingId === currentUserId;

  return (
    <div className="space-y-6 md:space-y-8 w-full pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Gestione Utenti &amp; Ruoli
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 font-medium">
            Amministra gli accessi, i profili operativi e i privilegi sulla piattaforma.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openForm()}
          className="flex items-center justify-center w-full sm:w-auto px-5 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-md"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Utente
        </button>
      </div>

      {/* LEGENDA RUOLI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {ROLE_OPTIONS.map((roleKey) => {
          const meta = ROLE_META[roleKey];
          return (
            <div
              key={roleKey}
              className="p-4 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/70 dark:border-zinc-800 flex flex-col gap-1.5"
            >
              <span
                className={`inline-flex items-center self-start px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${meta.badgeClass}`}
              >
                {meta.label}
              </span>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {meta.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* TABELLA UTENTI */}
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-[2rem] shadow-sm border border-zinc-200/70 dark:border-zinc-800 overflow-hidden">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-zinc-400" strokeWidth={2} />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca per nome, email o username..."
              className="w-full pl-11 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 dark:text-white outline-none transition-all"
            />
          </div>
        </div>

        <div className="w-full overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs text-left min-w-[760px] dark:text-zinc-300">
            <thead className="bg-zinc-50/70 dark:bg-zinc-900/70 border-b border-zinc-100 dark:border-zinc-800">
              <tr>
                <th className="px-3.5 py-3.5 text-left text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest sticky left-0 bg-zinc-50/95 dark:bg-zinc-900/95 z-20 border-r border-zinc-100 dark:border-zinc-800">
                  Azioni
                </th>
                <SortHeader
                  label="Stato"
                  sortKey="attivo"
                  onSort={requestSort}
                  activeSortKey={sortConfig?.key}
                  sortDirection={sortConfig?.direction}
                />
                <SortHeader
                  label="Utente"
                  sortKey="nominativo"
                  onSort={requestSort}
                  activeSortKey={sortConfig?.key}
                  sortDirection={sortConfig?.direction}
                />
                <SortHeader
                  label="Email"
                  sortKey="email"
                  onSort={requestSort}
                  activeSortKey={sortConfig?.key}
                  sortDirection={sortConfig?.direction}
                />
                <SortHeader
                  label="Ruolo"
                  sortKey="ruolo"
                  onSort={requestSort}
                  activeSortKey={sortConfig?.key}
                  sortDirection={sortConfig?.direction}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {isLoadingList ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center bg-white dark:bg-zinc-900">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" />
                  </td>
                </tr>
              ) : sortedAndFilteredUtenti.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center font-medium text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 text-sm"
                  >
                    Nessun utente trovato.
                  </td>
                </tr>
              ) : (
                sortedAndFilteredUtenti.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const roleMeta = ROLE_META[u.ruolo];

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors bg-white dark:bg-zinc-900 text-xs"
                    >
                      <td className="px-3.5 py-3 text-left sticky left-0 bg-white dark:bg-zinc-900 z-10 border-r border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingUser(u)}
                            aria-label={`Visualizza ${u.nominativo}`}
                            className="p-1.5 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-zinc-900 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
                            title="Visualizza scheda"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openForm(u)}
                            aria-label={`Modifica ${u.nominativo}`}
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors"
                            title="Modifica"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => setDeletingUser(u)}
                            aria-label={`Elimina ${u.nominativo}`}
                            title={
                              isSelf
                                ? 'Non puoi eliminare il tuo stesso account mentre sei connesso'
                                : 'Elimina utente'
                            }
                            className="p-1.5 text-zinc-500 hover:text-white bg-white dark:bg-zinc-900 hover:bg-red-600 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-red-600 transition-colors disabled:opacity-35 disabled:pointer-events-none"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="px-3.5 py-3">
                        {u.attivo ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800 rounded-full text-[10px] font-bold uppercase tracking-widest">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                            Attivo
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-full text-[10px] font-bold uppercase tracking-widest">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 mr-1.5" />
                            Sospeso
                          </span>
                        )}
                      </td>

                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shrink-0">
                            <User className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                          </div>
                          <div>
                            <div className="font-bold text-zinc-900 dark:text-zinc-100 text-xs flex items-center gap-1.5">
                              {u.nominativo}
                              {isSelf && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                                  Tu
                                </span>
                              )}
                            </div>
                            <div className="text-zinc-500 dark:text-zinc-400 text-[10px] font-mono">
                              @{u.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-3.5 py-3 text-zinc-600 dark:text-zinc-300 font-medium">
                        {u.email}
                      </td>

                      <td className="px-3.5 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${roleMeta.badgeClass}`}
                        >
                          {u.ruolo === 'admin' && <Shield className="w-2.5 h-2.5 mr-1" />}
                          {roleMeta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL FORM UTENTE */}
      <ModalDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? 'Modifica Account Utente' : 'Crea Nuovo Account'}
        size="lg"
        dismissible={!isSaving}
        footer={
          <>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Annulla
            </button>
            <button
              type="submit"
              form="user-form"
              disabled={isSaving}
              className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Conferma e Salva
            </button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Nominativo *
              </label>
              <input
                type="text"
                required
                value={formData.nominativo}
                onChange={(e) => setFormData({ ...formData, nominativo: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Username *
              </label>
              <input
                type="text"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Email di Login *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                {editingId ? 'Nuova Password (Opzionale)' : 'Password Iniziale (min 8 char) *'}
              </label>
              <input
                type="password"
                minLength={editingId && !formData.password ? undefined : 8}
                required={!editingId}
                autoComplete="new-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none"
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Livello Accesso
              </label>
              <select
                value={formData.ruolo}
                disabled={isEditingSelf}
                onChange={(e) => setFormData({ ...formData, ruolo: e.target.value as UserRole })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium dark:text-white outline-none disabled:opacity-60"
              >
                {ROLE_OPTIONS.map((roleKey) => (
                  <option key={roleKey} value={roleKey}>
                    {ROLE_META[roleKey].label} ({roleKey})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {ROLE_META[formData.ruolo].description}
              </p>
            </div>

            <div className="space-y-1 md:pt-5">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isEditingSelf}
                  checked={formData.attivo}
                  onChange={(e) => setFormData({ ...formData, attivo: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 accent-emerald-600"
                />
                <span className="ml-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Abilita Accesso al Portale
                </span>
              </label>
              {isEditingSelf && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Non puoi modificare ruolo o stato del tuo stesso account.
                </p>
              )}
            </div>
          </div>
        </form>
      </ModalDialog>

      {/* MODAL DETTAGLIO UTENTE */}
      <ModalDialog
        open={Boolean(viewingUser)}
        onClose={() => setViewingUser(null)}
        title={viewingUser?.nominativo || 'Dettaglio Utente'}
        subtitle={viewingUser ? `@${viewingUser.username}` : undefined}
        size="md"
        icon={<User className="w-4 h-4 text-zinc-500" />}
        headerActions={
          viewingUser ? (
            <button
              type="button"
              onClick={() => openForm(viewingUser)}
              className="px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-xs font-bold rounded-xl"
            >
              Modifica
            </button>
          ) : undefined
        }
      >
        {viewingUser && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/70 dark:border-zinc-800">
            <div>
              <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                Email di Login
              </span>
              <span className="text-xs font-semibold">{viewingUser.email}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                Ruolo
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                  ROLE_META[viewingUser.ruolo].badgeClass
                }`}
              >
                {ROLE_META[viewingUser.ruolo].label}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                Stato Account
              </span>
              <span className="text-xs font-semibold">
                {viewingUser.attivo ? 'Attivo' : 'Sospeso'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                ID Utente
              </span>
              <span className="text-[11px] font-mono text-zinc-500 break-all">
                {viewingUser.id}
              </span>
            </div>
          </div>
        )}
      </ModalDialog>

      <ConfirmDialog
        open={Boolean(deletingUser)}
        onClose={() => setDeletingUser(null)}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
        title="Elimina account utente?"
        description={`Vuoi eliminare definitivamente l'account di ${deletingUser?.nominativo || ''} (${deletingUser?.email || ''})? L'utente perderà immediatamente l'accesso.`}
        confirmLabel="Elimina account"
      />
    </div>
  );
}
