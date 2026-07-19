'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Eye, EyeOff, UserCircle, ShieldCheck, Loader2 } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState({ nominativo: '', email: '', password: '' });
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('crm_user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      setUser(parsed);
      setFormData({ nominativo: parsed.nominativo, email: parsed.email, password: '' }); 
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ text: '', type: '' });
    try {
      if (formData.password) {
        const { error: authError } = await supabase.auth.updateUser({ password: formData.password });
        if (authError) throw new Error(`Errore Sicurezza: ${authError.message}`);
      }
      const { data, error: dbError } = await supabase.from('utenti').update({ nominativo: formData.nominativo }).eq('id', user.id).select().single();
      if (dbError) throw new Error(`Errore Database: ${dbError.message}`);
      setMessage({ text: 'Profilo aggiornato con successo.', type: 'success' });
      localStorage.setItem('crm_user', JSON.stringify(data));
      setUser(data);
      setFormData(prev => ({ ...prev, password: '' })); 
    } catch (err: any) { setMessage({ text: err.message, type: 'error' }); } 
    finally { setIsLoading(false); }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl animate-in fade-in duration-500">
      <div className="mb-8 mt-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white mb-2">Il Mio Profilo</h1>
        <p className="text-base text-zinc-500 dark:text-zinc-400 font-medium">Gestisci le tue informazioni personali e le credenziali di accesso.</p>
      </div>

      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-[2.5rem] shadow-xl border border-zinc-200/60 dark:border-zinc-800/60 p-8 md:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
          <UserCircle className="w-64 h-64 text-zinc-900 dark:text-white" />
        </div>

        {message.text && (
          <div className={`p-4 rounded-2xl mb-8 flex items-center ${message.type === 'error' ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-800'}`}>
            <span className="mr-3 flex-shrink-0 text-lg">{message.type === 'error' ? '❌' : '⚡'}</span>
            <p className="text-sm font-bold">{message.text}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6 relative z-10 max-w-2xl">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">Username Identificativo</label>
            <input type="text" disabled value={user.username} className="w-full px-5 py-3.5 bg-zinc-100 dark:bg-zinc-950/50 border border-transparent dark:border-zinc-800/50 rounded-2xl text-zinc-400 dark:text-zinc-500 cursor-not-allowed font-medium text-sm" />
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-medium ml-2 mt-1">Lo username di sistema non può essere modificato.</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">Nominativo Completo</label>
            <input type="text" required value={formData.nominativo} onChange={(e) => setFormData({...formData, nominativo: e.target.value})} className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none text-zinc-900 font-medium text-sm transition-all shadow-sm" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">Email di Contatto / Login</label>
            <input type="email" disabled value={formData.email} className="w-full px-5 py-3.5 bg-zinc-100 dark:bg-zinc-950/50 border border-transparent dark:border-zinc-800/50 rounded-2xl text-zinc-400 dark:text-zinc-500 cursor-not-allowed font-medium text-sm transition-all" />
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-medium ml-2 mt-1">L'email di login può essere modificata solo dall'amministratore.</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1">Nuova Password</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full px-5 py-3.5 pr-12 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none text-zinc-900 font-medium text-sm transition-all shadow-sm" placeholder="Lascia vuoto per non modificare" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-4 flex items-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-medium ml-2 mt-1">Compila questo campo solo se desideri cambiare l'attuale password di accesso.</p>
          </div>

          <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 mt-8">
            <button type="submit" disabled={isLoading} className="px-8 py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-50 flex items-center shadow-lg hover:shadow-xl text-sm">
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salva Modifiche Profilo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}