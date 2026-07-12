'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, BookOpen, Users, LogOut, UserCircle, Sparkles, Menu, X, Settings } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const storedUser = localStorage.getItem('crm_user');
    if (!storedUser) {
      router.push('/login');
    } else {
      setUser(JSON.parse(storedUser));
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('crm_chat_history');
    localStorage.removeItem('crm_user');
    router.push('/login');
  };

  if (!user) return <div className="min-h-screen bg-zinc-50"></div>;

  return (
    <div className="min-h-screen bg-zinc-50 flex font-sans antialiased text-zinc-900">
      
      {/* HEADER MOBILE (Visibile solo su schermi piccoli) */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-xl border-b border-zinc-200 z-50 flex items-center justify-between px-4">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center mr-3 shadow-sm">
            <span className="text-white font-bold text-sm tracking-widest">ZA</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">Z-Assist</span>
        </div>
        <button onClick={() => setIsMobileOpen(!isMobileOpen)} className="p-2 text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">
          {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* OVERLAY SFONDO MOBILE (Chiude il menu cliccando fuori) */}
      {isMobileOpen && (
        <div className="fixed inset-0 bg-zinc-900/20 z-40 md:hidden" onClick={() => setIsMobileOpen(false)} />
      )}

      {/* SIDEBAR APPLE STYLE */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-zinc-50 md:bg-zinc-50/80 md:backdrop-blur-xl border-r border-zinc-200/60 flex flex-col transform transition-transform duration-300 ease-in-out ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="hidden md:flex h-16 items-center px-6 mt-4">
          <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center mr-3 shadow-sm">
            <span className="text-white font-bold text-sm tracking-widest">ZA</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">Z-Assist</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto mt-16 md:mt-0">
          <Link onClick={() => setIsMobileOpen(false)} href="/dashboard" className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${pathname === '/dashboard' ? 'bg-white shadow-sm border border-zinc-200/50 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-200/40 hover:text-zinc-900'}`}>
            <LayoutDashboard className="h-4 w-4 mr-3" strokeWidth={1.25} />
            Dashboard
          </Link>
          
          <Link onClick={() => setIsMobileOpen(false)} href="/dashboard/knowledge" className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${pathname === '/dashboard/knowledge' ? 'bg-white shadow-sm border border-zinc-200/50 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-200/40 hover:text-zinc-900'}`}>
            <BookOpen className="h-4 w-4 mr-3" strokeWidth={1.25} />
            Knowledge Base
          </Link>

          <Link onClick={() => setIsMobileOpen(false)} href="/dashboard/chat" className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${pathname.includes('/chat') ? 'bg-white shadow-sm border border-zinc-200/50 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-200/40 hover:text-zinc-900'}`}>
            <Sparkles className="h-4 w-4 mr-3" strokeWidth={1.25} />
            Assistente IA
          </Link>

          {user.ruolo === 'admin' && (
            <Link onClick={() => setIsMobileOpen(false)} href="/dashboard/users" className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${pathname.includes('/users') ? 'bg-white shadow-sm border border-zinc-200/50 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-200/40 hover:text-zinc-900'}`}>
              <Users className="h-4 w-4 mr-3" strokeWidth={1.25} />
              Gestione Utenti
            </Link>
          )}
        </nav>

        {/* PROFILO E LOGOUT */}
        <div className="p-4 mb-4">
          <Link onClick={() => setIsMobileOpen(false)} href="/dashboard/profile" className="flex items-center px-3 py-3 bg-white border border-zinc-200/60 rounded-2xl shadow-sm mb-2 hover:bg-zinc-50 transition-colors group">
            <UserCircle className="h-8 w-8 text-zinc-300 group-hover:text-zinc-500 transition-colors mr-3" strokeWidth={1} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">{user.nominativo}</p>
              <p className="text-xs text-zinc-500 capitalize">{user.ruolo}</p>
            </div>
            <Settings className="h-4 w-4 text-zinc-400 group-hover:text-zinc-600" strokeWidth={1.5} />
          </Link>
          <button onClick={handleLogout} className="w-full flex items-center justify-center px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors">
            <LogOut className="h-4 w-4 mr-2" strokeWidth={1.5} />
            Disconnetti
          </button>
        </div>
      </aside>

      {/* CONTENUTO CENTRALE */}
      <main className="flex-1 overflow-y-auto bg-zinc-50 pt-16 md:pt-0 w-full">
        <div className="max-w-6xl mx-auto p-4 md:p-8 lg:p-10 w-full overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}