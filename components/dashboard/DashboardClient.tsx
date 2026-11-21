'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  Database,
  FileText,
  FileUp,
  Layers,
  Play,
  RefreshCw,
  Save,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Ticket,
  Trash2,
  Users,
} from 'lucide-react';
import { hasPermission, ROLE_META } from '@/lib/auth/roles';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { useToast } from '@/components/ui/ToastProvider';
import type {
  DashboardStats,
  EmbeddingSyncBatchResponse,
  EmbeddingSyncCounts,
  EmbeddingSyncMode,
  EmbeddingSyncTarget,
  ParsedChunk,
  TelemetryRange,
  TelemetrySummary,
  UserProfile,
} from '@/lib/types/domain';

function AnimatedCounter({ value }: { value: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let frameId = 0;
    let startTime: number | null = null;
    const duration = 700;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(easeProgress * value));
      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        setCount(value);
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [value]);

  return <span>{count.toLocaleString('it-IT')}</span>;
}

const MAX_CLIENT_PDF_BYTES = 25 * 1024 * 1024;
const MAX_POLLING_CYCLES = 60; // ~2 minuti totali asincroni senza timeout HTTP
const EMBEDDING_BATCH_SIZE = 50;

interface EmbeddingSyncProgressState {
  active: boolean;
  hasRun: boolean;
  mode: EmbeddingSyncMode;
  currentTarget: EmbeddingSyncTarget | null;
  batchNumber: number;
  totalTarget: number;
  processed: number;
  skipped: number;
  failed: number;
  remaining: number;
  elapsedSec: number;
  lastMessage: string;
  stoppedByUser: boolean;
}

const INITIAL_SYNC_PROGRESS: EmbeddingSyncProgressState = {
  active: false,
  hasRun: false,
  mode: 'pending',
  currentTarget: null,
  batchNumber: 0,
  totalTarget: 0,
  processed: 0,
  skipped: 0,
  failed: 0,
  remaining: 0,
  elapsedSec: 0,
  lastMessage: '',
  stoppedByUser: false,
};

