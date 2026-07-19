'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Search, Edit, Trash2, Plus, X, ArrowUpDown, Shield, User, Loader2 } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
type Utente = { id: string; email: string; username: string; ruolo: string; attivo: boolean; nominativo: string; };

export default function UsersPage() {
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalEmail, setOriginalEmail] = useState('');
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
        const aVal = String(a[sortConfig.key] ?? '').toLowerCase();
        const bVal = String(b[sortConfig.key] ?? '').toLowerCase();
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
      const payload = { ...formData, action: editingId ? 'UPDATE' : 'CREATE', id: editingId, originalEmail };
      const res = await fetch('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await fetchUtenti();
      setIsFormOpen(false);
    } catch (error: any) { alert("Errore salvataggio: " + error.message); } 
    finally { setIsLoading(false); }
  };

  const handleDelete = async (u: Utente) => {
    if (!confirm(`Vuoi davvero eliminare l'utente ${u.nominativo}?`)) return;
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ action: 'DELETE', id: u.id, email: u.email }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await fetchUtenti();
    } catch (error: any) { alert("Errore eliminazione: " + error.message); }
  };

  const openForm = (u?: Utente) => {
    if (u) {
      setOriginalEmail(u.email);
      setFormData({ email: u.email, username: u.username, ruolo: u.ruolo, attivo: u.attivo, password: '', nominativo: u.nominativo });
      setEditingId(u.id);
    } else {
      setOriginalEmail('');
      setFormData({ email: '', username: '', ruolo: 'utente', attivo: true, password: '', nominativo: '' });
      setEditingId(null);
    }
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const SortHeader = ({ label, sortKey }: { label: string, sortKey: keyof Utente }) => (
    <th className="px-5 py-4 cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors whitespace-nowrap" onClick={() => requestSort(sortKey)}>
      <div className="flex items-center text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
        {label} <ArrowUpDown className="ml-2 h-3 w-3" />
      </div>
    </th>
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Gestione Utenti</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 font-medium">Amministra gli accessi e i privilegi della piattaforma.</p>
        </div>
        <button onClick={() => openForm()} className="flex items-center justify-center w-full sm:w-auto px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-lg">
          <Plus className="w-5 h-5 mr-2" /> Nuovo Utente
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-6 md:p-8 rounded-[2rem] shadow-xl border border-zinc-200/60 dark:border-zinc-800 animate-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{editingId ? 'Modifica Anagrafica' : 'Crea Nuovo Accesso'}</h2>
            <button onClick={() => setIsFormOpen(false)} className="p-2 bg-zinc-50 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-full transition-colors"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Nominativo</label><input type="text" value={formData.nominativo} onChange={e => setFormData({...formData, nominativo: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none text-sm font-medium transition-all" required /></div>
              <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Username</label><input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none text-sm font-medium transition-all" required /></div>
              <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Email di Login</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none text-sm font-medium transition-all" required /></div>
              <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{editingId ? 'Nuova Password (Opzionale)' : 'Password Iniziale'}</label><input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none text-sm font-medium transition-all" placeholder="••••••••" required={!editingId} /></div>
              <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Livello Accesso</label><select value={formData.ruolo} onChange={e => setFormData({...formData, ruolo: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none text-sm font-medium transition-all"><option value="utente">Utente Standard</option><option value="admin">Amministratore (Admin)</option></select></div>
              <div className="space-y-1.5 md:pt-6">
                <label className="flex items-center cursor-pointer group">
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" checked={formData.attivo} onChange={e => setFormData({...formData, attivo: e.target.checked})} />
                    <div className="w-11 h-6 bg-zinc-200 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500 dark:peer-checked:bg-green-500"></div>
                  </div>
                  <span className="ml-3 text-sm font-bold text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">Abilita Accesso CRM</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button type="submit" disabled={isLoading} className="w-full sm:w-auto px-8 py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center shadow-lg">
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Elaborazione...</> : 'Conferma e Salva'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-[2rem] shadow-sm border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" strokeWidth={2} />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Cerca per nome, email o username..." className="w-full pl-11 pr-4 py-3 bg-zinc-50/50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none transition-all" />
          </div>
        </div>
        
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[800px] dark:text-zinc-300">
            <thead className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800/80">
              <tr>
                <SortHeader label="Stato" sortKey="attivo" />
                <SortHeader label="Utente" sortKey="nominativo" />
                <SortHeader label="Credenziali" sortKey="email" />
                <SortHeader label="Privilegi" sortKey="ruolo" />
                <th className="px-5 py-4 text-right text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {sortedAndFilteredUtenti.map(u => (
                <tr key={u.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors group">
                  <td className="px-5 py-4">
                    {u.attivo 
                      ? <span className="inline-flex items-center px-2.5 py-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200/60 dark:border-green-800 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm"><span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>Attivo</span>
                      : <span className="inline-flex items-center px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm"><span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 mr-1.5"></span>Sospeso</span>
                    }
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                        <User className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                      </div>
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-zinc-100">{u.nominativo}</div>
                        <div className="text-zinc-500 dark:text-zinc-500 text-[11px] mt-0.5 font-medium uppercase tracking-wider">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-zinc-600 dark:text-zinc-400 font-medium">{u.email}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${u.ruolo === 'admin' ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white shadow-sm' : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'}`}>
                      {u.ruolo === 'admin' && <Shield className="w-3 h-3 mr-1.5" strokeWidth={2.5} />}
                      {u.ruolo}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openForm(u)} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm transition-all"><Edit className="w-4 h-4"/></button>
                      <button onClick={() => handleDelete(u)} className="p-2 text-zinc-500 hover:text-white bg-white dark:bg-zinc-800 hover:bg-red-500 dark:hover:bg-red-600 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-red-500 dark:hover:border-red-600 shadow-sm transition-all"><Trash2 className="w-4 h-4"/></button>
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