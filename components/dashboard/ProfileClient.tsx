'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, ShieldCheck, UserCircle } from 'lucide-react';
import { ROLE_META } from '@/lib/auth/roles';
import { useToast } from '@/components/ui/ToastProvider';
import type { UserProfile } from '@/lib/types/domain';

export function ProfileClient({ initialUser }: { initialUser: UserProfile }) {
  const [nominativo, setNominativo] = useState(initialUser.nominativo);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const { showToast } = useToast();
  const roleMeta = ROLE_META[initialUser.ruolo];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password && password.length < 8) {
      showToast('La nuova password deve contenere almeno 8 caratteri.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nominativo: nominativo.trim(), password }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        user?: UserProfile;
        error?: string;
      };

      if (!res.ok || !data.success || !data.user) {
        throw new Error(data.error || 'Impossibile aggiornare il profilo.');
      }

      setNominativo(data.user.nominativo);
      setPassword('');
      showToast('Profilo aggiornato con successo.', 'success');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore durante il salvataggio.';
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl pb-8">
      <div className="mb-6 mt-2">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1.5">
          Il Mio Profilo
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
          Gestisci il tuo nominativo, le credenziali di accesso e verifica il tuo livello di
          permessi.
        </p>
      </div>

      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-[2.25rem] shadow-lg border border-zinc-200/70 dark:border-zinc-800 p-7 md:p-11 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-[0.04] pointer-events-none">
          <UserCircle className="w-56 h-56 text-zinc-900 dark:text-white" />
        </div>

        <div className="mb-8 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/70 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10 max-w-2xl">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <p className="text-xs font-bold text-zinc-900 dark:text-white">
                Ruolo attivo: {roleMeta.label}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{roleMeta.description}</p>
            </div>
          </div>
          <span
            className={`inline-flex items-center self-start sm:self-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${roleMeta.badgeClass}`}
          >
            {roleMeta.label}
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-6 relative z-10 max-w-2xl">
          <div className="space-y-1.5">
            <label
              htmlFor="profile-username"
              className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1"
            >
              Username Identificativo
            </label>
            <input
              id="profile-username"
              type="text"
              disabled
              value={initialUser.username}
              className="w-full px-5 py-3.5 bg-zinc-100 dark:bg-zinc-950/60 border border-transparent dark:border-zinc-800/60 rounded-2xl text-zinc-500 dark:text-zinc-400 cursor-not-allowed font-medium text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profile-nominativo"
              className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1"
            >
              Nominativo Completo
            </label>
            <input
              id="profile-nominativo"
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={nominativo}
              onChange={(e) => setNominativo(e.target.value)}
              className="w-full px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 dark:text-white outline-none text-zinc-900 font-medium text-sm transition-all shadow-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profile-email"
              className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1"
            >
              Email di Contatto / Login
            </label>
            <input
              id="profile-email"
              type="email"
              disabled
              value={initialUser.email}
              className="w-full px-5 py-3.5 bg-zinc-100 dark:bg-zinc-950/60 border border-transparent dark:border-zinc-800/60 rounded-2xl text-zinc-500 dark:text-zinc-400 cursor-not-allowed font-medium text-sm"
            />
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium ml-2">
              L&apos;email di login può essere modificata solo dall&apos;amministratore.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profile-password"
              className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest ml-1"
            >
              Nuova Password
            </label>
            <div className="relative">
              <input
                id="profile-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-3.5 pr-12 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 dark:text-white outline-none text-zinc-900 font-medium text-sm transition-all shadow-sm"
                placeholder="Lascia vuoto per non modificare (min 8 caratteri)"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-4 flex items-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="submit"
              disabled={isLoading}
              className="px-7 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-50 inline-flex items-center shadow-md text-sm"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salva Modifiche Profilo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
