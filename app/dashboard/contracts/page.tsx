'use client';

import { useState } from 'react';

export default function ContractsPage() {
  const [activeTab, setActiveTab] = useState<'ccnl' | 'dati'>('ccnl');

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Contrattualistica</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1 font-medium">Gestione contratti e documentazione contrattuale.</p>
        </div>
      </div>

      {/* Mac-style horizontal top bar — compact */}
      <div className="bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm p-1 flex items-center gap-0.5 w-fit">
        <button
          onClick={() => setActiveTab('ccnl')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
            activeTab === 'ccnl'
              ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          CCNL Archivio
        </button>
        <button
          onClick={() => setActiveTab('dati')}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
            activeTab === 'dati'
              ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          Dati &amp; Valori
        </button>
      </div>

      {/* Content area */}
      <div className="w-full">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
          {activeTab === 'ccnl' ? 'CCNL Archivio' : 'Dati & Valori'}
        </h2>
      </div>
    </div>
  );
}
