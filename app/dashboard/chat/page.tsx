'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Bot, Sparkles, User, Trash2 } from 'lucide-react';

type Message = {
  role: 'user' | 'ai';
  content: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carica i messaggi dal localStorage all'avvio
  useEffect(() => {
    const saved = localStorage.getItem('crm_chat_history');
    if (saved) {
      setMessages(JSON.parse(saved));
    } else {
      setMessages([{ role: 'ai', content: 'Ciao! Sono Z-Assist, il tuo assistente IA. Come posso aiutarti con il CRM oggi?' }]);
    }
  }, []);

  // Salva i messaggi ogni volta che cambiano
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('crm_chat_history', JSON.stringify(messages));
    }
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const clearChat = () => {
    if (confirm('Vuoi davvero cancellare tutta la conversazione?')) {
      const initialMessage: Message[] = [{ role: 'ai', content: 'Cronologia cancellata. Come posso aiutarti ora?' }];
      setMessages(initialMessage);
      localStorage.setItem('crm_chat_history', JSON.stringify(initialMessage));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMessage.content }),
      });

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'ai', content: data.reply || "Errore di risposta." }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: "Errore di connessione al server dell'IA." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] md:h-[calc(100vh-8rem)] bg-white rounded-3xl shadow-sm border border-zinc-200/80 overflow-hidden animate-in fade-in duration-500">
      
      {/* Intestazione Chat */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center mr-3 shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900 tracking-tight">Z-Assist</h2>
            <p className="text-xs text-zinc-500 font-medium">Assistente CRM Intelligente</p>
          </div>
        </div>
        <button 
          onClick={clearChat}
          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors tooltip"
          title="Svuota chat"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Area Messaggi */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-zinc-50/30">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
              
              {/* Avatar (Opzionale, visibile solo per IA per maggiore pulizia) */}
              {msg.role === 'ai' && (
                <div className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0 shadow-sm mb-1">
                  <Bot className="w-4 h-4 text-zinc-900" />
                </div>
              )}

              {/* Bolla Messaggio */}
              <div 
                className={`px-5 py-3.5 text-[15px] leading-relaxed shadow-sm break-words
                  ${msg.role === 'user' 
                    ? 'bg-zinc-900 text-white rounded-2xl rounded-tr-sm' 
                    : 'bg-white text-zinc-800 border border-zinc-200/80 rounded-2xl rounded-tl-sm'
                  }`}
              >
                {msg.content.split('\n').map((line, i) => (
                  <span key={i}>
                    {line}
                    {i !== msg.content.split('\n').length - 1 && <br />}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
        
        {/* Indicatore di digitazione */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex max-w-[85%] flex-row items-end gap-2">
              <div className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0 shadow-sm mb-1">
                <Bot className="w-4 h-4 text-zinc-900" />
              </div>
              <div className="px-5 py-4 bg-white border border-zinc-200/80 rounded-2xl rounded-tl-sm shadow-sm flex space-x-1.5 items-center h-[52px]">
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Area Input */}
      <div className="p-4 bg-white border-t border-zinc-100">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Scrivi una domanda a Z-Assist..."
            disabled={isLoading}
            className="w-full pl-5 pr-14 py-4 bg-zinc-50 border border-zinc-200 rounded-full focus:ring-1 focus:ring-zinc-900 focus:bg-white outline-none transition-all text-sm shadow-sm disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2.5 bg-zinc-900 text-white rounded-full hover:bg-zinc-800 transition-colors disabled:opacity-40 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}