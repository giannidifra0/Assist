'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Users, Sparkles, ChevronRight } from 'lucide-react';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('crm_user');
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  return (
    <div className="p-10 font-sans antialiased">
      
      {/* HEADER */}
      <div className="mb-10 mt-2">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-1">
          Ciao, {user?.nominativo || 'Utente'}.
        </h1>
        <p className="text-base text-gray-500 font-medium">
          Benvenuto nel tuo spazio di lavoro.
        </p>
      </div>

      {/* GRIGLIA STATISTICHE - Dimensioni ridotte */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        <div className="bg-white p-5 rounded-[20px] shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-gray-100">
          <div className="w-8 h-8 rounded-full bg-[#F5F5F7] flex items-center justify-center mb-4">
            <BookOpen className="h-4 w-4 text-gray-900" strokeWidth={1.5} />
          </div>
          <p className="text-3xl font-semibold tracking-tight text-gray-900">0</p>
          <p className="text-xs font-medium text-gray-500 mt-1">Schede Knowledge Base</p>
        </div>

        <div className="bg-white p-5 rounded-[20px] shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-gray-100">
          <div className="w-8 h-8 rounded-full bg-[#F5F5F7] flex items-center justify-center mb-4">
            <Users className="h-4 w-4 text-gray-900" strokeWidth={1.5} />
          </div>
          <p className="text-3xl font-semibold tracking-tight text-gray-900">1</p>
          <p className="text-xs font-medium text-gray-500 mt-1">Utenti Attivi</p>
        </div>

        <div className="bg-white p-5 rounded-[20px] shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-gray-100">
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <Sparkles className="h-4 w-4 text-blue-600" strokeWidth={1.5} />
          </div>
          <p className="text-3xl font-semibold tracking-tight text-gray-900">In attesa</p>
          <p className="text-xs font-medium text-gray-500 mt-1">Stato Intelligenza Artificiale</p>
        </div>
      </div>

      {/* AZIONI RAPIDE - Formato compatto */}
      <h2 className="text-lg font-semibold tracking-tight text-gray-900 mb-4">Azioni Rapide</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        <Link href="/dashboard/knowledge" className="group bg-[#F5F5F7] p-6 rounded-[20px] hover:bg-gray-100 transition-all duration-200">
          <div className="flex items-center mb-2">
            <BookOpen className="h-5 w-5 text-gray-900 mr-2.5" strokeWidth={1.5} />
            <h3 className="text-base font-semibold tracking-tight text-gray-900">Knowledge Base</h3>
          </div>
          <p className="text-gray-500 text-sm font-medium mb-4">Gestisci i ticket, inserisci nuove soluzioni e consulta l'archivio.</p>
          <div className="flex items-center text-xs font-semibold text-gray-900 opacity-60 group-hover:opacity-100 transition-opacity">
            Apri archivio <ChevronRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" strokeWidth={2} />
          </div>
        </Link>

        {user?.ruolo === 'admin' && (
          <Link href="/dashboard/users" className="group bg-[#F5F5F7] p-6 rounded-[20px] hover:bg-gray-100 transition-all duration-200">
            <div className="flex items-center mb-2">
              <Users className="h-5 w-5 text-gray-900 mr-2.5" strokeWidth={1.5} />
              <h3 className="text-base font-semibold tracking-tight text-gray-900">Gestione Utenti</h3>
            </div>
            <p className="text-gray-500 text-sm font-medium mb-4">Aggiungi nuovi operatori o modifica i permessi di accesso al CRM.</p>
            <div className="flex items-center text-xs font-semibold text-gray-900 opacity-60 group-hover:opacity-100 transition-opacity">
              Gestisci team <ChevronRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" strokeWidth={2} />
            </div>
          </Link>
        )}
        
      </div>
    </div>
  );
}