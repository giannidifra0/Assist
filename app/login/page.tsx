'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/app/lib/supabase';
import { Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data: utente, error: dbError } = await supabase
      .from('utenti')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (dbError || !utente) {
      setError('Credenziali non valide o utente inesistente.');
      setLoading(false);
      return;
    }

    if (!utente.attivo) {
      setError('Questo account è disattivato.');
      setLoading(false);
      return;
    }

    localStorage.setItem('crm_user', JSON.stringify(utente));
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] font-sans antialiased p-4">
      <div className="bg-white p-10 rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.04)] w-full max-w-[400px]">
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-gray-900 rounded-[18px] mx-auto mb-5 flex items-center justify-center">
            <Lock className="h-6 w-6 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">CRM Assist</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Accedi al tuo spazio di lavoro</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-2xl mb-6 text-sm font-medium text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="text"
              required
              className="w-full p-4 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400 font-medium"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              className="w-full p-4 pr-12 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400 font-medium"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-900 transition-colors"
            >
              {showPassword ? <EyeOff className="h-5 w-5" strokeWidth={1.5} /> : <Eye className="h-5 w-5" strokeWidth={1.5} />}
            </button>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white font-semibold p-4 rounded-2xl hover:bg-black focus:ring-4 focus:ring-gray-200 transition-all flex justify-center items-center disabled:opacity-70 text-sm"
            >
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}