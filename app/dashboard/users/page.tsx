'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Plus, Edit, X, Shield, User, Eye, EyeOff } from 'lucide-react';

export default function UsersPage() {
  const [utenti, setUtenti] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '', nominativo: '', email: '', password: '', ruolo: 'operatore', attivo: true
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('utenti').select('*').order('data_creazione', { ascending: false });
    if (data) setUtenti(data);
    setLoading(false);
  };

  const openModal = (utente: any = null) => {
    setShowPassword(false);
    if (utente) {
      setEditingId(utente.id);
      setFormData({
        username: utente.username, nominativo: utente.nominativo, email: utente.email,
        password: utente.password, ruolo: utente.ruolo, attivo: utente.attivo
      });
    } else {
      setEditingId(null);
      setFormData({ username: '', nominativo: '', email: '', password: '', ruolo: 'operatore', attivo: true });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await supabase.from('utenti').update(formData).eq('id', editingId);
    } else {
      await supabase.from('utenti').insert([formData]);
    }
    setIsModalOpen(false);
    fetchUsers();
  };

  return (
    <div className="p-10 font-sans antialiased">
      <div className="flex justify-between items-end mb-8 mt-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-1">Gestione Utenti</h1>
          <p className="text-base text-gray-500 font-medium">Aggiungi o modifica gli operatori del CRM</p>
        </div>
        <button onClick={() => openModal()} className="bg-gray-900 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-black flex items-center transition-all text-sm">
          <Plus className="h-4 w-4 mr-2" strokeWidth={2} /> Nuovo Utente
        </button>
      </div>

      <div className="bg-white rounded-[24px] shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 font-medium text-sm">Caricamento utenti...</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 tracking-tight">
                <th className="px-6 py-4 font-medium">Utente</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Ruolo</th>
                <th className="px-6 py-4 font-medium">Stato</th>
                <th className="px-6 py-4 font-medium text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {utenti.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900 tracking-tight">{u.nominativo}</div>
                    <div className="text-sm text-gray-400 font-medium mt-0.5">@{u.username}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-medium">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${u.ruolo === 'admin' ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-600'}`}>
                      {u.ruolo === 'admin' ? <Shield className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} /> : <User className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />}
                      {u.ruolo}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${u.attivo ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                      {u.attivo ? 'Attivo' : 'Disattivato'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => openModal(u)} className="text-gray-400 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-xl transition-colors inline-flex opacity-0 group-hover:opacity-100">
                      <Edit className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[28px] shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-gray-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-50 bg-white/50">
              <h2 className="text-xl font-semibold tracking-tight text-gray-900">{editingId ? 'Modifica Utente' : 'Nuovo Utente'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors"><X className="h-5 w-5" strokeWidth={1.5} /></button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Username</label>
                  <input type="text" required disabled={!!editingId} value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full p-3.5 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium disabled:opacity-50" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Password</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} required value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full p-3.5 pr-10 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-900">
                      {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Nominativo</label>
                <input type="text" required value={formData.nominativo} onChange={(e) => setFormData({...formData, nominativo: e.target.value})} className="w-full p-3.5 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Email</label>
                <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full p-3.5 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium" />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Ruolo</label>
                  <select value={formData.ruolo} onChange={(e) => setFormData({...formData, ruolo: e.target.value})} className="w-full p-3.5 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium cursor-pointer">
                    <option value="operatore">Operatore</option>
                    <option value="admin">Amministratore</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Stato Account</label>
                  <select value={formData.attivo ? 'true' : 'false'} onChange={(e) => setFormData({...formData, attivo: e.target.value === 'true'})} className="w-full p-3.5 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium cursor-pointer">
                    <option value="true">Attivo</option>
                    <option value="false">Disattivato</option>
                  </select>
                </div>
              </div>

              <div className="pt-6 flex justify-end space-x-3 mt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-600 font-semibold hover:bg-gray-100 rounded-xl transition-colors text-sm">Annulla</button>
                <button type="submit" className="px-5 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-black transition-colors text-sm">Salva Utente</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}