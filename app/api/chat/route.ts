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
    const searchContext = userMessages.slice(-2).join(" | ");
    const latestPrompt = userMessages[userMessages.length - 1];

    if (!latestPrompt) {
      return NextResponse.json({ reply: "Messaggio non valido." }, { status: 400 });
    }

    // =========================================================================
    // 2. EMBEDDING E RICERCA (Nuovo SDK con controlli TypeScript)
    // =========================================================================
    const embeddingResult = await ai.models.embedContent({ 
        model: "gemini-embedding-001",
        contents: searchContext
    });
    
    // FIX TYPESCRIPT: Aggiunto l'optional chaining (?.) e controllo sicurezza
    const queryEmbedding = embeddingResult.embeddings?.[0]?.values;
    
    if (!queryEmbedding) {
      throw new Error("Errore durante la generazione dei vettori di ricerca.");
    }

    const { data: schede, error: dbError } = await supabase.rpc('match_knowledge_base', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3, 
      match_count: 5        
    });

    if (dbError) throw new Error("Errore Supabase RPC: " + dbError.message);

    let contesto = "";
    if (schede && schede.length > 0) {
      contesto = schede.map((s: any, index: number) => 
        `--- SCHEDA ${index + 1} ---\nID Originale: ${s.numero_originale || 'N/A'}\nRiferimento: ${s.riferimento || 'N/A'}\nOggetto: ${s.oggetto}\nTipologia: ${s.tipologia}\nContenuto/Soluzione:\n${s.contenuto}\n-------------------`
      ).join('\n\n');
    } else {
      contesto = "Nessun dato pertinente trovato nella Knowledge Base per questa specifica richiesta.";
    }

    // =========================================================================
    // 3. SYSTEM PROMPT
    // =========================================================================
    const systemInstruction = `
      Sei un Senior Technical Support Engineer esperto degli applicativi Zucchetti per il CRM aziendale.
      Rispondi alle domande degli utenti basandoti RIGOROSAMENTE sulle informazioni del <contesto>.

      REGOLE DI ASSISTENZA TASSATIVE:
      1. FORNISCI SUBITO LA SOLUZIONE: Rispondi immediatamente in modo esaustivo. NON chiedere la versione all'utente.
      2. ALLERTA VERSIONI ZUCCHETTI: Analizza sempre la sezione "SOLUZIONE" del contesto. Se trovi indicazioni su versioni specifiche (es. "Corretto a partire da versione 07.07.00"), inserisci alla fine un blocco evidente. Esempio: "⚠️ NOTA SULLA VERSIONE: Zucchetti ha corretto questa anomalia a partire dalla versione X.X.X".
      3. STRUTTURA: Usa elenchi puntati per i passaggi risolutivi e metti in grassetto i menu.
      4. AFFIDABILITÀ: Se la risposta non è nel contesto, dichiara apertamente di non avere le informazioni. Non inventare nulla.
      5. RIFERIMENTI: Includi sempre i riferimenti interni (es. BugID, ID, PRWF, SKB) in calce alla risposta.

      <contesto>
      ${contesto}
      </contesto>
    `;

    // =========================================================================
    // 4. NORMALIZZAZIONE MEMORIA (Tipizzata per TypeScript)
    // =========================================================================
    const validMessages = messages.filter((m: any) => !m.content.includes("⚠️"));
    const rawHistory = validMessages.slice(0, -1);

    // FIX TYPESCRIPT: Impostato 'any[]' per prevenire conflitti di tipo con il nuovo SDK
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
    // 5. GENERAZIONE (Modello Fisso + Timeout Rilassato + Retry)
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

        // FIX TYPESCRIPT: Risolve l'inferenza del Promise.race
        const chatResult = await Promise.race([chatPromise, timeoutPromise]) as any;
        
        // FIX TYPESCRIPT: Previene l'errore "text might be undefined"
        textResponse = chatResult?.text || "";
        break; // Trovata la risposta! Usciamo dal ciclo.
        
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