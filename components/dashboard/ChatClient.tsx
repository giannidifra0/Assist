'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import {
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  Globe,
  History,
  MessageSquare,
  MessageSquarePlus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastProvider';
import type {
  ChatMessage,
  ChatModelMode,
  ChatScope,
  ChatSession,
  ChatSource,
} from '@/lib/types/domain';

const STORAGE_KEY = 'crm_chat_history_v2';
const MAX_PROMPT_LENGTH = 2000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let localMsgCounter = 0;
function createMessageId(prefix: string): string {
  localMsgCounter += 1;
  return `${prefix}_${localMsgCounter}`;
}

function persistLocalChat(items: ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-40)));
  } catch {
    // Ignora quota piena
  }
}

const INITIAL_GREETING: ChatMessage = {
  id: 'welcome',
  role: 'ai',
  content:
    "Ciao! Sono **Z-Assist**, l'assistente IA per Knowledge Base e Manuali PDF.\n\nDescrivimi l'anomalia o la procedura che ti serve: cercherò la soluzione direttamente nei dati censiti e nei manuali ufficiali.",
};

const QUICK_SUGGESTIONS = [
  'Come risolvo un errore di importazione anagrafiche?',
  'Procedura di configurazione permessi utente',
  'Quali passaggi seguire per l’allineamento contabile?',
];

const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-bold text-zinc-950 dark:text-white">{children}</strong>
  ),
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2.5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2.5 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="text-sm font-bold mb-2 mt-3 text-zinc-950 dark:text-white uppercase tracking-wide">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xs font-bold mb-1.5 mt-2.5 text-zinc-950 dark:text-white uppercase tracking-wide">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xs font-bold mb-1 mt-2 text-zinc-950 dark:text-white">{children}</h3>
  ),
  a: ({ href, children }) => {
    if (href?.includes('/api/download')) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title="Scarica PDF"
          className="inline-flex items-center gap-1 mx-0.5 my-0.5 px-2.5 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] font-bold rounded-lg hover:bg-rose-500/20 transition-colors align-middle"
        >
          <FileText className="w-3 h-3" />
          Scarica PDF
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
      >
        {children}
      </a>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-zinc-900 text-zinc-100 p-3.5 rounded-xl my-2.5 overflow-x-auto text-xs font-mono">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes('language-'));
    if (!isBlock) {
      return (
        <code className="bg-zinc-300/60 dark:bg-zinc-700/70 px-1.5 py-0.5 rounded text-xs font-mono text-zinc-900 dark:text-zinc-100">
          {children}
        </code>
      );
    }
    return <code className={`font-mono text-xs ${className || ''}`}>{children}</code>;
  },
};

interface SseEventPayload {
  type?: 'delta' | 'done' | 'error';
  text?: string;
  reply?: string;
  sources?: ChatSource[];
  meta?: ChatMessage['meta'];
  sessionId?: string;
  userMessageId?: string;
  aiMessageId?: string;
}

