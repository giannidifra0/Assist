'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Search, Edit, Trash2, Plus, X, ArrowUpDown, RefreshCw, CheckCircle2, CircleDashed, Filter } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type KnowledgeItem = {
  ha_embedding: boolean; id: string; numero_originale: string; riferimento: string;
  classe: string; oggetto: string; tipologia: string; argomento: string; 
  contenuto: string; data_pubblicazione: string;
  prodotto_1: string; prodotto_2: string; prodotto_3: string; 
  prodotto_4: string; prodotto_5: string; prodotto_6: string; embedding: any; 
};

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [sortConfig, setSortConfig] = useState<{ key: keyof KnowledgeItem; direction: 'asc' | 'desc' } | null>(null);
  const [rowLimit, setRowLimit] = useState<number | string>(100);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);

  const initialForm = { 
    numero_originale: '', riferimento: '', data_pubblicazione: '', classe: '', tipologia: '', argomento: '', 
    prodotto_1: '', prodotto_2: '', prodotto_3: '', prodotto_4: '', prodotto_5: '', prodotto_6: '',
    oggetto: '', contenuto: '' 
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchKnowledge = async () => {
    const { data, error } = await supabase.from('knowledge_base_leggera').select('*');
    if (!error && data) setItems(data);
  };
  useEffect(() => { fetchKnowledge(); }, []);

  const handleSyncEmbeddings = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/embeddings');
      const data = await response.json();
      if (data.ERRORE_FATALE) alert("❌ Errore: " + data.ERRORE_FATALE);
      else { alert("✅ Sincronizzazione IA completata."); fetchKnowledge(); }
    } catch (error) { alert("❌ Errore di connessione."); } finally { setIsSyncing(false); }
  };

  const processedItems = useMemo(() => {
    let result = items;
    if (searchTerm) {
      result = result.filter(item => 
        (item.oggetto?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
        (item.riferimento?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (item.numero_originale?.toLowerCase() || '').includes(searchTerm.toLowerCase())
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
  }, [items, searchTerm, sortConfig, columnFilters, rowLimit]);

  const requestSort = (key: keyof KnowledgeItem) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const payload = { ...formData, embedding: null };
    try {
      if (editingId) await supabase.from('knowledge_base_leggera').update(payload).eq('id', editingId);
      else await supabase.from('knowledge_base').insert([payload]);
      await fetchKnowledge();
      setIsFormOpen(false);
    } catch (error: any) { alert("Errore: " + error.message); } finally { setIsLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo documento?')) return;
    await supabase.from('knowledge_base_leggera').delete().eq('id', id);
    await fetchKnowledge();
  };

  const openForm = (item?: KnowledgeItem) => {
    if (item) {
      setFormData({
        numero_originale: item.numero_originale || '', riferimento: item.riferimento || '', data_pubblicazione: item.data_pubblicazione || '',
        classe: item.classe || '', tipologia: item.tipologia || '', argomento: item.argomento || '', 
        prodotto_1: item.prodotto_1 || '', prodotto_2: item.prodotto_2 || '', prodotto_3: item.prodotto_3 || '', 
        prodotto_4: item.prodotto_4 || '', prodotto_5: item.prodotto_5 || '', prodotto_6: item.prodotto_6 || '',
        oggetto: item.oggetto || '', contenuto: item.contenuto || ''
      });
      setEditingId(item.id);
    } else {
      setFormData(initialForm);
      setEditingId(null);
    }
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const SortHeader = ({ label, sortKey, sticky = false, position = '' }: { label: string, sortKey: keyof KnowledgeItem, sticky?: boolean, position?: string }) => {
    const isFiltering = activeFilterCol === sortKey;
    const filterValue = columnFilters[sortKey] || '';
    return (
      <th className={`px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 whitespace-nowrap align-top
        ${sticky ? `sticky ${position} shadow-[5px_0_15px_-3px_rgba(0,0,0,0.05)] dark:shadow-[5px_0_15px_-3px_rgba(0,0,0,0.5)] z-20` : 'z-10'}
      `}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors" onClick={() => requestSort(sortKey)}>
              {label} <ArrowUpDown className="ml-1.5 h-3 w-3" />
            </div>
            <button onClick={() => setActiveFilterCol(isFiltering ? null : sortKey)} className={`ml-3 p-1 rounded-md transition-colors ${filterValue || isFiltering ? 'text-zinc-900 dark:text-white bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200 dark:border-zinc-700' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800'}`} title="Filtra">
              <Filter className="w-3 h-3" />
            </button>
          </div>
          {isFiltering && (
            <div className="relative mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <input type="text" autoFocus placeholder="Filtra..." value={filterValue} onChange={(e) => setColumnFilters(prev => ({...prev, [sortKey]: e.target.value}))} className="w-full pl-3 pr-7 py-2 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white transition-all shadow-sm font-medium" />
              <button onClick={() => { setColumnFilters(prev => ({...prev, [sortKey]: ''})); setActiveFilterCol(null); }} className="absolute right-1.5 top-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
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
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Knowledge Base</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 font-medium">Archivio documenti, anomalie e training dell'Intelligenza Artificiale.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={handleSyncEmbeddings} disabled={isSyncing} className="flex items-center justify-center px-5 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm font-bold rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm hover:shadow disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} /> Sincronizza IA
          </button>
          <button onClick={() => openForm()} className="flex items-center justify-center px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
            <Plus className="w-5 h-5 mr-2" /> Nuovo Documento
          </button>
        </div>
      </div>

      {isFormOpen && (
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-6 md:p-8 rounded-[2rem] shadow-xl border border-zinc-200/60 dark:border-zinc-800/60 animate-in slide-in-from-top-4 duration-300 relative overflow-hidden">
          <div className="flex justify-between items-center mb-8 border-b border-zinc-100 dark:border-zinc-800 pb-5">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{editingId ? 'Modifica Documento' : 'Nuovo Documento'}</h2>
            <button onClick={() => setIsFormOpen(false)} className="p-2 bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-full transition-colors"><X className="w-5 h-5" /></button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
            <div>
              <h3 className="text-xs font-bold text-zinc-900 dark:text-white mb-5 uppercase tracking-widest flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-2.5"></span> Dati Identificativi</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Codice Origine</label><input type="text" value={formData.numero_originale} onChange={e => setFormData({...formData, numero_originale: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 outline-none text-sm font-medium dark:text-white transition-all" /></div>
                <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Riferimento</label><input type="text" value={formData.riferimento} onChange={e => setFormData({...formData, riferimento: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 outline-none text-sm font-medium dark:text-white transition-all" /></div>
                <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Data Pubblicazione</label><input type="date" value={formData.data_pubblicazione} onChange={e => setFormData({...formData, data_pubblicazione: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 outline-none text-sm font-medium dark:text-white [color-scheme:light] dark:[color-scheme:dark] transition-all" /></div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-900 dark:text-white mb-5 uppercase tracking-widest flex items-center"><span className="w-2 h-2 rounded-full bg-purple-500 mr-2.5"></span> Classificazione</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Classe</label><input type="text" value={formData.classe} onChange={e => setFormData({...formData, classe: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 outline-none text-sm font-medium dark:text-white transition-all" /></div>
                <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Tipologia</label><input type="text" value={formData.tipologia} onChange={e => setFormData({...formData, tipologia: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 outline-none text-sm font-medium dark:text-white transition-all" /></div>
                <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Argomento</label><input type="text" value={formData.argomento} onChange={e => setFormData({...formData, argomento: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 outline-none text-sm font-medium dark:text-white transition-all" /></div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-900 dark:text-white mb-5 uppercase tracking-widest flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-2.5"></span> Prodotti Coinvolti</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[1,2,3,4,5,6].map(num => (
                  <div key={num} className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Slot {num}</label>
                    <input type="text" value={(formData as any)[`prodotto_${num}`]} onChange={e => setFormData({...formData, [`prodotto_${num}`]: e.target.value})} className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 outline-none text-xs font-medium dark:text-white transition-all" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-zinc-900 dark:text-white mb-5 uppercase tracking-widest flex items-center"><span className="w-2 h-2 rounded-full bg-orange-500 mr-2.5"></span> Contenuto</h3>
              <div className="space-y-6">
                <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Oggetto (Titolo) *</label><input type="text" value={formData.oggetto} onChange={e => setFormData({...formData, oggetto: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 outline-none text-sm font-bold dark:text-white transition-all" required /></div>
                <div className="space-y-1.5"><label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Contenuto Tecnico *</label><textarea value={formData.contenuto} onChange={e => setFormData({...formData, contenuto: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 outline-none text-sm min-h-[180px] leading-relaxed dark:text-white font-medium transition-all" required /></div>
              </div>
            </div>

            <div className="flex justify-end pt-5 border-t border-zinc-100 dark:border-zinc-800 mt-8">
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-3.5 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-sm font-bold rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800 mr-3 transition-all border border-zinc-200 dark:border-zinc-800 shadow-sm">Annulla</button>
              <button type="submit" disabled={isLoading} className="px-8 py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold rounded-2xl hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                {isLoading ? 'Salvataggio...' : 'Conferma e Salva'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-[2rem] shadow-sm border border-zinc-200/60 dark:border-zinc-800/60 flex flex-col overflow-hidden w-full">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-3.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" strokeWidth={2} />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Cerca in tutto il database..." className="w-full pl-11 pr-4 py-3 bg-zinc-50/50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white outline-none transition-all shadow-sm" />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto bg-white dark:bg-zinc-900 px-5 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Mostra:</span>
            <input type="number" value={rowLimit} onChange={(e) => setRowLimit(e.target.value)} placeholder="Tutte" className="w-16 px-2 py-1 text-sm font-bold bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 dark:text-white text-center transition-all" />
            <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest">/ {items.length}</span>
          </div>
        </div>
        
        <div className="w-full overflow-x-auto custom-scrollbar relative">
          <table className="w-full text-sm text-left min-w-[2800px] dark:text-zinc-300">
            <thead className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800/80">
              <tr>
                <SortHeader label="Codice" sortKey="numero_originale" sticky position="left-0" />
                <SortHeader label="Riferimento" sortKey="riferimento" />
                <SortHeader label="Classe" sortKey="classe" />
                <SortHeader label="Oggetto" sortKey="oggetto" />
                <SortHeader label="Tipologia" sortKey="tipologia" />
                <SortHeader label="Argomento" sortKey="argomento" />
                <SortHeader label="Contenuto" sortKey="contenuto" />
                <SortHeader label="Prod. 1" sortKey="prodotto_1" />
                <SortHeader label="Prod. 2" sortKey="prodotto_2" />
                <SortHeader label="Prod. 3" sortKey="prodotto_3" />
                <SortHeader label="Prod. 4" sortKey="prodotto_4" />
                <SortHeader label="Prod. 5" sortKey="prodotto_5" />
                <SortHeader label="Prod. 6" sortKey="prodotto_6" />
                <SortHeader label="Data Pub." sortKey="data_pubblicazione" />
                <th className="px-5 py-4 align-top text-center text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest bg-zinc-50/50 dark:bg-zinc-900/50">Stato IA</th>
                <th className="px-5 py-4 align-top text-right text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest sticky right-0 bg-zinc-50/50 dark:bg-zinc-900/50 shadow-[-5px_0_15px_-3px_rgba(0,0,0,0.05)] dark:shadow-[-5px_0_15px_-3px_rgba(0,0,0,0.5)] z-20">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {processedItems.length === 0 ? (
                <tr><td colSpan={16} className="px-4 py-12 text-center font-medium text-zinc-500 dark:text-zinc-400 text-sm bg-white dark:bg-zinc-900">Nessun documento trovato.</td></tr>
              ) : (
                processedItems.map(item => (
                  <tr key={item.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors group bg-white dark:bg-zinc-900">
                    <td className="px-5 py-4 text-zinc-900 dark:text-white font-mono text-xs font-bold whitespace-nowrap sticky left-0 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/80 transition-colors shadow-[5px_0_15px_-3px_rgba(0,0,0,0.02)] z-10 border-r border-zinc-100 dark:border-zinc-800/80">{item.numero_originale || '-'}</td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 font-mono text-[11px] font-medium whitespace-nowrap">{item.riferimento || '-'}</td>
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-300 text-xs font-medium whitespace-nowrap">{item.classe || '-'}</td>
                    <td className="px-5 py-4 font-bold text-zinc-900 dark:text-white max-w-[250px] truncate" title={item.oggetto}>{item.oggetto}</td>
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-300 text-xs font-medium whitespace-nowrap">{item.tipologia || '-'}</td>
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-300 text-xs font-medium max-w-[150px] truncate" title={item.argomento}>{item.argomento || '-'}</td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 text-xs font-medium max-w-[300px] truncate leading-relaxed" title={item.contenuto}>{item.contenuto || '-'}</td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 text-[11px] font-medium max-w-[120px] truncate">{item.prodotto_1 || '-'}</td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 text-[11px] font-medium max-w-[120px] truncate">{item.prodotto_2 || '-'}</td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 text-[11px] font-medium max-w-[120px] truncate">{item.prodotto_3 || '-'}</td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 text-[11px] font-medium max-w-[120px] truncate">{item.prodotto_4 || '-'}</td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 text-[11px] font-medium max-w-[120px] truncate">{item.prodotto_5 || '-'}</td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 text-[11px] font-medium max-w-[120px] truncate">{item.prodotto_6 || '-'}</td>
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-300 text-xs font-medium whitespace-nowrap">{item.data_pubblicazione || '-'}</td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex justify-center tooltip" title={item.ha_embedding ? "Documento appreso dall'IA" : "In attesa di Sincronizzazione"}>
                        {item.ha_embedding ? <CheckCircle2 className="w-5 h-5 text-green-500" strokeWidth={2.5} /> : <CircleDashed className="w-5 h-5 text-zinc-300 dark:text-zinc-600" strokeWidth={2.5} />}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right sticky right-0 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/80 transition-colors shadow-[-5px_0_15px_-3px_rgba(0,0,0,0.02)] z-10 border-l border-zinc-100 dark:border-zinc-800/80">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openForm(item)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm transition-all"><Edit className="w-4 h-4"/></button>
                        <button onClick={() => handleDelete(item.id)} className="p-2 text-zinc-400 hover:text-white bg-white dark:bg-zinc-900 hover:bg-red-500 dark:hover:bg-red-600 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-red-500 dark:hover:border-red-600 shadow-sm transition-all"><Trash2 className="w-4 h-4"/></button>
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