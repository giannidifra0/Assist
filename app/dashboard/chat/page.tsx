'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Bot, Sparkles, Trash2, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type Message = { role: 'user' | 'ai'; content: string; };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // NUOVO STATO: Memorizza l'ambito di ricerca scelto dall'utente
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // INVIO DELLO SCOPE AL BACKEND
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
    <div className="flex flex-col h-[calc(100dvh-2.5rem)] md:h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-4.5rem)] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-[2.5rem] shadow-xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden animate-in fade-in duration-500 relative">
      
      {/* HEADER */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md flex-shrink-0 z-10">
        <div className="flex items-center">
          <div className="w-11 h-11 bg-zinc-900 dark:bg-white rounded-2xl flex items-center justify-center mr-4 shadow-md">
            <Sparkles className="w-6 h-6 text-white dark:text-zinc-900" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">Z-Assist AI</h2>
            <div className="flex items-center mt-0.5">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest">Sempre Attivo</p>
            </div>
          </div>
        </div>
        <button onClick={clearChat} className="p-2.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 bg-zinc-50 hover:bg-red-50 dark:bg-zinc-800 dark:hover:bg-red-900/30 rounded-xl transition-all shadow-sm border border-zinc-200/50 dark:border-zinc-700" title="Svuota chat">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-zinc-50/30 dark:bg-zinc-950/30">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`flex max-w-[92%] md:max-w-[85%] lg:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end gap-3`}>
              
              {/* AVATAR */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm mb-1 z-10 ${msg.role === 'user' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white'}`}>
                {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>

              {/* BUBBLE */}
              <div className={`px-6 py-4 text-[15px] leading-relaxed shadow-sm break-words relative
                  ${msg.role === 'user' 
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-[1.5rem] rounded-br-sm' 
                    : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-800 rounded-[1.5rem] rounded-bl-sm'
                  }`}
              >
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap font-medium">{msg.content}</div>
                ) : (
                  <ReactMarkdown 
                    components={{
                      p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-bold text-zinc-900 dark:text-white" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1.5" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 space-y-1.5" {...props} />,
                      li: ({node, ...props}) => <li className="pl-1" {...props} />,
                      h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3 mt-5 text-zinc-900 dark:text-white" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-3 mt-5 text-zinc-900 dark:text-white" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-base font-bold mb-2 mt-3 text-zinc-900 dark:text-white" {...props} />,
                      
                      a: ({node, href, children, ...props}: any) => {
                        if (href?.includes('/api/download')) {
                          return (
                            <a 
                              href={href}
                              title="Scarica il manuale di riferimento"
                              className="inline-flex items-center justify-center gap-1 ml-2 px-2.5 py-0.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-500/20 text-[10px] font-extrabold tracking-widest rounded-full hover:bg-rose-100 dark:hover:bg-rose-500/20 hover:-translate-y-0.5 transition-all shadow-sm align-middle group"
                            >
                              <span className="w-4 h-4 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                              </span>
                              PDF
                            </a>
                          );
                        }
                        return <a href={href} className="text-blue-600 dark:text-blue-400 font-semibold hover:underline" {...props}>{children}</a>;
                      },
                      
                      pre: ({node, children, ...props}: any) => (
                        <pre className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl my-4 overflow-x-auto border border-zinc-200/80 dark:border-zinc-800 shadow-sm" {...props}>
                          {children}
                        </pre>
                      ),
                      code: ({node, inline, className, children, ...props}: any) => {
                        if (inline) {
                          return (
                            <code className="bg-rose-50 dark:bg-rose-900/20 px-1.5 py-0.5 mx-0.5 rounded-md text-[14px] font-mono text-rose-600 dark:text-rose-400 break-words" {...props}>
                              {children}
                            </code>
                          );
                        }
                        return (
                          <code className={`font-mono text-[13.5px] text-zinc-800 dark:text-zinc-200 ${className || ''}`} {...props}>
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
          </div>
        ))}
        
        {/* TYPING INDICATOR */}
        {isLoading && (
          <div className="flex justify-start animate-in fade-in duration-300">
            <div className="flex max-w-[85%] flex-row items-end gap-3">
              <div className="w-9 h-9 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center flex-shrink-0 shadow-sm mb-1">
                <Bot className="w-5 h-5 text-zinc-900 dark:text-white" />
              </div>
              <div className="px-6 py-5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-[1.5rem] rounded-bl-sm shadow-sm flex space-x-2 items-center">
                <div className="w-2.5 h-2.5 bg-zinc-300 dark:bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2.5 h-2.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2.5 h-2.5 bg-zinc-500 dark:bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* INPUT AREA CON FILTRI */}
      <div className="p-4 md:p-6 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-800/80 flex-shrink-0 z-10 flex flex-col">
        
        {/* PILLOLE DI SELEZIONE RICERCA */}
        <div className="flex items-center gap-2 mb-3 px-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mr-2 hidden sm:block">Ricerca in:</span>
          <button 
            type="button" 
            onClick={() => setSearchScope('both')} 
            className={`px-4 py-1.5 text-[12px] font-bold rounded-full transition-all ${searchScope === 'both' ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}
          >
            Tutto
          </button>
          <button 
            type="button" 
            onClick={() => setSearchScope('kb')} 
            className={`px-4 py-1.5 text-[12px] font-bold rounded-full transition-all ${searchScope === 'kb' ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}
          >
            Solo KB
          </button>
          <button 
            type="button" 
            onClick={() => setSearchScope('manuals')} 
            className={`px-4 py-1.5 text-[12px] font-bold rounded-full transition-all ${searchScope === 'manuals' ? 'bg-rose-600 text-white shadow-sm' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}
          >
            Solo Manuali
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative flex items-center w-full">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Chiedi supporto a Z-Assist..."
            disabled={isLoading}
            className="w-full pl-6 pr-16 py-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-full focus:ring-4 focus:ring-zinc-900/5 dark:focus:ring-white/5 focus:border-zinc-400 dark:focus:border-zinc-500 outline-none transition-all text-base font-medium dark:text-white shadow-sm disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2.5 p-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all disabled:opacity-30 disabled:scale-95 shadow-md hover:shadow-lg active:scale-95"
          >
            <Send className="w-5 h-5 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}