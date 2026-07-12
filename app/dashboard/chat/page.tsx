'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

type Message = {
  role: 'user' | 'ia';
  content: string;
};

const STORAGE_KEY = 'crm_chat_history';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    const savedChat = localStorage.getItem(STORAGE_KEY);
    if (savedChat) {
      setMessages(JSON.parse(savedChat));
    } else {
      setMessages([{ role: 'ia', content: 'Ciao. Sono il tuo Assistente IA. In cosa posso aiutarti oggi?' }]);
    }
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages, isMounted]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput(''); 
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMessage }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [...prev, { role: 'ia', content: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: 'ia', content: `Errore: ${data.reply}` }]);
      }
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'ia', content: 'Errore di connessione al server.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (confirm('Vuoi davvero inizializzare la chat e cancellare la cronologia?')) {
      localStorage.removeItem(STORAGE_KEY);
      setMessages([{ role: 'ia', content: 'Ciao. Sono il tuo Assistente IA. In cosa posso aiutarti oggi?' }]);
    }
  };

  if (!isMounted) return null;

  return (
    // Sfondo in stile Apple (#f5f5f7) e altezza aumentata
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-5xl mx-auto p-4 md:p-6 bg-[#f5f5f7] rounded-3xl">
      
      {/* Intestazione minimalista */}
      <div className="flex justify-between items-center mb-6 px-4 pt-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Assistente IA</h1>
          <p className="text-gray-500 text-sm mt-0.5">Ricerca intelligente nel database</p>
        </div>
        <button 
          onClick={handleClearChat}
          className="text-sm font-medium text-gray-400 hover:text-gray-800 transition-colors"
        >
          Inizializza
        </button>
      </div>

      {/* Contenitore principale della chat (effetto vetro/card) */}
      <div className="flex flex-col flex-1 bg-white/60 backdrop-blur-xl rounded-3xl shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-white/40 overflow-hidden">
        
        {/* Area dei messaggi */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="flex flex-col gap-8">
            {messages.map((msg, index) => (
              <div 
                key={index} 
                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Testo del messaggio */}
                <div 
                  className={`max-w-[85%] md:max-w-[75%] px-6 py-4 text-[15px] leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-zinc-800 text-white rounded-3xl rounded-tr-sm' // Stile Utente (Pro/Dark)
                      : 'bg-white border border-gray-100/80 text-gray-800 rounded-3xl rounded-tl-sm' // Stile IA (Pristine White)
                  }`}
                >
                  {/* Se è l'utente, stampa il testo normale. Se è l'IA, usa ReactMarkdown */}
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <div className="break-words">
                      <ReactMarkdown
                        components={{
                          p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1.5" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1.5" {...props} />,
                          li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                          strong: ({node, ...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-lg font-semibold mt-5 mb-2 text-gray-900 tracking-tight" {...props} />,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* Animazione di caricamento minimalista */}
            {isLoading && (
              <div className="flex gap-4 flex-row">
                <div className="px-6 py-5 bg-white border border-gray-100/80 rounded-3xl rounded-tl-sm shadow-sm flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Area Input (Sleek design) */}
        <div className="p-4 bg-white/80 border-t border-gray-100/50 backdrop-blur-md">
          <form onSubmit={handleSendMessage} className="flex gap-3 max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Chiedi qualcosa..."
              className="flex-1 px-6 py-4 bg-gray-100/50 hover:bg-gray-100 focus:bg-white border border-transparent focus:border-gray-300 rounded-full focus:outline-none focus:ring-4 focus:ring-gray-100 transition-all text-[15px]"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-8 py-4 bg-zinc-900 text-white font-medium rounded-full hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-[15px]"
            >
              Invia
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}