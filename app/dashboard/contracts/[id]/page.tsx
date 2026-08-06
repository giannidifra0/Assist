'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { FileText, Calendar, Building2, Briefcase, Factory, FileSignature, CheckCircle2, Timer, MapPin, Hash, Network } from 'lucide-react';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const DetailRow = ({ label, value }: { label: string, value: React.ReactNode }) => (
  <div className="flex flex-col sm:flex-row sm:items-center py-2.5 border-b border-zinc-100 dark:border-zinc-800/80 last:border-0 last:pb-0">
    <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest sm:w-1/3 mb-1 sm:mb-0 shrink-0">{label}</span>
    <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 sm:w-2/3">{value}</span>
  </div>
);

export default function ContractDetailPage() {
  const params = useParams();
  const [contratto, setContratto] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDetails() {
      if (!params.id) return;
      const { data, error } = await supabase
        .from('vista_cnel_contratti')
        .select('*')
        .eq('id', params.id)
        .single();

      if (data && !error) setContratto(data);
      setIsLoading(false);
    }
    fetchDetails();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 font-sans">
        <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
          {/* Skeleton Intestazione */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 h-32"></div>
          
          {/* Skeleton Griglia Centrale */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 h-48"></div>
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 h-48"></div>
            </div>
            <div className="space-y-6">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 h-48"></div>
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 h-48"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!contratto) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center">
          <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Contratto non trovato</h2>
        </div>
      </div>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/D';
    return new Date(dateString).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const renderBadgeList = (items: string[]) => {
    if (!items || items.length === 0) return <span className="text-xs text-zinc-500 italic">Dato mancante</span>;
    return (
      <div className="flex flex-wrap gap-1.5 mt-1">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700">
            {item}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
        
        {/* INTESTAZIONE SCHEDA */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm relative overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="px-2.5 py-1 rounded-md bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-[11px] font-bold tracking-widest">
              {contratto.codice_ccnl || 'CODICE N/A'}
            </span>
            <span className="px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-[11px] font-bold tracking-widest flex items-center gap-1.5">
              <Hash className="w-3 h-3" /> ID: {contratto.identificativo_accordo || 'N/A'}
            </span>
            {contratto.stato && (
              <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 text-[11px] font-bold tracking-widest uppercase flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {contratto.stato}
              </span>
            )}
          </div>
          
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white leading-tight mb-2">
            {contratto.titolo_ccnl}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
            {contratto.titolo}
          </p>
        </div>

        {/* CONTENUTO A GRIGLIA */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* COLONNA SINISTRA */}
          <div className="space-y-6">
            
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <Timer className="w-4 h-4 text-zinc-400" /> Dettagli Temporali
              </h3>
              <div className="flex flex-col">
                <DetailRow label="Data Stipula" value={formatDate(contratto.data_stipula)} />
                <DetailRow label="Decorrenza" value={formatDate(contratto.data_decorrenza)} />
                <DetailRow label="Scadenza Economica" value={formatDate(contratto.data_scadenza_economica)} />
                <DetailRow label="Scadenza Contrattuale" value={<span className="font-bold text-rose-600 dark:text-rose-400">{formatDate(contratto.data_scadenza_contrattuale)}</span>} />
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <MapPin className="w-4 h-4 text-zinc-400" /> Classificazione e Ambito
              </h3>
              <div className="flex flex-col">
                <DetailRow label="Ambito" value={contratto.ambito || '-'} />
                <DetailRow label="Tipo Accordo" value={contratto.tipologia_accordo || '-'} />
                <DetailRow label="Comparto" value={contratto.comparto || '-'} />
                <DetailRow label="Sezione" value={contratto.sezione || '-'} />
              </div>
            </div>

          </div>

          {/* COLONNA DESTRA */}
          <div className="space-y-6">
            
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <Briefcase className="w-4 h-4 text-zinc-400" /> Soggetti Firmatari
              </h3>
              <div className="flex flex-col">
                <div className="py-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
                  <span className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2"><Building2 className="w-3 h-3 inline mr-1" /> Parti Datoriali</span>
                  {renderBadgeList(contratto.parti_datoriali_firmatarie)}
                </div>
                <div className="py-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
                  <span className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2"><Briefcase className="w-3 h-3 inline mr-1" /> Parti Sindacali</span>
                  {renderBadgeList(contratto.parti_sindacali_firmatarie)}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <Network className="w-4 h-4 text-zinc-400" /> Settori e ATECO
              </h3>
              <div className="flex flex-col">
                <div className="py-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
                  <span className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2"><Factory className="w-3 h-3 inline mr-1" /> Settori Coinvolti</span>
                  {renderBadgeList(contratto.settori_descrizione)}
                  <div className="mt-2">{renderBadgeList(contratto.sottosettori_descrizione)}</div>
                </div>
                <div className="py-2.5">
                  <span className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2"><Hash className="w-3 h-3 inline mr-1" /> Codici ATECO</span>
                  {renderBadgeList(contratto.settori_ateco_descrizione)}
                  <div className="mt-2">{renderBadgeList(contratto.sottosettori_ateco_descrizione)}</div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}