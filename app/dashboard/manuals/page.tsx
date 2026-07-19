'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
// IMPORTANTE: Aggiunta l'icona Download
import { Search, Trash2, ArrowUpDown, Filter, FileText, Loader2, ArrowRight, Download } from 'lucide-react';
import Link from 'next/link';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Documento = {
  id: string;
  titolo: string;
  prodotto: string;
  versione: string;
  pdf_url?: string; // <-- Aggiunto al tipo
  created_at: string;
};

export default function ManualsPage() {
  const [documenti, setDocumenti] = useState<Documento[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const [sortConfig, setSortConfig] = useState<{ key: keyof Documento; direction: 'asc' | 'desc' } | null>({ key: 'created_at', direction: 'desc' });
  const [rowLimit, setRowLimit] = useState<number | string>(50);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);

  const fetchDocumenti = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('documenti').select('*');
    if (!error && data) setDocumenti(data);
    setIsLoading(false);
  };

  useEffect(() => { fetchDocumenti(); }, []);

  const processedItems = useMemo(() => {
    let result = documenti;
    
    if (searchTerm) {
      result = result.filter(item => 
        (item.titolo?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
        (item.prodotto?.toLowerCase() || '').includes(searchTerm.toLowerCase())
      );
    }
    
    result = result.filter(item => {
      return Object.entries(columnFilters).every(([key, filterValue]) => {
        if (!filterValue) return true; 
        const itemValue = String((item as any)[key] || '').toLowerCase();
        return itemValue.includes(filterValue.toLowerCase());
      });
    });

    if (sortConfig !== null) {
      result.sort((a, b) => {
        const aVal = String(a[sortConfig.key] ?? '').toLowerCase();
        const bVal = String(b[sortConfig.key] ?? '').toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (rowLimit !== '' && Number(rowLimit) > 0) return result.slice(0, Number(rowLimit));
    
    return result;
  }, [documenti, searchTerm, sortConfig, columnFilters, rowLimit]);

  const requestSort = (key: keyof Documento) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleDelete = async (doc: Documento) => {
    if (!confirm(`Sei sicuro di voler eliminare l'intero manuale "${doc.titolo}" e il PDF associato? L'IA dimenticherà queste informazioni.`)) return;
    
    setDeletingId(doc.id);
    try {
      const res = await fetch('/api/delete-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id })
      });
      const data = await res.json();
      
      if (!data.success) throw new Error(data.error);
      await fetchDocumenti();
    } catch (error: any) {
      alert("Errore durante l'eliminazione: " + error.message);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  };

  const SortHeader = ({ label, sortKey, align = 'left' }: { label: string, sortKey: keyof Documento, align?: string }) => {
    const isFiltering = activeFilterCol === sortKey;
    const filterValue = columnFilters[sortKey] || '';
    return (
      <th className={`px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 whitespace-nowrap text-${align}`}>
        <div className={`flex flex-col gap-2 ${align === 'right' ? 'items-end' : ''}`}>
          <div className="flex items-center">
            <div className="flex items-center text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors" onClick={() => requestSort(sortKey)}>
              {label} <ArrowUpDown className="ml-1.5 h-3 w-3" />
            </div>
            <button onClick={() => setActiveFilterCol(isFiltering ? null : sortKey)} className={`ml-3 p-1 rounded-md transition-colors ${filterValue || isFiltering ? 'text-zinc-900 dark:text-white bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200 dark:border-zinc-700' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800'}`} title="Filtra">
              <Filter className="w-3 h-3" />
            </button>
          </div>
          {isFiltering && (
            <div className="relative mt-2 animate-in fade-in slide-in-from-top-1 duration-200 w-full max-w-[200px]">
              <input type="text" autoFocus placeholder="Filtra..." value={filterValue} onChange={(e) => setColumnFilters(prev => ({...prev, [sortKey]: e.target.value}))} className="w-full pl-3 pr-7 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white transition-all shadow-sm font-medium" />
              <button onClick={() => { setColumnFilters(prev => ({...prev, [sortKey]: ''})); setActiveFilterCol(null); }} className="absolute right-1.5 top-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"><Search className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Archivio Manuali</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 font-medium">Gestisci i manuali in formato PDF caricati e appresi dall'IA.</p>
        </div>
        <Link href="/dashboard" className="flex items-center justify-center px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 group">
          Vai al Caricamento <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-[2rem] shadow-sm border border-zinc-200/60 dark:border-zinc-800/60 flex flex-col overflow-hidden w-full">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" strokeWidth={2} />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Cerca manuale per titolo o prodotto..." className="w-full pl-11 pr-4 py-3 bg-zinc-50/50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none transition-all shadow-sm" />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto bg-white dark:bg-zinc-900 px-5 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Mostra:</span>
            <input type="number" value={rowLimit} onChange={(e) => setRowLimit(e.target.value)} placeholder="Tutti" className="w-16 px-2 py-1 text-sm font-bold bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white text-center transition-all" />
            <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest">/ {documenti.length}</span>
          </div>
        </div>
        
        <div className="w-full overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left min-w-[800px] dark:text-zinc-300">
            <thead className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800/80">
              <tr>
                <SortHeader label="Titolo Manuale" sortKey="titolo" />
                <SortHeader label="Prodotto" sortKey="prodotto" />
                <SortHeader label="Versione" sortKey="versione" />
                <SortHeader label="Caricato il" sortKey="created_at" />
                <th className="px-5 py-4 align-top text-right text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest bg-zinc-50/50 dark:bg-zinc-900/50">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" /></td></tr>
              ) : processedItems.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center font-medium text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900">Nessun manuale archiviato.</td></tr>
              ) : (
                processedItems.map(doc => (
                  <tr key={doc.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors group bg-white dark:bg-zinc-900">
                    <td className="px-5 py-4">
                      <div className="flex items-center">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mr-3 border border-blue-100 dark:border-blue-800/30">
                          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="font-bold text-zinc-900 dark:text-white">{doc.titolo || 'Senza Titolo'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-300 font-semibold">{doc.prodotto || '-'}</td>
                    <td className="px-5 py-4">
                      <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md text-xs font-bold font-mono border border-zinc-200 dark:border-zinc-700">
                        v {doc.versione || '1.0'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 text-xs font-medium uppercase tracking-wider">{formatDate(doc.created_at)}</td>
                    
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                        
                        {/* NUOVO BOTTONE DOWNLOAD */}
                        {doc.pdf_url && (
                          <a 
                            href={`/api/download?file=${doc.pdf_url}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            title="Scarica PDF Originale"
                            className="flex items-center px-3 py-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm transition-all"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}

                        <button 
                          onClick={() => handleDelete(doc)} 
                          disabled={deletingId === doc.id}
                          className="flex items-center px-3 py-2 text-zinc-500 hover:text-white bg-white dark:bg-zinc-900 hover:bg-red-500 dark:hover:bg-red-600 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-red-500 dark:hover:border-red-600 shadow-sm transition-all disabled:opacity-50"
                        >
                          {deletingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          <span className="ml-2 text-xs font-bold uppercase tracking-wider">Elimina</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}