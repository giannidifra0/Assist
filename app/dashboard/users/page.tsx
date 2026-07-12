'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Search, Edit, Trash2, Plus, X, ArrowUpDown, Shield } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Utente = { id: string; email: string; username: string; ruolo: string; attivo: boolean; password?: string; nominativo: string; };

export default function UsersPage() {
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Utente; direction: 'asc' | 'desc' } | null>(null);

  const [formData, setFormData] = useState({ email: '', username: '', ruolo: 'utente', attivo: true, password: '', nominativo: '' });

  const fetchUtenti = async () => {
    const { data, error } = await supabase.from('utenti').select('*');
    if (!error && data) setUtenti(data);
  };

  useEffect(() => { fetchUtenti(); }, []);

  const sortedAndFilteredUtenti = useMemo(() => {
    let filterData = utenti.filter(u => 
      (u.nominativo?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
      (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (u.username?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    if (sortConfig !== null) {
      filterData.sort((a, b) => {
        let aVal = a[sortConfig.key]; let bVal = b[sortConfig.key];
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filterData;
  }, [utenti, searchTerm, sortConfig]);

  const requestSort = (key: keyof Utente) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (editingId) await supabase.from('utenti').update(formData).eq('id', editingId);
      else await supabase.from('utenti').insert([formData]);
      await fetchUtenti();
      setIsFormOpen(false);
    } catch (error: any) { alert("Errore: " + error.message); } 
    finally { setIsLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo utente?')) return;
    await supabase.from('utenti').delete().eq('id', id);
    await fetchUtenti();
  };

  const openForm = (u?: Utente) => {
    if (u) {
      setFormData({ email: u.email, username: u.username, ruolo: u.ruolo, attivo: u.attivo, password: u.password || '', nominativo: u.nominativo });
      setEditingId(u.id);
    } else {
      setFormData({ email: '', username: '', ruolo: 'utente', attivo: true, password: '', nominativo: '' });
      setEditingId(null);
    }
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const SortHeader = ({ label, sortKey }: { label: string, sortKey: keyof Utente }) => (
    <th className="px-4 py-4 cursor-pointer hover:bg-zinc-100/50 transition-colors whitespace-nowrap" onClick={() => requestSort(sortKey)}>
      <div className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        {label} <ArrowUpDown className="ml-2 h-3 w-3" />
      </div>
    </th>
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">Utenti</h1>
          <p className="text-zinc-500 text-sm mt-1">Gestione accessi e permessi del sistema.</p>
        </div>
        <button onClick={() => openForm()} className="flex items-center justify-center w-full sm:w-auto px-5 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-800 transition-all shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Aggiungi Utente
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-zinc-200/80">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold">{editingId ? 'Modifica Utente' : 'Nuovo Utente'}</h2>
            <button onClick={() => setIsFormOpen(false)} className="text-zinc-400 hover:text-zinc-900"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Nominativo</label><input type="text" value={formData.nominativo} onChange={e => setFormData({...formData, nominativo: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" required /></div>
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Email</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" required /></div>
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Username</label><input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" required /></div>
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Password</label><input type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" required /></div>
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Ruolo</label><select value={formData.ruolo} onChange={e => setFormData({...formData, ruolo: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm"><option value="utente">Utente</option><option value="admin">Admin</option></select></div>
              <div className="flex items-center sm:mt-7">
                <input type="checkbox" checked={formData.attivo} onChange={e => setFormData({...formData, attivo: e.target.checked})} className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900" />
                <label className="ml-2 text-sm text-zinc-700 font-medium">Account Attivo</label>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button type="submit" disabled={isLoading} className="w-full sm:w-auto px-6 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-800 transition-all disabled:opacity-50">
                {isLoading ? 'Salvataggio...' : 'Salva Utente'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200/80 flex flex-col">
        <div className="p-4 border-b border-zinc-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" strokeWidth={1.5} />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Cerca utenti..." className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-1 focus:ring-zinc-900 outline-none transition-all" />
          </div>
        </div>
        
        {/* Contenitore con scroll orizzontale per schermi piccoli */}
        <div className="w-full overflow-x-auto rounded-b-2xl">
          <table className="w-full text-sm text-left min-w-[700px]">
            <thead className="bg-zinc-50/50 border-b border-zinc-100">
              <tr>
                <SortHeader label="Stato" sortKey="attivo" />
                <SortHeader label="Nominativo" sortKey="nominativo" />
                <SortHeader label="Email" sortKey="email" />
                <SortHeader label="Ruolo" sortKey="ruolo" />
                <th className="px-4 py-4 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sortedAndFilteredUtenti.map(u => (
                <tr key={u.id} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="px-4 py-3">
                    {/* Colori Funzionali Ripristinati */}
                    {u.attivo 
                      ? <span className="inline-flex items-center px-2 py-1 bg-green-50 text-green-700 border border-green-200/60 rounded-md text-[11px] font-semibold uppercase tracking-wider">Attivo</span>
                      : <span className="inline-flex items-center px-2 py-1 bg-red-50 text-red-600 border border-red-200/60 rounded-md text-[11px] font-semibold uppercase tracking-wider">Disabilitato</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">{u.nominativo}</div>
                    <div className="text-zinc-500 text-xs mt-0.5">@{u.username}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center text-zinc-600 text-xs font-medium uppercase tracking-wider">
                      {u.ruolo === 'admin' && <Shield className="w-3 h-3 mr-1 text-zinc-400" />}
                      {u.ruolo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openForm(u)} className="p-2 text-zinc-400 hover:text-zinc-900 bg-white hover:bg-zinc-100 rounded-lg border border-transparent hover:border-zinc-200 transition-all"><Edit className="w-4 h-4"/></button>
                      <button onClick={() => handleDelete(u.id)} className="p-2 text-zinc-400 hover:text-red-600 bg-white hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-all"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}