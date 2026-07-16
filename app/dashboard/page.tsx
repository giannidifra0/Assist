'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { Database, Ticket, Sparkles, RefreshCw, ArrowRight, Users, Activity, X, Cpu, MessageSquare, Calendar } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// ==========================================
// COMPONENTE: Contatore Animato
// ==========================================
const AnimatedCounter = ({ value }: { value: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    const duration = 1200; 

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(easeProgress * value));
      if (progress < 1) window.requestAnimationFrame(step);
      else setCount(value);
    };
    window.requestAnimationFrame(step);
  }, [value]);

  return <span>{count.toLocaleString('it-IT')}</span>;
};

// ==========================================
// PAGINA PRINCIPALE DASHBOARD
// ==========================================
export default function DashboardHome() {
  const [stats, setStats] = useState({ knowledge: 0, usersOnline: 0, tickets: 0 });
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [userName, setUserName] = useState('');
  
  // Stati Telemetria
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [telemetry, setTelemetry] = useState({ totalTokens: 0, requests: 0, successRate: 0, promptTokens: 0, responseTokens: 0 });

  useEffect(() => {
    const storedUser = localStorage.getItem('crm_user');
    if (storedUser) {
      const userObj = JSON.parse(storedUser);
      setUserName(userObj.nominativo);
      if (userObj.ruolo === 'admin') setIsAdmin(true);
    }

    async function fetchDashboardData() {
      const { count: kbCount } = await supabase.from('knowledge_base').select('*', { count: 'exact', head: true });
      // FILTRO UTENTI: Ora conta solo quelli con is_online a true
      const { count: usersCount } = await supabase.from('utenti').select('*', { count: 'exact', head: true }).eq('is_online', true);
      const { count: ticketsCount, error: ticketsError } = await supabase.from('tickets').select('*', { count: 'exact', head: true });

      setStats({ 
        knowledge: kbCount || 0,
        usersOnline: usersCount || 0,
        tickets: ticketsError ? 0 : (ticketsCount || 0)
      });
    }

    fetchDashboardData();
  }, []);

  // Effetto per caricare i dati della telemetria quando si apre la modale o cambia il filtro
  useEffect(() => {
    if (!isStatsOpen) return;

    async function fetchTelemetry() {
      let query = supabase.from('telemetria_ia').select('totale_tokens, prompt_tokens, risposta_tokens, successo');
      
      if (timeFilter !== 'all') {
        const date = new Date();
        if (timeFilter === 'today') date.setHours(0, 0, 0, 0);
        if (timeFilter === '7d') date.setDate(date.getDate() - 7);
        if (timeFilter === '30d') date.setDate(date.getDate() - 30);
        query = query.gte('data_richiesta', date.toISOString());
      }

      const { data, error } = await query;
      
      if (data && !error) {
        const totalReq = data.length;
        const successReq = data.filter(d => d.successo).length;
        
        setTelemetry({
          requests: totalReq,
          totalTokens: data.reduce((acc, curr) => acc + (curr.totale_tokens || 0), 0),
          promptTokens: data.reduce((acc, curr) => acc + (curr.prompt_tokens || 0), 0),
          responseTokens: data.reduce((acc, curr) => acc + (curr.risposta_tokens || 0), 0),
          successRate: totalReq > 0 ? Math.round((successReq / totalReq) * 100) : 100
        });
      }
    }
    fetchTelemetry();
  }, [isStatsOpen, timeFilter]);

  const handleSyncEmbeddings = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/embeddings');
      const data = await response.json();
      if (data.ERRORE_FATALE) alert("❌ Errore: " + data.ERRORE_FATALE);
      else alert("✅ Sincronizzazione IA completata con successo.");
    } catch (error) {
      alert("❌ Errore di connessione.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 relative">
      
      {/* Intestazione */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">
          Bentornato, {userName}
        </h1>
        <p className="text-zinc-500 text-sm mt-1">Ecco una panoramica del tuo sistema Z-Assist.</p>
      </div>

      {/* Griglia Statistiche */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-2xl shadow-sm border border-zinc-200/80 flex flex-col justify-center transition-all hover:shadow-md group">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Documenti IA</h2>
            <Database className="w-4 h-4 text-zinc-400 group-hover:text-zinc-800 transition-colors" />
          </div>
          <p className="text-3xl font-semibold text-zinc-900"><AnimatedCounter value={stats.knowledge} /></p>
        </div>

        <div className="p-5 bg-white rounded-2xl shadow-sm border border-zinc-200/80 flex flex-col justify-center transition-all hover:shadow-md group">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ticket Censiti</h2>
            <Ticket className="w-4 h-4 text-zinc-400 group-hover:text-zinc-800 transition-colors" />
          </div>
          <p className="text-3xl font-semibold text-zinc-900"><AnimatedCounter value={stats.tickets} /></p>
        </div>

        <div className="p-5 bg-white rounded-2xl shadow-sm border border-zinc-200/80 flex flex-col justify-center transition-all hover:shadow-md group">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Utenti Online</h2>
              {/* Pallino Verde Pulsante (si attiva solo se ci sono utenti) */}
              {stats.usersOnline > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </div>
            <Users className="w-4 h-4 text-zinc-400 group-hover:text-zinc-800 transition-colors" />
          </div>
          <p className="text-3xl font-semibold text-zinc-900"><AnimatedCounter value={stats.usersOnline} /></p>
        </div>
      </div>

      {/* Azioni Rapide */}
      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-zinc-200/80">
        <h3 className="text-sm font-semibold text-zinc-900 mb-4 uppercase tracking-wider">Azioni Rapide</h3>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <Link href="/dashboard/chat" className="flex-1 sm:flex-none inline-flex items-center justify-between px-5 py-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 transition-all shadow-sm group sm:min-w-[240px]">
            <div className="flex items-center"><Sparkles className="w-4 h-4 mr-2.5 text-zinc-300" /><span className="font-medium text-sm">Apri Assistente IA</span></div>
            <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors transform group-hover:translate-x-1" />
          </Link>

          {isAdmin && (
            <>
              <button onClick={handleSyncEmbeddings} disabled={isSyncing} className="flex-1 sm:flex-none inline-flex items-center justify-between px-5 py-3 bg-zinc-50 border border-zinc-200 text-zinc-900 rounded-xl hover:bg-zinc-100 transition-all disabled:opacity-50 group sm:min-w-[240px]">
                <div className="flex items-center"><RefreshCw className={`w-4 h-4 mr-2.5 text-zinc-500 ${isSyncing ? 'animate-spin' : ''}`} /><span className="font-medium text-sm">{isSyncing ? "Sincronizzazione..." : "Sincronizza Dati IA"}</span></div>
              </button>

              <button onClick={() => setIsStatsOpen(true)} className="flex-1 sm:flex-none inline-flex items-center justify-between px-5 py-3 bg-zinc-50 border border-zinc-200 text-zinc-900 rounded-xl hover:bg-zinc-100 transition-all group sm:min-w-[240px]">
                <div className="flex items-center"><Activity className="w-4 h-4 mr-2.5 text-zinc-500" /><span className="font-medium text-sm">Telemetria IA</span></div>
                <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 transition-colors transform group-hover:translate-x-1" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* DRAWER MODALE PER LA TELEMETRIA IA */}
      {isStatsOpen && (
        <>
          <div className="fixed inset-0 bg-zinc-900/30 backdrop-blur-sm z-40 transition-opacity" onClick={() => setIsStatsOpen(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex flex-col border-l border-zinc-200">
            
            <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-zinc-900 rounded-lg shadow-sm"><Activity className="w-4 h-4 text-white" /></div>
                <h2 className="text-base font-semibold text-zinc-900">Telemetria IA</h2>
              </div>
              <button onClick={() => setIsStatsOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-900 rounded-full hover:bg-zinc-100 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
               
               {/* Filtro Temporale Segmentato */}
               <div className="bg-zinc-100/80 p-1 rounded-xl flex items-center shadow-inner">
                  {[
                    { id: 'today', label: 'Oggi' },
                    { id: '7d', label: '7 GG' },
                    { id: '30d', label: '30 GG' },
                    { id: 'all', label: 'Tutto' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setTimeFilter(tab.id as any)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${timeFilter === tab.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
               </div>

               <div className="space-y-4">
                  
                  <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <Cpu className="w-4 h-4 text-zinc-400 mr-2" />
                        <span className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Token Totali Elaborati</span>
                      </div>
                    </div>
                    <span className="text-3xl font-bold text-zinc-900">
                      <AnimatedCounter value={telemetry.totalTokens} />
                    </span>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-100">
                       <span className="text-[10px] text-zinc-500 uppercase font-semibold">Prompt: <span className="text-zinc-900">{telemetry.promptTokens.toLocaleString()}</span></span>
                       <span className="text-[10px] text-zinc-500 uppercase font-semibold">Risposta: <span className="text-zinc-900">{telemetry.responseTokens.toLocaleString()}</span></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex flex-col">
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Richieste Effettuate</span>
                      <span className="text-xl font-bold text-zinc-900"><AnimatedCounter value={telemetry.requests} /></span>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex flex-col">
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Tasso di Successo</span>
                      <span className="text-xl font-bold text-green-600"><AnimatedCounter value={telemetry.successRate} />%</span>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-zinc-50 border border-zinc-200/80 rounded-xl flex items-start gap-3">
                    <MessageSquare className="w-5 h-5 text-zinc-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-900">Stato del Modello</h4>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                        L'intelligenza artificiale (Gemini 3.5 Flash) sta registrando le interazioni in tempo reale sul database.
                      </p>
                    </div>
                  </div>

               </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}