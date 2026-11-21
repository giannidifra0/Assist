'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  Mail,
  ShieldCheck,
} from 'lucide-react';

function getSafeNextPath(rawNext: string | null): string {
  if (!rawNext) return '/dashboard';
  if (rawNext.startsWith('/dashboard') && !rawNext.startsWith('//')) {
    return rawNext;
  }
  return '/dashboard';
}

function LoginFormContent() {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [resetFeedback, setResetFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const nextPath = getSafeNextPath(searchParams.get('next'));
  const reasonMessage =
    reason === 'inactive'
      ? "Il tuo account è stato disabilitato dall'amministratore."
      : reason === 'session'
        ? "Sessione scaduta o account non abilitato. Effettua nuovamente l'accesso."
        : '';

  useEffect(() => {
    localStorage.removeItem('crm_user');
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Credenziali non valide o errate.');
      }

      router.replace(nextPath);
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Si è verificato un errore durante l'accesso.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setResetFeedback('');

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Impossibile inviare il link di recupero.');
      }

      setResetFeedback(
        data.message ||
          "Se l'email è valida, riceverai a breve il link per reimpostare la password."
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Errore durante la richiesta di recupero.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-center items-center p-4 relative overflow-hidden transition-colors">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] bg-zinc-200/50 dark:bg-blue-950/20 rounded-full blur-[110px] pointer-events-none" />

      <div className="w-full max-w-[430px] bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-[2.25rem] shadow-2xl border border-zinc-200/80 dark:border-zinc-800 p-8 sm:p-10 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-zinc-900 dark:bg-white rounded-[1.25rem] flex items-center justify-center mb-5 shadow-md">
            <span className="text-white dark:text-zinc-900 font-extrabold text-2xl tracking-widest">
              ZA
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Z-Assist
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-2 font-medium text-center">
            {mode === 'login'
              ? 'Accedi alla piattaforma aziendale protetta.'
              : 'Recupera l’accesso al tuo account.'}
          </p>
        </div>

        {(error || reasonMessage) && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50/90 dark:bg-red-950/50 rounded-2xl flex items-start text-red-700 dark:text-red-300 border border-red-200/80 dark:border-red-900/60"
          >
            <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            <p className="text-sm font-medium leading-snug">{error || reasonMessage}</p>
          </div>
        )}

        {resetFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="mb-6 p-4 bg-emerald-50/90 dark:bg-emerald-950/50 rounded-2xl flex items-start text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-900/60"
          >
            <CheckCircle2 className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            <p className="text-sm font-medium leading-snug">{resetFeedback}</p>
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest ml-1"
              >
                Indirizzo Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 focus:border-zinc-400 dark:focus:border-zinc-600 outline-none transition-all text-sm font-medium text-zinc-900 dark:text-white shadow-sm"
                placeholder="nome.cognome@azienda.it"
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between ml-1">
                <label
                  htmlFor="password"
                  className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest"
                >
                  Password di accesso
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError('');
                    setResetFeedback('');
                  }}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Password dimenticata?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="done"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3.5 pr-12 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 focus:border-zinc-400 dark:focus:border-zinc-600 outline-none transition-all text-sm font-medium text-zinc-900 dark:text-white shadow-sm"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                  aria-pressed={showPassword}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors rounded-lg"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center px-5 py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-sm shadow-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifica credenziali...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Accedi al Sistema
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetRequest} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="reset-email"
                className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest ml-1"
              >
                Email dell&apos;account
              </label>
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="send"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 focus:border-zinc-400 dark:focus:border-zinc-600 outline-none transition-all text-sm font-medium text-zinc-900 dark:text-white shadow-sm"
                placeholder="nome.cognome@azienda.it"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center px-5 py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-50 text-sm shadow-lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Invio in corso...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Invia link di ripristino
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
                setResetFeedback('');
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Torna al Login
            </button>
          </form>
        )}

        <div className="mt-7 pt-5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-center gap-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Sessione protetta con cookie HTTP sicuri</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
