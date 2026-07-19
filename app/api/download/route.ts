import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fileName = searchParams.get('file');

    if (!fileName) {
      return new NextResponse('Nessun file specificato', { status: 400 });
    }

    // Chiave Admin per scavalcare ogni blocco di sicurezza RLS
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Invece di generare un link esterno, scarichiamo il file nel server in modo sicuro
    const { data, error } = await supabase.storage.from('manuali_pdf').download(fileName);

    if (error || !data) {
      throw new Error(error?.message || 'File non trovato nel bucket');
    }

    // Passiamo il file direttamente al browser dell'utente forzando il download
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error: any) {
    console.error("Errore Download:", error);
    return new NextResponse('Errore durante il download del file: ' + error.message, { status: 500 });
  }
}