export function DashboardClient({ user }: { user: UserProfile }) {
  const [stats, setStats] = useState<DashboardStats>({
    knowledge: 0,
    manuals: 0,
    tickets: 0,
    usersOnline: 0,
    pendingEmbeddings: 0,
  });

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncCounts, setSyncCounts] = useState<EmbeddingSyncCounts | null>(null);
  const [isLoadingSyncCounts, setIsLoadingSyncCounts] = useState(false);
  const [syncTargetKnowledge, setSyncTargetKnowledge] = useState(true);
  const [syncTargetManuals, setSyncTargetManuals] = useState(true);
  const [confirmFullReindex, setConfirmFullReindex] = useState(false);
  const [syncProgress, setSyncProgress] =
    useState<EmbeddingSyncProgressState>(INITIAL_SYNC_PROGRESS);

  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TelemetryRange>('7d');
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetrySummary>({
    totalTokens: 0,
    requests: 0,
    successRate: 100,
    promptTokens: 0,
    responseTokens: 0,
    estimatedCostUsd: 0,
    byModel: [],
    byUser: [],
    feedback: { positive: 0, negative: 0 },
  });

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [docMetadata, setDocMetadata] = useState({ titolo: '', versione: '', prodotto: '' });
  const [docChunks, setDocChunks] = useState<ParsedChunk[]>([]);
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parseStage, setParseStage] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const [parseElapsedSec, setParseElapsedSec] = useState(0);

  const pollingCancelledRef = useRef(false);
  const syncCancelledRef = useRef(false);
  const { showToast } = useToast();

  const isSyncing = syncProgress.active;
  const canManageManuals = hasPermission(user.ruolo, 'manuals:manage');
  const canSyncEmbeddings = hasPermission(user.ruolo, 'ai:sync_embeddings');
  const canReadTelemetry = hasPermission(user.ruolo, 'telemetry:read');
  const roleMeta = ROLE_META[user.ruolo];

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      const data = (await res.json()) as { success?: boolean; stats?: DashboardStats };
      if (res.ok && data.success && data.stats) {
        setStats(data.stats);
      }
    } catch {
      // Silenzioso
    }
  }, []);

  const loadSyncCounts = useCallback(async (): Promise<EmbeddingSyncCounts | null> => {
    setIsLoadingSyncCounts(true);
    try {
      const res = await fetch('/api/embeddings');
      const data = (await res.json()) as {
        success?: boolean;
        counts?: EmbeddingSyncCounts;
        error?: string;
      };
      if (res.ok && data.success && data.counts) {
        setSyncCounts(data.counts);
        return data.counts;
      }
      showToast(data.error || 'Impossibile verificare lo stato dei vettori IA.', 'error');
      return null;
    } catch {
      showToast('Errore di connessione durante lettura stato vettori.', 'error');
      return null;
    } finally {
      setIsLoadingSyncCounts(false);
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/dashboard/stats');
        const data = (await res.json()) as { success?: boolean; stats?: DashboardStats };
        if (active && res.ok && data.success && data.stats) {
          setStats(data.stats);
        }
      } catch {
        // Silenzioso
      }
    })();
    return () => {
      active = false;
      pollingCancelledRef.current = true;
      syncCancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!isStatsOpen || !canReadTelemetry) return;

    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/dashboard/telemetry?range=${timeFilter}`);
        const data = (await res.json()) as {
          success?: boolean;
          telemetry?: TelemetrySummary;
          error?: string;
        };
        if (active && res.ok && data.success && data.telemetry) {
          setTelemetry(data.telemetry);
        } else if (active && !res.ok) {
          showToast(data.error || 'Impossibile leggere la telemetria.', 'error');
        }
      } catch {
        if (active) showToast('Errore di connessione durante lettura telemetria.', 'error');
      } finally {
        if (active) setIsLoadingTelemetry(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isStatsOpen, timeFilter, canReadTelemetry, showToast]);

  const handleOpenTelemetry = () => {
    setIsLoadingTelemetry(true);
    setIsStatsOpen(true);
  };

  const handleRangeChange = (range: TelemetryRange) => {
    setIsLoadingTelemetry(true);
    setTimeFilter(range);
  };

  const handleOpenSyncModal = () => {
    setConfirmFullReindex(false);
    setIsSyncModalOpen(true);
    if (!isSyncing) {
      void loadSyncCounts();
    }
  };

  const stopEmbeddingSync = () => {
    syncCancelledRef.current = true;
    setSyncProgress((prev) => ({
      ...prev,
      stoppedByUser: true,
      lastMessage: 'Arresto richiesto: completamento del blocco in corso...',
    }));
  };

  const runEmbeddingSync = async (mode: EmbeddingSyncMode) => {
    if (syncProgress.active) return;

    const freshCounts = await loadSyncCounts();
    if (!freshCounts) return;

    const targets: Array<{ target: EmbeddingSyncTarget; count: number }> = [];
    if (mode === 'pending') {
      if (freshCounts.knowledgePending > 0) {
        targets.push({ target: 'knowledge', count: freshCounts.knowledgePending });
      }
      if (freshCounts.manualChunksPending > 0) {
        targets.push({ target: 'manuals', count: freshCounts.manualChunksPending });
      }
    } else {
      if (syncTargetKnowledge && freshCounts.knowledgeTotal > 0) {
        targets.push({ target: 'knowledge', count: freshCounts.knowledgeTotal });
      }
      if (syncTargetManuals && freshCounts.manualChunksTotal > 0) {
        targets.push({ target: 'manuals', count: freshCounts.manualChunksTotal });
      }
    }

    const totalTarget = targets.reduce((acc, item) => acc + item.count, 0);
    if (targets.length === 0 || totalTarget === 0) {
      showToast(
        mode === 'pending'
          ? 'Tutti i vettori IA sono già sincronizzati.'
          : 'Seleziona almeno un archivio con record presenti.',
        'info'
      );
      return;
    }

    syncCancelledRef.current = false;
    setConfirmFullReindex(false);
    const runStartedMs = Date.now();

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let batchNumber = 0;
    let abortedWithError = false;

    setSyncProgress({
      active: true,
      hasRun: true,
      mode,
      currentTarget: targets[0].target,
      batchNumber: 0,
      totalTarget,
      processed: 0,
      skipped: 0,
      failed: 0,
      remaining: totalTarget,
      elapsedSec: 0,
      lastMessage: `Avvio elaborazione di ${totalTarget.toLocaleString('it-IT')} elementi...`,
      stoppedByUser: false,
    });

    for (const entry of targets) {
      if (syncCancelledRef.current || abortedWithError) break;

      let afterId: string | null = null;

      while (!syncCancelledRef.current) {
        setSyncProgress((prev) => ({
          ...prev,
          currentTarget: entry.target,
          lastMessage:
            entry.target === 'knowledge'
              ? `Indicizzazione Knowledge Base (blocco #${batchNumber + 1})...`
              : `Indicizzazione Manuali PDF (blocco #${batchNumber + 1})...`,
        }));

        try {
          const response = await fetch('/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              target: entry.target,
              mode,
              afterId,
              batchSize: EMBEDDING_BATCH_SIZE,
            }),
          });

          const data = (await response.json()) as EmbeddingSyncBatchResponse;
          if (!response.ok || !data.success) {
            throw new Error(data.error || 'Errore durante la sincronizzazione IA.');
          }

          batchNumber++;
          totalProcessed += data.processed;
          totalSkipped += data.skipped;
          totalFailed += data.failed;

          const doneCount = totalProcessed + totalSkipped + totalFailed;
          const remaining = Math.max(0, totalTarget - doneCount);
          const elapsedSec = Math.max(1, Math.round((Date.now() - runStartedMs) / 1000));

          setSyncProgress((prev) => ({
            ...prev,
            currentTarget: entry.target,
            batchNumber,
            processed: totalProcessed,
            skipped: totalSkipped,
            failed: totalFailed,
            remaining,
            elapsedSec,
            lastMessage: data.message,
          }));

          const noProgress = data.processed === 0 && data.skipped === 0 && data.failed === 0;
          const cursorStuck = data.lastId !== null && data.lastId === afterId;
          if (!data.hasMore || noProgress || cursorStuck) {
            break;
          }

          afterId = data.lastId;
        } catch (err: unknown) {
          abortedWithError = true;
          const msg =
            err instanceof Error
              ? err.message
              : 'Errore di connessione durante la sincronizzazione IA.';
          showToast(msg, 'error');
          setSyncProgress((prev) => ({
            ...prev,
            active: false,
            lastMessage: msg,
          }));
          break;
        }
      }
    }

    const elapsedSec = Math.max(1, Math.round((Date.now() - runStartedMs) / 1000));
    const stopped = syncCancelledRef.current;

    if (!abortedWithError) {
      setSyncProgress((prev) => ({
        ...prev,
        active: false,
        elapsedSec,
        remaining: stopped ? prev.remaining : 0,
        lastMessage: stopped
          ? `Sincronizzazione interrotta dall'utente (${totalProcessed} vettori salvati).`
          : `Completato in ${elapsedSec}s: ${totalProcessed} vettori aggiornati${
              totalFailed > 0 ? `, ${totalFailed} non elaborati` : ''
            }.`,
      }));

      if (stopped) {
        showToast(
          `Sincronizzazione fermata: ${totalProcessed} vettori già salvati in sicurezza.`,
          'info'
        );
      } else if (totalFailed > 0) {
        showToast(
          `Sincronizzazione terminata: ${totalProcessed} aggiornati, ${totalFailed} errori temporanei.`,
          'info'
        );
      } else {
        showToast(
          `Sincronizzazione IA completata! Elaborati ${totalProcessed} elementi in ${elapsedSec}s.`,
          'success'
        );
      }
    }

    await Promise.all([loadStats(), loadSyncCounts()]);
  };

  const cancelPdfParsing = () => {
    pollingCancelledRef.current = true;
    setParseStage('idle');
    setParseElapsedSec(0);
    setSelectedPdfFile(null);
  };

  const handlePdfFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Seleziona un file in formato PDF (.pdf).', 'error');
      return;
    }
    if (file.size === 0 || file.size > MAX_CLIENT_PDF_BYTES) {
      showToast('Il file PDF deve essere inferiore a 25 MB.', 'error');
      return;
    }

    pollingCancelledRef.current = false;
    setSelectedPdfFile(file);
    const nomeSenzaEstensione = file.name.replace(/\.[^/.]+$/, '');
    setDocMetadata((prev) => ({
      ...prev,
      titolo: prev.titolo.trim() ? prev.titolo : nomeSenzaEstensione,
    }));

    setParseStage('uploading');
    setParseElapsedSec(0);
    const startMs = Date.now();

    const formData = new FormData();
    formData.append('file', file);

    try {
      const startRes = await fetch('/api/parse-pdf/start', { method: 'POST', body: formData });
      const startData = (await startRes.json()) as {
        success?: boolean;
        jobId?: string;
        error?: string;
      };

      if (!startRes.ok || !startData.success || !startData.jobId) {
        throw new Error(startData.error || 'Impossibile avviare la lettura del PDF.');
      }

      if (pollingCancelledRef.current) return;
      setParseStage('processing');

      for (let cycle = 0; cycle < MAX_POLLING_CYCLES; cycle++) {
        if (pollingCancelledRef.current) return;

        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (pollingCancelledRef.current) return;

        setParseElapsedSec(Math.round((Date.now() - startMs) / 1000));

        const statusRes = await fetch(
          `/api/parse-pdf/status?jobId=${encodeURIComponent(startData.jobId)}`
        );
        const statusData = (await statusRes.json()) as {
          success?: boolean;
          status?: string;
          chunks?: ParsedChunk[];
          error?: string;
          message?: string;
        };

        if (!statusRes.ok || !statusData.success) {
          throw new Error(statusData.error || 'Analisi LlamaParse fallita.');
        }

        if (statusData.status === 'SUCCESS') {
          const chunks = statusData.chunks ?? [];
          setDocChunks(chunks);
          setParseStage('idle');
          if (chunks.length === 0) {
            showToast(statusData.message || 'Nessuna sezione utile estratta dal PDF.', 'info');
          } else {
            showToast(`Estratte ${chunks.length} sezioni dal manuale.`, 'success');
          }
          return;
        }
      }

      throw new Error('Elaborazione PDF troppo lunga. Riprova tra qualche istante.');
    } catch (err: unknown) {
      if (!pollingCancelledRef.current) {
        const msg = err instanceof Error ? err.message : 'Errore analisi PDF.';
        showToast(msg, 'error');
        setSelectedPdfFile(null);
        setParseStage('idle');
      }
    }
  };

  const handleSaveParsedManual = async () => {
    if (!selectedPdfFile) {
      showToast('Nessun file PDF originale selezionato.', 'error');
      return;
    }
    if (!docMetadata.titolo.trim()) {
      showToast('Inserisci il titolo del manuale prima di salvare.', 'error');
      return;
    }

    setIsUploading(true);
    const uploadData = new FormData();
    uploadData.append('file', selectedPdfFile);
    uploadData.append('titolo', docMetadata.titolo.trim());
    uploadData.append('versione', docMetadata.versione.trim() || '1.0');
    uploadData.append('prodotto', docMetadata.prodotto.trim());
    uploadData.append('chunks', JSON.stringify(docChunks));

    try {
      const res = await fetch('/api/upload-document', {
        method: 'POST',
        body: uploadData,
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Errore salvataggio manuale.');
      }

      setIsUploadModalOpen(false);
      setDocChunks([]);
      setDocMetadata({ titolo: '', versione: '', prodotto: '' });
      setSelectedPdfFile(null);
      showToast(data.message || 'Manuale salvato e appreso dall’IA.', 'success');
      await loadStats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore connessione durante il salvataggio.';
      showToast(msg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const isParsing = parseStage !== 'idle';
  const syncDoneCount = syncProgress.processed + syncProgress.skipped + syncProgress.failed;
  const syncProgressMax = Math.max(1, syncProgress.totalTarget, syncDoneCount);
  const syncProgressValue = Math.min(syncDoneCount, syncProgressMax);
  const syncPercent =
    syncProgress.totalTarget > 0
      ? Math.min(100, Math.round((syncDoneCount / syncProgressMax) * 100))
      : 0;
  const syncRatePerSec =
    syncProgress.elapsedSec > 0 && syncDoneCount > 0 ? syncDoneCount / syncProgress.elapsedSec : 0;
  const syncEtaSec =
    syncProgress.active && syncRatePerSec > 0.1 && syncProgress.remaining > 0
      ? Math.max(1, Math.round(syncProgress.remaining / syncRatePerSec))
      : null;

  const totalPendingInDrawer = syncCounts
    ? syncCounts.knowledgePending + syncCounts.manualChunksPending
    : stats.pendingEmbeddings;

  const totalFeedback = telemetry.feedback.positive + telemetry.feedback.negative;
  const positiveRatio =
    totalFeedback > 0 ? Math.round((telemetry.feedback.positive / totalFeedback) * 100) : null;

  return (
    <div className="relative min-h-[calc(100vh-4rem)] md:min-h-screen -m-4 md:-m-6 lg:-m-8 p-4 md:p-8 lg:p-12 bg-[radial-gradient(#d4d4d8_1.5px,transparent_1.5px)] dark:bg-[radial-gradient(#27272a_1.5px,transparent_1.5px)] [background-size:24px_24px] transition-colors duration-300">
      <div className="relative z-10 max-w-[1200px] mx-auto space-y-10">
        <div className="pt-2 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1.5">
              Bentornato, {user.nominativo}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">
              Panoramica Knowledge Base, archivio manuali e servizi IA Z-Assist.
            </p>
          </div>
          <span
            className={`inline-flex items-center self-start sm:self-auto px-3 py-1 rounded-full text-xs font-bold border ${roleMeta.badgeClass}`}
          >
            Ruolo: {roleMeta.label}
          </span>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-zinc-200/80 dark:border-zinc-800 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                Documenti KB
              </h2>
              <Database className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-white">
              <AnimatedCounter value={stats.knowledge} />
            </p>
          </div>

          <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-zinc-200/80 dark:border-zinc-800 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                Manuali PDF
              </h2>
              <FileText className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-white">
              <AnimatedCounter value={stats.manuals} />
            </p>
          </div>

          {canSyncEmbeddings ? (
            <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-zinc-200/80 dark:border-zinc-800 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  Da Indicizzare
                </h2>
                <RefreshCw
                  className={`w-5 h-5 ${
                    stats.pendingEmbeddings > 0
                      ? 'text-amber-500'
                      : 'text-emerald-500 dark:text-emerald-400'
                  }`}
                />
              </div>
              <p
                className={`text-3xl font-bold ${
                  stats.pendingEmbeddings > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-zinc-900 dark:text-white'
                }`}
              >
                <AnimatedCounter value={stats.pendingEmbeddings} />
              </p>
            </div>
          ) : (
            <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-zinc-200/80 dark:border-zinc-800 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  Ticket Censiti
                </h2>
                <Ticket className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
              </div>
              <p className="text-3xl font-bold text-zinc-900 dark:text-white">
                <AnimatedCounter value={stats.tickets} />
              </p>
            </div>
          )}

          <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-zinc-200/80 dark:border-zinc-800 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  Utenti Online
                </h2>
                {stats.usersOnline > 0 && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                )}
              </div>
              <Users className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-white">
              <AnimatedCounter value={stats.usersOnline} />
            </p>
          </div>
        </div>

        {/* AZIONI E FUNZIONALITÀ */}
        <div className="pt-2">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-5">
            Strumenti e Funzionalità IA
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <Link
              href="/dashboard/chat"
              className="group flex items-start p-5 md:p-6 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all"
            >
              <div className="shrink-0 p-3 bg-blue-50 dark:bg-blue-950/60 rounded-xl mr-5">
                <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
              </div>
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Assistente IA
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70">
                    Streaming + Eco/Avanzato
                  </span>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Interroga Knowledge Base e manuali con filtro prodotto, cronologia conversazioni e
                  risposte in tempo reale.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 group-hover:translate-x-1 transition-all mt-1" />
            </Link>

            <Link
              href="/dashboard/knowledge"
              className="group flex items-start p-5 md:p-6 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all"
            >
              <div className="shrink-0 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl mr-5">
                <BookOpen className="w-6 h-6 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
              </div>
              <div className="flex-1 pr-4">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-1.5">
                  Knowledge Base
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Consulta, cerca e filtra tutte le schede tecniche con indicizzazione automatica
                  al salvataggio.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 group-hover:translate-x-1 transition-all mt-1" />
            </Link>

            <Link
              href="/dashboard/manuals"
              className="group flex items-start p-5 md:p-6 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all"
            >
              <div className="shrink-0 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl mr-5">
                <FileText className="w-6 h-6 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
              </div>
              <div className="flex-1 pr-4">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-1.5">
                  Archivio Manuali PDF
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Visualizza, scarica e gestisci metadati o singole sezioni estratte dai manuali PDF.
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 group-hover:translate-x-1 transition-all mt-1" />
            </Link>

            {canManageManuals && (
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                className="text-left group flex items-start p-5 md:p-6 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all"
              >
                <div className="shrink-0 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl mr-5">
                  <FileUp className="w-6 h-6 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
                </div>
                <div className="flex-1 pr-4">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-1.5">
                    Carica &amp; Analizza PDF
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Parsing asincrono con LlamaParse (senza timeout su manuali lunghi) e chunking
                    semantico.
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 group-hover:translate-x-1 transition-all mt-1" />
              </button>
            )}

            {canSyncEmbeddings && (
              <button
                type="button"
                onClick={handleOpenSyncModal}
                className="text-left group flex items-start p-5 md:p-6 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all"
              >
                <div className="shrink-0 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl mr-5">
                  <RefreshCw
                    className={`w-6 h-6 text-zinc-700 dark:text-zinc-300 ${
                      isSyncing ? 'animate-spin text-blue-600 dark:text-blue-400' : ''
                    }`}
                    strokeWidth={1.75}
                  />
                </div>
                <div className="flex-1 pr-4 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                      Sincronizza Vettori IA
                    </h3>
                    {isSyncing ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300">
                        In corso • {syncPercent}%
                      </span>
                    ) : (
                      stats.pendingEmbeddings > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                          {stats.pendingEmbeddings.toLocaleString('it-IT')} in attesa
                        </span>
                      )
                    )}
                  </div>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Sincronizza automaticamente tutte le righe importate in tabella o rigenera
                    l’indice RAG con barra di avanzamento.
                  </p>
                  {isSyncing && (
                    <div className="mt-2.5 space-y-1">
                      <progress
                        className="z-progress w-full h-1.5 block"
                        value={syncProgressValue}
                        max={syncProgressMax}
                      />
                      <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        {syncDoneCount.toLocaleString('it-IT')} /{' '}
                        {syncProgress.totalTarget.toLocaleString('it-IT')} elaborati
                      </p>
                    </div>
                  )}
                </div>
                <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 group-hover:translate-x-1 transition-all mt-1 shrink-0" />
              </button>
            )}

            {canReadTelemetry && (
              <button
                type="button"
                onClick={handleOpenTelemetry}
                className="text-left group flex items-start p-5 md:p-6 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all"
              >
                <div className="shrink-0 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl mr-5">
                  <Activity className="w-6 h-6 text-zinc-700 dark:text-zinc-300" strokeWidth={1.75} />
                </div>
                <div className="flex-1 pr-4">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-1.5">
                    Usage &amp; Telemetria IA
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Monitora consumi per modello e utente, costi stimati reali e feedback delle
                    risposte.
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 group-hover:translate-x-1 transition-all mt-1" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* DRAWER UPLOAD & PARSE PDF ASINCRONO */}
      <ModalDialog
        open={isUploadModalOpen}
        onClose={() => {
          if (isParsing) cancelPdfParsing();
          setIsUploadModalOpen(false);
        }}
        title="Carica & Analizza Manuale PDF"
        subtitle="Parsing asincrono LlamaParse e indicizzazione vettoriale"
        variant="drawer"
        size="xl"
        dismissible={!isParsing && !isUploading}
        icon={<FileUp className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />}
        footer={
          docChunks.length > 0 ? (
            <button
              type="button"
              disabled={isUploading || !docMetadata.titolo.trim()}
              onClick={handleSaveParsedManual}
              className="px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold rounded-xl inline-flex items-center gap-2 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salva nel Database IA
            </button>
          ) : undefined
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="pdf-titolo"
                className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5"
              >
                Titolo *
              </label>
              <input
                id="pdf-titolo"
                type="text"
                value={docMetadata.titolo}
                onChange={(e) => setDocMetadata({ ...docMetadata, titolo: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 outline-none"
                placeholder="Es. Manuale Paghe"
              />
            </div>
            <div>
              <label
                htmlFor="pdf-prodotto"
                className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5"
              >
                Prodotto
              </label>
              <input
                id="pdf-prodotto"
                type="text"
                value={docMetadata.prodotto}
                onChange={(e) => setDocMetadata({ ...docMetadata, prodotto: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 outline-none"
                placeholder="Es. Zucchetti HR"
              />
            </div>
            <div>
              <label
                htmlFor="pdf-versione"
                className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5"
              >
                Versione
              </label>
              <input
                id="pdf-versione"
                type="text"
                value={docMetadata.versione}
                onChange={(e) => setDocMetadata({ ...docMetadata, versione: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm dark:text-white focus:ring-2 focus:ring-zinc-900/15 dark:focus:ring-white/15 outline-none"
                placeholder="1.0"
              />
            </div>
          </div>

          {docChunks.length === 0 ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragActive(false);
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile && !isParsing) {
                  void handlePdfFile(droppedFile);
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-10 text-center flex flex-col items-center transition-all ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-zinc-400 dark:hover:border-zinc-600'
              }`}
            >
              {isParsing ? (
                <div className="flex flex-col items-center w-full max-w-sm space-y-4">
                  <RefreshCw className="w-7 h-7 text-blue-500 animate-spin" />
                  <div className="w-full space-y-2">
                    <label
                      htmlFor="pdf-parse-progress"
                      role="status"
                      aria-live="polite"
                      className="block text-sm font-semibold text-zinc-900 dark:text-white"
                    >
                      {parseStage === 'uploading'
                        ? 'Invio del PDF a LlamaParse...'
                        : `Estrazione e segmentazione in corso (${parseElapsedSec}s)...`}
                    </label>
                    <progress
                      id="pdf-parse-progress"
                      className="z-progress w-full h-2.5"
                      value={parseStage === 'uploading' ? 20 : undefined}
                      max={100}
                    />
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Elaborazione asincrona sicura: i manuali molto lunghi non vanno in timeout.
                  </p>
                  <button
                    type="button"
                    onClick={cancelPdfParsing}
                    className="px-4 py-1.5 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Annulla analisi
                  </button>
                </div>
              ) : (
                <>
                  <FileUp className="w-9 h-9 text-zinc-400 mb-3" />
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">
                    Trascina un manuale PDF qui
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                    Dimensione massima supportata: 25 MB
                  </p>
                  <label className="cursor-pointer bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold py-2.5 px-6 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                    Seleziona file PDF
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handlePdfFile(file);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-200/70 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Sezioni Estratte ({docChunks.length})
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setDocChunks([]);
                    setSelectedPdfFile(null);
                  }}
                  className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline"
                >
                  Scarta tutto
                </button>
              </div>
              {docChunks.map((chunk, index) => (
                <div
                  key={index}
                  className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl relative"
                >
                  <button
                    type="button"
                    aria-label="Rimuovi sezione"
                    onClick={() => setDocChunks((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pr-10">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                        Sezione / Capitolo
                      </label>
                      <input
                        type="text"
                        value={chunk.capitolo}
                        onChange={(e) => {
                          const updated = [...docChunks];
                          updated[index] = { ...updated[index], capitolo: e.target.value };
                          setDocChunks(updated);
                        }}
                        className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl dark:text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                        Pagina
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={chunk.pagina}
                        onChange={(e) => {
                          const updated = [...docChunks];
                          updated[index] = {
                            ...updated[index],
                            pagina: Number(e.target.value) || 1,
                          };
                          setDocChunks(updated);
                        }}
                        className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl dark:text-white outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                      Testo Markdown
                    </label>
                    <textarea
                      value={chunk.testo}
                      onChange={(e) => {
                        const updated = [...docChunks];
                        updated[index] = { ...updated[index], testo: e.target.value };
                        setDocChunks(updated);
                      }}
                      className="w-full px-3 py-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl min-h-[120px] dark:text-white outline-none leading-relaxed"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ModalDialog>

      {/* DRAWER TELEMETRIA ADMIN ESTESA */}
      <ModalDialog
        open={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        title="Telemetria & Consumi IA"
        subtitle="Dettaglio per modello, operatore e gradimento risposte"
        variant="drawer"
        size="lg"
        icon={<Activity className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />}
      >
        <div className="space-y-5">
          <div className="bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl flex items-center gap-1 border border-zinc-200/70 dark:border-zinc-800">
            {(
              [
                { id: 'today', label: 'Oggi' },
                { id: '7d', label: '7 Giorni' },
                { id: '30d', label: '30 GG' },
                { id: 'all', label: 'Tutto' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleRangeChange(tab.id)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  timeFilter === tab.id
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Cpu className="w-4 h-4 text-zinc-400 mr-2" />
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Token Utilizzati
                </span>
              </div>
              {isLoadingTelemetry && <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
            </div>
            <span className="text-3xl font-bold text-zinc-900 dark:text-white">
              <AnimatedCounter value={telemetry.totalTokens} />
            </span>
            <div className="flex justify-between items-center mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
              <span>
                Input:{' '}
                <strong className="text-zinc-900 dark:text-white">
                  {telemetry.promptTokens.toLocaleString('it-IT')}
                </strong>
              </span>
              <span>
                Output:{' '}
                <strong className="text-zinc-900 dark:text-white">
                  {telemetry.responseTokens.toLocaleString('it-IT')}
                </strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase block mb-1">
                Richieste
              </span>
              <span className="text-2xl font-bold text-zinc-900 dark:text-white">
                <AnimatedCounter value={telemetry.requests} />
              </span>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase block mb-1">
                Success Rate
              </span>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                <AnimatedCounter value={telemetry.successRate} />%
              </span>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase block mb-1">
                Costo Reale
              </span>
              <span className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
                ${telemetry.estimatedCostUsd.toFixed(4)}
              </span>
            </div>
          </div>

          {/* FEEDBACK RISPOSTE */}
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase block mb-1">
                Valutazione Risposte
              </span>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {positiveRatio !== null
                  ? `${positiveRatio}% di feedback positivi su ${totalFeedback} valutazioni`
                  : 'Nessun feedback ancora espresso'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold shrink-0">
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <ThumbsUp className="w-3.5 h-3.5" />
                {telemetry.feedback.positive}
              </span>
              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                <ThumbsDown className="w-3.5 h-3.5" />
                {telemetry.feedback.negative}
              </span>
            </div>
          </div>

          {/* DETTAGLIO PER MODELLO */}
          {telemetry.byModel.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2.5">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Consumo per Modello
              </h3>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {telemetry.byModel.map((row) => (
                  <div key={row.model} className="py-2 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="font-mono font-bold text-zinc-900 dark:text-white truncate">
                        {row.model}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {row.requests} req • {row.totalTokens.toLocaleString('it-IT')} tok
                      </p>
                    </div>
                    <span className="font-mono font-bold text-zinc-700 dark:text-zinc-200 shrink-0">
                      ${row.estimatedCostUsd.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DETTAGLIO PER UTENTE */}
          {telemetry.byUser.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2.5">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Consumo per Operatore
              </h3>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {telemetry.byUser.map((row) => (
                  <div key={row.userId} className="py-2 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold text-zinc-900 dark:text-white truncate">
                        {row.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {row.requests} req • {row.totalTokens.toLocaleString('it-IT')} tok
                      </p>
                    </div>
                    <span className="font-mono font-bold text-zinc-700 dark:text-zinc-200 shrink-0">
                      ${row.estimatedCostUsd.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ModalDialog>

      {/* DRAWER SINCRONIZZAZIONE & OTTIMIZZAZIONE VETTORI IA */}
      <ModalDialog
        open={isSyncModalOpen}
        onClose={() => {
          if (!isSyncing) setIsSyncModalOpen(false);
        }}
        title="Indicizzazione & Vettori IA"
        subtitle="Sincronizzazione continua multi-batch e chiave RAG estesa"
        variant="drawer"
        size="lg"
        dismissible={!isSyncing}
        icon={<Layers className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />}
      >
        <div className="space-y-6">
          {/* Stato archivi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Knowledge Base
                </span>
                {isLoadingSyncCounts ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                ) : syncCounts && syncCounts.knowledgePending === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                    {(syncCounts?.knowledgePending ?? stats.pendingKbEmbeddings ?? 0).toLocaleString(
                      'it-IT'
                    )}{' '}
                    da indicizzare
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {syncCounts
                  ? `${Math.max(
                      0,
                      syncCounts.knowledgeTotal - syncCounts.knowledgePending
                    ).toLocaleString('it-IT')} / ${syncCounts.knowledgeTotal.toLocaleString('it-IT')}`
                  : '—'}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Schede con vettore attivo su Gemini Embedding
              </p>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Manuali PDF
                </span>
                {isLoadingSyncCounts ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                ) : syncCounts && syncCounts.manualChunksPending === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                    {(
                      syncCounts?.manualChunksPending ??
                      stats.pendingManualChunks ??
                      0
                    ).toLocaleString('it-IT')}{' '}
                    da indicizzare
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {syncCounts
                  ? `${Math.max(
                      0,
                      syncCounts.manualChunksTotal - syncCounts.manualChunksPending
                    ).toLocaleString('it-IT')} / ${syncCounts.manualChunksTotal.toLocaleString(
                      'it-IT'
                    )}`
                  : '—'}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Sezioni estratte dai manuali PDF indicizzate
              </p>
            </div>
          </div>

          {/* Barra di avanzamento reale */}
          {(isSyncing || syncProgress.hasRun) && (
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="embedding-sync-progress"
                  role="status"
                  aria-live="polite"
                  className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2"
                >
                  {isSyncing && <RefreshCw className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
                  <span>
                    {syncProgress.currentTarget === 'manuals'
                      ? 'Manuali PDF'
                      : 'Knowledge Base'}{' '}
                    {syncProgress.batchNumber > 0 ? `• Blocco #${syncProgress.batchNumber}` : ''}
                  </span>
                </label>
                <span className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400 shrink-0">
                  {syncPercent}%
                </span>
              </div>

              <progress
                id="embedding-sync-progress"
                className="z-progress w-full h-2.5 block"
                value={syncProgressValue}
                max={syncProgressMax}
              />

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <span>
                  Elaborate{' '}
                  <strong>{syncDoneCount.toLocaleString('it-IT')}</strong> /{' '}
                  <strong>{syncProgress.totalTarget.toLocaleString('it-IT')}</strong> • Rimanenti:{' '}
                  <strong>{syncProgress.remaining.toLocaleString('it-IT')}</strong>
                </span>
                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                  {syncRatePerSec > 0 ? `${syncRatePerSec.toFixed(1)} el/s` : '—'}
                  {syncEtaSec !== null ? ` • ETA ~${syncEtaSec}s` : ''}
                  {!isSyncing && syncProgress.elapsedSec > 0
                    ? ` • Durata ${syncProgress.elapsedSec}s`
                    : ''}
                </span>
              </div>

              {syncProgress.lastMessage && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{syncProgress.lastMessage}</p>
              )}

              {(syncProgress.skipped > 0 || syncProgress.failed > 0) && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {syncProgress.skipped > 0
                      ? `${syncProgress.skipped} righe vuote saltate`
                      : ''}
                    {syncProgress.skipped > 0 && syncProgress.failed > 0 ? ' • ' : ''}
                    {syncProgress.failed > 0
                      ? `${syncProgress.failed} errori temporanei (riprova con mancanti)`
                      : ''}
                  </span>
                </div>
              )}

              {isSyncing && (
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={stopEmbeddingSync}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/50 dark:hover:bg-red-950/80 dark:text-red-300 border border-red-200 dark:border-red-900 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Interrompi sincronizzazione
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Azioni di sincronizzazione */}
          {!isSyncing && (
            <div className="space-y-4">
              <div className="bg-zinc-50 dark:bg-zinc-900/70 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Sincronizzazione incrementale (consigliata dopo import in tabella)
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    Elabora in un solo clic tutte le righe senza vettore (Knowledge Base e sezioni
                    PDF) in blocchi batch automatici da 50 elementi, senza dover ricliccare ogni 35
                    righe.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={isLoadingSyncCounts || totalPendingInDrawer === 0}
                    onClick={() => void runEmbeddingSync('pending')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-45"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {totalPendingInDrawer > 0
                      ? `Sincronizza tutti i mancanti (${totalPendingInDrawer.toLocaleString('it-IT')})`
                      : 'Nessun record mancante'}
                  </button>
                  <button
                    type="button"
                    disabled={isLoadingSyncCounts}
                    onClick={() => void loadSyncCounts()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isLoadingSyncCounts ? 'animate-spin' : ''}`}
                    />
                    Aggiorna conteggio
                  </button>
                </div>
              </div>

              {/* Rigenerazione completa con chiave estesa */}
              <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Rigenerazione completa (Chiave RAG ottimizzata)
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    Ricalcola gli embedding esistenti con la nuova chiave estesa (Titolo, Codice
                    scheda, Riferimento, Classificazione, Prodotti deduplicati, Data, testo
                    normalizzato + profilo asimmetrico Gemini{' '}
                    <code className="font-mono text-[11px]">RETRIEVAL_DOCUMENT</code>).
                  </p>
                </div>

                <div className="flex flex-wrap gap-4 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncTargetKnowledge}
                      onChange={(e) => {
                        setSyncTargetKnowledge(e.target.checked);
                        setConfirmFullReindex(false);
                      }}
                      className="rounded border-zinc-300 dark:border-zinc-700"
                    />
                    Knowledge Base ({syncCounts?.knowledgeTotal.toLocaleString('it-IT') ?? '—'})
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncTargetManuals}
                      onChange={(e) => {
                        setSyncTargetManuals(e.target.checked);
                        setConfirmFullReindex(false);
                      }}
                      className="rounded border-zinc-300 dark:border-zinc-700"
                    />
                    Manuali PDF ({syncCounts?.manualChunksTotal.toLocaleString('it-IT') ?? '—'})
                  </label>
                </div>

                {!confirmFullReindex ? (
                  <button
                    type="button"
                    disabled={
                      isLoadingSyncCounts || (!syncTargetKnowledge && !syncTargetManuals)
                    }
                    onClick={() => setConfirmFullReindex(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-45"
                  >
                    Rigenera tutti i vettori selezionati
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void runEmbeddingSync('all')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Conferma rigenerazione completa
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmFullReindex(false)}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    >
                      Annulla
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ModalDialog>
    </div>
  );
}
