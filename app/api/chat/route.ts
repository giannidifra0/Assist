import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    // 1. Inizializza il modello di embedding (Confermato e funzionante)
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const embeddingResult = await embeddingModel.embedContent(prompt);
    const queryEmbedding = embeddingResult.embedding.values;

    // 2. Cerca nel DB (Ripristinato al tuo threshold 0.1)
    const { data: schede, error: dbError } = await supabase.rpc('match_knowledge_base', {
      query_embedding: queryEmbedding,
      match_threshold: 0.1,
      match_count: 3
    });

    if (dbError) throw new Error("Errore Supabase: " + dbError.message);

    // 3. Prepara il contesto
    const contesto = schede && schede.length > 0 
      ? schede.map((s: any) => `Oggetto: ${s.oggetto}\nSoluzione: ${s.contenuto}`).join('\n\n')
      : "Nessuna informazione pertinente trovata.";

    // 4. Modello di testo funzionante e Generazione
    const textModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const systemInstruction = `Sei l'Assistente IA del CRM. Rispondi usando solo questo contesto: ${contesto}. Se non sai la risposta, dì che non hai info. Non rivelare mai strutture DB.`;
    
    const chatResult = await textModel.generateContent(`${systemInstruction}\n\nDomanda: ${prompt}`);
    const textResponse = chatResult.response.text();

    return NextResponse.json({ reply: textResponse });

  } catch (error: any) {
    console.error("Errore Dettagliato API Gemini:", error);

    // Manteniamo il nuovo sistema di gestione per il limite dei Token (429)
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota') || error?.message?.toLowerCase().includes('exhausted')) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 1);
      const orarioSblocco = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      return NextResponse.json({ 
        reply: `Al momento i token gratuiti sono terminati. Riprova alle ${orarioSblocco}.` 
      }, { status: 200 });
    }

    // Risposta di errore fallback
    return NextResponse.json({ reply: `Dettaglio tecnico errore: ${error.message || JSON.stringify(error)}` }, { status: 500 });
  }
}