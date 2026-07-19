import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const titolo = formData.get('titolo') as string;
    const versione = formData.get('versione') as string;
    const prodotto = formData.get('prodotto') as string;
    const chunksString = formData.get('chunks') as string;

    if (!file || !chunksString) {
      throw new Error("File PDF o frammenti di testo mancanti.");
    }

    const chunks = JSON.parse(chunksString);

    // 1. CARICAMENTO DEL FILE FISICO SU SUPABASE STORAGE
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const uniqueFileName = `${Date.now()}_${safeName}`;
    
    const { error: storageError } = await supabase.storage
      .from('manuali_pdf')
      .upload(uniqueFileName, file, { contentType: 'application/pdf' });

    if (storageError) {
      throw new Error("Errore Storage: Impossibile salvare il file PDF (" + storageError.message + ")");
    }

    // 2. SALVATAGGIO DOCUMENTO PADRE (Ora include il link al PDF)
    const { data: docData, error: docError } = await supabase
      .from('documenti')
      .insert([{ 
         titolo, 
         versione, 
         prodotto, 
         pdf_url: uniqueFileName // <-- Salvato nel padre!
      }])
      .select('id')
      .single();

    if (docError || !docData) throw new Error("Errore DB (Documento): " + (docError?.message || 'Sconosciuto'));

    const documento_id = docData.id;
    let inseriti = 0;

    // 3. VETTORIZZAZIONE E SALVATAGGIO DEI CHUNK
    for (const chunk of chunks) {
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
          pagina: parseInt(chunk.pagina, 10) || 1,
          testo: chunk.testo,
          embedding: vettore
        }]);

        if (chunkError) throw new Error("Errore DB (Chunk): " + chunkError.message);
        inseriti++;
      }
    }

    return NextResponse.json({ success: true, message: `Manuale salvato! ${inseriti} sezioni elaborate e apprese dall'IA.` });
  } catch (error: any) {
    console.error("Errore upload completo:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}