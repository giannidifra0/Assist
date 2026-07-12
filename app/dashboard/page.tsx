'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DashboardHome() {
  const [stats, setStats] = useState({ knowledge: 0, tickets: 0 });
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // 1. VERIFICA RUOLO ADMIN (Ora legge dal localStorage, identico alla Sidebar)
    const storedUser = localStorage.getItem('crm_user');
    if (storedUser) {
      const userObj = JSON.parse(storedUser);
      if (userObj.ruolo === 'admin') {
        setIsAdmin(true);
      }
    }

    // 2. RECUPERA I CONTEGGI
    async function fetchDashboardData() {
      const { count: kbCount } = await supabase
        .from('knowledge_base')
        .select('*', { count: 'exact', head: true });

      // Se non hai ancora la tabella tickets, potrebbe dare errore silenzioso.
      // Mostrerà semplicemente 0.
      const { count: ticketsCount, error } = await supabase
        .from('tickets') 
        .select('*', { count: 'exact', head: true });

      setStats({ 
        knowledge: kbCount || 0,
        tickets: ticketsCount || 0
      });
    }

    fetchDashboardData();
  }, []);

  const handleSyncEmbeddings = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/embeddings');
      const data = await response.json();
      
      if (data.ERRORE_FATALE) {
        alert("❌ Errore: " + data.ERRORE_FATALE);
      } else {
        alert("✅ " + data.message);
      }
    } catch (error) {
      alert("❌ Errore di connessione durante la sincronizzazione.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 text-gray-800">Benvenuto nella Dashboard</h1>
      <p className="text-gray-500 mb-8">Panoramica del sistema e strumenti rapidi.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <h2 className="text-lg font-semibold text-gray-700">Knowledge Base</h2>
          <p className="text-4xl font-extrabold text-blue-600 mt-2">{stats.knowledge}</p>
          <p className="text-sm text-gray-500 mt-1">Schede IA attualmente censite</p>
        </div>

        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <h2 className="text-lg font-semibold text-gray-700">Ticket Censiti</h2>
          <p className="text-4xl font-extrabold text-orange-500 mt-2">{stats.tickets}</p>
          <p className="text-sm text-gray-500 mt-1">Totale ticket archiviati nel sistema</p>
        </div>
      </div>

      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Azioni Rapide</h3>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/dashboard/chat"
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition flex items-center shadow-sm"
          >
            💬 Apri Assistente IA
          </Link>

          {/* Il tasto ora sarà visibile se l'utente nel localStorage ha ruolo 'admin' */}
          {isAdmin && (
            <button
              onClick={handleSyncEmbeddings}
              disabled={isSyncing}
              className="px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition flex items-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncing ? "⏳ Elaborazione in corso..." : "🧠 Sincronizza Dati IA"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}