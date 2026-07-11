'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Eye, EyeOff } from 'lucide-react';

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState({ nominativo: '', email: '', password: '' });
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('crm_user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      setUser(parsed);
      setFormData({ nominativo: parsed.nominativo, email: parsed.email, password: parsed.password });
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ text: 'Salvataggio in corso...', type: 'info' });

    const { data, error } = await supabase
      .from('utenti')
      .update({
        nominativo: formData.nominativo,
        email: formData.email,
        password: formData.password
      })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      setMessage({ text: 'Errore durante l\'aggiornamento.', type: 'error' });
    } else {
      setMessage({ text: 'Profilo aggiornato con successo.', type: 'success' });
      localStorage.setItem('crm_user', JSON.stringify(data));
      setUser(data);
    }
  };

  if (!user) return null;

  return (
    <div className="p-10 font-sans antialiased max-w-3xl">
      <div className="mb-8 mt-2">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-1">Il Mio Profilo</h1>
        <p className="text-base text-gray-500 font-medium">Gestisci le tue informazioni personali e le credenziali di accesso.</p>
      </div>

      <div className="bg-white rounded-[24px] shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-gray-100 p-8">
        {message.text && (
          <div className={`p-4 rounded-2xl mb-6 text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-600' : message.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-900'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2 pl-1">Username <span className="text-gray-400 font-normal">(Non modificabile)</span></label>
            <input type="text" disabled value={user.username} className="w-full p-4 bg-gray-50 border-0 rounded-2xl text-gray-400 cursor-not-allowed font-medium" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2 pl-1">Nominativo Completo</label>
            <input type="text" required value={formData.nominativo} onChange={(e) => setFormData({...formData, nominativo: e.target.value})} className="w-full p-4 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium transition-all" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2 pl-1">Indirizzo Email</label>
            <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full p-4 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium transition-all" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2 pl-1">Password di Accesso</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                required 
                value={formData.password} 
                onChange={(e) => setFormData({...formData, password: e.target.value})} 
                className="w-full p-4 pr-12 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium transition-all" 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-900 transition-colors"
              >
                {showPassword ? <EyeOff className="h-5 w-5" strokeWidth={1.5} /> : <Eye className="h-5 w-5" strokeWidth={1.5} />}
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 mt-8">
            <button type="submit" className="px-6 py-3.5 bg-gray-900 text-white font-semibold rounded-2xl hover:bg-black transition-colors text-sm">
              Salva Modifiche
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}