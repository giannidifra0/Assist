'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { LogIn, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Pulizia rigorosa in fase di caricamento
    const cleanup = async () => {
      localStorage.removeItem('crm_user');
      localStorage.removeItem('crm_chat_history');
      await supabase.auth.signOut();
    };
    cleanup();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // 1. AUTENTICAZIONE UFFICIALE SUPABASE (La password è criptata in modo sicuro dal sistema)
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (authError) {
        throw new Error('Credenziali non valide o errate.');
      }

      // 2. RECUPERO METADATI UTENTE (Ruolo, Nome, Stato) dalla tua tabella personalizzata
      const { data: users, error: dbError } = await supabase
        .from('utenti')
        .select('*')
        .eq('email', email);

      if (dbError) throw new Error('Errore nel recupero del profilo utente.');

      if (users && users.length > 0) {
        const user = users[0];
        
        if (!user.attivo) {
          await supabase.auth.signOut();
          throw new Error('Il tuo account è stato disabilitato dall\'amministratore.');
        } else {
          // Salviamo i metadati per la UI della dashboard, mentre Supabase gestisce la vera sessione di sicurezza
          localStorage.setItem('crm_user', JSON.stringify(user));
          router.push('/dashboard');
        }
      } else {
        await supabase.auth.signOut();
        throw new Error('Profilo utente non configurato nel gestionale.');
      }
    } catch (err: any) {
      setError(err.message || 'Si è verificato un errore durante l\'accesso.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] bg-zinc-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      
      {/* Effetto luce sfocata sullo sfondo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-zinc-200/50 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-[420px] bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-xl border border-zinc-200/60 p-10 md:p-12 relative z-10 transition-all">
        
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-zinc-900 rounded-[1.25rem] flex items-center justify-center mb-6 shadow-md transform hover:scale-105 transition-transform duration-300">
            <span className="text-white font-extrabold text-2xl tracking-widest">ZA</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Z-Assist</h1>
          <p className="text-zinc-500 text-sm mt-2.5 font-medium text-center">Accedi alla tua area di lavoro protetta.</p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50/80 backdrop-blur-sm rounded-2xl flex items-start text-red-600 border border-red-100/80 animate-in fade-in slide-in-from-top-2 duration-300">
            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium leading-snug">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Indirizzo Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="w-full px-5 py-3.5 bg-white border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 outline-none transition-all text-sm font-medium shadow-sm" 
              placeholder="nome.cognome@azienda.it"
              required 
            />
          </div>
          
          <div className="space-y-1.5 relative">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Password di accesso</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className="w-full px-5 py-3.5 pr-12 bg-white border border-zinc-200 rounded-2xl focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 outline-none transition-all text-sm font-medium shadow-sm" 
                placeholder="••••••••"
                required 
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 transition-colors focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full flex items-center justify-center px-5 py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-sm shadow-lg hover:shadow-xl"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2.5 animate-spin" />
                  Autenticazione...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2.5" />
                  Accedi al Sistema
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}