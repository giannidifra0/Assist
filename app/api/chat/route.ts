import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// Inizializzazione con il NUOVO SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Utility per far aspettare il server tra un tentativo e l'altro
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // 1. Estrazione del prompt
    const userMessages = messages.filter((m: any) => m.role === 'user').map((m: any) => m.content);
    const latestPrompt = userMessages[userMessages.length - 1];

    if (!latestPrompt) {
      return NextResponse.json({ reply: "Messaggio non valido." }, { status: 400 });
    }

    // =========================================================================
    // 2. EMBEDDING E RICERCA (ALTA PRECISIONE)
    // =========================================================================
    let queryEmbedding: any = null;
    
    for (let i = 0; i < 2; i++) {
      try {
        const embeddingResult = await ai.models.embedContent({ 
            model: "gemini-embedding-001",
            contents: latestPrompt 
        });
        queryEmbedding = embeddingResult.embeddings?.[0]?.values;
        if (queryEmbedding) break;
      } catch (embedError) {
        if (i < 1) await delay(1500); 
        else throw new Error("Servizio di Embedding non raggiungibile.");
      }
    }

    if (!queryEmbedding) {
      throw new Error("Errore durante la generazione dei vettori di ricerca.");
    }

    // AUMENTATA LA SOGLIA DI PRECISIONE A 0.38 PER EVITARE ALLUCINAZIONI
    const [kbResponse, docResponse] = await Promise.all([
      supabase.rpc('match_knowledge_base', {
        query_embedding: queryEmbedding,
        match_threshold: 0.38, 
        match_count: 4        
      }),
      supabase.rpc('match_documenti_chunk', {
        query_embedding: queryEmbedding,
        match_threshold: 0.38, 
        match_count: 4        
      })
    ]);

    if (kbResponse.error) throw new Error("Errore Supabase KB: " + kbResponse.error.message);
    if (docResponse.error) throw new Error("Errore Supabase Manuali: " + docResponse.error.message);

    let contesto = "";

    // Aggiungiamo i risultati dei Ticket / Knowledge Base
    if (kbResponse.data && kbResponse.data.length > 0) {
      contesto += "=== TICKET E KNOWLEDGE BASE ===\n\n";
      contesto += kbResponse.data.map((s: any) => 
        `--- FONTE KB ID: ${s.numero_originale || 'N/A'} ---\nRiferimento: ${s.riferimento || 'N/A'}\nOggetto: ${s.oggetto}\nTipologia: ${s.tipologia}\nContenuto/Soluzione:\n${s.contenuto}\n-------------------`
      ).join('\n\n');
      contesto += "\n\n";
    }

    // Aggiungiamo i risultati dei Manuali PDF
    if (docResponse.data && docResponse.data.length > 0) {
      contesto += "=== MANUALI PDF UFFICIALI ===\n\n";
      contesto += docResponse.data.map((d: any) => 
        `--- FONTE MANUALE: ${d.titolo} ---\nProdotto: ${d.prodotto}\nCapitolo: ${d.capitolo} (Pagina: ${d.pagina})\nIstruzioni:\n${d.testo}\n-------------------`
      ).join('\n\n');
    }

    if (!contesto.trim()) {
      contesto = "Nessun dato pertinente trovato nei database (né in KB né nei Manuali) per questa specifica richiesta.";
    }

    // =========================================================================
    // 3. SYSTEM PROMPT (AGGIORNATO PER LE FONTI DOPPIE)
    // =========================================================================
    const systemInstruction = `
      Sei un Senior Technical Support Engineer esperto degli applicativi Zucchetti per il CRM aziendale.
      Rispondi alle domande degli utenti basandoti RIGOROSAMENTE sulle informazioni del <contesto>.

      REGOLE DI ASSISTENZA TASSATIVE:
      1. FORNISCI SUBITO LA SOLUZIONE: Rispondi immediatamente in modo esaustivo. NON chiedere la versione all'utente.
      2. ALLERTA VERSIONI ZUCCHETTI: Se trovi indicazioni su versioni specifiche, inserisci un blocco: "⚠️ NOTA SULLA VERSIONE: Zucchetti ha corretto questa anomalia a partire dalla versione X.X.X".
      3. STRUTTURA: Usa elenchi puntati e metti in grassetto i menu.
      4. AFFIDABILITÀ: Se la risposta non è nel contesto, dichiara apertamente di non avere le informazioni. Non inventare nulla.
      5. CITAZIONE DELLE FONTI DOPPIE: È TASSATIVO citare la fonte esatta alla fine. 
         - Se usi un Ticket della KB, scrivi: "Fonti utilizzate: [Inserisci FONTE KB ID]".
         - Se usi un Manuale, scrivi: "Fonti utilizzate: [Inserisci FONTE MANUALE, Pag. X]".
         Se usi entrambi, citali entrambi separati da virgola.

      <contesto>
      ${contesto}
      </contesto>
    `;

    // =========================================================================
    // 4. NORMALIZZAZIONE MEMORIA
    // =========================================================================
    const validMessages = messages.filter((m: any) => !m.content.includes("⚠️"));
    const rawHistory = validMessages.slice(0, -1);

    const geminiHistory: any[] = [];
    let nextExpectedRole = 'user';

    for (const msg of rawHistory) {
      if (!msg.content.trim()) continue;
      
      const mappedRole = msg.role === 'ai' ? 'model' : 'user';
      if (mappedRole === nextExpectedRole) {
        geminiHistory.push({ role: mappedRole, parts: [{ text: msg.content }] });
        nextExpectedRole = mappedRole === 'user' ? 'model' : 'user';
      }
    }

    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'user') {
      geminiHistory.pop();
    }

    // =========================================================================
    // 5. GENERAZIONE E TELEMETRIA
    // =========================================================================
    const chat = ai.chats.create({
        model: "gemini-3.5-flash",
        config: {
            systemInstruction: systemInstruction,
            temperature: 0.1,
            topK: 40,
            topP: 0.95
        },
        history: geminiHistory
    });
    
    let textResponse = "";
    let lastError = null;
    const MAX_RETRIES = 2; 

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const chatPromise = chat.sendMessage({ message: latestPrompt });
        
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("TIMEOUT_SUPERATO")), 35000);
        });

        const chatResult = await Promise.race([chatPromise, timeoutPromise]) as any;
        
        textResponse = chatResult?.text || "";

        const usage = chatResult?.usageMetadata;
        if (usage) {
          await supabase.from('telemetria_ia').insert([{
            prompt_tokens: usage.promptTokenCount || 0,
            risposta_tokens: usage.candidatesTokenCount || 0,
            totale_tokens: usage.totalTokenCount || 0,
            successo: true
          }]);
        }

        break; 
        
      } catch (error: any) {
        const errMessage = error?.message || JSON.stringify(error);
        console.warn(`[Tentativo ${i + 1}/${MAX_RETRIES}] Fallito:`, errMessage);
        lastError = error;

        if (errMessage.includes('404') || errMessage.includes('API key') || errMessage.includes('NOT_FOUND')) {
          break;
        }

        if (i < MAX_RETRIES - 1) {
          await delay(2000);
        }
      }
    }

    if (!textResponse) {
       throw lastError;
    }

    return NextResponse.json({ reply: textResponse });

  } catch (error: any) {
    console.error("Errore chat IA definitivo:", error?.message || error);
    return NextResponse.json({ 
      reply: "⚠️ I server di Google sono saturi o il tempo di attesa è scaduto. Riprova tra un istante." 
    }, { status: 500 });
  }
}