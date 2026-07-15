import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// Inizializzazione con il NUOVO SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function GET() {
  try {
    // 1. Recuperiamo solo le schede che non hanno ancora l'embedding (embedding IS NULL)
    const { data: schede, error: fetchError } = await supabase
      .from('knowledge_base')
      .select('id, oggetto, contenuto')
      .is('embedding', null);

    if (fetchError) throw new Error("Errore lettura DB: " + fetchError.message);

    if (!schede || schede.length === 0) {
      return NextResponse.json({ message: "Tutte le schede hanno già i vettori IA aggiornati!" });
    }

    let aggiornate = 0;

    // 2. Ciclo di generazione embedding con il NUOVO SDK
    for (const scheda of schede) {
      const testoDaVettorizzare = `Oggetto: ${scheda.oggetto}\nSoluzione: ${scheda.contenuto}`;
      
      // Chiamata API col nuovo SDK
      const result = await ai.models.embedContent({ 
        model: "gemini-embedding-001",
        contents: testoDaVettorizzare 
      });

      // Recupero sicuro dei valori vettoriali (con optional chaining per sicurezza)
      const vettore = result.embeddings?.[0]?.values;

      if (!vettore) {
         throw new Error(`Errore IA: Impossibile generare embedding per scheda ${scheda.id}`);
      }

      // 3. Salvataggio su Supabase
      const { error: updateError } = await supabase
        .from('knowledge_base')
        .update({ embedding: vettore })
        .eq('id', scheda.id);

      if (updateError) {
        throw new Error(`Il DB ha bloccato il salvataggio scheda ${scheda.id}: ${updateError.message}`);
      }
        
      aggiornate++;
    }

    return NextResponse.json({ 
      message: `Elaborazione completata! L'IA ha processato e salvato ${aggiornate} nuove schede nel database.` 
    });

  } catch (error: any) {
    console.error("ERRORE FATALE EMBEDDING:", error);
    return NextResponse.json({ ERRORE_FATALE: error.message }, { status: 500 });
  }
}