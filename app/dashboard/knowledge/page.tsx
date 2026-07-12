'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Search, Edit, Trash2, Plus, X, ArrowUpDown } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type KnowledgeItem = { id: string; numero_originale: string; classe: string; oggetto: string; tipologia: string; argomento: string; prodotti: string[]; contenuto: string; data_pubblicazione: string; };

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof KnowledgeItem; direction: 'asc' | 'desc' } | null>(null);

  const [formData, setFormData] = useState({ numero_originale: '', classe: '', oggetto: '', tipologia: '', argomento: '', prodotti: '', contenuto: '', data_pubblicazione: '' });

  const fetchKnowledge = async () => {
    const { data, error } = await supabase.from('knowledge_base').select('*');
    if (!error && data) setItems(data);
  };

  useEffect(() => { fetchKnowledge(); }, []);

  const sortedAndFilteredItems = useMemo(() => {
    let filterData = items.filter(item => 
      (item.oggetto?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
      (item.argomento?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.numero_originale?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    if (sortConfig !== null) {
      filterData.sort((a, b) => {
        let aVal = a[sortConfig.key] || ''; let bVal = b[sortConfig.key] || '';
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filterData;
  }, [items, searchTerm, sortConfig]);

  const requestSort = (key: keyof KnowledgeItem) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const arrayProdotti = formData.prodotti ? formData.prodotti.split(',').map(p => p.trim()).filter(p => p !== '') : null;
    const payload = { ...formData, prodotti: arrayProdotti, embedding: null };

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
        numero_originale: item.numero_originale || '', classe: item.classe || '', oggetto: item.oggetto || '', tipologia: item.tipologia || '',
        argomento: item.argomento || '', prodotti: item.prodotti ? item.prodotti.join(', ') : '', contenuto: item.contenuto || '', data_pubblicazione: item.data_pubblicazione || ''
      });
      setEditingId(item.id);
    } else {
      setFormData({ numero_originale: '', classe: '', oggetto: '', tipologia: '', argomento: '', prodotti: '', contenuto: '', data_pubblicazione: '' });
      setEditingId(null);
    }
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const SortHeader = ({ label, sortKey }: { label: string, sortKey: keyof KnowledgeItem }) => (
    <th className="px-4 py-4 cursor-pointer hover:bg-zinc-100/50 transition-colors whitespace-nowrap" onClick={() => requestSort(sortKey)}>
      <div className="flex items-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        {label} <ArrowUpDown className="ml-2 h-3 w-3" />
      </div>
    </th>
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900">Knowledge Base</h1>
          <p className="text-zinc-500 text-sm mt-1">Archivio documenti e intelligenza artificiale.</p>
        </div>
        <button onClick={() => openForm()} className="flex items-center justify-center w-full sm:w-auto px-5 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-800 transition-all shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Aggiungi Documento
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-zinc-200/80">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold">{editingId ? 'Modifica Documento' : 'Nuovo Documento'}</h2>
            <button onClick={() => setIsFormOpen(false)} className="text-zinc-400 hover:text-zinc-900"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Num. Originale</label><input type="text" value={formData.numero_originale} onChange={e => setFormData({...formData, numero_originale: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Classe</label><input type="text" value={formData.classe} onChange={e => setFormData({...formData, classe: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Tipologia</label><input type="text" value={formData.tipologia} onChange={e => setFormData({...formData, tipologia: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Argomento</label><input type="text" value={formData.argomento} onChange={e => setFormData({...formData, argomento: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Prodotti (virgola)</label><input type="text" value={formData.prodotti} onChange={e => setFormData({...formData, prodotti: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
              <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Data Pubblicazione</label><input type="date" value={formData.data_pubblicazione} onChange={e => setFormData({...formData, data_pubblicazione: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" /></div>
            </div>
            <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Oggetto *</label><input type="text" value={formData.oggetto} onChange={e => setFormData({...formData, oggetto: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm" required /></div>
            <div><label className="block text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wide">Contenuto/Soluzione *</label><textarea value={formData.contenuto} onChange={e => setFormData({...formData, contenuto: e.target.value})} className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-1 focus:ring-zinc-900 outline-none text-sm min-h-[140px]" required /></div>
            <div className="flex justify-end pt-2"><button type="submit" disabled={isLoading} className="w-full sm:w-auto px-6 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-all">{isLoading ? 'Salvataggio...' : 'Salva Documento'}</button></div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200/80 flex flex-col">
        <div className="p-4 border-b border-zinc-100"><div className="relative max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" strokeWidth={1.5} /><input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Cerca..." className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-1 focus:ring-zinc-900 outline-none transition-all" /></div></div>
        
        {/* Contenitore con scroll orizzontale */}
        <div className="w-full overflow-x-auto rounded-b-2xl">
          <table className="w-full text-sm text-left min-w-[800px]">
            <thead className="bg-zinc-50/50 border-b border-zinc-100">
              <tr>
                <SortHeader label="Cod." sortKey="numero_originale" />
                <SortHeader label="Oggetto" sortKey="oggetto" />
                <SortHeader label="Argomento" sortKey="argomento" />
                <SortHeader label="Classe" sortKey="classe" />
                <th className="px-4 py-4 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sortedAndFilteredItems.map(item => (
                <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{item.numero_originale || '-'}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900 max-w-xs truncate">{item.oggetto}</td>
                  <td className="px-4 py-3 text-zinc-600">{item.argomento || '-'}</td>
                  <td className="px-4 py-3"><span className="px-2.5 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-[11px] font-medium uppercase tracking-wider">{item.classe || '-'}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openForm(item)} className="p-2 text-zinc-400 hover:text-zinc-900 bg-white hover:bg-zinc-100 rounded-lg border border-transparent hover:border-zinc-200 transition-all"><Edit className="w-4 h-4"/></button>
                      <button onClick={() => handleDelete(item.id)} className="p-2 text-zinc-400 hover:text-red-600 bg-white hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-all"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}