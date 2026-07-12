'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { LogIn, AlertCircle } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    localStorage.removeItem('crm_user');
    localStorage.removeItem('crm_chat_history');
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data: users, error: dbError } = await supabase
        .from('utenti')
        .select('*')
        .eq('email', email)
        .eq('password', password);

      if (dbError) throw dbError;

      if (users && users.length > 0) {
        const user = users[0];
        if (!user.attivo) {
          setError('Il tuo account è stato disabilitato.');
        } else {
          localStorage.setItem('crm_user', JSON.stringify(user));
          router.push('/dashboard');
        }
      } else {
        setError('Email o password non valide.');
      }
    } catch (err: any) {
      setError('Errore di connessione al server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-zinc-200/80 p-8 md:p-10">
        
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
            <span className="text-white font-bold text-xl tracking-widest">ZA</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Accedi a Z-Assist</h1>
          <p className="text-zinc-500 text-sm mt-2 text-center">Inserisci le tue credenziali per continuare.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-xl flex items-center text-red-600 text-sm border border-red-100">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none transition-all text-sm" 
              placeholder="tuo@indirizzo.it"
              required 
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none transition-all text-sm" 
              placeholder="••••••••"
              required 
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full flex items-center justify-center px-4 py-3.5 mt-2 bg-zinc-900 text-white font-medium rounded-xl hover:bg-zinc-800 transition-all disabled:opacity-50 text-sm shadow-sm"
          >
            {isLoading ? 'Accesso in corso...' : (
              <>
                <LogIn className="w-4 h-4 mr-2" />
                Accedi al CRM
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}