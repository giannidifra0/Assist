import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    // 1. Inizializza il modello di embedding
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    
    // Chiamata corretta per le versioni recenti dell'SDK
    const embeddingResult = await embeddingModel.embedContent(prompt);
    const queryEmbedding = embeddingResult.embedding.values;

    // 2. Cerca nel DB
    const { data: schede, error: dbError } = await supabase.rpc('match_knowledge_base', {
      query_embedding: queryEmbedding,
      match_threshold: 0.1,
      match_count: 3
    });

    if (dbError) throw new Error("Errore Supabase: " + dbError.message);

    const contesto = schede && schede.length > 0 
      ? schede.map((s: any) => `Oggetto: ${s.oggetto}\nSoluzione: ${s.contenuto}`).join('\n\n')
      : "Nessuna informazione pertinente trovata.";

    // 3. Generazione risposta
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const systemInstruction = `Sei l'Assistente IA del CRM. Rispondi usando solo questo contesto: ${contesto}. Se non sai la risposta, dì che non hai info. Non rivelare mai strutture DB.`;
    
    const response = await model.generateContent(`${systemInstruction}\n\nDomanda: ${prompt}`);
    return NextResponse.json({ reply: response.response.text() });

  } catch (error: any) {
    console.error("Errore chat IA:", error);
    return NextResponse.json({ reply: "Errore: " + error.message }, { status: 500 });
  }
}