export function ChatClient({ userName }: { userName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchScope, setSearchScope] = useState<ChatScope>('both');
  const [modelMode, setModelMode] = useState<ChatModelMode>('eco');
  const [products, setProducts] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');

  const [persistenceEnabled, setPersistenceEnabled] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [deletingSession, setDeletingSession] = useState<ChatSession | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { showToast } = useToast();

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/sessions');
      const data = (await res.json()) as {
        success?: boolean;
        persistenceEnabled?: boolean;
        sessions?: ChatSession[];
      };
      if (res.ok && data.success) {
        setPersistenceEnabled(Boolean(data.persistenceEnabled));
        setSessions(data.sessions ?? []);
      }
    } catch {
      // Mantiene stato corrente
    }
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const [sessionsRes, productsRes] = await Promise.all([
        fetch('/api/chat/sessions').catch(() => null),
        fetch('/api/products').catch(() => null),
      ]);

      if (!active) return;

      if (productsRes && productsRes.ok) {
        const pData = (await productsRes.json()) as { success?: boolean; products?: string[] };
        if (active && pData.success && Array.isArray(pData.products)) {
          setProducts(pData.products);
        }
      }

      let dbPersistence = false;
      if (sessionsRes && sessionsRes.ok) {
        const sData = (await sessionsRes.json()) as {
          success?: boolean;
          persistenceEnabled?: boolean;
          sessions?: ChatSession[];
        };
        if (active && sData.success) {
          dbPersistence = Boolean(sData.persistenceEnabled);
          setPersistenceEnabled(dbPersistence);
          const list = sData.sessions ?? [];
          setSessions(list);

          // Carica automaticamente la conversazione più recente se presente
          if (dbPersistence && list.length > 0) {
            const firstId = list[0].id;
            const msgRes = await fetch(`/api/chat/sessions/${encodeURIComponent(firstId)}/messages`).catch(
              () => null
            );
            if (active && msgRes && msgRes.ok) {
              const mData = (await msgRes.json()) as {
                success?: boolean;
                messages?: ChatMessage[];
              };
              if (active && mData.success && Array.isArray(mData.messages) && mData.messages.length > 0) {
                setActiveSessionId(firstId);
                setMessages(mData.messages);
              }
            }
          }
        }
      }

      // Fallback locale se DB chat_sessions non è ancora migrato
      if (!dbPersistence) {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as ChatMessage[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              setMessages(parsed);
            }
          }
        } catch {
          // Ignora stato corrotto
        }
      }
    })();

    const focusTimer = setTimeout(() => textareaRef.current?.focus(), 200);
    return () => {
      active = false;
      clearTimeout(focusTimer);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const startNewChat = () => {
    setActiveSessionId(null);
    const fresh: ChatMessage[] = [INITIAL_GREETING];
    setMessages(fresh);
    if (!persistenceEnabled) {
      persistLocalChat(fresh);
    }
    setIsHistoryOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const loadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`);
      const data = (await res.json()) as {
        success?: boolean;
        messages?: ChatMessage[];
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Impossibile aprire la conversazione.');
      }
      setActiveSessionId(sessionId);
      setMessages(data.messages && data.messages.length > 0 ? data.messages : [INITIAL_GREETING]);
      setIsHistoryOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Errore apertura conversazione.', 'error');
    }
  };

  const handleConfirmDeleteSession = async () => {
    if (!deletingSession) return;
    setIsDeletingSession(true);
    try {
      const res = await fetch(
        `/api/chat/sessions?id=${encodeURIComponent(deletingSession.id)}`,
        { method: 'DELETE' }
      );
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Impossibile eliminare la conversazione.');
      }
      if (activeSessionId === deletingSession.id) {
        startNewChat();
      }
      setDeletingSession(null);
      await refreshSessions();
      showToast('Conversazione eliminata.', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Errore eliminazione.', 'error');
    } finally {
      setIsDeletingSession(false);
    }
  };

  const sendMessage = async (textOverride?: string) => {
    const trimmed = (textOverride ?? input).trim();
    if (!trimmed || isLoading) return;

    if (trimmed.length > MAX_PROMPT_LENGTH) {
      showToast(`La domanda non può superare ${MAX_PROMPT_LENGTH} caratteri.`, 'error');
      return;
    }

    const tempUserId = createMessageId('user');
    const tempAiId = createMessageId('ai');

    const userMessage: ChatMessage = {
      id: tempUserId,
      role: 'user',
      content: trimmed,
    };

    const historyForRequest = [...messages, userMessage];
    const streamingPlaceholder: ChatMessage = {
      id: tempAiId,
      role: 'ai',
      content: '',
    };

    setMessages([...historyForRequest, streamingPlaceholder]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyForRequest.map((m) => ({ role: m.role, content: m.content })),
          scope: searchScope,
          modelMode,
          product: selectedProduct || undefined,
          sessionId: activeSessionId || undefined,
          stream: true,
        }),
      });

      const contentType = response.headers.get('content-type') ?? '';

      if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
        const fallbackData = (await response.json().catch(() => ({}))) as {
          reply?: string;
          sources?: ChatSource[];
          meta?: ChatMessage['meta'];
          sessionId?: string;
          userMessageId?: string;
          aiMessageId?: string;
        };

        if (!response.ok) {
          throw new Error(fallbackData.reply || 'Errore di comunicazione col server.');
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempUserId && fallbackData.userMessageId
              ? { ...m, id: fallbackData.userMessageId }
              : m.id === tempAiId
                ? {
                    ...m,
                    id: fallbackData.aiMessageId || tempAiId,
                    content: fallbackData.reply || 'Risposta non disponibile.',
                    sources: fallbackData.sources,
                    meta: fallbackData.meta,
                  }
                : m
          )
        );
        if (fallbackData.sessionId) {
          setActiveSessionId(fallbackData.sessionId);
          void refreshSessions();
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let finalPayload: SseEventPayload | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const evt of events) {
          const lines = evt.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const rawJson = line.slice(6).trim();
            if (!rawJson) continue;

            try {
              const payload = JSON.parse(rawJson) as SseEventPayload;
              if (payload.type === 'delta' && payload.text) {
                accumulatedText += payload.text;
                const snapshot = accumulatedText;
                setMessages((prev) =>
                  prev.map((m) => (m.id === tempAiId ? { ...m, content: snapshot } : m))
                );
              } else if (payload.type === 'done') {
                finalPayload = payload;
              } else if (payload.type === 'error') {
                throw new Error(payload.reply || 'Errore generazione risposta.');
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
                if (parseErr.message.startsWith('⚠️')) throw parseErr;
              }
            }
          }
        }
      }

      if (finalPayload) {
        const doneData = finalPayload;
        setMessages((prev) => {
          const updated = prev.map((m) => {
            if (m.id === tempUserId && doneData.userMessageId) {
              return { ...m, id: doneData.userMessageId };
            }
            if (m.id === tempAiId) {
              return {
                ...m,
                id: doneData.aiMessageId || tempAiId,
                content: doneData.reply || accumulatedText || 'Risposta non disponibile.',
                sources: doneData.sources,
                meta: doneData.meta,
              };
            }
            return m;
          });
          if (!persistenceEnabled) {
            persistLocalChat(updated);
          }
          return updated;
        });

        if (doneData.sessionId) {
          setActiveSessionId(doneData.sessionId);
          void refreshSessions();
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Errore imprevisto.';
      const errContent = msg.startsWith('⚠️') ? msg : `⚠️ Si è verificato un problema: ${msg}`;
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === tempAiId ? { ...m, id: createMessageId('err'), content: errContent } : m
        );
        if (!persistenceEnabled) {
          persistLocalChat(updated);
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleFeedback = async (messageId: string, nextValue: 1 | -1) => {
    const current = messages.find((m) => m.id === messageId)?.feedback ?? null;
    const finalValue = current === nextValue ? null : nextValue;

    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, feedback: finalValue } : m))
    );

    try {
      const res = await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, feedback: finalValue }),
      });
      if (!res.ok) throw new Error();
      if (finalValue !== null) {
        showToast('Grazie per il feedback!', 'success');
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: current } : m))
      );
      showToast('Impossibile registrare il feedback.', 'error');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage();
  };

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      showToast('Impossibile copiare negli appunti.', 'error');
    }
  };

  const handleConfirmClear = async () => {
    if (persistenceEnabled && activeSessionId) {
      await fetch(`/api/chat/sessions?id=${encodeURIComponent(activeSessionId)}`, {
        method: 'DELETE',
      }).catch(() => undefined);
      await refreshSessions();
      setActiveSessionId(null);
    }

    const resetMsg: ChatMessage[] = [
      {
        id: createMessageId('reset'),
        role: 'ai',
        content: `Conversazione azzerata, ${userName}. Come posso aiutarti ora?`,
      },
    ];
    setMessages(resetMsg);
    if (!persistenceEnabled) {
      persistLocalChat(resetMsg);
    }
    setIsClearConfirmOpen(false);
    textareaRef.current?.focus();
  };

  const hasUserMessages = messages.some((m) => m.role === 'user');

  return (
    <div className="flex flex-1 min-h-0 w-full gap-4 relative">
      {/* PANNELLO CONVERSAZIONI */}
      {persistenceEnabled && isHistoryOpen && (
        <aside className="w-64 shrink-0 bg-white/95 dark:bg-zinc-900/95 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-3 flex flex-col min-h-0 shadow-sm">
          <div className="flex items-center justify-between gap-2 pb-2.5 mb-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              Conversazioni
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={startNewChat}
                title="Nuova chat"
                aria-label="Avvia nuova conversazione"
                className="p-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 transition-opacity"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                aria-label="Chiudi elenco conversazioni"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
            {sessions.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">
                Nessuna conversazione salvata.
              </p>
            ) : (
              sessions.map((s) => {
                const isActive = s.id === activeSessionId;
                return (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void loadSession(s.id)}
                      className="flex-1 text-left truncate flex items-center gap-2 min-w-0"
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{s.titolo}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingSession(s)}
                      aria-label={`Elimina ${s.titolo}`}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* AREA CHAT PRINCIPALE */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0 max-w-5xl mx-auto w-full">
        {/* HEADER CHAT */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 mb-2 border-b border-zinc-200/70 dark:border-zinc-800/80 shrink-0 px-1 sm:px-2">
          <div className="flex items-center gap-3">
            {persistenceEnabled && (
              <button
                type="button"
                onClick={() => setIsHistoryOpen((prev) => !prev)}
                aria-label="Mostra cronologia conversazioni"
                aria-pressed={isHistoryOpen}
                title="Cronologia conversazioni"
                className={`p-2 rounded-xl border transition-colors ${
                  isHistoryOpen
                    ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <History className="w-4 h-4" />
              </button>
            )}
            <div className="w-9 h-9 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">
                  Z-Assist IA
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  ● Streaming
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                Ricerca semantica su Knowledge Base e Manuali PDF
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {persistenceEnabled && (
              <button
                type="button"
                onClick={startNewChat}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Inizia una nuova conversazione"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nuova</span>
              </button>
            )}

            <div
              className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800"
              role="group"
              aria-label="Modalità modello IA"
            >
              <button
                type="button"
                onClick={() => setModelMode('eco')}
                title="Gemini 3.5 Flash-Lite: velocissimo e a basso consumo token"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  modelMode === 'eco'
                    ? 'bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-300 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Zap className="w-3 h-3" />
                Eco
              </button>
              <button
                type="button"
                onClick={() => setModelMode('advanced')}
                title="Gemini 3.8 Flash: analisi approfondita per anomalie complesse"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  modelMode === 'advanced'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Avanzato
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsClearConfirmOpen(true)}
              aria-label="Cancella conversazione"
              className="p-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              title="Cancella conversazione"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* LISTA MESSAGGI */}
        <div className="flex-1 overflow-y-auto px-1 sm:px-2 py-4 space-y-4 custom-scrollbar">
          {messages.map((msg) => {
            const isPersistedAi =
              msg.role === 'ai' && persistenceEnabled && UUID_REGEX.test(msg.id);

            return (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[82%] md:max-w-[76%] px-4 py-3.5 text-sm leading-relaxed break-words ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl rounded-bl-sm shadow-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : msg.content ? (
                    <>
                      <ReactMarkdown components={MARKDOWN_COMPONENTS}>{msg.content}</ReactMarkdown>

                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                            Fonti utilizzate
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.map((src, idx) => (
                              <div
                                key={`${src.title}_${idx}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-[11px]"
                              >
                                {src.type === 'kb' ? (
                                  <Database className="w-3 h-3 text-blue-500 shrink-0" />
                                ) : (
                                  <FileText className="w-3 h-3 text-rose-500 shrink-0" />
                                )}
                                <span className="font-semibold text-zinc-800 dark:text-zinc-200 max-w-[200px] truncate">
                                  {src.title}
                                </span>
                                {src.pdfFile && (
                                  <>
                                    <a
                                      href={`/api/download?file=${encodeURIComponent(src.pdfFile)}&inline=1`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Apri anteprima PDF"
                                      className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <a
                                      href={`/api/download?file=${encodeURIComponent(src.pdfFile)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Scarica PDF"
                                      className="text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center"
                                    >
                                      <Download className="w-3 h-3" />
                                    </a>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-2.5 pt-2 border-t border-zinc-100/70 dark:border-zinc-800/60 flex items-center justify-between gap-3 text-[10px] text-zinc-400">
                        <div className="flex items-center gap-2 flex-wrap">
                          {msg.meta?.model && (
                            <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
                              {msg.meta.model}
                            </span>
                          )}
                          {msg.meta?.fallbackUsed && (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              Fallback automatico
                            </span>
                          )}
                          {typeof msg.meta?.totalTokens === 'number' && msg.meta.totalTokens > 0 && (
                            <span>{msg.meta.totalTokens.toLocaleString('it-IT')} tok</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isPersistedAi && (
                            <div className="flex items-center gap-1" role="group" aria-label="Valuta risposta">
                              <button
                                type="button"
                                onClick={() => void handleFeedback(msg.id, 1)}
                                aria-label="Risposta utile"
                                aria-pressed={msg.feedback === 1}
                                className={`p-1 rounded-md transition-colors ${
                                  msg.feedback === 1
                                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60'
                                    : 'hover:text-emerald-600 dark:hover:text-emerald-400'
                                }`}
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleFeedback(msg.id, -1)}
                                aria-label="Risposta non utile"
                                aria-pressed={msg.feedback === -1}
                                className={`p-1 rounded-md transition-colors ${
                                  msg.feedback === -1
                                    ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60'
                                    : 'hover:text-red-600 dark:hover:text-red-400'
                                }`}
                              >
                                <ThumbsDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => void handleCopy(msg.id, msg.content)}
                            className="inline-flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors font-semibold"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                Copiata
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copia
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center space-x-1.5 py-1">
                      <span
                        className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!hasUserMessages && !isLoading && (
            <div className="pt-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-2.5 px-1">
                Suggerimenti rapidi
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    className="text-left px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-400 dark:hover:border-blue-600 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-all shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-2" />
        </div>

        {/* BARRA INPUT E FILTRI */}
        <div className="pt-2 pb-2 px-1 sm:px-2 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mr-1 shrink-0">
                Fonte:
              </span>
              {(
                [
                  { id: 'both', label: 'Tutto', icon: Globe },
                  { id: 'kb', label: 'Solo KB', icon: Database },
                  { id: 'manuals', label: 'Solo Manuali', icon: FileText },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = searchScope === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSearchScope(item.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full transition-all shrink-0 ${
                      active
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {products.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <label
                  htmlFor="chat-product-filter"
                  className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest"
                >
                  Prodotto:
                </label>
                <select
                  id="chat-product-filter"
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 outline-none max-w-[190px]"
                >
                  <option value="">Tutti i prodotti</option>
                  {products.map((prod) => (
                    <option key={prod} value={prod}>
                      {prod}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="relative flex items-end gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500/50 transition-all"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Scrivi una domanda tecnica per Z-Assist (Invio per inviare, Shift+Invio a capo)..."
              disabled={isLoading}
              className="flex-1 resize-none bg-transparent px-2.5 py-2 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none max-h-[140px] custom-scrollbar disabled:opacity-60"
            />

            <div className="flex items-center gap-2 shrink-0 pb-0.5 pr-0.5">
              {input.length > 1500 && (
                <span
                  className={`text-[11px] font-mono ${
                    input.length > MAX_PROMPT_LENGTH ? 'text-red-500 font-bold' : 'text-zinc-400'
                  }`}
                >
                  {input.length}/{MAX_PROMPT_LENGTH}
                </span>
              )}
              <button
                type="submit"
                disabled={!input.trim() || isLoading || input.length > MAX_PROMPT_LENGTH}
                aria-label="Invia domanda"
                className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all disabled:opacity-35 disabled:pointer-events-none shadow-sm active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={handleConfirmClear}
        title="Cancella conversazione?"
        description="Questa conversazione verrà rimossa. I dati nella Knowledge Base e nei manuali resteranno intatti."
        confirmLabel="Cancella chat"
      />

      <ConfirmDialog
        open={Boolean(deletingSession)}
        onClose={() => setDeletingSession(null)}
        onConfirm={handleConfirmDeleteSession}
        isLoading={isDeletingSession}
        title="Elimina conversazione salvata?"
        description={`Vuoi eliminare definitivamente la chat "${deletingSession?.titolo || ''}"?`}
        confirmLabel="Elimina"
      />
    </div>
  );
}
