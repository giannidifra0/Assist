'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  Settings,
  Sparkles,
  Sun,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { hasPermission, ROLE_META } from '@/lib/auth/roles';
import type { UserProfile } from '@/lib/types/domain';

function resolveIsDark(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem('color-scheme');
  if (saved === 'dark') return true;
  if (saved === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyScheme(scheme: 'light' | 'dark' | 'light dark'): void {
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute('content', scheme);
  }
  const dark =
    scheme === 'dark' ||
    (scheme === 'light dark' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

const THEME_EVENT = 'zassist-theme-change';

function subscribeToTheme(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handleMediaChange = () => {
    if (!localStorage.getItem('color-scheme')) {
      applyScheme('light dark');
      onStoreChange();
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === 'color-scheme') {
      const nextScheme =
        event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : 'light dark';
      applyScheme(nextScheme);
      onStoreChange();
    }
  };

  const handleLocalChange = () => onStoreChange();

  mediaQuery.addEventListener('change', handleMediaChange);
  window.addEventListener('storage', handleStorage);
  window.addEventListener(THEME_EVENT, handleLocalChange);

  return () => {
    mediaQuery.removeEventListener('change', handleMediaChange);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(THEME_EVENT, handleLocalChange);
  };
}

export function DashboardShell({
  user,
  children,
}: {
  user: UserProfile;
  children: ReactNode;
}) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isDarkMode = useSyncExternalStore(subscribeToTheme, resolveIsDark, () => false);

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Segnala presenza online tramite endpoint server autenticato
    void fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true }),
    }).catch(() => undefined);

    const markOffline = () => {
      const payload = new Blob([JSON.stringify({ online: false })], {
        type: 'application/json',
      });
      navigator.sendBeacon('/api/presence', payload);
    };

    window.addEventListener('pagehide', markOffline);
    window.addEventListener('beforeunload', markOffline);

    return () => {
      window.removeEventListener('pagehide', markOffline);
      window.removeEventListener('beforeunload', markOffline);
    };
  }, []);

  const toggleTheme = () => {
    const currentlyDark = resolveIsDark();
    const targetScheme: 'light' | 'dark' = currentlyDark ? 'light' : 'dark';
    const osScheme: 'light' | 'dark' = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

    if (targetScheme !== osScheme) {
      localStorage.setItem('color-scheme', targetScheme);
      applyScheme(targetScheme);
    } else {
      localStorage.removeItem('color-scheme');
      applyScheme('light dark');
    }

    window.dispatchEvent(new Event(THEME_EVENT));
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Procede comunque con pulizia locale e redirect
    }
    localStorage.removeItem('crm_chat_history');
    localStorage.removeItem('crm_chat_history_v2');
    localStorage.removeItem('crm_user');
    router.replace('/login');
    router.refresh();
  };

  const canManageUsers = hasPermission(user.ruolo, 'users:manage');
  const roleMeta = ROLE_META[user.ruolo];

  const navItems = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard',
    },
    {
      href: '/dashboard/knowledge',
      label: 'Knowledge Base',
      icon: BookOpen,
      active: pathname.startsWith('/dashboard/knowledge'),
    },
    {
      href: '/dashboard/manuals',
      label: 'Archivio Manuali',
      icon: FileText,
      active: pathname.startsWith('/dashboard/manuals'),
    },
    {
      href: '/dashboard/chat',
      label: 'Assistente IA',
      icon: Sparkles,
      active: pathname.startsWith('/dashboard/chat'),
    },
  ];

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950 flex font-sans antialiased text-zinc-900 dark:text-zinc-100 transition-colors duration-300 overflow-hidden">
      {/* HEADER MOBILE */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 z-40 flex items-center justify-between px-4 transition-colors">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-zinc-900 dark:bg-white rounded-lg flex items-center justify-center mr-3 shadow-sm">
            <span className="text-white dark:text-zinc-900 font-bold text-sm tracking-widest">
              ZA
            </span>
          </div>
          <span className="text-lg font-semibold tracking-tight dark:text-white">Z-Assist</span>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileOpen((prev) => !prev)}
          aria-label={isMobileOpen ? 'Chiudi menu' : 'Apri menu'}
          className="p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
        >
          {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-zinc-50/95 md:bg-zinc-50/85 dark:bg-zinc-950/95 md:dark:bg-zinc-950/85 backdrop-blur-xl border-r border-zinc-200/70 dark:border-zinc-800/70 flex flex-col transform transition-all duration-300 ease-in-out h-screen shrink-0 ${
          isMobileOpen ? 'translate-x-0 w-[264px]' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'md:w-[84px]' : 'md:w-[264px]'} md:sticky md:top-0`}
      >
        {/* BOTTONE COLLASSA SIDEBAR DESKTOP */}
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-label={isCollapsed ? 'Espandi barra laterale' : 'Comprimi barra laterale'}
          className={`hidden md:flex absolute top-7 z-50 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg transition-all duration-300 shadow-sm ${
            isCollapsed ? 'left-[84px] -translate-x-1/2' : 'left-[264px] -translate-x-1/2'
          }`}
        >
          <PanelLeftClose
            className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
          />
        </button>

        {/* LOGO SIDEBAR */}
        <div className="hidden md:flex h-20 items-center mt-2 relative w-full overflow-hidden">
          <div className="absolute left-0 flex items-center h-full translate-x-6">
            <div className="w-9 h-9 shrink-0 bg-zinc-900 dark:bg-white rounded-[10px] flex items-center justify-center shadow-sm">
              <span className="text-white dark:text-zinc-900 font-bold text-sm tracking-widest">
                ZA
              </span>
            </div>
            <span
              className={`font-bold text-lg tracking-tight dark:text-white whitespace-nowrap transition-all duration-300 overflow-hidden ${
                isCollapsed ? 'opacity-0 max-w-0 ml-0' : 'opacity-100 max-w-[150px] ml-3'
              }`}
            >
              Z-Assist
            </span>
          </div>
        </div>

        {/* NAVIGAZIONE */}
        <nav className="flex-1 overflow-y-auto mt-16 md:mt-2 space-y-1.5 px-3 custom-scrollbar overflow-x-hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                title={isCollapsed ? item.label : undefined}
                className={`flex items-center h-[40px] rounded-xl px-3.5 mx-1 text-[13px] font-semibold transition-all duration-200 overflow-hidden ${
                  item.active
                    ? 'bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200/70 dark:border-zinc-800 text-zinc-900 dark:text-white'
                    : 'border border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
                <span
                  className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
                    isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* FOOTER SIDEBAR */}
        <div className="shrink-0 px-4 pb-5 space-y-3.5 pt-4 border-t border-zinc-200/60 dark:border-zinc-800/60 w-full overflow-x-hidden">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDarkMode ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
            className={`relative flex items-center bg-zinc-200/70 dark:bg-zinc-900/90 border border-zinc-300/60 dark:border-zinc-800 rounded-full transition-all duration-300 overflow-hidden mx-auto ${
              isCollapsed ? 'w-10 h-10 justify-center' : 'w-full h-9 p-1'
            }`}
          >
            {isCollapsed ? (
              isDarkMode ? (
                <Moon className="w-[17px] h-[17px] text-zinc-300" />
              ) : (
                <Sun className="w-[17px] h-[17px] text-zinc-600" />
              )
            ) : (
              <>
                <div
                  className={`flex items-center justify-center w-1/2 h-full z-10 transition-colors ${
                    !isDarkMode ? 'text-zinc-900 font-bold' : 'text-zinc-500 font-medium'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 mr-1.5" />
                  <span className="text-[10px] uppercase tracking-widest">Light</span>
                </div>
                <div
                  className={`flex items-center justify-center w-1/2 h-full z-10 transition-colors ${
                    isDarkMode ? 'text-white font-bold' : 'text-zinc-500 font-medium'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5 mr-1.5" />
                  <span className="text-[10px] uppercase tracking-widest">Dark</span>
                </div>
                <div
                  className={`absolute left-1 top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-zinc-800 shadow-sm rounded-full transition-transform duration-300 ${
                    isDarkMode ? 'translate-x-full' : 'translate-x-0'
                  }`}
                />
              </>
            )}
          </button>

          <Link
            href="/dashboard/profile"
            onClick={() => setIsMobileOpen(false)}
            className={`flex items-center bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm hover:shadow transition-all duration-200 group overflow-hidden mx-auto ${
              isCollapsed ? 'w-10 h-10 rounded-full justify-center p-0' : 'w-full p-2.5 rounded-2xl'
            }`}
          >
            <UserCircle
              className={`shrink-0 text-zinc-400 dark:text-zinc-500 ${
                isCollapsed ? 'w-7 h-7' : 'w-9 h-9'
              }`}
              strokeWidth={1.3}
            />
            <div
              className={`flex-1 min-w-0 transition-all duration-300 flex items-center overflow-hidden ${
                isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'
              }`}
            >
              <div className="flex-1 truncate pr-2">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {user.nominativo}
                </p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest">
                  {roleMeta.label}
                </p>
              </div>
              <Settings
                className="w-4 h-4 shrink-0 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors mr-1"
                strokeWidth={2}
              />
            </div>
          </Link>

          <div className={`flex items-center gap-2 overflow-hidden ${isCollapsed ? 'flex-col' : ''}`}>
            {canManageUsers && (
              <Link
                href="/dashboard/users"
                onClick={() => setIsMobileOpen(false)}
                title="Gestione Utenti"
                className={`flex items-center justify-center transition-all overflow-hidden ${
                  isCollapsed
                    ? 'w-10 h-10 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    : 'flex-1 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800'
                } ${
                  pathname.startsWith('/dashboard/users')
                    ? 'text-zinc-900 dark:text-white bg-zinc-200/50 dark:bg-zinc-800/70'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" strokeWidth={2} />
                <span
                  className={`font-semibold text-xs whitespace-nowrap overflow-hidden transition-all duration-300 ${
                    isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[100px] opacity-100 ml-2'
                  }`}
                >
                  Utenti
                </span>
              </Link>
            )}
            <button
              type="button"
              onClick={handleLogout}
              title="Disconnetti"
              className={`flex items-center justify-center text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-all overflow-hidden ${
                isCollapsed
                  ? 'w-10 h-10 rounded-full hover:bg-red-50 dark:hover:bg-red-950/40'
                  : 'flex-1 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40'
              }`}
            >
              <LogOut className="w-4 h-4 shrink-0" strokeWidth={2} />
              <span
                className={`font-semibold text-xs whitespace-nowrap overflow-hidden transition-all duration-300 ${
                  isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[100px] opacity-100 ml-2'
                }`}
              >
                Esci
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* CONTENUTO PRINCIPALE */}
      <main className="flex-1 overflow-y-auto custom-scrollbar w-full relative z-0 h-screen flex flex-col">
        <div className="max-w-[1600px] mx-auto px-3 py-4 pt-20 md:pt-6 md:px-6 lg:px-8 lg:py-8 w-full flex-1 flex flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}
