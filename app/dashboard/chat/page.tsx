'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Trash2, Sparkles, Database, FileText, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type Message = { role: 'user' | 'ai'; content: string; };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Ambito di ricerca (scope)
  const [searchScope, setSearchScope] = useState<'both' | 'kb' | 'manuals'>('both');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('crm_chat_history');
    if (saved) setMessages(JSON.parse(saved));
    else setMessages([{ role: 'ai', content: 'Ciao! Sono **Z-Assist**, il tuo assistente IA per le soluzioni Zucchetti.\n\nDescrivimi l\'anomalia che stai riscontrando o il messaggio di errore che visualizzi, e ti fornirò subito la procedura di risoluzione e le note di rilascio ufficiali.' }]);
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  useEffect(() => {
    if (messages.length > 0) localStorage.setItem('crm_chat_history', JSON.stringify(messages));
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const clearChat = () => {
    if (confirm('Vuoi davvero cancellare tutta la conversazione?')) {
      const initialMessage: Message[] = [{ role: 'ai', content: 'Cronologia cancellata. Come posso aiutarti ora?' }];
      setMessages(initialMessage);
      localStorage.setItem('crm_chat_history', JSON.stringify(initialMessage));
      inputRef.current?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userMessage: Message = { role: 'user', content: input };
    const newChatHistory = [...messages, userMessage];
    setMessages(newChatHistory);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newChatHistory, scope: searchScope }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.reply || "Errore di comunicazione col server.");
      setMessages(prev => [...prev, { role: 'ai', content: data.reply || "Errore di risposta." }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'ai', content: `⚠️ Si è verificato un problema: ${error.message}` }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full mx-auto animate-in fade-in duration-300">
      
      {/* HEADER STILE iMESSAGE */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-zinc-200/50 dark:border-zinc-800/60 flex-shrink-0 px-2 sm:px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">Z-Assist IA</h2>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-500/10 text-green-600 dark:text-green-400">
                ● Online
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-medium">Assistente Smart per Knowledge Base e Manuali</p>
          </div>
        </div>

        <button 
          onClick={clearChat} 
          className="p-2 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all"
          title="Cancella conversazione"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* CHAT MESSAGES - IMESSAGE STYLE */}
      <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-4 space-y-3.5 custom-scrollbar">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}>
            
            {/* BOLLA MESSAGGIO IMESSAGE */}
            <div 
              className={`max-w-[88%] sm:max-w-[80%] md:max-w-[75%] px-4 py-2.5 text-xs sm:text-[13px] leading-relaxed break-words transition-all ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-[18px] rounded-br-[4px] shadow-sm font-normal'
                  : 'bg-zinc-200/80 dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100 rounded-[18px] rounded-bl-[4px] shadow-sm font-normal'
              }`}
            >
              {msg.role === 'user' ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <ReactMarkdown 
                  components={{
                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-bold text-zinc-950 dark:text-white" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                    li: ({node, ...props}) => <li className="pl-0.5" {...props} />,
                    h1: ({node, ...props}) => <h1 className="text-sm font-bold mb-2 mt-3 text-zinc-950 dark:text-white" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-xs font-bold mb-1.5 mt-2.5 text-zinc-950 dark:text-white" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-[11px] font-bold mb-1 mt-2 text-zinc-950 dark:text-white" {...props} />,
                    
                    a: ({node, href, children, ...props}: any) => {
                      if (href?.includes('/api/download')) {
                        return (
                          <a 
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Scarica PDF"
                            className="inline-flex items-center gap-1 my-1 px-2.5 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold rounded-lg hover:bg-rose-500/20 transition-all align-middle"
                          >
                            <FileText className="w-3 h-3" />
                            Scarica PDF
                          </a>
                        );
                      }
                      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 font-semibold hover:underline" {...props}>{children}</a>;
                    },
                    
                    pre: ({node, children, ...props}: any) => (
                      <pre className="bg-zinc-900 text-zinc-100 p-3 rounded-xl my-2 overflow-x-auto text-[11px] font-mono" {...props}>
                        {children}
                      </pre>
                    ),
                    code: ({node, inline, className, children, ...props}: any) => {
                      if (inline) {
                        return (
                          <code className="bg-zinc-300/60 dark:bg-zinc-700/60 px-1 py-0.5 rounded text-[11px] font-mono text-zinc-900 dark:text-zinc-100" {...props}>
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className={`font-mono text-[11px] ${className || ''}`} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        
        {/* INDICATORE DIGITAZIONE */}
        {isLoading && (
          <div className="flex justify-start animate-in fade-in duration-200">
            <div className="px-4 py-3 bg-zinc-200/80 dark:bg-zinc-800/90 rounded-[18px] rounded-bl-[4px] shadow-sm flex items-center space-x-1.5">
              <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* INPUT CONTAINER - STILE IMESSAGE */}
      <div className="pt-2 pb-2 px-2 sm:px-4 flex-shrink-0">
        
        {/* BARRA FILTRI DI RICERCA */}
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto custom-scrollbar pb-1">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mr-1 shrink-0">Filtra:</span>
          <button 
            type="button" 
            onClick={() => setSearchScope('both')} 
            className={`inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded-full transition-all shrink-0 ${
              searchScope === 'both' 
                ? 'bg-blue-600 text-white shadow-sm font-semibold' 
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            <Globe className="w-3 h-3" />
            Tutto
          </button>
          <button 
            type="button" 
            onClick={() => setSearchScope('kb')} 
            className={`inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded-full transition-all shrink-0 ${
              searchScope === 'kb' 
                ? 'bg-blue-600 text-white shadow-sm font-semibold' 
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            <Database className="w-3 h-3" />
            Solo KB
          </button>
          <button 
            type="button" 
            onClick={() => setSearchScope('manuals')} 
            className={`inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded-full transition-all shrink-0 ${
              searchScope === 'manuals' 
                ? 'bg-blue-600 text-white shadow-sm font-semibold' 
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            <FileText className="w-3 h-3" />
            Solo Manuali
          </button>
        </div>

        {/* CAMPO DI TESTO E INVIO */}
        <form onSubmit={handleSubmit} className="relative flex items-center w-full">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Messaggio iMessage a Z-Assist..."
            disabled={isLoading}
            className="w-full pl-4 pr-11 py-2.5 bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/60 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-xs sm:text-sm font-normal text-zinc-900 dark:text-white placeholder:text-zinc-400 transition-all disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all disabled:opacity-30 disabled:scale-95 shadow-sm active:scale-90"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

    </div>
  );
}