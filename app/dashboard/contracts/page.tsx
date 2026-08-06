'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { Search, Briefcase, Building2, ChevronRight, FileText, Timer, SlidersHorizontal, ChevronDown, Calendar } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type ContrattoCNEL = {
  id: string;
  codice_ccnl: string;
  titolo_ccnl: string;
  data_stipula: string;
  data_scadenza_contrattuale: string;
  parti_datoriali_firmatarie: string[];
  parti_sindacali_firmatarie: string[];
  settori_descrizione: string[];
  stato: string;
};

type SortOption = 'stipula_desc' | 'stipula_asc' | 'scadenza_asc' | 'scadenza_desc';

export default function ContractsPage() {
  const [activeTab, setActiveTab] = useState<'ccnl' | 'dati'>('ccnl');
  const [contratti, setContratti] = useState<ContrattoCNEL[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('stipula_desc');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [rowLimit, setRowLimit] = useState<number | string>(100);

  const sortOptions: { id: SortOption; label: string }[] = [
    { id: 'stipula_desc', label: 'Stipula (Più recenti)' },
    { id: 'stipula_asc', label: 'Stipula (Meno recenti)' },
    { id: 'scadenza_asc', label: 'Scadenza (Più vicina)' },
    { id: 'scadenza_desc', label: 'Scadenza (Più lontana)' }
  ];

  useEffect(() => {
    async function fetchContratti() {
      setIsLoading(true);
      const { data, error } = await supabase.from('vista_cnel_contratti').select('*');
      if (data && !error) setContratti(data);
      setIsLoading(false);
    }
    if (activeTab === 'ccnl') fetchContratti();
  }, [activeTab]);

  // Logica Corretta di Ordinamento
  const processedContratti = useMemo(() => {
    // 1. Cloniamo l'array originale
    let result = [...contratti];

    // 2. Filtro Ricerca
    if (searchTerm) {
      result = result.filter(c => 
        c.titolo_ccnl?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.codice_ccnl?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // 3. Ordinamento Blindato (gestisce i valori null)
    result.sort((a, b) => {
      const timeA_stip = a.data_stipula ? new Date(a.data_stipula).getTime() : 0;
      const timeB_stip = b.data_stipula ? new Date(b.data_stipula).getTime() : 0;
      const timeA_scad = a.data_scadenza_contrattuale ? new Date(a.data_scadenza_contrattuale).getTime() : 0;
      const timeB_scad = b.data_scadenza_contrattuale ? new Date(b.data_scadenza_contrattuale).getTime() : 0;

      if (sortBy === 'stipula_desc') {
        return timeB_stip - timeA_stip;
      }
      if (sortBy === 'stipula_asc') {
        if (!a.data_stipula) return 1; // Sposta i senza-data in fondo
        if (!b.data_stipula) return -1;
        return timeA_stip - timeB_stip;
      }
      if (sortBy === 'scadenza_desc') {
        return timeB_scad - timeA_scad;
      }
      if (sortBy === 'scadenza_asc') {
        if (!a.data_scadenza_contrattuale) return 1; // Sposta i senza-data in fondo
        if (!b.data_scadenza_contrattuale) return -1;
        return timeA_scad - timeB_scad;
      }
      return 0;
    });

    return result;
  }, [contratti, searchTerm, sortBy]);

  const displayedContratti = useMemo(() => {
    if (rowLimit !== '' && Number(rowLimit) > 0) return processedContratti.slice(0, Number(rowLimit));
    return processedContratti;
  }, [processedContratti, rowLimit]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/D';
    return new Date(dateString).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 w-full pb-10">
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Contrattualistica</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 font-medium">Archivio Open Data CNEL e gestione parametri retributivi.</p>
        </div>
      </div>

      <div className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm p-1 flex items-center gap-0.5 w-fit">
        <button
          onClick={() => setActiveTab('ccnl')}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${
            activeTab === 'ccnl' ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          Archivio CCNL
        </button>
        <button
          onClick={() => setActiveTab('dati')}
          className={`px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${
            activeTab === 'dati' ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          Dati & Valori
        </button>
      </div>

      {activeTab === 'ccnl' && (
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-[2rem] shadow-sm border border-zinc-200/60 dark:border-zinc-800/60 flex flex-col overflow-hidden w-full">
          
          <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
            
            <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto flex-1">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-4 top-3.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" strokeWidth={2} />
                <input 
                  type="text" 
                  value={searchTerm} 
                  onChange={(e) => { setSearchTerm(e.target.value); setRowLimit(100); }} 
                  placeholder="Cerca per titolo CCNL o codice..." 
                  className="w-full pl-11 pr-4 py-3 bg-zinc-50/50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none transition-all shadow-sm" 
                />
              </div>

              <div className="relative shrink-0 z-20">
                <button
                  onClick={() => setIsSortOpen(!isSortOpen)}
                  onBlur={() => setTimeout(() => setIsSortOpen(false), 200)}
                  className="flex items-center justify-between w-full sm:w-64 px-4 py-3 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl leading-5 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 sm:text-sm transition-all shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700"
                >
                  <div className="flex items-center gap-2.5">
                    <SlidersHorizontal className="h-4 w-4 text-zinc-400" />
                    <span className="font-semibold">{sortOptions.find(o => o.id === sortBy)?.label}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${isSortOpen ? 'rotate-180' : ''}`} />
                </button>

                {isSortOpen && (
                  <div className="absolute top-full left-0 sm:right-0 sm:left-auto mt-2 w-full sm:w-64 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-200">
                    {sortOptions.map(opt => (
                      <button
                        key={opt.id}
                        // SOSTITUITO onClick con onMouseDown per risolvere il bug del dropdown
                        onMouseDown={(e) => { 
                          e.preventDefault(); 
                          setSortBy(opt.id as SortOption); 
                          setIsSortOpen(false); 
                          setRowLimit(100); 
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center ${sortBy === opt.id ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto bg-white dark:bg-zinc-900 px-5 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm shrink-0">
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Mostra:</span>
              <input 
                type="number" 
                value={rowLimit} 
                onChange={(e) => setRowLimit(e.target.value)} 
                placeholder="Tutti" 
                className="w-16 px-2 py-1 text-sm font-bold bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white text-center transition-all" 
              />
              <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest">/ {processedContratti.length}</span>
            </div>

          </div>
          
          <div className="p-5 md:p-6 bg-zinc-50/30 dark:bg-zinc-950/30">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-6 h-64 animate-pulse">
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-full w-1/4 mb-4"></div>
                    <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded-md w-3/4 mb-2"></div>
                    <div className="h-6 bg-zinc-200 dark:bg-zinc-800 rounded-md w-1/2 mb-6"></div>
                  </div>
                ))}
              </div>
            ) : processedContratti.length === 0 ? (
              <div className="bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-12 text-center">
                <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Nessun contratto trovato</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">Prova a modificare i parametri di ricerca o avvia una sincronizzazione con il CNEL.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {displayedContratti.map((contratto) => (
                  <div key={contratto.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-6 hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col group relative z-10">
                    
                    <div className="flex justify-between items-start mb-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-widest uppercase bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700">
                        {contratto.codice_ccnl || 'N/A'}
                      </span>
                      {contratto.stato === 'Acquisito' && (
                        <span className="flex h-2 w-2 relative" title="Acquisito CNEL">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                      )}
                    </div>
                    
                    <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white leading-tight mb-5 line-clamp-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {contratto.titolo_ccnl}
                    </h3>

                    <div className="space-y-3 mt-auto flex-1">
                      <div className="flex items-start gap-3">
                        <Briefcase className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">Settore</p>
                          <p className="text-[13px] text-zinc-700 dark:text-zinc-300 line-clamp-1">
                            {contratto.settori_descrizione?.[0] || 'Non specificato'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-3">
                        <Building2 className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">Parti Firmatarie</p>
                          <p className="text-[13px] text-zinc-700 dark:text-zinc-300 line-clamp-1">
                            {contratto.parti_sindacali_firmatarie?.[0] || 'Varie'} / {contratto.parti_datoriali_firmatarie?.[0] || 'Varie'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 mt-2">
                        <div>
                          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider flex items-center gap-1"><Calendar className="w-3 h-3" /> Stipula</p>
                          <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">{formatDate(contratto.data_stipula)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider flex items-center gap-1"><Timer className="w-3 h-3" /> Scadenza</p>
                          <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 mt-0.5">{formatDate(contratto.data_scadenza_contrattuale)}</p>
                        </div>
                      </div>
                    </div>
                    
                    <Link 
                      href={`/dashboard/contracts/${contratto.id}`} 
                      target="_blank"
                      className="mt-5 w-full py-2 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-bold rounded-xl flex items-center justify-center transition-colors border border-zinc-200/50 dark:border-zinc-800"
                    >
                      Dettagli Contratto <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
            
            {rowLimit !== '' && Number(rowLimit) < processedContratti.length && (
              <div className="pt-8 pb-4 flex justify-center">
                <button
                  onClick={() => setRowLimit(Number(rowLimit) + 100)}
                  className="px-6 py-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-sm rounded-full transition-colors flex items-center gap-2 border border-blue-200/50 dark:border-blue-500/20"
                >
                  Carica altri contratti...
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'dati' && (
        <div className="bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-12 text-center">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Integrazione Valori Economici</h3>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-md mx-auto">
            Qui verranno mostrati i dati estratti relativi alle tabelle retributive, IRPEF e aliquote contributive associate ai vari CCNL.
          </p>
        </div>
      )}
    </div>
  );
}