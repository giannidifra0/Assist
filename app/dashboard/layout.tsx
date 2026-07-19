'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, BookOpen, Users, LogOut, UserCircle, Sparkles, Menu, X, Settings, PanelLeftClose, Moon, Sun } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const storedUser = localStorage.getItem('crm_user');
    if (!storedUser) {
      router.push('/login');
      return;
    } 
    
    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);

    const setOnline = async () => {
      await supabase.from('utenti').update({ is_online: true }).eq('id', parsedUser.id);
    };
    setOnline();

    const handleBeforeUnload = () => {
      navigator.sendBeacon(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/utenti?id=eq.${parsedUser.id}`,
        JSON.stringify({ is_online: false })
      );
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const savedTheme = localStorage.getItem('crm_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [router]);

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('crm_theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('crm_theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const handleLogout = async () => {
    if (user?.id) await supabase.from('utenti').update({ is_online: false }).eq('id', user.id);
    localStorage.removeItem('crm_chat_history');
    localStorage.removeItem('crm_user');
    router.push('/login');
  };

  if (!user) return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950"></div>;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex font-sans antialiased text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      
      {/* HEADER MOBILE */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 z-50 flex items-center justify-between px-4 transition-colors">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-zinc-900 dark:bg-white rounded-lg flex items-center justify-center mr-3 shadow-sm">
            <span className="text-white dark:text-zinc-900 font-bold text-sm tracking-widest">ZA</span>
          </div>
          <span className="text-lg font-semibold tracking-tight dark:text-white">Z-Assist</span>
        </div>
        <button onClick={() => setIsMobileOpen(!isMobileOpen)} className="p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
          {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {isMobileOpen && <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsMobileOpen(false)} />}

      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-50 bg-zinc-50/90 md:bg-zinc-50/80 dark:bg-zinc-950/90 md:dark:bg-zinc-950/80 backdrop-blur-xl border-r border-zinc-200/60 dark:border-zinc-800/60 flex flex-col transform transition-all duration-500 ease-in-out 
        ${isMobileOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full md:translate-x-0'} 
        ${isCollapsed ? 'md:w-[84px]' : 'md:w-[260px]'} md:relative`}>
        
        {/* BOTTONE FLUTTUANTE (Esclusivo Desktop) */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)} 
          className={`hidden md:flex absolute top-7 z-50 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg transition-all duration-500 shadow-sm hover:shadow 
          ${isCollapsed ? 'left-[84px] -translate-x-1/2' : 'left-[260px] -translate-x-1/2'}`}
        >
          <PanelLeftClose className={`w-4 h-4 transition-transform duration-500 ${isCollapsed ? 'rotate-180' : ''}`} />
        </button>

        {/* HEADER SIDEBAR (Logo) */}
        <div className="hidden md:flex h-20 items-center mt-2 relative w-full overflow-hidden">
          <div className={`absolute left-0 flex items-center h-full transition-all duration-500 ease-in-out ${isCollapsed ? 'translate-x-[24px]' : 'translate-x-6'}`}>
             <div className="w-9 h-9 shrink-0 bg-zinc-900 dark:bg-white rounded-[10px] flex items-center justify-center shadow-sm">
               <span className="text-white dark:text-zinc-900 font-bold text-sm tracking-widest">ZA</span>
             </div>
             <span className={`font-bold text-lg tracking-tight dark:text-white whitespace-nowrap transition-all duration-500 ease-in-out overflow-hidden ${isCollapsed ? 'opacity-0 max-w-0 ml-0' : 'opacity-100 max-w-[150px] ml-3'}`}>
               Z-Assist
             </span>
          </div>
        </div>

        {/* MENU DI NAVIGAZIONE */}
        <nav className="flex-1 overflow-y-auto mt-16 md:mt-2 space-y-2 px-3 custom-scrollbar overflow-x-hidden">
          
          <Link onClick={() => setIsMobileOpen(false)} href="/dashboard" className={`flex items-center h-[44px] rounded-xl text-[14px] font-semibold transition-all duration-300 group overflow-hidden
            ${pathname === '/dashboard' ? 'bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200/60 dark:border-zinc-800 text-zinc-900 dark:text-white' : 'border border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/40 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white'} 
            ${isCollapsed ? 'pl-[19px] mx-1' : 'px-4 mx-1'}`}>
            <LayoutDashboard className="w-5 h-5 shrink-0" strokeWidth={1.5} />
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-500 ease-in-out ${isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'}`}>Dashboard</span>
          </Link>
          
          <Link onClick={() => setIsMobileOpen(false)} href="/dashboard/knowledge" className={`flex items-center h-[44px] rounded-xl text-[14px] font-semibold transition-all duration-300 group overflow-hidden
            ${pathname === '/dashboard/knowledge' ? 'bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200/60 dark:border-zinc-800 text-zinc-900 dark:text-white' : 'border border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/40 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white'} 
            ${isCollapsed ? 'pl-[19px] mx-1' : 'px-4 mx-1'}`}>
            <BookOpen className="w-5 h-5 shrink-0" strokeWidth={1.5} />
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-500 ease-in-out ${isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'}`}>Knowledge Base</span>
          </Link>

          <Link onClick={() => setIsMobileOpen(false)} href="/dashboard/chat" className={`flex items-center h-[44px] rounded-xl text-[14px] font-semibold transition-all duration-300 group overflow-hidden
            ${pathname.includes('/chat') ? 'bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200/60 dark:border-zinc-800 text-zinc-900 dark:text-white' : 'border border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/40 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white'} 
            ${isCollapsed ? 'pl-[19px] mx-1' : 'px-4 mx-1'}`}>
            <Sparkles className="w-5 h-5 shrink-0" strokeWidth={1.5} />
            <span className={`whitespace-nowrap overflow-hidden transition-all duration-500 ease-in-out ${isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'}`}>Assistente IA</span>
          </Link>

          {user.ruolo === 'admin' && (
            <Link onClick={() => setIsMobileOpen(false)} href="/dashboard/users" className={`flex items-center h-[44px] rounded-xl text-[14px] font-semibold transition-all duration-300 group overflow-hidden
              ${pathname.includes('/users') ? 'bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200/60 dark:border-zinc-800 text-zinc-900 dark:text-white' : 'border border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/40 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white'} 
              ${isCollapsed ? 'pl-[19px] mx-1' : 'px-4 mx-1'}`}>
              <Users className="w-5 h-5 shrink-0" strokeWidth={1.5} />
              <span className={`whitespace-nowrap overflow-hidden transition-all duration-500 ease-in-out ${isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'}`}>Gestione Utenti</span>
            </Link>
          )}
        </nav>

        {/* SEZIONE INFERIORE */}
        <div className="mt-auto px-4 pb-5 space-y-4 pt-4 border-t border-zinc-200/30 dark:border-zinc-800/30 w-full overflow-x-hidden">
          
          {/* SWITCH DARK MODE */}
          <button onClick={toggleTheme} className={`relative flex items-center bg-zinc-200/60 dark:bg-zinc-900/80 border border-zinc-300/50 dark:border-zinc-800 rounded-full transition-all duration-500 ease-in-out overflow-hidden mx-auto ${isCollapsed ? 'w-10 h-10 justify-center' : 'w-full h-9 p-1'}`}>
            {isCollapsed ? (
              isDarkMode ? <Moon className="w-[18px] h-[18px] text-zinc-400" /> : <Sun className="w-[18px] h-[18px] text-zinc-500" />
            ) : (
              <>
               <div className={`flex items-center justify-center w-1/2 h-full z-10 transition-colors duration-300 ${!isDarkMode ? 'text-zinc-900 font-bold' : 'text-zinc-500 font-medium'}`}>
                 <Sun className="w-3.5 h-3.5 mr-1.5" /> <span className="text-[10px] uppercase tracking-widest">Light</span>
               </div>
               <div className={`flex items-center justify-center w-1/2 h-full z-10 transition-colors duration-300 ${isDarkMode ? 'text-white font-bold' : 'text-zinc-500 font-medium'}`}>
                 <Moon className="w-3.5 h-3.5 mr-1.5" /> <span className="text-[10px] uppercase tracking-widest">Dark</span>
               </div>
               <div className={`absolute left-1 top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-zinc-800 shadow-sm rounded-full transition-transform duration-500 ease-in-out ${isDarkMode ? 'translate-x-full' : 'translate-x-0'}`}></div>
              </>
            )}
          </button>

          {/* BOX PROFILO */}
          <Link onClick={() => setIsMobileOpen(false)} href="/dashboard/profile" className={`flex items-center bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm hover:shadow hover:-translate-y-0.5 transition-all duration-500 ease-in-out group overflow-hidden mx-auto ${isCollapsed ? 'w-10 h-10 rounded-full justify-center p-0' : 'w-full p-2.5 rounded-2xl'}`}>
             <UserCircle className={`shrink-0 text-zinc-300 dark:text-zinc-600 transition-all duration-500 ${isCollapsed ? 'w-10 h-10' : 'w-9 h-9'}`} strokeWidth={1} />
             <div className={`flex-1 min-w-0 transition-all duration-500 ease-in-out flex items-center overflow-hidden ${isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'}`}>
               <div className="flex-1 truncate pr-2">
                 <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{user.nominativo}</p>
                 <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest">{user.ruolo}</p>
               </div>
               <Settings className="w-4 h-4 shrink-0 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors mr-1" strokeWidth={2} />
             </div>
          </Link>

          {/* PULSANTE DISCONNETTI */}
          <button onClick={handleLogout} className={`flex items-center text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-all duration-500 ease-in-out overflow-hidden mx-auto ${isCollapsed ? 'w-10 h-10 rounded-full justify-center bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 pl-0' : 'w-full pl-2 py-1.5'}`}>
             <LogOut className="w-4 h-4 shrink-0" strokeWidth={2} />
             <span className={`font-semibold text-sm transition-all duration-500 ease-in-out whitespace-nowrap overflow-hidden ${isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[150px] opacity-100 ml-3'}`}>Disconnetti</span>
          </button>
        </div>
      </aside>

      {/* CONTENUTO CENTRALE */}
      <main className="flex-1 overflow-y-auto w-full transition-colors duration-300 relative z-0">
        <div className="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 w-full overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}