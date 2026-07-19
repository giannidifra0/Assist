import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { titolo, versione, prodotto, chunks } = await req.json();

    if (!chunks || chunks.length === 0) {
      throw new Error("Nessun frammento di testo da salvare.");
    }

    // 1. Salva il documento padre
    const { data: docData, error: docError } = await supabase
      .from('documenti')
      .insert([{ titolo, versione, prodotto }])
      .select('id')
      .single();

    if (docError || !docData) {
      throw new Error("Errore DB (Documento): " + (docError?.message || 'Sconosciuto'));
    }

    const documento_id = docData.id;
    let inseriti = 0;

    // 2. Vettorizza e salva ogni singolo chunk approvato (con gestione errori)
    for (const chunk of chunks) {
      // Costruiamo il contesto per l'IA
      const textToEmbed = `Prodotto: ${prodotto} | Titolo: ${titolo} | Capitolo: ${chunk.capitolo} | Testo: ${chunk.testo}`;
      
      const result = await ai.models.embedContent({ 
        model: "gemini-embedding-001",
        contents: textToEmbed 
      });
      
      const vettore = result.embeddings?.[0]?.values;

      if (vettore) {
        const { error: chunkError } = await supabase.from('documenti_chunk').insert([{
          documento_id: documento_id,
          capitolo: chunk.capitolo,
          pagina: parseInt(chunk.pagina, 10) || 1, // FORZATURA NUMERICA FONDAMENTALE
          testo: chunk.testo,
          embedding: vettore
        }]);

        if (chunkError) {
          console.error("Errore salvataggio chunk:", chunkError);
          throw new Error("Errore DB (Chunk): " + chunkError.message);
        }
        
        inseriti++;
      }
    }

    return NextResponse.json({ success: true, message: `Manuale salvato! ${inseriti} sezioni elaborate e apprese dall'IA.` });
  } catch (error: any) {
    console.error("Errore upload completo:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}