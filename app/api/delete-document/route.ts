import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: "ID Documento mancante" }, { status: 400 });
    }

    // Usiamo la chiave Admin per scavalcare eventuali blocchi RLS durante la pulizia
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Recuperiamo il nome del file PDF dai chunk associati a questo documento prima di eliminarli
    const { data: chunks } = await supabase
      .from('documenti_chunk')
      .select('pdf_url')
      .eq('documento_id', id)
      .limit(1);
    
    const pdfUrl = chunks?.[0]?.pdf_url;

    // 2. Eliminiamo i chunk testuali dal database
    await supabase.from('documenti_chunk').delete().eq('documento_id', id);

    // 3. Eliminiamo l'anagrafica del documento padre
    const { error: dbError } = await supabase.from('documenti').delete().eq('id', id);
    if (dbError) throw new Error(`Errore eliminazione DB: ${dbError.message}`);

    // 4. Eliminiamo il file fisico dal Bucket (se esistente)
    if (pdfUrl && pdfUrl !== 'NESSUNO') {
      const { error: storageError } = await supabase.storage.from('manuali_pdf').remove([pdfUrl]);
      if (storageError) console.error("Errore pulizia Storage (ignorato):", storageError.message);
    }

    return NextResponse.json({ success: true, message: "Documento e PDF eliminati con successo." });

  } catch (error: any) {
    console.error("Errore API delete-document:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}