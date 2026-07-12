'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Search, Edit, Trash2, Plus, X, Save } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type KnowledgeItem = {
  id: string;
  numero_originale: string | null;
  classe: string | null;
  oggetto: string | null;
  tipologia: string | null;
  argomento: string | null;
  prodotti: string[] | null;
  contenuto: string | null;
  data_pubblicazione: string | null;
};

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Stato del form allineato al tuo DB
  const [formData, setFormData] = useState({
    numero_originale: '',
    classe: '',
    oggetto: '',
    tipologia: '',
    argomento: '',
    prodotti: '', // Lo gestiamo come stringa separata da virgola nel form
    contenuto: '',
    data_pubblicazione: ''
  });

  const fetchKnowledge = async () => {
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('*')
      .order('data_creazione', { ascending: false });

    if (!error && data) {
      setItems(data);
    }
  };

  useEffect(() => {
    fetchKnowledge();
  }, []);

  const filteredItems = items.filter(item => 
    (item.oggetto?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
    (item.contenuto?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (item.argomento?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const handleAddNew = () => {
    setFormData({
      numero_originale: '', classe: '', oggetto: '', tipologia: '', 
      argomento: '', prodotti: '', contenuto: '', data_pubblicazione: ''
    });
    setEditingId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item: KnowledgeItem) => {
    setFormData({
      numero_originale: item.numero_originale || '',
      classe: item.classe || '',
      oggetto: item.oggetto || '',
      tipologia: item.tipologia || '',
      argomento: item.argomento || '',
      prodotti: item.prodotti ? item.prodotti.join(', ') : '', // Array -> Stringa
      contenuto: item.contenuto || '',
      data_pubblicazione: item.data_pubblicazione || ''
    });
    setEditingId(item.id);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.oggetto || !formData.contenuto) return;
    
    setIsLoading(true);

    // Converte i prodotti (stringa) in array pulito, rimuovendo spazi
    const arrayProdotti = formData.prodotti 
      ? formData.prodotti.split(',').map(p => p.trim()).filter(p => p !== '') 
      : null;

    const payload = {
      numero_originale: formData.numero_originale || null,
      classe: formData.classe || null,
      oggetto: formData.oggetto,
      tipologia: formData.tipologia || null,
      argomento: formData.argomento || null,
      prodotti: arrayProdotti,
      contenuto: formData.contenuto,
      data_pubblicazione: formData.data_pubblicazione || null,
      embedding: null // Forziamo a null per obbligare l'IA a ricalcolarlo
    };

    try {
      if (editingId) {
        const { error } = await supabase.from('knowledge_base').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('knowledge_base').insert([payload]);
        if (error) throw error;
      }

      await fetchKnowledge();
      setIsFormOpen(false);
    } catch (error: any) {
      alert("Errore salvataggio: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questa scheda?')) return;
    const { error } = await supabase.from('knowledge_base').delete().eq('id', id);
    if (error) alert("Errore durante l'eliminazione.");
    else await fetchKnowledge();
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-gray-500 text-sm mt-1">Gestione archivio documenti IA</p>
        </div>
        <button onClick={handleAddNew} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition">
          <Plus className="w-4 h-4" /> Aggiungi
        </button>
      </div>

      {/* Form */}
      {isFormOpen && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold">{editingId ? 'Modifica' : 'Nuova Scheda'}</h2>
            <button onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Numero Originale</label>
                <input type="text" value={formData.numero_originale} onChange={e => setFormData({...formData, numero_originale: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data Pubblicazione</label>
                <input type="date" value={formData.data_pubblicazione} onChange={e => setFormData({...formData, data_pubblicazione: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Classe</label>
                <input type="text" value={formData.classe} onChange={e => setFormData({...formData, classe: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tipologia</label>
                <input type="text" value={formData.tipologia} onChange={e => setFormData({...formData, tipologia: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Argomento</label>
                <input type="text" value={formData.argomento} onChange={e => setFormData({...formData, argomento: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prodotti (separati da virgola)</label>
                <input type="text" value={formData.prodotti} onChange={e => setFormData({...formData, prodotti: e.target.value})} placeholder="Es. ProdottoA, ProdottoB" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>
            
            <div className="pt-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Oggetto *</label>
              <input type="text" value={formData.oggetto} onChange={e => setFormData({...formData, oggetto: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contenuto *</label>
              <textarea value={formData.contenuto} onChange={e => setFormData({...formData, contenuto: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm min-h-[120px]" required />
            </div>

            <div className="flex justify-end pt-4">
              <button type="submit" disabled={isLoading} className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 text-sm">
                <Save className="w-4 h-4" /> {isLoading ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabella con Ricerca */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Cerca..." className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3">Num</th>
                <th className="px-6 py-3">Oggetto</th>
                <th className="px-6 py-3">Argomento</th>
                <th className="px-6 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-500">{item.numero_originale || '-'}</td>
                  <td className="px-6 py-3 font-medium">{item.oggetto}</td>
                  <td className="px-6 py-3 text-gray-500">{item.argomento || '-'}</td>
                  <td className="px-6 py-3 text-right flex justify-end gap-3">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-900"><Edit className="w-4 h-4"/></button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
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