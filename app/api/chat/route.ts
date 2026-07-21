import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// Estende il timeout delle funzioni serverless su Vercel e disabilita la cache statica
export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

// Inizializzazione sicura per il backend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(req: Request) {
  try {
    // 1. VALIDAZIONE RIGOROSA DELL'INPUT
    const body = await req.json().catch(() => ({}));
    const messages = body.messages;
    
    // ESTREMO LA VARIABILE SCOPE INVIATA DAL FRONTEND
    const scope = body.scope || 'both';

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ reply: "Formato conversazione non valido." }, { status: 400 });
    }

    const userMessages = messages.filter((m: any) => m.role === 'user' && m.content?.trim());
    const latestPrompt = userMessages.length > 0 ? userMessages[userMessages.length - 1].content.trim() : null;

    if (!latestPrompt) {
      return NextResponse.json({ reply: "Nessun prompt valido fornito." }, { status: 400 });
    }

    // =========================================================================
    // 2. EMBEDDING (CON RETRY ROBUSTO)
    // =========================================================================
    let queryEmbedding: number[] | null = null;
    
    for (let i = 0; i < 2; i++) {
      try {
        const embeddingResult = await ai.models.embedContent({ 
            model: "gemini-embedding-001",
            contents: latestPrompt 
        });
        
        if (embeddingResult.embeddings?.[0]?.values) {
          queryEmbedding = embeddingResult.embeddings[0].values;
          break;
        }
      } catch (embedError) {
        if (i < 1) await delay(1500); 
        else console.error("Tentativi embedding esauriti:", embedError);
      }
    }

    if (!queryEmbedding) {
      throw new Error("Impossibile contattare il servizio di Embedding IA. Riprovare.");
    }

    // =========================================================================
    // 3. RICERCA RAG TRAMITE SELECTOR
    // =========================================================================
    let kbData: any[] = [];
    let docData: any[] = [];

    // IMPOSTAZIONE FILTRI IN BASE AL BOTTONE SELEZIONATO
    const cercaKB = scope === 'both' || scope === 'kb';
    const cercaManuali = scope === 'both' || scope === 'manuals';

    if (cercaKB) {
      try {
        const kbResponse = await supabase.rpc('match_knowledge_base', {
          query_embedding: queryEmbedding,
          match_threshold: 0.38, 
          match_count: 4        
        });
        if (!kbResponse.error && kbResponse.data) kbData = kbResponse.data;
        else console.error("Warning: Fallimento RPC Knowledge Base:", kbResponse.error?.message);
      } catch (e) { console.error("Eccezione su ricerca KB:", e); }
    }

    if (cercaManuali) {
      try {
        const docResponse = await supabase.rpc('match_documenti_chunk', {
          query_embedding: queryEmbedding,
          match_threshold: 0.38, 
          match_count: 4        
        });
        if (!docResponse.error && docResponse.data) docData = docResponse.data;
        else console.error("Warning: Fallimento RPC Documenti:", docResponse.error?.message);
      } catch (e) { console.error("Eccezione su ricerca Documenti:", e); }
    }

    // Costruzione dinamica e sicura del contesto
    let contesto = "";

    if (kbData.length > 0) {
      contesto += "=== TICKET E KNOWLEDGE BASE ===\n\n";
      contesto += kbData.map((s: any) => 
        `--- FONTE KB ID: ${s.numero_originale || 'Sconosciuto'} ---\nRiferimento: ${s.riferimento || 'N/A'}\nOggetto: ${s.oggetto || 'N/A'}\nTipologia: ${s.tipologia || 'N/A'}\nContenuto/Soluzione:\n${s.contenuto || 'Dato mancante'}\n-------------------`
      ).join('\n\n');
      contesto += "\n\n";
    }

    // FIX INIEZIONE BOTTONE (versione compatta [PDF])
    if (docData.length > 0) {
      contesto += "=== MANUALI PDF UFFICIALI ===\n\n";
      contesto += docData.map((d: any) => {
        const btnLink = (d.pdf_url && d.pdf_url !== 'NESSUNO') 
            ? `[PDF](/api/download?file=${d.pdf_url})` 
            : '';
        return `--- FONTE MANUALE: ${d.titolo || 'Generico'} ---\nProdotto: ${d.prodotto || 'N/A'}\nCapitolo: ${d.capitolo || 'N/A'} (Pagina: ${d.pagina || 'N/A'})\nLINK_BOTTONE_PDF: ${btnLink}\nIstruzioni:\n${d.testo || 'Dato mancante'}\n-------------------`;
      }).join('\n\n');
    }

    if (!contesto.trim()) {
      contesto = "Nessun dato pertinente trovato nei database (né in KB né nei Manuali) per questa specifica richiesta. Invita l'utente a fornire più dettagli tecnici.";
    }

    // =========================================================================
    // 4. SYSTEM PROMPT
    // =========================================================================
    const systemInstruction = `
      Sei un Senior Technical Support Engineer esperto degli applicativi Zucchetti per il CRM aziendale.
      Rispondi alle domande degli utenti basandoti RIGOROSAMENTE sulle informazioni del <contesto>.

      REGOLE DI ASSISTENZA TASSATIVE:
      1. FORNISCI SUBITO LA SOLUZIONE: Rispondi immediatamente in modo esaustivo. NON chiedere la versione all'utente. Se viene fornita la versione, usala per affinare la risposta. Se non è fornita, usa le informazioni generiche disponibili.
      2. NON INVENTARE: Se non trovi una soluzione nei dati forniti, rispondi chiaramente che non ci sono informazioni pertinenti e invita l'utente a fornire più dettagli tecnici.
      3. EVITA RISPOSTE GENERICHE: Non dare risposte vaghe o generiche. Usa solo le informazioni presenti nel <contesto>.
      4. FORMATO RISPOSTA: Rispondi in un linguaggio tecnico chiaro, indica i percorsi da fare per raggiungere i punti di menu, e includi eventuali link ai manuali PDF ufficiali se disponibili.
      5. LINGUA: Rispondi sempre in italiano.
      6. STRUTTURA: Usa elenchi puntati e metti in grassetto i menu.
      7. CITAZIONE E DOWNLOAD (CRITICO): Alla fine della risposta scrivi SEMPRE le fonti utilizzate (Knowledge Base o Manuali). Se hai estratto la soluzione dalla sezione "MANUALI PDF UFFICIALI" e nel contesto è presente la voce "LINK_BOTTONE_PDF:", devi OBBLIGATORIAMENTE copiare e incollare l'esatto link fornito **sulla stessa riga**, direttamente di fianco al nome del manuale.
      
      Esempio corretto: "Fonti utilizzate: Manuale XYZ [PDF](/api/download?file=123.pdf)"

      <contesto>
      ${contesto}
      </contesto>
    `;

    // =========================================================================
    // 5. RIPARAZIONE MEMORIA (Gemini Strict Pattern)
    // =========================================================================
    const rawHistory = messages.slice(0, -1).filter((m: any) => m.content && !m.content.includes("⚠️"));
    const geminiHistory: any[] = [];
    let nextExpectedRole = 'user';

    for (const msg of rawHistory) {
      const content = msg.content.trim();
      if (!content) continue;
      
      const mappedRole = msg.role === 'ai' ? 'model' : 'user';
      
      if (mappedRole === nextExpectedRole) {
        geminiHistory.push({ role: mappedRole, parts: [{ text: content }] });
        nextExpectedRole = mappedRole === 'user' ? 'model' : 'user';
      }
    }

    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'user') {
      geminiHistory.pop();
    }

    // =========================================================================
    // 6. GENERAZIONE CON TIMEOUT SICURO E TELEMETRIA SGANCATA
    // =========================================================================
    const chat = ai.chats.create({
        model: "gemini-3.5-flash", // IL NOME MODELLO ORIGINALE 'gemini-3.5-flash' NON ESISTE, RESTITUIVA ERRORE
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
    let usageStats = null;
    const MAX_RETRIES = 2; 

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const chatPromise = chat.sendMessage({ message: latestPrompt });
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("TIMEOUT_SUPERATO")), 35000);
        });

        const chatResult = await Promise.race([chatPromise, timeoutPromise]) as any;
        textResponse = chatResult?.text || "";
        usageStats = chatResult?.usageMetadata;

        break; 
        
      } catch (error: any) {
        const errMessage = error?.message || JSON.stringify(error);
        console.warn(`[Gemini Attempt ${i + 1}/${MAX_RETRIES}] Fallito:`, errMessage);
        lastError = error;

        if (errMessage.includes('404') || errMessage.includes('API key')) break;
        if (i < MAX_RETRIES - 1) await delay(2000);
      }
    }

    if (!textResponse) {
       throw lastError || new Error("Risposta vuota generata dall'IA.");
    }

    if (usageStats) {
      supabase.from('telemetria_ia').insert([{
        prompt_tokens: usageStats.promptTokenCount || 0,
        risposta_tokens: usageStats.candidatesTokenCount || 0,
        totale_tokens: usageStats.totalTokenCount || 0,
        successo: true
      }]).then(({ error }) => {
        if (error) console.error("Errore silente salvataggio telemetria:", error.message);
      });
    }

    return NextResponse.json({ reply: textResponse });

  } catch (error: any) {
    console.error("Errore Critico API Chat:", error?.message || error);
    return NextResponse.json({ 
      reply: "⚠️ I server o il database non sono riusciti a processare la richiesta. Riprova tra un istante." 
    }, { status: 500 });
  }
}