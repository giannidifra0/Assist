'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Search, Edit, Trash2, Plus, X, ArrowUpDown, RefreshCw, CheckCircle2, CircleDashed, Filter } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type KnowledgeItem = { 
  id: string; 
  numero_originale: string; 
  riferimento: string;
  classe: string; 
  oggetto: string; 
  tipologia: string; 
  argomento: string; 
  contenuto: string; 
  data_pubblicazione: string;
  prodotto_1: string; prodotto_2: string; prodotto_3: string; 
  prodotto_4: string; prodotto_5: string; prodotto_6: string;
  embedding: any; 
};

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Stati per Filtri e Ordinamento
  const [sortConfig, setSortConfig] = useState<{ key: keyof KnowledgeItem; direction: 'asc' | 'desc' } | null>(null);
  const [rowLimit, setRowLimit] = useState<number | string>(100);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);

  const initialForm = { 
    numero_originale: '', riferimento: '', data_pubblicazione: '', 
    classe: '', tipologia: '', argomento: '', 
    prodotto_1: '', prodotto_2: '', prodotto_3: '', prodotto_4: '', prodotto_5: '', prodotto_6: '',
    oggetto: '', contenuto: '' 
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchKnowledge = async () => {
    const { data, error } = await supabase.from('knowledge_base').select('*');
    if (!error && data) setItems(data);
  };

  useEffect(() => { fetchKnowledge(); }, []);

  const handleSyncEmbeddings = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/embeddings');
      const data = await response.json();
      if (data.ERRORE_FATALE) alert("❌ Errore: " + data.ERRORE_FATALE);
      else {
        alert("✅ Sincronizzazione IA completata con successo.");
        fetchKnowledge();
      }
    } catch (error) {
      alert("❌ Errore di connessione durante la sincronizzazione.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Logica avanzata di Filtraggio e Ordinamento
  const processedItems = useMemo(() => {
    let result = items;

    // 1. Filtro Globale
    if (searchTerm) {
      result = result.filter(item => 
        (item.oggetto?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
        (item.riferimento?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (item.numero_originale?.toLowerCase() || '').includes(searchTerm.toLowerCase())
      );
    }

    // 2. Filtri per Colonna (LIKE)
    result = result.filter(item => {
      return Object.entries(columnFilters).every(([key, filterValue]) => {
        if (!filterValue) return true; // Se il filtro è vuoto, passa
        const itemValue = String((item as any)[key] || '').toLowerCase();
        return itemValue.includes(filterValue.toLowerCase());
      });
    });

    // 3. Ordinamento
    if (sortConfig !== null) {
      result.sort((a, b) => {
        const aVal = String(a[sortConfig.key] ?? '').toLowerCase();
        const bVal = String(b[sortConfig.key] ?? '').toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // 4. Limite Righe
    if (rowLimit !== '' && Number(rowLimit) > 0) {
      return result.slice(0, Number(rowLimit));
    }

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
      if (editingId) await supabase.from('knowledge_base').update(payload).eq('id', editingId);
      else await supabase.from('knowledge_base').insert([payload]);
      await fetchKnowledge();
      setIsFormOpen(false);
    } catch (error: any) { alert("Errore: " + error.message); } 
    finally { setIsLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo documento?')) return;
    await supabase.from('knowledge_base').delete().eq('id', id);
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

  // Componente Intestazione Colonna con Filtro Integrato
  const SortHeader = ({ label, sortKey, sticky = false, position = '' }: { label: string, sortKey: keyof KnowledgeItem, sticky?: boolean, position?: string }) => {
    const isFiltering = activeFilterCol === sortKey;
    const filterValue = columnFilters[sortKey] || '';

    return (
      <th className={`px-4 py-3 border-b border-zinc-100 bg-white whitespace-nowrap align-top
        ${sticky ? `sticky ${position} shadow-[5px_0_15px_-3px_rgba(0,0,0,0.05)] z-20` : 'z-10'}
      `}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center text-[11px] font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-800 transition-colors"
              onClick={() => requestSort(sortKey)}
            >
              {label} <ArrowUpDown className="ml-1 h-3 w-3" />
            </div>
            <button 
              onClick={() => setActiveFilterCol(isFiltering ? null : sortKey)}
              className={`ml-3 p-1 rounded transition-colors ${filterValue || isFiltering ? 'text-zinc-900 bg-zinc-100' : 'text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50'}`}
              title="Filtra questa colonna"
            >
              <Filter className="w-3 h-3" />
            </button>
          </div>
          
          {isFiltering && (
            <div className="relative mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
              <input 
                type="text" 
                autoFocus
                placeholder="Cerca..."
                value={filterValue}
                onChange={(e) => setColumnFilters(prev => ({...prev, [sortKey]: e.target.value}))}
                className="w-full pl-2 pr-6 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-all shadow-sm"
              />
              <button 
                onClick={() => { setColumnFilters(prev => ({...prev, [sortKey]: ''})); setActiveFilterCol(null); }} 
                className="absolute right-1 top-1.5 text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-3 h-3" />
              </button>
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
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">Knowledge Base</h1>
          <p className="text-zinc-500 text-sm mt-1">Archivio documenti, anomalie e training dell'Intelligenza Artificiale.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={handleSyncEmbeddings} 
            disabled={isSyncing}
            className="flex items-center justify-center px-4 py-2.5 bg-white border border-zinc-200 text-zinc-900 text-sm font-medium rounded-xl hover:bg-zinc-50 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} /> 
            {isSyncing ? 'Sincronizzazione...' : 'Sincronizza IA'}
          </button>
          <button 
            onClick={() => openForm()} 
            className="flex items-center justify-center px-5 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-800 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" /> Aggiungi Documento
          </button>
        </div>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-zinc-200/80">
          <div className="flex justify-between items-center mb-8 border-b border-zinc-100 pb-4">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{editingId ? 'Modifica Documento' : 'Nuovo Documento'}</h2>
            <button onClick={() => setIsFormOpen(false)} className="p-2 bg-zinc-50 text-zinc-400 hover:text-zinc-900 rounded-full transition-colors"><X className="w-5 h-5" /></button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-4 uppercase tracking-wider flex items-center">
                <span className="w-2 h-2 rounded-full bg-zinc-300 mr-2"></span> Dati Identificativi
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">numero_originale</label><input type="text" value={formData.numero_originale} onChange={e => setFormData({...formData, numero_originale: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
                <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">riferimento</label><input type="text" value={formData.riferimento} onChange={e => setFormData({...formData, riferimento: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
                <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">data_pubblicazione</label><input type="date" value={formData.data_pubblicazione} onChange={e => setFormData({...formData, data_pubblicazione: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-4 uppercase tracking-wider flex items-center">
                <span className="w-2 h-2 rounded-full bg-zinc-300 mr-2"></span> Classificazione
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">classe</label><input type="text" value={formData.classe} onChange={e => setFormData({...formData, classe: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
                <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">tipologia</label><input type="text" value={formData.tipologia} onChange={e => setFormData({...formData, tipologia: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
                <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">argomento</label><input type="text" value={formData.argomento} onChange={e => setFormData({...formData, argomento: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-4 uppercase tracking-wider flex items-center">
                <span className="w-2 h-2 rounded-full bg-zinc-300 mr-2"></span> Prodotti Coinvolti
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[1,2,3,4,5,6].map(num => (
                  <div key={num}>
                    <label className="block text-[10px] font-medium text-zinc-400 mb-1.5 uppercase">prodotto_{num}</label>
                    <input type="text" value={(formData as any)[`prodotto_${num}`]} onChange={e => setFormData({...formData, [`prodotto_${num}`]: e.target.value})} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-1 focus:ring-zinc-900 outline-none text-xs" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-4 uppercase tracking-wider flex items-center">
                <span className="w-2 h-2 rounded-full bg-zinc-300 mr-2"></span> Contenuto Documento
              </h3>
              <div className="space-y-5">
                <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">oggetto *</label><input type="text" value={formData.oggetto} onChange={e => setFormData({...formData, oggetto: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm font-medium" required /></div>
                <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">contenuto *</label><textarea value={formData.contenuto} onChange={e => setFormData({...formData, contenuto: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm min-h-[180px] leading-relaxed" required /></div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-zinc-100">
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-2.5 bg-white text-zinc-600 text-sm font-medium rounded-xl hover:bg-zinc-50 mr-3 transition-all">Annulla</button>
              <button type="submit" disabled={isLoading} className="px-6 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-sm">
                {isLoading ? 'Salvataggio...' : 'Salva Documento'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-zinc-200/80 flex flex-col overflow-hidden w-full">
        {/* Barra di ricerca globale e paginazione */}
        <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" strokeWidth={1.5} />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Cerca Globale (Oggetto, Codice, Rif)..." className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-1 focus:ring-zinc-900 outline-none transition-all shadow-sm" />
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto bg-white px-4 py-2 rounded-xl border border-zinc-200 shadow-sm">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Mostra Righe:</span>
            <input 
              type="number" 
              value={rowLimit} 
              onChange={(e) => setRowLimit(e.target.value)}
              placeholder="Tutte"
              className="w-16 px-2 py-1 text-sm bg-zinc-50 border border-zinc-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-900 text-center" 
            />
            <span className="text-xs text-zinc-400 font-medium">/ {items.length} totali</span>
          </div>
        </div>
        
        {/* Tabella Scrollabile */}
        <div className="w-full overflow-x-auto custom-scrollbar relative">
          <table className="w-full text-sm text-left min-w-[2800px]">
            <thead className="bg-white border-b border-zinc-100">
              <tr>
                <SortHeader label="numero_originale" sortKey="numero_originale" sticky position="left-0" />
                <SortHeader label="riferimento" sortKey="riferimento" />
                <SortHeader label="classe" sortKey="classe" />
                <SortHeader label="oggetto" sortKey="oggetto" />
                <SortHeader label="tipologia" sortKey="tipologia" />
                <SortHeader label="argomento" sortKey="argomento" />
                <SortHeader label="contenuto" sortKey="contenuto" />
                <SortHeader label="prodotto_1" sortKey="prodotto_1" />
                <SortHeader label="prodotto_2" sortKey="prodotto_2" />
                <SortHeader label="prodotto_3" sortKey="prodotto_3" />
                <SortHeader label="prodotto_4" sortKey="prodotto_4" />
                <SortHeader label="prodotto_5" sortKey="prodotto_5" />
                <SortHeader label="prodotto_6" sortKey="prodotto_6" />
                <SortHeader label="data_pubblicazione" sortKey="data_pubblicazione" />
                
                <th className="px-4 py-3 align-top text-center text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Stato IA</th>
                <th className="px-4 py-3 align-top text-right text-[11px] font-semibold text-zinc-500 uppercase tracking-wider sticky right-0 bg-white shadow-[-5px_0_15px_-3px_rgba(0,0,0,0.05)] z-20">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {processedItems.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-4 py-10 text-center text-zinc-500 text-sm">Nessun documento trovato.</td>
                </tr>
              ) : (
                processedItems.map(item => (
                  <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors group">
                    <td className="px-4 py-3 text-zinc-700 font-mono text-xs whitespace-nowrap sticky left-0 bg-white group-hover:bg-zinc-50 transition-colors shadow-[5px_0_15px_-3px_rgba(0,0,0,0.02)] z-10 border-r border-zinc-100">
                      {item.numero_originale || '-'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-mono text-[11px] whitespace-nowrap">{item.riferimento || '-'}</td>
                    <td className="px-4 py-3 text-zinc-600 text-xs whitespace-nowrap">{item.classe || '-'}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900 max-w-[250px] truncate" title={item.oggetto}>{item.oggetto}</td>
                    <td className="px-4 py-3 text-zinc-600 text-xs whitespace-nowrap">{item.tipologia || '-'}</td>
                    <td className="px-4 py-3 text-zinc-600 text-xs max-w-[150px] truncate" title={item.argomento}>{item.argomento || '-'}</td>
                    
                    {/* Colonna CONTENUTO aggiunta */}
                    <td className="px-4 py-3 text-zinc-500 text-xs max-w-[300px] truncate" title={item.contenuto}>{item.contenuto || '-'}</td>
                    
                    <td className="px-4 py-3 text-zinc-500 text-[11px] max-w-[120px] truncate" title={item.prodotto_1}>{item.prodotto_1 || '-'}</td>
                    <td className="px-4 py-3 text-zinc-500 text-[11px] max-w-[120px] truncate" title={item.prodotto_2}>{item.prodotto_2 || '-'}</td>
                    <td className="px-4 py-3 text-zinc-500 text-[11px] max-w-[120px] truncate" title={item.prodotto_3}>{item.prodotto_3 || '-'}</td>
                    <td className="px-4 py-3 text-zinc-500 text-[11px] max-w-[120px] truncate" title={item.prodotto_4}>{item.prodotto_4 || '-'}</td>
                    <td className="px-4 py-3 text-zinc-500 text-[11px] max-w-[120px] truncate" title={item.prodotto_5}>{item.prodotto_5 || '-'}</td>
                    <td className="px-4 py-3 text-zinc-500 text-[11px] max-w-[120px] truncate" title={item.prodotto_6}>{item.prodotto_6 || '-'}</td>
                    <td className="px-4 py-3 text-zinc-600 text-xs whitespace-nowrap">{item.data_pubblicazione || '-'}</td>
                    
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center tooltip" title={item.embedding ? "Documento appreso dall'IA" : "In attesa di Sincronizzazione"}>
                        {item.embedding 
                          ? <CheckCircle2 className="w-4 h-4 text-green-600" strokeWidth={2.5} />
                          : <CircleDashed className="w-4 h-4 text-zinc-300" strokeWidth={2.5} />
                        }
                      </div>
                    </td>
                    
                    <td className="px-4 py-3 text-right sticky right-0 bg-white group-hover:bg-zinc-50 transition-colors shadow-[-5px_0_15px_-3px_rgba(0,0,0,0.02)] z-10 border-l border-zinc-100">
                      <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openForm(item)} className="p-2 text-zinc-400 hover:text-zinc-900 bg-white hover:bg-zinc-100 rounded-lg border border-zinc-100 hover:border-zinc-300 transition-all"><Edit className="w-4 h-4"/></button>
                        <button onClick={() => handleDelete(item.id)} className="p-2 text-zinc-400 hover:text-red-600 bg-white hover:bg-red-50 rounded-lg border border-zinc-100 hover:border-red-200 transition-all"><Trash2 className="w-4 h-4"/></button>
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