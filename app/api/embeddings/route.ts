import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function GET() {
  try {
    const { data: schede, error: fetchError } = await supabase
      .from('knowledge_base')
      .select('*')
      .is('embedding', null);

    if (fetchError) throw new Error("Errore lettura: " + fetchError.message);

    if (!schede || schede.length === 0) {
      return NextResponse.json({ message: "Tutte le schede hanno già i vettori IA!" });
    }

    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    let aggiornate = 0;

    for (const scheda of schede) {
      const testoDaVettorizzare = `Oggetto: ${scheda.oggetto}\nSoluzione: ${scheda.contenuto}`;
      
      const result = await embeddingModel.embedContent(testoDaVettorizzare);
      const vettore = result.embedding.values;

      // QUI È DOVE CATTURIAMO IL COLPEVOLE
      const { data: updatedData, error: updateError } = await supabase
        .from('knowledge_base')
        .update({ embedding: vettore })
        .eq('id', scheda.id)
        .select(); // Chiediamo a Supabase di confermarci la riga modificata

      if (updateError) {
        throw new Error(`Il DB ha bloccato il salvataggio: ${updateError.message}`);
      }

      if (!updatedData || updatedData.length === 0) {
        throw new Error(`Salvataggio ignorato: Supabase non ti permette di modificare la scheda con ID ${scheda.id}. Possibile blocco RLS o chiave errata.`);
      }
        
      aggiornate++;
    }

    return NextResponse.json({ 
      message: `Elaborazione completata con SUCCESSO! L'IA ha letto e salvato ${aggiornate} schede nel database.` 
    });

  } catch (error: any) {
    // Ora l'errore apparirà gigante nel browser
    return NextResponse.json({ ERRORE_FATALE: error.message }, { status: 500 });
  }
}