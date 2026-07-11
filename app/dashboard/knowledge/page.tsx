'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/app/lib/supabase';
import { Plus, Edit, X, FileText } from 'lucide-react';

export default function KnowledgeBasePage() {
  const [schede, setSchede] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    numero_originale: '', classe: 'Scheda', tipologia: 'Informazioni', oggetto: '', contenuto: ''
  });

  useEffect(() => {
    fetchKnowledgeBase();
  }, []);

  const fetchKnowledgeBase = async () => {
    setLoading(true);
    const { data } = await supabase.from('knowledge_base').select('*').order('data_creazione', { ascending: false });
    if (data) setSchede(data);
    setLoading(false);
  };

  const openModal = (scheda: any = null) => {
    if (scheda) {
      setEditingId(scheda.id);
      setFormData({
        numero_originale: scheda.numero_originale || '', classe: scheda.classe || 'Scheda',
        tipologia: scheda.tipologia || 'Informazioni', oggetto: scheda.oggetto || '', contenuto: scheda.contenuto || ''
      });
    } else {
      setEditingId(null);
      setFormData({ numero_originale: '', classe: 'Scheda', tipologia: 'Informazioni', oggetto: '', contenuto: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await supabase.from('knowledge_base').update(formData).eq('id', editingId);
    } else {
      await supabase.from('knowledge_base').insert([formData]);
    }
    setIsModalOpen(false);
    fetchKnowledgeBase();
  };

  return (
    <div className="p-10 font-sans antialiased">
      <div className="flex justify-between items-end mb-8 mt-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-1">Knowledge Base</h1>
          <p className="text-base text-gray-500 font-medium">Archivio dei ticket e soluzioni tecniche</p>
        </div>
        <button onClick={() => openModal()} className="bg-gray-900 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-black flex items-center transition-all text-sm">
          <Plus className="h-4 w-4 mr-2" strokeWidth={2} /> Nuova Scheda
        </button>
      </div>

      <div className="bg-white rounded-[24px] shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 font-medium text-sm">Recupero schede...</div>
        ) : schede.length === 0 ? (
          <div className="p-20 text-center">
            <div className="w-16 h-16 bg-[#F5F5F7] rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-gray-400" strokeWidth={1.5} />
            </div>
            <p className="text-gray-900 font-semibold tracking-tight text-lg">Nessuna scheda presente</p>
            <p className="text-gray-400 text-sm mt-1 font-medium">Clicca su "Nuova Scheda" per aggiungere il primo ticket al database.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-400 tracking-tight">
                <th className="px-6 py-4 font-medium">Num.</th>
                <th className="px-6 py-4 font-medium">Classe</th>
                <th className="px-6 py-4 font-medium w-1/2">Oggetto</th>
                <th className="px-6 py-4 font-medium">Tipologia</th>
                <th className="px-6 py-4 font-medium text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {schede.map((scheda) => (
                <tr key={scheda.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">{scheda.numero_originale || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-medium">{scheda.classe || '-'}</td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-gray-900 tracking-tight line-clamp-1">{scheda.oggetto}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${scheda.tipologia === 'Anomalie' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                      {scheda.tipologia || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => openModal(scheda)} className="text-gray-400 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-xl transition-colors inline-flex opacity-0 group-hover:opacity-100">
                      <Edit className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[28px] shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-gray-100 w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-gray-50 sticky top-0 bg-white/90 backdrop-blur-md z-10">
              <h2 className="text-xl font-semibold tracking-tight text-gray-900">{editingId ? 'Modifica Scheda' : 'Nuova Scheda'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors"><X className="h-5 w-5" strokeWidth={1.5} /></button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Num. Originale</label>
                  <input type="text" value={formData.numero_originale} onChange={(e) => setFormData({...formData, numero_originale: e.target.value})} placeholder="es. 25517" className="w-full p-3.5 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium placeholder-gray-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Classe</label>
                  <select value={formData.classe} onChange={(e) => setFormData({...formData, classe: e.target.value})} className="w-full p-3.5 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium cursor-pointer">
                    <option value="Scheda">Scheda</option>
                    <option value="Ticket">Ticket</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Tipologia</label>
                  <select value={formData.tipologia} onChange={(e) => setFormData({...formData, tipologia: e.target.value})} className="w-full p-3.5 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium cursor-pointer">
                    <option value="Informazioni">Informazioni</option>
                    <option value="Anomalie">Anomalie</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Oggetto / Titolo</label>
                <input type="text" required value={formData.oggetto} onChange={(e) => setFormData({...formData, oggetto: e.target.value})} placeholder="Sintesi del problema..." className="w-full p-3.5 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-semibold placeholder-gray-400 tracking-tight" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 pl-1">Contenuto della scheda</label>
                <textarea required rows={8} value={formData.contenuto} onChange={(e) => setFormData({...formData, contenuto: e.target.value})} placeholder="Errore, cause, query SQL e soluzioni..." className="w-full p-4 bg-[#F5F5F7] border-0 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 font-medium resize-none placeholder-gray-400 leading-relaxed"></textarea>
              </div>

              <div className="pt-4 flex justify-end space-x-3 mt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-600 font-semibold hover:bg-gray-100 rounded-xl transition-colors text-sm">Annulla</button>
                <button type="submit" className="px-5 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-black transition-colors text-sm">Salva Scheda</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}