import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Inizializzazione con il NUOVO SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function GET() {
  try {
    // 1. Recuperiamo le schede espandendo la query a TUTTI i campi di catalogazione
    const { data: schede, error: fetchError } = await supabase
      .from('knowledge_base')
      .select('id, classe, tipologia, argomento, prodotto_1, prodotto_2, prodotto_3, oggetto, contenuto')
      .is('embedding', null);

    if (fetchError) throw new Error("Errore lettura DB: " + fetchError.message);

    if (!schede || schede.length === 0) {
      return NextResponse.json({ message: "Tutte le schede hanno già i vettori IA aggiornati a 360°!" });
    }

    let aggiornate = 0;

    // 2. Ciclo di generazione embedding con il NUOVO SDK
    for (const scheda of schede) {
      
      // =======================================================================
      // LA MAGIA: COSTRUZIONE DEL SUPER-VETTORE A 360 GRADI
      // =======================================================================
      const elementiTag = [];
      
      // Aggiungiamo i metadati solo se esistono realmente nel DB
      if (scheda.classe) elementiTag.push(`Classe: ${scheda.classe}`);
      if (scheda.tipologia) elementiTag.push(`Tipologia: ${scheda.tipologia}`);
      if (scheda.argomento) elementiTag.push(`Argomento: ${scheda.argomento}`);
      
      // Compattiamo tutti i prodotti Zucchetti in un'unica stringa pulita
      const prodotti = [scheda.prodotto_1, scheda.prodotto_2, scheda.prodotto_3].filter(Boolean).join(", ");
      if (prodotti) elementiTag.push(`Prodotti Coinvolti: ${prodotti}`);
      
      // Aggiungiamo il cuore del problema
      if (scheda.oggetto) elementiTag.push(`Problema/Oggetto: ${scheda.oggetto}`);
      if (scheda.contenuto) elementiTag.push(`Soluzione Tecnica: ${scheda.contenuto}`);

      // Uniamo tutto in una stringa iper-densa. Esempio di output:
      // "Classe: Bug | Tipologia: Fiscale | Prodotti Coinvolti: Infinity, HR | Problema: ... | Soluzione: ..."
      const testoDaVettorizzare = elementiTag.join(' | ');
      // =======================================================================

      // Chiamata API col nuovo SDK per tradurre il super-testo in numeri
      const result = await ai.models.embedContent({ 
        model: "gemini-embedding-001",
        contents: testoDaVettorizzare 
      });

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
      message: `Elaborazione completata! L'IA ha processato a 360° e salvato ${aggiornate} nuove schede nel database.` 
    });

  } catch (error: any) {
    console.error("ERRORE FATALE EMBEDDING:", error);
    return NextResponse.json({ ERRORE_FATALE: error.message }, { status: 500 });
  }
}