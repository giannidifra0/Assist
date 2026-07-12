'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { Database, Ticket, Sparkles, RefreshCw, ArrowRight, Users } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function DashboardHome() {
  const [stats, setStats] = useState({ knowledge: 0, users: 0, tickets: 0 });
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    // Recupera l'utente
    const storedUser = localStorage.getItem('crm_user');
    if (storedUser) {
      const userObj = JSON.parse(storedUser);
      setUserName(userObj.nominativo.split(' ')[0]); // Prende solo il nome
      if (userObj.ruolo === 'admin') setIsAdmin(true);
    }

    async function fetchDashboardData() {
      // Conteggi usando l'approccio nativo di Supabase
      const { count: kbCount } = await supabase.from('knowledge_base').select('*', { count: 'exact', head: true });
      const { count: usersCount } = await supabase.from('utenti').select('*', { count: 'exact', head: true });
      
      // Catturiamo l'errore internamente senza far esplodere la Promise
      const { count: ticketsCount, error: ticketsError } = await supabase.from('tickets').select('*', { count: 'exact', head: true });

      setStats({ 
        knowledge: kbCount || 0,
        users: usersCount || 0,
        // Se la tabella tickets non esiste, ticketsError sarà popolato e impostiamo 0
        tickets: ticketsError ? 0 : (ticketsCount || 0)
      });
    }

    fetchDashboardData();
  }, []);

  const handleSyncEmbeddings = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/embeddings');
      const data = await response.json();
      if (data.ERRORE_FATALE) alert("❌ Errore: " + data.ERRORE_FATALE);
      else alert("✅ Sincronizzazione IA completata con successo.");
    } catch (error) {
      alert("❌ Errore di connessione durante la sincronizzazione.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      
      {/* Intestazione */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
          Bentornato, {userName}
        </h1>
        <p className="text-zinc-500 text-sm mt-1">Ecco una panoramica del tuo sistema Z-Assist.</p>
      </div>

      {/* Griglia Statistiche - Ridimensionata per maggiore eleganza */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-2xl shadow-sm border border-zinc-200/80 flex flex-col justify-center transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Documenti IA</h2>
            <Database className="w-4 h-4 text-zinc-400" />
          </div>
          <p className="text-3xl font-semibold text-zinc-900">{stats.knowledge}</p>
        </div>

        <div className="p-5 bg-white rounded-2xl shadow-sm border border-zinc-200/80 flex flex-col justify-center transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ticket Censiti</h2>
            <Ticket className="w-4 h-4 text-zinc-400" />
          </div>
          <p className="text-3xl font-semibold text-zinc-900">{stats.tickets}</p>
        </div>

        <div className="p-5 bg-white rounded-2xl shadow-sm border border-zinc-200/80 flex flex-col justify-center transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Utenti Attivi</h2>
            <Users className="w-4 h-4 text-zinc-400" />
          </div>
          <p className="text-3xl font-semibold text-zinc-900">{stats.users}</p>
        </div>
      </div>

      {/* Azioni Rapide - Più compatte e proporzionate */}
      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-zinc-200/80">
        <h3 className="text-sm font-semibold text-zinc-900 mb-4 uppercase tracking-wider">Azioni Rapide</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/dashboard/chat"
            className="inline-flex items-center justify-between px-5 py-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-all shadow-sm group sm:min-w-[240px]"
          >
            <div className="flex items-center">
              <Sparkles className="w-4 h-4 mr-2.5 text-zinc-300" />
              <span className="font-medium text-sm">Apri Assistente IA</span>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors transform group-hover:translate-x-1" />
          </Link>

          {isAdmin && (
            <button
              onClick={handleSyncEmbeddings}
              disabled={isSyncing}
              className="inline-flex items-center justify-between px-5 py-3 bg-zinc-50 border border-zinc-200 text-zinc-900 rounded-xl hover:bg-zinc-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed group sm:min-w-[240px]"
            >
              <div className="flex items-center">
                <RefreshCw className={`w-4 h-4 mr-2.5 text-zinc-500 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="font-medium text-sm">{isSyncing ? "Sincronizzazione..." : "Sincronizza Dati IA"}</span>
              </div>
              {!isSyncing && <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 transition-colors transform group-hover:translate-x-1" />}
            </button>
          )}
        </div>
      </div>
      
    </div>
  );
}