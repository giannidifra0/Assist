'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { Database, Ticket, Sparkles, RefreshCw, Users, Activity, X, Cpu, FileUp, Save, Trash2, ArrowRight, FileText } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

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

export default function DashboardHome() {
  const [stats, setStats] = useState({ knowledge: 0, usersOnline: 0, tickets: 0, manuals: 0 });
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [userName, setUserName] = useState('');
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [telemetry, setTelemetry] = useState({ totalTokens: 0, requests: 0, successRate: 0, promptTokens: 0, responseTokens: 0 });
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [docMetadata, setDocMetadata] = useState({ titolo: '', versione: '', prodotto: '' });
  const [docChunks, setDocChunks] = useState<{capitolo: string, pagina: number, testo: string}[]>([]);
  
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('crm_user');
    if (storedUser) {
      const userObj = JSON.parse(storedUser);
      setUserName(userObj.nominativo); 
      if (userObj.ruolo === 'admin') setIsAdmin(true);
    }
    async function fetchDashboardData() {
      const { count: kbCount } = await supabase.from('knowledge_base').select('*', { count: 'exact', head: true });
      const { count: usersCount } = await supabase.from('utenti').select('*', { count: 'exact', head: true }).eq('is_online', true);
      const { count: ticketsCount, error: ticketsError } = await supabase.from('tickets').select('*', { count: 'exact', head: true });
      const { count: manualsCount } = await supabase.from('documenti').select('*', { count: 'exact', head: true });
      
      setStats({ 
        knowledge: kbCount || 0, 
        usersOnline: usersCount || 0, 
        tickets: ticketsError ? 0 : (ticketsCount || 0),
        manuals: manualsCount || 0 
      });
    }
    fetchDashboardData();
  }, []);

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
    } catch (error) { alert("❌ Errore di connessione."); } 
    finally { setIsSyncing(false); }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] md:min-h-screen -m-4 md:-m-6 lg:-m-8 p-4 md:p-8 lg:p-12 bg-[radial-gradient(#d4d4d8_1.5px,transparent_1.5px)] dark:bg-[radial-gradient(#52525b_1.5px,transparent_1.5px)] [background-size:24px_24px] transition-colors duration-300">
      <div className="relative z-10 max-w-[1200px] mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        <div className="pt-2">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-2">
            Bentornato, {userName}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-base">Il tuo piano corrente e l'utilizzo dei servizi Z-Assist.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-zinc-200/80 dark:border-zinc-800 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide">Documenti IA</h2>
              <Database className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-white"><AnimatedCounter value={stats.knowledge} /></p>
          </div>

          <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-zinc-200/80 dark:border-zinc-800 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide">Ticket Censiti</h2>
              <Ticket className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-white"><AnimatedCounter value={stats.tickets} /></p>
          </div>

          <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-zinc-200/80 dark:border-zinc-800 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide">Manuali PDF</h2>
              <FileText className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-white"><AnimatedCounter value={stats.manuals} /></p>
          </div>

          <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-zinc-200/80 dark:border-zinc-800 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide">Utenti Attivi</h2>
                {stats.usersOnline > 0 && (
                  <span className="relative flex h-2.5 w-2.5 mt-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                  </span>
                )}
              </div>
              <Users className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-white"><AnimatedCounter value={stats.usersOnline} /></p>
          </div>
        </div>

        <div className="pt-4">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-6">Esplora le funzionalità IA</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <Link href="/dashboard/chat" className="group flex items-start p-5 md:p-6 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all duration-300">
              <div className="flex-shrink-0 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl mr-5 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
                <Sparkles className="w-6 h-6 text-zinc-700 dark:text-zinc-300" strokeWidth={1.5} />
              </div>
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Assistente Chat</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">Attivo</span>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">Interroga i manuali strutturati e genera risposte contestuali utilizzando i modelli di embedding.</p>
              </div>
              <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transform -translate-x-2 group-hover:translate-x-0 transition-all duration-300 mt-1" />
            </Link>

            {isAdmin && (
              <>
                <button onClick={() => setIsUploadModalOpen(true)} className="text-left group flex items-start p-5 md:p-6 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all duration-300">
                  <div className="flex-shrink-0 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl mr-5 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
                    <FileUp className="w-6 h-6 text-zinc-700 dark:text-zinc-300" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 pr-4">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-1.5">Parse PDF</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">Estrai il testo dai manuali originali preservando tabelle, layout e intestazioni strutturate.</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transform -translate-x-2 group-hover:translate-x-0 transition-all duration-300 mt-1" />
                </button>

                <button onClick={handleSyncEmbeddings} disabled={isSyncing} className="text-left group flex items-start p-5 md:p-6 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all duration-300 disabled:opacity-50">
                  <div className="flex-shrink-0 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl mr-5 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
                    <RefreshCw className={`w-6 h-6 text-zinc-700 dark:text-zinc-300 ${isSyncing ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 pr-4">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-1.5">Sincronizza Vettori</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">Rigenera gli embeddings per i chunk di testo modificati e allinea il database vettoriale.</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transform -translate-x-2 group-hover:translate-x-0 transition-all duration-300 mt-1" />
                </button>

                <button onClick={() => setIsStatsOpen(true)} className="text-left group flex items-start p-5 md:p-6 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all duration-300">
                  <div className="flex-shrink-0 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl mr-5 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
                    <Activity className="w-6 h-6 text-zinc-700 dark:text-zinc-300" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 pr-4">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-1.5">Usage & Telemetria</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">Visualizza le statistiche di utilizzo API, il consumo dei token e i tassi di successo del modello.</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transform -translate-x-2 group-hover:translate-x-0 transition-all duration-300 mt-1" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {isUploadModalOpen && (
        <>
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-40" onClick={() => setIsUploadModalOpen(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white dark:bg-zinc-950 shadow-2xl z-50 animate-in slide-in-from-right duration-500 flex flex-col border-l border-zinc-200 dark:border-zinc-800">
            <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded-lg"><FileUp className="w-4 h-4 text-zinc-700 dark:text-zinc-300" /></div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Parse PDF</h2>
              </div>
              <button onClick={() => setIsUploadModalOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-xl transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-8 bg-zinc-50/50 dark:bg-zinc-950">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div><label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Titolo</label><input type="text" value={docMetadata.titolo} onChange={e => setDocMetadata({...docMetadata, titolo: e.target.value})} className="w-full px-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm dark:text-white focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white outline-none" /></div>
                <div><label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Prodotto</label><input type="text" value={docMetadata.prodotto} onChange={e => setDocMetadata({...docMetadata, prodotto: e.target.value})} className="w-full px-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm dark:text-white focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white outline-none" /></div>
                <div><label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Versione</label><input type="text" value={docMetadata.versione} onChange={e => setDocMetadata({...docMetadata, versione: e.target.value})} className="w-full px-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm dark:text-white focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white outline-none" /></div>
              </div>
              {docChunks.length === 0 ? (
                <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center flex flex-col items-center bg-white dark:bg-zinc-900/50 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all">
                  {isParsing ? (
                    <div className="flex flex-col items-center">
                      <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin mb-4" />
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Analisi in corso...</p>
                    </div>
                  ) : (
                    <>
                      <FileUp className="w-8 h-8 text-zinc-400 mb-2" />
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-6">Trascina un file qui</p>
                      <div className="relative">
                        <input type="file" accept=".pdf" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setSelectedPdfFile(file);
                            setIsParsing(true);
                            const formData = new FormData();
                            formData.append('file', file);
                            try {
                              const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData });
                              const data = await res.json();
                              if (data.success) setDocChunks(data.chunks);
                            } catch (err) {} finally { setIsParsing(false); }
                          }} 
                        />
                        <button className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium py-2.5 px-6 rounded-xl pointer-events-none">Seleziona PDF</button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Chunk Estratti ({docChunks.length})</h3>
                    <button onClick={() => { setDocChunks([]); setSelectedPdfFile(null); }} className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">Cancella</button>
                  </div>
                  {docChunks.map((chunk, index) => (
                    <div key={index} className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl relative group">
                      <button onClick={() => setDocChunks(prev => prev.filter((_, i) => i !== index))} className="absolute top-4 right-4 text-zinc-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      <div className="grid grid-cols-2 gap-4 pr-10">
                        <div><label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">Sezione</label><input type="text" value={chunk.capitolo} onChange={e => { const newChunks = [...docChunks]; newChunks[index].capitolo = e.target.value; setDocChunks(newChunks); }} className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl dark:text-white outline-none" /></div>
                        <div><label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">Pagina</label><input type="number" value={chunk.pagina} onChange={e => { const newChunks = [...docChunks]; newChunks[index].pagina = Number(e.target.value); setDocChunks(newChunks); }} className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl dark:text-white outline-none" /></div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">Markdown</label>
                        <textarea value={chunk.testo} onChange={e => { const newChunks = [...docChunks]; newChunks[index].testo = e.target.value; setDocChunks(newChunks); }} className="w-full px-3 py-2 text-sm font-mono bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl min-h-[120px] dark:text-white outline-none" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {docChunks.length > 0 && (
              <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex justify-end">
                <button 
                  disabled={isUploading || !docMetadata.titolo} 
                  onClick={async () => {
                    if (!selectedPdfFile) {
                      alert("Nessun file PDF originale selezionato. Ricarica il documento.");
                      return;
                    }
                    setIsUploading(true);
                    
                    const uploadData = new FormData();
                    uploadData.append('file', selectedPdfFile);
                    uploadData.append('titolo', docMetadata.titolo);
                    uploadData.append('versione', docMetadata.versione);
                    uploadData.append('prodotto', docMetadata.prodotto);
                    uploadData.append('chunks', JSON.stringify(docChunks));

                    try {
                      const res = await fetch('/api/upload-document', { 
                        method: 'POST', 
                        body: uploadData
                      });
                      const data = await res.json();
                      
                      if (data.success) { 
                        setIsUploadModalOpen(false); 
                        setDocChunks([]); 
                        setDocMetadata({ titolo: '', versione: '', prodotto: '' });
                        setSelectedPdfFile(null);
                        alert("Manuale salvato e appreso con successo dall'IA!");
                      } else {
                        alert("Errore salvataggio: " + data.error);
                      }
                    } catch (error) {
                      alert("Errore di connessione al server durante il salvataggio.");
                    } finally {
                      setIsUploading(false);
                    }
                  }} 
                  className="px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium rounded-xl flex items-center"
                >
                  {isUploading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salva nel Database IA
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {isStatsOpen && (
        <>
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-40" onClick={() => setIsStatsOpen(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white dark:bg-zinc-950 shadow-2xl z-50 animate-in slide-in-from-right duration-500 flex flex-col border-l border-zinc-200 dark:border-zinc-800">
            <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded-lg"><Activity className="w-4 h-4 text-zinc-700 dark:text-zinc-300" /></div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Telemetria</h2>
              </div>
              <button onClick={() => setIsStatsOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-xl transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-zinc-50/50 dark:bg-zinc-950">
               <div className="bg-zinc-100/80 dark:bg-zinc-900 p-1 rounded-xl flex items-center">
                  {[{ id: 'today', label: 'Oggi' }, { id: '7d', label: '7 Giorni' }, { id: '30d', label: '30 GG' }, { id: 'all', label: 'Tutto' }].map(tab => (
                    <button key={tab.id} onClick={() => setTimeFilter(tab.id as any)} className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${timeFilter === tab.id ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200/50 dark:border-zinc-700' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
                      {tab.label}
                    </button>
                  ))}
               </div>
               <div className="space-y-4">
                  <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <div className="flex items-center mb-2">
                      <Cpu className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mr-2" />
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Token Utilizzati</span>
                    </div>
                    <span className="text-3xl font-bold text-zinc-900 dark:text-white"><AnimatedCounter value={telemetry.totalTokens} /></span>
                    <div className="flex justify-between items-center mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                       <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Prompt: <span className="text-zinc-900 dark:text-white">{telemetry.promptTokens.toLocaleString()}</span></span>
                       <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Completions: <span className="text-zinc-900 dark:text-white">{telemetry.responseTokens.toLocaleString()}</span></span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase mb-1 block">Richieste API</span>
                      <span className="text-2xl font-bold text-zinc-900 dark:text-white"><AnimatedCounter value={telemetry.requests} /></span>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase mb-1 block">Success Rate</span>
                      <span className="text-2xl font-bold text-green-600 dark:text-green-400"><AnimatedCounter value={telemetry.successRate} />%</span>
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