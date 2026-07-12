'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Search, Edit, Trash2, Plus, X, Save, UserCheck, UserX } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Utente = {
  id: string;
  email: string | null;
  username: string | null;
  ruolo: string | null;
  attivo: boolean | null;
  password?: string | null;
  nominativo: string | null;
  data_creazione?: string;
};

export default function UsersPage() {
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    ruolo: 'utente',
    attivo: true,
    password: '',
    nominativo: ''
  });

  const fetchUtenti = async () => {
    const { data, error } = await supabase
      .from('utenti')
      .select('*')
      .order('data_creazione', { ascending: false });

    if (!error && data) {
      setUtenti(data);
    }
  };

  useEffect(() => {
    fetchUtenti();
  }, []);

  const filteredUtenti = utenti.filter(u => 
    (u.nominativo?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
    (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (u.username?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (u.ruolo?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const handleAddNew = () => {
    setFormData({ email: '', username: '', ruolo: 'utente', attivo: true, password: '', nominativo: '' });
    setEditingId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (u: Utente) => {
    setFormData({
      email: u.email || '',
      username: u.username || '',
      ruolo: u.ruolo || 'utente',
      attivo: u.attivo ?? true,
      password: u.password || '',
      nominativo: u.nominativo || ''
    });
    setEditingId(u.id);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const payload = {
      email: formData.email,
      username: formData.username,
      ruolo: formData.ruolo,
      attivo: formData.attivo,
      password: formData.password,
      nominativo: formData.nominativo
    };

    try {
      if (editingId) {
        const { error } = await supabase.from('utenti').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('utenti').insert([payload]);
        if (error) throw error;
      }

      await fetchUtenti();
      setIsFormOpen(false);
    } catch (error: any) {
      alert("Errore salvataggio: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo utente in modo permanente?')) return;
    const { error } = await supabase.from('utenti').delete().eq('id', id);
    if (error) alert("Errore durante l'eliminazione.");
    else await fetchUtenti();
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti</h1>
          <p className="text-gray-500 text-sm mt-1">Amministra gli accessi e i ruoli del sistema</p>
        </div>
        <button onClick={handleAddNew} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> Nuovo Utente
        </button>
      </div>

      {/* Form */}
      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold">{editingId ? 'Modifica Utente' : 'Nuovo Utente'}</h2>
            <button onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nominativo Completo *</label>
                <input type="text" value={formData.nominativo} onChange={e => setFormData({...formData, nominativo: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Username *</label>
                <input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password *</label>
                <input type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ruolo *</label>
                <select value={formData.ruolo} onChange={e => setFormData({...formData, ruolo: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="utente">Utente Standard</option>
                  <option value="admin">Amministratore</option>
                </select>
              </div>
              <div className="flex items-center mt-6">
                <input type="checkbox" id="attivo" checked={formData.attivo} onChange={e => setFormData({...formData, attivo: e.target.checked})} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                <label htmlFor="attivo" className="ml-2 text-sm text-gray-700 font-medium">Account Attivo e Abilitato all'accesso</label>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button type="submit" disabled={isLoading} className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 text-sm">
                <Save className="w-4 h-4" /> {isLoading ? 'Salvataggio...' : 'Salva Utente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabella con Ricerca */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Cerca utente..." className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3">Stato</th>
                <th className="px-6 py-3">Nominativo & Username</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Ruolo</th>
                <th className="px-6 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUtenti.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.attivo ? 'opacity-60 bg-gray-50' : ''}`}>
                  <td className="px-6 py-3">
                    {u.attivo ? (
                      <span className="flex items-center text-green-600 text-xs font-medium"><UserCheck className="w-4 h-4 mr-1"/> Attivo</span>
                    ) : (
                      <span className="flex items-center text-red-500 text-xs font-medium"><UserX className="w-4 h-4 mr-1"/> Disabilitato</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <div className="font-medium text-gray-900">{u.nominativo}</div>
                    <div className="text-gray-500 text-xs">@{u.username}</div>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{u.email}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium uppercase ${u.ruolo === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {u.ruolo}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right flex justify-end gap-3 mt-1">
                    <button onClick={() => handleEdit(u)} className="text-blue-600 hover:text-blue-900"><Edit className="w-4 h-4"/></button>
                    <button onClick={() => handleDelete(u.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
                  </td>
                </tr>
              ))}
              {filteredUtenti.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Nessun utente trovato.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}