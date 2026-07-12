'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
// Abbiamo aggiunto 'Sparkles' all'elenco delle icone importate
import { LayoutDashboard, BookOpen, Users, LogOut, UserCircle, Sparkles } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
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
    localStorage.removeItem('crm_user');
    router.push('/login');
  };

  if (!user) return <div className="min-h-screen bg-white"></div>;

  return (
    <div className="min-h-screen bg-white flex font-sans antialiased">
      {/* SIDEBAR MAC OS STYLE */}
      <aside className="w-64 bg-[#F5F5F7] border-r border-gray-200/60 flex flex-col">
        <div className="h-16 flex items-center px-6 mt-2">
          <span className="text-lg font-semibold tracking-tight text-gray-900">CRM Assist</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <Link href="/dashboard" className={`flex items-center px-3 py-2 rounded-xl text-sm font-medium transition-all ${pathname === '/dashboard' ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-gray-900' : 'text-gray-500 hover:bg-black/5 hover:text-gray-900'}`}>
            <LayoutDashboard className="h-4 w-4 mr-3" strokeWidth={1.5} />
            Dashboard
          </Link>
          
          <Link href="/dashboard/knowledge" className={`flex items-center px-3 py-2 rounded-xl text-sm font-medium transition-all ${pathname === '/dashboard/knowledge' ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-gray-900' : 'text-gray-500 hover:bg-black/5 hover:text-gray-900'}`}>
            <BookOpen className="h-4 w-4 mr-3" strokeWidth={1.5} />
            Knowledge Base
          </Link>

          {/* NUOVA VOCE: ASSISTENTE IA */}
          <Link href="/dashboard/chat" className={`flex items-center px-3 py-2 rounded-xl text-sm font-medium transition-all ${pathname.includes('/chat') ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-gray-900' : 'text-gray-500 hover:bg-black/5 hover:text-gray-900'}`}>
            <Sparkles className="h-4 w-4 mr-3" strokeWidth={1.5} />
            Assistente IA
          </Link>

          {user.ruolo === 'admin' && (
            <Link href="/dashboard/users" className={`flex items-center px-3 py-2 rounded-xl text-sm font-medium transition-all ${pathname.includes('/users') ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-gray-900' : 'text-gray-500 hover:bg-black/5 hover:text-gray-900'}`}>
              <Users className="h-4 w-4 mr-3" strokeWidth={1.5} />
              Gestione Utenti
            </Link>
          )}
        </nav>

        {/* ZONA PROFILO INFERIORE */}
        <div className="p-4 mb-2">
          <Link href="/dashboard/profile" className="flex items-center px-3 py-2.5 rounded-xl hover:bg-black/5 transition-colors mb-1 group">
            <UserCircle className="h-5 w-5 text-gray-400 group-hover:text-gray-600 mr-2.5" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.nominativo}</p>
              <p className="text-[11px] text-gray-500 font-medium capitalize">{user.ruolo}</p>
            </div>
          </Link>
          <button onClick={handleLogout} className="w-full flex items-center px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
            <LogOut className="h-4 w-4 mr-3" strokeWidth={1.5} />
            Esci
          </button>
        </div>
      </aside>

      {/* CONTENUTO CENTRALE */}
      <main className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}