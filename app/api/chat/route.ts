import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

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
    // 3. RICERCA RAG (TOLLERANTE AI GUASTI PARZIALI)
    // =========================================================================
    let kbData: any[] = [];
    let docData: any[] = [];

    // Cerchiamo nella Knowledge Base
    try {
      const kbResponse = await supabase.rpc('match_knowledge_base', {
        query_embedding: queryEmbedding,
        match_threshold: 0.38, 
        match_count: 4        
      });
      if (!kbResponse.error && kbResponse.data) kbData = kbResponse.data;
      else console.error("Warning: Fallimento RPC Knowledge Base:", kbResponse.error?.message);
    } catch (e) { console.error("Eccezione su ricerca KB:", e); }

    // Cerchiamo nei Manuali PDF
    try {
      const docResponse = await supabase.rpc('match_documenti_chunk', {
        query_embedding: queryEmbedding,
        match_threshold: 0.38, 
        match_count: 4        
      });
      if (!docResponse.error && docResponse.data) docData = docResponse.data;
      else console.error("Warning: Fallimento RPC Documenti:", docResponse.error?.message);
    } catch (e) { console.error("Eccezione su ricerca Documenti:", e); }

    // Costruzione dinamica e sicura del contesto
    let contesto = "";

    if (kbData.length > 0) {
      contesto += "=== TICKET E KNOWLEDGE BASE ===\n\n";
      contesto += kbData.map((s: any) => 
        `--- FONTE KB ID: ${s.numero_originale || 'Sconosciuto'} ---\nRiferimento: ${s.riferimento || 'N/A'}\nOggetto: ${s.oggetto || 'N/A'}\nTipologia: ${s.tipologia || 'N/A'}\nContenuto/Soluzione:\n${s.contenuto || 'Dato mancante'}\n-------------------`
      ).join('\n\n');
      contesto += "\n\n";
    }

    if (docData.length > 0) {
      contesto += "=== MANUALI PDF UFFICIALI ===\n\n";
      contesto += docData.map((d: any) => 
        `--- FONTE MANUALE: ${d.titolo || 'Generico'} ---\nProdotto: ${d.prodotto || 'N/A'}\nCapitolo: ${d.capitolo || 'N/A'} (Pagina: ${d.pagina || 'N/A'})\nIstruzioni:\n${d.testo || 'Dato mancante'}\n-------------------`
      ).join('\n\n');
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
    // 5. RIPARAZIONE MEMORIA (Gemini Strict Pattern)
    // =========================================================================
    const rawHistory = messages.slice(0, -1).filter((m: any) => m.content && !m.content.includes("⚠️"));
    const geminiHistory: any[] = [];
    let nextExpectedRole = 'user'; // Gemini esige TASSATIVAMENTE che la history inizi con 'user'

    for (const msg of rawHistory) {
      const content = msg.content.trim();
      if (!content) continue;
      
      const mappedRole = msg.role === 'ai' ? 'model' : 'user';
      
      if (mappedRole === nextExpectedRole) {
        geminiHistory.push({ role: mappedRole, parts: [{ text: content }] });
        nextExpectedRole = mappedRole === 'user' ? 'model' : 'user';
      }
    }

    // Se la history finisce con 'user', lo togliamo perché il nuovo prompt copre l'ultimo turno
    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'user') {
      geminiHistory.pop();
    }

    // =========================================================================
    // 6. GENERAZIONE CON TIMEOUT SICURO E TELEMETRIA SGANCATA
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

        break; // Successo, usciamo dal ciclo
        
      } catch (error: any) {
        const errMessage = error?.message || JSON.stringify(error);
        console.warn(`[Gemini Attempt ${i + 1}/${MAX_RETRIES}] Fallito:`, errMessage);
        lastError = error;

        // Se l'errore è critico e non recuperabile, interrompiamo subito
        if (errMessage.includes('404') || errMessage.includes('API key')) break;
        if (i < MAX_RETRIES - 1) await delay(2000);
      }
    }

    if (!textResponse) {
       throw lastError || new Error("Risposta vuota generata dall'IA.");
    }

    // Esecuzione sganciata della Telemetria (Fire-and-Forget)
    // Non rallenta l'utente e non genera errori 500 se fallisce l'insert
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